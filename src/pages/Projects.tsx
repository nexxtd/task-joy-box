import React, { useState, useRef, useCallback, useEffect } from 'react';
import { DragDropContext, Droppable, DropResult } from '@hello-pangea/dnd';
import { useBoardContext } from '@/context/BoardContext';
import { useAuth } from '@/context/AuthContext';
import BoardColumn from '@/components/BoardColumn';
import TaskDetailModal from '@/components/TaskDetailModal';
import ListView from '@/components/ListView';
import CalendarView from '@/components/CalendarView';
import Whiteboard from '@/components/Whiteboard'; // Import the new Whiteboard component
import { Task, ViewType } from '@/types/board';
import { Plus, LayoutDashboard, List, CalendarDays, ZoomIn, ZoomOut, Maximize2, Lock, SquareGantt } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 1.5;
const ZOOM_STEP = 0.1;

const Projects: React.FC = () => {
  const { board, moveTask, reorderColumns, addColumn } = useBoardContext();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColTitle, setNewColTitle] = useState('');
  const [currentView, setCurrentView] = useState<ViewType>('board'); // Updated to include whiteboard
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);

  const isFree = !user?.subscriptionTier || user.subscriptionTier === 'free';
  const FREE_COL_LIMIT = 2;

  // ── Zoom & Pan ─────────────────────────────────────────────
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
  const zoomIn  = () => setZoom(z => clampZoom(+(z + ZOOM_STEP).toFixed(2)));
  const zoomOut = () => setZoom(z => clampZoom(+(z - ZOOM_STEP).toFixed(2)));
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // Ctrl/Cmd + wheel to zoom
  const handleWheel = useCallback((e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom(z => clampZoom(+(z - e.deltaY * 0.001).toFixed(3)));
    }
  }, []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Left-click drag to pan (on canvas background only)
  const startPan = (e: React.MouseEvent) => {
    // Only pan when clicking directly on the canvas background (not on a card)
    if ((e.target as HTMLElement).closest('[data-no-pan]')) return;
    isPanning.current = true;
    panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
    e.preventDefault();
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isPanning.current) return;
    setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
  };

  const stopPan = () => {
    if (isPanning.current) {
      isPanning.current = false;
      if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
    }
  };

  // ── Board logic ─────────────────────────────────────────────
  const sortedColumns = [...board.columns].sort((a, b) => a.order - b.order);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    if (result.type === 'column') {
      reorderColumns(result.source.index, result.destination.index);
      return;
    }
    moveTask(result.draggableId, result.destination.droppableId, result.destination.index);
  };

  // Fix for drag offset when zoomed - adjusts the drag position
  const handleDragStart = () => {
    // Add a class to body during drag for global styling
    document.body.classList.add('is-dragging');
  };

  const handleDragUpdate = () => {
    // Drag is in progress
  };

  const handleAddColumn = () => {
    if (!newColTitle.trim()) return;
    if (isFree && board.columns.length >= FREE_COL_LIMIT) {
      setShowUpgradePrompt(true);
      setAddingColumn(false);
      setNewColTitle('');
      return;
    }
    addColumn(newColTitle.trim());
    setNewColTitle('');
    setAddingColumn(false);
  };

  const handleAddColumnClick = () => {
    if (isFree && board.columns.length >= FREE_COL_LIMIT) {
      setShowUpgradePrompt(true);
      return;
    }
    setAddingColumn(true);
  };

  const currentTask = selectedTask ? board.tasks.find(t => t.id === selectedTask.id) : null;

  const viewTabs = [
    { id: 'board' as ViewType, label: 'Board', icon: LayoutDashboard },
    { id: 'list' as ViewType,  label: 'List',  icon: List },
    { id: 'calendar' as ViewType, label: 'Calendar', icon: CalendarDays },
    { id: 'whiteboard' as ViewType, label: 'Whiteboard', icon: SquareGantt }, // Added whiteboard view
  ];

  const zoomPct = Math.round(zoom * 100);

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-background/80 backdrop-blur-sm z-10 flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-base font-bold text-foreground">{board.title}</h1>

          {/* View tabs */}
          <div className="flex items-center bg-muted rounded-lg p-0.5">
            {viewTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setCurrentView(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-all duration-200',
                  currentView === tab.id
                    ? 'bg-card text-foreground shadow-sm font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Free tier badge */}
          {isFree && (
            <span className="text-[10px] font-bold px-2 py-1 bg-muted border border-border rounded-full text-muted-foreground uppercase tracking-wide">
              Free: {board.columns.length}/{FREE_COL_LIMIT} projects
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground hidden sm:block">
            {board.tasks.length} tasks · {board.columns.length} columns
          </span>

          {/* Zoom controls — board view only */}
          {currentView === 'board' && (
            <div className="flex items-center gap-1 bg-muted/60 border border-border rounded-xl p-1">
              <button
                onClick={zoomOut}
                disabled={zoom <= MIN_ZOOM}
                title="Zoom out (Ctrl + scroll)"
                className="p-1.5 rounded-lg hover:bg-background disabled:opacity-30 transition-all"
              >
                <ZoomOut className="w-3.5 h-3.5 text-muted-foreground" />
              </button>

              <button
                onClick={resetView}
                title="Reset view"
                className="px-2.5 py-1 text-[11px] font-bold tabular-nums text-foreground hover:text-primary rounded-lg hover:bg-background transition-all min-w-[44px] text-center"
              >
                {zoomPct}%
              </button>

              <button
                onClick={zoomIn}
                disabled={zoom >= MAX_ZOOM}
                title="Zoom in (Ctrl + scroll)"
                className="p-1.5 rounded-lg hover:bg-background disabled:opacity-30 transition-all"
              >
                <ZoomIn className="w-3.5 h-3.5 text-muted-foreground" />
              </button>

              <div className="w-px h-4 bg-border mx-0.5" />

              <button onClick={resetView} title="Reset to 100%" className="p-1.5 rounded-lg hover:bg-background transition-all">
                <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── Hint bar (board only) ── */}
      {currentView === 'board' && (
        <div className="px-6 py-1 bg-muted/20 border-b border-border flex items-center gap-4 text-[11px] text-muted-foreground flex-shrink-0">
          <span><kbd className="font-mono bg-muted px-1 rounded text-[10px]">Ctrl</kbd> + scroll to zoom</span>
          <span>·</span>
          <span>Drag background to pan</span>
          <span>·</span>
          <span>Click <b>{zoomPct}%</b> to reset</span>
        </div>
      )}

      {/* ── Board View ── */}
      {currentView === 'board' && (
        <div
          ref={canvasRef}
          className="flex-1 overflow-hidden relative"
          style={{ cursor: 'grab' }}
          onMouseDown={startPan}
          onMouseMove={onMouseMove}
          onMouseUp={stopPan}
          onMouseLeave={stopPan}
        >
          {/* Subtle dot grid */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)',
              backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
              backgroundPosition: `${pan.x}px ${pan.y}px`,
            }}
          />

          {/* Zoomable canvas */}
          <div
            className="absolute"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              padding: '32px',
              willChange: 'transform',
            }}
          >
            <DragDropContext
              onDragEnd={(result) => {
                document.body.classList.remove('is-dragging');
                handleDragEnd(result);
              }}
              onDragStart={handleDragStart}
              onDragUpdate={handleDragUpdate}
            >
              <Droppable droppableId="board" type="column" direction="horizontal">
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="flex gap-6 items-start"
                    data-no-pan="true"
                    onMouseDown={e => e.stopPropagation()}
                  >
                    {sortedColumns.map((column, index) => {
                      const tasks = board.tasks
                        .filter(t => t.columnId === column.id)
                        .sort((a, b) => a.order - b.order);
                      return (
                        <BoardColumn
                          key={column.id}
                          column={column}
                          tasks={tasks}
                          index={index}
                          onTaskClick={setSelectedTask}
                        />
                      );
                    })}
                    {provided.placeholder}

                    {/* Add Column */}
                    {addingColumn ? (
                      <div className="flex-shrink-0 w-72 animate-fade-in" data-no-pan="true">
                        <input
                          autoFocus
                          value={newColTitle}
                          onChange={e => setNewColTitle(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleAddColumn();
                            if (e.key === 'Escape') setAddingColumn(false);
                          }}
                          placeholder="Column name..."
                          className="w-full bg-task border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <div className="flex gap-2 mt-2">
                          <button onClick={handleAddColumn} className="bg-primary text-primary-foreground text-xs font-medium px-3 py-1.5 rounded-md hover:bg-primary/90 transition-colors">Add</button>
                          <button onClick={() => setAddingColumn(false)} className="text-xs text-muted-foreground px-3 py-1.5 hover:text-foreground transition-colors">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        data-no-pan="true"
                        onClick={handleAddColumnClick}
                        className={cn(
                          'flex-shrink-0 w-72 flex items-center gap-2 px-4 py-3 text-sm border-dashed rounded-lg transition-all duration-200',
                          isFree && board.columns.length >= FREE_COL_LIMIT
                            ? 'text-amber-600 border-amber-400/50 hover:border-amber-400 hover:bg-amber-500/5'
                            : 'text-muted-foreground border-border hover:text-foreground hover:border-foreground/30 hover:scale-[1.01]'
                        )}
                      >
                        {isFree && board.columns.length >= FREE_COL_LIMIT
                          ? <><Lock className="w-4 h-4" /> Upgrade for more projects</>
                          : <><Plus className="w-4 h-4" /> Add Column</>
                        }
                      </button>
                    )}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </div>
        </div>
      )}

      {currentView === 'list' && <div className="animate-fade-in flex-1"><ListView onTaskClick={setSelectedTask} /></div>}
      {currentView === 'calendar' && <div className="animate-fade-in flex-1"><CalendarView onTaskClick={setSelectedTask} /></div>}
      
      {/* Added Whiteboard view */}
      {currentView === 'whiteboard' && <div className="animate-fade-in flex-1"><Whiteboard /></div>}

      {/* Task detail modal */}
      {currentTask && (
        <TaskDetailModal task={currentTask} onClose={() => setSelectedTask(null)} />
      )}

      {/* ── Upgrade prompt modal ── */}
      {showUpgradePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setShowUpgradePrompt(false)}>
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
          <div
            className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-8 animate-fade-in text-center"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-7 h-7 text-amber-500" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">Project Limit Reached</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Free accounts can have up to <strong>{FREE_COL_LIMIT} projects</strong>. Upgrade to Pro for unlimited projects.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { setShowUpgradePrompt(false); navigate('/pricing'); }}
                className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors"
              >
                View Plans
              </button>
              <button
                onClick={() => setShowUpgradePrompt(false)}
                className="w-full py-2.5 text-muted-foreground text-sm hover:text-foreground transition-colors"
              >
                Stay on Free
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Projects;