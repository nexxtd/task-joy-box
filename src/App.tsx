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
import { lazy, Suspense, useEffect, useState } from "react";

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Projects = lazy(() => import("@/pages/Projects"));
const Tasks = lazy(() => import("@/pages/Tasks"));
const CalendarPage = lazy(() => import("@/pages/CalendarPage"));
const Insights = lazy(() => import("@/pages/Insights"));
const Notes = lazy(() => import("@/pages/Notes"));
const Goals = lazy(() => import("@/pages/Goals"));
const Collaboration = lazy(() => import("@/pages/Collaboration"));
const Pricing = lazy(() => import("@/pages/Pricing"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const AIChat = lazy(() => import("@/pages/AIChat"));
const Habits = lazy(() => import("@/pages/Habits"));
const Support = lazy(() => import("@/pages/Support"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const Tutorial = lazy(() => import("@/pages/Tutorial"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const WhiteboardPage = lazy(() => import("@/pages/WhiteboardPage"));
const Classroom = lazy(() => import("@/pages/Classrooms"));
import { useBoardContext } from "@/context/BoardContext";
import { toast } from "@/hooks/use-toast";
import EnergyPopup from "@/components/EnergyPopup";
import DeepFocusMode from "@/components/DeepFocusMode";
import { useDeepFocus } from "@/hooks/useDeepFocus";
import { applyAccentHsl, normalizeAccent } from "@/lib/accent";
import { deviceNotify, formatOverdueDelta, markAlertSent, wasAlertSent } from "@/lib/notifications";
import { SpeedInsights } from "@vercel/speed-insights/react";

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
            {shouldShowTutorial && <Suspense fallback={null}><Tutorial /></Suspense>}
            {isDeepFocusOpen && <DeepFocusMode task={deepFocusTask} />}
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Suspense fallback={<PageLoader />}><Dashboard /></Suspense>} />
                <Route path="/projects" element={<Suspense fallback={<PageLoader />}><Projects /></Suspense>} />
                <Route path="/tasks" element={<Suspense fallback={<PageLoader />}><Tasks /></Suspense>} />
                <Route path="/calendar" element={<Suspense fallback={<PageLoader />}><CalendarPage /></Suspense>} />
                <Route path="/insights" element={<Suspense fallback={<PageLoader />}><Insights /></Suspense>} />
                <Route path="/notes" element={<Suspense fallback={<PageLoader />}><Notes /></Suspense>} />
                <Route path="/goals" element={<Suspense fallback={<PageLoader />}><Goals /></Suspense>} />
                <Route path="/habits" element={<Suspense fallback={<PageLoader />}><Habits /></Suspense>} />
                <Route path="/classroom" element={<Suspense fallback={<PageLoader />}><Classroom /></Suspense>} />
                <Route path="/support" element={<Suspense fallback={<PageLoader />}><Support /></Suspense>} />
                <Route path="/collaboration" element={<Suspense fallback={<PageLoader />}><Collaboration /></Suspense>} />
                <Route path="/ai-chat" element={<Suspense fallback={<PageLoader />}><AIChat /></Suspense>} />
                <Route path="/pricing" element={<Suspense fallback={<PageLoader />}><Pricing /></Suspense>} />
                <Route path="/settings" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
                <Route path="/admin" element={<Suspense fallback={<PageLoader />}><AdminDashboard /></Suspense>} />
              </Route>
              <Route path="/whiteboard/:id" element={<Suspense fallback={<PageLoader />}><WhiteboardPage /></Suspense>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </HabitsProvider>
        </GoalsProvider>
      </NotesProvider>
    </BoardProvider>
  );
}

const PageLoader = () => (
  <div className="h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

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
            <SpeedInsights />
          </TooltipProvider>
        </QueryClientProvider>
      </AuthProvider>
    </LanguageProvider>
  </ThemeProvider>
);

export default App;
