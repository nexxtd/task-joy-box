import React, { useState } from 'react';
import { useBoardContext } from '@/context/BoardContext';
import { Task, PRIORITY_CONFIG, LABEL_COLORS } from '@/types/board';
import { Calendar, CheckSquare, ChevronDown, ChevronUp, ChevronRight, Brain, Trash2, Plus, X, GripVertical } from 'lucide-react';
import { CircleToggle, SquareToggle } from '@/components/ToggleComponents';
import { useDeepFocus } from '@/hooks/useDeepFocus';
import { Draggable, Droppable } from '@hello-pangea/dnd';

interface ListViewProps {
  onTaskClick: (task: Task) => void;
  projectId?: number | null;
}

const ListView: React.FC<ListViewProps> = ({ onTaskClick, projectId }) => {
  const { board, updateTask, toggleChecklistItem, addChecklistItem, deleteChecklistItem } = useBoardContext();
  const { open: openDeepFocus } = useDeepFocus();

  const [expandedTaskIds, setExpandedTaskIds] = useState<string[]>([]);
  const toggleExpand = (taskId: string) => {
    setExpandedTaskIds(prev =>
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  };

  const sortedColumns = [...board.columns]
    .filter(c => projectId === undefined ? true : c.projectId === projectId)
    .sort((a, b) => a.order - b.order);

  return (
    <div className="flex-1 overflow-y-auto p-6" style={{ scrollbarGutter: 'stable' }}>
      <div className="max-w-4xl mx-auto space-y-6">
        {sortedColumns.map(column => {
          const tasks = board.tasks
            .filter(t => t.columnId === column.id && (projectId === undefined ? true : t.projectId === projectId))
            .sort((a, b) => a.order - b.order);

          return (
            <div key={column.id}>
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: column.color }} />
                <h3 className="text-sm font-semibold text-foreground truncate">{column.title}</h3>
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{tasks.length}</span>
              </div>

              {tasks.length === 0 ? (
                <p className="text-xs text-muted-foreground px-4 py-3">No tasks</p>
              ) : (
                <div className="bg-card border border-border rounded-xl divide-y divide-border">
                  {tasks.map(task => {
                    const isExpanded = expandedTaskIds.includes(task.id);
                    const totalItems = task.checklists.reduce((s, c) => s + c.items.length, 0);
                    const doneItems = task.checklists.reduce((s, c) => s + c.items.filter(i => i.completed).length, 0);
                    const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !task.completed;

                    return (
                      <div key={task.id} className="border-b border-border last:border-b-0">
                        <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                          <div className="w-1 h-8 rounded-full flex-shrink-0" style={{
                            backgroundColor: task.priority !== 'none'
                              ? `hsl(var(--priority-${task.priority === 'urgent' ? 'urgent' : task.priority === 'high' ? 'high' : task.priority === 'medium' ? 'medium' : 'low'}))`
                              : 'transparent'
                          }} />

                          <CircleToggle
                            completed={task.completed || false}
                            onClick={(e) => { e.stopPropagation(); updateTask(task.id, { completed: !task.completed, completedAt: !task.completed ? new Date().toISOString() : undefined }); }}
                            size="sm"
                          />

                          <div className="flex-1 min-w-0">
                            <span className={`text-sm font-medium text-foreground truncate block ${task.completed ? 'line-through text-muted-foreground' : ''}`}>
                              {task.title}
                            </span>
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              {task.priority !== 'none' && (
                                <span className={`${PRIORITY_CONFIG[task.priority].className} text-[10px] font-bold px-1.5 py-0.5 rounded`}>
                                  {PRIORITY_CONFIG[task.priority].label}
                                </span>
                              )}
                              {task.dueDate && (
                                <span className={`flex items-center gap-1 text-[11px] ${isOverdue ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                                  <Calendar className="w-3 h-3" />
                                  {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              )}
                              {totalItems > 0 && (
                                <span className={`flex items-center gap-1 text-[11px] ${doneItems === totalItems ? 'text-label-green' : 'text-muted-foreground'}`}>
                                  <CheckSquare className="w-3 h-3" />
                                  {doneItems}/{totalItems}
                                </span>
                              )}
                              {task.labels.map(label => (
                                <span key={label.id} className={`${LABEL_COLORS[label.color]} text-[9px] font-semibold px-1.5 py-0.5 rounded-full text-primary-foreground`}>
                                  {label.name}
                                </span>
                              ))}
                            </div>
                          </div>

                          <button
                            onClick={(e) => { e.stopPropagation(); onTaskClick(task); }}
                            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                            title="Open details"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={(e) => { e.stopPropagation(); openDeepFocus(task); }}
                            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-primary transition-all"
                            title="Deep Focus"
                          >
                            <Brain className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={(e) => { e.stopPropagation(); toggleExpand(task.id); }}
                            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                          >
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>

                        {isExpanded && <TaskDropdownExpanded task={task} />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const TaskDropdownExpanded: React.FC<{ task: Task }> = ({ task }) => {
  const { updateTask, addChecklist, toggleChecklistItem, addChecklistItem, deleteChecklistItem } = useBoardContext();
  const [description, setDescription] = useState(task.description || '');
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [newChecklistText, setNewChecklistText] = useState('');
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [perChecklistInput, setPerChecklistInput] = useState<Record<string, string>>({});

  return (
    <div className="border-t border-border px-4 py-3 space-y-4 bg-muted/10 rounded-b-xl">
      {task.description !== undefined && (
        <div>
          <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1.5 block">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            onBlur={() => { if (description !== (task.description || '')) updateTask(task.id, { description }); }}
            placeholder="Add a description..."
            className="w-full bg-background border border-border rounded-xl p-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            rows={2}
          />
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-bold text-muted-foreground uppercase">Subtasks</label>
        </div>
        <div className="space-y-1 mb-2">
          {(task.subtasks || []).map(st => (
            <div key={st.id} className="flex items-center gap-2 bg-background px-2 py-1.5 rounded-lg border border-border/60">
              <SquareToggle
                completed={st.completed}
                onClick={() => updateTask(task.id, { subtasks: (task.subtasks || []).map(s => s.id === st.id ? { ...s, completed: !s.completed } : s) })}
                size="sm"
              />
              <span className={`flex-1 text-xs truncate ${st.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{st.text}</span>
              <button
                onClick={() => updateTask(task.id, { subtasks: (task.subtasks || []).filter(s => s.id !== st.id) })}
                className="p-0.5 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-1">
          <input
            value={newSubtaskText}
            onChange={e => setNewSubtaskText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && newSubtaskText.trim()) { updateTask(task.id, { subtasks: [...(task.subtasks || []), { id: crypto.randomUUID(), text: newSubtaskText.trim(), completed: false, children: [] }] }); setNewSubtaskText(''); } }}
            placeholder="Add subtask..."
            className="flex-1 bg-background border border-border rounded-lg p-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={() => { if (newSubtaskText.trim()) { updateTask(task.id, { subtasks: [...(task.subtasks || []), { id: crypto.randomUUID(), text: newSubtaskText.trim(), completed: false, children: [] }] }); setNewSubtaskText(''); } }}
            className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-bold text-muted-foreground uppercase">Checklists</label>
        </div>
        <div className="space-y-3">
          {task.checklists.map(cl => (
            <div key={cl.id} className="bg-background border border-border/60 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40">
                <span className="flex-1 text-xs font-semibold text-foreground truncate">{cl.title}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">({cl.items.filter(i => i.completed).length}/{cl.items.length})</span>
              </div>
              <div className="p-2 space-y-1">
                {cl.items.map(item => (
                  <div key={item.id} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-muted/50 transition-colors">
                    <SquareToggle
                      completed={item.completed}
                      onClick={() => toggleChecklistItem(task.id, cl.id, item.id)}
                      size="sm"
                    />
                    <span className={`flex-1 text-xs truncate ${item.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{item.text}</span>
                    <button
                      onClick={() => deleteChecklistItem(task.id, cl.id, item.id)}
                      className="p-0.5 text-muted-foreground hover:text-destructive opacity-0 hover:opacity-100 transition-all"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-1 pt-1">
                  <input
                    value={perChecklistInput[cl.id] || ''}
                    onChange={e => setPerChecklistInput(prev => ({ ...prev, [cl.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter' && (perChecklistInput[cl.id] || '').trim()) { addChecklistItem(task.id, cl.id, (perChecklistInput[cl.id] || '').trim()); setPerChecklistInput(prev => ({ ...prev, [cl.id]: '' })); } }}
                    placeholder="Add item..."
                    className="flex-1 bg-muted/30 border border-border rounded-lg p-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button
                    onClick={() => { if ((perChecklistInput[cl.id] || '').trim()) { addChecklistItem(task.id, cl.id, (perChecklistInput[cl.id] || '').trim()); setPerChecklistInput(prev => ({ ...prev, [cl.id]: '' })); } }}
                    className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          <div className="flex gap-1">
            <input
              value={newChecklistTitle}
              onChange={e => setNewChecklistTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newChecklistTitle.trim()) { addChecklist(task.id, newChecklistTitle.trim()); setNewChecklistTitle(''); } }}
              placeholder="New checklist name..."
              className="flex-1 bg-background border border-border rounded-lg p-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              onClick={() => { if (newChecklistTitle.trim()) { addChecklist(task.id, newChecklistTitle.trim()); setNewChecklistTitle(''); } }}
              className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ListView;