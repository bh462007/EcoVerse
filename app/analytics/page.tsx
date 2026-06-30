'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/dashboard-layout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  BarChart3,
  TrendingDown,
  Leaf,
  Target,
  Calendar,
  Award,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { getCategoryColor } from '@/lib/carbon-calculator';

interface AnalyticsData {
  monthlyData: Array<{ month: string; carbon: number; scanned: number; goal: number }>;
  categoryBreakdown: Array<{ category: string; carbon: number; percentage: number }>;
  weeklyProgress: Array<{ week: string; carbon: number; target: number }>;
  tips: Array<{ title: string; description: string; impact: string; difficulty: string }>;
  totalImpact: number;
  averagePerScan: number;
}

const CATEGORY_COLORS = [
  'bg-red-500',
  'bg-orange-500',
  'bg-green-500',
  'bg-yellow-500',
  'bg-blue-500',
  'bg-purple-500',
  'bg-amber-500',
  'bg-gray-500',
];

function getCategoryColorClass(category: string, index: number): string {
  const fromCalc = getCategoryColor(category);
  if (fromCalc !== 'bg-gray-400') return fromCalc;
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchAnalytics() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/analytics');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to fetch analytics');
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
          <p className="text-teal-700">Loading your analytics...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <AlertCircle className="h-8 w-8 text-red-500" />
          <p className="text-red-700">{error}</p>
          <button
            onClick={fetchAnalytics}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      </DashboardLayout>
    );
  }

  if (!data) return null;

  const { monthlyData, categoryBreakdown, weeklyProgress, tips } = data;

  const hasScans = monthlyData.some((m) => m.scanned > 0);

  if (!hasScans) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
          <BarChart3 className="h-12 w-12 text-teal-400" />
          <h2 className="text-2xl font-bold text-teal-900">No Data Yet</h2>
          <p className="text-gray-600 max-w-md">
            Start scanning products to see your carbon footprint analytics and sustainability insights.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  const currentMonth = monthlyData[monthlyData.length - 1];
  const previousMonth = monthlyData[monthlyData.length - 2] || monthlyData[monthlyData.length - 1];
  const carbonChange = currentMonth.carbon - previousMonth.carbon;
  const scanChange = currentMonth.scanned - previousMonth.scanned;

  const totalCarbonSaved = monthlyData.reduce((acc, month) => {
    return acc + Math.max(0, month.goal - month.carbon);
  }, 0);

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Easy':
        return 'bg-green-900/20 text-green-800 border-green-700';
      case 'Medium':
        return 'bg-yellow-900/20 text-yellow-800 border-yellow-700';
      case 'Hard':
        return 'bg-red-900/20 text-red-800 border-red-700';
      default:
        return 'bg-gray-900/20 text-gray-800 border-gray-700';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-teal-900">Carbon Analytics</h1>
          <p className="text-gray-800 mt-2">
            Detailed insights into your sustainability journey and carbon
            footprint trends.
          </p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="bg-teal-100 border-none shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-teal-700">
                Total CO₂ Saved
              </CardTitle>
              <Leaf className="h-4 w-4 text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-teal-800">
                {totalCarbonSaved.toFixed(1)} kg
              </div>
              <p className="text-xs text-teal-700">vs monthly goals</p>
            </CardContent>
          </Card>

          <Card className="bg-teal-100 border-none shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-teal-700">
                Monthly Change
              </CardTitle>
              <TrendingDown className="h-4 w-4 text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-teal-800">
                {carbonChange > 0 ? '+' : ''}
                {carbonChange.toFixed(1)} kg
              </div>
              <p className="text-xs text-teal-700">from last month</p>
            </CardContent>
          </Card>

          <Card className="bg-teal-100 border-none shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-teal-700">
                Products Scanned
              </CardTitle>
              <BarChart3 className="h-4 w-4 text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-teal-800">
                {currentMonth.scanned}
              </div>
              <p className="text-xs text-teal-700">
                +{scanChange} from last month
              </p>
            </CardContent>
          </Card>

          <Card className="bg-teal-100 border-none shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-teal-700">
                Goal Achievement
              </CardTitle>
              <Target className="h-4 w-4 text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-teal-800">
                {currentMonth.carbon < currentMonth.goal ? '✅' : '❌'}
              </div>
              <p className="text-xs text-teal-700">
                {currentMonth.carbon < currentMonth.goal
                  ? 'Goal met!'
                  : 'Above goal'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Monthly Trends */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-teal-100 border-none shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-teal-700">
                <TrendingDown className="h-5 w-5" />
                Carbon Footprint Trend
              </CardTitle>
              <CardDescription className="text-teal-500">
                Monthly CO₂ emissions over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {monthlyData.map((data, index) => (
                  <div key={data.month} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-teal-500">
                        {data.month}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-teal-500 w-16 text-right">
                          {data.carbon}kg
                        </span>
                        <span className="text-xs text-teal-500">
                          (Goal: {data.goal}kg)
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-400 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${data.carbon <= data.goal ? 'bg-green-500' : 'bg-red-500'}`}
                        style={{
                          width: `${Math.min((data.carbon / 60) * 100, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 bg-teal-900/20 rounded-lg border border-teal-800">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-green" />
                  <span className="text-sm font-medium text-green">
                    {carbonChange < 0 ? 'Decreased' : 'Increased'} by{' '}
                    {Math.abs(carbonChange).toFixed(1)}kg this month
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-teal-100 border-none shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-teal-700">
                <Calendar className="h-5 w-5" />
                Weekly Progress
              </CardTitle>
              <CardDescription className="text-teal-700">
                This month&apos;s weekly breakdown
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {weeklyProgress.map((week) => (
                  <div key={week.week} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-teal-500">
                        {week.week}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-teal-500">
                          {week.carbon}kg / {week.target}kg
                        </span>
                        {week.carbon <= week.target && (
                          <Badge className="bg-green-400/50 text-green-600 border-green-500">
                            ✓
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Progress
                      value={(week.carbon / week.target) * 100}
                      className="h-2"
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Category Breakdown */}
        <Card className="bg-teal-100 border-none shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-teal-700">
              <BarChart3 className="h-5 w-5" />
              Carbon Footprint by Category
            </CardTitle>
            <CardDescription className="text-teal-500">
              Breakdown of your CO₂ emissions by product category this month
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {categoryBreakdown.map((category, index) => (
                <div key={category.category} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-teal-900">
                      {category.category}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-teal-500">
                        {category.carbon}kg
                      </span>
                      <span className="text-xs text-teal-500">
                        ({category.percentage}%)
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-teal-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${getCategoryColorClass(category.category, index)}`}
                      style={{ width: `${category.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Sustainability Tips */}
        <Card className="bg-teal-100 border-none shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-teal-700">
              <Award className="h-5 w-5" />
              Personalized Sustainability Tips
            </CardTitle>
            <CardDescription className="text-teal-600">
              Based on your shopping patterns, here are ways to reduce your
              carbon footprint
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tips.map((tip, index) => (
                <div
                  key={index}
                  className="p-4 rounded-lg bg-teal-200/50 border border-teal-600"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{tip.icon}</span>
                    <div className="flex-1">
                      <h4 className="font-medium text-teal-700 mb-1">
                        {tip.title}
                      </h4>
                      <p className="text-sm text-teal-700 mb-2">
                        {tip.description}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-green-700 font-medium">
                          {tip.impact}
                        </span>
                        <Badge className={getDifficultyColor(tip.difficulty)}>
                          {tip.difficulty}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Environmental Impact */}
        <Card className="bg-teal-100 border-none shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-teal-900">
              <Leaf className="h-5 w-5" />
              Environmental Impact Comparison
            </CardTitle>
            <CardDescription className="text-teal-700">
              See how your carbon footprint compares to various activities
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 rounded-lg bg-teal-200/50 border border-teal-700">
                <div className="text-2xl mb-2">🚗</div>
                <div className="text-lg font-bold text-teal-900">
                  {(currentMonth.carbon * 2.3).toFixed(0)} km
                </div>
                <div className="text-sm text-teal-700">
                  Equivalent car driving
                </div>
              </div>
              <div className="text-center p-4 rounded-lg bg-teal-200/50 border border-teal-700">
                <div className="text-2xl mb-2">🌳</div>
                <div className="text-lg font-bold text-teal-900">
                  {Math.ceil(currentMonth.carbon / 22)} trees
                </div>
                <div className="text-sm text-teal-700">
                  Needed to offset CO₂
                </div>
              </div>
              <div className="text-center p-4 rounded-lg bg-teal-200/50 border border-teal-700">
                <div className="text-2xl mb-2">💡</div>
                <div className="text-lg font-bold text-teal-900">
                  {(currentMonth.carbon * 1.2).toFixed(0)} hours
                </div>
                <div className="text-sm text-teal-700">LED bulb equivalent</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
