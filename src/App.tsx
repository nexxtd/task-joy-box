import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BoardProvider } from "@/context/BoardContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import AppLayout from "@/components/AppLayout";
import LoginPage from "@/pages/LoginPage";
import Dashboard from "@/pages/Dashboard";
import Projects from "@/pages/Projects";
import Tasks from "@/pages/Tasks";
import CalendarPage from "@/pages/CalendarPage";
import Insights from "@/pages/Insights";
import Notes from "@/pages/Notes";
import Goals from "@/pages/Goals";
import Collaboration from "@/pages/Collaboration";
import Pricing from "@/pages/Pricing";
import SettingsPage from "@/pages/SettingsPage";
import AIChat from "@/pages/AIChat";
import Habits from "@/pages/Habits";
import Support from "@/pages/Support";
import AdminDashboard from "@/pages/AdminDashboard";
import Tutorial from "@/pages/Tutorial";
import NotFound from "@/pages/NotFound";
import WhiteboardPage from "@/pages/WhiteboardPage";
import { useEffect } from "react";
import { useBoardContext } from "@/context/BoardContext";
import { toast } from "@/hooks/use-toast";
import EnergyPopup from "@/components/EnergyPopup";
import DeepFocusMode from "@/components/DeepFocusMode";
import { useDeepFocus } from "@/hooks/useDeepFocus";

const Notifier = () => {
  const { board } = useBoardContext();
  const { user } = useAuth();
  const isPro = user?.subscriptionTier === 'pro' || user?.subscriptionTier === 'premium';

  useEffect(() => {
    if (!isPro || !board.tasks.length) return;

    const notifiedKeys = new Set<string>();

    const check = () => {
      const now = new Date();
      board.tasks.forEach(task => {
        if (task.dueDate && task.priority === 'urgent' && !task.columnId.toLowerCase().includes('done')) {
          const due = new Date(task.dueDate);
          const diff = due.getTime() - now.getTime();
          if (diff > 0 && diff < 12 * 60 * 60 * 1000) { // 12 hours
            const key = `notify_${task.id}_${task.dueDate}`;
            if (!notifiedKeys.has(key)) {
              toast({
                title: "Urgent Deadline",
                description: `Task "${task.title}" is due soon!`,
              });
              notifiedKeys.add(key);
            }
          }
        }
      });
    };

    check();
    const timer = setInterval(check, 60000); // Check every minute
    return () => clearInterval(timer);
  }, [board.tasks, isPro]);

  return null;
};

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { user, loading } = useAuth();
  const { isOpen: isDeepFocusOpen, task: deepFocusTask } = useDeepFocus();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  // Check if tutorial should be shown
  const shouldShowTutorial = user && !localStorage.getItem('tutorial_completed');

  return (
    <BoardProvider>
      <Notifier />
      <EnergyPopup />
      {shouldShowTutorial && <Tutorial />}
      {isDeepFocusOpen && <DeepFocusMode task={deepFocusTask} />}
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/habits" element={<Habits />} />
          <Route path="/support" element={<Support />} />
          <Route path="/collaboration" element={<Collaboration />} />
          <Route path="/ai-chat" element={<AIChat />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Route>
        <Route path="/whiteboard/:id" element={<WhiteboardPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BoardProvider>
  );
}

const App = () => (
  <ThemeProvider>
    <LanguageProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <ProtectedRoutes />
            </BrowserRouter>
          </TooltipProvider>
        </QueryClientProvider>
      </AuthProvider>
    </LanguageProvider>
  </ThemeProvider>
);

export default App;
