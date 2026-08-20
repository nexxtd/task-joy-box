import React, { useState } from 'react';
import { Pin, Tag, Trash2, ChevronUp, ChevronDown, GripVertical, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NoteTag { id: number; name: string; color: string; }
interface Note {
  id: number | string;
  title: string;
  content: string;
  color: string;
  pinned: boolean;
  projectId?: number | null;
  tags: NoteTag[];
  createdAt: string;
  updatedAt: string;
}

interface NoteRowProps {
  note: Note;
  isDeleteMode: boolean;
  isSelected: boolean;
  isExpanded: boolean;
  dragHandleProps?: any;
  isDragging?: boolean;
  editingTitleNoteId: number | string | null;
  editingTitleText: string;
  editingContentNoteId: number | string | null;
  editingContentText: string;
  expandedContentMap: Record<string | number, string>;
  projects: { id: number; name: string; color: string }[];
  onToggleSelect: () => void;
  onClick: () => void;
  onTogglePin: () => void;
  onToggleExpand: () => void;
  onStartEditTitle: (id: number | string, title: string) => void;
  onFinishEditTitle: (id: number | string, title: string) => void;
  onStartEditContent: (id: number | string, content: string) => void;
  onFinishEditContent: (id: number | string, content: string) => void;
  onChangeExpandedContent: (id: number | string, content: string) => void;
  onDelete: () => void;
  onTagPopup: () => void;
}

const NoteRow: React.FC<NoteRowProps> = ({
  note, isDeleteMode, isSelected, isExpanded, dragHandleProps, isDragging,
  editingTitleNoteId, editingTitleText, editingContentNoteId, editingContentText,
  expandedContentMap, projects,
  onToggleSelect, onClick, onTogglePin, onToggleExpand,
  onStartEditTitle, onFinishEditTitle, onStartEditContent, onFinishEditContent,
  onChangeExpandedContent, onDelete, onTagPopup
}) => {
  const preview = note.content.split('\n').slice(0, 2).join(' ').trim();
  const proj = note.projectId ? projects.find(p => p.id === note.projectId) : null;

  return (
    <div
      className={cn(
        'group border rounded-xl bg-card transition-all duration-200 cursor-pointer',
        isDeleteMode
          ? isSelected
            ? 'border-destructive bg-destructive/5 hover:bg-destructive/10'
            : 'border-border hover:bg-muted/20'
          : isDragging
            ? 'border-primary/40 shadow-lg rotate-[2deg]'
            : 'border-border hover:border-border/80 hover:shadow-sm'
      )}
      style={!isDeleteMode ? { borderLeftColor: note.color, borderLeftWidth: '3px' } : undefined}
    >
      <div className="flex items-center gap-1 px-4 py-5 min-h-[88px]">
        {dragHandleProps && (
          <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
            <GripVertical className="w-4 h-4" />
          </div>
        )}
        {!isDeleteMode && (
          <button
            onClick={e => { e.stopPropagation(); onTogglePin(); }}
            className={`p-1.5 rounded-md flex-shrink-0 transition-all ${note.pinned ? 'text-primary' : 'text-muted-foreground/30 hover:text-muted-foreground'}`}
            title={note.pinned ? 'Unpin note' : 'Pin note'}
          >
            <Pin className={`w-3.5 h-3.5 ${note.pinned ? 'fill-current' : ''}`} />
          </button>
        )}
        {isDeleteMode ? (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="w-4 h-4 rounded border-border accent-destructive flex-shrink-0 cursor-pointer"
          />
        ) : null}
        <div className="flex-1 min-w-0" onClick={onClick}>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-left text-foreground truncate">{note.title || 'Untitled note'}</span>
            {note.tags.slice(0, 3).map(tag => (
              <span key={tag.id} className="text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 text-white" style={{ backgroundColor: tag.color }}>
                {tag.name}
              </span>
            ))}
            {note.tags.length > 3 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">+{note.tags.length - 3}</span>
            )}
            {proj && (
              <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-border/60 text-muted-foreground flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: proj.color }} />
                {proj.name}
              </span>
            )}
          </div>
          {preview ? (
            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{preview}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] text-muted-foreground">
            {new Date(note.updatedAt || note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          <button
            onClick={e => { e.stopPropagation(); onToggleExpand(); }}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {!isDeleteMode && (
            <>
              <button
                onClick={e => { e.stopPropagation(); onTagPopup(); }}
                className="p-1.5 rounded-md text-muted-foreground/30 hover:text-muted-foreground hover:bg-muted transition-all" title="Edit tags"
              >
                <Tag className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={e => { e.stopPropagation(); onDelete(); }}
                className="p-1.5 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all" title="Delete note"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
      {isExpanded && !isDeleteMode && (
        <div onClick={e => e.stopPropagation()} className="border-t border-border px-4 py-3 space-y-3 bg-muted/10 rounded-b-xl">
          <textarea
            value={expandedContentMap[note.id] ?? note.content ?? ''}
            onChange={e => onChangeExpandedContent(note.id, e.target.value)}
            rows={3}
            className="w-full bg-muted/20 border border-border rounded-xl p-3 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <div className="flex items-center gap-2 flex-wrap">
            {note.tags.slice(0, 5).map(tag => (
              <span key={tag.id} className="text-[10px] px-2 py-0.5 rounded-full font-medium text-white" style={{ backgroundColor: tag.color }}>
                {tag.name}
              </span>
            ))}
            {note.tags.length > 5 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">+{note.tags.length - 5}</span>
            )}
            <button onClick={e => { e.stopPropagation(); onTagPopup(); }} className="text-[10px] px-2 py-0.5 rounded-full border border-dashed border-muted-foreground/30 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all">
              Edit tags
            </button>
          </div>
          <div className="flex justify-end pt-1">
            <button onClick={e => { e.stopPropagation(); onDelete(); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-lg transition-all">
              <Trash2 className="w-3.5 h-3.5" />
              Delete Note
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NoteRow;
