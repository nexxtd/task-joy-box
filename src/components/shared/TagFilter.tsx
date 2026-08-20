import React from 'react';
import { Tag, X, ChevronDown } from 'lucide-react';

interface TagItem {
  id: number | string;
  name: string;
  color: string;
}

interface TagFilterProps {
  tags: TagItem[];
  selectedIds: (number | string)[];
  onToggle: (id: number | string) => void;
  onClear: () => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  label?: string;
}

const TagFilter: React.FC<TagFilterProps> = ({ tags, selectedIds, onToggle, onClear, isOpen, onOpenChange, label = 'Tags' }) => {
  return (
    <div className="relative">
      <button
        onClick={() => onOpenChange(!isOpen)}
        className="flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-xl border bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
      >
        <Tag className="w-3.5 h-3.5" />
        {label}
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => onOpenChange(false)} />
          <div className="absolute left-0 mt-1.5 w-96 max-w-[95vw] bg-card border border-border rounded-2xl shadow-xl z-30 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Tag filter</p>
                <p className="text-xs text-muted-foreground">Filter by tag.</p>
              </div>
              <button onClick={() => onOpenChange(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
              {tags.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">No tags yet.</p>
              )}
              {tags.map(tag => {
                const isActive = selectedIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => onToggle(tag.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all text-left ${
                      isActive
                        ? 'border-primary/30 bg-primary/5 shadow-sm'
                        : 'border-border/60 hover:bg-muted/40'
                    }`}
                  >
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                    <span className="text-sm text-foreground flex-1">{tag.name}</span>
                    {isActive && <span className="text-[10px] text-primary font-bold">✓</span>}
                  </button>
                );
              })}
            </div>
            {selectedIds.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={onClear}
                  className="px-3 py-1 text-xs rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
                >
                  Clear tags
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default TagFilter;
