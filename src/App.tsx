import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
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
import { Suspense, useEffect, useState, useRef } from "react";

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
import Documents from "@/pages/Documents";
import WhatsNew from "@/pages/WhatsNew";
import VerifyEmail from "@/pages/VerifyEmail";
import WhatsNewModal from "@/components/WhatsNewModal";
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
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 4000);
    (async () => {
      try {
        const res = await fetch("/api/settings", { credentials: "include", signal: ctrl.signal });
        clearTimeout(tid);
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
        clearTimeout(tid);
      }
    })();
    return () => { cancelled = true; ctrl.abort(); clearTimeout(tid); };
  }, [user]);

  return null;
};

const Notifier = () => {
  const { board } = useBoardContext();
  const { user } = useAuth();
  const isPaid = user?.subscriptionTier === 'pro' || user?.subscriptionTier === 'premium';
  const tasksRef = useRef(board.tasks);
  useEffect(() => { tasksRef.current = board.tasks; }, [board.tasks]);
  useEffect(() => {
    if (!isPaid) return;
    const smartAlertsEnabled = () => localStorage.getItem('smartAlerts') !== 'false';
    const check = () => {
      if (!smartAlertsEnabled()) return;
      const tasks = tasksRef.current;
      if (!tasks.length) return;
      tasks.forEach(task => {
        if (!task.dueDate || !task.columnId || task.columnId.toLowerCase().includes('done')) return;
        const due = new Date(`${task.dueDate}T${task.dueTime || '23:59:59'}`);
        const diff = due.getTime() - Date.now();
        const overdue = diff < 0;
        const urgent = task.priority === 'urgent';
        if (urgent && !overdue && diff < 12 * 60 * 60 * 1000) {
          const key = `urgent_${task.id}`;
          if (!wasAlertSent(key)) {
            toast({ title: "Urgent Deadline", description: `Task "${task.title}" is due soon!` });
            deviceNotify("Urgent Deadline", `Task "${task.title}" is due soon!`, key);
            markAlertSent(key);
          }
        }
        if (!overdue && diff < 60 * 60 * 1000) {
          const key = `soon_${task.id}`;
          if (!wasAlertSent(key)) {
            toast({ title: "Due Soon", description: `Task "${task.title}" is due within the hour` });
            deviceNotify("Due Soon", `Task "${task.title}" is due by ${task.dueTime || 'end of day'} today`, key);
            markAlertSent(key);
          }
        }
        if (overdue) {
          const key = `overdue_${task.id}_${task.dueDate}_${task.dueTime || ""}`;
          if (!wasAlertSent(key)) {
            toast({ title: "Overdue", description: `Task "${task.title}" is overdue` });
            deviceNotify("Overdue", `Task "${task.title}" is ${formatOverdueDelta(task.dueDate, task.dueTime)}`, key);
            markAlertSent(key);
          }
        }
      });
    };
    check();
    const timer = setInterval(check, 60000);
    return () => clearInterval(timer);
  }, [isPaid]);
  return null;
};

const queryClient = new QueryClient();

function PublicLogin() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (user) return <Navigate to="/" replace />;
  return <LoginPage />;
}

function ProtectedRoutes() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const { isOpen: isDeepFocusOpen, task: deepFocusTask } = useDeepFocus();
  const [maintenance, setMaintenance] = useState<{ maintenance_mode: boolean; message: string | null }>({ maintenance_mode: false, message: null });
  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 4000);
    (async () => {
      try {
        const res = await fetch("/api/status", { signal: ctrl.signal });
        clearTimeout(tid);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setMaintenance(data);
      } catch {
        clearTimeout(tid);
      }
    })();
    return () => { cancelled = true; ctrl.abort(); clearTimeout(tid); };
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  if ((user as any).emailVerified === false) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8 shadow-sm text-center">
          <h1 className="text-lg font-bold text-foreground mb-2">Verify your email</h1>
          <p className="text-sm text-muted-foreground mb-6">We sent a verification link to <span className="font-medium text-foreground">{user.email}</span>. Please check your inbox and click the link to activate your account. The link expires in 24 hours.</p>
          <button
            onClick={async () => {
              await fetch('/api/auth/resend-verification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email }) });
              alert('Verification email resent if your address is registered.');
            }}
            className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium mb-3"
          >
            Resend verification email
          </button>
          <button onClick={() => { localStorage.removeItem('auth_user_cache'); window.location.href = '/'; }} className="text-xs text-muted-foreground underline">Sign out</button>
        </div>
      </div>
    );
  }

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
            <WhatsNewModal />
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
                <Route path="/documents" element={<Suspense fallback={<PageLoader />}><Documents /></Suspense>} />
                <Route path="/whats-new" element={<Suspense fallback={<PageLoader />}><WhatsNew /></Suspense>} />
                <Route path="/support" element={<Suspense fallback={<PageLoader />}><Support /></Suspense>} />
                <Route path="/collaboration" element={<Suspense fallback={<PageLoader />}><Collaboration /></Suspense>} />
                <Route path="/ai-chat" element={<Suspense fallback={<PageLoader />}><AIChat /></Suspense>} />
                <Route path="/pricing" element={<Suspense fallback={<PageLoader />}><Pricing /></Suspense>} />
                <Route path="/settings" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
                <Route path="/admin" element={<Suspense fallback={<PageLoader />}><AdminDashboard /></Suspense>} />
              </Route>
              <Route path="/whiteboard/:id" element={<Suspense fallback={<PageLoader />}><WhiteboardPage /></Suspense>} />
              <Route path="*" element={<Suspense fallback={<PageLoader />}><NotFound /></Suspense>} />
            </Routes>
          </HabitsProvider>
        </GoalsProvider>
      </NotesProvider>
    </BoardProvider>
  );
}

const PageLoader = () => {
  const [stuck, setStuck] = useState(false);
  useEffect(() => { const t = setTimeout(() => setStuck(true), 3000); return () => clearTimeout(t); }, []);
  if (stuck) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-3 bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Taking longer than expected…</p>
        <button onClick={() => window.location.reload()} className="text-xs underline text-primary">Reload</button>
      </div>
    );
  }
  return (
    <div className="h-[60vh] flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
};

const App = () => (
  <ThemeProvider>
    <LanguageProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/verify-email" element={<VerifyEmail />} />
                <Route path="/login" element={<PublicLogin />} />
                <Route path="/*" element={<ProtectedRoutes />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </QueryClientProvider>
      </AuthProvider>
    </LanguageProvider>
  </ThemeProvider>
);

export default App;
