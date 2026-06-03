import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DragDropContext, Droppable, DropResult, Draggable } from '@hello-pangea/dnd';
import {
  CheckCircle2,
  CircleDotDashed,
  Clock3,
  Copy,
  FolderKanban,
  GripVertical,
  LayoutDashboard,
  List,
  Loader2,
  Lock,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Settings2,
  Share2,
  SquarePen,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';
import BoardColumn from '@/components/BoardColumn';
import ListView from '@/components/ListView';
import TaskDetailModal from '@/components/TaskDetailModal';
import CreateTaskModal from '@/components/CreateTaskModal';
import { useBoardContext } from '@/context/BoardContext';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { Task } from '@/types/board';

interface ChatMessage {
  id: string;
  text: string;
  authorName: string;
  authorId: number;
  createdAt: string;
}

type ProjectTab = 'home' | 'board' | 'list' | 'chat';

interface ProjectMember {
  id: number;
  name: string;
  email: string;
  role: 'owner' | 'member';
}

interface ProjectMeta {
  id: number;
  name: string;
  color: string;
  description: string;
  archived: boolean;
  completed: boolean;
  inviteCode: string;
  ownerId: number;
  members: ProjectMember[];
  memberCount: number;
}

const STORAGE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#ec4899'];
const PLAN_LIMITS: Record<'free' | 'premium' | 'pro', number> = { free: 5, premium: 10, pro: 20 };

const Projects: React.FC = () => {
  const { board, moveTask, reorderColumns, addColumn, updateTask } = useBoardContext();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [currentTab, setCurrentTab] = useState<ProjectTab>('home');
  const [showProjectMenuId, setShowProjectMenuId] = useState<number | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [addingProject, setAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectColor, setNewProjectColor] = useState(STORAGE_COLORS[0]);
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [limitHint, setLimitHint] = useState(false);
  const [joinState, setJoinState] = useState<'idle' | 'joining' | 'failed'>('idle');

  const [addingColumn, setAddingColumn] = useState(false);
  const [newColTitle, setNewColTitle] = useState('');

  const [milestones, setMilestones] = useState<{ id: string; name: string; date: string; description?: string }[]>([]);
  const [showMilestonePopup, setShowMilestonePopup] = useState(false);
  const [newMilestoneName, setNewMilestoneName] = useState('');
  const [newMilestoneDate, setNewMilestoneDate] = useState('');
  const [newMilestoneDesc, setNewMilestoneDesc] = useState('');

  const [selectedMember, setSelectedMember] = useState<ProjectMember | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<ProjectMember | null>(null);

  const [projectToDelete, setProjectToDelete] = useState<number | null>(null);
  const [projectToLeave, setProjectToLeave] = useState<number | null>(null);

  const [projectOrder, setProjectOrder] = useState<number[]>([]);

  // Board "Add Task" popup state
  const [addTaskPopupColumnId, setAddTaskPopupColumnId] = useState<string | null>(null);
  const [assignSearch, setAssignSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createModalColumnId, setCreateModalColumnId] = useState<string | undefined>(undefined);

  // Project chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (user?.id) {
      try {
        const saved = localStorage.getItem(`project_order_${user.id}`);
        if (saved) setProjectOrder(JSON.parse(saved));
      } catch {}
    }
  }, [user?.id]);

  useEffect(() => {
    if (selectedProjectId) {
      try {
        const saved = localStorage.getItem(`milestones_${selectedProjectId}`);
        setMilestones(saved ? JSON.parse(saved) : []);
      } catch {
        setMilestones([]);
      }
    } else {
      setMilestones([]);
    }
  }, [selectedProjectId]);

  const handleAddColumn = () => {
    if (newColTitle.trim() && selectedProjectId) {
      addColumn(newColTitle.trim(), selectedProjectId);
      setNewColTitle('');
      setAddingColumn(false);
    }
  };

  const handleAddMilestone = (name: string, date: string, description?: string) => {
    if (!selectedProjectId) return;
    const newM = { id: crypto.randomUUID(), name, date, description };
    const nextMilestones = [...milestones, newM];
    setMilestones(nextMilestones);
    localStorage.setItem(`milestones_${selectedProjectId}`, JSON.stringify(nextMilestones));
  };

  const planTier = (user?.subscriptionTier === 'pro'
    ? 'pro'
    : user?.subscriptionTier === 'premium'
      ? 'premium'
      : 'free') as 'free' | 'premium' | 'pro';
  const projectLimit = PLAN_LIMITS[planTier];
  const activeCount = projects.filter(project => !project.archived).length;
  const canAddProject = activeCount < projectLimit;

  const selectedProject = useMemo(
    () => projects.find(project => project.id === selectedProjectId) || projects[0] || null,
    [projects, selectedProjectId],
  );

  const currentTask = selectedTask ? board.tasks.find(t => t.id === selectedTask.id) : null;
  const projectTasks = useMemo(
    () => board.tasks.filter(task => task.projectId === selectedProject?.id),
    [board.tasks, selectedProject?.id]
  );

  // Load/save chat messages per project
  useEffect(() => {
    if (!selectedProjectId) return;
    try {
      const saved = localStorage.getItem(`project_chat_${selectedProjectId}`);
      setChatMessages(saved ? JSON.parse(saved) : []);
    } catch {
      setChatMessages([]);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSendChatMessage = () => {
    const text = chatInput.trim();
    if (!text || chatSending || !selectedProjectId || !user) return;
    setChatSending(true);
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      text,
      authorName: user.name,
      authorId: user.id,
      createdAt: new Date().toISOString(),
    };
    const next = [...chatMessages, msg];
    setChatMessages(next);
    localStorage.setItem(`project_chat_${selectedProjectId}`, JSON.stringify(next));
    setChatInput('');
    setChatSending(false);
  };
  const totalTasks = projectTasks.length;
  const completedTasks = projectTasks.filter(task => task.completed || task.columnId.toLowerCase().includes('completed')).length;
  const overdueTasks = projectTasks.filter(task => task.dueDate && new Date(task.dueDate) < new Date() && !task.completed).length;
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const recentActivity = useMemo(
    () => [...projectTasks]
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
      .slice(0, 10)
      .map(task => ({
        id: task.id,
        text: `${task.title}${task.completed ? ' was completed' : ' was updated'}`,
        time: task.updatedAt || task.createdAt,
      })),
    [projectTasks],
  );

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/projects', { credentials: 'include' });
        if (!response.ok) throw new Error(String(response.status));
        const data = await response.json();
        const loaded: ProjectMeta[] = data.projects || [];
        setProjects(loaded);
        if (!selectedProjectId && loaded[0]) setSelectedProjectId(loaded[0].id);
        if (loaded.length === 0) setSelectedProjectId(null);
      } catch (error) {
        console.error('Failed to load projects:', error);
        toast({ title: 'Projects unavailable', description: 'Could not load your projects.' });
      }
    };
    load();
  }, [selectedProjectId]);

  useEffect(() => {
    const joinCode = searchParams.get('join');
    if (!joinCode || joinState !== 'idle') return;

    const join = async () => {
      setJoinState('joining');
      try {
        const response = await fetch(`/api/projects/join/${joinCode}`, {
          method: 'POST',
          credentials: 'include',
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Join failed');
        const nextProject: ProjectMeta | undefined = data.project;
        if (nextProject) {
          setProjects(prev => {
            const without = prev.filter(project => project.id !== nextProject.id);
            return [...without, nextProject];
          });
          setSelectedProjectId(nextProject.id);
        }
        toast({ title: 'Joined project', description: 'You have been added to the project.' });
        searchParams.delete('join');
        setSearchParams(searchParams, { replace: true });
      } catch (error: any) {
        setJoinState('failed');
        toast({ title: 'Could not join project', description: error?.message || 'Invite link is invalid or you reached your limit.' });
      }
    };

    join();
  }, [joinState, searchParams, setSearchParams]);

  useEffect(() => {
    if (!selectedProjectId && projects[0]) setSelectedProjectId(projects[0].id);
  }, [projects, selectedProjectId]);

  const sortProjects = (items: ProjectMeta[]) => {
    return [...items].sort((a, b) => {
      const idxA = projectOrder.indexOf(a.id);
      const idxB = projectOrder.indexOf(b.id);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  };

  const activeProjects = sortProjects(projects.filter(project => !project.archived));
  const completedProjects = sortProjects(projects.filter(project => project.completed && !project.archived));
  const archivedProjects = sortProjects(projects.filter(project => project.archived));

  const persistProject = async (projectId: number, updates: Partial<ProjectMeta>) => {
    const response = await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(updates),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Failed to update project');
    if (data.project) {
      setProjects(prev => prev.map(project => (project.id === data.project.id ? data.project : project)));
      return data.project as ProjectMeta;
    }
    return null;
  };

  const handleAddProject = async () => {
    if (!newProjectName.trim()) return;
    if (!canAddProject) {
      setLimitHint(true);
      return;
    }

    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        name: newProjectName.trim(),
        description: newProjectDescription.trim(),
        color: newProjectColor,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast({ title: 'Could not create project', description: data.message || data.error || 'Try again.' });
      if (response.status === 402) setLimitHint(true);
      return;
    }

    if (data.project) {
      setProjects(prev => [...prev, data.project]);
      setSelectedProjectId(data.project.id);
    }
    setNewProjectName('');
    setNewProjectDescription('');
    setNewProjectColor(STORAGE_COLORS[0]);
    setAddingProject(false);
  };

  const handleInvite = async () => {
    if (!selectedProject || !inviteEmail.trim()) return;
    setInviteBusy(true);
    try {
      const response = await fetch(`/api/projects/${selectedProject.id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || data.error || 'Invite failed');
      if (data.project) {
        setProjects(prev => prev.map(project => (project.id === data.project.id ? data.project : project)));
      }
      toast({ title: 'Invite sent', description: data.message || 'The member has been added.' });
      setInviteEmail('');
      setShowInviteModal(false);
    } catch (error: any) {
      toast({ title: 'Invite failed', description: error?.message || 'Could not invite member.' });
    } finally {
      setInviteBusy(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (projectToDelete === null) return;
    const response = await fetch(`/api/projects/${projectToDelete}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (response.ok) {
      setProjects(prev => prev.filter(project => project.id !== projectToDelete));
      if (selectedProjectId === projectToDelete) {
        const remaining = projects.filter(project => project.id !== projectToDelete);
        setSelectedProjectId(remaining[0]?.id || null);
      }
      toast({ title: 'Project deleted', description: 'The project was successfully deleted.' });
    } else {
      toast({ title: 'Delete failed', description: 'Could not delete the project.' });
    }
    setProjectToDelete(null);
  };

  const handleLeaveConfirm = async () => {
    if (projectToLeave === null) return;
    const response = await fetch(`/api/projects/${projectToLeave}/leave`, {
      method: 'POST',
      credentials: 'include',
    });
    if (response.ok) {
      setProjects(prev => prev.filter(project => project.id !== projectToLeave));
      if (selectedProjectId === projectToLeave) {
        const remaining = projects.filter(project => project.id !== projectToLeave);
        setSelectedProjectId(remaining[0]?.id || null);
      }
      toast({ title: 'Left project', description: 'You have left the project.' });
    } else {
      toast({ title: 'Failed to leave', description: 'Could not leave the project.' });
    }
    setProjectToLeave(null);
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    if (result.type === 'column') {
      reorderColumns(result.source.index, result.destination.index, selectedProject?.id);
      return;
    }
    moveTask(result.draggableId, result.destination.droppableId, result.destination.index);
  };

  const handleBoardDragStart = () => document.body.classList.add('is-dragging');
  const handleBoardDragUpdate = () => undefined;

  const updateSelectedProject = async (updates: Partial<ProjectMeta>) => {
    if (!selectedProject) return;
    const next = await persistProject(selectedProject.id, updates);
    if (next) setSelectedProjectId(next.id);
  };

  const sidebarBlock = (title: string, items: ProjectMeta[]) => {
    const isDraggableList = title === 'Active Projects';
    const droppableId = `projects-${title.toLowerCase().replace(' ', '-')}`;

    return (
      <div className="space-y-2">
        <div className="mb-2 flex items-center justify-between px-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{title}</h3>
          <span className="text-xs text-muted-foreground">{items.length}</span>
        </div>
        {isDraggableList ? (
          <DragDropContext
            onDragEnd={(result) => {
              if (!result.destination) return;
              const reorderedItems = [...items];
              const [moved] = reorderedItems.splice(result.source.index, 1);
              reorderedItems.splice(result.destination.index, 0, moved);
              
              const newOrder = [...projectOrder];
              const activeIds = reorderedItems.map(p => p.id);
              const otherIds = projectOrder.filter(id => !activeIds.includes(id));
              const finalOrder = [...activeIds, ...otherIds];
              setProjectOrder(finalOrder);
              localStorage.setItem(`project_order_${user?.id}`, JSON.stringify(finalOrder));
            }}
          >
            <Droppable droppableId={droppableId} type="project" direction="vertical">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                  {items.map((project, idx) => (
                    <Draggable key={project.id} draggableId={`project-${project.id}`} index={idx}>
                      {(dragProvided, dragSnapshot) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          onClick={() => setSelectedProjectId(project.id)}
                          className={cn(
                            'group cursor-pointer rounded-2xl border px-3 py-3 transition-all',
                            selectedProject?.id === project.id ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-background hover:border-primary/30 hover:bg-muted/40',
                            dragSnapshot.isDragging ? 'shadow-lg border-primary/40 bg-card/95' : ''
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div {...dragProvided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-muted flex items-center justify-center">
                              <GripVertical className="h-4 w-4 text-muted-foreground/60" />
                            </div>
                            <div className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
                                {project.completed && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                                {project.archived && <Lock className="h-3.5 w-3.5 text-amber-500" />}
                              </div>
                              <p className="truncate text-xs text-muted-foreground">{project.description}</p>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowProjectMenuId(prev => prev === project.id ? null : project.id);
                              }}
                              className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-muted hover:text-foreground"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </div>

                          {showProjectMenuId === project.id && (
                            <div className="mt-3 rounded-2xl border border-border bg-card p-2 shadow-lg z-10 relative">
                              <MenuItem icon={<SquarePen className="h-3.5 w-3.5" />} label="Rename" onClick={() => {
                                setEditingProjectId(project.id);
                                setEditingName(project.name);
                                setShowProjectMenuId(null);
                              }} />
                              <MenuItem icon={<CircleDotDashed className="h-3.5 w-3.5" />} label="Recolour" onClick={() => {
                                const nextColor = STORAGE_COLORS[(STORAGE_COLORS.indexOf(project.color) + 1) % STORAGE_COLORS.length];
                                updateSelectedProject({ color: nextColor });
                                setShowProjectMenuId(null);
                              }} />
                              <MenuItem icon={<Lock className="h-3.5 w-3.5" />} label={project.archived ? 'Unarchive' : 'Archive'} onClick={async () => {
                                await persistProject(project.id, { archived: !project.archived });
                                setShowProjectMenuId(null);
                              }} />
                              <MenuItem icon={<CheckCircle2 className="h-3.5 w-3.5" />} label={project.completed ? 'Reopen' : 'Mark complete'} onClick={async () => {
                                await persistProject(project.id, { completed: !project.completed });
                                setShowProjectMenuId(null);
                              }} />
                              {project.ownerId === user?.id ? (
                                <MenuItem icon={<Trash2 className="h-3.5 w-3.5" />} danger label="Delete" onClick={() => {
                                  setProjectToDelete(project.id);
                                  setShowProjectMenuId(null);
                                }} />
                              ) : (
                                <MenuItem icon={<X className="h-3.5 w-3.5" />} danger label="Leave Project" onClick={() => {
                                  setProjectToLeave(project.id);
                                  setShowProjectMenuId(null);
                                }} />
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        ) : (
          <div className="space-y-2">
            {items.map(project => (
              <div
                key={project.id}
                onClick={() => setSelectedProjectId(project.id)}
                className={cn(
                  'group cursor-pointer rounded-2xl border px-3 py-3 transition-all',
                  selectedProject?.id === project.id ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-background hover:border-primary/30 hover:bg-muted/40',
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
                      {project.completed && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                      {project.archived && <Lock className="h-3.5 w-3.5 text-amber-500" />}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{project.description}</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowProjectMenuId(prev => prev === project.id ? null : project.id);
                    }}
                    className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-muted hover:text-foreground"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>

                {showProjectMenuId === project.id && (
                  <div className="mt-3 rounded-2xl border border-border bg-card p-2 shadow-lg">
                    <MenuItem icon={<SquarePen className="h-3.5 w-3.5" />} label="Rename" onClick={() => {
                      setEditingProjectId(project.id);
                      setEditingName(project.name);
                      setShowProjectMenuId(null);
                    }} />
                    <MenuItem icon={<CircleDotDashed className="h-3.5 w-3.5" />} label="Recolour" onClick={() => {
                      const nextColor = STORAGE_COLORS[(STORAGE_COLORS.indexOf(project.color) + 1) % STORAGE_COLORS.length];
                      updateSelectedProject({ color: nextColor });
                      setShowProjectMenuId(null);
                    }} />
                    <MenuItem icon={<Lock className="h-3.5 w-3.5" />} label={project.archived ? 'Unarchive' : 'Archive'} onClick={async () => {
                      await persistProject(project.id, { archived: !project.archived });
                      setShowProjectMenuId(null);
                    }} />
                    <MenuItem icon={<CheckCircle2 className="h-3.5 w-3.5" />} label={project.completed ? 'Reopen' : 'Mark complete'} onClick={async () => {
                      await persistProject(project.id, { completed: !project.completed });
                      setShowProjectMenuId(null);
                    }} />
                    {project.ownerId === user?.id ? (
                      <MenuItem icon={<Trash2 className="h-3.5 w-3.5" />} danger label="Delete" onClick={() => {
                        setProjectToDelete(project.id);
                        setShowProjectMenuId(null);
                      }} />
                    ) : (
                      <MenuItem icon={<X className="h-3.5 w-3.5" />} danger label="Leave Project" onClick={() => {
                        setProjectToLeave(project.id);
                        setShowProjectMenuId(null);
                      }} />
                    )}
                  </div>
                )}
              </div>
            ))}
            {items.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-xs text-muted-foreground">
                No projects in this section.
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderHome = () => (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-4 w-4 rounded-full" style={{ backgroundColor: selectedProject?.color || STORAGE_COLORS[0] }} />
                <h2 className="text-2xl font-semibold text-foreground">{selectedProject?.name || 'Project'}</h2>
              </div>
              <p className="text-sm text-muted-foreground max-w-2xl">{selectedProject?.description || 'Describe what this project is about.'}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowInviteModal(true)} className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background">
                <Share2 className="h-3.5 w-3.5" />
                Share
              </button>
              {selectedProject?.completed && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />Completed</span>}
              {selectedProject?.archived && <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600"><Lock className="h-3.5 w-3.5" />Archived</span>}
            </div>
          </div>

          <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-2">Project Description</label>
          <textarea
            value={selectedProject?.description || ''}
            onChange={e => updateSelectedProject({ description: e.target.value })}
            readOnly={Boolean(selectedProject?.archived || selectedProject?.completed)}
            rows={4}
            className="w-full rounded-2xl border border-border bg-muted/30 px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 read-only:cursor-not-allowed read-only:opacity-75"
            placeholder="What is this project about?"
          />

          <div className="mt-5">
            <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-2">Members</label>
            <div className="flex flex-wrap gap-2">
              {selectedProject?.members.length ? selectedProject.members.map(member => (
                <button
                  key={member.id}
                  onClick={() => {
                    if (selectedProject.ownerId === user?.id) {
                      setSelectedMember(member);
                    }
                  }}
                  className={cn(
                    "group flex items-center gap-2 rounded-full border border-border bg-muted/20 px-3 py-2 text-xs text-left transition-all",
                    selectedProject.ownerId === user?.id ? "hover:border-primary/40 hover:bg-muted/50 cursor-pointer" : ""
                  )}
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background flex-shrink-0">
                    {member.name.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="text-foreground font-medium">{member.name}</span>
                  <span className="text-muted-foreground capitalize">{member.role}</span>
                </button>
              )) : (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-xs text-muted-foreground">
                  No members yet
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">Summary Stats</h3>
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StatCard value={totalTasks} label="Total tasks" />
              <StatCard value={completedTasks} label="Completed" />
              <StatCard value={overdueTasks} label="Overdue" />
              <StatCard value={selectedProject?.memberCount || 0} label="Members" />
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground mb-3">Progress Overview</h3>
            <div className="mb-3 flex items-end justify-between">
              <div>
                <div className="text-3xl font-semibold text-foreground">{progressPct}%</div>
                <div className="text-xs text-muted-foreground">Completed vs total items</div>
              </div>
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="h-3 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-primary to-sky-500 transition-all" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              {completedTasks} completed, {Math.max(0, totalTasks - completedTasks)} remaining
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm relative">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Milestones</h3>
            <button
              onClick={() => setShowMilestonePopup(true)}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Add milestone
            </button>
          </div>

          {showMilestonePopup && (
            <div className="absolute inset-x-5 top-12 z-20 bg-card border border-border rounded-2xl p-4 shadow-xl animate-fade-in">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-foreground uppercase tracking-wider">New Milestone</span>
                <button onClick={() => setShowMilestonePopup(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Name</label>
                  <input
                    type="text"
                    value={newMilestoneName}
                    onChange={e => setNewMilestoneName(e.target.value)}
                    placeholder="Milestone name"
                    className="w-full bg-muted/30 border border-border rounded-lg p-2 text-xs text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Date</label>
                  <input
                    type="date"
                    value={newMilestoneDate}
                    onChange={e => setNewMilestoneDate(e.target.value)}
                    className="w-full bg-muted/30 border border-border rounded-lg p-2 text-xs text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Description (optional)</label>
                  <textarea
                    value={newMilestoneDesc}
                    onChange={e => setNewMilestoneDesc(e.target.value)}
                    placeholder="Describe this milestone..."
                    rows={2}
                    className="w-full bg-muted/30 border border-border rounded-lg p-2 text-xs text-foreground focus:ring-2 focus:ring-primary/20 outline-none resize-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (newMilestoneName.trim() && newMilestoneDate) {
                        handleAddMilestone(newMilestoneName.trim(), newMilestoneDate, newMilestoneDesc.trim());
                        setNewMilestoneName('');
                        setNewMilestoneDate('');
                        setNewMilestoneDesc('');
                        setShowMilestonePopup(false);
                      }
                    }}
                    disabled={!newMilestoneName.trim() || !newMilestoneDate}
                    className="flex-1 bg-primary text-primary-foreground text-xs font-bold py-2 rounded-lg disabled:opacity-50 hover:bg-primary/90"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setShowMilestonePopup(false)}
                    className="px-3 py-2 text-xs border border-border text-muted-foreground rounded-lg hover:bg-muted"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {milestones.length > 0 ? (
              milestones.map(milestone => (
                <div key={milestone.id} className="flex items-start justify-between rounded-xl border border-border bg-muted/10 p-3 hover:bg-muted/20 transition-all">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground truncate">{milestone.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(milestone.date).toLocaleDateString()}</p>
                    {milestone.description && <p className="text-[10px] text-muted-foreground/80 mt-1 break-words">{milestone.description}</p>}
                  </div>
                  <button
                    onClick={() => {
                      const updated = milestones.filter(m => m.id !== milestone.id);
                      setMilestones(updated);
                      if (selectedProjectId) {
                        localStorage.setItem(`milestones_${selectedProjectId}`, JSON.stringify(updated));
                      }
                    }}
                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 ml-2"
                    title="Delete milestone"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            ) : (
              <EmptyState title="No milestones yet" description="Start planning checkpoints directly on the home page." />
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {recentActivity.length > 0 ? recentActivity.map(activity => (
              <div key={activity.id} className="flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/20 p-3">
                <Clock3 className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{activity.text}</p>
                  <p className="text-xs text-muted-foreground">{new Date(activity.time).toLocaleString()}</p>
                </div>
              </div>
            )) : <EmptyState title="No recent activity" description="Changes and updates will appear here." />}
          </div>
        </div>
      </div>
    </div>
  );

  const renderBoard = () => {
    const projectColumns = [...board.columns]
      .filter(col => col.projectId === selectedProject?.id)
      .sort((a, b) => a.order - b.order);

    return (
      <div className="min-w-0 flex-1 overflow-auto rounded-3xl border border-border bg-background shadow-sm h-full flex flex-col">
        <div className="flex items-center justify-between border-b border-border/70 bg-card/60 px-5 py-4 backdrop-blur-sm">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Board View</h3>
            <p className="text-xs text-muted-foreground">Drag tasks between columns to reorganize the project.</p>
          </div>
          <div className="text-xs text-muted-foreground">{projectTasks.length} tasks · {projectColumns.length} columns</div>
        </div>
        <div className="flex-1 overflow-auto p-6 min-h-[60vh]">
          <DragDropContext
            onDragEnd={(result) => {
              document.body.classList.remove('is-dragging');
              handleDragEnd(result);
            }}
            onDragStart={handleBoardDragStart}
            onDragUpdate={handleBoardDragUpdate}
          >
            <Droppable droppableId="board" type="column" direction="horizontal">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="flex gap-6 items-start h-full" data-no-pan="true">
                  {projectColumns.map((column, index) => {
                    const tasks = projectTasks.filter(task => task.columnId === column.id).sort((a, b) => a.order - b.order);
                    return (
                      <BoardColumn
                        key={column.id}
                        column={column}
                        tasks={tasks}
                        index={index}
                        onTaskClick={setSelectedTask}
                        canCreateTasks={false}
                        onAddClick={() => {
                          setAddTaskPopupColumnId(column.id);
                          setAssignSearch('');
                        }}
                      />
                    );
                  })}
                  {provided.placeholder}

                  {addingColumn ? (
                    <div className="flex-shrink-0 w-72 animate-fade-in bg-card border border-border rounded-2xl p-4">
                      <input
                        autoFocus
                        value={newColTitle}
                        onChange={e => setNewColTitle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleAddColumn();
                          if (e.key === 'Escape') setAddingColumn(false);
                        }}
                        placeholder="Column name..."
                        className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <div className="flex gap-2 mt-2">
                        <button onClick={handleAddColumn} className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-lg">Add</button>
                        <button onClick={() => setAddingColumn(false)} className="text-xs text-muted-foreground px-3 py-1.5 hover:bg-muted rounded-lg">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingColumn(true)}
                      className="flex-shrink-0 w-72 flex items-center justify-center gap-2 px-4 py-4 text-sm font-semibold text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-foreground/30 rounded-2xl transition-colors bg-card/40"
                    >
                      <Plus className="w-4 h-4" />
                      Add Column
                    </button>
                  )}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>
      </div>
    );
  };

  const renderList = () => (
    <div className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
      <ListView onTaskClick={setSelectedTask} projectId={selectedProject?.id} />
    </div>
  );

  const renderChat = () => (
    <div className="rounded-3xl border border-border bg-card shadow-sm flex flex-col" style={{ height: 'calc(100vh - 280px)', minHeight: 400 }}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <MessageCircle className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Project Chat</h3>
            <p className="text-xs text-muted-foreground">{selectedProject?.name} · {chatMessages.length} messages</p>
          </div>
        </div>
        <button onClick={() => setShowInviteModal(true)} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors">
          <Share2 className="h-3.5 w-3.5" />
          Invite
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {chatMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-10">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
              <MessageCircle className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-foreground">No messages yet</p>
            <p className="text-xs text-muted-foreground max-w-xs">Start the conversation with your project team. Share updates, ask questions, or leave notes.</p>
          </div>
        ) : (
          chatMessages.map(msg => {
            const isMe = msg.authorId === user?.id;
            return (
              <div key={msg.id} className={`flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}>
                <span className="text-[10px] text-muted-foreground px-1">{msg.authorName}</span>
                <div className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  isMe
                    ? 'bg-primary text-primary-foreground rounded-tr-sm'
                    : 'bg-muted text-foreground rounded-tl-sm'
                }`}>
                  {msg.text}
                </div>
                <span className="text-[10px] text-muted-foreground px-1">
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {' · '}
                  {new Date(msg.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                </span>
              </div>
            );
          })
        )}
        <div ref={chatBottomRef} />
      </div>

      <div className="p-4 border-t border-border flex-shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChatMessage(); }
            }}
            placeholder="Type a message…"
            rows={1}
            className="flex-1 bg-muted/50 border border-border rounded-2xl px-4 py-2.5 text-sm resize-none outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-colors"
            style={{ minHeight: 40, maxHeight: 120 }}
          />
          <button
            onClick={handleSendChatMessage}
            disabled={!chatInput.trim() || chatSending}
            className="p-2.5 bg-primary text-primary-foreground rounded-2xl hover:opacity-90 transition-all disabled:opacity-40 flex-shrink-0"
          >
            {chatSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2 text-center">Messages are stored locally for this project.</p>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-gradient-to-br from-background via-background to-muted/30 lg:flex-row">
      <aside className="flex w-full flex-col border-b border-border/70 bg-card/70 backdrop-blur-xl lg:w-80 lg:border-b-0 lg:border-r">
        <div className="border-b border-border/70 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <FolderKanban className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Projects</p>
              <h2 className="text-lg font-semibold text-foreground">Your workspace</h2>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-border bg-muted/20 px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input type="text" placeholder="Search projects" className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>{activeCount}/{projectLimit} projects in use</span>
            <button className="font-medium text-primary hover:underline" onClick={() => setLimitHint(v => !v)}>Plan limits</button>
          </div>
          {limitHint && (
            <div className="mt-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-700">
              {user?.subscriptionTier ? `Your ${user.subscriptionTier} plan allows up to ${projectLimit} projects.` : `Free plans allow up to ${projectLimit} projects.`}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-5">
            {sidebarBlock('Active Projects', activeProjects)}
            {sidebarBlock('Completed Projects', completedProjects)}
            {sidebarBlock('Archived', archivedProjects)}
          </div>
        </div>

        <div className="border-t border-border/70 p-4">
          {addingProject ? (
            <div className="rounded-2xl border border-border bg-background p-4">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">New project</label>
              <input value={newProjectName} onChange={e => setNewProjectName(e.target.value)} placeholder="Project name" className="mb-3 w-full rounded-xl border border-border bg-muted/20 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
              <div className="mb-3 flex items-center gap-2">
                {STORAGE_COLORS.map(color => (
                  <button
                    key={color}
                    onClick={() => setNewProjectColor(color)}
                    className={cn('h-7 w-7 rounded-full border-2 transition-all', newProjectColor === color ? 'border-foreground scale-110' : 'border-transparent')}
                    style={{ backgroundColor: color }}
                    aria-label={`Pick ${color}`}
                  />
                ))}
              </div>
              <textarea value={newProjectDescription} onChange={e => setNewProjectDescription(e.target.value)} placeholder="Short description" rows={3} className="mb-3 w-full rounded-xl border border-border bg-muted/20 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
              <div className="flex gap-2">
                <button onClick={handleAddProject} className="flex-1 rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90">Create</button>
                <button onClick={() => setAddingProject(false)} className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">Cancel</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => {
                if (!canAddProject) {
                  setLimitHint(true);
                  return;
                }
                setAddingProject(true);
              }}
              disabled={!canAddProject}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-3 text-sm font-semibold transition-all',
                canAddProject ? 'border-border text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-foreground' : 'border-amber-400/50 text-amber-600 opacity-70',
              )}
              title={!canAddProject ? 'You have reached your plan limit' : 'Add Project'}
            >
              <Plus className="h-4 w-4" />
              Add Project
            </button>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!selectedProject ? (
          <div className="flex flex-1 flex-col items-center justify-center bg-background p-8 text-center">
            <FolderKanban className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <h3 className="text-base font-semibold text-foreground">Join or create a project to get started.</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">Collaboration boards, tasks, and notes are available once you enter or create a project.</p>
          </div>
        ) : (
          <>
            <header className="border-b border-border/70 bg-background/80 px-5 py-4 backdrop-blur-xl lg:px-8 font-sans">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: selectedProject?.color || STORAGE_COLORS[0] }} />
                <h1 className="truncate text-xl font-semibold text-foreground">{selectedProject?.name || 'Project'}</h1>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{selectedProject?.description || 'A project workspace for tasks, goals, notes, and team updates.'}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{activeCount}</span>
                <span>/</span>
                <span>{projectLimit} projects</span>
                <Lock className="h-3.5 w-3.5 text-amber-500" />
              </div>
              <button onClick={() => setShowInviteModal(true)} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground">
                <Share2 className="h-3.5 w-3.5" />
                Share
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {[
              { id: 'home', label: 'Home', icon: LayoutDashboard },
              { id: 'board', label: 'Board', icon: FolderKanban },
              { id: 'list', label: 'List', icon: List },
              { id: 'chat', label: 'Chat', icon: Settings2 },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setCurrentTab(tab.id as ProjectTab)}
                className={cn('inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all', currentTab === tab.id ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground')}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
          {editingProjectId !== null && selectedProject?.id === editingProjectId && (
            <div className="mb-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Rename project</label>
              <div className="flex gap-2">
                <input autoFocus value={editingName} onChange={e => setEditingName(e.target.value)} onKeyDown={e => {
                  if (e.key === 'Enter') {
                    persistProject(selectedProject.id, { name: editingName }).finally(() => setEditingProjectId(null));
                  }
                  if (e.key === 'Escape') {
                    setEditingProjectId(null);
                    setEditingName('');
                  }
                }} className="flex-1 rounded-xl border border-border bg-muted/20 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
                <button onClick={() => persistProject(selectedProject.id, { name: editingName }).finally(() => setEditingProjectId(null))} className="rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-background">Save</button>
                <button onClick={() => setEditingProjectId(null)} className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">Cancel</button>
              </div>
            </div>
          )}

          {currentTab === 'home' && renderHome()}
          {currentTab === 'board' && renderBoard()}
          {currentTab === 'list' && renderList()}
          {currentTab === 'chat' && renderChat()}
        </main>
          </>
        )}
      </div>

      {projectToDelete !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setProjectToDelete(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-2xl text-center animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-7 h-7 text-destructive" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">Delete Project</h3>
            <p className="text-xs text-muted-foreground mb-6">
              Are you sure you want to delete this project? This will permanently remove all tasks and data.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setProjectToDelete(null)} className="flex-1 py-2.5 text-xs font-medium border rounded-xl text-muted-foreground border-border hover:bg-muted">Cancel</button>
              <button onClick={handleDeleteConfirm} className="flex-1 py-2.5 text-xs font-bold bg-destructive text-destructive-foreground rounded-xl hover:bg-destructive/90">Delete</button>
            </div>
          </div>
        </div>
      )}

      {projectToLeave !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setProjectToLeave(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-2xl text-center animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
              <X className="w-7 h-7 text-amber-600" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">Leave Project</h3>
            <p className="text-xs text-muted-foreground mb-6">
              Are you sure you want to leave this project? You will lose access to all project tasks and columns.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setProjectToLeave(null)} className="flex-1 py-2.5 text-xs font-medium border rounded-xl text-muted-foreground border-border hover:bg-muted">Cancel</button>
              <button onClick={handleLeaveConfirm} className="flex-1 py-2.5 text-xs font-bold bg-amber-600 text-white rounded-xl hover:bg-amber-700">Leave</button>
            </div>
          </div>
        </div>
      )}

      {selectedMember && selectedProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setSelectedMember(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-2xl animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <h3 className="text-lg font-bold text-foreground">Manage Member</h3>
              <button onClick={() => setSelectedMember(null)} className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col items-center text-center space-y-4 mb-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary text-xl font-bold">
                {selectedMember.name.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <h4 className="font-semibold text-foreground text-base">{selectedMember.name}</h4>
                <p className="text-xs text-muted-foreground">{selectedMember.email}</p>
              </div>

              <div className="w-full text-left space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Permission Level</label>
                <select
                  value={selectedMember.role}
                  onChange={async (e) => {
                    const newRole = e.target.value;
                    try {
                      const response = await fetch(`/api/projects/${selectedProject.id}/members/${selectedMember.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ role: newRole }),
                      });
                      if (response.ok) {
                        const data = await response.json();
                        setProjects(prev => prev.map(p => p.id === selectedProject.id ? data.project : p));
                        setSelectedMember(prev => prev ? { ...prev, role: newRole as any } : null);
                        toast({ title: 'Role updated', description: 'Permissions updated successfully.' });
                      }
                    } catch {
                      toast({ title: 'Update failed', description: 'Could not change member role.' });
                    }
                  }}
                  disabled={selectedMember.id === selectedProject.ownerId}
                  className="w-full bg-muted/40 border border-border rounded-xl p-2.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                >
                  <option value="owner">Owner</option>
                  <option value="view">View</option>
                  <option value="edit">Edit</option>
                  <option value="full edit">Full Edit</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>

            {selectedMember.id !== selectedProject.ownerId && (
              <button
                onClick={() => {
                  setMemberToRemove(selectedMember);
                  setSelectedMember(null);
                }}
                className="w-full py-2.5 text-xs font-bold text-destructive hover:bg-destructive/10 rounded-xl border border-destructive/20 transition-all text-center flex items-center justify-center gap-1.5"
              >
                <Trash2 className="h-4 w-4" />
                Remove Member
              </button>
            )}
          </div>
        </div>
      )}

      {memberToRemove && selectedProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setMemberToRemove(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-2xl text-center animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-7 h-7 text-destructive" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">Remove Member</h3>
            <p className="text-xs text-muted-foreground mb-6">
              Are you sure you want to remove <strong className="text-foreground">{memberToRemove.name}</strong> from this project? They will lose access to all project tasks and updates.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setMemberToRemove(null)} className="flex-1 py-2.5 text-xs font-medium border rounded-xl text-muted-foreground border-border hover:bg-muted">Cancel</button>
              <button
                onClick={async () => {
                  try {
                    const response = await fetch(`/api/projects/${selectedProject.id}/members/${memberToRemove.id}`, {
                      method: 'DELETE',
                      credentials: 'include',
                    });
                    if (response.ok) {
                      const data = await response.json();
                      setProjects(prev => prev.map(p => p.id === selectedProject.id ? data.project : p));
                      toast({ title: 'Member removed', description: 'The member has been removed successfully.' });
                    }
                  } catch {
                    toast({ title: 'Remove failed', description: 'Could not remove member.' });
                  }
                  setMemberToRemove(null);
                }}
                className="flex-1 py-2.5 text-xs font-bold bg-destructive text-destructive-foreground rounded-xl hover:bg-destructive/90"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {showInviteModal && selectedProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setShowInviteModal(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Share project</h3>
                <p className="text-sm text-muted-foreground">Invite by email or copy a join link.</p>
              </div>
              <button onClick={() => setShowInviteModal(false)} className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Invite by email</label>
                <div className="flex gap-2">
                  <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="name@example.com" className="flex-1 rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
                  <button onClick={handleInvite} disabled={inviteBusy || !inviteEmail.trim()} className="rounded-2xl bg-foreground px-4 py-3 text-sm font-semibold text-background disabled:opacity-50">
                    Invite
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Join link</label>
                <div className="flex gap-2">
                  <input readOnly value={`${window.location.origin}/projects?join=${selectedProject.inviteCode}`} className="flex-1 rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground outline-none" />
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(`${window.location.origin}/projects?join=${selectedProject.inviteCode}`);
                      toast({ title: 'Copied', description: 'Join link copied to clipboard.' });
                    }}
                    className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground"
                  >
                    <Copy className="h-4 w-4" />
                    Copy
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Task popup - choose Assign or Create */}
      {addTaskPopupColumnId && selectedProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setAddTaskPopupColumnId(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-2xl animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Add Task to Board</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Assign an existing task or create a brand new one.</p>
              </div>
              <button onClick={() => setAddTaskPopupColumnId(null)} className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-5">
              <button
                onClick={() => {
                  setCreateModalColumnId(addTaskPopupColumnId);
                  setAddTaskPopupColumnId(null);
                  setShowCreateModal(true);
                }}
                className="flex flex-col items-center gap-3 p-5 rounded-2xl border-2 border-border bg-muted/20 hover:border-primary/40 hover:bg-primary/5 transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Plus className="w-5 h-5 text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-foreground">Create New</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Build a fresh task</p>
                </div>
              </button>

              <button
                onClick={() => {}}
                className="flex flex-col items-center gap-3 p-5 rounded-2xl border-2 border-primary/30 bg-primary/5 transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Search className="w-5 h-5 text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-foreground">Assign Existing</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Pick from your tasks</p>
                </div>
              </button>
            </div>

            <div className="border-t border-border pt-4">
              <label className="text-[10px] font-bold text-muted-foreground uppercase mb-2 block">Your tasks not in this project</label>
              <div className="flex items-center gap-2 bg-muted/30 border border-border rounded-xl px-3 py-2 mb-3">
                <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <input
                  autoFocus
                  type="text"
                  value={assignSearch}
                  onChange={e => setAssignSearch(e.target.value)}
                  placeholder="Search tasks…"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {board.tasks
                  .filter(t => t.projectId !== selectedProject.id && (!assignSearch || t.title.toLowerCase().includes(assignSearch.toLowerCase())))
                  .slice(0, 20)
                  .map(t => (
                    <button
                      key={t.id}
                      onClick={() => {
                        updateTask(t.id, { projectId: selectedProject.id, columnId: addTaskPopupColumnId! });
                        toast({ title: 'Task assigned', description: `"${t.title}" added to this project.` });
                        setAddTaskPopupColumnId(null);
                      }}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-background hover:bg-muted/50 hover:border-primary/30 transition-all text-left"
                    >
                      <div className="w-2 h-2 rounded-full bg-muted-foreground/30 flex-shrink-0" />
                      <span className="text-sm text-foreground truncate">{t.title}</span>
                      {t.priority && t.priority !== 'none' && (
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                          t.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                          t.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                          t.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-muted text-muted-foreground'
                        }`}>{t.priority}</span>
                      )}
                    </button>
                  ))}
                {board.tasks.filter(t => t.projectId !== selectedProject.id && (!assignSearch || t.title.toLowerCase().includes(assignSearch.toLowerCase()))).length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">No tasks found. Create a new one above.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <CreateTaskModal
          open={showCreateModal}
          onClose={() => { setShowCreateModal(false); setCreateModalColumnId(undefined); }}
          defaultColumnId={createModalColumnId}
          defaultProjectId={selectedProject?.id}
        />
      )}

      {currentTask && <TaskDetailModal task={currentTask} onClose={() => setSelectedTask(null)} />}
    </div>
  );
};

const StatCard = ({ value, label }: { value: number; label: string }) => (
  <div className="rounded-2xl border border-border bg-muted/20 p-4">
    <div className="text-2xl font-semibold text-foreground">{value}</div>
    <div className="text-xs text-muted-foreground">{label}</div>
  </div>
);

const MenuItem = ({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) => (
  <button
    onClick={onClick}
    className={cn(
      'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium transition-colors',
      danger ? 'text-red-600 hover:bg-red-50' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    )}
  >
    {icon}
    {label}
  </button>
);

const EmptyState = ({ title, description }: { title: string; description: string }) => (
  <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4">
    <p className="text-sm font-medium text-foreground">{title}</p>
    <p className="mt-1 text-xs text-muted-foreground">{description}</p>
  </div>
);

export default Projects;
