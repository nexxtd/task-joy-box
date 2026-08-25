import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Info, Check, MessageSquare, Sparkles, Clock, Hammer, ChevronDown } from 'lucide-react';

interface ComingSoonProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  accent?: 'blue' | 'emerald' | 'purple' | 'amber' | 'pink' | 'indigo';
  preview?: string[];
  faqs?: { q: string; a: string }[];
  onNotify?: () => void;
}

const accentMap: Record<string, { bg: string; iconBg: string; iconColor: string; border: string; badge: string; bullet: string; mockup: string; gradient: string }> = {
  blue: { bg: 'bg-blue-50 dark:bg-blue-950/30', iconBg: 'bg-blue-100 dark:bg-blue-900/40', iconColor: 'text-blue-600 dark:text-blue-400', border: 'border-blue-200/60 dark:border-blue-900/40', badge: 'bg-blue-600 text-white', bullet: 'text-blue-600', mockup: 'bg-blue-100 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800', gradient: 'from-blue-50/80 via-card to-card dark:from-blue-950/20' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', iconBg: 'bg-emerald-100 dark:bg-emerald-900/40', iconColor: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200/60 dark:border-emerald-900/40', badge: 'bg-emerald-600 text-white', bullet: 'text-emerald-600', mockup: 'bg-emerald-100 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800', gradient: 'from-emerald-50/80 via-card to-card dark:from-emerald-950/20' },
  purple: { bg: 'bg-purple-50 dark:bg-purple-950/30', iconBg: 'bg-purple-100 dark:bg-purple-900/40', iconColor: 'text-purple-600 dark:text-purple-400', border: 'border-purple-200/60 dark:border-purple-900/40', badge: 'bg-purple-600 text-white', bullet: 'text-purple-600', mockup: 'bg-purple-100 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800', gradient: 'from-purple-50/80 via-card to-card dark:from-purple-950/20' },
  amber: { bg: 'bg-amber-50 dark:bg-amber-950/30', iconBg: 'bg-amber-100 dark:bg-amber-900/40', iconColor: 'text-amber-600 dark:text-amber-400', border: 'border-amber-200/60 dark:border-amber-900/40', badge: 'bg-amber-600 text-white', bullet: 'text-amber-600', mockup: 'bg-amber-100 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800', gradient: 'from-amber-50/80 via-card to-card dark:from-amber-950/20' },
  pink: { bg: 'bg-pink-50 dark:bg-pink-950/30', iconBg: 'bg-pink-100 dark:bg-pink-900/40', iconColor: 'text-pink-600 dark:text-pink-400', border: 'border-pink-200/60 dark:border-pink-900/40', badge: 'bg-pink-600 text-white', bullet: 'text-pink-600', mockup: 'bg-pink-100 dark:bg-pink-900/20 border-pink-200 dark:border-pink-800', gradient: 'from-pink-50/80 via-card to-card dark:from-pink-950/20' },
  indigo: { bg: 'bg-indigo-50 dark:bg-indigo-950/30', iconBg: 'bg-indigo-100 dark:bg-indigo-900/40', iconColor: 'text-indigo-600 dark:text-indigo-400', border: 'border-indigo-200/60 dark:border-indigo-900/40', badge: 'bg-indigo-600 text-white', bullet: 'text-indigo-600', mockup: 'bg-indigo-100 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800', gradient: 'from-indigo-50/80 via-card to-card dark:from-indigo-950/20' },
};

