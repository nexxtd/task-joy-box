import React, { useState } from 'react';
import { X, Tag, Image, Target, BarChart3, Trash2, ChevronUp, ChevronDown, Paperclip, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusSelector } from '@/components/ChecklistSubtaskEditor';
import ChecklistSubtaskEditor from '@/components/ChecklistSubtaskEditor';
import type { Checklist, Subtask, TaskStatus } from '@/types/board';

interface GoalTag { id: number; name: string; color: string; }
interface SubGoal { id: string; title: string; completed: boolean; }
interface GoalImage { id: string; fileName: string; fileUrl: string; fileSize: number; }

interface GoalEditData {
  title: string; description: string; target: number; unit: string;
  color: string; category: string; timeframe: string;
  subGoals: SubGoal[]; checklists: Checklist[]; subtasks: Subtask[];
  status: TaskStatus; projectId: string;
  progress: number; tags: GoalTag[];
}

interface GoalDetailModalProps {
  goal: GoalEditData & { id?: number } | null;
  projects: { id: number; name: string; color: string }[];
  goalColors: string[];
  goalCategories: string[];
  tags: GoalTag[];
  goalTags: GoalTag[];
  images?: GoalImage[];
  activityLogs: { id: number; action: string; details?: string; createdAt: string }[];
  saving?: boolean;
  onFieldChange: (field: string, value: any) => void;
  onSave: () => void;
  onClose: () => void;
  onDelete: () => void;
  onTagPopup: () => void;
  onTagToggle: (tagId: number) => void;
  onAddTag: (name: string, color: string) => void;
  onDeleteTag: (tagId: number) => void;
  onImageUpload: (files: FileList | null) => void;
  onImageDelete: (imageId: string) => void;
  onSubGoalToggle: (subGoalId: string) => void;
  tagPopupOpen: boolean;
  tagPopupGoalId?: number | null;
}

const TIMEFRAME_LABELS: Record<string, string> = {
  '1week': '1 Week', '1month': '1 Month', '3months': '3 Months',
  '6months': '6 Months', '1year': '1 Year',
};

