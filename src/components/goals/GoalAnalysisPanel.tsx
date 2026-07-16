import React from 'react';
import { BarChart3, X } from 'lucide-react';

interface Goal {
  id: number;
  progress: number;
  target: number;
  category: string;
  timeframe: string;
  tags: { id: number }[];
  projectId?: number | null;
}

interface GoalAnalysisPanelProps {
  open: boolean;
  onClose: () => void;
  goals: Goal[];
  loading?: boolean;
}

const GoalAnalysisPanel: React.FC<GoalAnalysisPanelProps> = ({ open, onClose, goals, loading }) => {
  if (!open) return null;

  const completed = goals.filter(g => g.target > 0 && g.progress >= g.target).length;
  const active = goals.length - completed;
  const categories = new Set(goals.map(g => g.category));
  const timeframes = new Set(goals.map(g => g.timeframe));

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div className="absolute inset-0 bg-black/10 pointer-events-auto" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-sm bg-card border-l border-border shadow-[-10px_0_30px_rgba(0,0,0,0.08)] pointer-events-auto flex flex-col">
        <header className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center"><BarChart3 className="w-4 h-4 text-primary" /></div>
            <h3 className="text-sm font-semibold text-foreground">Goal Analysis</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Analyzing goals...
            </div>
          ) : (
            <div className="space-y-4">
              <h4 className="text-base font-semibold text-foreground">Goals Overview</h4>
              <p className="text-sm text-muted-foreground">{goals.length} goals in current view</p>
              <div className="space-y-2">
                {[
                  { text: `${active} active` },
                  { text: `${completed} completed` },
                  { text: `${goals.filter(g => g.tags.length > 0).length} with tags` },
                  { text: `${goals.filter(g => g.projectId).length} with projects` },
                  { text: `${categories.size} categories used` },
                  { text: `${timeframes.size} timeframes used` },
                ].map((line, idx) => (
                  <div key={idx} className="text-sm text-foreground bg-muted/30 rounded-lg px-3 py-2">{line.text}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};

export default GoalAnalysisPanel;
