import React, { useState, useRef, useEffect } from 'react';
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
  ZoomIn,
  ZoomOut,
  Maximize2,
  Save
} from 'lucide-react';
import { createWhiteboard, getWhiteboardById, updateWhiteboard, CanvasItem, Connection } from '@/services/whiteboardService';

interface Tool {
  id: string;
  name: string;
  icon: React.ReactNode;
}

interface ConnectionPoint {
  id: string;
  itemId: string;
  x: number;
  y: number;
  connected: boolean;
}

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 1.5;
const ZOOM_STEP = 0.1;

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
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [whiteboardId, setWhiteboardId] = useState<number | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

  const handleZoomIn = () => {
    setZoom(z => clampZoom(+(z + ZOOM_STEP).toFixed(2)));
  };

  const handleZoomOut = () => {
    setZoom(z => clampZoom(+(z - ZOOM_STEP).toFixed(2)));
  };

  const resetView = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  // Auto-save functionality
  useEffect(() => {
    const saveTimeout = setTimeout(() => {
      if (items.length > 0 || connections.length > 0) {
        saveWhiteboard();
      }
    }, 2000); // Save after 2 seconds of inactivity

    return () => clearTimeout(saveTimeout);
  }, [items, connections]);

  const saveWhiteboard = async () => {
    if (saving) return; // Prevent duplicate saves
    
    setSaving(true);
    try {
      if (whiteboardId) {
        // Update existing whiteboard
        await updateWhiteboard(whiteboardId, {
          name: 'Untitled Whiteboard',
          description: 'A collaborative whiteboard',
          items,
          connections
        });
      } else {
        // Create new whiteboard
        const result = await createWhiteboard({
          name: 'Untitled Whiteboard',
          description: 'A collaborative whiteboard',
          items,
          connections
        });
        setWhiteboardId(result.id);
      }
    } catch (error) {
      console.error('Error saving whiteboard:', error);
    } finally {
      setSaving(false);
    }
  };

  // Handle canvas click to create items
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - offset.x) / zoom;
    const y = (e.clientY - rect.top - offset.y) / zoom;

    // Only create items when not dragging and with non-select tools
    if (isDragging || isPanning || activeTool === 'select' || activeTool === 'connector') return;

    // Create new item based on active tool
    let newItem: CanvasItem;
    
    switch(activeTool) {
      case 'sticky-note':
        newItem = {
          id: `item-${Date.now()}`,
          type: activeTool,
          x,
          y,
          width: 180,
          height: 180,
          content: 'Click to edit...',
          color: ['#fef3c7', '#dbeafe', '#d1fae5', '#ffe4e6'][Math.floor(Math.random() * 4)],
          connections: [],
        };
        break;
        
      case 'text':
        newItem = {
          id: `item-${Date.now()}`,
          type: activeTool,
          x,
          y,
          width: 250,
          height: 200,
          content: 'Type your text here...',
          backgroundColor: 'white',
          connections: [],
        };
        break;
        
      case 'document':
        newItem = {
          id: `item-${Date.now()}`,
          type: activeTool,
          x,
          y,
          width: 300,
          height: 250,
          content: 'Long-form content here...',
          backgroundColor: 'white',
          connections: [],
        };
        break;
        
      case 'image':
        // Trigger file input for image upload
        if (imageInputRef.current) {
          imageInputRef.current.click();
        }
        return;
        
      case 'shape':
        newItem = {
          id: `item-${Date.now()}`,
          type: activeTool,
          x,
          y,
          width: 120,
          height: 120,
          title: 'Shape',
          connections: [],
        };
        break;
        
      case 'task':
        newItem = {
          id: `item-${Date.now()}`,
          type: activeTool,
          x,
          y,
          width: 250,
          height: 150,
          title: 'New Task',
          tasks: [
            { id: 'task-1', text: 'Sample task', completed: false },
            { id: 'task-2', text: 'Another task', completed: false }
          ],
          connections: [],
        };
        break;
        
      case 'mindmap':
        newItem = {
          id: `item-${Date.now()}`,
          type: activeTool,
          x,
          y,
          width: 150,
          height: 100,
          content: 'Main Idea',
          backgroundColor: '#f3e8ff', // soft purple
          connections: [],
        };
        break;
        
      case 'file':
        // Trigger file input for general file upload
        if (fileInputRef.current) {
          fileInputRef.current.click();
        }
        return;
        
      default:
        return; // Don't create an item for select or connector tools
    }

    // Only add to items if it's not an image or file (those are handled separately)
    if (!['image', 'file'].includes(activeTool)) {
      setItems(prev => [...prev, newItem]);
    }
  };

  // Handle image upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !canvasRef.current) return;
    
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      if (!event.target?.result || typeof event.target.result !== 'string' || !canvasRef.current) return;
      
      const rect = canvasRef.current.getBoundingClientRect();
      const x = (rect.width / 2 - 100) / zoom; // Center on canvas
      const y = (rect.height / 2 - 75) / zoom; // Center on canvas
      
      const newItem: CanvasItem = {
        id: `item-${Date.now()}`,
        type: 'image',
        x,
        y,
        width: 200,
        height: 150,
        imageUrl: event.target.result,
        title: file.name,
        connections: [],
      };
      
      setItems(prev => [...prev, newItem]);
    };
    
    reader.readAsDataURL(file);
    e.target.value = ''; // Reset input
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !canvasRef.current) return;
    
    const file = e.target.files[0];
    if (!file) return;
    
    // For demo purposes, we're not actually uploading to a server
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (rect.width / 2 - 90) / zoom; // Center on canvas
    const y = (rect.height / 2 - 60) / zoom; // Center on canvas
    
    const newItem: CanvasItem = {
      id: `item-${Date.now()}`,
      type: 'file',
      x,
      y,
      width: 180,
      height: 120,
      title: file.name,
      fileUrl: URL.createObjectURL(file), // Temporary URL
      connections: [],
    };
    
    setItems(prev => [...prev, newItem]);
    e.target.value = ''; // Reset input
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
          x: (e.clientX - rect.left - offset.x) / zoom - item.x,
          y: (e.clientY - rect.top - offset.y) / zoom - item.y
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
          const sourceX = sourceItem.x * zoom + offset.x + (sourceItem.width || 0) * zoom / 2;
          const sourceY = sourceItem.y * zoom + offset.y + (sourceItem.height || 0) * zoom / 2;
          const targetX = targetItem.x * zoom + offset.x + (targetItem.width || 0) * zoom / 2;
          const targetY = targetItem.y * zoom + offset.y + (targetItem.height || 0) * zoom / 2;
          
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

  // Handle mouse movements for dragging items or panning
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && selectedItem) {
      // Moving an item
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const newX = (e.clientX - rect.left - offset.x) / zoom - dragOffset.x;
        const newY = (e.clientY - rect.top - offset.y) / zoom - dragOffset.y;
        
        setItems(prev => prev.map(item => 
          item.id === selectedItem ? { ...item, x: newX, y: newY } : item
        ));
      }
    } else if (isPanning) {
      // Panning the canvas
      setOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
    }
  };

  // Stop dragging or panning
  const handleMouseUp = () => {
    setIsDragging(false);
    setIsPanning(false);
  };

  // Reset view
  const resetViewAndItems = () => {
    setItems([]);
    setConnections([]);
    setSelectedItem(null);
    setConnecting(null);
    setOffset({ x: 0, y: 0 });
    setZoom(1);
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

  // Toggle task completion
  const toggleTaskCompletion = (itemId: string, taskId: string) => {
    setItems(prev => prev.map(item => {
      if (item.id === itemId && item.tasks) {
        return {
          ...item,
          tasks: item.tasks?.map(task => 
            task.id === taskId ? { ...task, completed: !task.completed } : task
          )
        };
      }
      return item;
    }));
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

    // Handle wheel for zooming
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom(z => clampZoom(+(z - e.deltaY * 0.001).toFixed(3)));
      }
    };

    if (canvasRef.current) {
      canvasRef.current.addEventListener('wheel', handleWheel, { passive: false });
    }

    if (isDragging || isPanning || connecting) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      if (canvasRef.current) {
        canvasRef.current.removeEventListener('wheel', handleWheel);
      }
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, isPanning, connecting, selectedItem, dragOffset, offset, zoom]);

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
      
      const centerX = item.x * zoom + offset.x + (item.width || 0) * zoom / 2;
      const centerY = item.y * zoom + offset.y + (item.height || 0) * zoom / 2;
      
      return (
        <>
          {/* Top center */}
          <div 
            className="absolute w-3 h-3 rounded-full bg-blue-500 border-2 border-white cursor-pointer -mt-1.5 -ml-1.5 transform -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: centerX, top: item.y * zoom + offset.y }}
            onClick={(e) => handleConnectionPointClick(item.id, 'top', e)}
          />
          
          {/* Right center */}
          <div 
            className="absolute w-3 h-3 rounded-full bg-blue-500 border-2 border-white cursor-pointer -mt-1.5 -ml-1.5 transform -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: item.x * zoom + offset.x + (item.width || 0) * zoom, top: centerY }}
            onClick={(e) => handleConnectionPointClick(item.id, 'right', e)}
          />
          
          {/* Bottom center */}
          <div 
            className="absolute w-3 h-3 rounded-full bg-blue-500 border-2 border-white cursor-pointer -mt-1.5 -ml-1.5 transform -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: centerX, top: item.y * zoom + offset.y + (item.height || 0) * zoom }}
            onClick={(e) => handleConnectionPointClick(item.id, 'bottom', e)}
          />
          
          {/* Left center */}
          <div 
            className="absolute w-3 h-3 rounded-full bg-blue-500 border-2 border-white cursor-pointer -mt-1.5 -ml-1.5 transform -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: item.x * zoom + offset.x, top: centerY }}
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
                left: item.x * zoom + offset.x,
                top: item.y * zoom + offset.y,
                width: (item.width || 0) * zoom,
                height: (item.height || 0) * zoom,
                backgroundColor: item.color,
                transform: isHovered ? 'translateY(-5px)' : 'none',
                transition: 'transform 0.2s ease'
              }}
              onClick={(e) => handleItemClick(item.id, e)}
              onMouseDown={handleItemMouseDown}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <div className="p-3 h-full rounded-lg border border-white/50" style={{ fontSize: 14 * zoom }}>
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
                left: item.x * zoom + offset.x,
                top: item.y * zoom + offset.y,
                width: (item.width || 0) * zoom,
                height: (item.height || 0) * zoom,
              }}
              onClick={(e) => handleItemClick(item.id, e)}
              onMouseDown={handleItemMouseDown}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <div className="p-4 h-full rounded-lg" style={{ fontSize: 14 * zoom }}>
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
                left: item.x * zoom + offset.x,
                top: item.y * zoom + offset.y,
                width: (item.width || 0) * zoom,
                height: (item.height || 0) * zoom,
              }}
              onClick={(e) => handleItemClick(item.id, e)}
              onMouseDown={handleItemMouseDown}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <div className="p-4 h-full rounded-lg border-t-2 border-gray-300" style={{ fontSize: 14 * zoom }}>
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
              className={cn(baseClasses, "bg-gray-100 rounded-lg shadow-sm border flex flex-col items-center justify-center overflow-hidden")}
              style={{
                left: item.x * zoom + offset.x,
                top: item.y * zoom + offset.y,
                width: (item.width || 0) * zoom,
                height: (item.height || 0) * zoom,
              }}
              onClick={(e) => handleItemClick(item.id, e)}
              onMouseDown={handleItemMouseDown}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              {item.imageUrl ? (
                <img 
                  src={item.imageUrl} 
                  alt={item.title} 
                  className="object-contain w-full h-full p-1"
                />
              ) : (
                <>
                  <Image className="w-12 h-12 text-gray-400" />
                  <span className="mt-2 text-gray-500 text-sm">Loading image...</span>
                </>
              )}
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
                left: item.x * zoom + offset.x,
                top: item.y * zoom + offset.y,
                width: (item.width || 0) * zoom,
                height: (item.height || 0) * zoom,
              }}
              onClick={(e) => handleItemClick(item.id, e)}
              onMouseDown={handleItemMouseDown}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <Square className="w-8 h-8 text-blue-500 opacity-70" style={{ width: 8 * zoom, height: 8 * zoom }} />
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
                left: item.x * zoom + offset.x,
                top: item.y * zoom + offset.y,
                width: (item.width || 0) * zoom,
                height: (item.height || 0) * zoom,
              }}
              onClick={(e) => handleItemClick(item.id, e)}
              onMouseDown={handleItemMouseDown}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <div className="p-3 h-full rounded-lg border" style={{ fontSize: 14 * zoom }}>
                <div className="font-bold text-sm mb-2 text-gray-800">{item.title}</div>
                <div className="space-y-2">
                  {item.tasks?.map(task => (
                    <div key={task.id} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => toggleTaskCompletion(item.id, task.id)}
                        className="mr-2 h-4 w-4 text-blue-600 rounded"
                        style={{ transform: `scale(${zoom})` }}
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
                left: item.x * zoom + offset.x,
                top: item.y * zoom + offset.y,
                width: (item.width || 0) * zoom,
                height: (item.height || 0) * zoom,
                backgroundColor: item.backgroundColor
              }}
              onClick={(e) => handleItemClick(item.id, e)}
              onMouseDown={handleItemMouseDown}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <div className="text-center px-4 py-2" style={{ fontSize: 14 * zoom }}>
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
                left: item.x * zoom + offset.x,
                top: item.y * zoom + offset.y,
                width: (item.width || 0) * zoom,
                height: (item.height || 0) * zoom,
              }}
              onClick={(e) => handleItemClick(item.id, e)}
              onMouseDown={handleItemMouseDown}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <div className="p-3 h-full rounded-lg border border-gray-200 flex flex-col items-center justify-center">
                <Paperclip className="w-8 h-8 text-gray-400" style={{ width: 8 * zoom, height: 8 * zoom }} />
                <div className="mt-2 text-sm text-gray-700 font-medium truncate max-w-full" style={{ fontSize: 12 * zoom }}>
                  {item.title}
                </div>
                <div className="text-xs text-gray-500 mt-1" style={{ fontSize: 10 * zoom }}>File</div>
              </div>
            </div>
            {getConnectionPoints()}
          </React.Fragment>
        );
        
      default:
        return null;
    }
  };

  const zoomPercent = Math.round(zoom * 100);

  return (
    <div className="flex h-full w-full bg-gray-50 relative">
      {/* Hidden file inputs */}
      <input 
        type="file" 
        accept="image/*" 
        ref={imageInputRef} 
        onChange={handleImageUpload} 
        className="hidden" 
      />
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        className="hidden" 
      />
      
      {/* Left Sidebar Tool Selector */}
      <div className="w-16 bg-white/80 backdrop-blur-sm border-r border-gray-200 flex flex-col items-center py-4 space-y-2">
        {tools.map(tool => (
          <button
            key={tool.id}
            className={cn(
              "p-2.5 rounded-lg transition-all duration-200 hover:bg-gray-100 flex items-center justify-center",
              activeTool === tool.id 
                ? "bg-blue-100 text-blue-600 border border-blue-300 shadow-sm" 
                : "text-gray-600"
            )}
            onClick={() => setActiveTool(tool.id)}
            title={tool.name}
          >
            {tool.icon}
          </button>
        ))}
        
        <div className="flex-grow"></div>
        
        {/* Save button */}
        <button
          className="p-2.5 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
          onClick={saveWhiteboard}
          title="Save whiteboard"
          disabled={saving}
        >
          {saving ? (
            <div className="w-4 h-4 border-t-2 border-blue-500 rounded-full animate-spin"></div>
          ) : (
            <Save className="w-4 h-4" />
          )}
        </button>
        
        {/* Reset button */}
        <button
          className="p-2.5 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
          onClick={resetViewAndItems}
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
          backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          backgroundPosition: `${offset.x}px ${offset.y}px`,
          cursor: isPanning ? 'grabbing' : 'default'
        }}
      >
        {/* Apply zoom transformation to all items */}
        <div 
          className="absolute top-0 left-0 w-full h-full"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          {/* Render all items */}
          {items.map(item => renderItem(item))}
        </div>
        
        {/* Render connections - also apply transformations */}
        <svg 
          className="absolute top-0 left-0 w-full h-full pointer-events-none" 
          style={{ 
            zIndex: 1,
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          {connections.map(conn => {
            const sourceItem = items.find(i => i.id === conn.sourceId);
            const targetItem = items.find(i => i.id === conn.targetId);
            
            if (!sourceItem || !targetItem) return null;
            
            const sourceX = sourceItem.x * zoom + (sourceItem.width || 0) * zoom / 2;
            const sourceY = sourceItem.y * zoom + (sourceItem.height || 0) * zoom / 2;
            const targetX = targetItem.x * zoom + (targetItem.width || 0) * zoom / 2;
            const targetY = targetItem.y * zoom + (targetItem.height || 0) * zoom / 2;
            
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
                className="transition-all duration-300"
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
        
        {/* Zoom controls */}
        <div className="absolute bottom-4 right-4 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl p-1 flex">
          <button
            onClick={handleZoomOut}
            disabled={zoom <= MIN_ZOOM}
            title="Zoom out (Ctrl + scroll)"
            className="p-1.5 rounded-lg hover:bg-background disabled:opacity-30 transition-all"
          >
            <ZoomOut className="w-4 h-4 text-muted-foreground" />
          </button>

          <button
            onClick={resetView}
            title="Reset view"
            className="px-2.5 py-1 text-xs font-bold tabular-nums text-foreground hover:text-primary rounded-lg hover:bg-background transition-all min-w-[44px] text-center"
          >
            {zoomPercent}%
          </button>

          <button
            onClick={handleZoomIn}
            disabled={zoom >= MAX_ZOOM}
            title="Zoom in (Ctrl + scroll)"
            className="p-1.5 rounded-lg hover:bg-background disabled:opacity-30 transition-all"
          >
            <ZoomIn className="w-4 h-4 text-muted-foreground" />
          </button>

          <div className="w-px h-6 bg-border mx-0.5" />

          <button onClick={resetView} title="Reset to 100%" className="p-1.5 rounded-lg hover:bg-background transition-all">
            <Maximize2 className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Whiteboard;