const GoalDetailModal: React.FC<GoalDetailModalProps> = ({
  goal, projects, goalColors, goalCategories, tags, goalTags, images, activityLogs,
  saving, onFieldChange, onSave, onClose, onDelete, onTagPopup, onTagToggle, onAddTag,
  onDeleteTag, onImageUpload, onImageDelete, onSubGoalToggle, tagPopupOpen, tagPopupGoalId
}) => {
  const [imagesCollapsed, setImagesCollapsed] = useState(false);
  const [activityCollapsed, setActivityCollapsed] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const [uploading, setUploading] = useState(false);
  const TAG_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

  if (!goal) return null;

  const pct = goal.target > 0 ? Math.round((goal.progress ?? 0) / goal.target * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-y-auto p-5 space-y-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <input className="w-full px-1 text-2xl font-semibold text-foreground bg-transparent border-none focus:outline-none focus:ring-0"
              value={goal.title} onChange={e => onFieldChange('title', e.target.value)} />
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground flex-shrink-0"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex gap-2">
          {goalColors.map(c => (
            <button key={c} onClick={() => onFieldChange('color', c)}
              className={`w-8 h-8 rounded-full border-2 transition-all ${goal.color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
              style={{ backgroundColor: c }} />
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Goal Title</label>
              <input value={goal.title} onChange={e => onFieldChange('title', e.target.value)}
                className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 font-medium" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Context / Description</label>
              <textarea value={goal.description} onChange={e => onFieldChange('description', e.target.value)}
                className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" rows={2} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Category</label>
              <Select value={goal.category} onValueChange={v => onFieldChange('category', v)}>
                <SelectTrigger className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground h-9">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {goalCategories.map(cat => (<SelectItem key={cat} value={cat}>{cat}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Project</label>
              <Select value={goal.projectId || 'none'} onValueChange={v => onFieldChange('projectId', v === 'none' ? '' : v)}>
                <SelectTrigger className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground h-9">
                  <SelectValue placeholder="My Tasks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">My Tasks</SelectItem>
                  {projects.map(p => (<SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">How many?</label>
                <input type="number" value={goal.target} onChange={e => onFieldChange('target', parseInt(e.target.value) || 1)}
                  className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Unit</label>
                <input value={goal.unit} onChange={e => onFieldChange('unit', e.target.value)} placeholder="tasks, hours, pages..."
                  className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Deadline</label>
                <Select value={goal.timeframe} onValueChange={v => onFieldChange('timeframe', v)}>
                  <SelectTrigger className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground h-9">
                    <SelectValue placeholder="Select timeframe" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIMEFRAME_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="bg-muted/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted-foreground">Progress</span>
                <span className="text-sm font-bold">{pct}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${pct}%`, backgroundColor: goal.color }} />
              </div>
              <p className="text-xs text-muted-foreground mt-1 text-right">{goal.progress || 0}/{goal.target} {goal.unit}</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Sub-goals</label>
              <div className="space-y-1">
                {goal.subGoals.map((sg, i) => (
                  <div key={sg.id} className="flex items-center gap-2 text-xs bg-muted/30 border border-border rounded-lg px-3 py-1.5">
                    <input type="checkbox" checked={sg.completed} onChange={() => onSubGoalToggle(sg.id)} className="rounded" />
                    <span className="flex-1 text-foreground">{sg.title}</span>
                    <button onClick={() => onFieldChange('subGoals', goal.subGoals.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-muted/20">
          <div className="px-4 py-3"><h3 className="text-sm font-semibold text-foreground">Status</h3></div>
          <div className="border-t border-border/60 px-4 py-3">
            <StatusSelector status={goal.status} onChange={s => onFieldChange('status', s)} />
          </div>
        </div>

        <ChecklistSubtaskEditor
          entityId={String(goal.id || 'new')}
          checklists={goal.checklists}
          subtasks={goal.subtasks}
          onChecklistsChange={v => onFieldChange('checklists', v)}
          onSubtasksChange={v => onFieldChange('subtasks', v)}
        />

        <div className="rounded-2xl border border-border bg-muted/20">
          <div className="px-4 py-3">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Tags</h3>
            </div>
          </div>
          <div className="border-t border-border/60 px-4 py-3">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {goalTags.filter(gt => goal.tags?.some((t: any) => t.id === gt.id)).map(tag => (
                <span key={tag.id} className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full text-white" style={{ backgroundColor: tag.color }}>
                  {tag.name}
                  <button onClick={() => onTagToggle(tag.id)} className="hover:opacity-70"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <button onClick={onTagPopup} className="text-xs text-primary hover:underline">+ Add tag</button>
            {tagPopupOpen && tagPopupGoalId && (
              <div className="mt-3 border-t border-border/60 pt-3">
                <div className="max-h-44 space-y-1 overflow-y-auto pr-1 mb-3">
                  {goalTags.map(tag => {
                    const active = goal.tags?.some((t: any) => t.id === tag.id);
                    return (
                      <div key={tag.id} className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2">
                        <button onClick={() => onTagToggle(tag.id)} className="flex flex-1 items-center gap-2 text-left">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: tag.color }} />
                          <span className="text-sm text-foreground">{tag.name}</span>
                          {active && <span className="ml-auto text-[10px] font-semibold text-primary">Selected</span>}
                        </button>
                        <button onClick={() => onDeleteTag(tag.id)} className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <input value={newTagName} onChange={e => setNewTagName(e.target.value)} placeholder="Create tag"
                    className="flex-1 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  <button onClick={() => setNewTagColor(TAG_COLORS[(TAG_COLORS.indexOf(newTagColor) + 1) % TAG_COLORS.length])} className="w-10 rounded-xl border border-border" style={{ backgroundColor: newTagColor }} />
                  <button onClick={() => { if (newTagName.trim() && tagPopupGoalId) { onAddTag(newTagName.trim(), newTagColor); setNewTagName(''); } }} disabled={!newTagName.trim()} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">Add</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-muted/20">
          <button onClick={() => setActivityCollapsed(!activityCollapsed)} className="w-full flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2"><BarChart3 className="w-4 h-4 text-muted-foreground" /><h3 className="text-sm font-semibold text-foreground">Activity</h3></div>
            {activityCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
          </button>
          {!activityCollapsed && (
            <div className="border-t border-border/60 px-4 py-3 space-y-2 max-h-56 overflow-y-auto">
              {activityLogs.length === 0 ? <p className="text-sm text-muted-foreground">No activity yet</p>
                : activityLogs.map(log => (
                  <div key={log.id} className="rounded-xl border border-border/50 bg-background/70 px-3 py-2">
                    <p className="text-sm text-foreground capitalize">{log.action}{log.details ? ` — ${log.details}` : ''}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">{new Date(log.createdAt).toLocaleString()}</p>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-muted/20">
          <button onClick={() => setImagesCollapsed(!imagesCollapsed)} className="w-full flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2"><Image className="w-4 h-4 text-muted-foreground" /><h3 className="text-sm font-semibold text-foreground">Images</h3>{images && images.length > 0 && <span className="text-xs text-muted-foreground">({images.length})</span>}</div>
            {imagesCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
          </button>
          {!imagesCollapsed && (
            <div className="border-t border-border/60 px-4 py-3 space-y-3">
              <label className="flex flex-col items-center justify-center w-full min-h-[100px] border-2 border-dashed border-border rounded-xl bg-muted/20 hover:bg-muted/40 hover:border-primary/50 transition-all cursor-pointer">
                <div className="flex flex-col items-center justify-center py-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2"><Paperclip className="w-5 h-5 text-primary" /></div>
                  <p className="text-sm font-medium text-foreground">Click to upload</p><p className="text-xs text-muted-foreground mt-1">PNG, JPG, GIF (max 10MB)</p>
                </div>
                <input type="file" multiple accept="image/*" onChange={e => { onImageUpload(e.target.files); e.target.value = ''; }} disabled={uploading} className="hidden" />
              </label>
              {images && images.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {images.map(img => (
                    <div key={img.id} className="relative group/img rounded-xl border border-border bg-muted/40 overflow-hidden">
                      {img.fileUrl.match(/^data:image/) ? <img src={img.fileUrl} alt={img.fileName} className="w-full h-32 object-cover" />
                        : <div className="w-full h-32 flex items-center justify-center"><Paperclip className="w-6 h-6 text-muted-foreground" /></div>}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 pt-6">
                        <p className="text-xs font-medium text-white truncate">{img.fileName}</p>
                        <p className="text-[10px] text-white/70">{(img.fileSize / 1024).toFixed(1)} KB</p>
                      </div>
                      <button onClick={() => onImageDelete(img.id)} className="absolute top-2 right-2 p-1.5 rounded-lg bg-background/80 border border-border text-muted-foreground hover:text-destructive opacity-0 group-hover/img:opacity-100 transition-all shadow-sm"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <button onClick={onDelete} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-lg transition-all font-medium">Delete Goal</button>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground font-medium">Cancel</button>
            <button onClick={onSave} disabled={saving || !goal.title.trim()}
              className="px-4 py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-all">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GoalDetailModal;
