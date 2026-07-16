import React from 'react';
import { Pin, Tag, Trash2, Target } from 'lucide-react';

interface GoalTag { id: number; name: string; color: string; }
interface Goal {
  id: number; title: string; description: string;
  progress: number; target: number; unit: string;
  color: string; category: string; timeframe: string;
  projectId?: number | null; tags: GoalTag[]; pinned: boolean;
  status: string;
}

interface GoalRowProps {
  goal: Goal;
  projects: { id: number; name: string; color: string }[];
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onProgressChange: (delta: number) => void;
}

const TIMEFRAME_LABELS: Record<string, string> = {
  '1week': '1 Week', '1month': '1 Month', '3months': '3 Months',
  '6months': '6 Months', '1year': '1 Year',
};

const GoalRow: React.FC<GoalRowProps> = ({ goal, projects, onEdit, onDelete, onTogglePin, onProgressChange }) => {
  const pct = goal.target > 0 ? Math.round((goal.progress / goal.target) * 100) : 0;
  const proj = goal.projectId ? projects.find(p => p.id === goal.projectId) : null;

  return (
    <div className="group border rounded-xl bg-card transition-all duration-200 cursor-pointer border-border hover:border-border/80 hover:shadow-sm animate-fade-in" onClick={onEdit}>
      <div className="flex items-center gap-1 px-3 py-3">
        <button
          onClick={e => { e.stopPropagation(); onTogglePin(); }}
          className={`p-1.5 rounded-md flex-shrink-0 transition-all ${goal.pinned ? 'text-primary' : 'text-muted-foreground/30 hover:text-muted-foreground'}`}
          title={goal.pinned ? 'Unpin goal' : 'Pin goal'}
        >
          <Pin className={`w-3.5 h-3.5 ${goal.pinned ? 'fill-current' : ''}`} />
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-left text-foreground truncate">{goal.title}</span>
          {goal.tags?.length > 0 && <Tag className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
          {goal.tags?.map(tag => (
            <span key={tag.id} className="text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 text-white" style={{ backgroundColor: tag.color }}>
              {tag.name}
            </span>
          ))}
          <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase flex-shrink-0">{TIMEFRAME_LABELS[goal.timeframe] || goal.timeframe}</span>
          <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full flex-shrink-0">{goal.category}</span>
          {proj && (
            <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-border/60 text-muted-foreground flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: proj.color }} />{proj.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="w-24 hidden sm:block">
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${pct}%`, backgroundColor: goal.color }} />
            </div>
            <p className="text-[8px] text-muted-foreground mt-0.5 text-right">{goal.progress}/{goal.target} {goal.unit}</p>
          </div>
          <span className="text-sm font-bold text-foreground min-w-[40px] text-right">{pct}%</span>
          <div className="flex items-center gap-0.5">
            <button onClick={e => { e.stopPropagation(); onProgressChange(-1); }} className="w-6 h-6 rounded-md bg-muted hover:bg-muted/80 text-foreground text-xs font-bold flex items-center justify-center transition-colors">−</button>
            <button onClick={e => { e.stopPropagation(); onProgressChange(1); }} className="w-6 h-6 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold flex items-center justify-center transition-colors">+</button>
          </div>
          <button onClick={e => { e.stopPropagation(); onDelete(); }} className="p-1.5 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default GoalRow;
