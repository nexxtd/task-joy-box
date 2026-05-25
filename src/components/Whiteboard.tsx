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
  FolderKanban,
  Move,
  RotateCcw,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Save,
  Edit3,
  X
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

interface WhiteboardProps {
  whiteboardId?: number;
}

const Whiteboard: React.FC<WhiteboardProps> = ({ whiteboardId }) => {
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
    { id: 'board-column', name: 'Board Column', icon: <FolderKanban className="w-4 h-4" /> },
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
  const [localWhiteboardId, setLocalWhiteboardId] = useState<number | null>(whiteboardId || null);
  const [whiteboardName, setWhiteboardName] = useState('Untitled Whiteboard');
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempItemPos, setTempItemPos] = useState<{x: number, y: number} | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

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

  // Load whiteboard data if an ID is provided
  useEffect(() => {
    if (localWhiteboardId) {
      const loadWhiteboard = async () => {
        try {
          const data = await getWhiteboardById(localWhiteboardId);
          setItems(data.items);
          setConnections(data.connections);
          setWhiteboardName(data.name);
        } catch (error) {
          console.error('Error loading whiteboard:', error);
        }
      };

      loadWhiteboard();
    }
  }, [localWhiteboardId]);

  // Auto-save functionality
  useEffect(() => {
    const saveTimeout = setTimeout(() => {
      if (items.length > 0 || connections.length > 0) {
        saveWhiteboard();
      }
    }, 2000); // Save after 2 seconds of inactivity

    // Cleanup function - runs when component unmounts
    return () => {
      clearTimeout(saveTimeout);
      // Save one final time when component unmounts
      saveWhiteboard();
    };
  }, [items, connections, whiteboardName]);

  // Handle visibility change (when user switches tabs/windows) to save whiteboard
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveWhiteboard();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [items, connections, whiteboardName, localWhiteboardId]);

  const saveWhiteboard = async () => {
    if (saving) return; // Prevent duplicate saves
    
    setSaving(true);
    try {
      if (localWhiteboardId) {
        // Update existing whiteboard
        const result = await updateWhiteboard(localWhiteboardId, {
          name: whiteboardName,
          description: 'A collaborative whiteboard',
          items,
          connections
        });
        setWhiteboardName(result.name); // Update name in case it was changed
      } else {
        // Create new whiteboard
        const result = await createWhiteboard({
          name: whiteboardName,
          description: 'A collaborative whiteboard',
          items,
          connections
        });
        setLocalWhiteboardId(result.id);
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

    // Create item directly at click position
    createNewItem(x, y);
    return;
  };

  // Create new item at specified position
  const createNewItem = (x: number, y: number) => {
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
          // Store the position for when the image is uploaded
          setTempItemPos({x, y});
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
          // Store the position for when the file is uploaded
          setTempItemPos({x, y});
        }
        return;
        
      case 'board-column':
        newItem = {
          id: `item-${Date.now()}`,
          type: activeTool,
          x,
          y,
          width: 280,
          height: 400,
          title: 'Project Column',
          tasks: [
            { id: 'task-1', text: 'Analyze requirements', completed: true },
            { id: 'task-2', text: 'Design UI/UX', completed: false },
            { id: 'task-3', text: 'Implement core logic', completed: false }
          ],
          connections: [],
        };
        break;

      default:
        return; // Don't create an item for select or connector tools
    }

    // Only add to items if it's not an image or file (those are handled separately)
    if (!['image', 'file'].includes(activeTool)) {
      setItems(prev => [...prev, newItem]);
      setTempItemPos(null);
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
      
      if (!tempItemPos) {
        // If no position was set, place in the center
        const rect = canvasRef.current.getBoundingClientRect();
        const x = (rect.width / 2 - 100) / zoom;
        const y = (rect.height / 2 - 75) / zoom;
        
        const newItem: CanvasItem = {
          id: `item-${Date.now()}`,
          type: 'image',
          x,
          y,
          width: 200,
          height: 150,
          imageUrl: event.target.result as string,
          title: file.name,
          connections: [],
        };
        
        setItems(prev => [...prev, newItem]);
      } else {
        // Use the stored position
        const newItem: CanvasItem = {
          id: `item-${Date.now()}`,
          type: 'image',
          x: tempItemPos.x,
          y: tempItemPos.y,
          width: 200,
          height: 150,
          imageUrl: event.target.result as string,
          title: file.name,
          connections: [],
        };
        
        setItems(prev => [...prev, newItem]);
        setTempItemPos(null);
      }
    };
    
    reader.readAsDataURL(file);
    e.target.value = ''; // Reset input
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !canvasRef.current) return;
    
    const file = e.target.files[0];
    if (!file) return;
    
    if (!tempItemPos) {
      // If no position was set, place in the center
      const rect = canvasRef.current.getBoundingClientRect();
      const x = (rect.width / 2 - 90) / zoom;
      const y = (rect.height / 2 - 60) / zoom;
      
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
    } else {
      // Use the stored position
      const newItem: CanvasItem = {
        id: `item-${Date.now()}`,
        type: 'file',
        x: tempItemPos.x,
        y: tempItemPos.y,
        width: 180,
        height: 120,
        title: file.name,
        fileUrl: URL.createObjectURL(file), // Temporary URL
        connections: [],
      };
      
      setItems(prev => [...prev, newItem]);
      setTempItemPos(null);
    }
    
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
    setTempItemPos(null);
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

  // Rename whiteboard
  const renameWhiteboardHandler = () => {
    setIsEditingName(true);
  };

  const handleRenameConfirm = () => {
    if (nameInputRef.current) {
      setWhiteboardName(nameInputRef.current.value);
      setIsEditingName(false);
      saveWhiteboard(); // Save the new name
    }
  };

  const handleRenameCancel = () => {
    setIsEditingName(false);
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

    // Focus the input when editing starts
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }

    return () => {
      // Save before unmounting
      saveWhiteboard();
      
      if (canvasRef.current) {
        canvasRef.current.removeEventListener('wheel', handleWheel);
      }
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, isPanning, connecting, selectedItem, dragOffset, offset, zoom, isEditingName]);

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
            className="absolute w-3 h-3 rounded-full bg-blue-500 border border-white cursor-pointer transform -translate-x-1/2 -translate-y-1/2 z-20"
            style={{ left: item.width ? item.width / 2 : 0, top: 0 }}
            onClick={(e) => handleConnectionPointClick(item.id, 'top', e)}
          />
          
          {/* Right center */}
          <div 
            className="absolute w-3 h-3 rounded-full bg-blue-500 border border-white cursor-pointer transform translate-x-1/2 -translate-y-1/2 z-20"
            style={{ left: item.width || 0, top: item.height ? item.height / 2 : 0 }}
            onClick={(e) => handleConnectionPointClick(item.id, 'right', e)}
          />
          
          {/* Bottom center */}
          <div 
            className="absolute w-3 h-3 rounded-full bg-blue-500 border border-white cursor-pointer transform -translate-x-1/2 translate-y-1/2 z-20"
            style={{ left: item.width ? item.width / 2 : 0, top: item.height || 0 }}
            onClick={(e) => handleConnectionPointClick(item.id, 'bottom', e)}
          />
          
          {/* Left center */}
          <div 
            className="absolute w-3 h-3 rounded-full bg-blue-500 border border-white cursor-pointer transform -translate-x-1/2 -translate-y-1/2 z-20"
            style={{ left: 0, top: item.height ? item.height / 2 : 0 }}
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
                left: item.x,
                top: item.y,
                width: item.width || 180,
                height: item.height || 180,
                backgroundColor: item.color,
                transition: 'none'
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
                  onChange={(e) => {
                    setItems(prev => prev.map(i => 
                      i.id === item.id ? { ...i, content: e.target.value } : i
                    ));
                  }}
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
                left: item.x,
                top: item.y,
                width: item.width || 250,
                height: item.height || 200,
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
                  onChange={(e) => {
                    setItems(prev => prev.map(i => 
                      i.id === item.id ? { ...i, content: e.target.value } : i
                    ));
                  }}
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
                left: item.x,
                top: item.y,
                width: item.width || 300,
                height: item.height || 250,
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
                    onChange={(e) => {
                      setItems(prev => prev.map(i => 
                        i.id === item.id ? { ...i, content: e.target.value } : i
                      ));
                    }}
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
                left: item.x,
                top: item.y,
                width: item.width || 200,
                height: item.height || 150,
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
                left: item.x,
                top: item.y,
                width: item.width || 120,
                height: item.height || 120,
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
                left: item.x,
                top: item.y,
                width: item.width || 250,
                height: item.height || 150,
              }}
              onClick={(e) => handleItemClick(item.id, e)}
              onMouseDown={handleItemMouseDown}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <div className="p-3 h-full rounded-lg border" style={{ fontSize: 14 * zoom }}>
                <div className="font-bold text-sm mb-2 text-gray-800">
                  <input
                    type="text"
                    value={item.title || 'New Task'}
                    className="w-full bg-transparent border-b border-gray-300 focus:outline-none focus:border-blue-500"
                    onChange={(e) => {
                      setItems(prev => prev.map(i => 
                        i.id === item.id ? { ...i, title: e.target.value } : i
                      ));
                    }}
                  />
                </div>
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
                left: item.x,
                top: item.y,
                width: item.width || 150,
                height: item.height || 100,
                backgroundColor: item.backgroundColor
              }}
              onClick={(e) => handleItemClick(item.id, e)}
              onMouseDown={handleItemMouseDown}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <div className="text-center px-4 py-2" style={{ fontSize: 14 * zoom }}>
                <input
                  type="text"
                  value={item.content || 'Main Idea'}
                  className="w-full bg-transparent text-center font-medium text-purple-700 focus:outline-none"
                  onChange={(e) => {
                    setItems(prev => prev.map(i => 
                      i.id === item.id ? { ...i, content: e.target.value } : i
                    ));
                  }}
                />
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
                left: item.x,
                top: item.y,
                width: item.width || 180,
                height: item.height || 120,
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
        
      case 'board-column':
        return (
          <React.Fragment key={item.id}>
            <div
              className={cn(baseClasses, "bg-background rounded-xl shadow-xl border-2 border-border overflow-hidden flex flex-col")}
              style={{
                left: item.x,
                top: item.y,
                width: item.width || 280,
                height: item.height || 400,
              }}
              onClick={(e) => handleItemClick(item.id, e)}
              onMouseDown={handleItemMouseDown}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <div className="bg-muted/50 p-3 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <input
                    type="text"
                    value={item.title || 'Project Column'}
                    className="bg-transparent font-bold text-xs uppercase tracking-wider text-foreground focus:outline-none"
                    style={{ fontSize: 10 * zoom }}
                    onChange={(e) => {
                      setItems(prev => prev.map(i => 
                        i.id === item.id ? { ...i, title: e.target.value } : i
                      ));
                    }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground font-bold">{(item.tasks?.length || 0)}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-muted/10">
                {item.tasks?.map(task => (
                  <div key={task.id} className="bg-card border border-border p-2.5 rounded-lg shadow-sm hover:border-primary/30 transition-colors">
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => toggleTaskCompletion(item.id, task.id)}
                        className="mt-1 h-3 w-3 rounded-full border-border accent-primary"
                        style={{ transform: `scale(${zoom})` }}
                      />
                      <span className={cn("text-xs font-medium leading-tight", task.completed ? "line-through text-muted-foreground" : "text-foreground")} style={{ fontSize: 11 * zoom }}>
                        {task.text}
                      </span>
                    </div>
                  </div>
                ))}
                <button className="w-full py-2 border border-dashed border-border rounded-lg text-[10px] text-muted-foreground hover:text-primary hover:border-primary/50 transition-all">
                  + Add Card
                </button>
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
      
      {/* Whiteboard header with name and controls */}
      <div className="absolute top-4 left-20 z-10">
        <div className="bg-white shadow-lg border border-gray-200 rounded-xl px-4 py-2 flex items-center gap-2">
          {isEditingName ? (
            <div className="flex items-center gap-2">
              <input
                ref={nameInputRef}
                type="text"
                defaultValue={whiteboardName}
                className="px-2 py-1 border-b border-primary outline-none text-base font-semibold w-64 bg-transparent"
                onBlur={handleRenameConfirm}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameConfirm();
                  if (e.key === 'Escape') handleRenameCancel();
                }}
              />
            </div>
          ) : (
            <div 
              className="flex items-center gap-2 cursor-pointer group"
              onClick={renameWhiteboardHandler}
            >
              <h2 className="font-bold text-gray-800 text-lg">{whiteboardName}</h2>
              <Edit3 className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          )}
        </div>
      </div>
      
      {/* Left Sidebar Tool Selector */}
      <div className="w-16 bg-white/80 backdrop-blur-sm border-r border-gray-200 flex flex-col items-center py-4 space-y-4">
        {tools.map(tool => (
          <div key={tool.id} className="flex flex-col items-center">
            <button
              className={cn(
                "p-3 rounded-xl transition-all duration-200 hover:bg-gray-100 flex items-center justify-center",
                activeTool === tool.id 
                  ? "bg-primary text-primary-foreground shadow-lg scale-110" 
                  : "text-gray-500"
              )}
              onClick={() => setActiveTool(tool.id)}
              title={tool.name}
            >
              {tool.icon}
            </button>
          </div>
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
            
            const sourceX = sourceItem.x + (sourceItem.width || 0) / 2;
            const sourceY = sourceItem.y + (sourceItem.height || 0) / 2;
            const targetX = targetItem.x + (targetItem.width || 0) / 2;
            const targetY = targetItem.y + (targetItem.height || 0) / 2;
            
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
              <g key={conn.id}>
                <defs>
                  <marker
                    id={`arrowhead-${conn.id}`}
                    markerWidth="10"
                    markerHeight="7"
                    refX="9"
                    refY="3.5"
                    orient="auto"
                  >
                    <polygon points="0 0, 10 3.5, 0 7" fill="#000" />
                  </marker>
                </defs>
                <path
                  d={pathData}
                  stroke="#000"
                  strokeWidth="2"
                  fill="none"
                  markerEnd={`url(#arrowhead-${conn.id})`}
                  strokeDasharray={conn.type === 'dotted' ? "5,5" : "none"}
                  className="transition-all duration-300"
                />
              </g>
            );
          })}
        </svg>
        
        {/* Toolbar for selected item */}
        {selectedItem && (
          <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg border p-1 flex space-x-1 z-20">
            <button 
              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
              onClick={deleteSelectedItem}
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete</span>
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