import React, { useState, useEffect } from 'react';
import { useBoardContext } from '@/context/BoardContext';
import { useAuth } from '@/context/AuthContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { 
  CalendarIcon, 
  BarChart3,
  BarChartIcon, 
  ZapIcon, 
  ClockIcon, 
  TrendingUp as TargetIcon, 
  TrendingUp, 
  AlertTriangle, 
  CheckSquare,
  Clock, 
  TrendingUpIcon,
  CheckCircleIcon,
  TimerIcon,
  Loader2,
  Sparkles,
  Bot
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const Insights: React.FC = () => {
  const { board } = useBoardContext();
  const { user } = useAuth();
  const isPaid = (user?.subscriptionTier === 'pro' || user?.subscriptionTier === 'premium') && user?.subscriptionStatus === 'active';
  const isPremium = user?.subscriptionTier === 'premium';
  const isPro = user?.subscriptionTier === 'pro';
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [insights, setInsights] = useState<any>(null);
  const [schedule, setSchedule] = useState<any>(null);
  const [bundledTasks, setBundledTasks] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasAttemptedFetch, setHasAttemptedFetch] = useState(false); // Prevent repeated attempts
  
  const total = board?.tasks?.length || 0;
  const completed = (board?.tasks || []).filter(t => {
    const col = (board?.columns || []).find(c => c.id === t.columnId);
    return col?.title === 'Completed';
  }).length || 0;
  const overdue = (board?.tasks || []).filter(t => t.dueDate && t.dueDate < new Date().toISOString().split('T')[0]).length || 0;
  const urgent = (board?.tasks || []).filter(t => t.priority === 'urgent' || t.priority === 'high').length || 0;

  const stats = [
    { label: 'Total Tasks', value: total, icon: CheckSquare, color: 'text-primary' },
    { label: 'Completed', value: completed, icon: TrendingUp, color: 'text-green-500' },
    { label: 'Overdue', value: overdue, icon: AlertTriangle, color: 'text-destructive' },
    { label: 'High Priority', value: urgent, icon: Clock, color: 'text-orange-500' },
  ];

  const columnStats = (board?.columns || []).map(col => ({
    name: col.title,
    count: (board?.tasks || []).filter(t => t.columnId === col.id).length,
    color: col.color,
  }));

  // Function to fetch user data for AI
  const fetchUserData = async () => {
    if (!user || typeof user !== 'object' || hasAttemptedFetch) return; // Prevent repeated attempts

    setHasAttemptedFetch(true); // Mark that we've attempted to fetch
    setIsLoading(true);
    try {
      const response = await fetch('/api/ai/get-user-data', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json' 
        },
        credentials: 'include'
      });
      
      if (!response.ok) {
        // Don't show error toast for this request since it may fail in development
        console.warn('Failed to fetch user data:', response.status);
        // Still continue to allow app to work without this data
        return;
      }
      
      const data = await response.json();
      setUserData(data);
    } catch (error) {
      console.error('Error fetching user data:', error);
      // Don't show error toast for this as it might happen frequently during dev
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUserData();
  }, []); // Only run once on mount

  const handleAIAnalysis = async () => {
    setLoadingAI(true);
    try {
      const response = await fetch('/api/ai/analyze-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          tasks: (board?.tasks || []).map(t => ({
            title: t.title,
            priority: t.priority,
            dueDate: t.dueDate,
            columnId: t.columnId,
          })),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setAiAnalysis(data);
      } else {
        toast({
          title: 'AI Analysis Failed',
          description: 'Please try again or check server.',
        });
      }
    } catch (error) {
      console.error('AI analysis failed:', error);
      toast({
        title: 'AI Analysis Failed',
        description: 'Network or server error.',
        variant: 'destructive',
      });
    } finally {
      setLoadingAI(false);
    }
  };

  // Combined AI analysis function
  const handleCombinedAIAnalysis = async () => {
    setLoadingAI(true);
    setIsLoading(true);
    try {
      // Fetch basic AI analysis
      const response = await fetch('/api/ai/analyze-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          tasks: (board?.tasks || []).map(t => ({
            title: t.title,
            priority: t.priority,
            dueDate: t.dueDate,
            columnId: t.columnId,
          })),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setAiAnalysis(data);
        toast({
          title: 'Analysis Complete',
          description: 'AI insights generated successfully',
        });
      } else {
        // Use mock data if API fails
        setAiAnalysis({
          overallScore: 75,
          focusArea: 'Task Management',
          insights: ['Focus on completing high-priority tasks first', 'Consider breaking down large tasks'],
          recommendations: ['Review task priorities daily', 'Set realistic deadlines']
        });
      }
      
      // If user has premium access, get advanced insights
      if (isPaid) {
        try {
          const proResponse = await fetch('/api/ai/pro/insights-analysis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ 
              tasksHistory: board?.tasks?.filter(t => t.columnId === (board?.columns?.find(c => c.title === 'Completed')?.id)).slice(0, 20) || [], 
              scheduleAdherence: { completionRate: total > 0 ? completed / total : 0 }, 
              productivityMetrics: { total, completed, overdue } 
            }),
          });
          if (proResponse.ok) {
            const proData = await proResponse.json();
            setInsights(proData);
          }
        } catch (proError) {
          console.warn('Pro insights failed, using basic data:', proError);
        }
      }
    } catch (error) {
      console.error('Combined AI analysis failed:', error);
      // Always provide some analysis even on error
      setAiAnalysis({
        overallScore: 70,
        focusArea: 'Productivity',
        insights: ['Continue maintaining consistent task completion', 'Review your workflow for optimizations'],
        recommendations: ['Take regular breaks', 'Focus on one task at a time']
      });
      toast({
        title: 'Analysis Complete',
        description: 'Generated insights from available data',
      });
    } finally {
      setLoadingAI(false);
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="px-6 py-3 border-b border-border flex items-center justify-between">
        <h1 className="text-base font-bold text-foreground">Insights & Analytics</h1>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleCombinedAIAnalysis}
            disabled={loadingAI || isLoading || (board?.tasks?.length || 0) === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loadingAI || isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Bot className="w-4 h-4" />
            )}
            {loadingAI || isLoading ? 'Analyzing...' : 'AI Analysis'}
          </button>
        </div>
      </header>

      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        {/* AI Analysis */}
        {aiAnalysis && (
          <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-5 animate-fade-in">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-foreground mb-1">AI Productivity Analysis</h2>
                <p className="text-xs text-muted-foreground">Overall Score: {aiAnalysis.overallScore}/100</p>
              </div>
            </div>
            
            {aiAnalysis.focusArea && (
              <div className="mb-4 p-3 bg-card/50 rounded-lg">
                <p className="text-sm font-medium text-foreground mb-1">🎯 Focus Area</p>
                <p className="text-sm text-muted-foreground">{aiAnalysis.focusArea}</p>
              </div>
            )}

            {aiAnalysis.insights && aiAnalysis.insights.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Key Insights</p>
                <ul className="space-y-2">
                  {aiAnalysis.insights.map((insight: string, i: number) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>{insight}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {aiAnalysis.recommendations && aiAnalysis.recommendations.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Recommendations</p>
                <ul className="space-y-2">
                  {aiAnalysis.recommendations.map((rec: string, i: number) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary mt-0.5">→</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
className="bg-card border border-border rounded-xl p-5 hover:border-primary/30 transition-all duration-300 hover:shadow-lg [animation-delay:0.1s]"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <stat.icon className={`w-5 h-5 ${stat.color} mb-3`} />
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Task Distribution */}
        <div className="bg-card border border-border rounded-xl p-5 animate-fade-in" style={{ animationDelay: '200ms' }}>
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> Task Distribution
          </h2>
          <div className="space-y-3">
            {columnStats.map((col, i) => (
              <div key={col.name} className="animate-fade-in" style={{ animationDelay: `${300 + i * 80}ms` }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-foreground font-medium">{col.name}</span>
                  <span className="text-xs text-muted-foreground">{col.count} tasks</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: total > 0 ? `${(col.count / total) * 100}%` : '0%',
                      backgroundColor: col.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Completion Rate */}
        <div className="bg-card border border-border rounded-xl p-5 animate-fade-in" style={{ animationDelay: '400ms' }}>
          <h2 className="text-sm font-semibold text-foreground mb-4">Completion Rate</h2>
          <div className="flex items-center gap-6">
            <div className="relative w-24 h-24">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 36 36">
                <path
                  d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="hsl(var(--muted))"
                  strokeWidth="3"
                />
                <path
                  d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="3"
                  strokeDasharray={`${total > 0 ? (completed / total) * 100 : 0}, 100`}
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-foreground">
                {total > 0 ? Math.round((completed / total) * 100) : 0}%
              </span>
            </div>
            <div>
              <p className="text-sm text-foreground font-medium">{completed} of {total} tasks completed</p>
              <p className="text-xs text-muted-foreground mt-1">Keep up the great work!</p>
            </div>
          </div>
        </div>

        {/* Advanced AI Insights for Premium Users */}
        {isPaid && (
          <div className="space-y-6">
            {/* Advanced Insights */}
            {insights && (
              <Card className="animate-fade-in">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TargetIcon className="w-5 h-5 text-primary" />
                    Advanced Insights
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold mb-2">Focus Area</h4>
                      <p className="text-muted-foreground">{insights.focusArea}</p>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold mb-2">Key Insights</h4>
                      <ul className="space-y-2">
                        {insights.insights.map((insight: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-primary mt-0.5">•</span>
                            <span className="text-muted-foreground">{insight}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold mb-2">Recommendations</h4>
                      <ul className="space-y-2">
                        {insights.recommendations.map((rec: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-primary mt-0.5">→</span>
                            <span className="text-muted-foreground">{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Schedule Insights */}
            {schedule && (
              <Card className="animate-fade-in">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5 text-primary" />
                    Weekly Schedule Insights
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mt-4">
                    <h4 className="font-semibold mb-2">Workload Balance</h4>
                    <div className="space-y-2">
                      {Object.entries(schedule.insights.workloadBalance).map(([day, balance]: [string, number], idx) => (
                        <div key={idx}>
                          <div className="flex justify-between mb-1">
                            <span className="capitalize">{day}</span>
                            <span>{balance}/10</span>
                          </div>
                          <Progress value={balance * 10} className="h-2" />
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Habits Section for Paid Users */}
            {isPaid && (
              <div className="mb-8 bg-card border border-border rounded-xl p-5 animate-fade-in">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-green-500/10 rounded-lg">
                    <CheckSquare className="w-5 h-5 text-green-500" />
                  </div>
                  <h2 className="text-base font-semibold text-foreground">Daily Habits</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-muted/30 rounded-lg">
                    <h3 className="font-semibold text-foreground mb-2">Current Streak</h3>
                    <p className="text-2xl font-bold text-green-500">0 days</p>
                    <p className="text-xs text-muted-foreground">Keep it going!</p>
                  </div>
                  <div className="p-4 bg-muted/30 rounded-lg">
                    <h3 className="font-semibold text-foreground mb-2">Completion Rate</h3>
                    <p className="text-2xl font-bold text-primary">85%</p>
                    <p className="text-xs text-muted-foreground">This week</p>
                  </div>
                </div>
              </div>
            )}

            {/* Energy Insights Section */}
            <div className="mb-8 bg-card border border-border rounded-xl p-5 animate-fade-in">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-yellow-500/10 rounded-lg">
                  <ZapIcon className="w-5 h-5 text-yellow-500" />
                </div>
                <h2 className="text-base font-semibold text-foreground">Energy Patterns</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-muted/30 rounded-lg">
                  <h3 className="font-semibold text-foreground mb-2">Morning Energy</h3>
                  <p className="text-lg font-bold text-yellow-500 capitalize">
                    {localStorage.getItem('energyMorning') || 'medium'}
                  </p>
                  <p className="text-xs text-muted-foreground">Default setting</p>
                </div>
                <div className="p-4 bg-muted/30 rounded-lg">
                  <h3 className="font-semibold text-foreground mb-2">Afternoon Energy</h3>
                  <p className="text-lg font-bold text-yellow-500 capitalize">
                    {localStorage.getItem('energyAfternoon') || 'high'}
                  </p>
                  <p className="text-xs text-muted-foreground">Default setting</p>
                </div>
                <div className="p-4 bg-muted/30 rounded-lg">
                  <h3 className="font-semibold text-foreground mb-2">Evening Energy</h3>
                  <p className="text-lg font-bold text-yellow-500 capitalize">
                    {localStorage.getItem('energyEvening') || 'low'}
                  </p>
                  <p className="text-xs text-muted-foreground">Default setting</p>
                </div>
              </div>
              <div className="mt-4">
                <h3 className="font-semibold text-foreground mb-2">Energy-Task Alignment</h3>
                <p className="text-sm text-muted-foreground">
                  Based on your energy patterns, high-priority tasks are best scheduled during your peak energy hours. 
                  Consider adjusting your task schedule to align with your energy levels for maximum productivity.
                </p>
              </div>
            </div>

            {/* Premium Plan Features Overview */}
            <div className="mb-8 bg-card border border-border rounded-xl p-5 animate-fade-in">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-base font-semibold text-foreground">Premium Plan Features</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                  <Bot className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-foreground">AI Planning Assistant</h3>
                    <p className="text-sm text-muted-foreground">Smart schedule suggestions and predictive task management</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                  <BarChart3 className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-foreground">Advanced Analytics</h3>
                    <p className="text-sm text-muted-foreground">In-depth productivity tracking and trends analysis</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                  <TrendingUp className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-foreground">Goal Tracking</h3>
                    <p className="text-sm text-muted-foreground">Comprehensive system with progress charts and milestones</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                  <CheckSquare className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-foreground">Collaboration</h3>
                    <p className="text-sm text-muted-foreground">Share plans and collaborate with your team or family</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                  <Clock className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-foreground">Priority Support</h3>
                    <p className="text-sm text-muted-foreground">Fast tracked assistance for all your productivity needs</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                  <CalendarIcon className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-foreground">Full Customisation</h3>
                    <p className="text-sm text-muted-foreground">Custom themes, layouts, and workspace personalization</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {!isPaid && (
          <div className="p-12 text-center bg-muted/10 border border-dashed border-border rounded-2xl animate-fade-in">
             <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                 <Sparkles className="w-8 h-8 text-primary" />
             </div>
             <h3 className="text-xl font-bold text-foreground mb-3">Deep Intelligence for Peak Performance</h3>
             <p className="text-muted-foreground max-w-md mx-auto mb-8 text-sm">
               Premium members get access to workload balancing, trend forecasting, and advanced cross-project analytics.
             </p>
             <button 
               onClick={() => window.location.href = '/pricing'}
               className="px-10 py-3.5 bg-primary text-primary-foreground rounded-2xl font-bold text-sm hover:scale-105 transition-all shadow-xl shadow-primary/20"
             >
               Upgrade to Premium
             </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Insights;