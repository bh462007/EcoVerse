import { NextResponse } from 'next/server';
import axios from 'axios';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import mongoose from 'mongoose';
import { calculateCarbonFootprint } from '@/lib/carbon-calculator';
import {
  calculateScanPoints,
  calculateLevel,
  checkAchievements,
  calculateMonthlyBonus,
  confirmPendingPoints,
  getUserPointsSummary,
  calculateStreakUpdate,
} from '@/lib/rewards-system';
import { inferPackaging } from '@/lib/packaging-inference';

type OpenFoodFactsResponse = {
  product: {
    product_name?: string;
    brands?: string;
    categories_tags?: string[];
    ingredients_text?: string;
  };
  status: number;
  code: string;
};

export async function POST(req: Request) {
  const userEmail = req.headers.get('x-user-email');

  if (!userEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { barcode } = await req.json();

  if (!barcode) {
    return NextResponse.json({ error: 'Barcode missing' }, { status: 400 });
  }

  try {
    const productRes = await axios.get<OpenFoodFactsResponse>(
      `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`
    );

    const product = productRes.data.product;

    if (!product?.product_name) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const categories = (product.categories_tags || []).map((cat) =>
      cat.replace('en:', '')
    );
    const packaging = inferPackaging(categories);

    const carbonData = calculateCarbonFootprint(
      product.product_name,
      product.brands
    );
    const carbonEstimate = carbonData.carbonFootprint;

    try {
      await dbConnect();

      // The streak/points calculation depends on a snapshot of the user
      // document (lastScanDate, streakCount, streakProtectors), but two
      // concurrent scan requests could both read the same snapshot and both
      // decide to consume the same streak protector, or both compute the
      // same streak increment. To prevent that, the write is gated on
      // lastScanDate still matching what we read (compare-and-set): if
      // another request wrote first, the filter won't match, and we retry
      // the whole read-compute-write cycle against the fresh state.
      const MAX_RETRIES = 5;
      let initialUpdate = null;
      let streakUpdate = null;
      let pointsData = null;
      let scanTimestamp = new Date();
      let oldLevel = 1;
      let pointsEarned = 0;
      let isConfirmed = false;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const user = await User.findOne({ email: userEmail });

        if (!user) {
          console.error('❌ No user found with email:', userEmail);
          return NextResponse.json(
            { error: 'User not found' },
            { status: 404 }
          );
        }

        const isFirstScan = (user.totalScanned ?? 0) === 0;
        const totalScans = user.totalScanned ?? 0;
        const previousLastScanDate = user.lastScanDate;
        oldLevel = user.level || 1;

        streakUpdate = calculateStreakUpdate(
          user.lastScanDate,
          user.streakCount ?? 0,
          user.bestStreakCount ?? 0,
          user.streakProtectors ?? 0
        );
        const streakCount = streakUpdate.streakCount;

        pointsData = calculateScanPoints
          ? calculateScanPoints(
              carbonEstimate,
              isFirstScan,
              streakCount,
              totalScans
            )
          : { points: 0, reasons: [], isConfirmed: false };

        isConfirmed = pointsData.isConfirmed;
        pointsEarned = pointsData.points;
        scanTimestamp = new Date();

        // --- ATOMIC DATABASE UPDATE ---
        // We perform the atomic increment to update points and scans first.
        // We also push a new reward transaction record so it can be referenced later.
        // The lastScanDate match in the filter is the compare-and-set guard:
        // it only succeeds if the document is still in the state we read it
        // in, so a concurrent scan can't cause this one to double-consume a
        // streak protector or double-increment the streak.
        initialUpdate = await User.findOneAndUpdate(
          { email: userEmail, lastScanDate: previousLastScanDate },
          {
            $inc: {
              monthlyCarbon: carbonEstimate,
              totalScanned: 1,
              rewardPoints: pointsEarned,
              totalPointsEarned: pointsEarned,
              confirmedPoints: isConfirmed ? pointsEarned : 0,
              unconfirmedPoints: isConfirmed ? 0 : pointsEarned,
              streakProtectors: -streakUpdate.streakProtectorsUsed,
            },
            $set: {
              streakCount: streakUpdate.streakCount,
              bestStreakCount: streakUpdate.bestStreakCount,
              lastScanDate: scanTimestamp,
            },
            $push: {
              scans: {
                productName: product.product_name,
                carbonEstimate: carbonEstimate,
                category: carbonData.category,
                confidence: carbonData.confidence,
                barcode: barcode,
                date: scanTimestamp,
              },
              rewardTransactions: {
                _id: new mongoose.Types.ObjectId(),
                type: 'earned',
                points: pointsEarned,
                pointsType: isConfirmed ? 'confirmed' : 'unconfirmed',
                reason: 'scan',
                description: `Scanned ${product.product_name}`,
                barcode: barcode,
                date: scanTimestamp,
              },
            },
          },
          {
            new: true, // IMPORTANT: Returns the ground-truth updated document from the DB
            runValidators: true,
          }
        );

        if (initialUpdate) {
          break; // Compare-and-set succeeded — no concurrent write raced us.
        }
        // Filter didn't match: another request updated lastScanDate between
        // our read and write. Loop and retry against the fresh state.
      }

      if (!initialUpdate || !streakUpdate || !pointsData) {
        return NextResponse.json(
          {
            error:
              'Scan could not be recorded due to concurrent updates. Please try again.',
          },
          { status: 409 }
        );
      }

      // --- POST-UPDATE DERIVED CALCULATIONS ---
      // Compute level, achievements, and bonuses based on the actual post-increment state.
      const levelData = calculateLevel
        ? calculateLevel(initialUpdate.totalPointsEarned || 0)
        : { level: oldLevel };
      const earnedAchievements = checkAchievements
        ? checkAchievements(initialUpdate)
        : [];
      const monthlyBonus = calculateMonthlyBonus
        ? calculateMonthlyBonus(initialUpdate)
        : 0;

      // Persist level and achievements independently, so a partial overlap
      // on achievements (some IDs already present, some genuinely new)
      // can't cause the level update — or the non-overlapping achievements
      // — to be silently dropped.
      let updatedUser = initialUpdate;
      if (levelData.level > oldLevel) {
        // $max only applies the update if the new value is actually
        // greater, which is itself a safe guard against a concurrent
        // request regressing the level.
        await User.updateOne(
          { email: userEmail },
          {
            $max: { level: levelData.level },
            $set: { updatedAt: new Date() },
          }
        );
      }

      if (earnedAchievements.length > 0) {
        const earnedAt = new Date();
        // Map from Achievement (the static definition, with a `condition`
        // function and `icon`) to IAchievement (the persisted earned-record
        // shape, with `earnedAt` instead) — pushing the raw definition would
        // try to store a function and never set earnedAt.
        const achievementRecords = earnedAchievements.map((achievement) => ({
          id: achievement.id,
          name: achievement.name,
          description: achievement.description,
          points: achievement.points,
          earnedAt,
        }));

        // Insert each achievement individually, guarded by its own ID, so a
        // concurrent request that already inserted one of these IDs only
        // blocks that specific achievement — not the others in this batch.
        await User.bulkWrite(
          achievementRecords.map((record) => ({
            updateOne: {
              filter: {
                email: userEmail,
                'achievements.id': { $ne: record.id },
              },
              update: {
                $push: { achievements: record },
              },
            },
          }))
        );
      }

      if (levelData.level > oldLevel || earnedAchievements.length > 0) {
        updatedUser =
          (await User.findOne({ email: userEmail })) || initialUpdate;
      }

      // We use the ground-truth data from 'updatedUser' for the final response.
      // This ensures the UI is always in sync with the actual database state.
      const pointsSummary = getUserPointsSummary(updatedUser);

      return NextResponse.json({
        productName: product.product_name,
        brand: product.brands || 'Unknown',
        carbonEstimate: carbonEstimate.toFixed(2),
        category: carbonData.category,
        confidence: carbonData.confidence,
        calculation: carbonData.calculation,
        ingredients: product.ingredients_text || 'Not available',
        packaging,
        rewards: {
          pointsEarned,
          pointsType: isConfirmed ? 'confirmed' : 'unconfirmed',
          reasons: pointsData.reasons,
          pointsSummary,
          level: updatedUser.level,
          leveledUp: updatedUser.level > oldLevel,
          newAchievements: earnedAchievements,
          streakCount: updatedUser.streakCount,
          bestStreakCount: updatedUser.bestStreakCount,
          streakProtectorUsed: streakUpdate.streakProtectorsUsed > 0,
          streakBroken: streakUpdate.streakBroken,
          monthlyBonus,
          sustainabilityTier:
            updatedUser.monthlyCarbon < 10 && updatedUser.totalScanned >= 15
              ? 'Platinum'
              : updatedUser.monthlyCarbon < 20 && updatedUser.totalScanned >= 10
                ? 'Gold'
                : updatedUser.monthlyCarbon < 30 &&
                    updatedUser.totalScanned >= 5
                  ? 'Silver'
                  : updatedUser.monthlyCarbon < 40
                    ? 'Bronze'
                    : 'Beginner',
          pendingConfirmationInfo: (() => {
            const confirmationData = confirmPendingPoints
              ? confirmPendingPoints(updatedUser)
              : { confirmedPoints: 0, confirmedTransactions: [] };

            return confirmationData.confirmedPoints > 0
              ? {
                  pointsConfirmed: confirmationData.confirmedPoints,
                  transactionsConfirmed:
                    confirmationData.confirmedTransactions.length,
                }
              : null;
          })(),
        },
      });
    } catch (dbError) {
      console.error('🔥 Failed to update user stats:', dbError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
  } catch (error) {
    console.error('🔥 Error in scan API:', error);
    return NextResponse.json(
      { error: 'Failed to scan product' },
      { status: 500 }
    );
  }
}
