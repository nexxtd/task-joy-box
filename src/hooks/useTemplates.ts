import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { TaskTemplate, TemplateDraftData } from '@/types/template';
import { Checklist, Label } from '@/types/board';

const getTemplatesKey = (userId: number) => `task_templates_${userId}`;

/* ---------- shared singleton state ---------- */
let _templates: TaskTemplate[] = [];
let _loaded = false;
const _listeners = new Set<() => void>();

function _notify() {
  _listeners.forEach(fn => fn());
}

function _load(userId: number) {
  try {
    const saved = localStorage.getItem(getTemplatesKey(userId));
    if (saved) {
      _templates = JSON.parse(saved);
    } else {
      _templates = [];
    }
  } catch {
    _templates = [];
  }
  _loaded = true;
  _notify();
}

function _persist(userId: number, next: TaskTemplate[]) {
  _templates = next;
  localStorage.setItem(getTemplatesKey(userId), JSON.stringify(next));
  _notify();
}
/* ------------------------------------------- */

export const useTemplates = () => {
  const { user } = useAuth();
  const [, forceUpdate] = useState(0);
  const userIdRef = useRef(user?.id);

  // Keep track so we can re-load when user changes
  if (userIdRef.current !== user?.id) {
    userIdRef.current = user?.id;
    _loaded = false;
  }

  useEffect(() => {
    if (!user) {
      _templates = [];
      _loaded = true;
      return;
    }
    if (!_loaded) {
      _load(user.id);
    }

    const cb = () => forceUpdate(v => v + 1);
    _listeners.add(cb);
    return () => { _listeners.delete(cb); };
  }, [user?.id]);

  const addTemplate = useCallback(
    (name: string, draft: TemplateDraftData) => {
      if (!user) throw new Error('Not authenticated');
      const now = new Date().toISOString();
      const newTemplate: TaskTemplate = {
        id: crypto.randomUUID(),
        name,
        ...draft,
        createdAt: now,
        updatedAt: now,
      };
      const next = [..._templates, newTemplate];
      _persist(user.id, next);
      return newTemplate;
    },
    [user]
  );

  const updateTemplate = useCallback(
    (id: string, updates: Partial<Omit<TaskTemplate, 'id' | 'createdAt'>>) => {
      if (!user) return;
      const next = _templates.map(t =>
        t.id === id
          ? { ...t, ...updates, updatedAt: new Date().toISOString() }
          : t
      );
      _persist(user.id, next);
    },
    [user]
  );

  const deleteTemplate = useCallback(
    (id: string) => {
      if (!user) return;
      const next = _templates.filter(t => t.id !== id);
      _persist(user.id, next);
    },
    [user]
  );

  return { templates: _templates, loaded: _loaded, addTemplate, updateTemplate, deleteTemplate };
};

export const taskToTemplateDraft = (task: {
  title: string;
  description?: string;
  priority?: string;
  status?: string;
  startDate?: string;
  startTime?: string;
  dueDate?: string;
  dueTime?: string;
  duration?: number;
  subject?: string;
  color?: string;
  icon?: string;
  recurrencePattern?: 'daily' | 'weekly' | 'monthly' | null;
  subtasks?: Array<{ text: string; durationMinutes?: number }>;
  checklists?: Checklist[];
  labels?: Label[];
}): TemplateDraftData => ({
  title: task.title || '',
  description: task.description || '',
  priority: (task.priority as any) || 'medium',
  status: (task.status as any) || 'to_do',
  startDate: task.startDate,
  startTime: task.startTime,
  dueDate: task.dueDate,
  dueTime: task.dueTime,
  duration: task.duration,
  subject: task.subject,
  color: task.color,
  icon: task.icon,
  recurrencePattern: task.recurrencePattern || null,
  subtasks: (task.subtasks || []).map(st => ({
    text: st.text,
    durationMinutes: st.durationMinutes || 0,
  })),
  checklists: task.checklists || [],
  labels: task.labels || [],
});
