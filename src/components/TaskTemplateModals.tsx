import React, { useState } from 'react';
import { TaskTemplate, TemplateDraftData } from '@/types/template';
import { useTemplates, taskToTemplateDraft } from '@/hooks/useTemplates';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  LayoutTemplate,
  Save,
  FolderOpen,
  Pencil,
  Trash2,
  X,
  ChevronDown,
} from 'lucide-react';
import { Priority, TaskStatus, Label, LabelColor, Checklist } from '@/types/board';
import { CircleToggle, SquareToggle } from '@/components/ToggleComponents';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TemplateMenuButtonProps {
  /** Called with the loaded template data when user picks "Load" */
  onLoadTemplate: (draft: TemplateDraftData) => void;
  /** Called to get the current draft data for "Save as Template" */
  getCurrentDraft: () => TemplateDraftData;
  /** Optional label override */
  label?: string;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Optional className */
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Small helpers                                                      */
/* ------------------------------------------------------------------ */

const TAG_COLOR_OPTIONS: LabelColor[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'];
const randomTagColor = (): LabelColor =>
  TAG_COLOR_OPTIONS[Math.floor(Math.random() * TAG_COLOR_OPTIONS.length)] || 'blue';
const normalizeTagName = (value: string) => value.trim().replace(/\s+/g, ' ');

/* ------------------------------------------------------------------ */
/*  TemplateMenuButton (dropdown + orchestrates modals)                */
/* ------------------------------------------------------------------ */

export const TemplateMenuButton: React.FC<TemplateMenuButtonProps> = ({
  onLoadTemplate,
  getCurrentDraft,
  label = 'Templates',
  size = 'md',
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<TaskTemplate | null>(null);

  const buttonSize = size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2 text-sm';

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 ${buttonSize} rounded-lg border border-border bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-all`}
      >
        <LayoutTemplate className="w-3.5 h-3.5" />
        <span className="font-medium">{label}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute bottom-full mb-1 left-0 z-50 w-48 bg-card border border-border rounded-xl shadow-xl p-1 space-y-0.5">
          <button
            onClick={() => {
              setOpen(false);
              setSaveOpen(true);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg hover:bg-muted transition-all text-left"
          >
            <Save className="w-3.5 h-3.5 text-primary" />
            Save as Template
          </button>
          <button
            onClick={() => {
              setOpen(false);
              setLoadOpen(true);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg hover:bg-muted transition-all text-left"
          >
            <FolderOpen className="w-3.5 h-3.5 text-primary" />
            Load Template
          </button>
        </div>
      )}

      {/* Click outside to close dropdown */}
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      )}

      <SaveTemplateModal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        getCurrentDraft={getCurrentDraft}
      />

      <LoadTemplateModal
        open={loadOpen}
        onClose={() => setLoadOpen(false)}
        onLoadTemplate={draft => {
          onLoadTemplate(draft);
          setLoadOpen(false);
        }}
        onEditTemplate={template => {
          setLoadOpen(false);
          setEditTemplate(template);
        }}
      />

      {editTemplate && (
        <EditTemplateModal
          template={editTemplate}
          open={!!editTemplate}
          onClose={() => setEditTemplate(null)}
          onSaved={() => setEditTemplate(null)}
        />
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  SaveTemplateModal                                                  */
/* ------------------------------------------------------------------ */

const SaveTemplateModal: React.FC<{
  open: boolean;
  onClose: () => void;
  getCurrentDraft: () => TemplateDraftData;
}> = ({ open, onClose, getCurrentDraft }) => {
  const { addTemplate } = useTemplates();
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter a template name');
      return;
    }
    setError('');
    addTemplate(trimmed, getCurrentDraft());
    setName('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Save as Template</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">Template Name</label>
            <input
              autoFocus
              value={name}
              onChange={e => {
                setName(e.target.value);
                if (error) setError('');
              }}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="e.g. Morning Routine"
              className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
            />
            {error && <p className="text-xs text-destructive mt-1">{error}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setName('');
                setError('');
                onClose();
              }}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim()}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-all"
            >
              Save
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/* ------------------------------------------------------------------ */
/*  LoadTemplateModal                                                  */
/* ------------------------------------------------------------------ */

const LoadTemplateModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onLoadTemplate: (draft: TemplateDraftData) => void;
  onEditTemplate: (template: TaskTemplate) => void;
}> = ({ open, onClose, onLoadTemplate, onEditTemplate }) => {
  const { templates, deleteTemplate } = useTemplates();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Load Template</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          {templates.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <LayoutTemplate className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No templates yet.</p>
              <p className="text-xs mt-1">Save a task as a template to see it here.</p>
            </div>
          )}
          {templates.map(template => (
            <div
              key={template.id}
              className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-all"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{template.name}</p>
                <p className="text-xs text-muted-foreground truncate">{template.title || 'Untitled template'}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => onEditTemplate(template)}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                  title="Edit template"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setConfirmDelete(template.id)}
                  className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                  title="Delete template"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() =>
                    onLoadTemplate({
                      title: template.title,
                      description: template.description,
                      priority: template.priority,
                      status: template.status,
                      startDate: template.startDate,
                      startTime: template.startTime,
                      dueDate: template.dueDate,
                      dueTime: template.dueTime,
                      duration: template.duration,
                      subject: template.subject,
                      color: template.color,
                      icon: template.icon,
                      recurrencePattern: template.recurrencePattern,
                      subtasks: template.subtasks,
                      checklists: template.checklists,
                      labels: template.labels,
                    })
                  }
                  className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all"
                >
                  Load
                </button>
              </div>
            </div>
          ))}
          {confirmDelete && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
              <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                    <Trash2 className="w-5 h-5 text-destructive" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Delete template?</h3>
                    <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      deleteTemplate(confirmDelete);
                      setConfirmDelete(null);
                    }}
                    className="px-4 py-2 text-sm font-bold bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

/* ------------------------------------------------------------------ */
/*  EditTemplateModal                                                  */
/*  Full task-creation-like editor that saves back to the template.    */
/* ------------------------------------------------------------------ */

const EditTemplateModal: React.FC<{
  template: TaskTemplate;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}> = ({ template, open, onClose, onSaved }) => {
  const { updateTemplate, deleteTemplate } = useTemplates();

  /* ---- mirrored draft state from CreateTaskModal ---- */
  const [name, setName] = useState(template.name);
  const [title, setTitle] = useState(template.title);
  const [description, setDescription] = useState(template.description);
  const [priority, setPriority] = useState<Priority>(template.priority);
  const [status, setStatus] = useState<TaskStatus>(template.status);
  const [startDate, setStartDate] = useState(template.startDate || '');
  const [startTime, setStartTime] = useState(template.startTime || '');
  const [dueDate, setDueDate] = useState(template.dueDate || '');
  const [dueTime, setDueTime] = useState(template.dueTime || '');
  const [duration, setDuration] = useState<number>(template.duration || 60);
  const [subject, setSubject] = useState(template.subject || '');
  const [color, setColor] = useState(template.color || '#000000');
  const [icon, setIcon] = useState(template.icon || '');
  const [recurrencePattern, setRecurrencePattern] = useState(template.recurrencePattern || 'none');

  const [subtasks, setSubtasks] = useState<
    Array<{ id: string; text: string; durationMinutes: number }>
  >(
    template.subtasks.map(st => ({
      id: crypto.randomUUID(),
      text: st.text,
      durationMinutes: st.durationMinutes,
    }))
  );
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [newSubtaskDuration, setNewSubtaskDuration] = useState<number>(10);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingSubtaskText, setEditingSubtaskText] = useState('');
  const [editingSubtaskDuration, setEditingSubtaskDuration] = useState<number>(0);

  const [checklists, setChecklists] = useState<Checklist[]>(
    template.checklists.map(cl => ({
      ...cl,
      id: cl.id || crypto.randomUUID(),
      items: cl.items.map(it => ({
        ...it,
        id: it.id || crypto.randomUUID(),
      })),
    }))
  );
  const [newChecklistText, setNewChecklistText] = useState('');
  const [editingChecklistIndex, setEditingChecklistIndex] = useState<number | null>(null);
  const [editingChecklistText, setEditingChecklistText] = useState('');

  const [labels, setLabels] = useState<Label[]>(template.labels);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState<LabelColor>(randomTagColor());

  const subtaskTotal = subtasks.reduce((s, st) => s + st.durationMinutes, 0);
  const subtaskRemaining = duration - subtaskTotal;

  const addSubtask = () => {
    if (!newSubtaskText.trim()) return;
    setSubtasks(prev => [
      ...prev,
      { id: crypto.randomUUID(), text: newSubtaskText.trim(), durationMinutes: Math.max(0, Number(newSubtaskDuration) || 0) },
    ]);
    setNewSubtaskText('');
    setNewSubtaskDuration(10);
  };

  const addChecklistItem = () => {
    if (!newChecklistText.trim()) return;
    if (checklists.length === 0) {
      setChecklists([{ id: crypto.randomUUID(), title: 'Checklist', items: [{ id: crypto.randomUUID(), text: newChecklistText.trim(), completed: false }] }]);
    } else {
      const last = checklists[checklists.length - 1];
      setChecklists(prev =>
        prev.map(cl =>
          cl.id === last.id
            ? { ...cl, items: [...cl.items, { id: crypto.randomUUID(), text: newChecklistText.trim(), completed: false }] }
            : cl
        )
      );
    }
    setNewChecklistText('');
  };

  const addLabel = () => {
    const normalized = normalizeTagName(newTagName);
    if (!normalized) return;
    if (labels.some(l => l.name.toLowerCase() === normalized.toLowerCase())) return;
    setLabels(prev => [...prev, { id: crypto.randomUUID(), name: normalized, color: newTagColor }]);
    setNewTagName('');
    setNewTagColor(randomTagColor());
  };

  const handleSave = () => {
    if (!title.trim()) return;
    updateTemplate(template.id, {
      name: name.trim(),
      title: title.trim(),
      description,
      priority,
      status,
      startDate: startDate || undefined,
      startTime: startTime || undefined,
      dueDate: dueDate || undefined,
      dueTime: dueTime || undefined,
      duration: Math.max(0, Number(duration) || 0),
      subject: subject || undefined,
      color,
      icon: icon || undefined,
      recurrencePattern: recurrencePattern === 'none' ? null : (recurrencePattern as any),
      subtasks: subtasks.map(st => ({ text: st.text, durationMinutes: st.durationMinutes })),
      checklists,
      labels,
    });
    onSaved();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-8">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Edit Template</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted" aria-label="Close">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Template Name */}
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">Template Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
            />
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">Task title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Priority</label>
              <Select value={priority} onValueChange={v => setPriority(v as Priority)}>
                <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Estimated duration (minutes)</label>
              <input
                type="number"
                min={0}
                value={duration}
                onChange={e => setDuration(Math.max(0, Number(e.target.value) || 0))}
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
              />
            </div>
          </div>

          {/* Start Date / Time */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Start Time</label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
              />
            </div>
          </div>

          {/* Due Date / Time */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Due Time</label>
              <input
                type="time"
                value={dueTime}
                onChange={e => setDueTime(e.target.value)}
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm resize-none"
            />
          </div>

          {/* Subject / Color / Icon */}
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Subject</label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="e.g. Maths"
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Color</label>
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                className="mt-1 w-full h-10 rounded-xl bg-muted/40 border border-border px-1 cursor-pointer"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Icon</label>
              <input
                value={icon}
                onChange={e => setIcon(e.target.value)}
                placeholder="e.g. 📚"
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
              />
            </div>
          </div>

          {/* Recurrence */}
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">Recurrence</label>
            <Select value={recurrencePattern} onValueChange={v => setRecurrencePattern(v as any)}>
              <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Labels */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-muted-foreground">Labels</label>
            {labels.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {labels.map(l => (
                  <span
                    key={l.id}
                    className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full text-primary-foreground bg-primary"
                    style={{ backgroundColor: l.color.startsWith('#') ? l.color : undefined }}
                  >
                    {l.name}
                    <button
                      onClick={() => setLabels(prev => prev.filter(x => x.id !== l.id))}
                      className="opacity-70 hover:opacity-100"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={newTagName}
                onChange={e => setNewTagName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addLabel()}
                placeholder="New label"
                className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm"
              />
              <select
                value={newTagColor}
                onChange={e => setNewTagColor(e.target.value as LabelColor)}
                className="bg-muted/40 border border-border rounded-lg px-2 py-2 text-sm"
              >
                {TAG_COLOR_OPTIONS.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button onClick={addLabel} className="px-3 py-2 text-xs bg-primary text-primary-foreground rounded-lg">
                Add
              </button>
            </div>
          </div>

          {/* Sub-tasks */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase text-muted-foreground">Sub-tasks</label>
              {duration > 0 && (
                <span
                  className={`text-[11px] font-medium ${
                    subtaskRemaining > 0
                      ? 'text-muted-foreground'
                      : subtaskRemaining < 0
                        ? 'text-orange-500'
                        : 'text-label-green'
                  }`}
                >
                  {subtaskRemaining > 0
                    ? `${subtaskRemaining} mins left`
                    : subtaskRemaining < 0
                      ? `Over by ${Math.abs(subtaskRemaining)} mins`
                      : '0 mins left ✓'}
                </span>
              )}
            </div>
            <div className="space-y-2">
              {subtasks.map(subtask => (
                <div
                  key={subtask.id}
                  className="grid grid-cols-[1fr_auto_auto] gap-2 items-center bg-muted/20 px-3 py-2 rounded-lg border border-border/50 group"
                >
                  {editingSubtaskId === subtask.id ? (
                    <>
                      <input
                        autoFocus
                        className="text-sm bg-muted/40 border border-primary/30 rounded px-2 py-0.5"
                        value={editingSubtaskText}
                        onChange={e => setEditingSubtaskText(e.target.value)}
                      />
                      <input
                        type="number"
                        className="w-20 text-xs bg-muted/40 border border-primary/30 rounded px-2 py-0.5"
                        value={editingSubtaskDuration}
                        onChange={e => setEditingSubtaskDuration(Math.max(0, Number(e.target.value) || 0))}
                      />
                      <button
                        onClick={() => {
                          setSubtasks(prev =>
                            prev.map(st =>
                              st.id === subtask.id
                                ? { ...st, text: editingSubtaskText, durationMinutes: editingSubtaskDuration }
                                : st
                            )
                          );
                          setEditingSubtaskId(null);
                        }}
                        className="text-xs text-primary font-bold"
                      >
                        Save
                      </button>
                    </>
                  ) : (
                    <>
                      <span
                        onClick={() => {
                          setEditingSubtaskId(subtask.id);
                          setEditingSubtaskText(subtask.text);
                          setEditingSubtaskDuration(subtask.durationMinutes);
                        }}
                        className="text-sm text-foreground font-medium cursor-text"
                      >
                        {subtask.text}
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          className="w-16 text-xs bg-muted/40 border border-border rounded px-1.5 py-0.5 text-right focus:outline-none focus:ring-1 focus:ring-primary/30"
                          value={subtask.durationMinutes || 0}
                          onChange={e => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            setSubtasks(prev => prev.map(st => (st.id === subtask.id ? { ...st, durationMinutes: val } : st)));
                          }}
                        />
                        <span className="text-[10px] text-muted-foreground">min</span>
                        <button
                          onClick={() => setSubtasks(prev => prev.filter(st => st.id !== subtask.id))}
                          className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-[1fr_120px_auto] gap-2">
              <input
                value={newSubtaskText}
                onChange={e => setNewSubtaskText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addSubtask()}
                placeholder="New sub-task"
                className="bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="number"
                min={0}
                value={newSubtaskDuration}
                onChange={e => setNewSubtaskDuration(Math.max(0, Number(e.target.value) || 0))}
                placeholder="min"
                className="bg-muted/40 border border-border rounded-lg px-2 py-2 text-sm"
              />
              <button onClick={addSubtask} className="px-3 py-2 text-xs bg-primary text-primary-foreground rounded-lg">
                Add
              </button>
            </div>
          </div>

          {/* Checklists */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-muted-foreground">Checklist</label>
            <div className="space-y-1">
              {checklists.flatMap(cl =>
                cl.items.map((item, itemIdx) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2.5 text-sm bg-muted/20 px-3 py-2 rounded-lg border border-border/50 group"
                  >
                    <SquareToggle completed={item.completed} onClick={() => {
                      setChecklists(prev =>
                        prev.map(c =>
                          c.id === cl.id
                            ? { ...c, items: c.items.map(i => (i.id === item.id ? { ...i, completed: !i.completed } : i)) }
                            : c
                        )
                      );
                    }} size="md" />
                    <span className="flex-1">{item.text}</span>
                    <button
                      onClick={() =>
                        setChecklists(prev =>
                          prev.map(c =>
                            c.id === cl.id ? { ...c, items: c.items.filter(i => i.id !== item.id) } : c
                          )
                        )
                      }
                      className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <input
                value={newChecklistText}
                onChange={e => setNewChecklistText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addChecklistItem()}
                className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm"
                placeholder="Checklist item"
              />
              <button onClick={addChecklistItem} className="px-3 py-2 text-xs bg-primary text-primary-foreground rounded-lg">
                Add
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-border flex justify-between items-center">
            <button
              onClick={() => {
                if (window.confirm('Are you sure you want to delete this template?')) {
                  deleteTemplate(template.id);
                  onClose();
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-lg transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Template
            </button>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!title.trim() || !name.trim()}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-all"
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemplateMenuButton;
