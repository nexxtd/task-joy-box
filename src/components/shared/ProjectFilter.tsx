import React from 'react';
import { FolderKanban, ChevronDown } from 'lucide-react';

interface ProjectItem {
  id: number;
  name: string;
  color: string;
}

interface ProjectFilterProps {
  projects: ProjectItem[];
  selectedId: number | 'all';
  onChange: (id: number | 'all') => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  allLabel?: string;
}

const ProjectFilter: React.FC<ProjectFilterProps> = ({ projects, selectedId, onChange, isOpen, onOpenChange, allLabel = 'Project Filter' }) => {
  return (
    <div className="relative">
      <button
        onClick={() => onOpenChange(!isOpen)}
        className={`flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-xl border transition-all ${
          selectedId !== 'all'
            ? 'bg-primary/10 border-primary/20 text-primary font-bold shadow-sm'
            : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted'
        }`}
      >
        <FolderKanban className="w-3.5 h-3.5" />
        <span>
          {selectedId === 'all'
            ? allLabel
            : `Project: ${projects.find(p => p.id === selectedId)?.name || 'Selected'}`}
        </span>
        <ChevronDown className="w-3.5 h-3.5 ml-1" />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => onOpenChange(false)} />
          <div className="absolute left-0 mt-1.5 w-64 bg-card border border-border rounded-xl shadow-lg z-30 p-2">
            <button
              onClick={() => { onChange('all'); onOpenChange(false); }}
              className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-muted"
            >
              All projects
            </button>
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {projects.map(project => (
                <button
                  key={project.id}
                  onClick={() => { onChange(project.id); onOpenChange(false); }}
                  className={`w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-muted flex items-center gap-2 ${
                    selectedId === project.id ? 'bg-primary/10 text-primary' : ''
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: project.color }} />
                  <span className="flex-1 truncate">{project.name}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ProjectFilter;
