import React, { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { 
  StickyNote, 
  Type, 
  FileText, 
  Image, 
  Link, 
  Square, 
  SquareCheckBig,
  GitBranch,
  Paperclip,
  Plus,
  MousePointer2,
  Move,
  RotateCcw,
  Trash2,
  GripVertical,
  Minus,
  Circle,
  Triangle,
  SquareIcon,
  Star,
  ArrowRight,
  AlignLeft,
  CheckSquare
} from 'lucide-react';

interface Tool {
  id: string;
  name: string;
  icon: React.ReactNode;
}

interface CanvasItem {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  content?: string;
  color?: string;
  rotation?: number;
  fontSize?: number;
  borderColor?: string;
  backgroundColor?: string;
  connections?: ConnectionPoint[];
  title?: string;
  tasks?: Array<{ id: string; text: string; completed: boolean }>;
}

interface Connection {
  id: string;
  sourceId: string;
  targetId: string;
  sourcePoint: { x: number; y: number };
  targetPoint: { x: number; y: number };
  type: 'straight' | 'curved' | 'elbow' | 'dotted';
}

interface ConnectionPoint {
  id: string;
  itemId: string;
  x: number;
  y: number;
  connected: boolean;
}

const Whiteboard: React.FC = () => {
  // Define available tools
  const tools: Tool[] = [
    { id: 'select', name: 'Select', icon: <MousePointer2 className="w-4 h-4" /> },
    { id: 'sticky-note', name: 'Sticky Note', icon: <StickyNote className="w-4 h-4" /> },
    { id: 'text', name: 'Text Section', icon: <Type className="w-4 h-4" /> },
    { id: 'document', name: 'Document Block', icon: <FileText className="w-4 h-4" /> },
    { id: 'image', name: 'Image', icon: <Image className="w-4 h-4" /> },
    { id: 'connector', name: 'Connector', icon: <Link className="w-4 h-4" /> },
    { id: 'shape', name: 'Shape', icon: <Square className="w-4 h-4" /> },
    { id: 'task', name: 'Task Block', icon: <SquareCheckBig className="w-4 h-4" /> },
    { id: 'mindmap', name: 'Mindmap', icon: <GitBranch className="w-4 h-4" /> },
    { id: 'file', name: 'File Upload', icon: <Paperclip className="w-4 h-4" /> },
  ];

  const [activeTool, setActiveTool] = useState<string>('select');
  const [items, setItems] = useState<CanvasItem[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<{ sourceId: string, pointId: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Handle canvas click to create items
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Only create items when not dragging and with non-select tools
    if (isDragging || activeTool === 'select' || activeTool === 'connector') return;

    // Create new item based on active tool
    const newItem: CanvasItem = {
      id: `item-${Date.now()}`,
      type: activeTool,
      x,
      y,
      width: activeTool === 'sticky-note' ? 180 : 250,
      height: activeTool === 'sticky-note' ? 180 : 200,
      content: activeTool === 'sticky-note' || activeTool === 'text' 
        ? 'Double click to edit...' 
        : undefined,
      color: activeTool === 'sticky-note' 
        ? ['#fef3c7', '#dbeafe', '#d1fae5', '#ffe4e6'][Math.floor(Math.random() * 4)] 
        : undefined,
      connections: [],
    };

    setItems(prev => [...prev, newItem]);
  };

  // Handle item selection
  const handleItemClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedItem(id);
    
    // Set drag offset
    const item = items.find(i => i.id === id);
    if (item) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        setDragOffset({
          x: e.clientX - rect.left - offset.x - item.x,
          y: e.clientY - rect.top - offset.y - item.y
        });
      }
    }
  };

  // Start connecting
  const handleConnectionPointClick = (itemId: string, pointId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!connecting) {
      setConnecting({ sourceId: itemId, pointId });
    } else {
      // Create connection if both points are selected
      if (connecting.sourceId !== itemId) {
        // Find the items
        const sourceItem = items.find(i => i.id === connecting.sourceId);
        const targetItem = items.find(i => i.id === itemId);
        
        if (sourceItem && targetItem) {
          // Calculate connection points
          const sourceX = sourceItem.x + (sourceItem.width || 0) / 2;
          const sourceY = sourceItem.y + (sourceItem.height || 0) / 2;
          const targetX = targetItem.x + (targetItem.width || 0) / 2;
          const targetY = targetItem.y + (targetItem.height || 0) / 2;
          
          const newConnection: Connection = {
            id: `conn-${Date.now()}`,
            sourceId: connecting.sourceId,
            targetId: itemId,
            sourcePoint: { x: sourceX, y: sourceY },
            targetPoint: { x: targetX, y: targetY },
            type: 'curved'
          };
          
          setConnections(prev => [...prev, newConnection]);
        }
      }
      setConnecting(null);
    }
  };

  // Start dragging an item
  const handleItemMouseDown = (e: React.MouseEvent) => {
    if (selectedItem) {
      setIsDragging(true);
      e.stopPropagation();
    }
  };

  // Start panning the canvas
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left mouse button
    
    // Only pan if clicking on the canvas background (not on an item)
    if ((e.target as HTMLElement).classList.contains('canvas-item')) {
      return;
    }
    
    setIsPanning(true);
    setPanStart({
      x: e.clientX - offset.x,
      y: e.clientY - offset.y
    });
    e.preventDefault();
  };

  // Handle dragging
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !selectedItem || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - dragOffset.x;
    const y = e.clientY - rect.top - dragOffset.y;
    
    setItems(prev => prev.map(item => 
      item.id === selectedItem ? { ...item, x, y } : item
    ));
    
    // Update connections when item moves
    setConnections(prev => prev.map(conn => {
      const sourceItem = items.find(i => i.id === conn.sourceId);
      const targetItem = items.find(i => i.id === conn.targetId);
      
      if (sourceItem && sourceItem.id === selectedItem) {
        return {
          ...conn,
          sourcePoint: { 
            x: sourceItem.x + (sourceItem.width || 0) / 2, 
            y: sourceItem.y + (sourceItem.height || 0) / 2 
          }
        };
      } else if (targetItem && targetItem.id === selectedItem) {
        return {
          ...conn,
          targetPoint: { 
            x: targetItem.x + (targetItem.width || 0) / 2, 
            y: targetItem.y + (targetItem.height || 0) / 2 
          }
        };
      }
      return conn;
    }));
  };

  // Stop dragging
  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Reset view
  const resetView = () => {
    setItems([]);
    setConnections([]);
    setSelectedItem(null);
    setConnecting(null);
    setOffset({ x: 0, y: 0 });
  };

  // Delete selected item
  const deleteSelectedItem = () => {
    if (!selectedItem) return;
    
    // Remove item
    setItems(prev => prev.filter(item => item.id !== selectedItem));
    
    // Remove connections related to this item
    setConnections(prev => prev.filter(
      conn => conn.sourceId !== selectedItem && conn.targetId !== selectedItem
    ));
    
    setSelectedItem(null);
  };

  // Cleanup event listeners
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDragging || isPanning) {
        const mouseEvent = new MouseEvent('mousemove', {
          clientX: e.clientX,
          clientY: e.clientY
        });
        handleMouseMove(mouseEvent as unknown as React.MouseEvent);
      }
    };

    const handleGlobalMouseUp = () => {
      if (isDragging || isPanning) {
        handleMouseUp();
      }
      if (connecting) {
        setConnecting(null);
      }
    };

    if (isDragging || isPanning || connecting) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, isPanning, connecting, selectedItem, dragOffset, offset]);

  // Render different item types
  const renderItem = (item: CanvasItem) => {
    const isSelected = selectedItem === item.id;
    const isHovered = hoveredItem === item.id;
    
    const baseClasses = cn(
      "absolute border border-transparent group canvas-item",
      isSelected && "border-blue-400 ring-2 ring-blue-400 ring-opacity-50 z-10",
      !isSelected && "z-0"
    );

    // Show connection points when item is selected or hovered
    const showConnectionPoints = isSelected || isHovered || (connecting?.sourceId === item.id);

    // Generate connection points around the item
    const getConnectionPoints = () => {
      if (!showConnectionPoints) return null;
      
      const centerX = item.x + (item.width || 0) / 2;
      const centerY = item.y + (item.height || 0) / 2;
      
      return (
        <>
          {/* Top center */}
          <div 
            className="absolute w-3 h-3 rounded-full bg-blue-500 border-2 border-white cursor-pointer -mt-1.5 -ml-1.5 transform -translate-x-1/2 -translate-y-1/2"
            style={{ left: centerX, top: item.y + offset.y }}
            onClick={(e) => handleConnectionPointClick(item.id, 'top', e)}
          />
          
          {/* Right center */}
          <div 
            className="absolute w-3 h-3 rounded-full bg-blue-500 border-2 border-white cursor-pointer -mt-1.5 -ml-1.5 transform -translate-x-1/2 -translate-y-1/2"
            style={{ left: item.x + offset.x + (item.width || 0), top: centerY }}
            onClick={(e) => handleConnectionPointClick(item.id, 'right', e)}
          />
          
          {/* Bottom center */}
          <div 
            className="absolute w-3 h-3 rounded-full bg-blue-500 border-2 border-white cursor-pointer -mt-1.5 -ml-1.5 transform -translate-x-1/2 -translate-y-1/2"
            style={{ left: centerX, top: item.y + offset.y + (item.height || 0) }}
            onClick={(e) => handleConnectionPointClick(item.id, 'bottom', e)}
          />
          
          {/* Left center */}
          <div 
            className="absolute w-3 h-3 rounded-full bg-blue-500 border-2 border-white cursor-pointer -mt-1.5 -ml-1.5 transform -translate-x-1/2 -translate-y-1/2"
            style={{ left: item.x + offset.x, top: centerY }}
            onClick={(e) => handleConnectionPointClick(item.id, 'left', e)}
          />
        </>
      );
    };

    switch (item.type) {
      case 'sticky-note':
        return (
          <React.Fragment key={item.id}>
            <div
              className={cn(baseClasses, "rounded-lg shadow-sm")}
              style={{
                left: item.x + offset.x,
                top: item.y + offset.y,
                width: item.width,
                height: item.height,
                backgroundColor: item.color,
                transform: isHovered ? 'translateY(-5px)' : 'none',
                transition: 'transform 0.2s ease'
              }}
              onClick={(e) => handleItemClick(item.id, e)}
              onMouseDown={handleItemMouseDown}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <div className="p-3 h-full rounded-lg border border-white/50">
                <textarea
                  className="w-full h-full bg-transparent resize-none outline-none text-sm font-sans"
                  defaultValue={item.content || 'Click to edit...'}
                  style={{ fontFamily: "'Comic Sans MS', cursive, sans-serif" }}
                />
              </div>
            </div>
            {getConnectionPoints()}
          </React.Fragment>
        );
        
      case 'text':
        return (
          <React.Fragment key={item.id}>
            <div
              className={cn(baseClasses, "bg-white rounded-lg shadow-sm border")}
              style={{
                left: item.x + offset.x,
                top: item.y + offset.y,
                width: item.width,
                height: item.height,
              }}
              onClick={(e) => handleItemClick(item.id, e)}
              onMouseDown={handleItemMouseDown}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <div className="p-4 h-full rounded-lg">
                <textarea
                  className="w-full h-full bg-transparent resize-none outline-none text-sm font-sans"
                  defaultValue={item.content || 'Type your text here...'}
                />
              </div>
            </div>
            {getConnectionPoints()}
          </React.Fragment>
        );
        
      case 'document':
        return (
          <React.Fragment key={item.id}>
            <div
              className={cn(baseClasses, "bg-white rounded-lg shadow-md border-2 border-gray-200")}
              style={{
                left: item.x + offset.x,
                top: item.y + offset.y,
                width: item.width,
                height: item.height,
              }}
              onClick={(e) => handleItemClick(item.id, e)}
              onMouseDown={handleItemMouseDown}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <div className="p-4 h-full rounded-lg border-t-2 border-gray-300">
                <div className="flex flex-col h-full">
                  <div className="font-bold mb-2 text-gray-700">Document Title</div>
                  <textarea
                    className="w-full h-full bg-transparent resize-none outline-none text-sm font-sans flex-grow"
                    defaultValue={item.content || 'Document content goes here...'}
                  />
                </div>
              </div>
            </div>
            {getConnectionPoints()}
          </React.Fragment>
        );
        
      case 'image':
        return (
          <React.Fragment key={item.id}>
            <div
              className={cn(baseClasses, "bg-gray-100 rounded-lg shadow-sm border-2 border-dashed flex flex-col items-center justify-center")}
              style={{
                left: item.x + offset.x,
                top: item.y + offset.y,
                width: item.width,
                height: item.height,
              }}
              onClick={(e) => handleItemClick(item.id, e)}
              onMouseDown={handleItemMouseDown}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <Image className="w-12 h-12 text-gray-400" />
              <span className="mt-2 text-gray-500 text-sm">Drop image here</span>
            </div>
            {getConnectionPoints()}
          </React.Fragment>
        );
        
      case 'shape':
        return (
          <React.Fragment key={item.id}>
            <div
              className={cn(baseClasses, "bg-blue-100 rounded-lg shadow-sm border-2 border-blue-300 flex items-center justify-center")}
              style={{
                left: item.x + offset.x,
                top: item.y + offset.y,
                width: item.width,
                height: item.height,
              }}
              onClick={(e) => handleItemClick(item.id, e)}
              onMouseDown={handleItemMouseDown}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <Square className="w-8 h-8 text-blue-500 opacity-70" />
            </div>
            {getConnectionPoints()}
          </React.Fragment>
        );
        
      case 'task':
        return (
          <React.Fragment key={item.id}>
            <div
              className={cn(baseClasses, "bg-white rounded-lg shadow-sm border")}
              style={{
                left: item.x + offset.x,
                top: item.y + offset.y,
                width: item.width,
                height: item.height,
              }}
              onClick={(e) => handleItemClick(item.id, e)}
              onMouseDown={handleItemMouseDown}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <div className="p-3 h-full rounded-lg border">
                <div className="font-bold text-sm mb-2 text-gray-800">{item.title}</div>
                <div className="space-y-2">
                  {item.tasks?.map(task => (
                    <div key={task.id} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => toggleTaskCompletion(item.id, task.id)}
                        className="mr-2 h-4 w-4 text-blue-600 rounded"
                      />
                      <span className={cn("text-sm", task.completed ? "line-through text-gray-400" : "text-gray-700")}>
                        {task.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {getConnectionPoints()}
          </React.Fragment>
        );
        
      case 'mindmap':
        return (
          <React.Fragment key={item.id}>
            <div
              className={cn(baseClasses, "bg-purple-100 rounded-full shadow-sm border-2 border-purple-200 flex items-center justify-center")}
              style={{
                left: item.x + offset.x,
                top: item.y + offset.y,
                width: item.width,
                height: item.height,
                backgroundColor: item.backgroundColor
              }}
              onClick={(e) => handleItemClick(item.id, e)}
              onMouseDown={handleItemMouseDown}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <div className="text-center px-4 py-2">
                <div className="text-sm font-medium text-purple-700">{item.content}</div>
              </div>
            </div>
            {getConnectionPoints()}
          </React.Fragment>
        );
        
      case 'file':
        return (
          <React.Fragment key={item.id}>
            <div
              className={cn(baseClasses, "bg-white rounded-lg shadow-sm border")}
              style={{
                left: item.x + offset.x,
                top: item.y + offset.y,
                width: item.width,
                height: item.height,
              }}
              onClick={(e) => handleItemClick(item.id, e)}
              onMouseDown={handleItemMouseDown}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <div className="p-3 h-full rounded-lg border border-gray-200 flex flex-col items-center justify-center">
                <Paperclip className="w-8 h-8 text-gray-400" />
                <div className="mt-2 text-sm text-gray-700 font-medium">{item.title}</div>
                <div className="text-xs text-gray-500 mt-1">PDF Document</div>
              </div>
            </div>
            {getConnectionPoints()}
          </React.Fragment>
        );
        
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full w-full bg-gray-50">
      {/* Left Sidebar Tool Selector */}
      <div className="w-16 bg-white/80 backdrop-blur-sm border-r border-gray-200 flex flex-col items-center py-4 space-y-2">
        {tools.map(tool => (
          <button
            key={tool.id}
            className={cn(
              "p-2.5 rounded-lg transition-all duration-200 hover:bg-gray-100 flex items-center justify-center",
              activeTool === tool.id 
                ? "bg-blue-100 text-blue-600 border border-blue-300" 
                : "text-gray-600"
            )}
            onClick={() => setActiveTool(tool.id)}
            title={tool.name}
          >
            {tool.icon}
          </button>
        ))}
        
        <div className="flex-grow"></div>
        
        {/* Reset button */}
        <button
          className="p-2.5 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
          onClick={resetView}
          title="Reset whiteboard"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
      
      {/* Canvas Area */}
      <div 
        ref={canvasRef}
        className="flex-1 relative overflow-hidden"
        onMouseDown={handleCanvasMouseDown}
        onClick={handleCanvasClick}
        onMouseUp={handleMouseUp}
        style={{ 
          backgroundImage: 'radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          cursor: isPanning ? 'grabbing' : 'default'
        }}
      >
        {/* Render all items */}
        {items.map(item => renderItem(item))}
        
        {/* Render connections */}
        <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
          {connections.map(conn => {
            const sourceX = conn.sourcePoint.x;
            const sourceY = conn.sourcePoint.y;
            const targetX = conn.targetPoint.x;
            const targetY = conn.targetPoint.y;
            
            // Calculate control points for curved lines
            const midX = (sourceX + targetX) / 2;
            const midY = (sourceY + targetY) / 2;
            const c1X = sourceX + (targetX - sourceX) / 4;
            const c1Y = sourceY;
            const c2X = targetX - (targetX - sourceX) / 4;
            const c2Y = targetY;
            
            let pathData = '';
            switch (conn.type) {
              case 'curved':
                pathData = `M ${sourceX} ${sourceY} C ${c1X} ${c1Y}, ${c2X} ${c2Y}, ${targetX} ${targetY}`;
                break;
              case 'elbow':
                const elbowX = (sourceX + targetX) / 2;
                pathData = `M ${sourceX} ${sourceY} L ${elbowX} ${sourceY} L ${elbowX} ${targetY} L ${targetX} ${targetY}`;
                break;
              case 'dotted':
                pathData = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
                break;
              default: // straight
                pathData = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
            }
            
            return (
              <path
                key={conn.id}
                d={pathData}
                stroke="#94a3b8"
                strokeWidth="2"
                fill="none"
                strokeDasharray={conn.type === 'dotted' ? "5,5" : "none"}
              />
            );
          })}
        </svg>
        
        {/* Toolbar for selected item */}
        {selectedItem && (
          <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg border p-2 flex space-x-1 z-20">
            <button className="p-2 text-gray-600 hover:bg-gray-100 rounded">
              <Move className="w-4 h-4" />
            </button>
            <button className="p-2 text-gray-600 hover:bg-gray-100 rounded">
              <Plus className="w-4 h-4" />
            </button>
            <button 
              className="p-2 text-red-600 hover:bg-red-50 rounded"
              onClick={deleteSelectedItem}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
        
        {/* Connection mode indicator */}
        {connecting && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-blue-500 text-white text-sm px-3 py-1.5 rounded-lg shadow-md z-20">
            Click on another item to connect
          </div>
        )}
      </div>
    </div>
  );
};

export default Whiteboard;