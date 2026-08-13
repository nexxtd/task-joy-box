import React, { useState, useEffect } from 'react';
import {
  LifeBuoy, Bot, BookOpen, FileText, Send, X, ChevronRight,
  ChevronDown, ChevronUp, Loader2, CheckCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';
import { FAQS, RESOURCES } from '@/data/supportContent';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type View = 'main' | 'faqs' | 'resources' | 'submit';

const TYPE_TOASTS: Record<string, string> = {
  suggestion: 'Thank you for your suggestion! We really appreciate your feedback.',
  bug: 'Thank you for reporting this bug. Our team will look into it.',
  report: 'Thank you for your report. We will review it shortly.',
  support: 'Thank you for reaching out. A member of our team will get back to you soon.',
};

const FAQsView: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [selected, setSelected] = useState(FAQS[0].id);
  const current = FAQS.find(f => f.id === selected)!;
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-8 h-16 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-primary" />
          </div>
          <h1 className="text-lg font-bold text-foreground">FAQs</h1>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-muted rounded-xl transition-colors">
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-72 border-r border-border overflow-y-auto flex-shrink-0">
          {FAQS.map(faq => (
            <button
              key={faq.id}
              onClick={() => setSelected(faq.id)}
              className={`w-full text-left px-5 py-3.5 text-sm border-b border-border/50 transition-colors flex items-center justify-between gap-2 ${
                selected === faq.id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-foreground hover:bg-muted'
              }`}
            >
              <span className="leading-snug">{faq.question}</span>
              {selected === faq.id && <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-8">
          <h2 className="text-xl font-bold text-foreground mb-4">{current.question}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{current.answer}</p>
        </div>
      </div>
    </div>
  );
};

const ResourcesView: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(['getting-started']));
  const [selectedGuide, setSelectedGuide] = useState<{ catId: string; guideId: string } | null>({
    catId: 'getting-started',
    guideId: 'gs-welcome',
  });

  const toggleCat = (id: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const currentGuide = selectedGuide
    ? RESOURCES.find(c => c.id === selectedGuide.catId)?.guides.find(g => g.id === selectedGuide.guideId)
    : null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-8 h-16 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileText className="w-4 h-4 text-primary" />
          </div>
          <h1 className="text-lg font-bold text-foreground">Resources</h1>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-muted rounded-xl transition-colors">
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-72 border-r border-border overflow-y-auto flex-shrink-0">
          {RESOURCES.map(cat => (
            <div key={cat.id}>
              <button
                onClick={() => toggleCat(cat.id)}
                className="w-full text-left px-5 py-3 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                {cat.label}
                {expandedCats.has(cat.id) ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {expandedCats.has(cat.id) && cat.guides.map(guide => (
                <button
                  key={guide.id}
                  onClick={() => setSelectedGuide({ catId: cat.id, guideId: guide.id })}
                  className={`w-full text-left px-6 py-2.5 text-sm border-b border-border/30 transition-colors flex items-center gap-2 ${
                    selectedGuide?.guideId === guide.id
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  <ChevronRight className="w-3 h-3 flex-shrink-0 opacity-50" />
                  {guide.title}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-8">
          {currentGuide ? (
            <>
              <h2 className="text-xl font-bold text-foreground mb-4">{currentGuide.title}</h2>
              <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {currentGuide.content}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">Select a guide from the left to read it here.</p>
          )}
        </div>
      </div>
    </div>
  );
};

const SubmitView: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [type, setType] = useState('support');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [hasOpenTicket, setHasOpenTicket] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/support/check', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setHasOpenTicket(d.hasOpenTicket))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type, subject: subject.trim(), message: message.trim() }),
      });
      if (res.ok) {
        setSubmitted(true);
        toast({ title: 'Submitted', description: TYPE_TOASTS[type] });
      } else {
        const d = await res.json();
        toast({ title: 'Error', description: d.error || 'Failed to submit', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to submit', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-8 h-16 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Send className="w-4 h-4 text-primary" />
          </div>
          <h1 className="text-lg font-bold text-foreground">Submit a request</h1>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-muted rounded-xl transition-colors">
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-lg mx-auto">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : submitted ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-lg font-bold text-foreground mb-2">Request submitted</h2>
              <p className="text-sm text-muted-foreground">{TYPE_TOASTS[type]}</p>
              <button
                onClick={onClose}
                className="mt-6 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-all"
              >
                Back to Support
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Type</label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="w-full bg-background border border-input rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all h-9">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="suggestion">Suggestion</SelectItem>
                    <SelectItem value="bug">Bug</SelectItem>
                    <SelectItem value="report">Report</SelectItem>
                    <SelectItem value="support">Support</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="Briefly summarise your request"
                  required
                  className="w-full bg-background border border-input rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Message</label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Describe your request in detail…"
                  required
                  rows={6}
                  className="w-full bg-background border border-input rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none"
                />
              </div>
              {hasOpenTicket && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">
                  You already have an open ticket. Please wait for a response before submitting a new one.
                </p>
              )}
              <button
                type="submit"
                disabled={submitting || hasOpenTicket}
                className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : 'Submit'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

const CARDS = [
  {
    id: 'ai',
    icon: Bot,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
    title: 'AI Assistant',
    description: 'Get intelligent task suggestions, automated prioritisation, and productivity insights.',
    buttonLabel: 'Open AI Chat',
  },
  {
    id: 'faqs',
    icon: BookOpen,
    iconBg: 'bg-purple-100 dark:bg-purple-900/30',
    iconColor: 'text-purple-600 dark:text-purple-400',
    title: 'FAQs',
    description: 'Find answers to common questions.',
    buttonLabel: 'View FAQs',
  },
  {
    id: 'resources',
    icon: FileText,
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
    title: 'Resources',
    description: 'How-to guides and walkthroughs for every feature.',
    buttonLabel: 'View Resources',
  },
  {
    id: 'submit',
    icon: Send,
    iconBg: 'bg-orange-100 dark:bg-orange-900/30',
    iconColor: 'text-orange-600 dark:text-orange-400',
    title: 'Submit',
    description: 'Submit a suggestion, bug, report, or support request.',
    buttonLabel: 'Submit',
  },
];

const Support: React.FC = () => {
  const navigate = useNavigate();
  const [view, setView] = useState<View>('main');

  const handleCardClick = (id: string) => {
    if (id === 'ai') { navigate('/ai-chat'); return; }
    setView(id as View);
  };

  if (view === 'faqs') return <FAQsView onClose={() => setView('main')} />;
  if (view === 'resources') return <ResourcesView onClose={() => setView('main')} />;
  if (view === 'submit') return <SubmitView onClose={() => setView('main')} />;

  return (
    <div className="flex-1 overflow-y-auto bg-background/50">
      <header className="px-8 h-16 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10 flex items-center">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <LifeBuoy className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-base font-bold text-foreground">Support</h1>
        </div>
      </header>
      <div className="p-8 max-w-3xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {CARDS.map(card => (
            <div
              key={card.id}
              className="bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group flex flex-col"
            >
              <div className={`w-10 h-10 rounded-xl ${card.iconBg} ${card.iconColor} flex items-center justify-center mb-4 transition-transform group-hover:scale-110`}>
                <card.icon className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-foreground">{card.title}</h3>
              <p className="text-xs text-muted-foreground mt-1 mb-6 flex-1">{card.description}</p>
              <button
                onClick={() => handleCardClick(card.id)}
                className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-all"
              >
                {card.buttonLabel}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Support;
