import React from 'react';
import { Bot, BookOpen, FileText, Send, Sparkles, ChevronRight, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { RESOURCES, WHATS_NEW, QUICK_LINKS } from '@/data/supportContent';

interface SupportContentProps {
  onOpenAi?: () => void;
  onOpenFaqs?: (faqId?: string) => void;
  onOpenResources?: (catId?: string, guideId?: string) => void;
  onOpenSubmit?: () => void;
  onOpenTickets?: () => void;
  showWhatsNew?: boolean;
}

interface CardDef {
  id: 'ai' | 'faqs' | 'resources' | 'submit';
  icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>;
  iconBg: string;
  iconColor: string;
  cardBg: string;
  cardBorder: string;
  glow: string;
  orb: string;
  buttonClass: string;
  title: string;
  description: string;
  buttonLabel: string;
}

const CARDS: CardDef[] = [
  {
    id: 'ai',
    icon: Bot,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
    cardBg: 'bg-gradient-to-br from-blue-50/70 via-card to-card dark:from-blue-950/30 dark:via-card dark:to-card',
    cardBorder: 'border-blue-200/60 dark:border-blue-900/50',
    glow: 'shadow-blue-500/10',
    orb: 'bg-blue-400/25',
    buttonClass: 'bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-600/25',
    title: 'AI Assistant',
    description: 'Get intelligent task suggestions, automated prioritisation, and productivity insights.',
    buttonLabel: 'Open AI Chat',
  },
  {
    id: 'faqs',
    icon: BookOpen,
    iconBg: 'bg-purple-100 dark:bg-purple-900/30',
    iconColor: 'text-purple-600 dark:text-purple-400',
    cardBg: 'bg-gradient-to-br from-purple-50/70 via-card to-card dark:from-purple-950/30 dark:via-card dark:to-card',
    cardBorder: 'border-purple-200/60 dark:border-purple-900/50',
    glow: 'shadow-purple-500/10',
    orb: 'bg-purple-400/25',
    buttonClass: 'bg-purple-600 hover:bg-purple-500 shadow-md shadow-purple-600/25',
    title: 'FAQs',
    description: 'Find answers to common questions.',
    buttonLabel: 'View FAQs',
  },
  {
    id: 'resources',
    icon: FileText,
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
    cardBg: 'bg-gradient-to-br from-green-50/70 via-card to-card dark:from-green-950/30 dark:via-card dark:to-card',
    cardBorder: 'border-green-200/60 dark:border-green-900/50',
    glow: 'shadow-green-500/10',
    orb: 'bg-green-400/25',
    buttonClass: 'bg-green-600 hover:bg-green-500 shadow-md shadow-green-600/25',
    title: 'Resources',
    description: 'How-to guides and walkthroughs for every feature.',
    buttonLabel: 'View Resources',
  },
  {
    id: 'submit',
    icon: Send,
    iconBg: 'bg-orange-100 dark:bg-orange-900/30',
    iconColor: 'text-orange-600 dark:text-orange-400',
    cardBg: 'bg-gradient-to-br from-orange-50/70 via-card to-card dark:from-orange-950/30 dark:via-card dark:to-card',
    cardBorder: 'border-orange-200/60 dark:border-orange-900/50',
    glow: 'shadow-orange-500/10',
    orb: 'bg-orange-400/25',
    buttonClass: 'bg-orange-600 hover:bg-orange-500 shadow-md shadow-orange-600/25',
    title: 'Submit',
    description: 'Submit a suggestion, bug, report, or support request.',
    buttonLabel: 'Submit',
  },
];

const SupportContent: React.FC<SupportContentProps> = ({ onOpenAi, onOpenFaqs, onOpenResources, onOpenSubmit, onOpenTickets, showWhatsNew = true }) => {
  const navigate = useNavigate();

  const openAi = () => { if (onOpenAi) { onOpenAi(); } else { navigate('/ai-chat'); } };
  const openFaqs = (faqId?: string) => {
    if (onOpenFaqs) { onOpenFaqs(faqId); return; }
    navigate(faqId ? `/support?view=faqs&faq=${faqId}` : '/support?view=faqs');
  };
  const openResources = (catId?: string, guideId?: string) => {
    if (onOpenResources) { onOpenResources(catId, guideId); return; }
    const cat = catId && RESOURCES.some(c => c.id === catId) ? catId : 'getting-started';
    const guide = guideId || RESOURCES.find(c => c.id === cat)?.guides[0]?.id || '';
    navigate(`/support?view=resources&cat=${cat}&guide=${guide}`);
  };
  const openSubmit = () => { if (onOpenSubmit) { onOpenSubmit(); } else { navigate('/support?view=submit'); } };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {CARDS.map(card => (
          <div
            key={card.id}
            className={`group relative flex flex-col overflow-hidden rounded-2xl border ${card.cardBorder} ${card.cardBg} p-6 shadow-sm ${card.glow} transition-all duration-300 hover:-translate-y-1 hover:shadow-xl`}
          >
            <div className={`pointer-events-none absolute -top-12 -right-12 w-40 h-40 rounded-full ${card.orb} blur-3xl opacity-50 transition-opacity duration-300 group-hover:opacity-90`} />
            <div className={`w-12 h-12 rounded-2xl ${card.iconBg} ${card.iconColor} flex items-center justify-center mb-4 shadow-md transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6`}>
              <card.icon className="w-6 h-6" strokeWidth={2} />
            </div>
            <h3 className="relative text-base font-bold text-foreground">{card.title}</h3>
            <p className="relative text-xs text-muted-foreground mt-1 mb-6 flex-1 leading-relaxed">{card.description}</p>
            <button
              onClick={() => {
                if (card.id === 'ai') { openAi(); return; }
                if (card.id === 'faqs') { openFaqs(); return; }
                if (card.id === 'resources') { openResources(); return; }
                openSubmit();
              }}
              className={`relative w-full py-2.5 ${card.buttonClass} text-white rounded-xl text-sm font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-1.5`}
            >
              {card.buttonLabel}
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        ))}
      </div>
      {onOpenTickets && (
        <div className="mt-5 flex justify-center">
          <button onClick={onOpenTickets} className="text-sm font-semibold text-primary hover:underline flex items-center gap-1.5">
            View my tickets <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {showWhatsNew && (
        <div className="mt-10">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">What's New</h2>
          </div>
          <div className="space-y-2">
            {WHATS_NEW.map(item => (
              <div key={item.title} className="flex items-start gap-3 rounded-xl border border-border/70 bg-card/60 p-3.5 transition-colors hover:bg-card">
                <span className="mt-0.5 flex-shrink-0 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                  {item.date}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{item.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Quick Help</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {QUICK_LINKS.map(link => (
            <button
              key={link.kind + (link.faqId || link.guideId || '')}
              onClick={() => {
                if (link.kind === 'faq') openFaqs(link.faqId);
                else openResources(link.catId, link.guideId);
              }}
              className="group flex items-center gap-3 rounded-xl border border-border/70 bg-card/60 p-3 text-left transition-all hover:border-primary/30 hover:bg-muted/50"
            >
              <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110 ${
                link.kind === 'faq'
                  ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
                  : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
              }`}>
                {link.kind === 'faq' ? <BookOpen className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
              </span>
              <span className="flex-1 text-xs font-medium text-foreground leading-snug">{link.label}</span>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0 transition-transform group-hover:translate-x-0.5" />
            </button>
          ))}
        </div>
      </div>
    </>
  );
};

export default SupportContent;