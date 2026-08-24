import React, { useState } from 'react';
import { X, Target, Trash2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface SubGoal { id: string; title: string; completed: boolean; }
interface Project { id: number; name: string; color: string; }

interface GoalCreateModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    title: string; description: string; target: number; unit: string;
    timeframe: string; category: string; subGoals: SubGoal[];
    projectId: string; color: string;
  }) => Promise<void>;
  projects: Project[];
  goalColors: string[];
  goalCategories: string[];
}

const TIMEFRAME_LABELS: Record<string, string> = {
  '1week': '1 Week', '1month': '1 Month', '3months': '3 Months',
  '6months': '6 Months', '1year': '1 Year',
};

const GoalCreateModal: React.FC<GoalCreateModalProps> = ({
  open, onClose, onSave, projects, goalColors, goalCategories
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [target, setTarget] = useState(10);
  const [unit, setUnit] = useState('tasks');
  const [timeframe, setTimeframe] = useState('1month');
  const [category, setCategory] = useState('Personal');
  const [subGoals, setSubGoals] = useState<SubGoal[]>([]);
  const [subGoalTitle, setSubGoalTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [color, setColor] = useState(goalColors[0]);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const reset = () => {
    setTitle(''); setDescription(''); setTarget(10); setUnit('tasks');
    setTimeframe('1month'); setCategory('Personal'); setSubGoals([]);
    setSubGoalTitle(''); setProjectId(''); setColor(goalColors[0]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ title, description, target, unit, timeframe, category, subGoals, projectId, color });
      reset();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-8" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <div className="relative w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Target className="w-5 h-5 text-primary" /></div>
            <div><h3 className="text-base font-bold text-foreground">Set a New Milestone</h3><p className="text-xs text-muted-foreground">Define what you want to achieve and track your progress.</p></div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <div className="p-5 space-y-5">
          <div className="flex gap-2">
            {goalColors.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full border-2 transition-all ${color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Goal Title</label>
                <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Master React, Read 10 Books..."
                  className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 font-medium" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Context / Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Why is this goal important?"
                  className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" rows={2} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Category</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground h-9">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {goalCategories.map(cat => (<SelectItem key={cat} value={cat}>{cat}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Project</label>
                <Select value={projectId || 'none'} onValueChange={v => setProjectId(v === 'none' ? '' : v)}>
                  <SelectTrigger className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground h-9">
                    <SelectValue placeholder="My Goals" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">My Goals</SelectItem>
                    {projects.map(p => (<SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">How many?</label>
                  <input type="number" value={target} onChange={e => setTarget(parseInt(e.target.value) || 1)}
                    className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Unit</label>
                  <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="tasks, hours, pages..."
                    className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Deadline</label>
                  <Select value={timeframe} onValueChange={setTimeframe}>
                    <SelectTrigger className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground h-9">
                      <SelectValue placeholder="Select timeframe" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TIMEFRAME_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Sub-goals</label>
                <div className="space-y-1">
                  {subGoals.map((sg, i) => (
                    <div key={sg.id} className="flex items-center gap-2 text-xs bg-muted/30 border border-border rounded-lg px-3 py-1.5 group">
                      <input type="checkbox" checked={sg.completed} onChange={() => { const next = [...subGoals]; next[i] = { ...sg, completed: !sg.completed }; setSubGoals(next); }} className="rounded" />
                      <span className="flex-1 text-foreground">{sg.title}</span>
                      <button onClick={() => setSubGoals(subGoals.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <input value={subGoalTitle} onChange={e => setSubGoalTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (subGoalTitle.trim()) { setSubGoals([...subGoals, { id: crypto.randomUUID(), title: subGoalTitle.trim(), completed: false }]); setSubGoalTitle(''); } } }}
                      placeholder="Add a sub-goal..." className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20" />
                    <button onClick={() => { if (subGoalTitle.trim()) { setSubGoals([...subGoals, { id: crypto.randomUUID(), title: subGoalTitle.trim(), completed: false }]); setSubGoalTitle(''); } }} className="px-3 py-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 text-xs font-bold">Add</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all">Discard</button>
            <button onClick={handleSave} disabled={saving || !title.trim()}
              className="px-8 py-2.5 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 active:scale-95">
              Create Goal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GoalCreateModal;
