import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Calendar, FileText, Users, Sparkles, ChevronDown, MessageSquare, Mail, Info } from 'lucide-react';

interface ComingSoonProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  accent?: 'blue' | 'emerald' | 'purple' | 'amber' | 'pink' | 'indigo';
  preview?: string[];
  faqs?: { q: string; a: string }[];
  onNotify?: () => void;
}

const accentMap: Record<string, { bg: string; iconBg: string; iconColor: string; border: string }> = {
  blue: { bg: 'bg-blue-50 dark:bg-blue-950/20', iconBg: 'bg-blue-100 dark:bg-blue-900/40', iconColor: 'text-blue-600 dark:text-blue-400', border: 'border-blue-200/50 dark:border-blue-900/30' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-950/20', iconBg: 'bg-emerald-100 dark:bg-emerald-900/40', iconColor: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200/50 dark:border-emerald-900/30' },
  purple: { bg: 'bg-purple-50 dark:bg-purple-950/20', iconBg: 'bg-purple-100 dark:bg-purple-900/40', iconColor: 'text-purple-600 dark:text-purple-400', border: 'border-purple-200/50 dark:border-purple-900/30' },
  amber: { bg: 'bg-amber-50 dark:bg-amber-950/20', iconBg: 'bg-amber-100 dark:bg-amber-900/40', iconColor: 'text-amber-600 dark:text-amber-400', border: 'border-amber-200/50 dark:border-amber-900/30' },
  pink: { bg: 'bg-pink-50 dark:bg-pink-950/20', iconBg: 'bg-pink-100 dark:bg-pink-900/40', iconColor: 'text-pink-600 dark:text-pink-400', border: 'border-pink-200/50 dark:border-pink-900/30' },
  indigo: { bg: 'bg-indigo-50 dark:bg-indigo-950/20', iconBg: 'bg-indigo-100 dark:bg-indigo-900/40', iconColor: 'text-indigo-600 dark:text-indigo-400', border: 'border-indigo-200/50 dark:border-indigo-900/30' },
};

const featureConfig: Record<string, { heading: string; icon: React.ReactNode; desc: string; faqs: { q: string; a: string }[] }> = {
  Calendar: {
    heading: 'Meet Calendar',
    icon: <Calendar className="w-7 h-7" />,
    desc: 'Plan your work on a visual calendar with drag-and-drop scheduling and time-blocking. See all your tasks with due dates automatically placed on the timeline, reschedule by dragging, and switch between daily, weekly and monthly views to stay on top of deadlines.',
    faqs: [
      { q: 'What will Calendar include?', a: 'Calendar brings a full visual timeline for your tasks: drag-and-drop rescheduling, time-blocking for focused work, daily agenda and weekly/monthly overviews, and a clean timeline so you can see exactly what is due when. You will be able to create and edit tasks directly from the calendar.' },
      { q: 'How will it work with my existing tasks and data?', a: 'All your current tasks with due dates will appear automatically on the calendar — no import needed. You can drag any task to a new date or time and the due date updates instantly. Tasks without dates stay in a sidebar ready to be scheduled.' },
      { q: 'When will it be available?', a: 'Calendar is in active development. We are not announcing a fixed launch date, but it is our next major feature. In Development status means core scheduling and drag-and-drop are being built now; we will share updates as we get closer to release.' },
      { q: 'Will I need Pro or Premium to use it?', a: 'Calendar will be a Pro/Premium feature. Free users will see a preview and can upgrade to unlock full scheduling, time-blocking and timeline views.' },
    ],
  },
  Documents: {
    heading: 'Meet Documents',
    icon: <FileText className="w-7 h-7" />,
    desc: 'Create, edit and organize rich documents with inline images, formatting and version history right alongside your tasks. Link any document to tasks, keep everything in one workspace, and pick up where you left off with auto-saved drafts.',
    faqs: [
      { q: 'What will Documents include?', a: 'Documents gives you a rich editor with headings, lists, inline images, tables and code blocks, plus task-linked files, version history and quick search. You can create docs from scratch or turn any task attachment into a living document.' },
      { q: 'How will it work with my existing files and attachments?', a: 'Any file you have attached to a task can be opened and edited as a document, and new documents can be linked to multiple tasks. Your existing attachments remain untouched — Documents adds a richer layer for editing and organizing them.' },
      { q: 'When will it be available?', a: 'Documents is in Development with no fixed release date yet. The editor and file linking are being built first, followed by version history and sharing. We will email Pro/Premium members with Email Notifications enabled when it launches.' },
      { q: 'Will I need Pro or Premium to use it?', a: 'Documents will be available on Pro and Premium. Free users can preview the editor with a sample document and upgrade to create and store unlimited documents.' },
    ],
  },
  Collaboration: {
    heading: 'Meet Collaboration',
    icon: <Users className="w-7 h-7" />,
    desc: 'Invite teammates to shared boards, assign tasks and chat in real time without leaving your workspace. Share a project with one link, see who is working on what, and keep conversations tied to the work itself.',
    faqs: [
      { q: 'What will Collaboration include?', a: 'Collaboration lets you invite teammates via link, share boards and assign tasks, manage seats and permissions, and use real-time team chat. You will see live presence, task assignments and a shared activity feed so everyone stays aligned.' },
      { q: 'How will it work with my existing boards and tasks?', a: 'Any board you already have can be turned into a shared workspace in one click. Your tasks, columns and history stay exactly as they are — sharing simply adds collaborators and permission controls on top.' },
      { q: 'When will it be available?', a: 'Collaboration is in Development and does not have a fixed launch date. Core sharing and chat are being implemented first, then permissions and seat management. Status will stay as In Development until we are ready for beta.' },
      { q: 'Will I need Pro or Premium to use it?', a: 'Basic collaboration with one team is planned for Pro, while unlimited teams and advanced seat management will be Premium. Free users will see a preview of the collaboration workspace.' },
    ],
  },
};

