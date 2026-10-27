import React, { useState } from 'react';
import { X, Pin, Save, Tag, Image, Star, Trash2, ChevronUp, ChevronDown, Paperclip } from 'lucide-react';
import { getImageSrc } from '@/components/shared/DraggableImageGrid';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ChecklistSubtaskEditor from '@/components/ChecklistSubtaskEditor';
import { PRIORITY_CONFIG } from '@/types/board';
import type { Checklist, Subtask, TaskStatus, Priority } from '@/types/board';

interface NoteTag { id: number; name: string; color: string; }
interface NoteImage { id: string; fileName: string; fileUrl: string; fileSize: number; }
interface NoteFile { id: string; fileName: string; fileUrl: string; fileSize: number; }
interface Note {
  id: number | string;
  title: string;
  content: string;
  color: string;
  pinned: boolean;
  priority?: Priority | string;
  projectId?: number | null;
  columnId?: string | null;
  tags: NoteTag[];
  images?: NoteImage[];
  files?: NoteFile[];
  checklists: Checklist[];
  subtasks: Subtask[];
  status: TaskStatus;
  createdAt: string;
}

interface Project { id: number; name: string; color: string; }
interface BoardColumn { id: string; title: string; order: number; projectId?: number | null; }

interface NoteDetailModalProps {
  note: Note | null;
  projects: Project[];
  boardColumns: BoardColumn[];
  tags: NoteTag[];
  isTemplateEdit?: boolean;
  templateEditName?: string;
  onTemplateEditNameChange?: (name: string) => void;
  onTitleChange: (title: string) => void;
  onContentChange: (content: string) => void;
  onPriorityChange?: (priority: Priority) => void;
  onProjectChange: (projectId: string) => void;
  onColumnChange: (columnId: string) => void;
  onStatusChange: (status: TaskStatus) => void;
  onChecklistsChange: (checklists: Checklist[]) => void;
  onSubtasksChange: (subtasks: Subtask[]) => void;
  onPinToggle: () => void;
  onClose: () => void;
  onTagPopup: () => void;
  onDelete: () => void;
  onImageUpload: (files: FileList | null) => void;
  onImageDelete: (imageId: string) => void;
  onFileUpload?: (files: FileList | null) => void;
  onFileDelete?: (fileId: string) => void;
  onTemplatesClick?: () => void;
  onSaveTemplate?: () => void;
  onCancelTemplateEdit?: () => void;
}

