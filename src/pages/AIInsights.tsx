import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  CalendarIcon, 
  BarChartIcon, 
  ZapIcon, 
  ClockIcon, 
  TargetIcon, 
  TrendingUpIcon,
  CheckCircleIcon,
  TimerIcon,
  Plus,
  Trash2
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';

const AIInsights = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const hasProAccess = true; // user?.subscriptionTier === 'pro' && user?.subscriptionStatus === 'active';
  const [isLoading, setIsLoading] = useState(false);
  const [insights, setInsights] = useState<any>(null);
  const [schedule, setSchedule] = useState<any>(null);
  const [bundledTasks, setBundledTasks] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  
  // Function to fetch user data for AI
  const fetchUserData = async () => {
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
        throw new Error('Failed to fetch user data');
      }
      
      const data = await response.json();
      setUserData(data);
    } catch (error) {
      console.error('Error fetching user data:', error);
      toast({
        title: 'Failed to load data',
        description: 'Could not fetch your latest tasks and boards.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Function to create a task via AI
  const createTaskViaAI = async (title: string, description: string, priority: string, dueDate: string) => {
    setIsLoading(true);
    try {
      // Get the first board and column as defaults
      const defaultBoardId = userData?.boards[0]?.id || 1;
      const defaultColumnId = userData?.tasks[0]?.columnId || 1;
      
      const response = await fetch('/api/ai/create-task', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json' 
        },
        credentials: 'include',
        body: JSON.stringify({
          title,
          description,
          priority,
          dueDate,
          boardId: defaultBoardId,
          columnId: defaultColumnId
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to create task');
      }
      
      await response.json();
      toast({
        title: 'Task created',
        description: 'Your AI task was added successfully.',
      });
      
      // Refresh user data
      await fetchUserData();
    } catch (error) {
      console.error('Error creating task:', error);
      toast({
        title: 'Task creation failed',
        description: 'Please check your input and try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Function to delete a task via AI
  const deleteTaskViaAI = async (taskId: number) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/ai/delete-task', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json' 
        },
        credentials: 'include',
        body: JSON.stringify({ taskId })
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete task');
      }
      
      await response.json();
      toast({
        title: 'Task deleted',
        description: 'The selected task was removed.',
      });
      
      // Refresh user data
      await fetchUserData();
    } catch (error) {
      console.error('Error deleting task:', error);
      toast({
        title: 'Task deletion failed',
        description: 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const mockInsights = null;
  const mockSchedule = null;
  const mockBundledTasks = null;

  useEffect(() => {
    fetchUserData();
  }, []);

  const handleGenerateInsights = async () => {
    if (!hasProAccess) {
      toast({
        title: 'Pro required',
        description: 'Upgrade to Pro to generate AI insights.',
      });
      return;
    }
    if (!userData?.tasks?.length) {
      toast({
        title: 'No task data',
        description: 'Create a few tasks first, then generate insights.',
        variant: 'destructive',
      });
      return;
    }

    const tasksHistory = userData.tasks.slice(0, 50).map((task: any) => ({
      id: task.id,
      title: task.title,
      completed: String(task.columnName || '').toLowerCase().includes('done'),
      priority: task.priority,
      dueDate: task.dueDate || null,
    }));
    const completedCount = tasksHistory.filter((item: any) => item.completed).length;
    const totalCount = tasksHistory.length || 1;
    const completionRate = completedCount / totalCount;
    const scheduleAdherence = {
      completionRate,
      overdueCount: tasksHistory.filter((item: any) => {
        if (!item.dueDate) return false;
        const due = new Date(item.dueDate);
        return Number.isFinite(due.getTime()) && due < new Date() && !item.completed;
      }).length,
      onTimeRate: Math.max(0, completionRate - 0.1),
    };
    const productivityMetrics = {
      totalTasks: totalCount,
      completedTasks: completedCount,
      averageCompletionRate: completionRate,
      focusScore: Math.min(1, 0.5 + completionRate * 0.5),
    };

    setIsLoading(true);
    try {
      const response = await fetch('/api/ai/pro/insights-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tasksHistory, scheduleAdherence, productivityMetrics }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate insights');
      }

      const data = await response.json();
      setInsights(data);
      toast({
        title: 'Insights generated',
        description: 'Your AI productivity insights are ready.',
      });
    } catch (error) {
      console.error('Error generating insights:', error);
      setInsights(mockInsights);
      toast({
        title: 'Using fallback insights',
        description: 'Live AI insights failed, so a local preview is shown.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateSchedule = async () => {
    if (!hasProAccess) {
      toast({
        title: 'Pro required',
        description: 'Upgrade to Pro to generate AI schedules.',
      });
      return;
    }
    if (!userData?.tasks?.length) {
      toast({
        title: 'No task data',
        description: 'Create a few tasks first, then generate a schedule.',
        variant: 'destructive',
      });
      return;
    }

    const userPreferences = {
      focusHours: ['09:00-11:00', '14:00-16:00'],
      breakIntervalMinutes: 90,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    const availability = {
      monday: ['09:00-17:00'],
      tuesday: ['09:00-17:00'],
      wednesday: ['09:00-17:00'],
      thursday: ['09:00-17:00'],
      friday: ['09:00-16:00'],
      saturday: [],
      sunday: [],
    };

    setIsLoading(true);
    try {
      const response = await fetch('/api/ai/pro/weekly-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          tasks: userData.tasks.slice(0, 30),
          userPreferences,
          availability,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate schedule');
      }

      const data = await response.json();
      setSchedule(data);
      toast({
        title: 'Schedule generated',
        description: 'Your AI weekly plan is ready.',
      });
    } catch (error) {
      console.error('Error generating schedule:', error);
      setSchedule(mockSchedule);
      toast({
        title: 'Using fallback schedule',
        description: 'Live AI schedule failed, so a local preview is shown.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateTaskBundles = async () => {
    if (!hasProAccess) {
      toast({
        title: 'Pro required',
        description: 'Upgrade to Pro to generate task bundles.',
      });
      return;
    }
    if (!userData?.tasks?.length) {
      toast({
        title: 'No task data',
        description: 'Create a few tasks first, then generate bundles.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/ai/pro/task-bundling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          tasks: userData.tasks.slice(0, 30),
          contextSwitchingGoals: 'Minimize context switching while preserving priority order',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate bundles');
      }

      const data = await response.json();
      setBundledTasks(data);
      toast({
        title: 'Task bundles generated',
        description: 'AI grouped your tasks for better focus blocks.',
      });
    } catch (error) {
      console.error('Error generating task bundles:', error);
      setBundledTasks(mockBundledTasks);
      toast({
        title: 'Using fallback task bundles',
        description: 'Live AI task bundling failed, so a local preview is shown.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpgradeToPro = () => {
    navigate('/pricing');
  };

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold">AI Insights & Task Management</h1>
          <p className="text-muted-foreground mt-2">
            Advanced AI-powered productivity tools with full access to your tasks and data
          </p>
        </div>
        <div className="px-3 py-1 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-full text-xs font-semibold">
          AI FEATURES ACTIVE
        </div>
      </div>

      {/* Removed Pro gate banner */}

      {/* Pro Plan Features Overview */}
      <div className="mb-8 bg-card border border-border rounded-xl p-5 animate-fade-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-primary/10 rounded-lg">
            <ZapIcon className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-base font-semibold text-foreground">Pro Plan Features</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
            <TargetIcon className="w-5 h-5 text-primary mt-0.5" />
            <div>
            <h3 className="font-semibold text-foreground">AI-Powered Scheduling</h3>
              <p className="text-sm text-muted-foreground">Automatically builds your schedule using priority, time, and dates</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
            <CalendarIcon className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <h3 className="font-semibold text-foreground">Weekly Schedule</h3>
              <p className="text-sm text-muted-foreground">Full AI-generated weekly schedule optimized for your productivity</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
            <TimerIcon className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <h3 className="font-semibold text-foreground">Dynamic Rescheduling</h3>
              <p className="text-sm text-muted-foreground">AI adapts when plans change to maintain optimal workflow</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
            <BarChartIcon className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <h3 className="font-semibold text-foreground">Insights & Tracking</h3>
              <p className="text-sm text-muted-foreground">Weekly & monthly insights + time tracking for productivity</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
            <CheckCircleIcon className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <h3 className="font-semibold text-foreground">Task Bundling</h3>
              <p className="text-sm text-muted-foreground">AI groups similar tasks to reduce context switching</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
            <TrendingUpIcon className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <h3 className="font-semibold text-foreground">Goal Tracking</h3>
              <p className="text-sm text-muted-foreground">Visualize progress with charts and predictive analytics</p>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-4 mb-8">
        <Button onClick={handleGenerateSchedule} disabled={isLoading || !hasProAccess}>
          <ClockIcon className="w-4 h-4 mr-2" />
          Generate AI Weekly Schedule
        </Button>
        <Button onClick={handleGenerateInsights} disabled={isLoading || !hasProAccess}>
          <BarChartIcon className="w-4 h-4 mr-2" />
          Analyze Productivity Insights
        </Button>
        <Button onClick={fetchUserData} disabled={isLoading}>
          <BarChartIcon className="w-4 h-4 mr-2" />
          Refresh Data
        </Button>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
        </div>
      )}

      {!isLoading && (
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="schedule">Weekly Schedule</TabsTrigger>
            <TabsTrigger value="insights">Productivity Insights</TabsTrigger>
            <TabsTrigger value="bundling">Task Bundling</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>User Data Overview</CardTitle>
              </CardHeader>
              <CardContent>
                {userData ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <p className="text-2xl font-bold">{userData.taskCount}</p>
                        <p className="text-sm text-muted-foreground">Total Tasks</p>
                      </div>
                      <div className="bg-green-50 p-4 rounded-lg">
                        <p className="text-2xl font-bold">{userData.completedCount}</p>
                        <p className="text-sm text-muted-foreground">Completed Tasks</p>
                      </div>
                      <div className="bg-yellow-50 p-4 rounded-lg">
                        <p className="text-2xl font-bold">{userData.pendingCount}</p>
                        <p className="text-sm text-muted-foreground">Pending Tasks</p>
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="font-semibold mb-2">Recent Tasks</h3>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {userData.tasks.slice(0, 10).map((task: any, idx: number) => (
                          <div key={idx} className="flex justify-between items-center p-2 border rounded-lg">
                            <div>
                              <p className="font-medium">{task.title}</p>
                              <p className="text-xs text-muted-foreground">{task.boardName} - {task.columnName}</p>
                            </div>
                            <div className="flex gap-2">
                              <Badge variant="outline">{task.priority}</Badge>
                              {task.dueDate && <Badge variant="secondary">{task.dueDate}</Badge>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div className="pt-4">
                      <h3 className="font-semibold mb-2">Boards</h3>
                      <div className="flex flex-wrap gap-2">
                        {userData.boards.map((board: any, idx: number) => (
                          <Badge key={idx} variant="outline">{board.name}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p>No user data available. Please refresh.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Weekly Schedule Tab */}
          <TabsContent value="schedule" className="space-y-6">
            {schedule ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CalendarIcon className="w-5 h-5" />
                      AI-Generated Weekly Schedule
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                      {Object.entries(schedule.weeklySchedule).map(([day, tasks]) => (
                        <div key={day} className="border rounded-lg p-3">
                          <h3 className="font-semibold capitalize">{day}</h3>
                          <div className="mt-2 space-y-2">
                            {(tasks as any[]).map((task, idx) => (
                              <div 
                                key={idx} 
                                className={`p-2 rounded text-xs ${
                                  task.category === 'focus' ? 'bg-blue-100 border-blue-200' :
                                  task.category === 'meeting' ? 'bg-green-100 border-green-200' :
                                  task.category === 'admin' ? 'bg-yellow-100 border-yellow-200' :
                                  'bg-purple-100 border-purple-200'
                                } border`}
                              >
                                <div className="font-medium">{task.startTime} - {task.endTime}</div>
                                <div>{task.task}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="mt-6">
                      <h3 className="font-semibold mb-3">Optimization Tips</h3>
                      <ul className="space-y-2">
                        {schedule.optimizationTips.map((tip: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-2">
                            <div className="w-2 h-2 rounded-full bg-purple-500 mt-2"></div>
                            <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>AI Insights</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="font-semibold mb-2">Peak Focus Windows</h4>
                        <div className="flex flex-wrap gap-2">
                          {schedule.insights.peakFocusWindows.map((window: string, idx: number) => (
                            <Badge key={idx} variant="secondary">{window}</Badge>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="font-semibold mb-2">Recommended Break Times</h4>
                        <div className="flex flex-wrap gap-2">
                          {schedule.insights.recommendedBreakTimes.map((time: string, idx: number) => (
                            <Badge key={idx} variant="outline">{time}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    
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
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <CalendarIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2">No Schedule Generated Yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Generate your AI-powered weekly schedule to see personalized recommendations
                  </p>
                  <Button onClick={handleGenerateSchedule} disabled={isLoading || !hasProAccess}>
                    Generate Schedule
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Insights Tab */}
          <TabsContent value="insights" className="space-y-6">
            {insights ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Weekly Performance</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between mb-1">
                          <span>Completion Rate</span>
                          <span>{Math.round(insights.weeklyInsights.averageCompletionRate * 100)}%</span>
                        </div>
                        <Progress value={insights.weeklyInsights.averageCompletionRate * 100} className="h-2" />
                      </div>
                      
                      <div>
                        <h4 className="font-medium mb-2">Best Performing Days</h4>
                        <div className="flex flex-wrap gap-2">
                          {insights.weeklyInsights.bestPerformingDays.map((day: string, idx: number) => (
                            <Badge key={idx}>{day}</Badge>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="font-medium">Time Wasted</h4>
                        <p className="text-2xl font-bold text-red-500">{insights.weeklyInsights.timeWasted} hrs</p>
                        <p className="text-sm text-muted-foreground">per day on average</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Monthly Overview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <p className="text-3xl font-bold">{insights.monthlyOverview.completedTasks}</p>
                        <p className="text-sm text-muted-foreground">Tasks Completed</p>
                      </div>
                      <div className="bg-red-50 p-4 rounded-lg">
                        <p className="text-3xl font-bold">{insights.monthlyOverview.missedDeadlines}</p>
                        <p className="text-sm text-muted-foreground">Missed Deadlines</p>
                      </div>
                      <div className="bg-green-50 p-4 rounded-lg">
                        <p className="text-3xl font-bold">{insights.monthlyOverview.efficiencyRating * 100}%</p>
                        <p className="text-sm text-muted-foreground">Efficiency Rating</p>
                      </div>
                      <div className="bg-purple-50 p-4 rounded-lg">
                        <p className="text-3xl font-bold">+{insights.monthlyOverview.improvementPercentage}%</p>
                        <p className="text-sm text-muted-foreground">Improvement</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Improvement Suggestions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3">
                      {insights.improvementSuggestions.map((suggestion: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                          <CheckCircleIcon className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>{suggestion}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <BarChartIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2">No Insights Available</h3>
                  <p className="text-muted-foreground mb-4">
                    Analyze your productivity data to get personalized insights
                  </p>
                  <Button onClick={handleGenerateInsights} disabled={isLoading || !hasProAccess}>
                    Generate Insights
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Task Bundling Tab */}
          <TabsContent value="bundling" className="space-y-6">
            {bundledTasks ? (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>AI Task Bundles</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {bundledTasks.taskBundles.map((bundle: any, idx: number) => (
                        <div key={idx} className="border rounded-lg p-4">
                          <div className="flex justify-between items-start">
                            <h3 className="font-semibold">{bundle.bundleName}</h3>
                            <Badge variant="outline">{bundle.mentalMode}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            Best during {bundle.optimalTimeOfDay}, requires {bundle.energyLevel} energy
                          </p>
                          
                          <div className="mt-3">
                            <h4 className="font-medium mb-2">Tasks in Bundle:</h4>
                            <ul className="space-y-1">
                              {bundle.tasks.map((task: string, taskIdx: number) => (
                                <li key={taskIdx} className="flex items-center gap-2 pl-2 border-l-2 border-blue-200">
                                  <CheckCircleIcon className="w-4 h-4 text-green-500" />
                                  {task}
                                </li>
                              ))}
                            </ul>
                          </div>
                          
                          <div className="mt-3 pt-3 border-t flex justify-between text-sm">
                            <span>Estimated time: {bundle.estimatedTime} min</span>
                            <span>ID: {bundle.bundleId}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="mt-6">
                      <h3 className="font-semibold mb-3">Expected Benefits</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-green-50 p-4 rounded-lg">
                          <p className="text-2xl font-bold text-green-700">{bundledTasks.expectedBenefits.timeSaved} min</p>
                          <p className="text-sm">Time Saved Daily</p>
                        </div>
                        <div className="bg-blue-50 p-4 rounded-lg">
                          <p className="text-2xl font-bold text-blue-700">{bundledTasks.expectedBenefits.contextSwitchesReduced}</p>
                          <p className="text-sm">Context Switches Reduced</p>
                        </div>
                        <div className="bg-purple-50 p-4 rounded-lg">
                          <p className="text-2xl font-bold text-purple-700">+{bundledTasks.expectedBenefits.focusScoreImprovement * 100}%</p>
                          <p className="text-sm">Focus Score Improvement</p>
                        </div>
                      </div>
                      
                      <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                        <h4 className="font-medium mb-2">Bundling Rationale</h4>
                        <p>{bundledTasks.bundlingRationale}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <TargetIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2">No Task Bundles Created</h3>
                  <p className="text-muted-foreground mb-4">
                    Group similar tasks together to reduce context switching
                  </p>
                  <Button onClick={handleGenerateTaskBundles} disabled={isLoading || !hasProAccess}>
                    Generate Task Bundles
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Pro Plan Feature Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <div className="inline-flex items-center gap-2 bg-purple-100 text-purple-800 px-4 py-2 rounded-full text-sm font-medium mb-4">
                    <ZapIcon className="w-4 h-4" />
                    Upgrade to Pro Plan
                  </div>
                  <h3 className="text-xl font-bold mb-2">Unlock Advanced Analytics</h3>
                  <p className="text-muted-foreground max-w-md mx-auto mb-6">
                    Get detailed time tracking, goal progression charts, and predictive analytics to optimize your productivity.
                  </p>
                  
                  <div className="bg-gray-100 border-2 border-dashed rounded-xl w-full h-64 flex items-center justify-center">
                    <span className="text-muted-foreground">Interactive Charts Would Appear Here</span>
                  </div>
                  
                  <div className="mt-6">
                    <Button
                      size="lg"
                      onClick={handleUpgradeToPro}
                      className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                    >
                      Upgrade to Pro - $14.99/month
                    </Button>
                    <p className="text-sm text-muted-foreground mt-2">
                      Unlock all AI-powered productivity features
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default AIInsights;