const Mockup: React.FC<{ title: string; accent: string }> = ({ title, accent }) => {
  const acc = accentMap[accent] || accentMap.blue;
  const isCalendar = title.toLowerCase().includes('calendar');
  const isDocument = title.toLowerCase().includes('document');
  return (
    <div className={`rounded-xl border-2 border-dashed ${acc.mockup} overflow-hidden`}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-dashed border-border/40 bg-muted/20">
        <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-muted border text-muted-foreground">Mockup</span>
        <span className="text-[9px] font-medium text-muted-foreground flex items-center gap-1"><Info className="w-3 h-3" /> Not real — preview only</span>
      </div>
      <div className="p-3">
        {isCalendar ? (
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-400" /><div className="w-2 h-2 rounded-full bg-yellow-400" /><div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="ml-auto text-[9px] font-bold text-muted-foreground">Calendar — Illustrative preview</span>
            </div>
            <div className="grid grid-cols-7 gap-1 text-[8px] text-center">
              {['M','T','W','T','F','S','S'].map(d => <div key={d} className="font-bold text-muted-foreground py-1">{d}</div>)}
              {Array.from({length: 21}).map((_,i) => (
                <div key={i} className={`h-6 rounded-md flex items-center justify-center text-[9px] ${i===5 ? 'bg-primary text-primary-foreground font-bold' : i===8 ? `${acc.iconBg} ${acc.iconColor} font-semibold` : 'bg-muted/50 border border-dashed border-border/30'}`}>{i+1}</div>
              ))}
            </div>
            <div className="flex gap-1">
              <div className={`h-5 flex-1 rounded-md border border-dashed ${acc.iconBg} flex items-center justify-center text-[8px] font-bold ${acc.iconColor}`}>Time-block</div>
              <div className="h-5 flex-1 rounded-md bg-muted border border-dashed flex items-center justify-center text-[8px] text-muted-foreground">Drag & drop</div>
            </div>
          </div>
        ) : isDocument ? (
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-400" /><div className="w-2 h-2 rounded-full bg-yellow-400" /><div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="ml-auto text-[9px] font-bold text-muted-foreground">Document — Illustrative preview</span>
            </div>
            <div className="space-y-1.5 p-2 rounded-lg bg-card border border-dashed">
              <div className="h-2 w-3/4 rounded bg-foreground/10" /><div className="h-1.5 w-full rounded bg-muted border border-dashed" /><div className="h-1.5 w-5/6 rounded bg-muted border border-dashed" />
              <div className="flex gap-1 pt-1">
                <div className={`w-6 h-6 rounded border border-dashed ${acc.iconBg} flex items-center justify-center text-[10px]`}>🖼️</div>
                <div className="flex-1 space-y-1"><div className="h-1.5 w-full rounded bg-muted border border-dashed" /><div className="h-1.5 w-4/5 rounded bg-muted border border-dashed" /></div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-400" /><div className="w-2 h-2 rounded-full bg-yellow-400" /><div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="ml-auto text-[9px] font-bold text-muted-foreground">Collaboration — Illustrative preview</span>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 space-y-1.5 p-2 rounded-lg bg-card border border-dashed">
                <div className="flex -space-x-1">{['#60a5fa','#34d399','#fbbf24'].map(c => <div key={c} className="w-6 h-6 rounded-full border-2 border-card flex items-center justify-center text-[8px] font-bold text-white" style={{background:c}}>A</div>)}</div>
                <div className={`h-6 rounded-lg border border-dashed ${acc.iconBg} flex items-center justify-center text-[9px] font-bold ${acc.iconColor}`}>💬 Real-time chat</div>
                <div className="h-2 w-full rounded bg-muted border border-dashed" /><div className="h-2 w-3/4 rounded bg-muted border border-dashed" />
              </div>
              <div className="w-20 p-2 rounded-lg bg-muted/30 border border-dashed space-y-1"><div className="h-6 rounded bg-muted border border-dashed" /><div className="h-6 rounded bg-muted border border-dashed" /></div>
            </div>
          </div>
        )}
        <p className="text-[9px] text-center text-muted-foreground mt-2 leading-relaxed">* Visual mockup only — not functional, for illustration purposes</p>
      </div>
    </div>
  );
};

