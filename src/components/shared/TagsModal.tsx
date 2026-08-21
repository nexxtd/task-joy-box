import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2 } from 'lucide-react';
import { LabelColor, LABEL_COLORS } from '@/types/board';

export interface TagOption {
  id: string;
  name: string;
  color: LabelColor;
}

export interface TagsModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  tags: TagOption[];
  selectedIds?: string[];
  onToggle?: (tagId: string) => void;
  onCreate?: (name: string, color: LabelColor) => void | Promise<void>;
  onDelete?: (tagId: string) => void;
  onRename?: (tagId: string, newName: string) => void;
  onColorChange?: (tagId: string, color: LabelColor) => void | Promise<void>;
  emptyText?: string;
  showCreate?: boolean;
  accentColor?: LabelColor;
}

const TAG_COLOR_OPTIONS: LabelColor[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'];
const randomTagColor = (): LabelColor =>
  TAG_COLOR_OPTIONS[Math.floor(Math.random() * TAG_COLOR_OPTIONS.length)] || 'blue';
const normalizeTagName = (value: string) => value.trim().replace(/\s+/g, ' ');

const TagsModal: React.FC<TagsModalProps> = ({
  open,
  onClose,
  title = 'Tags',
  tags,
  selectedIds = [],
  onToggle,
  onCreate,
  onDelete,
  onRename,
  onColorChange,
  emptyText = 'No tags yet. Create one below.',
  showCreate = true,
  accentColor,
}) => {
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<LabelColor>(accentColor || randomTagColor());
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');
  const colorPickerRef = useRef<HTMLDivElement | null>(null);
  const [colorPickerId, setColorPickerId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const closeColorPicker = () => {
    setColorPickerId(null);
  };

  // No longer tracking anchorEl/pickerRect - modal is always centered

  if (!open) return null;

  const handleCreate = async () => {
    const name = normalizeTagName(newName);
    if (!name || !onCreate || creating) return;
    setCreating(true);
    try {
      await onCreate(name, newColor);
      setNewName('');
      setNewColor(randomTagColor());
    } catch {
      // caller is responsible for surfacing errors
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (tagId: string) => {
    if (!onDelete) return;
    onDelete(tagId);
    setPendingDelete(null);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <div
        className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-card p-5 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {pendingDelete && onDelete && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5">
            <p className="text-xs font-medium text-foreground">Delete this tag everywhere? This cannot be undone.</p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => setPendingDelete(null)}
                className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(pendingDelete)}
                className="rounded-lg bg-destructive px-2.5 py-1 text-xs font-semibold text-destructive-foreground"
              >
                Delete
              </button>
            </div>
          </div>
        )}

        <div className="mb-4 max-h-52 space-y-2 overflow-y-auto pr-1">
          {tags.length === 0 && (
            <p className="py-3 text-center text-xs text-muted-foreground">{emptyText}</p>
          )}
          {tags.map(tag => {
            const active = selectedIds.includes(tag.id);
            const isRenaming = renamingId === tag.id;
            return (
              <div
                key={tag.id}
                data-tag-row
                className={`relative flex items-center gap-2 rounded-xl border px-3 py-2 ${
                  active ? 'border-primary/30 bg-primary/5' : 'border-border/60'
                }`}
              >
                {isRenaming ? (
                  <input
                    autoFocus
                    value={renamingValue}
                    onChange={e => setRenamingValue(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    onBlur={() => {
                      const name = normalizeTagName(renamingValue);
                      if (name && onRename) onRename(tag.id, name);
                      setRenamingId(null);
                    }}
                    onKeyDown={e => {
                      e.stopPropagation();
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      else if (e.key === 'Escape') setRenamingId(null);
                    }}
                    className="flex-1 rounded-lg border border-primary bg-muted/40 px-2 py-1 text-sm outline-none"
                  />
                ) : (
                  <>
                    <button
                      data-color-trigger
                      onClick={e => {
                        e.stopPropagation();
                        if (!onColorChange) return;
                        if (colorPickerId === tag.id) {
                          closeColorPicker();
                        } else {
                          setColorPickerId(tag.id);
                        }
                      }}
                      title="Change tag color"
                      className={`h-4 w-4 flex-shrink-0 rounded-full border border-black/10 transition-transform hover:scale-110 ${LABEL_COLORS[tag.color]}`}
                    />
                  </>
                )}
                {isRenaming ? null : (
                  <button
                    onClick={() => onToggle && onToggle(tag.id)}
                    disabled={!onToggle}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span
                      onClick={onRename
                        ? e => {
                            e.stopPropagation();
                            setRenamingId(tag.id);
                            setRenamingValue(tag.name);
                          }
                        : undefined}
                      title={onRename ? 'Rename tag' : tag.name}
                      className="truncate text-sm text-foreground"
                    >
                      {tag.name}
                    </span>
                    {active && <span className="ml-auto text-[10px] font-semibold text-primary">Selected</span>}
                  </button>
                )}
                {onDelete && !isRenaming && (
                  <button
                    onClick={() => setPendingDelete(tag.id)}
                    className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="Delete tag"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {colorPickerId && onColorChange && (() => {
          const activeTag = tags.find(t => t.id === colorPickerId);
          if (!activeTag) return null;
          return createPortal(
            <div
              ref={colorPickerRef}
              className="fixed z-[100] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-1.5 rounded-xl border border-border bg-card p-2 shadow-xl">
                {TAG_COLOR_OPTIONS.map(color => (
                  <button
                    key={color}
                    title={color}
                    onClick={() => {
                      onColorChange(activeTag.id, color);
                      closeColorPicker();
                    }}
                    className={`h-4 w-4 rounded-full border transition-all ${LABEL_COLORS[color]} ${
                      activeTag.color === color ? 'scale-110 border-foreground/60' : 'border-transparent hover:scale-105'
                    }`}
                  />
                ))}
              </div>
            </div>,
            document.body
          );
        })()}

        {showCreate && onCreate && (
          <div className="border-t border-border pt-4">
            <div className="mb-2 flex gap-2">
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
                placeholder="Create tag"
                className="min-w-0 flex-1 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
              />
              <div className="flex shrink-0 items-center gap-1 rounded-xl border border-border bg-muted/40 px-2 py-1.5">
                {TAG_COLOR_OPTIONS.map(color => (
                  <button
                    key={color}
                    title={color}
                    onClick={() => setNewColor(color)}
                    className={`h-4 w-4 rounded-full border transition-all ${LABEL_COLORS[color]} ${
                      newColor === color ? 'scale-110 border-foreground/60' : 'border-transparent hover:scale-105'
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || creating}
                className="flex-1 rounded-xl px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: `hsl(${typeof window !== 'undefined' ? localStorage.getItem('accentHsl') || '0 0% 0%' : '0 0% 0%'})` }}
              >
                {creating ? 'Adding...' : 'Add tag'}
              </button>
              <button
                onClick={onClose}
                className="rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TagsModal;