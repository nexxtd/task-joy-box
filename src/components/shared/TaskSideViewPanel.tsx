import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  BookmarkPlus,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronsLeft,
  Compass,
  Globe,
  KeyRound,
  LayoutTemplate,
  Loader2,
  Lock,
  MessageSquare,
  Pencil,
  Send,
  Sliders,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { dateLocale } from '@/i18n/format';
import { Priority, Task, TaskActivity, TaskComment, TaskTemplate } from '@/types/board';
import { toast } from '@/hooks/use-toast';
import { DEFAULT_TEMPLATE_TAGS } from '../../../shared/defaultTemplates';
import {
  fetchTemplates as fetchTaskTemplates,
  fetchTemplateByCode as fetchTaskTemplateByCode,
  createTemplate as createTaskTemplate,
} from '@/services/taskTemplateService';
import {
  fetchNoteTemplates,
  fetchNoteTemplateByCode,
  createNoteTemplate,
} from '@/services/noteTemplateService';
import CopyShareCode from '@/components/CopyShareCode';
import { getTaskAssignees } from '@/components/shared/AssignedBadge';

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
  onCloseSide?: () => void;
  onCloseModal?: () => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  activityEntries: TaskActivity[];
}

const projectMembersCache = new Map<number, ProjectMemberCandidate[]>();

