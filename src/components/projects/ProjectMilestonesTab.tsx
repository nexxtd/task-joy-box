import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Edit3,
  Flag,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { CircleToggle } from '@/components/ToggleComponents';
import { dateLocale } from '@/i18n/format';

export interface MilestoneItem {
  id: number;
  name: string;
  date: string;
  description?: string;
  completed?: boolean;
}

interface ProjectMilestonesTabProps {
  projectName: string;
  canEdit: boolean;
  milestones: MilestoneItem[];
  onCreateMilestone: (payload: { name: string; date: string; description: string }) => Promise<void>;
  onUpdateMilestone: (id: number, payload: { name: string; date: string; description: string }) => Promise<void>;
  onToggleMilestone: (milestone: MilestoneItem) => Promise<void>;
  onDeleteMilestone: (milestoneId: number) => Promise<void>;
}

function getDaysDelta(dateStr: string): number {
  if (!dateStr) return 0;
  const target = new Date(`${dateStr}T23:59:59`);
  if (Number.isNaN(target.getTime())) return 0;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

export const ProjectMilestonesTab: React.FC<ProjectMilestonesTabProps> = ({
  projectName,
  canEdit,
  milestones,
  onCreateMilestone,
  onUpdateMilestone,
  onToggleMilestone,
  onDeleteMilestone,
}) => {
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'overdue'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const saving = false;

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const savingEdit = false;

  const stats = useMemo(() => {
    const total = milestones.length;
    const completed = milestones.filter(m => Boolean(m.completed)).length;
    const active = total - completed;
    const overdueList = milestones.filter(m => !m.completed && getDaysDelta(m.date) < 0);
    const upcomingList = milestones
      .filter(m => !m.completed && getDaysDelta(m.date) >= 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const nextMilestone = upcomingList[0] || null;
    const nextDaysLeft = nextMilestone ? getDaysDelta(nextMilestone.date) : null;

    return {
      total,
      completed,
      active,
      overdueCount: overdueList.length,
      upcomingCount: upcomingList.length,
      completionRate,
      nextMilestone,
      nextDaysLeft,
    };
  }, [milestones]);

  const sortedAndFiltered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...milestones]
      .filter(m => {
        const isDone = Boolean(m.completed);
        const isOverdue = !isDone && getDaysDelta(m.date) < 0;
        if (filter === 'active' && isDone) return false;
        if (filter === 'completed' && !isDone) return false;
        if (filter === 'overdue' && !isOverdue) return false;
        if (!q) return true;
        return (
          m.name.toLowerCase().includes(q) ||
          (m.description || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const aDone = a.completed ? 1 : 0;
        const bDone = b.completed ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;
        return (a.date || '').localeCompare(b.date || '');
      });
  }, [milestones, filter, searchQuery]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newDate) return;
    // Close instantly; the parent adds the milestone optimistically.
    void onCreateMilestone({
      name: newName.trim(),
      date: newDate,
      description: newDescription.trim(),
    });
    setNewName('');
    setNewDate('');
    setNewDescription('');
    setCreateOpen(false);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId === null || !editName.trim() || !editDate) return;
    void onUpdateMilestone(editingId, {
      name: editName.trim(),
      date: editDate,
      description: editDescription.trim(),
    });
    setEditingId(null);
  };

  // SVG Ring math
  const ringRadius = 36;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - stats.completionRate / 100);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Top Visuals & Insights Dashboard */}
      <div className="rounded-3xl border border-border bg-gradient-to-br from-card via-card to-primary/5 p-5 sm:p-6 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Animated Completion Progress Ring */}
            <div className="relative w-24 h-24 flex items-center justify-center flex-shrink-0">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 88 88">
                <circle
                  cx="44"
                  cy="44"
                  r={ringRadius}
                  strokeWidth="8"
                  className="fill-none stroke-muted/60"
                />
                <circle
                  cx="44"
                  cy="44"
                  r={ringRadius}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                  className="fill-none stroke-primary transition-all duration-700 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-black text-foreground leading-none">{stats.completionRate}%</span>
                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mt-0.5">
                  Done
                </span>
              </div>
            </div>

            <div>
              <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary mb-1">
                <Flag className="w-3.5 h-3.5" />
                Milestones & Roadmap Insights
              </div>
              <h2 className="text-xl font-black text-foreground">{projectName} Milestones</h2>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-lg">
                {stats.total === 0
                  ? 'Set clear checkpoints with target dates to track delivery momentum.'
                  : stats.completed === stats.total
                    ? 'All milestones reached! Add the next target phase or review outcomes.'
                    : stats.nextMilestone
                      ? `Next target: "${stats.nextMilestone.name}" ${
                          stats.nextDaysLeft === 0
                            ? 'due today'
                            : stats.nextDaysLeft === 1
                              ? 'due tomorrow'
                              : `in ${stats.nextDaysLeft} days`
                        }.`
                      : `${stats.overdueCount} milestone${stats.overdueCount === 1 ? '' : 's'} past due — review timeline or complete them below.`}
              </p>
            </div>
          </div>

          {canEdit && (
            <button
              type="button"
              onClick={() => setCreateOpen(v => !v)}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary text-primary-foreground px-4 py-2.5 text-xs font-bold shadow-md shadow-primary/20 hover:bg-primary/90 hover:scale-[1.01] active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" />
              New Milestone
            </button>
          )}
        </div>

        {/* Stat Insights Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-border/80 bg-background/85 p-3.5 transition-all hover:border-emerald-500/40">
            <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
              <span>Completed</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-black text-foreground mt-1">{stats.completed}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">of {stats.total} milestones</p>
          </div>

          <div className="rounded-2xl border border-border/80 bg-background/85 p-3.5 transition-all hover:border-blue-500/40">
            <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
              <span>Upcoming</span>
              <Clock className="w-4 h-4 text-blue-500" />
            </div>
            <p className="text-2xl font-black text-foreground mt-1">{stats.upcomingCount}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Scheduled ahead</p>
          </div>

          <div className={`rounded-2xl border p-3.5 transition-all ${
            stats.overdueCount > 0
              ? 'border-rose-500/35 bg-rose-500/5'
              : 'border-border/80 bg-background/85'
          }`}>
            <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
              <span>Overdue</span>
              <AlertTriangle className={`w-4 h-4 ${stats.overdueCount > 0 ? 'text-rose-500 animate-pulse' : 'text-muted-foreground'}`} />
            </div>
            <p className={`text-2xl font-black mt-1 ${stats.overdueCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-foreground'}`}>
              {stats.overdueCount}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {stats.overdueCount > 0 ? 'Needs attention' : 'On track'}
            </p>
          </div>

          {/* Segmented Timeline Breakdown */}
          <div className="rounded-2xl border border-border/80 bg-background/85 p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
              <span>Health Mix</span>
              <TrendingUp className="w-4 h-4 text-primary" />
            </div>
            <div className="space-y-1.5 my-1">
              <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden flex">
                {stats.total > 0 && (
                  <>
                    <div
                      className="h-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${(stats.completed / stats.total) * 100}%` }}
                      title={`Completed: ${stats.completed}`}
                    />
                    <div
                      className="h-full bg-blue-500 transition-all duration-500"
                      style={{ width: `${(stats.upcomingCount / stats.total) * 100}%` }}
                      title={`Upcoming: ${stats.upcomingCount}`}
                    />
                    <div
                      className="h-full bg-rose-500 transition-all duration-500"
                      style={{ width: `${(stats.overdueCount / stats.total) * 100}%` }}
                      title={`Overdue: ${stats.overdueCount}`}
                    />
                  </>
                )}
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Done {stats.completed}</span>
                <span className="text-blue-600 dark:text-blue-400 font-semibold">Next {stats.upcomingCount}</span>
                <span className="text-rose-600 dark:text-rose-400 font-semibold">Late {stats.overdueCount}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Inline Create Milestone Card */}
      {createOpen && canEdit && (
        <form
          onSubmit={handleCreate}
          className="rounded-2xl border border-primary/35 bg-card p-5 shadow-md space-y-3 animate-fade-in"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-foreground flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-primary" />
              Create Milestone
            </h3>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Milestone Title *
              </label>
              <input
                type="text"
                autoFocus
                required
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Public Beta Launch, Design Sign-off…"
                className="w-full mt-1 bg-background border border-border rounded-xl px-3.5 py-2 text-xs text-foreground outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Target Date *
              </label>
              <input
                type="date"
                required
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
                className="w-full mt-1 bg-background border border-border rounded-xl px-3.5 py-2 text-xs text-foreground outline-none focus:border-primary"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Description & Success Criteria
            </label>
            <textarea
              rows={2}
              value={newDescription}
              onChange={e => setNewDescription(e.target.value)}
              placeholder="What does achieving this milestone unlock?"
              className="w-full mt-1 bg-background border border-border rounded-xl px-3.5 py-2 text-xs text-foreground outline-none focus:border-primary resize-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="px-4 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newName.trim() || !newDate || saving}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Create Milestone
            </button>
          </div>
        </form>
      )}

      {/* Search & Filter Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search milestones…"
            className="w-full bg-card border border-border rounded-2xl pl-9 pr-3.5 py-2 text-xs text-foreground outline-none focus:border-primary"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {([
            { id: 'all', label: `All (${stats.total})` },
            { id: 'active', label: `Active (${stats.active})` },
            { id: 'completed', label: `Completed (${stats.completed})` },
            { id: 'overdue', label: `Overdue (${stats.overdueCount})` },
          ] as const).map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFilter(opt.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                filter === opt.id
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Milestone Timeline Cards */}
      <div className="space-y-2.5">
        {sortedAndFiltered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center space-y-2.5">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <Flag className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-foreground">
              {stats.total === 0 ? 'No milestones created yet' : 'No milestones match your filters'}
            </p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {stats.total === 0
                ? 'Break your project roadmap into concrete milestones to visualize delivery progress.'
                : 'Try adjusting your search or filter selection.'}
            </p>
            {canEdit && stats.total === 0 && (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90"
              >
                <Plus className="w-3.5 h-3.5" /> Add First Milestone
              </button>
            )}
          </div>
        ) : (
          sortedAndFiltered.map(milestone => {
            const isDone = Boolean(milestone.completed);
            const delta = getDaysDelta(milestone.date);
            const isOverdue = !isDone && delta < 0;
            const isEditing = editingId === milestone.id;

            const statusBadge = isDone
              ? { label: 'Completed', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' }
              : delta < 0
                ? { label: `${Math.abs(delta)}d overdue`, cls: 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400' }
                : delta === 0
                  ? { label: 'Due today', cls: 'border-amber-500/35 bg-amber-500/10 text-amber-600 dark:text-amber-400' }
                  : delta <= 7
                    ? { label: `In ${delta}d`, cls: 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400' }
                    : { label: `In ${delta}d`, cls: 'border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-400' };

            return (
              <div
                key={milestone.id}
                className={`group rounded-2xl border p-4 transition-all duration-200 ${
                  isDone
                    ? 'border-emerald-500/25 bg-emerald-500/[0.03] opacity-85'
                    : isOverdue
                      ? 'border-rose-500/30 bg-rose-500/[0.03] shadow-xs'
                      : 'border-border bg-card hover:border-primary/35 hover:shadow-sm'
                }`}
              >
                {isEditing ? (
                  <form onSubmit={handleSaveEdit} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <input
                        type="text"
                        required
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="sm:col-span-2 bg-background border border-primary/40 rounded-xl px-3 py-2 text-xs font-bold text-foreground outline-none"
                      />
                      <input
                        type="date"
                        required
                        value={editDate}
                        onChange={e => setEditDate(e.target.value)}
                        className="bg-background border border-primary/40 rounded-xl px-3 py-2 text-xs text-foreground outline-none"
                      />
                    </div>
                    <textarea
                      rows={2}
                      value={editDescription}
                      onChange={e => setEditDescription(e.target.value)}
                      placeholder="Milestone description…"
                      className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground outline-none resize-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={savingEdit}
                        className="px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-50"
                      >
                        {savingEdit ? 'Saving…' : 'Save Changes'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                      <div className={`pt-0.5 flex-shrink-0 ${!canEdit ? 'opacity-60 pointer-events-none' : ''}`}>
                        <CircleToggle
                          completed={isDone}
                          onClick={() => { if (canEdit) void onToggleMilestone(milestone); }}
                          size="lg"
                          title={isDone ? 'Mark milestone incomplete' : 'Mark milestone complete'}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4
                            className={`text-sm font-bold transition-colors ${
                              isDone ? 'line-through text-muted-foreground' : 'text-foreground'
                            }`}
                          >
                            {milestone.name}
                          </h4>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${statusBadge.cls}`}>
                            {statusBadge.label}
                          </span>
                        </div>
                        {milestone.description && (
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed whitespace-pre-wrap">
                            {milestone.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(`${milestone.date}T00:00:00`).toLocaleDateString(dateLocale(), {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {canEdit && (
                      <div className="flex items-center gap-1 flex-shrink-0 opacity-90 sm:opacity-60 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(milestone.id);
                            setEditName(milestone.name);
                            setEditDate(milestone.date);
                            setEditDescription(milestone.description || '');
                          }}
                          className="p-2 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                          title="Edit milestone"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Delete milestone "${milestone.name}"?`)) {
                              void onDeleteMilestone(milestone.id);
                            }
                          }}
                          className="p-2 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Delete milestone"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ProjectMilestonesTab;