const NoteDetailModal: React.FC<NoteDetailModalProps> = ({
  note, projects, boardColumns, tags, isTemplateEdit, templateEditName, onTemplateEditNameChange,
  onTitleChange, onContentChange, onPriorityChange, onProjectChange, onColumnChange, onStatusChange,
  onChecklistsChange, onSubtasksChange, onPinToggle, onClose, onTagPopup,
  onDelete, onImageUpload, onImageDelete, onFileUpload, onFileDelete, onTemplatesClick, onSaveTemplate, onCancelTemplateEdit
}) => {
  const [tagsCollapsed, setTagsCollapsed] = useState(false);
  const [filesCollapsed, setFilesCollapsed] = useState(false);
  const [imagesCollapsed, setImagesCollapsed] = useState(false);
  const [uploading, setUploading] = useState(false);

  if (!note) return null;

  const priority = (note.priority || 'none') as Priority;
  const priorityCfg = priority !== 'none' ? PRIORITY_CONFIG[priority as Exclude<Priority, 'none'>] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-y-auto p-5 space-y-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            {isTemplateEdit && (
              <div className="mb-2">
                <label className="text-xs font-semibold uppercase text-muted-foreground mb-1 block">Template name</label>
                <input className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-sm"
                  value={templateEditName} onChange={e => onTemplateEditNameChange?.(e.target.value)} placeholder="Template name" />
              </div>
            )}
            <input className="w-full px-1 text-2xl font-semibold text-foreground bg-transparent border-none focus:outline-none focus:ring-0"
              value={note.title} onChange={e => onTitleChange(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            {isTemplateEdit ? (
              <>
                <button onClick={onCancelTemplateEdit} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted font-medium">Cancel</button>
                <button onClick={onSaveTemplate} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-all">
                  <Save className="w-3.5 h-3.5" /> Save Template
                </button>
              </>
            ) : (
              <>
                <button onClick={onPinToggle} className={`rounded-lg p-2 transition-colors ${note.pinned ? 'text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`} title={note.pinned ? 'Unpin note' : 'Pin note'}>
                  <Pin className={`w-4 h-4 ${note.pinned ? 'fill-current' : ''}`} />
                </button>
                <button onClick={onClose} className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold uppercase text-muted-foreground mb-1 block">Priority</label>
          <Select value={priority} onValueChange={v => onPriorityChange?.(v as Priority)}>
            <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
              <SelectValue placeholder="Select priority" />
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
          <label className="text-xs font-semibold uppercase text-muted-foreground mb-1 block">Project</label>
          <Select value={String(note.projectId || '') || 'none'} onValueChange={onProjectChange}>
            <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
              <SelectValue placeholder="My Notes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">My Notes</SelectItem>
              {projects.map(p => (<SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-semibold uppercase text-muted-foreground mb-1 block">Column</label>
          <Select value={String(note.columnId || '') || 'none'} onValueChange={onColumnChange}>
            <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
              <SelectValue placeholder={note.projectId ? 'Select column' : 'Select a project first'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No column</SelectItem>
              {(() => {
                const filtered = boardColumns
                  .filter(c => !note.projectId || String(c.projectId) === String(note.projectId))
                  .sort((a, b) => a.order - b.order);
                if (note.projectId && filtered.length === 0) {
                  return [
                    { id: `col-proj-${note.projectId}-to-do`, title: 'To Do' },
                    { id: `col-proj-${note.projectId}-in-progress`, title: 'In Progress' },
                    { id: `col-proj-${note.projectId}-done`, title: 'Done' },
                  ].map(c => (<SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>));
                }
                return filtered.map(c => (<SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>));
              })()}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-semibold uppercase text-muted-foreground mb-1 block">Description</label>
          <textarea value={note.content} onChange={e => onContentChange(e.target.value)} rows={8}
            className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm resize-y min-h-[120px]" />
        </div>

        <div className="rounded-2xl border border-border bg-muted/20">
          <button onClick={() => setTagsCollapsed(!tagsCollapsed)} className="w-full flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Tags</h3>
            </div>
            {tagsCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
          </button>
          {!tagsCollapsed && (
            <div className="border-t border-border/60 px-4 py-3 space-y-3">
              <div className="flex flex-wrap gap-2">
                {note.tags.map(tag => (
                  <span key={tag.id} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-white" style={{ backgroundColor: tag.color }}>
                    {tag.name}
                  </span>
                ))}
              </div>
              <button onClick={onTagPopup} className="text-xs text-primary hover:underline">Edit tags</button>
            </div>
          )}
        </div>

        {!isTemplateEdit && (
          <ChecklistSubtaskEditor
            entityId={String(note.id)}
            checklists={note.checklists}
            subtasks={note.subtasks}
            onChecklistsChange={onChecklistsChange}
            onSubtasksChange={onSubtasksChange}
            hideSubtasks
          />
        )}

        <div className="rounded-2xl border border-border bg-muted/20">
          <button onClick={() => setFilesCollapsed(!filesCollapsed)} className="w-full flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <Paperclip className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Files</h3>
              {note.files && note.files.length > 0 && <span className="text-xs text-muted-foreground">({note.files.length})</span>}
            </div>
            {filesCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
          </button>
          {!filesCollapsed && (
            <div className="border-t border-border/60 px-4 py-3 space-y-3">
              <label className="flex flex-col items-center justify-center w-full min-h-[100px] border-2 border-dashed border-border rounded-xl bg-muted/20 hover:bg-muted/40 hover:border-primary/50 transition-all cursor-pointer">
                <div className="flex flex-col items-center justify-center py-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                    <Paperclip className="w-5 h-5 text-primary" />
                  </div>
                  <p className="text-sm font-medium text-foreground">{uploading ? 'Uploading...' : 'Click to upload or drag and drop'}</p>
                  <p className="text-xs text-muted-foreground mt-1">PDF, Images, Documents (max 10MB)</p>
                </div>
                <input type="file" multiple onChange={e => { onFileUpload?.(e.target.files); e.target.value = ''; }} className="hidden" />
              </label>
              {note.files && note.files.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {note.files.map(file => (
                    <div key={file.id} className="relative group/att">
                      <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/40">
                        <div className="w-10 h-10 rounded-lg bg-background border border-border flex items-center justify-center">
                          <Paperclip className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{file.fileName}</p>
                          <p className="text-xs text-muted-foreground">{(file.fileSize / 1024).toFixed(1)} KB</p>
                        </div>
                      </div>
                      {onFileDelete && (
                        <button
                          onClick={e => { e.preventDefault(); e.stopPropagation(); onFileDelete(file.id); }}
                          className="absolute top-2 right-2 p-1.5 rounded-lg bg-background/80 border border-border text-muted-foreground hover:text-destructive opacity-0 group-hover/att:opacity-100 transition-all shadow-sm"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-muted/20">
          <button onClick={() => setImagesCollapsed(!imagesCollapsed)} className="w-full flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <Image className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Images</h3>
              {note.images && note.images.length > 0 && <span className="text-xs text-muted-foreground">({note.images.length})</span>}
            </div>
            {imagesCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
          </button>
          {!imagesCollapsed && (
            <div className="border-t border-border/60 px-4 py-3 space-y-3">
              <label className="flex flex-col items-center justify-center w-full min-h-[100px] border-2 border-dashed border-border rounded-xl bg-muted/20 hover:bg-muted/40 hover:border-primary/50 transition-all cursor-pointer">
                <div className="flex flex-col items-center justify-center py-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                    <Paperclip className="w-5 h-5 text-primary" />
                  </div>
                  <p className="text-sm font-medium text-foreground">Click to upload</p>
                  <p className="text-xs text-muted-foreground mt-1">PNG, JPG, GIF (max 10MB)</p>
                </div>
                <input type="file" multiple accept="image/*" onChange={e => { onImageUpload(e.target.files); e.target.value = ''; }} className="hidden" />
              </label>
              {note.images && note.images.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {note.images.map(img => (
                    <div key={img.id} className="relative group/img rounded-xl border border-border bg-muted/40 overflow-hidden">
                      <img src={getImageSrc(img as any)} alt={img.fileName} loading="lazy" decoding="async" className="w-full h-32 object-cover"
                        onError={e => {
                          const el = e.currentTarget as HTMLImageElement;
                          if (el.src !== img.fileUrl && img.fileUrl && !img.fileUrl.startsWith('data:')) { el.src = img.fileUrl; return; }
                          el.style.display = 'none';
                        }} />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 pt-6">
                        <p className="text-xs font-medium text-white truncate">{img.fileName}</p>
                      </div>
                      <button onClick={() => onImageDelete(img.id)} className="absolute top-2 right-2 p-1.5 rounded-lg bg-background/80 border border-border text-muted-foreground hover:text-destructive opacity-0 group-hover/img:opacity-100 transition-all shadow-sm">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            {priorityCfg && (
              <span className={`${priorityCfg.className} text-[10px] font-medium px-2 py-0.5 rounded-full text-primary-foreground`}>
                {priorityCfg.label}
              </span>
            )}
            <span className="text-xs text-muted-foreground">Created: {new Date(note.createdAt).toLocaleDateString()}</span>
            {!isTemplateEdit && (
              <button
                onClick={onTemplatesClick}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-all"
              >
                <Star className="w-3.5 h-3.5" />
                Templates
              </button>
            )}
          </div>
          <button onClick={onDelete} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-lg transition-all font-medium">
            <Trash2 className="w-3.5 h-3.5" /> Delete Note
          </button>
        </div>
      </div>
    </div>
  );
};

export default NoteDetailModal;