const ComingSoon: React.FC<ComingSoonProps> = ({ title, description, icon, accent = 'blue', preview, faqs }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isFree = !user?.subscriptionTier || user.subscriptionTier === 'free';
  const cfg = featureConfig[title] || { heading: title, icon: icon || <Info className="w-7 h-7" />, desc: description, faqs: faqs || [] };
  const acc = accentMap[accent] || accentMap.blue;
  const displayIcon = cfg.icon;
  const displayDesc = description || cfg.desc;
  const faqItems = cfg.faqs.length ? cfg.faqs : (faqs || []);
  const [learnMoreOpen, setLearnMoreOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [emailEnabled, setEmailEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (isFree) { setEmailEnabled(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/settings', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setEmailEnabled(data.emailNotifs !== false && data.email_notifs !== false);
          return;
        }
      } catch {}
      const local = localStorage.getItem('emailNotifs');
      if (!cancelled) setEmailEnabled(local !== 'false');
    })();
    return () => { cancelled = true; };
  }, [isFree]);

  const heading = cfg.heading;

  return (
    <div className={`w-full rounded-2xl border ${acc.border} bg-card p-8 shadow-sm max-w-xl mx-auto`}>
      <div className="flex flex-col items-center text-center">
        <div className={`w-16 h-16 rounded-2xl ${acc.iconBg} flex items-center justify-center mb-4 ${acc.iconColor}`}>
          {displayIcon}
        </div>
        <h2 className="text-xl font-bold text-foreground">{heading}</h2>
        <p className="text-sm text-muted-foreground mt-3 leading-relaxed max-w-md">{displayDesc}</p>
      </div>

      <div className="mt-6 flex flex-col items-center">
        {isFree ? (
          <button
            onClick={() => navigate('/pricing')}
            className="w-full max-w-sm px-6 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-md shadow-primary/20"
          >
            <Sparkles className="w-4 h-4" /> Upgrade to get notified
          </button>
        ) : emailEnabled === null ? (
          <div className="h-10 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : emailEnabled ? (
          <div className="w-full max-w-sm rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-900/30 px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0">
              <Mail className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300 leading-relaxed">You&apos;re all set — with Email Notifications on, you&apos;ll be automatically notified by email on major updates including this launch.</p>
          </div>
        ) : (
          <button
            onClick={() => navigate('/settings?tab=notifications')}
            className="w-full max-w-sm px-6 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-md shadow-primary/20"
          >
            <Mail className="w-4 h-4" /> Turn on notifications
          </button>
        )}
      </div>

      <div className="mt-6">
        <button
          onClick={() => setLearnMoreOpen(!learnMoreOpen)}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-colors"
        >
          <span className="text-sm font-semibold text-foreground">Learn more about {title}</span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${learnMoreOpen ? 'rotate-180' : ''}`} />
        </button>
        {learnMoreOpen && (
          <div className="mt-3 rounded-xl border border-border bg-card overflow-hidden">
            <div className="divide-y divide-border/50">
              {faqItems.map((faq, i) => (
                <div key={i}>
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                  >
                    <span className="text-xs font-semibold text-foreground pr-2">{faq.q}</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground flex-shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                  </button>
                  {openFaq === i && (
                    <div className="px-4 pb-3">
                      <p className="text-xs text-muted-foreground leading-relaxed">{faq.a}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="px-4 py-2.5 bg-muted/20 border-t border-border">
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5"><Info className="w-3 h-3" /> Status: <span className="font-semibold text-foreground">In Development</span> — no fixed date yet.</p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4">
        <button
          onClick={() => navigate('/support')}
          className="w-full px-4 py-2.5 bg-card border border-border rounded-xl text-sm font-semibold hover:bg-muted transition-colors flex items-center justify-center gap-2"
        >
          <MessageSquare className="w-4 h-4" /> Share feedback
        </button>
      </div>
    </div>
  );
};

export default ComingSoon;
