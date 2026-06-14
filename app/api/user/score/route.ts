import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { calculateLevel, getSustainabilityTier } from '@/lib/rewards-system';

export async function GET(req: Request) {
  // FIX: Look up identity from headers OR fall back to query strings (?email=...) for page contract compatibility
  const { searchParams } = new URL(req.url);
  const email = req.headers.get('x-user-email') ?? searchParams.get('email');

  if (!email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await dbConnect();
    const user = (await User.findOne({ email }).lean()) as any;

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Calculate current level data
    const levelData = calculateLevel(user.totalPointsEarned || 0);
    const tierData = getSustainabilityTier(
      user.monthlyCarbon || 0,
      user.totalScanned || 0
    );

    // FIX: Extracted and normalized monthlyCarbon value to prevent ternary misclassification
    const monthlyCarbon = user.monthlyCarbon || 0;
    const sustainabilityLevel =
      monthlyCarbon < 20
        ? 'Excellent'
        : monthlyCarbon < 35
          ? 'Good'
          : monthlyCarbon < 50
            ? 'Average'
            : 'Needs Improvement';

    return NextResponse.json({
      monthlyCarbon,
      totalScanned: user.totalScanned || 0,
      streakCount: user.streakCount || 0,
      bestStreakCount: user.bestStreakCount || 0,
      scans: user.scans || [],
      sustainabilityLevel,
      // Enhanced rewards data
      rewards: {
        points: user.rewardPoints || 0,
        totalPointsEarned: user.totalPointsEarned || 0,
        level: user.level || 1,
        nextLevelPoints: levelData.nextLevelPoints,
        progressToNext: levelData.progressToNext,
        recentTransactions: (user.rewardTransactions || []).slice(-10), // Last 10 transactions
        achievements: user.achievements || [],
        achievementCount: (user.achievements || []).length,
        // Sustainability tier
        tier: tierData.tier,
        tierColor: tierData.color,
        tierDescription: tierData.description,
        // Special features
        activeBadges: user.activeBadges || [],
        purchasedItems: user.purchasedItems || [],
        specialFeatures: {
          streakProtectors: user.streakProtectors || 0,
          doublePointsDays: user.doublePointsDays || 0,
          hasAdvancedAnalytics: user.hasAdvancedAnalytics || false,
          customAvatar: user.customAvatar || null,
        },
        // Monthly bonus tracking
        monthlyBonusesEarned: user.monthlyBonusesEarned || 0,
        lastMonthlyBonusCheck: user.lastMonthlyBonusCheck,
      },
    });
  } catch (error) {
    /* eslint-disable-next-line no-console */
    console.error('Error fetching user data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user data' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  // FIX: Read email identity gracefully using headers or fallback search parameter query strings
  const { searchParams } = new URL(req.url);
  const email = req.headers.get('x-user-email') ?? searchParams.get('email');

  if (!email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // FIX: Moved request body parsing inside the try-catch block to gracefully capture malformed JSON payload variations
    await req.json();

    await dbConnect();
    const user = await User.findOne({ email });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      newScore: user.monthlyCarbon,
      totalScanned: user.totalScanned,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update score' },
      { status: 500 }
    );
  }
}