const ComingSoon: React.FC<ComingSoonProps> = ({ title, description, icon, accent = 'blue', preview, faqs, onNotify }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isFree = !user?.subscriptionTier || user.subscriptionTier === 'free';
  const acc = accentMap[accent] || accentMap.blue;
  const storageKey = `comingsoon_notified_${title.toLowerCase().replace(/\s+/g,'_')}`;
  const [notified, setNotified] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey) === 'true' || !isFree) {
        setNotified(true);
      }
    } catch {}
  }, [storageKey, isFree]);

  const handleNotify = () => {
    if (onNotify) { onNotify(); return; }
    try { localStorage.setItem(storageKey, 'true'); } catch {}
    setNotified(true);
    window.location.href = '/pricing';
  };

  const handleFeedback = () => navigate('/support');

  const defaultPreview: Record<string, string[]> = {
    Calendar: ['Drag-and-drop task scheduling', 'Time-blocking & daily timeline', 'Weekly & monthly views', 'Auto-sync with your existing tasks'],
    Documents: ['Rich text editing with inline images', 'Task-linked files & version history', 'Import Word / PDF / Markdown', 'Collaborative sharing'],
    Collaboration: ['Invite teammates via link', 'Share boards & assign tasks', 'Real-time team chat', 'Manage seats & permissions'],
  };
  const defaultFaqs: Record<string, {q:string,a:string}[]> = {
    Calendar: [
      { q: 'Will this be free?', a: 'Calendar will be available on Pro & Premium. Free users can preview but need upgrade to schedule.' },
      { q: 'Will my existing tasks show up automatically?', a: 'Yes — all tasks with due dates appear instantly; you can drag them to reschedule.' },
      { q: 'Can I sync external calendars?', a: 'Google Calendar sync is planned for v2, starting with one-way import.' },
    ],
    Documents: [
      { q: 'Will this be free?', a: 'Documents is Pro/Premium. Free users get 1 sample doc and upgrade prompt.' },
      { q: 'Will my existing task attachments show up?', a: 'Yes — any file attached to a task can be opened as a document.' },
      { q: 'Can I export documents?', a: 'Yes — export to PDF, Markdown and Word is included at launch.' },
    ],
    Collaboration: [
      { q: 'Will this be free?', a: 'Basic collaboration (1 team) is Pro; unlimited teams & seats is Premium.' },
      { q: 'Will my existing boards be shareable?', a: 'Yes — turn any board into a shared workspace in one click.' },
      { q: 'Is chat real-time?', a: 'Yes — team chat updates live without refresh.' },
    ],
  };

  const previewItems = preview || defaultPreview[title] || defaultPreview['Calendar'];
  const faqItems = faqs || defaultFaqs[title] || defaultFaqs['Calendar'];

  return (
    <div className={`w-full rounded-2xl border ${acc.border} bg-gradient-to-br ${acc.gradient} p-6 shadow-sm`}>
      <div className="flex flex-col items-center text-center">
        <div className="flex items-center gap-2 mb-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${acc.badge}`}>
            <Hammer className="w-3 h-3" /> In Development
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border">
            <Clock className="w-3 h-3" /> Coming soon
          </span>
        </div>
        <div className={`w-14 h-14 rounded-2xl ${acc.iconBg} flex items-center justify-center mb-3 shadow-sm`}>
          {icon || <Info className={`w-7 h-7 ${acc.iconColor}`} />}
        </div>
        <h3 className="text-base font-bold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-md leading-relaxed">{description}</p>
      </div>

      <div className="mt-5">
        <Mockup title={title} accent={accent} />
      </div>

      <div className="mt-5">
        <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5 mb-2"><Sparkles className={`w-3.5 h-3.5 ${acc.iconColor}`} /> What you’ll be able to do</h4>
        <ul className="space-y-1.5">
          {previewItems.slice(0,4).map((item,i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-foreground/90">
              <Check className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${acc.bullet}`} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5 p-3 rounded-xl bg-card border border-border">
        {notified ? (
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
              <Check className="w-3.5 h-3.5" />
            </div>
            <span>{isFree ? "You're on the list — we'll notify you by email when it launches!" : "You're covered — Pro/Premium members are auto-notified by email on launch."}</span>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-2">
              Coming soon! <span className="font-semibold text-foreground">Upgrade to Pro or Premium</span> to get early access and automatic email notifications on major updates.
            </p>
            <button
              onClick={handleNotify}
              className="w-full px-4 py-2 text-xs font-bold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" /> Upgrade to get notified
            </button>
          </>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={handleFeedback}
          className="flex-1 px-3 py-2 text-xs font-semibold bg-card border border-border rounded-lg hover:bg-muted flex items-center justify-center gap-1.5"
        >
          <MessageSquare className="w-3.5 h-3.5" /> Share your feedback
        </button>
      </div>

      {faqItems && faqItems.length > 0 && (
        <div className="mt-5">
          <h4 className="text-xs font-bold text-foreground mb-2">Quick answers</h4>
          <div className="space-y-1.5">
            {faqItems.slice(0,3).map((faq,i) => (
              <div key={i} className="border border-border rounded-lg bg-card overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-left"
                >
                  <span className="text-xs font-medium text-foreground pr-2">{faq.q}</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground flex-shrink-0 transition-transform ${openFaq===i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq===i && (
                  <div className="px-3 pb-2.5">
                    <p className="text-xs text-muted-foreground leading-relaxed border-t border-border pt-2">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ComingSoon;
