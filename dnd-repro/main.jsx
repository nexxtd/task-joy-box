import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal, flushSync } from 'react-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const q = new URLSearchParams(window.location.search);
const F = {
  transform: q.get('transform') === '1',
  hints: q.get('hints') === '1',
  completed: q.get('completed') === '1',
  clone: q.get('clone') === '1',
  pan: q.get('pan') === '1',
};

function Clone({ provided, style, children }) {
  if (!style) return <div ref={provided.innerRef} {...provided.draggableProps}>{children}</div>;
  const s = { ...style, pointerEvents: 'none', zIndex: 5000 };
  return createPortal(
    <div ref={provided.innerRef} {...provided.draggableProps} style={s}>{children}</div>,
    document.body
  );
}

const cardStyle = (isDragging) => ({
  border: '1px solid #ccc',
  borderRadius: 12,
  background: '#fff',
  padding: '16px',
  marginBottom: 0,
  transform: isDragging ? 'rotate(2deg)' : undefined,
  boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,.2)' : undefined,
});

function TaskRow({ task, dragHandleProps, isDragging }) {
  return (
    <div data-no-pan="true" data-testid={`card-${task.id}`} style={cardStyle(isDragging)}>
      <span {...dragHandleProps} data-testid={`grip-${task.id}`} style={{ cursor: 'grab', padding: 4, border: '1px dashed #999' }}>::</span>
      {' '}{task.title}
    </div>
  );
}

function Column({ column, tasks, index, isDragging, isTaskDragging, onMoveLog }) {
  const renderTaskClone = (cloneProvided, cloneSnapshot, rubric) => {
    const t = tasks.find(x => x.id === rubric.draggableId);
    if (!t) return null;
    return (
      <Clone provided={cloneProvided} style={cloneProvided.draggableProps.style}>
        <div data-testid={`clone-${t.id}`} style={{ ...cardStyle(true), width: 300 }}>{t.title} (clone)</div>
      </Clone>
    );
  };
  return (
    <Draggable draggableId={column.id} index={index}>
      {(provided) => (
        <div ref={provided.innerRef} {...provided.draggableProps} data-testid={`col-${column.id}`}
             style={{ width: 340, flexShrink: 0, background: '#eee', borderRadius: 12, padding: 8 }}>
          <div {...provided.dragHandleProps} data-no-pan="true" data-testid={`colgrip-${column.id}`}
               style={{ padding: '6px 8px', fontWeight: 700 }}>{column.title}</div>
          <Droppable droppableId={column.id} type="task" renderClone={F.clone ? renderTaskClone : undefined}>
            {(dropProvided, snapshot) => (
              <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} data-testid={`drop-${column.id}`}
                   style={{ minHeight: 100, padding: 8, display: 'flex', flexDirection: 'column', gap: 12,
                            background: snapshot.isDraggingOver ? '#dfe' : undefined }}>
                {tasks.map((task, taskIndex) => (
                  <Draggable key={task.id} draggableId={task.id} index={taskIndex}>
                    {(taskProvided, taskSnapshot) => (
                      <div ref={taskProvided.innerRef} {...taskProvided.draggableProps}>
                        <TaskRow task={task} dragHandleProps={taskProvided.dragHandleProps} isDragging={taskSnapshot.isDragging} />
                      </div>
                    )}
                  </Draggable>
                ))}
                {F.hints && isTaskDragging && tasks.length === 0 && (
                  <div data-testid={`hint-${column.id}`} style={{ border: '2px dashed green', padding: 8 }}>Drop here</div>
                )}
                {dropProvided.placeholder}
              </div>
            )}
          </Droppable>
          {F.completed && (isTaskDragging) && (
            <Droppable droppableId={'completed-' + column.id} type="task" renderClone={F.clone ? renderTaskClone : undefined}>
              {(cp, cs) => (
                <div ref={cp.innerRef} {...cp.droppableProps} data-testid={`completed-${column.id}`}
                     style={{ marginTop: 8, border: '2px dashed teal', padding: 8 }}>
                  Drop here to complete
                  {cp.placeholder}
                </div>
              )}
            </Droppable>
          )}
        </div>
      )}
    </Draggable>
  );
}

