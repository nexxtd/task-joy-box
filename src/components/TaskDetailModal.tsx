import React, { useState } from 'react';
import { useBoardContext } from '@/context/BoardContext';
import { Task, Checklist, ChecklistItem, Subtask } from '@/types/board';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CircleToggle, SquareToggle } from '@/components/ToggleComponents';
import { Clock, Trash2, Plus } from 'lucide-react';

interface TaskDetailModalProps {
  task: Task;
  onClose: () => void;
}

const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ task, onClose }) => {
  const { updateTask, deleteTask, toggleChecklistItem, addChecklistItem, deleteChecklistItem, addSubtask, updateSubtask, deleteSubtask } = useBoardContext();
  const [isEditing, setIsEditing] = useState(false);
  const [editedTask, setEditedTask] = useState<Task>(task);
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [newChecklistText, setNewChecklistText] = useState('');

  const handleSave = () => {
    updateTask(task.id, editedTask);
    setIsEditing(false);
    onClose();
  };

  const handleAddSubtask = () => {
    if (newSubtaskText.trim()) {
      addSubtask(task.id, { text: newSubtaskText.trim(), completed: false, durationMinutes: 0 });
      setNewSubtaskText('');
    }
  };

  const handleAddChecklistItem = () => {
    if (newChecklistText.trim()) {
      const checklistId = task.checklists[0]?.id || `checklist-${Date.now()}`;
      if (!task.checklists.some(cl => cl.id === checklistId)) {
        // Create a new checklist if none exists
        const newChecklist: Checklist = {
          id: checklistId,
          title: 'Checklist',
          items: []
        };
        updateTask(task.id, {
          checklists: [...task.checklists, newChecklist]
        });
      }
      addChecklistItem(task.id, checklistId, newChecklistText.trim());
      setNewChecklistText('');
    }
  };

  const handleDeleteSubtask = (subtaskId: string) => {
    deleteSubtask(task.id, subtaskId);
  };

  const handleDeleteChecklistItem = (checklistId: string, itemId: string) => {
    deleteChecklistItem(task.id, checklistId, itemId);
  };

  return (
    <Dialog open={!!task} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? (
              <Input
                value={editedTask.title}
                onChange={(e) => setEditedTask({ ...editedTask, title: e.target.value })}
                className="text-xl font-bold"
              />
            ) : (
              <h2 className="text-xl font-bold">{task.title}</h2>
            )}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant={task.priority === 'urgent' ? 'destructive' : task.priority === 'high' ? 'default' : task.priority === 'medium' ? 'secondary' : 'outline'}>
              {task.priority}
            </Badge>
            {task.dueDate && (
              <Badge variant="outline" className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(task.dueDate).toLocaleDateString()}
              </Badge>
            )}
            {task.duration && (
              <Badge variant="outline">{task.duration} min</Badge>
            )}
          </div>
          
          <div>
            <Label>Description</Label>
            {isEditing ? (
              <Textarea
                value={editedTask.description}
                onChange={(e) => setEditedTask({ ...editedTask, description: e.target.value })}
                rows={4}
              />
            ) : (
              <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-md">
                {task.description || 'No description provided'}
              </p>
            )}
          </div>
          
          {/* Subtasks Section */}
          {task.subtasks && task.subtasks.length > 0 && (
            <div>
              <Label>Subtasks</Label>
              <div className="space-y-2">
                {task.subtasks.map((subtask: Subtask) => (
                  <div key={subtask.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-md">
                    <Checkbox
                      checked={subtask.completed}
                      onCheckedChange={(checked) => {
                        updateSubtask(task.id, subtask.id, { completed: checked });
                      }}
                    />
                    <span className={subtask.completed ? 'line-through text-gray-500' : ''}>
                      {subtask.text}
                    </span>
                    {subtask.durationMinutes > 0 && (
                      <span className="text-xs bg-gray-200 px-2 py-1 rounded">
                        {subtask.durationMinutes} min
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteSubtask(subtask.id)}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {isEditing && (
            <div className="flex gap-2">
              <Input
                value={newSubtaskText}
                onChange={(e) => setNewSubtaskText(e.target.value)}
                placeholder="Add a subtask..."
                onKeyPress={(e) => e.key === 'Enter' && handleAddSubtask()}
              />
              <Button onClick={handleAddSubtask} size="sm">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          )}
          
          {/* Checklist Section */}
          {task.checklists && task.checklists.length > 0 && (
            <div>
              <Label>Checklist</Label>
              <div className="space-y-2">
                {task.checklists.map((checklist: Checklist) => (
                  <div key={checklist.id}>
                    <h4 className="font-medium mb-2">{checklist.title}</h4>
                    <div className="space-y-2">
                      {checklist.items.map((item: ChecklistItem) => (
                        <div key={item.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-md">
                          <SquareToggle
                            completed={item.completed}
                            onClick={() => toggleChecklistItem(task.id, checklist.id, item.id)}
                            size="md"
                          />
                          <span className={item.completed ? 'line-through text-gray-500' : ''}>
                            {item.text}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteChecklistItem(checklist.id, item.id)}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {isEditing && (
            <div className="flex gap-2">
              <Input
                value={newChecklistText}
                onChange={(e) => setNewChecklistText(e.target.value)}
                placeholder="Add checklist item..."
                onKeyPress={(e) => e.key === 'Enter' && handleAddChecklistItem()}
              />
              <Button onClick={handleAddChecklistItem} size="sm">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          )}
          
          <div className="flex justify-between pt-4">
            <Button
              variant="outline"
              onClick={() => {
                if (isEditing) {
                  setIsEditing(false);
                  setEditedTask(task);
                } else {
                  deleteTask(task.id);
                  onClose();
                }
              }}
            >
              {isEditing ? 'Cancel' : 'Delete Task'}
            </Button>
            
            {!isEditing ? (
              <Button onClick={() => setIsEditing(true)}>Edit Task</Button>
            ) : (
              <Button onClick={handleSave}>Save Changes</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TaskDetailModal;