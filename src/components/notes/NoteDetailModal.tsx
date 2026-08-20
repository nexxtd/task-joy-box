import React, { useState } from 'react';
import { X, Pin, Save, Tag, Image, Star, Trash2, ChevronUp, ChevronDown, Paperclip, FolderKanban, Plus } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusSelector } from '@/components/ChecklistSubtaskEditor';
import ChecklistSubtaskEditor from '@/components/ChecklistSubtaskEditor';
import type { Checklist, Subtask, TaskStatus } from '@/types/board';

interface NoteTag { id: number; name: string; color: string; }
interface NoteImage { id: string; fileName: string; fileUrl: string; fileSize: number; }
interface Note {
  id: number | string;
  title: string;
  content: string;
  color: string;
  pinned: boolean;
  projectId?: number | null;
  tags: NoteTag[];
  images?: NoteImage[];
  checklists: Checklist[];
  subtasks: Subtask[];
  status: TaskStatus;
  createdAt: string;
}

interface NoteDetailModalProps {
  note: Note | null;
  projects: { id: number; name: string; color: string }[];
  tags: NoteTag[];
  isTemplateEdit?: boolean;
  templateEditName?: string;
  onTemplateEditNameChange?: (name: string) => void;
  onTitleChange: (title: string) => void;
  onContentChange: (content: string) => void;
  onProjectChange: (projectId: string) => void;
  onStatusChange: (status: TaskStatus) => void;
  onChecklistsChange: (checklists: Checklist[]) => void;
  onSubtasksChange: (subtasks: Subtask[]) => void;
  onPinToggle: () => void;
  onClose: () => void;
  onTagPopup: () => void;
  onDelete: () => void;
  onImageUpload: (files: FileList | null) => void;
  onImageDelete: (imageId: string) => void;
  onSaveTemplate?: () => void;
  onCancelTemplateEdit?: () => void;
}

const NoteDetailModal: React.FC<NoteDetailModalProps> = ({
  note, projects, tags, isTemplateEdit, templateEditName, onTemplateEditNameChange,
  onTitleChange, onContentChange, onProjectChange, onStatusChange,
  onChecklistsChange, onSubtasksChange, onPinToggle, onClose, onTagPopup,
  onDelete, onImageUpload, onImageDelete, onSaveTemplate, onCancelTemplateEdit
}) => {
  const [tagsCollapsed, setTagsCollapsed] = useState(false);
  const [imagesCollapsed, setImagesCollapsed] = useState(false);
  const [uploading, setUploading] = useState(false);

  if (!note) return null;

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

        <div className="grid md:grid-cols-2 gap-4">
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
        </div>

        <div>
          <label className="text-xs font-semibold uppercase text-muted-foreground mb-1 block">Content</label>
          <textarea value={note.content} onChange={e => onContentChange(e.target.value)} rows={8}
            className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
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
                      <img src={img.fileUrl} alt={img.fileName} className="w-full h-32 object-cover" />
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

        <div className="rounded-2xl border border-border bg-muted/20">
          <div className="px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground mb-3">Status</h3>
            <StatusSelector status={note.status} onChange={onStatusChange} />
          </div>
        </div>

        {!isTemplateEdit && (
          <ChecklistSubtaskEditor
            entityId={String(note.id)}
            checklists={note.checklists}
            subtasks={note.subtasks}
            onChecklistsChange={onChecklistsChange}
            onSubtasksChange={onSubtasksChange}
          />
        )}

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Created: {new Date(note.createdAt).toLocaleDateString()}</span>
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
