import React from 'react';
import { LifeBuoy, MessageSquare, Zap, Bot, Sparkles, Brain, Wand2, BarChart3 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';

const Support: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isPremium = user?.subscriptionTier === 'premium';

  return (
    <div className="flex-1 overflow-y-auto bg-background/50">
      <header className="px-8 py-4 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <LifeBuoy className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Support & AI Features</h1>
        </div>
      </header>

      <div className="p-8 max-w-4xl mx-auto space-y-8">
        {!isPremium && (
          <div className="p-6 bg-primary/5 border border-primary/20 rounded-2xl animate-fade-in flex items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                 <Zap className="w-6 h-6 text-primary fill-current" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Unlock AI Features</h3>
                <p className="text-sm text-muted-foreground">Premium users get access to advanced AI features and priority support.</p>
              </div>
            </div>
            <button 
              onClick={() => window.location.href = '/pricing'}
              className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold whitespace-nowrap hover:scale-105 transition-all"
            >
              Get Premium
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group">
                <div className="w-10 h-10 rounded-lg bg-label-blue/10 text-label-blue flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
                    <Wand2 className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-foreground">AI Assistant</h3>
                <p className="text-xs text-muted-foreground mt-1 mb-6">Get intelligent task suggestions, automated prioritization, and productivity insights.</p>
                <button 
                  onClick={() => navigate('/ai-chat')}
                  className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-all"
                >
                    Open AI Chat
                </button>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group">
                <div className="w-10 h-10 rounded-lg bg-label-green/10 text-label-green flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
                    <BarChart3 className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-foreground">AI Insights</h3>
                <p className="text-xs text-muted-foreground mt-1 mb-6">Analyze your productivity patterns and get personalized improvement recommendations.</p>
                <button 
                  onClick={() => navigate('/insights')}
                  className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-all"
                >
                    View Insights
                </button>
            </div>
            
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group">
                <div className="w-10 h-10 rounded-lg bg-label-blue/10 text-label-blue flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
                    <MessageSquare className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-foreground">Priority Support</h3>
                <p className="text-xs text-muted-foreground mt-1 mb-6">Real-time assistance for urgent technical issues or workflow questions.</p>
                <button 
                  disabled={!isPremium}
                  onClick={() => isPremium && navigate('/ai-chat')}
                  className="w-full py-2.5 bg-muted hover:bg-muted/80 rounded-xl text-sm font-bold text-foreground transition-all disabled:opacity-50"
                >
                    {isPremium ? 'Get Help' : 'Premium Only'}
                </button>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group">
                <div className="w-10 h-10 rounded-lg bg-label-green/10 text-label-green flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
                    <Bot className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-foreground">Task Automation</h3>
                <p className="text-xs text-muted-foreground mt-1 mb-6">Use AI to automatically organize, prioritize, and schedule your tasks.</p>
                <button 
                  onClick={() => navigate('/calendar')}
                  className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-all"
                >
                    Auto-Schedule
                </button>
            </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8">
            <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" /> About Our AI Features
            </h2>
            <div className="space-y-4 text-sm text-foreground">
                <p>
                    Our AI assistant helps you optimize your productivity by analyzing your task patterns, suggesting 
                    optimal scheduling, and providing personalized recommendations to improve your workflow.
                </p>
                <p>
                    The AI analyzes your task history, completion rates, and patterns to offer insights that help 
                    you work smarter, not harder. It can automatically prioritize tasks based on deadlines, importance, 
                    and your historical performance.
                </p>
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-primary/5 rounded-xl">
                        <h3 className="font-semibold text-foreground mb-2">AI Task Analysis</h3>
                        <p className="text-sm text-muted-foreground">
                            Get detailed analysis of your tasks, including bottleneck identification and priority recommendations.
                        </p>
                    </div>
                    <div className="p-4 bg-primary/5 rounded-xl">
                        <h3 className="font-semibold text-foreground mb-2">Productivity Insights</h3>
                        <p className="text-sm text-muted-foreground">
                            Understand your work patterns and receive actionable tips to boost your productivity.
                        </p>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Support;