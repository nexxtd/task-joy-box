import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronsLeft,
  MessageSquare,
  Send,
  Settings2,
  Trash2,
  Users,
  X,
  Loader2,
  CheckCircle2,
  Compass,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { dateLocale } from '@/i18n/format';
import { Priority, Task, TaskActivity } from '@/types/board';
import { toast } from '@/hooks/use-toast';

interface ProjectMemberCandidate {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface TaskSideViewPanelProps {
  kind: 'task' | 'note';
  task: Task;
  open: boolean;
  onHide: () => void;
  onCloseSide: () => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  activityEntries: TaskActivity[];
}

export const TaskSideViewPanel: React.FC<TaskSideViewPanelProps> = ({
  kind,
  task,
  open,
  onHide,
  onCloseSide,
  onUpdateTask,
  activityEntries,
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [activityCollapsed, setActivityCollapsed] = useState(false);
  const [commentsCollapsed, setCommentsCollapsed] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');

  // Project "Apply to other users" state (strictly visible ONLY when Boolean(task.projectId))
  const [applyUsersOpen, setApplyUsersOpen] = useState(false);
  const [projectMembers, setProjectMembers] = useState<ProjectMemberCandidate[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<number[]>([]);
  const [applyingToUsers, setApplyingToUsers] = useState(false);

  useEffect(() => {
    setApplyUsersOpen(false);
    setSelectedRecipientIds([]);
    if (!task.projectId) {
      setProjectMembers([]);
      return;
    }
    let cancelled = false;
    setLoadingMembers(true);
    fetch(`/api/projects/${task.projectId}`, { credentials: 'include' })
      .then(async res => (res.ok ? res.json() : null))
      .then(data => {
        if (cancelled) return;
        const raw = data?.project?.members || data?.members || [];
        const others = Array.isArray(raw)
          ? raw.filter((m: any) => Number(m.id) !== Number(user?.id))
          : [];
        setProjectMembers(others);
      })
      .catch(() => {
        if (!cancelled) setProjectMembers([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingMembers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [task.id, task.projectId, user?.id]);

  const addComment = () => {
    if (!newCommentText.trim()) return;
    onUpdateTask(task.id, {
      comments: [
        ...(task.comments || []),
        {
          id: crypto.randomUUID(),
          text: newCommentText.trim(),
          createdAt: new Date().toISOString(),
        },
      ],
    });
    setNewCommentText('');
  };

  const deleteComment = (commentId: string) => {
    onUpdateTask(task.id, {
      comments: (task.comments || []).filter(c => c.id !== commentId),
    });
  };

  const updateComment = (commentId: string, text: string) => {
    onUpdateTask(task.id, {
      comments: (task.comments || []).map(c =>
        c.id === commentId ? { ...c, text } : c,
      ),
    });
  };

  const handleApplyToUsers = async () => {
    if (!task.projectId || selectedRecipientIds.length === 0 || applyingToUsers) return;
    setApplyingToUsers(true);
    try {
      const res = await fetch(`/api/projects/${task.projectId}/apply-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          kind,
          targetUserIds: selectedRecipientIds,
          item: {
            id: task.id,
            title: task.title,
            description: task.description,
            priority: task.priority,
            status: task.status,
            columnId: task.columnId,
            duration: task.duration,
            startDate: task.startDate,
            startTime: task.startTime,
            dueDate: task.dueDate,
            dueTime: task.dueTime,
            labels: task.labels,
            subtasks: task.subtasks,
            checklists: task.checklists,
            comments: task.comments,
            activityLog: task.activityLog,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast({
          title: `Applied ${kind} to ${data.appliedCount || selectedRecipientIds.length} member(s)`,
          description: `Recipients will find this ${kind} on their project board and in notifications.`,
        });
        setApplyUsersOpen(false);
        setSelectedRecipientIds([]);
      } else {
        toast({
          title: 'Failed to apply',
          description: data.error || 'Could not apply to selected users.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Network error',
        description: 'Could not reach server to apply this item.',
        variant: 'destructive',
      });
    } finally {
      setApplyingToUsers(false);
    }
  };

  return (
    <aside
      aria-hidden={!open}
      className={`relative bg-card border-border rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ease-in-out flex flex-col ${
        open
          ? 'w-full lg:w-96 opacity-100 border lg:max-h-[92vh]'
          : 'w-0 h-0 lg:w-0 opacity-0 border-0 pointer-events-none'
      }`}
    >
      {/* Top Side-View Header with Hide/Collapse left and Close buttons */}
      <div className="px-4 py-3.5 border-b border-border flex items-center justify-between gap-2 sticky top-0 bg-card z-10 flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Settings2 className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">
              {kind === 'note' ? 'Note Settings' : 'Task Settings'}
            </h3>
            <p className="text-[11px] text-muted-foreground truncate">
              Controls, comments & activity
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={onHide}
            title="Collapse side panel"
            aria-label="Hide side panel"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onCloseSide}
            title="Close side panel"
            aria-label="Close side panel"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="p-4 space-y-5 overflow-y-auto flex-1 min-h-0">
        {/* Settings Controls Section */}
        <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Quick Settings
            </span>
            <button
              type="button"
              onClick={() => onUpdateTask(task.id, { completed: !task.completed })}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${
                task.completed
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              <CheckCircle2 className="w-3 h-3" />
              {task.completed ? 'Completed' : 'Mark Complete'}
            </button>
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground block">Priority</span>
            <div className="flex flex-wrap gap-1">
              {(['urgent', 'high', 'medium', 'low', 'none'] as Priority[]).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onUpdateTask(task.id, { priority: p })}
                  className={`px-2 py-1 rounded-lg text-[11px] font-semibold capitalize border transition-all ${
                    task.priority === p
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate(`/templates?type=${kind}&applyTo=${encodeURIComponent(task.id)}`)}
            className="w-full py-2 px-3 rounded-xl border border-border bg-card hover:bg-muted text-xs font-semibold text-foreground flex items-center justify-center gap-1.5 transition-colors"
          >
            <Compass className="w-3.5 h-3.5 text-primary" />
            Browse Templates to Apply
          </button>
        </div>

        {/* Apply to Other Users — ONLY when inside a project */}
        {Boolean(task.projectId) && (
          <div className="space-y-2.5 rounded-xl border border-primary/25 bg-primary/5 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                <div>
                  <h4 className="text-xs font-bold text-foreground">Project Collaboration</h4>
                  <p className="text-[10px] text-muted-foreground">
                    Copy & assign this {kind} to teammates in this project
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setApplyUsersOpen(prev => !prev)}
              className="w-full py-2 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all flex items-center justify-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              Apply {kind} to other users
            </button>

            {applyUsersOpen && (
              <div className="pt-2 space-y-2 border-t border-primary/20">
                {loadingMembers ? (
                  <div className="flex items-center justify-center py-3 text-xs text-muted-foreground gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading project members…
                  </div>
                ) : projectMembers.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground italic">
                    No other members in this project yet. Invite teammates on the Projects page first.
                  </p>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-foreground">
                        Select project members ({selectedRecipientIds.length})
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedRecipientIds(
                            selectedRecipientIds.length === projectMembers.length
                              ? []
                              : projectMembers.map(m => m.id),
                          )
                        }
                        className="text-primary font-semibold hover:underline"
                      >
                        {selectedRecipientIds.length === projectMembers.length ? 'Clear all' : 'Select all'}
                      </button>
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {projectMembers.map(m => {
                        const checked = selectedRecipientIds.includes(m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() =>
                              setSelectedRecipientIds(prev =>
                                prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id],
                              )
                            }
                            className={`w-full px-2.5 py-2 rounded-xl border text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                              checked
                                ? 'border-primary bg-card text-foreground'
                                : 'border-border/70 bg-card/70 text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground truncate">{m.name}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{m.email}</p>
                            </div>
                            <span
                              className={`w-4 h-4 rounded flex items-center justify-center border flex-shrink-0 ${
                                checked ? 'bg-primary border-primary text-primary-foreground' : 'border-border'
                              }`}
                            >
                              {checked && <Check className="w-3 h-3" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      disabled={selectedRecipientIds.length === 0 || applyingToUsers}
                      onClick={() => void handleApplyToUsers()}
                      className="w-full py-2 rounded-xl bg-foreground text-background text-xs font-bold hover:opacity-90 disabled:opacity-50"
                    >
                      {applyingToUsers
                        ? 'Applying…'
                        : `Send to ${selectedRecipientIds.length || ''} Selected Member${selectedRecipientIds.length === 1 ? '' : 's'}`}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Comments Section */}
        <div className="rounded-xl border border-border bg-muted/20">
          <button
            type="button"
            onClick={() => setCommentsCollapsed(prev => !prev)}
            className="w-full flex items-center justify-between px-3.5 py-2.5"
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Comments ({(task.comments || []).length})
              </h3>
            </div>
            {commentsCollapsed ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            )}
          </button>

          {!commentsCollapsed && (
            <div className="border-t border-border/60 p-3 space-y-2.5">
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {(task.comments || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No comments yet.</p>
                ) : (
                  (task.comments || []).map(comment => (
                    <div
                      key={comment.id}
                      className="border border-border rounded-xl bg-card px-3 py-2 group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        {editingCommentId === comment.id ? (
                          <textarea
                            autoFocus
                            className="flex-1 bg-muted/40 border border-primary/30 rounded px-2 py-1 text-xs resize-none"
                            value={editingCommentText}
                            onChange={e => setEditingCommentText(e.target.value)}
                            onBlur={() => {
                              updateComment(comment.id, editingCommentText);
                              setEditingCommentId(null);
                            }}
                          />
                        ) : (
                          <p
                            onClick={() => {
                              setEditingCommentId(comment.id);
                              setEditingCommentText(comment.text);
                            }}
                            className="text-xs text-foreground whitespace-pre-wrap flex-1 cursor-text"
                          >
                            {comment.text}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteComment(comment.id)}
                          className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {new Date(comment.createdAt).toLocaleString(dateLocale())}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <div className="flex gap-1.5">
                <input
                  value={newCommentText}
                  onChange={e => setNewCommentText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addComment()}
                  placeholder="Add a comment..."
                  className="flex-1 bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={addComment}
                  disabled={!newCommentText.trim()}
                  className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 font-semibold"
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Activity Logs Section */}
        <div className="rounded-xl border border-border bg-muted/20">
          <button
            type="button"
            onClick={() => setActivityCollapsed(prev => !prev)}
            className="w-full flex items-center justify-between px-3.5 py-2.5"
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Activity Log ({activityEntries.length})
              </h3>
            </div>
            {activityCollapsed ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            )}
          </button>

          {!activityCollapsed && (
            <div className="border-t border-border/60 p-3 space-y-2 max-h-56 overflow-y-auto">
              {activityEntries.map(entry => (
                <div
                  key={entry.id}
                  className="rounded-xl border border-border/60 bg-card px-3 py-2"
                >
                  <p className="text-xs text-foreground">{entry.text}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {entry.actor && (
                      <>
                        <span className="font-semibold">{entry.actor}</span> ·{' '}
                      </>
                    )}
                    {new Date(entry.createdAt).toLocaleString(dateLocale())}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

export default TaskSideViewPanel;

