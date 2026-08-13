import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DragDropContext, Droppable, DropResult, Draggable } from '@hello-pangea/dnd';
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDotDashed,
  Clock3,
  Copy,
  EyeOff,
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
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';
import BoardColumn from '@/components/BoardColumn';
import ListView from '@/components/ListView';
import { TaskFullView } from '@/pages/Tasks';
import CreateTaskModal from '@/components/CreateTaskModal';
import { useBoardContext } from '@/context/BoardContext';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { Label, LabelColor, DEFAULT_LABELS, Task } from '@/types/board';
import { fetchTags, createTag, deleteTag, updateTag } from '@/services/tagService';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CircleToggle } from '@/components/ToggleComponents';

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
  role: 'owner' | 'member' | 'view' | 'edit' | 'full edit' | 'admin';
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
const PROJECT_COLOR_OPTIONS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280', '#14b8a6', '#f43f5e'];
const PLAN_LIMITS: Record<'free' | 'premium' | 'pro', number> = { free: 5, premium: 10, pro: 20 };

const Projects: React.FC = () => {
  const { board, moveTask, reorderColumns, addColumn, updateTask, toggleChecklistItem, addChecklistItem, deleteChecklistItem, deleteTask } = useBoardContext();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [currentTab, setCurrentTab] = useState<ProjectTab>('home');
  const [showProjectMenuId, setShowProjectMenuId] = useState<number | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [showProjectColorPicker, setShowProjectColorPicker] = useState(false);
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

  const [milestones, setMilestones] = useState<{ id: number; name: string; date: string; description?: string; completed?: boolean }[]>([]);
  const [showMilestonePopup, setShowMilestonePopup] = useState(false);
  const [editingMilestoneId, setEditingMilestoneId] = useState<number | null>(null);
  const [newMilestoneName, setNewMilestoneName] = useState('');
  const [newMilestoneDate, setNewMilestoneDate] = useState('');
  const [newMilestoneDesc, setNewMilestoneDesc] = useState('');
  const [milestonesLoading, setMilestonesLoading] = useState(false);

  const [selectedMember, setSelectedMember] = useState<ProjectMember | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<ProjectMember | null>(null);

  const [projectToDelete, setProjectToDelete] = useState<number | null>(null);
  const [projectToLeave, setProjectToLeave] = useState<number | null>(null);

  const [projectOrder, setProjectOrder] = useState<number[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (!user?.id) return false;
    try { return localStorage.getItem(`sidebar_collapsed_${user.id}`) === 'true'; } catch { return false; }
  });

  // Board "Add Task" popup state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createModalColumnId, setCreateModalColumnId] = useState<string | undefined>(undefined);

  // Project chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Board pan/zoom state
  const [boardZoom, setBoardZoom] = useState(1);
  const [boardOffset, setBoardOffset] = useState({ x: 48, y: 32 });
  const [isBoardPanning, setIsBoardPanning] = useState(false);
  const boardPanStart = useRef({ x: 0, y: 0 });
  const boardCanvasRef = useRef<HTMLDivElement>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 2;
  const ZOOM_STEP = 0.1;

  const TAG_COLOR_OPTIONS: LabelColor[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'];
  const randomTagColor = (): LabelColor => TAG_COLOR_OPTIONS[Math.floor(Math.random() * TAG_COLOR_OPTIONS.length)] || 'blue';
  const normalizeTagName = (value: string) => value.trim().replace(/\s+/g, ' ');
  const SHARED_TAG_PREFIX = 'shared-tag-';
  const SHARED_COLOR_MAP: Record<string, LabelColor> = { red: 'red', orange: 'orange', yellow: 'yellow', green: 'green', blue: 'blue', purple: 'purple', pink: 'pink' };
  const SHARED_COLOR_HEX_MAP: Array<{ hex: string; color: LabelColor }> = [
    { hex: '#ef4444', color: 'red' },
    { hex: '#f97316', color: 'orange' },
    { hex: '#eab308', color: 'yellow' },
    { hex: '#22c55e', color: 'green' },
    { hex: '#3b82f6', color: 'blue' },
    { hex: '#8b5cf6', color: 'purple' },
    { hex: '#ec4899', color: 'pink' },
  ];
  const sharedTagLabelId = (id: number) => `${SHARED_TAG_PREFIX}${id}`;
  const sharedTagToLabel = (tag: { id: number; name: string; color: string }): Label => ({
    id: sharedTagLabelId(tag.id),
    name: tag.name,
    color: SHARED_COLOR_MAP[tag.color.toLowerCase()]
      || SHARED_COLOR_HEX_MAP.find(item => item.hex.toLowerCase() === tag.color.toLowerCase())?.color
      || 'blue',
  });

  const [sharedTags, setSharedTags] = useState<{ id: number; name: string; color: string }[]>([]);

  useEffect(() => {
    const loadSharedTags = async () => {
      try {
        setSharedTags(await fetchTags());
      } catch {
        setSharedTags([]);
      }
    };
    loadSharedTags();
  }, []);
  useEffect(() => {
    if (showProjectMenuId === null) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (projectMenuRef.current && projectMenuRef.current.contains(target)) return;
      if (target && target.closest('[data-project-menu-toggle]')) return;
      setShowProjectMenuId(null);
    };

    const handleScroll = () => setShowProjectMenuId(null);

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [showProjectMenuId]);

  useEffect(() => {
    if (user?.id) {
      try {
        const saved = localStorage.getItem(`project_order_${user.id}`);
        if (saved) setProjectOrder(JSON.parse(saved));
      } catch {}
    }
  }, [user?.id]);

  useEffect(() => {
    if (!selectedProjectId) { setMilestones([]); return; }
    setMilestonesLoading(true);
    fetch(`/api/milestones/${selectedProjectId}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : { milestones: [] })
      .then(d => setMilestones(d.milestones || []))
      .catch(() => setMilestones([]))
      .finally(() => setMilestonesLoading(false));
  }, [selectedProjectId]);
  const mainScrollRef = useRef<HTMLElement>(null);
  const scrollMemoryRef = useRef<Record<string, number>>({});
  const prevProjectIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (mainScrollRef.current && prevProjectIdRef.current !== null) {
      scrollMemoryRef.current[String(prevProjectIdRef.current)] = mainScrollRef.current.scrollTop;
    }
    prevProjectIdRef.current = selectedProjectId;
    const saved = selectedProjectId !== null ? scrollMemoryRef.current[String(selectedProjectId)] : 0;
    requestAnimationFrame(() => {
      if (mainScrollRef.current) {
        mainScrollRef.current.scrollTop = saved ?? 0;
      }
    });
  }, [selectedProjectId]);
  // Board zoom with wheel
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setBoardZoom(z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(z - e.deltaY * 0.001).toFixed(3))));
      }
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);

  const handleBoardPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-pan-enabled="true"]')) {
      // Allow panning on expanded content
    } else if ((e.target as HTMLElement).closest('[data-no-pan="true"]')) {
      return;
    }
    setIsBoardPanning(true);
    boardPanStart.current = { x: e.clientX - boardOffset.x, y: e.clientY - boardOffset.y };
  };

  const handleBoardPointerMove = (e: PointerEvent) => {
    if (isBoardPanning) {
      setBoardOffset({ x: e.clientX - boardPanStart.current.x, y: e.clientY - boardPanStart.current.y });
    }
  };

  const handleBoardPointerUp = () => {
    setIsBoardPanning(false);
  };

  // Use window-level pointer events so panning works even when expanded content captures React events
  useEffect(() => {
    if (!isBoardPanning) return;
    const onMove = (e: PointerEvent) => {
      setBoardOffset({ x: e.clientX - boardPanStart.current.x, y: e.clientY - boardPanStart.current.y });
    };
    const onUp = () => setIsBoardPanning(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [isBoardPanning]);

  const handleAddColumn = () => {
    if (newColTitle.trim() && selectedProjectId) {
      addColumn(newColTitle.trim(), selectedProjectId);
      setNewColTitle('');
      setAddingColumn(false);
    }
  };

  const openProjectMenu = (e: React.MouseEvent<HTMLButtonElement>, projectId: number) => {
    e.stopPropagation();
    if (showProjectMenuId !== projectId) {
      const rowEl = (e.currentTarget as HTMLElement).closest('[data-project-row]') as HTMLElement | null;
      const rect = (rowEl || e.currentTarget).getBoundingClientRect();
      const asideEl = rowEl?.closest('aside') as HTMLElement | null;
      const asideRect = asideEl?.getBoundingClientRect();
      const mainRect = mainScrollRef.current?.getBoundingClientRect();
      let left = rect.right + 12;
      if (asideRect && mainRect) {
        // Roughly the middle of the gap between the project list panel and the board content.
        const boardContentLeft = mainRect.left + 24; // matches the p-6 padding of the main area
        left = (asideRect.right + boardContentLeft) / 2;
        // Keep a clear minimum gap from the project list edge.
        left = Math.max(left, rect.right + 20);
      }
      // Keep the menu on screen.
      left = Math.min(left, window.innerWidth - 280);
      setMenuPos({
        top: Math.max(8, Math.min(rect.top, window.innerHeight - 300)),
        left,
      });
      setShowProjectColorPicker(false);
    }
    setShowProjectMenuId(prev => prev === projectId ? null : projectId);
  };

  const handleAddMilestone = async (name: string, date: string, description?: string) => {
    if (!selectedProjectId) return;
    try {
      const res = await fetch(`/api/milestones/${selectedProjectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, date, description }),
      });
      const data = await res.json();
      if (data.milestone) setMilestones(prev => [...prev, data.milestone]);
    } catch {
      toast({ title: 'Error', description: 'Failed to create milestone' });
    }
  };

  const handleToggleMilestone = async (milestone: { id: number; completed?: boolean }) => {
    if (!selectedProjectId) return;
    const next = !milestone.completed;
    setMilestones(prev => prev.map(m => m.id === milestone.id ? { ...m, completed: next } : m));
    try {
      await fetch(`/api/milestones/${selectedProjectId}/${milestone.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ completed: next }),
      });
    } catch {
      setMilestones(prev => prev.map(m => m.id === milestone.id ? { ...m, completed: !next } : m));
      toast({ title: 'Error', description: 'Failed to update milestone' });
    }
  };

  const handleUpdateMilestone = async (id: number, name: string, date: string, description?: string) => {
    if (!selectedProjectId) return;
    setMilestones(prev => prev.map(m => m.id === id ? { ...m, name, date, description } : m));
    try {
      await fetch(`/api/milestones/${selectedProjectId}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, date, description: description || null }),
      });
    } catch {
      toast({ title: 'Error', description: 'Failed to update milestone' });
    }
  };

  const planTier = (user?.subscriptionTier === 'pro'
    ? 'pro'
    : user?.subscriptionTier === 'premium'
      ? 'premium'
      : 'free') as 'free' | 'premium' | 'pro';
  const projectLimit = PLAN_LIMITS[planTier];
  const activeCount = projects.filter(project => !project.archived).length;
  const canAddProject = activeCount < projectLimit;
  const isPremium = user?.subscriptionTier === 'premium' || user?.subscriptionTier === 'pro';
  const isPro = user?.subscriptionTier === 'pro';

  const allTags = useMemo(() => {
    const byName = new Map<string, Label>();
    DEFAULT_LABELS.forEach(label => byName.set(normalizeTagName(label.name).toLowerCase(), label));
    board.tasks.forEach(task => task.labels.forEach(label => {
      const key = normalizeTagName(label.name).toLowerCase();
      if (!byName.has(key)) byName.set(key, label);
    }));
    sharedTags.forEach(tag => {
      const label = sharedTagToLabel(tag);
      const key = normalizeTagName(label.name).toLowerCase();
      byName.set(key, label);
    });
    return Array.from(byName.values());
  }, [board.tasks, sharedTags]);

  const toggleTaskTag = (taskId: string, label: Label) => {
    const task = board.tasks.find(item => item.id === taskId);
    if (!task) return;
    const has = task.labels.some(item => item.id === label.id);
    const nextLabels = has ? task.labels.filter(item => item.id !== label.id) : [...task.labels, label];
    updateTask(taskId, { labels: nextLabels });
  };

  const createSharedTaskLabel = async (name: string, color: LabelColor): Promise<Label> => {
    const tag = await createTag({ name, color });
    return sharedTagToLabel(tag);
  };

  const deleteTagEverywhere = async (tagId: string) => {
    if (tagId.startsWith(SHARED_TAG_PREFIX)) {
      const sharedTagId = Number(tagId.slice(SHARED_TAG_PREFIX.length));
      if (!Number.isNaN(sharedTagId)) {
        try { await deleteTag(sharedTagId); } catch { return; }
      }
    }
    board.tasks.forEach(task => {
      if (task.labels.some(label => label.id === tagId)) {
        updateTask(task.id, { labels: task.labels.filter(label => label.id !== tagId) });
      }
    });
  };

  const renameTagEverywhere = async (tagId: string, newName: string) => {
    const name = normalizeTagName(newName);
    if (!name) return;

    if (tagId.startsWith(SHARED_TAG_PREFIX)) {
      const sharedTagId = Number(tagId.slice(SHARED_TAG_PREFIX.length));
      if (!Number.isNaN(sharedTagId)) {
        try {
          const updated = await updateTag(sharedTagId, { name });
          setSharedTags(prev => prev.map(tag => tag.id === sharedTagId ? { ...tag, name: updated.name } : tag));
        } catch { return; }
      }
    }

    board.tasks.forEach(task => {
      if (task.labels.some(label => label.id === tagId)) {
        updateTask(task.id, { labels: task.labels.map(label => label.id === tagId ? { ...label, name } : label) });
      }
    });
  };

  const changeTagColorEverywhere = async (tagId: string, color: LabelColor) => {
    if (tagId.startsWith(SHARED_TAG_PREFIX)) {
      const sharedTagId = Number(tagId.slice(SHARED_TAG_PREFIX.length));
      if (!Number.isNaN(sharedTagId)) {
        try {
          const updated = await updateTag(sharedTagId, { color });
          setSharedTags(prev => prev.map(tag => tag.id === sharedTagId ? { ...tag, color: updated.color } : tag));
        } catch { return; }
      }
    }

    board.tasks.forEach(task => {
      if (task.labels.some(label => label.id === tagId)) {
        updateTask(task.id, { labels: task.labels.map(label => label.id === tagId ? { ...label, color } : label) });
      }
    });
  };

  const selectedProject = useMemo(
    () => projects.find(project => project.id === selectedProjectId) || projects[0] || null,
    [projects, selectedProjectId],
  );

  // Derive current user's role and edit permissions
  const currentUserMember = selectedProject?.members.find(m => m.id === user?.id);
  const currentUserRole: string = selectedProject?.ownerId === user?.id
    ? 'owner'
    : currentUserMember?.role || 'view';
  // Only owner, edit, full edit, and admin can edit - 'view' and 'member' are read-only
  const canEdit = ['owner', 'edit', 'full edit', 'admin'].includes(currentUserRole);
  const canManage = currentUserRole === 'owner';
  const canCreateTasks = canEdit;

  const currentTask = selectedTask ? board.tasks.find(t => t.id === selectedTask.id) : null;
  const projectTasks = useMemo(
    () => board.tasks.filter(task => task.projectId === selectedProject?.id),
    [board.tasks, selectedProject?.id]
  );

  // Load/save chat messages per project
  useEffect(() => {
    if (!selectedProjectId) return;
    const fetchMessages = async () => {
      try {
        const res = await fetch(`/api/projects/${selectedProjectId}/chat`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setChatMessages((data.messages || []).map((m: any) => ({ id: String(m.id), text: m.message, authorName: m.authorName, authorId: m.userId, createdAt: m.createdAt })));
        }
      } catch {}
    };
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [selectedProjectId]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSendChatMessage = async () => {
    const text = chatInput.trim();
    if (!text || chatSending || !selectedProjectId || !user) return;
    setChatSending(true);
    try {
      const res = await fetch(`/api/projects/${selectedProjectId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: text }),
      });
      if (res.ok) {
        const data = await res.json();
        setChatMessages(prev => [...prev, { id: String(data.message.id), text: data.message.message, authorName: data.message.authorName, authorId: data.message.userId, createdAt: data.message.createdAt }]);
        setChatInput('');
      }
    } catch {}
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
  }, []);

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

  // Active = not archived AND not completed; they appear in Completed section once marked complete
  const activeProjects = sortProjects(projects.filter(project => !project.archived && !project.completed));
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
                          data-project-row
                          onClick={() => setSelectedProjectId(project.id)}
                          className={cn(
                            'group relative cursor-pointer rounded-2xl border px-3 py-3 transition-all',
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
                                {editingProjectId === project.id ? (
                                  <input
                                    autoFocus
                                    value={editingName}
                                    onChange={e => setEditingName(e.target.value)}
                                    onClick={e => e.stopPropagation()}
                                    onBlur={() => {
                                      if (editingName.trim() && editingName.trim() !== project.name) {
                                        persistProject(project.id, { name: editingName.trim() });
                                      }
                                      setEditingProjectId(null);
                                    }}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') {
                                        if (editingName.trim() && editingName.trim() !== project.name) {
                                          persistProject(project.id, { name: editingName.trim() });
                                        }
                                        setEditingProjectId(null);
                                      }
                                      if (e.key === 'Escape') {
                                        setEditingName(project.name);
                                        setEditingProjectId(null);
                                      }
                                    }}
                                    className="min-w-0 flex-1 rounded-lg border border-border bg-muted/40 px-2 py-1 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                                  />
                                ) : (
                                  <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
                                )}
                                {project.completed && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                                {project.archived && <Lock className="h-3.5 w-3.5 text-amber-500" />}
                              </div>
                              <p className="truncate text-xs text-muted-foreground">{project.description}</p>
                            </div>
                  <div className="flex items-center gap-1 opacity-0 transition-all group-hover:opacity-100">
                              <button
                                data-project-menu-toggle
                                onClick={(e) => openProjectMenu(e, project.id)}
                                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
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
                data-project-row
                onClick={() => setSelectedProjectId(project.id)}
                className={cn(
                  'group relative cursor-pointer rounded-2xl border px-3 py-3 transition-all',
                  selectedProject?.id === project.id ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-background hover:border-primary/30 hover:bg-muted/40',
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {editingProjectId === project.id ? (
                        <input
                          autoFocus
                          value={editingName}
                          onChange={e => setEditingName(e.target.value)}
                          onClick={e => e.stopPropagation()}
                          onBlur={() => {
                            if (editingName.trim() && editingName.trim() !== project.name) {
                              persistProject(project.id, { name: editingName.trim() });
                            }
                            setEditingProjectId(null);
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              if (editingName.trim() && editingName.trim() !== project.name) {
                                persistProject(project.id, { name: editingName.trim() });
                              }
                              setEditingProjectId(null);
                            }
                            if (e.key === 'Escape') {
                              setEditingName(project.name);
                              setEditingProjectId(null);
                            }
                          }}
                          className="min-w-0 flex-1 rounded-lg border border-border bg-muted/40 px-2 py-1 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      ) : (
                        <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
                      )}
                      {project.completed && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                      {project.archived && <Lock className="h-3.5 w-3.5 text-amber-500" />}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{project.description}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 transition-all group-hover:opacity-100">
                              <button
                                data-project-menu-toggle
                                onClick={(e) => openProjectMenu(e, project.id)}
                                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderHome = () => (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          {/* Status badges + view-only notice */}
          {(selectedProject?.completed || selectedProject?.archived || !canEdit) && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {selectedProject?.completed && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />Completed
                </span>
              )}
              {selectedProject?.archived && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600">
                  <Lock className="h-3.5 w-3.5" />Archived
                </span>
              )}
              {!canEdit && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-600">
                  <EyeOff className="h-3.5 w-3.5" />View only
                </span>
              )}
            </div>
          )}

          <div className="grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)]">
            <div className="space-y-3 xl:pt-1">
              <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Members</label>
              <div className="space-y-2">
                {selectedProject?.members.length ? selectedProject.members.map(member => (
                  <button
                    key={member.id}
                    onClick={() => {
                      if (canManage) {
                        setSelectedMember(member);
                      }
                    }}
                    className={cn(
                      'group flex w-full items-center gap-2 rounded-full border border-border bg-muted/20 px-3 py-2 text-xs text-left transition-all',
                      canManage ? 'hover:border-primary/40 hover:bg-muted/50 cursor-pointer' : 'cursor-default'
                    )}
                  >
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background flex-shrink-0">
                      {member.name.slice(0, 1).toUpperCase()}
                    </div>
                    <span className="text-foreground font-medium truncate">{member.name}</span>
                    <span className="text-muted-foreground capitalize ml-auto flex-shrink-0">{member.role}</span>
                  </button>
                )) : (
                  <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-xs text-muted-foreground">
                    No members yet
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-2">Project Description</label>
              <textarea
                value={selectedProject?.description || ''}
                onChange={e => { if (canEdit) updateSelectedProject({ description: e.target.value }); }}
                readOnly={!canEdit || Boolean(selectedProject?.archived || selectedProject?.completed)}
                rows={4}
                className="w-full rounded-2xl border border-border bg-muted/30 px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 read-only:cursor-not-allowed read-only:opacity-75"
                placeholder={canEdit ? 'What is this project about?' : 'No description'}
              />
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
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              {completedTasks} completed, {Math.max(0, totalTasks - completedTasks)} remaining
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">Milestones</h3>
              {milestonesLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              {canEdit && (
              <button
                onClick={() => {
                  setNewMilestoneName('');
                  setNewMilestoneDate('');
                  setNewMilestoneDesc('');
                  setShowMilestonePopup(true);
                }}
                className="text-xs font-semibold text-primary hover:underline"
              >
                Add milestone
              </button>
            )}
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {milestones.length > 0 ? (
              milestones.map(milestone => (
                <div key={milestone.id} className={`flex items-start justify-between rounded-xl border p-3 transition-all ${milestone.completed ? 'border-label-green/20 bg-label-green/5' : 'border-border bg-muted/10 hover:bg-muted/20'}`}>
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <div onClick={e => e.stopPropagation()} className="mt-0.5">
                      <CircleToggle
                        completed={!!milestone.completed}
                        onClick={() => handleToggleMilestone(milestone)}
                        size="sm"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-semibold truncate ${milestone.completed ? 'text-muted-foreground/60 line-through' : 'text-foreground'}`}>{milestone.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(milestone.date + 'T12:00:00').toLocaleDateString()}
                      </p>
                      {milestone.description && <p className={`text-[10px] mt-1 break-words ${milestone.completed ? 'text-muted-foreground/50' : 'text-muted-foreground/80'}`}>{milestone.description}</p>}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                      <button
                        onClick={() => {
                          setEditingMilestoneId(milestone.id);
                          setNewMilestoneName(milestone.name);
                          setNewMilestoneDate(milestone.date);
                          setNewMilestoneDesc(milestone.description || '');
                          setShowMilestonePopup(true);
                        }}
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                        title="Edit milestone"
                      >
                        <SquarePen className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={async () => {
                          if (!selectedProjectId) return;
                          try {
                            await fetch(`/api/milestones/${selectedProjectId}/${milestone.id}`, {
                              method: 'DELETE',
                              credentials: 'include',
                            });
                            setMilestones(prev => prev.filter(m => m.id !== milestone.id));
                          } catch {
                            toast({ title: 'Error', description: 'Failed to delete milestone' });
                          }
                        }}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        title="Delete milestone"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <EmptyState title="No milestones yet" description={canEdit ? 'Add checkpoints to track project progress.' : 'No milestones have been set for this project.'} />
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
    const boardZoomPercent = Math.round(boardZoom * 100);

    return (
      <div className="min-w-0 flex-1 rounded-3xl border border-border bg-background shadow-sm h-full flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/70 bg-card/60 px-5 py-4 backdrop-blur-sm">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Board View</h3>
            <p className="text-xs text-muted-foreground">Drag tasks between columns to reorganize the project.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-muted-foreground">{projectTasks.length} tasks · {projectColumns.length} columns</div>
            <div className="flex items-center gap-1 bg-background border border-border rounded-xl px-1.5 py-1">
              <button onClick={() => setBoardZoom(z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2))))} disabled={boardZoom <= MIN_ZOOM} className="p-1 rounded-lg hover:bg-muted disabled:opacity-30 transition-all">
                <ZoomOut className="w-4 h-4 text-muted-foreground" />
              </button>
              <button onClick={() => { setBoardZoom(1); setBoardOffset({ x: 0, y: 0 }); }} className="px-2 py-1 text-xs font-bold tabular-nums text-foreground hover:text-primary min-w-[44px] text-center">
                {boardZoomPercent}%
              </button>
              <button onClick={() => setBoardZoom(z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(z + ZOOM_STEP).toFixed(2))))} disabled={boardZoom >= MAX_ZOOM} className="p-1 rounded-lg hover:bg-muted disabled:opacity-30 transition-all">
                <ZoomIn className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>
        <div
          ref={boardCanvasRef}
          className="flex-1 relative overflow-hidden select-none"
          onPointerDown={handleBoardPointerDown}
          style={{
            backgroundImage: 'radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)',
            backgroundSize: `${24 * boardZoom}px ${24 * boardZoom}px`,
            backgroundPosition: `${boardOffset.x}px ${boardOffset.y}px`,
            cursor: isBoardPanning ? 'grabbing' : 'grab',
          }}
        >
          <div
            style={{ transform: `translate(${boardOffset.x}px, ${boardOffset.y}px) scale(${boardZoom})`, transformOrigin: '0 0' }}
            className="min-w-max min-h-max"
          >
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
                  <div ref={provided.innerRef} {...provided.droppableProps} className="flex gap-6 items-start">
                    {projectColumns.map((column, index) => {
                      const tasks = projectTasks.filter(task => task.columnId === column.id).sort((a, b) => a.order - b.order);
                      return (
                        <BoardColumn
                          key={column.id}
                          column={column}
                          tasks={tasks}
                          index={index}
                          onTaskClick={setSelectedTask}
                          canCreateTasks={canCreateTasks}
                          canEdit={canEdit}
                          onAddClick={canCreateTasks ? () => {
                            setCreateModalColumnId(column.id);
                            setShowCreateModal(true);
                          } : undefined}
                        />
                      );
                    })}
                    {provided.placeholder}

                    {addingColumn ? (
                      <div className="flex-shrink-0 w-80 animate-fade-in bg-card border border-border rounded-2xl p-4" data-no-pan="true">
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
                        data-no-pan="true"
                        className="flex-shrink-0 w-80 flex items-center justify-center gap-2 px-4 py-4 text-sm font-semibold text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-foreground/30 rounded-2xl transition-colors bg-card/40"
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
      </div>
    );
  };

  const renderList = () => (
    <ListView onTaskClick={setSelectedTask} projectId={selectedProject?.id} onAddTask={canCreateTasks ? () => setShowCreateModal(true) : undefined} />
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
        {canManage && (
          <button onClick={() => setShowInviteModal(true)} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors">
            <Share2 className="h-3.5 w-3.5" />
            Invite
          </button>
        )}
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
        <p className="text-[10px] text-muted-foreground mt-2 text-center">Messages are shared with all project members.</p>
      </div>
    </div>
  );

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-gradient-to-br from-background via-background to-muted/30 lg:flex-row">
      <aside className={cn(
        'flex flex-col border-b border-border/70 bg-card/70 backdrop-blur-xl lg:border-b-0 lg:border-r transition-all duration-300',
        sidebarCollapsed ? 'lg:w-16' : 'lg:w-80 w-full'
      )}>
        <div className="border-b border-border/70 px-5 h-16 flex items-center justify-between flex-shrink-0">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary flex-shrink-0">
                <FolderKanban className="h-4 w-4" />
              </div>
