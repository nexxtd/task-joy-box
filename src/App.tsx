import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BoardProvider } from "@/context/BoardContext";
import { NotesProvider } from "@/context/NotesContext";
import { GoalsProvider } from "@/context/GoalsContext";
import { HabitsProvider } from "@/context/HabitsContext";
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
import { useEffect, useState } from "react";
import { useBoardContext } from "@/context/BoardContext";
import { toast } from "@/hooks/use-toast";
import EnergyPopup from "@/components/EnergyPopup";
import DeepFocusMode from "@/components/DeepFocusMode";
import { useDeepFocus } from "@/hooks/useDeepFocus";
import { applyAccentHsl, normalizeAccent } from "@/lib/accent";
import { deviceNotify, formatOverdueDelta, markAlertSent, wasAlertSent } from "@/lib/notifications";

const AppearanceSync = () => {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings", { credentials: "include" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const { hex, hsl } = normalizeAccent(data.accentColor, data.accentHsl);
        applyAccentHsl(hsl);
        localStorage.setItem("accentColor", hex);
        localStorage.setItem("accentHsl", hsl);
        if (data.fontFamily) {
          document.body.style.fontFamily = `'${data.fontFamily}', system-ui, -apple-system, sans-serif`;
          localStorage.setItem("font", data.fontFamily);
        }
      } catch {
        // Ignore — CSS defaults stay in place until the user saves settings.
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  return null;
};

const Notifier = () => {
  const { board } = useBoardContext();
  const { user } = useAuth();
  const isPaid = user?.subscriptionTier === 'pro' || user?.subscriptionTier === 'premium';

  useEffect(() => {
    if (!isPaid || !board.tasks.length) return;

    const smartAlertsEnabled = () => localStorage.getItem('smartAlerts') !== 'false';

    const check = () => {
      if (!smartAlertsEnabled()) return;
      board.tasks.forEach(task => {
        if (!task.dueDate || !task.columnId || task.columnId.toLowerCase().includes('done')) return;

        const due = new Date(`${task.dueDate}T${task.dueTime || '23:59:59'}`);
        const diff = due.getTime() - Date.now();
        const overdue = diff < 0;

        const urgent = task.priority === 'urgent';
        if (urgent && !overdue && diff < 12 * 60 * 60 * 1000) {
          const key = `urgent_${task.id}`;
          toast({ title: "Urgent Deadline", description: `Task "${task.title}" is due soon!` });
          if (!wasAlertSent(key)) {
            deviceNotify("Urgent Deadline", `Task "${task.title}" is due soon!`, key);
            markAlertSent(key);
          }
        }

        if (!overdue && diff < 60 * 60 * 1000) {
          const key = `soon_${task.id}`;
          toast({ title: "Due Soon", description: `Task "${task.title}" is due within the hour` });
          if (!wasAlertSent(key)) {
            deviceNotify("Due Soon", `Task "${task.title}" is due by ${task.dueTime || 'end of day'} today`, key);
            markAlertSent(key);
          }
        }

        if (overdue) {
          const key = `overdue_${task.id}`;
          toast({ title: "Overdue", description: `Task "${task.title}" is overdue` });
          if (!wasAlertSent(key)) {
            deviceNotify("Overdue", `Task "${task.title}" is ${formatOverdueDelta(task.dueDate, task.dueTime)}`, key);
            markAlertSent(key);
          }
        }
      });
    };

    check();
    const timer = setInterval(check, 60000);
    return () => clearInterval(timer);
  }, [board.tasks, isPaid]);

  return null;
};

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { user, loading } = useAuth();
  const { isOpen: isDeepFocusOpen, task: deepFocusTask } = useDeepFocus();
  const [maintenance, setMaintenance] = useState<{ maintenance_mode: boolean; message: string | null }>({ maintenance_mode: false, message: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/status");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setMaintenance(data);
      } catch {
        // Ignore — the app stays available if the status endpoint fails.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  if (maintenance.maintenance_mode && !user.isAdmin) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <h1 className="text-2xl font-semibold">Under Maintenance</h1>
        <p className="text-muted-foreground max-w-md">{maintenance.message || "We are currently performing scheduled maintenance. Please check back shortly."}</p>
      </div>
    );
  }

  // Check if tutorial should be shown
  const shouldShowTutorial = user && !localStorage.getItem('tutorial_completed');

  return (
    <BoardProvider>
      <NotesProvider>
        <GoalsProvider>
          <HabitsProvider>
            <Notifier />
            <AppearanceSync />
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
          </HabitsProvider>
        </GoalsProvider>
      </NotesProvider>
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
