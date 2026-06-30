import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export async function GET(req: Request) {
  const userEmail = req.headers.get('x-user-email');

  if (!userEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await dbConnect();
    const user = await User.findOne({ email: userEmail }).lean();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const scans = user.scans || [];
    const monthlyCarbon = user.monthlyCarbon || 0;
    const monthlyCarbonGoal = user.monthlyCarbonGoal || 40;
    const totalScanned = user.totalScanned || 0;

    const monthTotals: Record<number, { carbon: number; scanned: number }> = {};
    const now = new Date();
    const currentMonth = now.getMonth();

    for (let i = 0; i < 12; i++) {
      monthTotals[i] = { carbon: 0, scanned: 0 };
    }

    for (const scan of scans) {
      if (scan.date) {
        const d = new Date(scan.date);
        const month = d.getMonth();
        if (monthTotals[month]) {
          monthTotals[month].carbon += scan.carbonEstimate || 0;
          monthTotals[month].scanned += 1;
        }
      }
    }

    if (monthTotals[currentMonth]) {
      monthTotals[currentMonth].carbon = monthlyCarbon;
    }

    const monthlyData = MONTHS.map((month, i) => ({
      month,
      carbon: parseFloat(monthTotals[i].carbon.toFixed(2)),
      scanned: monthTotals[i].scanned,
      goal: monthlyCarbonGoal,
    }));

    const categoryTotals: Record<string, { carbon: number; count: number }> = {};
    for (const scan of scans) {
      const cat = scan.category || 'Unknown';
      if (!categoryTotals[cat]) {
        categoryTotals[cat] = { carbon: 0, count: 0 };
      }
      categoryTotals[cat].carbon += scan.carbonEstimate || 0;
      categoryTotals[cat].count += 1;
    }

    const totalCategoryCarbon = Object.values(categoryTotals).reduce((sum, c) => sum + c.carbon, 0);
    const categoryBreakdown = Object.entries(categoryTotals)
      .map(([category, data]) => ({
        category,
        carbon: parseFloat(data.carbon.toFixed(2)),
        percentage: totalCategoryCarbon > 0 ? Math.round((data.carbon / totalCategoryCarbon) * 100) : 0,
      }))
      .sort((a, b) => b.carbon - a.carbon);

    const weeklyProgress = buildWeeklyProgress(scans, currentMonth, monthlyCarbonGoal);

    const tips = generateTips(categoryBreakdown);

    const totalImpact = parseFloat(monthlyData.reduce((sum, m) => sum + m.carbon, 0).toFixed(2));
    const averagePerScan = totalScanned > 0 ? parseFloat((totalImpact / totalScanned).toFixed(2)) : 0;

    return NextResponse.json({
      monthlyData,
      categoryBreakdown,
      weeklyProgress,
      tips: tips,
      totalImpact,
      averagePerScan,
    });
  } catch (error) {
    console.error('Analytics API error:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}

function buildWeeklyProgress(
  scans: Array<{ date?: Date | string; carbonEstimate?: number }>,
  currentMonth: number,
  goal: number
) {
  const weeklyData: Record<string, { carbon: number; count: number }> = {};
  const now = new Date();
  const year = now.getFullYear();

  for (let w = 1; w <= 4; w++) {
    weeklyData[`Week ${w}`] = { carbon: 0, count: 0 };
  }

  for (const scan of scans) {
    if (!scan.date) continue;
    const d = new Date(scan.date);
    if (d.getMonth() !== currentMonth || d.getFullYear() !== year) continue;

    const day = d.getDate();
    let weekIndex = Math.min(Math.ceil(day / 7), 4);
    if (weekIndex < 1) weekIndex = 1;
    const weekLabel = `Week ${weekIndex}`;

    if (!weeklyData[weekLabel]) {
      weeklyData[weekLabel] = { carbon: 0, count: 0 };
    }
    weeklyData[weekLabel].carbon += scan.carbonEstimate || 0;
    weeklyData[weekLabel].count += 1;
  }

  const weeklyGoal = Math.round(goal / 4);
  return Object.entries(weeklyData).map(([week, data]) => ({
    week,
    carbon: parseFloat(data.carbon.toFixed(2)),
    target: weeklyGoal,
  }));
}

function generateTips(
  categoryBreakdown: Array<{ category: string; carbon: number; percentage: number }>
) {
  const tips: Array<{ title: string; description: string; impact: string; difficulty: string }> = [];

  const highCarbonCategory = categoryBreakdown.find((c) => c.percentage > 30);

  if (highCarbonCategory) {
    tips.push({
      title: `Reduce ${highCarbonCategory.category} Consumption`,
      description: `${highCarbonCategory.category} makes up ${highCarbonCategory.percentage}% of your footprint. Try plant-based alternatives 2-3 times per week.`,
      impact: `Could save ~${Math.round(highCarbonCategory.carbon * 0.3)}kg CO₂/month`,
      difficulty: 'Medium',
    });
  }

  tips.push(
    {
      title: 'Choose Local Produce',
      description: 'Buy fruits and vegetables from local farmers to reduce transport emissions.',
      impact: 'Could save 3kg CO₂/month',
      difficulty: 'Easy',
    },
    {
      title: 'Minimize Packaging',
      description: 'Choose products with less plastic packaging to reduce waste.',
      impact: 'Could save 2kg CO₂/month',
      difficulty: 'Easy',
    },
    {
      title: 'Seasonal Shopping',
      description: 'Buy seasonal fruits and vegetables — they have a lower carbon footprint.',
      impact: 'Could save 4kg CO₂/month',
      difficulty: 'Easy',
    }
  );

  return tips;
}
