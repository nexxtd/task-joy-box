import React from 'react';
import { BarChart3, X } from 'lucide-react';

interface Note {
  id: number | string;
  pinned: boolean;
  tags: { id: number; name: string; color: string }[];
  projectId?: number | null;
}

interface NoteAnalysisPanelProps {
  open: boolean;
  onClose: () => void;
  notes: Note[];
  loading?: boolean;
}

const NoteAnalysisPanel: React.FC<NoteAnalysisPanelProps> = ({ open, onClose, notes, loading }) => {
  if (!open) return null;

  const pinnedCount = notes.filter(n => n.pinned).length;
  const withTags = notes.filter(n => n.tags.length > 0).length;
  const withProjects = notes.filter(n => n.projectId).length;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div className="absolute inset-0 bg-black/10 pointer-events-auto" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-sm bg-card border-l border-border shadow-[-10px_0_30px_rgba(0,0,0,0.08)] pointer-events-auto flex flex-col">
        <header className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Note Analysis</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Analyzing notes...
            </div>
          ) : (
            <div className="space-y-4">
              <h4 className="text-base font-semibold text-foreground">Notes Overview</h4>
              <p className="text-sm text-muted-foreground">{notes.length} notes in current view</p>
              <div className="space-y-2">
                {[
                  { text: `${pinnedCount} pinned` },
                  { text: `${notes.length - pinnedCount} unpinned` },
                  { text: `${withTags} with tags` },
                  { text: `${withProjects} with projects` },
                ].map((line, idx) => (
                  <div key={idx} className="text-sm text-foreground bg-muted/30 rounded-lg px-3 py-2">{line.text}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};

export default NoteAnalysisPanel;
