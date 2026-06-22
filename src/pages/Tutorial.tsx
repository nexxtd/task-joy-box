import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ChevronRight, 
  ChevronLeft, 
  X, 
  CheckCircle, 
  Sparkles, 
  Target, 
  CalendarDays, 
  BarChart3,
  Wand2,
  Settings,
  Zap
} from 'lucide-react';

interface TutorialStep {
  id: number;
  title: string;
  description: string;
  icon: React.ElementType;
  action?: string;
  highlight?: string;
}

const Tutorial: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [showTutorial, setShowTutorial] = useState(true);
  const navigate = useNavigate();

  const steps: TutorialStep[] = [
    {
      id: 0,
      title: "Welcome to MyPlanner",
      description: "Your intelligent productivity companion that helps you organize tasks, track goals, and optimize your workflow with AI-powered insights.",
      icon: Sparkles,
      highlight: "dashboard"
    },
    {
      id: 1,
      title: "Organize Your Tasks",
      description: "Create and manage tasks using our Kanban board. Drag tasks between columns, set priorities, add due dates, and track progress visually.",
      icon: Target,
      action: "Try creating your first task",
      highlight: "tasks"
    },
    {
      id: 2,
      title: "Plan Your Schedule",
      description: "Use the calendar view to schedule tasks, set time blocks, and visualize your week. Break slots are automatically included for optimal productivity.",
      icon: CalendarDays,
      action: "Navigate to Calendar",
      highlight: "calendar"
    },
    {
      id: 3,
      title: "Track Your Progress",
      description: "Monitor your productivity with detailed insights. View completion rates, task distribution, and get AI-powered recommendations.",
      icon: BarChart3,
      action: "Check your insights",
      highlight: "insights"
    },
    {
      id: 4,
      title: "AI Assistant Planora",
      description: "Meet Planora, your AI productivity assistant. Get smart scheduling suggestions, task breakdowns, and personalized productivity tips.",
      icon: Wand2,
      action: "Chat with Planora",
      highlight: "ai-chat"
    },
    {
      id: 5,
      title: "Customize Your Experience",
      description: "Personalize your workspace with themes, accent colors, fonts, and language preferences. Sync settings across devices.",
      icon: Settings,
      action: "Open Settings",
      highlight: "settings"
    }
  ];

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeTutorial();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const completeTutorial = () => {
    localStorage.setItem('tutorial_completed', 'true');
    setShowTutorial(false);
    navigate('/');
  };

  const skipTutorial = () => {
    localStorage.setItem('tutorial_completed', 'true');
    setShowTutorial(false);
    navigate('/');
  };

  const navigateToSection = (path: string) => {
    navigate(path);
    nextStep();
  };

  if (!showTutorial) return null;

  const step = steps[currentStep];
  const Icon = step.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-card w-full max-w-2xl rounded-2xl shadow-2xl border border-border overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-primary/10 to-primary/5 p-8 border-b border-border">
          <button
            onClick={skipTutorial}
            className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-all"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center">
              <Icon className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground mb-2">{step.title}</h1>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground font-medium">
                  {currentStep + 1} of {steps.length}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          <p className="text-lg text-muted-foreground leading-relaxed mb-8">
            {step.description}
          </p>

          {/* Feature highlights */}
          {step.highlight && (
            <div className="bg-muted/30 rounded-xl p-6 mb-8 border border-border">
              <div className="flex items-center gap-3 mb-3">
                <Zap className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-foreground">Quick Tip</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                {step.id === 0 && "Start by exploring your dashboard to see your current task overview and productivity metrics."}
                {step.id === 1 && "Click the '+' button in any column to add a new task. Use drag-and-drop to move tasks between columns."}
                {step.id === 2 && "Switch between day, week, and month views. Tasks with due dates automatically appear on your calendar."}
                {step.id === 3 && "Your insights update in real-time. Track completion rates and identify productivity patterns."}
                {step.id === 4 && "Ask Planora to 'schedule my week' or 'break down this task' for intelligent assistance."}
                {step.id === 5 && "Paid users can customize accent colors and fonts. All settings sync across devices."}
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-4">
            {step.action && step.highlight && (
              <button
                onClick={() => navigateToSection(step.highlight!)}
                className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
              >
                {step.action}
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
            
            <div className="flex gap-3">
              {currentStep > 0 && (
                <button
                  onClick={prevStep}
                  className="px-6 py-3 border border-border rounded-xl font-medium text-foreground hover:bg-muted transition-all flex items-center gap-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
              )}
              
              <button
                onClick={nextStep}
                className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all flex items-center gap-2"
              >
                {currentStep === steps.length - 1 ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Get Started
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Tutorial;