function App() {
  const [cols] = useState([
    { id: 'col-a', title: 'asd' },
    { id: 'col-b', title: 'ASD' },
    { id: 'col-c', title: 'empty' },
  ]);
  const [tasks, setTasks] = useState([
    { id: 't1', title: 'ASD', columnId: 'col-a' },
    { id: 't2', title: 'ASDASDAD', columnId: 'col-a' },
    { id: 't3', title: 'sasda', columnId: 'col-b' },
  ]);
  const [status, setStatus] = useState('idle');
  const [isBoardDragging, setIsBoardDragging] = useState(false);
  const [isTaskDragging, setIsTaskDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 48, y: 32 });
  const [panning, setPanning] = useState(false);
  const panStart = React.useRef({ x: 0, y: 0 });

  React.useEffect(() => {
    if (!panning) return;
    const onMove = (e) => setOffset({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
    const onUp = () => setPanning(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [panning]);

  const onPointerDown = (e) => {
    if (!F.pan) return;
    if (e.button !== 0) return;
    if (document.body.classList.contains('is-dragging')) return;
    if (e.target.closest('[data-rbd-drag-handle-context-id], [data-rbd-draggable-context-id]')) return;
    if (e.target.closest('[data-no-pan="true"]')) return;
    setPanning(true);
    panStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
  };

  const handleDragEnd = (result) => {
    document.body.classList.remove('is-dragging');
    setIsBoardDragging(false);
    setIsTaskDragging(false);
    if (!result.destination) { setStatus('no-destination'); return; }
    if (result.type === 'column') { setStatus(`col ${result.source.index}->${result.destination.index}`); return; }
    setStatus(`task ${result.draggableId} ${result.source.droppableId}[${result.source.index}]->${result.destination.droppableId}[${result.destination.index}]`);
    const { draggableId, source, destination } = result;
    setTasks(prev => {
      const moving = prev.find(t => t.id === draggableId);
      if (!moving) return prev;
      const destList = prev.filter(t => t.columnId === destination.droppableId && t.id !== draggableId);
      destList.splice(Math.min(destination.index, destList.length), 0, { ...moving, columnId: destination.droppableId });
      const others = prev.filter(t => t.columnId !== destination.droppableId && !(t.columnId === source.droppableId && t.id === draggableId));
      // keep it simple: rebuild
      const srcRest = prev.filter(t => t.columnId === source.droppableId && t.id !== draggableId);
      const untouched = prev.filter(t => t.columnId !== source.droppableId && t.columnId !== destination.droppableId);
      if (source.droppableId === destination.droppableId) {
        const list = prev.filter(t => t.columnId === source.droppableId);
        const ids = list.map(t => t.id);
        ids.splice(source.index, 1);
        ids.splice(destination.index, 0, draggableId);
        const byId = new Map(prev.map(t => [t.id, t]));
        return [...untouched, ...ids.map(id => byId.get(id))];
      }
      return [...untouched, ...srcRest, ...destList];
    });
  };

  const innerStyle = F.transform
    ? { transform: `translate(${offset.x}px, ${offset.y}px) scale(1)`, transformOrigin: '0 0' }
    : undefined;

  return (
    <div style={{ padding: 24 }}>
      <h2>variant {window.location.search}</h2>
      <div id="status" data-testid="status" style={{ padding: 8, background: '#ffd', marginBottom: 12 }}>{status}</div>
      <div id="flags" data-testid="flags">{`dragging=${isBoardDragging} task=${isTaskDragging}`}</div>
      <DragDropContext
        onDragEnd={handleDragEnd}
        onBeforeCapture={(before) => {
          flushSync(() => {
            setIsBoardDragging(true);
            setIsTaskDragging(!cols.some(c => c.id === before.draggableId));
          });
        }}
        onDragStart={(start) => {
          document.body.classList.add('is-dragging');
          setPanning(false);
          setIsBoardDragging(true);
          setIsTaskDragging(start?.type !== 'column');
        }}
      >
        <div data-testid="canvas" onPointerDown={onPointerDown}
             style={{ overflow: 'hidden', background: '#fafafa', padding: 16, cursor: panning ? 'grabbing' : 'grab' }}>
          <div style={innerStyle}>
            <Droppable droppableId="board" type="column" direction="horizontal">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
                  {cols.map((c, i) => (
                    <Column key={c.id} column={c} index={i}
                            tasks={tasks.filter(t => t.columnId === c.id)}
                            isDragging={isBoardDragging} isTaskDragging={isTaskDragging} />
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        </div>
      </DragDropContext>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