/** Members of a project, read from the projects list (there is no single-project GET route). */
const fetchProjectMembers = async (projectId: number): Promise<ProjectMemberCandidate[]> => {
  const res = await fetch('/api/projects', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load project members');
  const data = await res.json();
  const projects: any[] = Array.isArray(data?.projects) ? data.projects : [];
  projects.forEach(p => {
    const raw = Array.isArray(p?.members) ? p.members : [];
    projectMembersCache.set(Number(p.id), raw.map((m: any) => ({
      id: Number(m.id ?? m.userId),
      name: m.name || m.email || 'Member',
      email: m.email || '',
      role: m.role || 'edit',
    })));
  });
  return projectMembersCache.get(projectId) ?? [];
};

export const TaskSideViewPanel: React.FC<TaskSideViewPanelProps> = ({
  kind,
  task,
  open,
  onHide,
  onCloseModal,
  onUpdateTask,
  activityEntries,
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [templatesCollapsed, setTemplatesCollapsed] = useState(false);
  const [templateTab, setTemplateTab] = useState<'apply' | 'save'>('apply');
  const [myTemplates, setMyTemplates] = useState<TaskTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [shareCodeInput, setShareCodeInput] = useState('');
  const [redeemingCode, setRedeemingCode] = useState(false);

  // Save-as-template form state
  const [tmplName, setTmplName] = useState(task.title || '');
  const [tmplPublic, setTmplPublic] = useState(false);
  const [tmplTags, setTmplTags] = useState<string[]>([]);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [savedShareCode, setSavedShareCode] = useState<string | null>(null);

  // Comments & Activity state
  const [activityCollapsed, setActivityCollapsed] = useState(false);
  const [commentsCollapsed, setCommentsCollapsed] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');

  // Project Member Assignment state (strictly visible when inside a project)
  const [assignCollapsed, setAssignCollapsed] = useState(false);
  const [projectMembers, setProjectMembers] = useState<ProjectMemberCandidate[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    setTmplName(task.title || `My ${kind} template`);
    setSavedShareCode(null);
  }, [task.id, task.title, kind]);

  const loadMyTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const list = kind === 'note' ? await fetchNoteTemplates() : await fetchTaskTemplates();
      setMyTemplates(Array.isArray(list) ? list : []);
    } catch {
      setMyTemplates([]);
    } finally {
      setLoadingTemplates(false);
    }
  };

  useEffect(() => {
    if (open) {
      void loadMyTemplates();
    }
  }, [open, kind]);

  useEffect(() => {
    if (!open || !task.projectId) {
      setProjectMembers([]);
      return;
    }
    const projectId = Number(task.projectId);
    let cancelled = false;
    // Show cached members instantly, then refresh in the background.
    const cached = projectMembersCache.get(projectId);
    if (cached) setProjectMembers(cached);
    setLoadingMembers(!cached);
    fetchProjectMembers(projectId)
      .then(list => {
        if (!cancelled) setProjectMembers(list);
      })
      .catch(() => {
        if (!cancelled && !cached) setProjectMembers([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingMembers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, task.projectId]);

  const assignedMembers = useMemo(() => getTaskAssignees(task), [task]);
  const assignedIdSet = useMemo(() => new Set(assignedMembers.map(a => a.id)), [assignedMembers]);

  if (!open) return null;

  const isCommentOwner = (comment: TaskComment): boolean => {
    if (user?.id == null) return false;
    if (comment.authorId != null) return comment.authorId === user.id;
    // Legacy personal comments (not in a shared project) remain editable by the current user
    return !task.projectId;
  };

  const addComment = () => {
    const trimmed = newCommentText.trim();
    if (!trimmed) return;
    const authorName = user?.name || user?.email?.split('@')[0] || 'You';
    onUpdateTask(task.id, {
      comments: [
        ...(task.comments || []),
        {
          id: crypto.randomUUID(),
          text: trimmed,
          createdAt: new Date().toISOString(),
          authorId: user?.id,
          authorName,
          authorEmail: user?.email,
        },
      ],
    });
    setNewCommentText('');
  };

  const deleteComment = (comment: TaskComment) => {
    if (!isCommentOwner(comment)) {
      toast({
        title: 'Permission denied',
        description: 'Only the author of a comment can delete it.',
        variant: 'destructive',
      });
      return;
    }
    onUpdateTask(task.id, {
      comments: (task.comments || []).filter(c => c.id !== comment.id),
    });
  };

  const updateComment = (comment: TaskComment, text: string) => {
    if (!isCommentOwner(comment)) {
      toast({
        title: 'Permission denied',
        description: 'Only the author of a comment can edit it.',
        variant: 'destructive',
      });
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) return;
    onUpdateTask(task.id, {
      comments: (task.comments || []).map(c =>
        c.id === comment.id
          ? { ...c, text: trimmed, updatedAt: new Date().toISOString() }
          : c,
      ),
    });
  };

  const handleToggleMemberAssignment = (member: ProjectMemberCandidate) => {
    const currentlyAssigned = assignedIdSet.has(member.id);
    const nextList = currentlyAssigned
      ? assignedMembers.filter(a => a.id !== member.id)
      : [...assignedMembers, { id: member.id, name: member.name }];

    const primary = nextList[0] || null;
    const actor = user?.name || user?.email?.split('@')[0] || 'Member';
    const nextActivity: TaskActivity = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: currentlyAssigned
        ? `${actor} unassigned ${member.name}`
        : `${actor} assigned ${member.name}`,
      createdAt: new Date().toISOString(),
      actor,
    };

    onUpdateTask(task.id, {
      assignedToUsers: nextList,
      assignedToUserIds: nextList.map(m => m.id),
      assignedToUserId: primary ? primary.id : null,
      assignedToUserName: primary ? primary.name : null,
      activityLog: [nextActivity, ...(task.activityLog || [])],
    });
  };

  const applyTemplateObject = (tmpl: Partial<TaskTemplate>) => {
    const newSubtasks = (tmpl.subtasks || []).map((st: any) => ({
      id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: st.text || '',
      completed: false,
      durationMinutes: st.durationMinutes || 0,
    }));
    const newChecklists = (tmpl.checklists || []).map((cl: any) => ({
      id: `cl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: cl.title || 'Checklist',
      items: (cl.items || []).map((item: any) => ({
        id: `ci-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        text: item.text || '',
        completed: false,
      })),
    }));
    const tmplBody = (tmpl as any).description || (tmpl as any).content || '';
    const existingLabels = task.labels || [];
    const incomingLabels = Array.isArray((tmpl as any).labels) ? (tmpl as any).labels : [];
    const mergedLabels = [...existingLabels];
    incomingLabels.forEach((lbl: any) => {
      if (lbl?.name && !mergedLabels.some(l => l.name.toLowerCase() === String(lbl.name).toLowerCase())) {
        mergedLabels.push({ ...lbl, id: lbl.id || `lbl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` });
      }
    });

    onUpdateTask(task.id, {
      title: !task.title?.trim() && tmpl.title ? tmpl.title : task.title,
      description: tmplBody
        ? task.description?.trim()
          ? `${task.description}\n\n${tmplBody}`
          : tmplBody
        : task.description,
      priority: task.priority === 'none' && tmpl.priority ? (tmpl.priority as Priority) : task.priority,
      duration: task.duration || tmpl.duration || 0,
      labels: mergedLabels,
      subtasks: [...(task.subtasks || []), ...newSubtasks],
      checklists: [...(task.checklists || []), ...newChecklists],
    });

    toast({
      title: 'Template applied',
      description: `"${tmpl.name || tmpl.title || 'Template'}" added to this ${kind}.`,
    });
  };

  const handleSaveAsTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = tmplName.trim();
    if (!cleanName || savingTemplate) return;
    setSavingTemplate(true);
    try {
      const payload: any = {
        name: cleanName,
        title: task.title || cleanName,
        description: task.description || '',
        content: task.description || '',
        priority: task.priority || 'medium',
        duration: task.duration || null,
        labels: task.labels || [],
        tags: task.labels || [],
        subtasks: (task.subtasks || []).map(st => ({
          text: st.text,
          durationMinutes: st.durationMinutes || 0,
        })),
        checklists: (task.checklists || []).map(cl => ({
          id: cl.id,
          title: cl.title,
          items: (cl.items || []).map(it => ({ id: it.id, text: it.text })),
        })),
        templateTags: tmplTags,
        isPublic: tmplPublic,
      };
      const created = kind === 'note'
        ? await createNoteTemplate(payload)
        : await createTaskTemplate(payload);
      setSavedShareCode((created as any).shareCode || null);
      await loadMyTemplates();
      setTemplateTab('apply');
      toast({
        title: 'Template saved',
        description: tmplPublic
          ? 'Saved publicly and share code generated!'
          : 'Saved privately to My Templates.',
      });
    } catch (err: any) {
      toast({
        title: 'Could not save template',
        description: err?.message || 'Try again in a moment.',
        variant: 'destructive',
      });
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleRedeemCode = async () => {
    const clean = shareCodeInput.trim().toUpperCase();
    if (!clean || redeemingCode) return;
    setRedeemingCode(true);
    try {
      const found = kind === 'note'
        ? await fetchNoteTemplateByCode(clean)
        : await fetchTaskTemplateByCode(clean);
      applyTemplateObject(found);
      setShareCodeInput('');
    } catch (err: any) {
      toast({
        title: 'Code not found',
        description: err?.message || `Enter a valid ${kind} template share code.`,
        variant: 'destructive',
      });
    } finally {
      setRedeemingCode(false);
    }
  };

  const handleBrowseTemplates = () => {
    onCloseModal?.();
    navigate(`/settings?tab=templates&type=${kind}&applyTo=${encodeURIComponent(task.id)}`);
  };

  return (
    <aside
      data-testid="task-side-view-panel"
      className="w-full md:w-[360px] lg:w-[400px] flex-shrink-0 rounded-2xl border border-border bg-card shadow-2xl flex flex-col max-h-[48vh] lg:max-h-[92vh] overflow-y-auto overscroll-contain animate-side-panel-in"
      onClick={e => e.stopPropagation()}
    >
      {/* Side Panel Header — Hide side view control only */}
      <div className="sticky top-0 z-10 px-4 py-3 border-b border-border flex items-center justify-between gap-2 bg-card/95 backdrop-blur rounded-t-2xl flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Sliders className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-xs font-black uppercase tracking-wider text-foreground truncate">
            Side View
          </span>
        </div>
        <button
          type="button"
          onClick={onHide}
          title="Hide side view"
          aria-label="Hide side view"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
        >
          <ChevronsLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Hide</span>
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="p-4 space-y-4">
        {/* Quick Settings */}
        <div className="space-y-2 rounded-xl border border-border bg-card/60 p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Quick Settings
            </span>
            <button
              type="button"
              onClick={() => onUpdateTask(task.id, { completed: !task.completed })}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${
                task.completed
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              <CheckCircle2 className="w-3 h-3" />
              {task.completed ? 'Completed' : 'Mark Complete'}
            </button>
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-xs font-medium text-muted-foreground">Priority</span>
            <select
              value={task.priority}
              onChange={e => onUpdateTask(task.id, { priority: e.target.value as Priority })}
              className="text-xs font-semibold bg-background border border-border rounded-lg px-2.5 py-1 text-foreground outline-none focus:border-primary"
            >
              <option value="none">None</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>

        {/* Assign Project Members — ONLY when inside a project */}
        {Boolean(task.projectId) && (
          <div className="rounded-xl border border-primary/25 bg-primary/5 overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => setAssignCollapsed(p => !p)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 text-left"
            >
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-foreground">
                <Users className="w-3.5 h-3.5 text-primary" />
                Assign Members ({assignedMembers.length})
              </span>
              {assignCollapsed ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              )}
            </button>

            {!assignCollapsed && (
              <div className="px-3.5 pb-3.5 pt-1 border-t border-primary/15 space-y-2">
                {loadingMembers ? (
                  <div className="flex items-center justify-center py-3 text-xs text-muted-foreground gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading project members…
                  </div>
                ) : projectMembers.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground italic">
                    No project members found yet. Invite teammates on the Users tab.
                  </p>
                ) : (
                  <div className="space-y-1 max-h-44 overflow-y-auto pr-0.5">
                    {projectMembers.map(member => {
                      const isAssigned = assignedIdSet.has(member.id);
                      const isMe = member.id === user?.id;
                      return (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => handleToggleMemberAssignment(member)}
                          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl border text-left transition-all ${
                            isAssigned
                              ? 'border-primary bg-primary/15 text-foreground shadow-xs ring-1 ring-primary/25'
                              : 'border-border bg-card/80 text-foreground hover:bg-muted/60 hover:border-border/80'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`w-6 h-6 rounded-full text-[10px] font-black flex items-center justify-center flex-shrink-0 ${
                                isAssigned
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {member.name.trim().slice(0, 1).toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs font-bold truncate">
                                {member.name}
                                {isMe && (
                                  <span className="ml-1 text-[10px] font-semibold text-primary">(You)</span>
                                )}
                              </p>
                              <p className="text-[10px] text-muted-foreground capitalize truncate">
                                {member.role}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                              isAssigned
                                ? 'bg-primary text-primary-foreground scale-100'
                                : 'border border-border bg-background/60 text-transparent'
                            }`}
                          >
                            <Check className="w-3 h-3" />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">
                  Click any team member to highlight and assign them to this {kind}.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Templates Section — Directly Above Comments */}
        <div className="rounded-xl border border-border bg-card/70 overflow-hidden">
          <button
            type="button"
            onClick={() => setTemplatesCollapsed(prev => !prev)}
            className="w-full flex items-center justify-between px-3.5 py-2.5"
          >
            <div className="flex items-center gap-2">
              <LayoutTemplate className="w-3.5 h-3.5 text-primary" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Templates ({myTemplates.length})
              </h3>
            </div>
            {templatesCollapsed ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            )}
          </button>

          {!templatesCollapsed && (
            <div className="border-t border-border p-3 space-y-3">
              {/* Sub-mode switcher: Apply vs Turn into Template */}
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-muted/50 border border-border">
                <button
                  type="button"
                  onClick={() => setTemplateTab('apply')}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all ${
                    templateTab === 'apply'
                      ? 'bg-card text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Sparkles className="w-3 h-3 text-primary" />
                  Apply Template
                </button>
                <button
                  type="button"
                  onClick={() => setTemplateTab('save')}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all ${
                    templateTab === 'save'
                      ? 'bg-card text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <BookmarkPlus className="w-3 h-3 text-primary" />
                  Turn Into Template
                </button>
              </div>

              {templateTab === 'apply' ? (
                <div className="space-y-2.5">
                  {loadingTemplates ? (
                    <div className="flex items-center justify-center py-4 text-xs text-muted-foreground gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading your templates…
                    </div>
                  ) : myTemplates.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border bg-muted/20 p-3 text-center space-y-1.5">
                      <p className="text-xs font-semibold text-foreground">No saved {kind} templates yet</p>
                      <p className="text-[11px] text-muted-foreground">
                        Turn this {kind} into a reusable template or browse community defaults.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
                      {myTemplates.map(tmpl => (
                        <div
                          key={tmpl.id}
                          className="flex items-center justify-between gap-2 p-2 rounded-xl border border-border bg-background/80 hover:border-primary/40 transition-all"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-foreground truncate">
                                {tmpl.name}
                              </span>
                              {tmpl.isPublic ? (
                                <span title="Public template" className="inline-flex flex-shrink-0">
                                  <Globe className="w-3 h-3 text-emerald-500" />
                                </span>
                              ) : (
                                <span title="Private template" className="inline-flex flex-shrink-0">
                                  <Lock className="w-3 h-3 text-amber-500" />
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {(tmpl.subtasks?.length || 0)} subtasks · {(tmpl.checklists?.length || 0)} checklists
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => applyTemplateObject(tmpl)}
                            className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground text-[11px] font-bold transition-all flex-shrink-0"
                          >
                            Apply
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Quick Share Code Redeem */}
                  <div className="flex items-center gap-1.5">
                    <div className="relative flex-1">
                      <KeyRound className="w-3 h-3 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={shareCodeInput}
                        onChange={e => setShareCodeInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && void handleRedeemCode()}
                        placeholder={`Paste ${kind} share code…`}
                        className="w-full bg-background border border-border rounded-lg pl-7 pr-2.5 py-1.5 text-[11px] text-foreground outline-none focus:border-primary"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={!shareCodeInput.trim() || redeemingCode}
                      onClick={() => void handleRedeemCode()}
                      className="px-2.5 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-[11px] font-bold text-foreground disabled:opacity-50"
                    >
                      {redeemingCode ? '…' : 'Use'}
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSaveAsTemplate} className="space-y-2.5">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Template Name
                    </label>
                    <input
                      type="text"
                      value={tmplName}
                      onChange={e => setTmplName(e.target.value)}
                      placeholder={`Name your ${kind} template…`}
                      className="w-full mt-1 bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Visibility
                    </label>
                    <div className="grid grid-cols-2 gap-1.5 mt-1">
                      <button
                        type="button"
                        onClick={() => setTmplPublic(false)}
                        className={`py-1.5 px-2 rounded-lg border text-[11px] font-bold flex items-center justify-center gap-1 transition-all ${
                          !tmplPublic
                            ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'border-border text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <Lock className="w-3 h-3" /> Private
                      </button>
                      <button
                        type="button"
                        onClick={() => setTmplPublic(true)}
                        className={`py-1.5 px-2 rounded-lg border text-[11px] font-bold flex items-center justify-center gap-1 transition-all ${
                          tmplPublic
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'border-border text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <Globe className="w-3 h-3" /> Public
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Tags (optional)
                    </label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {DEFAULT_TEMPLATE_TAGS.slice(0, 6).map(tag => {
                        const active = tmplTags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() =>
                              setTmplTags(prev =>
                                prev.includes(tag) ? prev.filter(t => t !== tag) : prev.length < 4 ? [...prev, tag] : prev,
                              )
                            }
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all ${
                              active
                                ? 'border-primary bg-primary/15 text-primary'
                                : 'border-border bg-background text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={!tmplName.trim() || savingTemplate}
                    className="w-full py-2 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-all"
                  >
                    {savingTemplate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookmarkPlus className="w-3.5 h-3.5" />}
                    Save Current {kind === 'note' ? 'Note' : 'Task'} as Template
                  </button>
                  {savedShareCode && (
                    <div className="pt-1 flex items-center justify-between gap-2 text-[11px] bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-1.5">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">Share code:</span>
                      <CopyShareCode code={savedShareCode} size="sm" />
                    </div>
                  )}
                </form>
              )}

              {/* Browse all Templates in Settings */}
              <button
                type="button"
                onClick={handleBrowseTemplates}
                className="w-full py-2 px-3 rounded-xl border border-primary/25 bg-primary/5 hover:bg-primary/10 text-xs font-bold text-primary flex items-center justify-center gap-1.5 transition-all"
              >
                <Compass className="w-3.5 h-3.5" />
                Browse All Templates
              </button>
            </div>
          )}
        </div>

        {/* Comments Section */}
        <div className="rounded-xl border border-border bg-muted/20">
          <button
            type="button"
            onClick={() => setCommentsCollapsed(prev => !prev)}
            className="w-full flex items-center justify-between px-3.5 py-2.5"
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
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
            <div className="border-t border-border p-3 space-y-2.5">
              {(task.comments || []).length === 0 ? (
                <p className="text-xs text-muted-foreground/70 italic">No comments yet.</p>
              ) : (
                <div className="space-y-2">
                  {(task.comments || []).map(comment => {
                    const editable = isCommentOwner(comment);
                    const displayAuthor =
                      comment.authorName ||
                      (comment.authorId === user?.id ? user?.name || 'You' : task.projectId ? 'Project Member' : user?.name || 'You');
                    const isSelf = comment.authorId != null && comment.authorId === user?.id;
                    return (
                      <div
                        key={comment.id}
                        className="group rounded-xl border border-border bg-background/85 px-3 py-2 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-black flex items-center justify-center flex-shrink-0">
                              {displayAuthor.trim().slice(0, 1).toUpperCase()}
                            </span>
                            <span className="text-[11px] font-bold text-foreground truncate">
                              {displayAuthor}
                              {isSelf && <span className="text-primary font-semibold ml-1">(You)</span>}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {editable ? (
                              <>
                                <button
                                  type="button"
                                  title="Edit comment"
                                  onClick={() => {
                                    setEditingCommentId(comment.id);
                                    setEditingCommentText(comment.text);
                                  }}
                                  className="p-1 text-muted-foreground hover:text-primary opacity-75 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  title="Delete comment"
                                  onClick={() => deleteComment(comment)}
                                  className="p-1 text-muted-foreground hover:text-destructive opacity-75 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </>
                            ) : (
                              <span
                                title="Only the comment author can edit this comment"
                                className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground/70"
                              >
                                <Lock className="w-2.5 h-2.5" />
                              </span>
                            )}
                          </div>
                        </div>

                        {editable && editingCommentId === comment.id ? (
                          <textarea
                            autoFocus
                            rows={2}
                            value={editingCommentText}
                            onChange={e => setEditingCommentText(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                updateComment(comment, editingCommentText);
                                setEditingCommentId(null);
                              } else if (e.key === 'Escape') {
                                setEditingCommentId(null);
                              }
                            }}
                            onBlur={() => {
                              updateComment(comment, editingCommentText);
                              setEditingCommentId(null);
                            }}
                            className="w-full bg-background border border-primary/40 rounded-md px-2 py-1 text-xs text-foreground outline-none resize-none"
                          />
                        ) : (
                          <p
                            onClick={() => {
                              if (!editable) return;
                              setEditingCommentId(comment.id);
                              setEditingCommentText(comment.text);
                            }}
                            className={`text-xs text-foreground whitespace-pre-wrap break-words ${
                              editable ? 'cursor-text' : 'cursor-default'
                            }`}
                          >
                            {comment.text}
                          </p>
                        )}

                        <span className="block text-[10px] text-muted-foreground/75">
                          {new Date(comment.createdAt).toLocaleString(dateLocale(), {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {comment.updatedAt ? ' · edited' : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

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
                  className="px-2.5 py-1.5 rounded-lg bg-foreground text-background text-xs font-medium hover:opacity-90 disabled:opacity-50"
                  title="Send comment"
                >
                  <Send className="w-3.5 h-3.5" />
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
              <Activity className="w-3.5 h-3.5 text-muted-foreground" />
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
            <div className="border-t border-border p-3 space-y-2">
              {activityEntries.map(entry => (
                <div key={entry.id} className="text-xs flex items-start gap-2 text-foreground/85">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary/50 mt-1.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="break-words">{entry.text}</p>
                    {entry.actor && !entry.text.toLowerCase().startsWith(entry.actor.toLowerCase()) && (
                      <p className="text-[10px] font-semibold text-foreground/70 mt-0.5">by {entry.actor}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">
                      {new Date(entry.createdAt).toLocaleString(dateLocale(), {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
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