<div className="flex items-baseline gap-2 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground whitespace-nowrap">Projects</p>
              <h2 className="text-sm font-semibold text-foreground truncate">Your workspace</h2>
            </div>
            </div>
          )}
          <button
            onClick={() => {
              const next = !sidebarCollapsed;
              setSidebarCollapsed(next);
              if (user?.id) localStorage.setItem(`sidebar_collapsed_${user.id}`, String(next));
            }}
            className="p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {!sidebarCollapsed && (
          <>
            <div className="px-4 pt-3 pb-1">
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/20 px-3 py-2">
                <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <input type="text" placeholder="Search projects" className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
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
          </>
        )}

        {sidebarCollapsed && (
          <div className="flex-1 flex flex-col items-center gap-1 py-3 px-1">
            {projects.slice(0, 8).map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedProjectId(p.id)}
                className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center transition-all',
                  selectedProjectId === p.id ? 'bg-primary/20 ring-2 ring-primary/40' : 'hover:bg-muted'
                )}
                title={p.name}
              >
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
              </button>
            ))}
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!selectedProject ? (
          <div className="flex flex-1 flex-col bg-background">
            <div className="h-16 border-b border-border/70 shrink-0" />
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <FolderKanban className="h-12 w-12 text-muted-foreground/40 mb-3" />
              <h3 className="text-base font-semibold text-foreground">Join or create a project to get started.</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">Collaboration boards, tasks, and notes are available once you enter or create a project.</p>
            </div>
          </div>
        ) : (
          <>
            <header className="h-16 border-b border-border/70 bg-background/80 px-5 backdrop-blur-xl lg:px-8">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const next = !sidebarCollapsed;
                      setSidebarCollapsed(next);
                      if (user?.id) localStorage.setItem(`sidebar_collapsed_${user.id}`, String(next));
                    }}
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors lg:hidden"
                  >
                    <FolderKanban className="h-4 w-4" />
                  </button>
                  {!canEdit && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      <EyeOff className="h-3 w-3" />
                      View only
                    </span>
                  )}
                  {[
                    { id: 'home', label: 'Home', icon: LayoutDashboard },
                    { id: 'board', label: 'Board', icon: FolderKanban },
                    { id: 'list', label: 'List', icon: List },
                    { id: 'chat', label: 'Chat', icon: MessageCircle },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setCurrentTab(tab.id as ProjectTab)}
                      className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all', currentTab === tab.id ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground')}
                    >
                      <tab.icon className="h-3.5 w-3.5" />
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  {canManage && (
                    <button onClick={() => setShowInviteModal(true)} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors">
                      <Share2 className="h-3.5 w-3.5" />
                      Share
                    </button>
                  )}
                </div>
              </div>
            </header>

            <main ref={mainScrollRef} className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6 relative" style={{ scrollbarGutter: 'stable' }}>
              {currentTab === 'home' && renderHome()}
              {currentTab === 'board' && renderBoard()}
              {currentTab === 'list' && renderList()}
              {currentTab === 'chat' && renderChat()}
            </main>
          </>
        )}
      </div>

      {/* Milestone popup - fixed overlay */}
      {showMilestonePopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => { setShowMilestonePopup(false); setEditingMilestoneId(null); }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <span className="text-base font-bold text-foreground">{editingMilestoneId ? 'Edit Milestone' : 'New Milestone'}</span>
              <button onClick={() => { setShowMilestonePopup(false); setEditingMilestoneId(null); }} className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Name</label>
                <input
                  autoFocus
                  type="text"
                  value={newMilestoneName}
                  onChange={e => setNewMilestoneName(e.target.value)}
                  placeholder="Milestone name"
                  className="w-full bg-muted/30 border border-border rounded-xl p-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Date</label>
                <div className="relative">
                  <input
                    type="date"
                    value={newMilestoneDate}
                    onChange={e => setNewMilestoneDate(e.target.value)}
                    className="w-full bg-muted/30 border border-border rounded-xl p-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                  <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Description (optional)</label>
                <textarea
                  value={newMilestoneDesc}
                  onChange={e => setNewMilestoneDesc(e.target.value)}
                  placeholder="Describe this milestone…"
                  rows={2}
                  className="w-full bg-muted/30 border border-border rounded-xl p-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/20 outline-none resize-none"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => {
                    if (newMilestoneName.trim() && newMilestoneDate) {
                      if (editingMilestoneId) {
                        handleUpdateMilestone(editingMilestoneId, newMilestoneName.trim(), newMilestoneDate, newMilestoneDesc.trim() || undefined);
                      } else {
                        handleAddMilestone(newMilestoneName.trim(), newMilestoneDate, newMilestoneDesc.trim() || undefined);
                      }
                      setShowMilestonePopup(false);
                      setEditingMilestoneId(null);
                    }
                  }}
                  disabled={!newMilestoneName.trim() || !newMilestoneDate}
                  className="flex-1 bg-foreground text-background text-sm font-bold py-2.5 rounded-xl disabled:opacity-50 hover:opacity-90 transition-colors"
                >
                  {editingMilestoneId ? 'Update Milestone' : 'Save Milestone'}
                </button>
                <button
                  onClick={() => { setShowMilestonePopup(false); setEditingMilestoneId(null); }}
                  className="px-4 py-2.5 text-sm border border-border text-muted-foreground rounded-xl hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                <Select
                  value={selectedMember.role}
                  onValueChange={async (newRole) => {
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
                >
                  <SelectTrigger className="w-full bg-muted/40 border border-border rounded-xl p-2.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer h-10">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Owner</SelectItem>
                    <SelectItem value="view">View only</SelectItem>
                    <SelectItem value="edit">Edit</SelectItem>
                    <SelectItem value="full edit">Full Edit</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground ml-1 mt-1">
                  View only members can read but cannot edit tasks, descriptions, or milestones.
                </p>
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

      {showCreateModal && (
        <CreateTaskModal
          open={showCreateModal}
          onClose={() => { setShowCreateModal(false); setCreateModalColumnId(undefined); }}
          defaultColumnId={createModalColumnId}
          defaultProjectId={selectedProject?.id}
        />
      )}
      
      {currentTask && (
        <TaskFullView
          task={currentTask}
          boardColumns={board.columns}
          projects={projects.map(p => ({ id: p.id, name: p.name, color: p.color, description: p.description }))}
          allTags={allTags}
          onClose={() => setSelectedTask(null)}
          onUpdateTask={(taskId, updates) => updateTask(taskId, updates)}
          onToggleChecklistItem={toggleChecklistItem}
          onAddChecklistItem={addChecklistItem}
          onDeleteChecklistItem={deleteChecklistItem}
          onDeleteTask={taskId => { deleteTask(taskId); setSelectedTask(null); }}
          onToggleTag={toggleTaskTag}
          onCreateTag={async (taskId, name, color) => {
            const label = await createSharedTaskLabel(name, color);
            const task = board.tasks.find(item => item.id === taskId);
            if (task) updateTask(taskId, { labels: [...task.labels, label] });
          }}
          onDeleteTagEverywhere={deleteTagEverywhere}
          onRenameTagEverywhere={renameTagEverywhere}
          onColorChangeTagEverywhere={changeTagColorEverywhere}
          isPremium={isPremium}
          isPro={isPro}
        />
      )}

      {showProjectMenuId !== null && menuPos && (() => {
        const menuProject = projects.find(project => project.id === showProjectMenuId);
        if (!menuProject) return null;
        if (showProjectColorPicker) {
          return (
            <div
              ref={projectMenuRef}
              style={{ top: menuPos.top, left: menuPos.left }}
              className="fixed z-50 min-w-[180px] rounded-xl border border-border bg-popover p-3 shadow-2xl"
            >
              <p className="text-[10px] font-bold text-muted-foreground uppercase mb-2">Project Color</p>
              <div className="flex flex-wrap gap-2">
                {PROJECT_COLOR_OPTIONS.map(c => (
                  <button
                    key={c}
                    onClick={() => {
                      updateSelectedProject({ color: c });
                      setShowProjectColorPicker(false);
                      setShowProjectMenuId(null);
                    }}
                    className={`w-7 h-7 rounded-full border-2 transition-all hover:scale-110 ${menuProject.color === c ? 'border-foreground ring-2 ring-primary/30' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          );
        }
        return (
          <div
            ref={projectMenuRef}
            style={{ top: menuPos.top, left: menuPos.left }}
            className="fixed z-50 min-w-[220px] overflow-hidden rounded-2xl border border-gray-200 bg-white py-1 shadow-lg shadow-black/10"
          >
            <MenuItem icon={<SquarePen className="h-4 w-4" />} label="Rename" onClick={() => {
              setEditingProjectId(menuProject.id);
              setEditingName(menuProject.name);
              setShowProjectMenuId(null);
            }} />
            <MenuItem icon={<div className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: menuProject.color }} />} label="Recolour" onClick={() => {
              setShowProjectColorPicker(true);
            }} />
            <MenuItem icon={<Lock className="h-4 w-4" />} label={menuProject.archived ? 'Unarchive' : 'Archive'} onClick={async () => {
              await persistProject(menuProject.id, { archived: !menuProject.archived });
              setShowProjectMenuId(null);
            }} />
            <MenuItem icon={<CheckCircle2 className="h-4 w-4" />} label={menuProject.completed ? 'Reopen' : 'Mark complete'} onClick={async () => {
              await persistProject(menuProject.id, { completed: !menuProject.completed });
              setShowProjectMenuId(null);
            }} />
            <div className="my-1 border-t border-gray-200" />
            {menuProject.ownerId === user?.id ? (
              <MenuItem icon={<Trash2 className="h-4 w-4" />} danger subtleDanger label="Delete Project" onClick={() => {
                setProjectToDelete(menuProject.id);
                setShowProjectMenuId(null);
              }} />
            ) : (
              <MenuItem icon={<X className="h-4 w-4" />} danger label="Leave Project" onClick={() => {
                setProjectToLeave(menuProject.id);
                setShowProjectMenuId(null);
              }} />
            )}
          </div>
        );
      })()}
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
  subtleDanger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  subtleDanger?: boolean;
}) => (
  <button
    onClick={onClick}
    className={cn(
      'flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors',
      danger
        ? subtleDanger
          ? 'text-destructive'
          : 'text-destructive hover:bg-destructive/5'
        : 'text-foreground hover:bg-muted',
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

