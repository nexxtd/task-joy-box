import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { TaskTemplate, TemplateDraftData } from '@/types/template';
import { Checklist, Label } from '@/types/board';

const getTemplatesKey = (userId: number) => `task_templates_${userId}`;

export const useTemplates = () => {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) {
      setTemplates([]);
      setLoaded(true);
      return;
    }
    try {
      const saved = localStorage.getItem(getTemplatesKey(user.id));
      if (saved) {
        setTemplates(JSON.parse(saved));
      }
    } catch {
      // ignore parse errors
    }
    setLoaded(true);
  }, [user?.id]);

  const persist = useCallback(
    (next: TaskTemplate[]) => {
      setTemplates(next);
      if (user) {
        localStorage.setItem(getTemplatesKey(user.id), JSON.stringify(next));
      }
    },
    [user]
  );

  const addTemplate = useCallback(
    (name: string, draft: TemplateDraftData) => {
      const now = new Date().toISOString();
      const newTemplate: TaskTemplate = {
        id: crypto.randomUUID(),
        name,
        ...draft,
        createdAt: now,
        updatedAt: now,
      };
      const next = [...templates, newTemplate];
      persist(next);
      return newTemplate;
    },
    [templates, persist]
  );

  const updateTemplate = useCallback(
    (id: string, updates: Partial<Omit<TaskTemplate, 'id' | 'createdAt'>>) => {
      const next = templates.map(t =>
        t.id === id
          ? { ...t, ...updates, updatedAt: new Date().toISOString() }
          : t
      );
      persist(next);
    },
    [templates, persist]
  );

  const deleteTemplate = useCallback(
    (id: string) => {
      const next = templates.filter(t => t.id !== id);
      persist(next);
    },
    [templates, persist]
  );

  return { templates, loaded, addTemplate, updateTemplate, deleteTemplate };
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
