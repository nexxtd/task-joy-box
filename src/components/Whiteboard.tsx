import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  StickyNote,
  Type,
  FileText,
  Image,
  Link as LinkIcon,
  Paperclip,
  Square,
  SquareCheckBig,
  MousePointer2,
  Hand,
  Table as TableIcon,
  MessageSquare,
  RotateCcw,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Save,
  Edit3,
  X,
  Plus,
  GripVertical,
  ChevronDown,
  Copy,
  Lock,
  Unlock,
  Layers,
  Download,
  Undo,
  Redo,
  Move,
  Palette,
  MoreVertical,
  ArrowUp,
  ArrowDown,
  Star,
  Triangle,
  Diamond,
  Hexagon,
  ArrowRight,
  RotateCw,
  Calendar,
  CheckSquare,
  AlertTriangle,
  Brain,
  Settings2,
  Shapes,
} from 'lucide-react';
import { createWhiteboard, getWhiteboardById, updateWhiteboard, CanvasItem, Connection } from '@/services/whiteboardService';
import TaskCard from '@/components/TaskCard';
import { Task } from '@/types/board';

interface Tool {
  id: string;
  name: string;
  icon: React.ReactNode;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;
const DRAG_THRESHOLD = 0; // No threshold - single click to select

interface WhiteboardProps {
  whiteboardId?: number;
}

const Whiteboard: React.FC<WhiteboardProps> = ({ whiteboardId }) => {
  const tools: Tool[] = [
    { id: 'select',       name: 'Select',        icon: <MousePointer2 className="w-4 h-4" /> },
    { id: 'hand',         name: 'Hand',          icon: <Hand className="w-4 h-4" /> },
    { id: 'sticky-note',  name: 'Sticky Note',   icon: <StickyNote className="w-4 h-4" /> },
    { id: 'text',         name: 'Text',          icon: <Type className="w-4 h-4" /> },
    { id: 'document',     name: 'Document',      icon: <FileText className="w-4 h-4" /> },
    { id: 'image',        name: 'Image',         icon: <Image className="w-4 h-4" /> },
    { id: 'shape',        name: 'Shape',         icon: <Square className="w-4 h-4" /> },
    { id: 'task',         name: 'Task Block',    icon: <SquareCheckBig className="w-4 h-4" /> },
    { id: 'table',        name: 'Table',         icon: <TableIcon className="w-4 h-4" /> },
    { id: 'link',         name: 'Link',          icon: <LinkIcon className="w-4 h-4" /> },
    { id: 'comment',      name: 'Comment',       icon: <MessageSquare className="w-4 h-4" /> },
  ];

  // ── Core state ──────────────────────────────────────────────────────────────
  const [activeTool, setActiveTool] = useState('select');
  const [items, setItems] = useState<CanvasItem[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);

  // Drag
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const mouseDownOnItem = useRef<{ itemId: string; clientX: number; clientY: number } | null>(null);

  // Resize
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ handle: string; startX: number; startY: number; origW: number; origH: number; origX: number; origY: number } | null>(null);

  // Pan
  const [isPanning, setIsPanning] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });

  // Connector
  const [connecting, setConnecting] = useState<{ sourceId: string } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 }); // raw client coords for live-preview line

  // Hover
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  // Zoom
  const [zoom, setZoom] = useState(1);

  // Board name
  const [whiteboardName, setWhiteboardName] = useState('Untitled Whiteboard');
  const [whiteboardColor, setWhiteboardColor] = useState('#6366f1');
  const [whiteboardIcon, setWhiteboardIcon] = useState('square');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingNameValue, setEditingNameValue] = useState('');
  const [showWhiteboardDropdown, setShowWhiteboardDropdown] = useState(false);
  const [showEditPopup, setShowEditPopup] = useState(false);

  // Misc
  const [saving, setSaving] = useState(false);
  const [localWhiteboardId, setLocalWhiteboardId] = useState<number | null>(whiteboardId || null);
  const [isLoading, setIsLoading] = useState(!!whiteboardId);
  const [tempItemPos, setTempItemPos] = useState<{ x: number; y: number } | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);

  // Undo/Redo
  const [history, setHistory] = useState<{ items: CanvasItem[], connections: Connection[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Connection selection
  const [selectedConnection, setSelectedConnection] = useState<string | null>(null);
  const [showConnectionToolbar, setShowConnectionToolbar] = useState(false);

  // Connector drag state
  const [connectorDrag, setConnectorDrag] = useState<{ sourceId: string; sourcePoint: { x: number; y: number } } | null>(null);

  // Rotation state
  const [isRotating, setIsRotating] = useState(false);
  const rotationRef = useRef<{ itemId: string; startAngle: number; startRotation: number } | null>(null);

  // Dropdown states
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showBlockMenu, setShowBlockMenu] = useState(false);
  const [showTextFormatPopup, setShowTextFormatPopup] = useState(false);
  const [showTextTypePopup, setShowTextTypePopup] = useState(false);
  const [showShapeSelector, setShowShapeSelector] = useState(false);
  const [showShapeEditPopup, setShowShapeEditPopup] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const uploadingItemId = useRef<string | null>(null);

  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
  const zoomPercent = Math.round(zoom * 100);

  const fitToScreen = () => {
    if (items.length === 0) {
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      return;
    }
    const bounds = items.reduce(
      (acc, item) => ({
        minX: Math.min(acc.minX, item.x),
        minY: Math.min(acc.minY, item.y),
        maxX: Math.max(acc.maxX, item.x + (item.width || 0)),
        maxY: Math.max(acc.maxY, item.y + (item.height || 0)),
      }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    );
    const padding = 100;
    const contentWidth = bounds.maxX - bounds.minX + padding * 2;
    const contentHeight = bounds.maxY - bounds.minY + padding * 2;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scaleX = rect.width / contentWidth;
    const scaleY = rect.height / contentHeight;
    const newZoom = clampZoom(Math.min(scaleX, scaleY));
    setZoom(newZoom);
    setOffset({
      x: (rect.width - contentWidth * newZoom) / 2 - bounds.minX * newZoom + padding * newZoom,
      y: (rect.height - contentHeight * newZoom) / 2 - bounds.minY * newZoom + padding * newZoom,
    });
  };

  // ── Auto-save with debounce ─────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isLoading && whiteboardId) {
        saveWhiteboard();
      }
    }, 1000); // Auto-save 1 second after last change

    return () => clearTimeout(timer);
  }, [items, connections, whiteboardName, isLoading, whiteboardId]);
  useEffect(() => {
    const seen = localStorage.getItem('whiteboard-tutorial-seen');
    if (!seen) {
      // Small delay to show tutorial after component mounts
      const timer = setTimeout(() => {
        setShowTutorial(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismissTutorial = () => {
    localStorage.setItem('whiteboard-tutorial-seen', 'true');
    setShowTutorial(false);
  };

  // ── Load whiteboard ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!localWhiteboardId) {
      setIsLoading(false);
      return;
    }
    (async () => {
      setIsLoading(true);
      try {
        const data = await getWhiteboardById(localWhiteboardId);
        setItems(data.items || []);
        setConnections(data.connections || []);
        setWhiteboardName(data.name || 'Untitled Whiteboard');
      } catch (e) {
        console.error('Error loading whiteboard:', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [localWhiteboardId]);

  // ── Save ─────────────────────────────────────────────────────────────────
  const saveWhiteboard = useCallback(async (nameOverride?: string) => {
    if (saving || isLoading) return;
    setSaving(true);
    const name = nameOverride ?? whiteboardName;
    try {
      if (localWhiteboardId) {
        const result = await updateWhiteboard(localWhiteboardId, {
          name,
          description: 'A collaborative whiteboard',
          items,
          connections,
        });
        setWhiteboardName(result.name);
      } else {
        const result = await createWhiteboard({ name, description: 'A collaborative whiteboard', items, connections });
        setLocalWhiteboardId(result.id);
      }
    } catch (e) {
      console.error('Error saving:', e);
    } finally {
      setSaving(false);
    }
  }, [saving, isLoading, whiteboardName, localWhiteboardId, items, connections]);

  // Auto-save
  useEffect(() => {
    if (isLoading) return;
    const t = setTimeout(() => {
      if (items.length > 0 || connections.length > 0) saveWhiteboard();
    }, 2000);
    return () => clearTimeout(t);
  }, [items, connections, whiteboardName, isLoading]);

  // ── Zoom with scroll ─────────────────────────────────────────────────────
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom(z => clampZoom(+(z - e.deltaY * 0.001).toFixed(3)));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ── Coordinate helpers ───────────────────────────────────────────────────
  const clientToCanvas = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - offset.x) / zoom,
      y: (clientY - rect.top - offset.y) / zoom,
    };
  };

  // ── Canvas click ─────────────────────────────────────────────────────────
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (isDragging || isResizing || isPanning) return;

    // Deselect connection if clicking elsewhere
    if (selectedConnection) {
      setSelectedConnection(null);
      setShowConnectionToolbar(false);
    }

    // Hand tool: just pan, don't create items
    if (activeTool === 'hand') {
      return;
    }

    if (activeTool === 'select') {
      setSelectedItem(null);
      return;
    }

    const { x, y } = clientToCanvas(e.clientX, e.clientY);
    createNewItem(x, y);
  };

  // ── Create new item ──────────────────────────────────────────────────────
  const createNewItem = (x: number, y: number) => {
    const id = `item-${Date.now()}`;
    let newItem: CanvasItem | null = null;

    switch (activeTool) {
      case 'sticky-note':
        newItem = { id, type: activeTool, x, y, width: 240, height: 240, title: '', description: '', color: '#fef3c7', backgroundColor: '#fef3c7', locked: false, zIndex: 1 };
        break;
      case 'text':
        newItem = { id, type: activeTool, x, y, width: 320, height: 200, title: '', description: '', textType: 'header-description', backgroundColor: 'white', locked: false, zIndex: 1 };
        break;
      case 'document':
        newItem = { id, type: activeTool, x, y, width: 360, height: 320, title: '', description: '', fileUrl: '', backgroundColor: 'white', locked: false, zIndex: 1 };
        break;
      case 'shape':
        newItem = { id, type: activeTool, x, y, width: 140, height: 140, title: '', shapeType: 'square', fillColor: '#6366f1', borderColor: '#4f46e5', borderThickness: 'medium', borderStyle: 'solid', opacity: 100, cornerRadius: 0, rotation: 0, locked: false, zIndex: 1 };
        break;
      case 'task':
        newItem = { id, type: activeTool, x, y, width: 300, height: 280, title: 'Task Block', tasks: [], backgroundColor: 'white', locked: false, zIndex: 1 };
        break;
      case 'table':
        newItem = { id, type: activeTool, x, y, width: 400, height: 300, rows: 3, columns: 3, cells: [], backgroundColor: 'white', locked: false, zIndex: 1 };
        break;
      case 'link':
        newItem = { id, type: activeTool, x, y, width: 320, height: 200, url: '', title: '', description: '', imageUrl: '', backgroundColor: 'white', locked: false, zIndex: 1 };
        break;
      case 'comment':
        newItem = { id, type: activeTool, x, y, width: 280, height: 120, description: '', color: '#fef3c7', backgroundColor: '#fef3c7', locked: false, zIndex: 1 };
        break;
      case 'image':
        imageInputRef.current?.click();
        setTempItemPos({ x, y });
        return;
      default:
        return;
    }

    if (newItem) {
      setItems(prev => [...prev, newItem!]);
      addToHistory();
    }
  };

  // ── Undo/Redo ─────────────────────────────────────────────────────────────
  const addToHistory = () => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ items: [...items], connections: [...connections] });
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const undo = () => {
    if (historyIndex > 0) {
      const prevState = history[historyIndex - 1];
      setItems(prevState.items);
      setConnections(prevState.connections);
      setHistoryIndex(historyIndex - 1);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      setItems(nextState.items);
      setConnections(nextState.connections);
      setHistoryIndex(historyIndex + 1);
    }
  };

  // ── Item interaction ─────────────────────────────────────────────────────
  const handleItemPointerDown = (e: React.PointerEvent, itemId: string) => {
    if (activeTool === 'connector') {
      e.stopPropagation();
      if (!connecting) {
        setConnecting({ sourceId: itemId });
      } else if (connecting.sourceId !== itemId) {
        // Complete connection
        const src = items.find(i => i.id === connecting.sourceId);
        const tgt = items.find(i => i.id === itemId);
        if (src && tgt) {
          // Check if connection already exists
          const existingConnection = connections.find(
            c => (c.sourceId === connecting.sourceId && c.targetId === itemId) ||
                 (c.sourceId === itemId && c.targetId === connecting.sourceId)
          );
          
          if (!existingConnection) {
            const newConn: Connection = {
              id: `conn-${Date.now()}`,
              sourceId: connecting.sourceId,
              targetId: itemId,
              sourcePoint: { x: src.x + (src.width || 0) / 2, y: src.y + (src.height || 0) / 2 },
              targetPoint: { x: tgt.x + (tgt.width || 0) / 2, y: tgt.y + (tgt.height || 0) / 2 },
              type: 'curved',
            };
            setConnections(prev => [...prev, newConn]);
            addToHistory();
            saveWhiteboard();
          }
        }
        setConnecting(null);
      }
      return;
    }

    if (activeTool !== 'select') return;

    e.stopPropagation();
    setSelectedItem(itemId);

    const { x, y } = clientToCanvas(e.clientX, e.clientY);
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    mouseDownOnItem.current = { itemId, clientX: e.clientX, clientY: e.clientY };
    setDragOffset({ x: x - item.x, y: y - item.y });

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleItemPointerMove = (e: React.PointerEvent, itemId: string) => {
    if (!mouseDownOnItem.current || mouseDownOnItem.current.itemId !== itemId) return;

    const dx = e.clientX - mouseDownOnItem.current.clientX;
    const dy = e.clientY - mouseDownOnItem.current.clientY;

    if (!isDragging && Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
      setIsDragging(true);
    }

    if (isDragging) {
      const { x, y } = clientToCanvas(e.clientX, e.clientY);
      const item = items.find(i => i.id === itemId);
      if (!item) return;
      
      const newX = x - dragOffset.x;
      const newY = y - dragOffset.y;
      
      setItems(prev => prev.map(i =>
        i.id === itemId ? { ...i, x: newX, y: newY } : i
      ));
      
      // Update connection points for connections attached to this item
      setConnections(prev => prev.map(conn => {
        if (conn.sourceId === itemId) {
          return { ...conn, sourcePoint: { x: newX + (item.width || 0) / 2, y: newY + (item.height || 0) / 2 } };
        }
        if (conn.targetId === itemId) {
          return { ...conn, targetPoint: { x: newX + (item.width || 0) / 2, y: newY + (item.height || 0) / 2 } };
        }
        return conn;
      }));
    }
  };

  const handleItemPointerUp = () => {
    mouseDownOnItem.current = null;
    setIsDragging(false);
  };

  // ── Resize handles ───────────────────────────────────────────────────────
  const handleResizePointerDown = (e: React.PointerEvent, handle: string) => {
    e.stopPropagation();
    e.preventDefault();
    const item = items.find(i => i.id === selectedItem);
    if (!item) return;
    resizeRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      origW: item.width || 200,
      origH: item.height || 200,
      origX: item.x,
      origY: item.y,
    };
    setIsResizing(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleResizePointerMove = (e: React.PointerEvent) => {
    if (!isResizing || !resizeRef.current || !selectedItem) return;
    const { handle, startX, startY, origW, origH, origX, origY } = resizeRef.current;
    const dx = (e.clientX - startX) / zoom;
    const dy = (e.clientY - startY) / zoom;
    const MIN_SIZE = 80;

    setItems(prev => prev.map(item => {
      if (item.id !== selectedItem) return item;
      let w = origW, h = origH, x = origX, y = origY;

      if (handle.includes('e')) w = Math.max(MIN_SIZE, origW + dx);
      if (handle.includes('s')) h = Math.max(MIN_SIZE, origH + dy);
      if (handle.includes('w')) {
        const newW = Math.max(MIN_SIZE, origW - dx);
        x = origX + (origW - newW);
        w = newW;
      }
      if (handle.includes('n')) {
        const newH = Math.max(MIN_SIZE, origH - dy);
        y = origY + (origH - newH);
        h = newH;
      }

      return { ...item, x, y, width: Math.round(w), height: Math.round(h) };
    }));
  };

  const handleResizePointerUp = () => {
    resizeRef.current = null;
    setIsResizing(false);
  };

  // ── Canvas pan ───────────────────────────────────────────────────────────
  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.canvas-item,.resize-handle,.connector-circle')) return;
    setIsPanning(true);
    panStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    
    // Deselect connection when clicking on canvas
    if (selectedConnection) {
      setSelectedConnection(null);
      setShowConnectionToolbar(false);
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent) => {
    // Track mouse for connector preview line
    setMousePos({ x: e.clientX, y: e.clientY });

    if (isPanning) {
      setOffset({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent) => {
    setIsPanning(false);
    
    // Handle connector drag completion
    if (connectorDrag) {
      const target = (e.target as HTMLElement).closest('.canvas-item');
      if (target) {
        const targetId = target.getAttribute('data-item-id');
        if (targetId && targetId !== connectorDrag.sourceId) {
          // Create connection
          const targetItem = items.find(i => i.id === targetId);
          if (targetItem) {
            const newConn: Connection = {
              id: `conn-${Date.now()}`,
              sourceId: connectorDrag.sourceId,
              targetId: targetId,
              sourcePoint: connectorDrag.sourcePoint,
              targetPoint: { x: targetItem.x + (targetItem.width || 0) / 2, y: targetItem.y + (targetItem.height || 0) / 2 },
              type: 'curved',
            };
            setConnections(prev => [...prev, newConn]);
            addToHistory();
            saveWhiteboard();
          }
        }
      }
      setConnectorDrag(null);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────
  const deleteSelectedItem = () => {
    if (!selectedItem) return;
    setItems(prev => prev.filter(i => i.id !== selectedItem));
    setConnections(prev => prev.filter(c => c.sourceId !== selectedItem && c.targetId !== selectedItem));
    setSelectedItem(null);
    addToHistory();
    saveWhiteboard();
  };

  // ── Global block actions ───────────────────────────────────────────────────
  const duplicateItem = (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    const newItem = {
      ...item,
      id: `item-${Date.now()}`,
      x: item.x + 20,
      y: item.y + 20,
      zIndex: (item.zIndex || 1) + 1,
    };
    setItems(prev => [...prev, newItem]);
    setSelectedItem(newItem.id);
    addToHistory();
    saveWhiteboard();
  };

  const lockItem = (itemId: string) => {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, locked: !i.locked } : i));
    addToHistory();
    saveWhiteboard();
  };

  const bringForward = (itemId: string) => {
    const maxZ = Math.max(...items.map(i => i.zIndex || 1));
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, zIndex: maxZ + 1 } : i));
    addToHistory();
    saveWhiteboard();
  };

  const sendBackward = (itemId: string) => {
    const minZ = Math.min(...items.map(i => i.zIndex || 1));
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, zIndex: Math.max(1, minZ - 1) } : i));
    addToHistory();
    saveWhiteboard();
  };

  const changeItemColor = (itemId: string, color: string) => {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, color, backgroundColor: color } : i));
    addToHistory();
    saveWhiteboard();
  };

  // ── Connection actions ─────────────────────────────────────────────────────
  const deleteConnection = (connectionId: string) => {
    setConnections(prev => prev.filter(c => c.id !== connectionId));
    setSelectedConnection(null);
    setShowConnectionToolbar(false);
    addToHistory();
    saveWhiteboard();
  };

  const changeConnectionColor = (connectionId: string, color: string) => {
    setConnections(prev => prev.map(c => c.id === connectionId ? { ...c, color } : c));
    addToHistory();
    saveWhiteboard();
  };

  const changeConnectionThickness = (connectionId: string, thickness: 'thin' | 'medium' | 'thick') => {
    setConnections(prev => prev.map(c => c.id === connectionId ? { ...c, thickness } : c));
    addToHistory();
    saveWhiteboard();
  };

  // ── Export functionality ─────────────────────────────────────────────────────
  const exportWhiteboard = () => {
    const data = {
      name: whiteboardName,
      items: items,
      connections: connections,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${whiteboardName.replace(/\s+/g, '_')}_export.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedItem) {
        const active = document.activeElement?.tagName;
        if (active === 'INPUT' || active === 'TEXTAREA') return;
        deleteSelectedItem();
      }
      if (e.key === 'Escape') {
        setConnecting(null);
        setSelectedItem(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedItem, items, connections]);

  // ── Task helpers ─────────────────────────────────────────────────────────
  const toggleTask = (itemId: string, taskId: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== itemId || !item.tasks) return item;
      return { ...item, tasks: item.tasks.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t) };
    }));
  };

  const updateTaskText = (itemId: string, taskId: string, text: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== itemId || !item.tasks) return item;
      return { ...item, tasks: item.tasks.map(t => t.id === taskId ? { ...t, text } : t) };
    }));
  };

  const addTask = (itemId: string) => {
    const newTask = { id: `t-${Date.now()}`, text: 'New card', completed: false };
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      return { ...item, tasks: [...(item.tasks || []), newTask] };
    }));
  };

  const deleteTask = (itemId: string, taskId: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== itemId || !item.tasks) return item;
      return { ...item, tasks: item.tasks.filter(t => t.id !== taskId) };
    }));
  };

  const updateTaskType = (itemId: string, taskId: string, taskType: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== itemId || !item.tasks) return item;
      return { ...item, tasks: item.tasks.map(t => t.id === taskId ? { ...t, taskType } : t) };
    }));
  };

  // ── Image/file uploads ───────────────────────────────────────────────────
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const src = ev.target?.result as string;
      
      // If uploading to a specific item, update that item
      if (uploadingItemId.current) {
        setItems(prev => prev.map(item => {
          if (item.id === uploadingItemId.current) {
            const newImage = { id: `img-${Date.now()}`, url: src, description: '' };
            return { ...item, images: [...(item.images || []), newImage] };
          }
          return item;
        }));
        uploadingItemId.current = null;
        addToHistory();
        saveWhiteboard();
      } else {
        // Otherwise create a new image item (legacy behavior)
        const rect = canvasRef.current!.getBoundingClientRect();
        const pos = tempItemPos ?? { x: (rect.width / 2 - 100) / zoom, y: (rect.height / 2 - 75) / zoom };
        setItems(prev => [...prev, { id: `item-${Date.now()}`, type: 'image', ...pos, width: 200, height: 150, imageUrl: src, title: file.name, connections: [] }]);
        setTempItemPos(null);
        addToHistory();
        saveWhiteboard();
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // If uploading to a specific item, update that item
    if (uploadingItemId.current) {
      setItems(prev => prev.map(item => {
        if (item.id === uploadingItemId.current) {
          return { ...item, fileUrl: URL.createObjectURL(file), title: file.name };
        }
        return item;
      }));
      uploadingItemId.current = null;
      addToHistory();
      saveWhiteboard();
    } else {
      // Otherwise create a new file item (legacy behavior)
      const rect = canvasRef.current!.getBoundingClientRect();
      const pos = tempItemPos ?? { x: (rect.width / 2 - 90) / zoom, y: (rect.height / 2 - 60) / zoom };
      setItems(prev => [...prev, { id: `item-${Date.now()}`, type: 'file', ...pos, width: 180, height: 120, title: file.name, fileUrl: URL.createObjectURL(file), connections: [] }]);
      setTempItemPos(null);
      addToHistory();
      saveWhiteboard();
    }
    e.target.value = '';
  };

  // ── Name editing ─────────────────────────────────────────────────────────
  const startEditName = () => {
    setEditingNameValue(whiteboardName);
    setIsEditingName(true);
  };

  const confirmEditName = () => {
    const name = editingNameValue.trim() || 'Untitled Whiteboard';
    setWhiteboardName(name);
    setIsEditingName(false);
    saveWhiteboard(name);
  };

  // ── Connector SVG live preview ────────────────────────────────────────────
  const getConnectorPreview = () => {
    if (!connecting) return null;
    const src = items.find(i => i.id === connecting.sourceId);
    if (!src) return null;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;

    const sx = src.x * zoom + offset.x + (src.width || 0) * zoom / 2;
    const sy = src.y * zoom + offset.y + (src.height || 0) * zoom / 2;
    const tx = mousePos.x - rect.left;
    const ty = mousePos.y - rect.top;

    return (
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-30">
        <line x1={sx} y1={sy} x2={tx} y2={ty} stroke="#6366f1" strokeWidth="3" strokeDasharray="8,4" />
        <circle cx={sx} cy={sy} r="8" fill="#6366f1" />
        <circle cx={tx} cy={ty} r="6" fill="#6366f1" opacity="0.5" />
      </svg>
    );
  };

  // ── Rotation handle ─────────────────────────────────────────────────────────────
  const handleRotationPointerDown = (e: React.PointerEvent, itemId: string) => {
    e.stopPropagation();
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
    
    rotationRef.current = {
      itemId,
      startAngle,
      startRotation: item.rotation || 0,
    };
    setIsRotating(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleRotationPointerMove = (e: React.PointerEvent) => {
    if (!isRotating || !rotationRef.current) return;
    
    const item = items.find(i => i.id === rotationRef.current.itemId);
    if (!item) return;
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const centerX = item.x + (item.width || 200) / 2;
    const centerY = item.y + (item.height || 200) / 2;
    const canvasCenterX = centerX * zoom + offset.x;
    const canvasCenterY = centerY * zoom + offset.y;
    
    const currentAngle = Math.atan2(e.clientY - canvasCenterY, e.clientX - canvasCenterX);
    const angleDiff = currentAngle - rotationRef.current.startAngle;
    const newRotation = rotationRef.current.startRotation + angleDiff;
    
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, rotation: newRotation } : i));
  };

  const handleRotationPointerUp = () => {
    setIsRotating(false);
    rotationRef.current = null;
  };

  // ── Resize handles for selected item ─────────────────────────────────────
  const renderResizeHandles = (item: CanvasItem) => {
    const w = item.width || 200;
    const h = item.height || 200;
    const isShape = item.type === 'shape';
    
    if (isShape) {
      // Corner and edge handles for shapes
      return (
        <>
          {/* Rotation handle for shapes */}
          <div
            className="absolute -top-8 left-1/2 -translate-x-1/2 w-6 h-6 bg-white border-2 border-blue-500 rounded-full z-30 cursor-grab flex items-center justify-center select-none"
            onPointerDown={e => handleRotationPointerDown(e, item.id)}
            onPointerMove={handleRotationPointerMove}
            onPointerUp={handleRotationPointerUp}
          >
            <RotateCw className="w-3 h-3 text-blue-500" />
          </div>
          {/* Corner handles */}
          <div className="absolute top-0 left-0 w-3 h-3 bg-white border-2 border-blue-500 rounded-br-sm z-30 cursor-nw-resize select-none" onPointerDown={e => handleResizePointerDown(e, 'nw')} />
          <div className="absolute top-0 right-0 w-3 h-3 bg-white border-2 border-blue-500 rounded-bl-sm z-30 cursor-ne-resize select-none" onPointerDown={e => handleResizePointerDown(e, 'ne')} />
          <div className="absolute bottom-0 left-0 w-3 h-3 bg-white border-2 border-blue-500 rounded-tr-sm z-30 cursor-sw-resize select-none" onPointerDown={e => handleResizePointerDown(e, 'sw')} />
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-white border-2 border-blue-500 rounded-tl-sm z-30 cursor-se-resize select-none" onPointerDown={e => handleResizePointerDown(e, 'se')} />
          {/* Edge handles */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-3 bg-white border-2 border-blue-500 rounded-sm z-30 cursor-n-resize select-none" onPointerDown={e => handleResizePointerDown(e, 'n')} />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-3 bg-white border-2 border-blue-500 rounded-sm z-30 cursor-s-resize select-none" onPointerDown={e => handleResizePointerDown(e, 's')} />
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-3 h-4 bg-white border-2 border-blue-500 rounded-sm z-30 cursor-w-resize select-none" onPointerDown={e => handleResizePointerDown(e, 'w')} />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-4 bg-white border-2 border-blue-500 rounded-sm z-30 cursor-e-resize select-none" onPointerDown={e => handleResizePointerDown(e, 'e')} />
        </>
      );
    }
    
    // Standard bottom-right corner resize handle for other blocks
    return (
      <div
        className="absolute bottom-0 right-0 w-4 h-4 bg-white border-2 border-blue-500 rounded-tl-sm z-30 cursor-se-resize select-none"
        onPointerDown={e => handleResizePointerDown(e, 'se')}
      />
    );
  };

  // ── Global block toolbar ─────────────────────────────────────────────────
  const renderBlockToolbar = (item: CanvasItem) => {
    const colors = ['#fef3c7', '#dbeafe', '#d1fae5', '#ffe4e6', '#f3e8ff', '#ffedd5', '#e0f2fe', '#dcfce7', '#fee2e2', '#f1f5f9'];
    const isTextBlock = item.type === 'text' || item.type === 'sticky-note';
    const isShapeBlock = item.type === 'shape';
    
    return (
      <div className="absolute -top-12 left-0 bg-white rounded-lg shadow-lg border border-gray-200 px-2 py-1 flex items-center gap-1 z-40">
        {/* Move handle */}
        <div className="p-1.5 cursor-grab text-gray-500 hover:text-gray-700">
          <Move className="w-4 h-4" />
        </div>
        
        {/* Color picker */}
        <div className="relative">
          <button 
            onClick={() => setShowColorPicker(!showColorPicker)}
            className="p-1.5 text-gray-500 hover:text-gray-700"
          >
            <Palette className="w-4 h-4" />
          </button>
          {showColorPicker && (
            <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 p-2 grid grid-cols-5 gap-1 z-50">
              {colors.map(color => (
                <button
                  key={color}
                  onClick={() => { changeItemColor(item.id, color); setShowColorPicker(false); }}
                  className={`w-8 h-8 rounded border-2 ${item.color === color ? 'ring-2 ring-blue-500 border-blue-500' : 'border-gray-300'}`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
          )}
        </div>
        
        {/* Text type/format button for text blocks */}
        {isTextBlock && (
          <div className="relative">
            <button 
              onClick={() => setShowTextFormatPopup(!showTextFormatPopup)}
              className="p-1.5 text-gray-500 hover:text-gray-700"
              title="Text formatting"
            >
              <Type className="w-4 h-4" />
            </button>
            {showTextFormatPopup && (
              <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 p-2 z-50">
                <div className="flex gap-1">
                  <button
                    onClick={() => {/* Apply bold to selected text */}}
                    className="p-2 hover:bg-gray-100 rounded font-bold"
                    title="Bold"
                  >
                    B
                  </button>
                  <button
                    onClick={() => {/* Apply underline to selected text */}}
                    className="p-2 hover:bg-gray-100 rounded underline"
                    title="Underline"
                  >
                    U
                  </button>
                  <button
                    onClick={() => {/* Apply bullets to selected text */}}
                    className="p-2 hover:bg-gray-100 rounded"
                    title="Bullet points"
                  >
                    •
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Shape edit button for shape blocks */}
        {isShapeBlock && (
          <button
            onClick={() => setShowShapeEditPopup(!showShapeEditPopup)}
            className="p-1.5 text-gray-500 hover:text-gray-700"
            title="Edit shape"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        )}
        
        {/* Change Shape button for shape blocks */}
        {isShapeBlock && (
          <div className="relative">
            <button
              onClick={() => setShowShapeSelector(!showShapeSelector)}
              className="p-1.5 text-gray-500 hover:text-gray-700"
              title="Change shape"
            >
              <Shapes className="w-4 h-4" />
            </button>
            {showShapeSelector && (
              <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 p-2 z-50">
                <div className="flex gap-1">
                  <button onClick={() => { setItems(prev => prev.map(i => i.id === item.id ? { ...i, shapeType: 'square' } : i)); setShowShapeSelector(false); }} className="p-2 hover:bg-gray-100 rounded" title="Square"><Square className="w-4 h-4" /></button>
                  <button onClick={() => { setItems(prev => prev.map(i => i.id === item.id ? { ...i, shapeType: 'circle' } : i)); setShowShapeSelector(false); }} className="p-2 hover:bg-gray-100 rounded" title="Circle"><div className="w-4 h-4 rounded-full border-2 border-gray-600" /></button>
                  <button onClick={() => { setItems(prev => prev.map(i => i.id === item.id ? { ...i, shapeType: 'triangle' } : i)); setShowShapeSelector(false); }} className="p-2 hover:bg-gray-100 rounded" title="Triangle"><Triangle className="w-4 h-4" /></button>
                  <button onClick={() => { setItems(prev => prev.map(i => i.id === item.id ? { ...i, shapeType: 'diamond' } : i)); setShowShapeSelector(false); }} className="p-2 hover:bg-gray-100 rounded" title="Diamond"><Diamond className="w-4 h-4" /></button>
                  <button onClick={() => { setItems(prev => prev.map(i => i.id === item.id ? { ...i, shapeType: 'hexagon' } : i)); setShowShapeSelector(false); }} className="p-2 hover:bg-gray-100 rounded" title="Hexagon"><Hexagon className="w-4 h-4" /></button>
                  <button onClick={() => { setItems(prev => prev.map(i => i.id === item.id ? { ...i, shapeType: 'star' } : i)); setShowShapeSelector(false); }} className="p-2 hover:bg-gray-100 rounded" title="Star"><Star className="w-4 h-4" /></button>
                  <button onClick={() => { setItems(prev => prev.map(i => i.id === item.id ? { ...i, shapeType: 'arrow' } : i)); setShowShapeSelector(false); }} className="p-2 hover:bg-gray-100 rounded" title="Arrow"><ArrowUp className="w-4 h-4" /></button>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Delete */}
        <button onClick={() => deleteSelectedItem()} className="p-1.5 text-gray-500 hover:text-red-500">
          <Trash2 className="w-4 h-4" />
        </button>
        
        <div className="w-px h-4 bg-gray-200 mx-1" />
        
        {/* Three-dot menu */}
        <div className="relative">
          <button 
            onClick={() => setShowBlockMenu(!showBlockMenu)}
            className="p-1.5 text-gray-500 hover:text-gray-700"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {showBlockMenu && (
            <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50 min-w-[150px]">
              <button onClick={() => { lockItem(item.id); setShowBlockMenu(false); }} className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2">
                {item.locked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                {item.locked ? 'Unlock' : 'Lock'}
              </button>
              <button onClick={() => { duplicateItem(item.id); setShowBlockMenu(false); }} className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2">
                <Copy className="w-4 h-4" /> Duplicate
              </button>
              <button onClick={() => { bringForward(item.id); setShowBlockMenu(false); }} className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2">
                <ArrowUp className="w-4 h-4" /> Bring Forward
              </button>
              <button onClick={() => { sendBackward(item.id); setShowBlockMenu(false); }} className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2">
                <ArrowDown className="w-4 h-4" /> Send Backward
              </button>
            </div>
          )}
        </div>
        
        {/* Shape edit popup */}
        {isShapeBlock && showShapeEditPopup && (
          <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 p-4 z-50 w-64">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Fill colour</label>
                <div className="flex gap-1 flex-wrap">
                  {colors.map(color => (
                    <button
                      key={color}
                      onClick={() => { changeItemColor(item.id, color); }}
                      className={`w-6 h-6 rounded border-2 ${item.color === color ? 'ring-2 ring-blue-500 border-blue-500' : 'border-gray-300'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Border colour</label>
                <div className="flex gap-1 flex-wrap">
                  {colors.map(color => (
                    <button
                      key={color}
                      onClick={() => { setItems(prev => prev.map(i => i.id === item.id ? { ...i, borderColor: color } : i)); }}
                      className={`w-6 h-6 rounded border-2 ${item.borderColor === color ? 'ring-2 ring-blue-500 border-blue-500' : 'border-gray-300'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Border thickness</label>
                <div className="flex gap-1">
                  {['thin', 'medium', 'thick'].map(thickness => (
                    <button
                      key={thickness}
                      onClick={() => { setItems(prev => prev.map(i => i.id === item.id ? { ...i, borderThickness: thickness as 'thin' | 'medium' | 'thick' } : i)); }}
                      className={`px-2 py-1 text-xs rounded ${item.borderThickness === thickness ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
                    >
                      {thickness}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Border style</label>
                <div className="flex gap-1">
                  {['solid', 'dashed', 'dotted'].map(style => (
                    <button
                      key={style}
                      onClick={() => { setItems(prev => prev.map(i => i.id === item.id ? { ...i, borderStyle: style as 'solid' | 'dashed' | 'dotted' } : i)); }}
                      className={`px-2 py-1 text-xs rounded ${item.borderStyle === style ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Opacity: {item.opacity || 100}%</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={item.opacity || 100}
                  onChange={e => setItems(prev => prev.map(i => i.id === item.id ? { ...i, opacity: parseInt(e.target.value) } : i))}
                  className="w-full"
                />
              </div>
              {item.shapeType === 'square' && (
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Corner radius: {item.cornerRadius || 0}px</label>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    value={item.cornerRadius || 0}
                    onChange={e => setItems(prev => prev.map(i => i.id === item.id ? { ...i, cornerRadius: parseInt(e.target.value) } : i))}
                    className="w-full"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Render item ──────────────────────────────────────────────────────────
  const renderItem = (item: CanvasItem) => {
    const isSelected = selectedItem === item.id;
    const isHovered = hoveredItem === item.id;
    const isConnectorSource = connecting?.sourceId === item.id;
    const zIndex = item.zIndex || 1;

    const wrapperCls = cn(
      'canvas-item absolute select-none',
      isSelected && 'ring-2 ring-blue-400 ring-offset-1',
      isConnectorSource && 'ring-2 ring-indigo-500',
      activeTool === 'connector' && 'cursor-crosshair',
      activeTool === 'select' && !isDragging && !item.locked && 'cursor-grab',
      isDragging && isSelected && 'cursor-grabbing',
      item.locked && 'cursor-not-allowed opacity-80',
    );

    const stopEdit = (e: React.MouseEvent) => e.stopPropagation();

    const sharedHandlers = {
      onPointerDown: (e: React.PointerEvent) => handleItemPointerDown(e, item.id),
      onPointerMove: (e: React.PointerEvent) => handleItemPointerMove(e, item.id),
      onPointerUp: handleItemPointerUp,
      onMouseEnter: () => setHoveredItem(item.id),
      onMouseLeave: () => setHoveredItem(null),
    };

    const w = item.width || 200;
    const h = item.height || 200;

    // Connector points (center of each edge)
    const connectorPoints = [
      { x: w / 2, y: 0, edge: 'top' },
      { x: w, y: h / 2, edge: 'right' },
      { x: w / 2, y: h, edge: 'bottom' },
      { x: 0, y: h / 2, edge: 'left' },
    ];

    let content: React.ReactNode = null;

    switch (item.type) {
      case 'sticky-note':
        content = (
          <div
            {...sharedHandlers}
            className={cn(wrapperCls, 'rounded-lg shadow-md overflow-hidden flex flex-col')}
            style={{ left: item.x, top: item.y, width: w, height: h, backgroundColor: item.backgroundColor || item.color }}
          >
            <div className="p-3 flex-1 flex flex-col">
              <input
                type="text"
                className="w-full bg-transparent font-bold text-sm outline-none cursor-text mb-2"
                style={{ fontFamily: "'Comic Sans MS', cursive" }}
                value={item.title ?? ''}
                placeholder="Title..."
                onMouseDown={stopEdit}
                onClick={stopEdit}
                onChange={e => setItems(prev => prev.map(i => i.id === item.id ? { ...i, title: e.target.value } : i))}
              />
              <textarea
                className="w-full flex-1 bg-transparent resize-none outline-none text-sm cursor-text"
                style={{ fontFamily: "'Comic Sans MS', cursive" }}
                value={item.description ?? ''}
                placeholder="Write something..."
                onMouseDown={stopEdit}
                onClick={stopEdit}
                onChange={e => setItems(prev => prev.map(i => i.id === item.id ? { ...i, description: e.target.value } : i))}
              />
            </div>
          </div>
        );
        break;

      case 'text':
        const textType = item.textType || 'header-description';
        content = (
          <div
            {...sharedHandlers}
            className={cn(wrapperCls, 'bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col')}
            style={{ left: item.x, top: item.y, width: w, height: h, backgroundColor: item.backgroundColor }}
          >
            <div className="p-4 flex-1 flex flex-col">
              {(textType === 'header-only' || textType === 'header-description') && (
                <input
                  type="text"
                  className="w-full bg-transparent font-bold text-lg outline-none cursor-text mb-2"
                  value={item.title ?? ''}
                  placeholder="Header..."
                  onMouseDown={stopEdit}
                  onClick={stopEdit}
                  onChange={e => setItems(prev => prev.map(i => i.id === item.id ? { ...i, title: e.target.value } : i))}
                />
              )}
              {(textType === 'description-only' || textType === 'header-description') && (
                <textarea
                  className="w-full flex-1 bg-transparent resize-none outline-none text-sm cursor-text text-gray-800"
                  value={item.description ?? ''}
                  placeholder="Type text..."
                  onMouseDown={stopEdit}
                  onClick={stopEdit}
                  onChange={e => setItems(prev => prev.map(i => i.id === item.id ? { ...i, description: e.target.value } : i))}
                />
              )}
            </div>
          </div>
        );
        break;

      case 'document':
        content = (
          <div
            {...sharedHandlers}
            className={cn(wrapperCls, 'bg-white rounded-lg shadow-md border-2 border-gray-200 overflow-hidden flex flex-col')}
            style={{ left: item.x, top: item.y, width: w, height: h, backgroundColor: item.backgroundColor }}
          >
            {item.fileUrl ? (
              <>
                <div className="relative flex-1 p-3 flex items-center justify-center bg-gray-50">
                  {item.fileUrl.endsWith('.pdf') || item.fileUrl.endsWith('.doc') || item.fileUrl.endsWith('.docx') ? (
                    <div className="text-center">
                      <FileText className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                      <span className="text-xs text-gray-500">File uploaded</span>
                    </div>
                  ) : (
                    <img src={item.fileUrl} alt="Preview" className="max-w-full max-h-full object-contain" />
                  )}
                  {/* File controls in top right */}
                  <div className="absolute top-2 right-2 flex gap-1">
                    <button
                      onClick={e => { stopEdit(e); uploadingItemId.current = item.id; fileInputRef.current?.click(); }}
                      className="p-1 bg-white rounded shadow hover:bg-gray-100"
                      title="Edit file"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={e => { stopEdit(e); setItems(prev => prev.map(i => i.id === item.id ? { ...i, fileUrl: '' } : i)); }}
                      className="p-1 bg-white rounded shadow hover:bg-red-100"
                      title="Delete file"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center bg-gray-50">
                <button onClick={e => { stopEdit(e); uploadingItemId.current = item.id; fileInputRef.current?.click(); }} className="flex flex-col items-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary hover:bg-primary/5 transition-colors">
                  <FileText className="w-8 h-8 text-gray-400" />
                  <span className="text-sm text-gray-500">Upload file</span>
                </button>
              </div>
            )}
            <div className="p-3 border-t border-gray-200">
              <textarea
                className="w-full bg-transparent resize-none outline-none text-sm cursor-text text-gray-700"
                value={item.description ?? ''}
                placeholder="Description..."
                onMouseDown={stopEdit}
                onClick={stopEdit}
                onChange={e => setItems(prev => prev.map(i => i.id === item.id ? { ...i, description: e.target.value } : i))}
              />
            </div>
          </div>
        );
        break;

      case 'image':
        const images = item.images || [];
        const imageCount = images.length;
        content = (
          <div
            {...sharedHandlers}
            className={cn(wrapperCls, 'bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col')}
            style={{ left: item.x, top: item.y, width: w, height: h, backgroundColor: item.backgroundColor }}
          >
            {imageCount === 0 ? (
              <div className="flex-1 flex items-center justify-center bg-gray-50">
                <button onClick={e => { stopEdit(e); uploadingItemId.current = item.id; imageInputRef.current?.click(); }} className="flex flex-col items-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary hover:bg-primary/5 transition-colors">
                  <Image className="w-8 h-8 text-gray-400" />
                  <span className="text-sm text-gray-500">Add image</span>
                </button>
              </div>
            ) : (
              <div className="flex-1 p-2 grid gap-2" style={{
                gridTemplateColumns: imageCount === 1 ? '1fr' : imageCount <= 2 ? '1fr 1fr' : imageCount <= 4 ? '1fr 1fr' : '1fr 1fr 1fr',
                gridTemplateRows: imageCount <= 2 ? '1fr' : imageCount <= 4 ? '1fr 1fr' : 'auto'
              }}>
                {images.map((img, idx) => (
                  <div key={img.id} className="relative group">
                    <img src={img.url} alt={`Image ${idx + 1}`} className="w-full h-full object-cover rounded-lg" />
                    <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={e => { stopEdit(e); /* Replace image */ }} className="p-1 bg-white rounded shadow hover:bg-gray-100">
                        <Edit3 className="w-3 h-3" />
                      </button>
                      <button onClick={e => { stopEdit(e); setItems(prev => prev.map(i => i.id === item.id ? { ...i, images: i.images?.filter(im => im.id !== img.id) } : i)); }} className="p-1 bg-white rounded shadow hover:bg-red-100 text-red-500">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <textarea
                      className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 outline-none resize-none rounded-b-lg"
                      placeholder="Description..."
                      value={img.description || ''}
                      onMouseDown={stopEdit}
                      onClick={stopEdit}
                      onChange={e => setItems(prev => prev.map(i => i.id === item.id ? { ...i, images: i.images?.map(im => im.id === img.id ? { ...im, description: e.target.value } : im) } : i))}
                    />
                  </div>
                ))}
              </div>
            )}
            {imageCount < 5 && (
              <button
                onClick={e => { stopEdit(e); uploadingItemId.current = item.id; imageInputRef.current?.click(); }}
                className="border-t border-gray-200 py-2 text-xs text-gray-400 hover:text-primary hover:bg-gray-50 transition-colors flex items-center justify-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add Image
              </button>
            )}
          </div>
        );
        break;

      case 'shape':
        const shapeType = item.shapeType || 'square';
        const rotation = item.rotation || 0;
        const fillColor = item.fillColor || '#6366f1';
        const borderColor = item.borderColor || '#4f46e5';
        const borderThickness = item.borderThickness || 'medium';
        const borderStyle = item.borderStyle || 'solid';
        const opacity = item.opacity || 100;
        const cornerRadius = item.cornerRadius || 0;
        
        const borderWidth = borderThickness === 'thin' ? 1 : borderThickness === 'thick' ? 4 : 2;
        const borderDash = borderStyle === 'dashed' ? '5,5' : borderStyle === 'dotted' ? '2,2' : 'none';
        
        content = (
          <div
            {...sharedHandlers}
            className={cn(wrapperCls, 'relative flex items-center justify-center overflow-hidden')}
            style={{ 
              left: item.x, 
              top: item.y, 
              width: w, 
              height: h,
              transform: `rotate(${rotation}deg)`,
              opacity: opacity / 100
            }}
          >
            <div
              className="w-full h-full"
              style={{
                backgroundColor: fillColor,
                border: `${borderWidth}px ${borderStyle} ${borderColor}`,
                borderStyle: borderStyle === 'dashed' || borderStyle === 'dotted' ? 'dashed' : 'solid',
                borderRadius: shapeType === 'circle' ? '50%' : `${cornerRadius}px`,
                clipPath: shapeType === 'triangle' ? 'polygon(50% 0%, 0% 100%, 100% 100%)' :
                           shapeType === 'diamond' ? 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' :
                           shapeType === 'hexagon' ? 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' :
                           shapeType === 'star' ? 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)' :
                           shapeType === 'arrow' ? 'polygon(0% 20%, 60% 20%, 60% 0%, 100% 50%, 60% 100%, 60% 80%, 0% 80%)' :
                           'none'
              }}
            />
          </div>
        );
        break;

      case 'task': {
        const taskH = h;
        const taskIds = item.taskIds || [];
        content = (
          <div
            {...sharedHandlers}
            className={cn(wrapperCls, 'bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden flex flex-col')}
            style={{ left: item.x, top: item.y, width: w, height: taskH }}
          >
            <div className="bg-gray-50 border-b border-gray-200 px-3 py-2 flex items-center gap-2">
              <SquareCheckBig className="w-4 h-4 text-primary flex-shrink-0" />
              <input
                type="text"
                className="flex-1 bg-transparent font-bold text-sm text-gray-800 outline-none cursor-text"
                value={item.title ?? ''}
                placeholder="Task title"
                onMouseDown={stopEdit}
                onClick={stopEdit}
                onChange={e => setItems(prev => prev.map(i => i.id === item.id ? { ...i, title: e.target.value } : i))}
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {taskIds.length === 0 ? (
                <div className="text-center py-4 text-sm text-gray-400">
                  No tasks yet. Click "Add Task" to add tasks from your project.
                </div>
              ) : (
                taskIds.map(taskId => {
                  // In a real implementation, this would fetch the actual task from the app's task state
                  // For now, we'll render a placeholder
                  return (
                    <div key={taskId} className="bg-task rounded-lg p-3 border border-transparent hover:border-border cursor-pointer group relative">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-primary flex-shrink-0" />
                        <p className="text-sm font-bold text-foreground">Task {taskId}</p>
                        <button
                          className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-100 rounded text-red-500"
                          onMouseDown={stopEdit}
                          onClick={e => { 
                            stopEdit(e); 
                            setItems(prev => prev.map(i => i.id === item.id ? { ...i, taskIds: i.taskIds?.filter(id => id !== taskId) } : i));
                          }}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {taskIds.length < 15 && (
              <button
                className="border-t border-gray-200 py-2 text-xs text-gray-400 hover:text-primary hover:bg-gray-50 transition-colors flex items-center justify-center gap-1"
                onMouseDown={stopEdit}
                onClick={e => { 
                  stopEdit(e); 
                  // In a real implementation, this would open a task selection popup
                  // For now, we'll add a placeholder task ID
                  const newTaskId = `task-${Date.now()}`;
                  setItems(prev => prev.map(i => i.id === item.id ? { ...i, taskIds: [...(i.taskIds || []), newTaskId] } : i));
                }}
              >
                <Plus className="w-3 h-3" /> Add Task
              </button>
            )}
          </div>
        );
        break;
      }

      case 'table':
        const rows = item.rows || 3;
        const columns = item.columns || 3;
        const cells = item.cells || [];
        content = (
          <div
            {...sharedHandlers}
            className={cn(wrapperCls, 'bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col')}
            style={{ left: item.x, top: item.y, width: w, height: h, backgroundColor: item.backgroundColor }}
          >
            <div className="flex-1 overflow-auto">
              <table className="w-full border-collapse">
                <tbody>
                  {Array.from({ length: rows }).map((_, rowIndex) => (
                    <tr key={rowIndex}>
                      {Array.from({ length: columns }).map((_, colIndex) => {
                        const cell = cells.find(c => c.row === rowIndex && c.column === colIndex);
                        return (
                          <td key={colIndex} className="border border-gray-200 p-1">
                            <textarea
                              className="w-full h-full bg-transparent resize-none outline-none text-sm"
                              placeholder=""
                              value={cell?.content || ''}
                              onMouseDown={stopEdit}
                              onClick={stopEdit}
                              onChange={e => {
                                const newCells = [...cells.filter(c => !(c.row === rowIndex && c.column === colIndex)), { row: rowIndex, column: colIndex, content: e.target.value }];
                                setItems(prev => prev.map(i => i.id === item.id ? { ...i, cells: newCells } : i));
                              }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
        break;

      case 'link':
        content = (
          <div
            {...sharedHandlers}
            className={cn(wrapperCls, 'bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col')}
            style={{ left: item.x, top: item.y, width: w, height: h, backgroundColor: item.backgroundColor }}
          >
            {item.url ? (
              <>
                {item.imageUrl && (
                  <div className="flex-1 overflow-hidden">
                    <img src={item.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="p-3">
                  <h3 className="font-semibold text-sm text-gray-800 mb-1">{item.title || 'Link'}</h3>
                  <p className="text-xs text-gray-600 mb-2 line-clamp-2">{item.description || ''}</p>
                  <input
                    type="text"
                    className="w-full bg-transparent text-xs text-primary outline-none"
                    value={item.url}
                    onMouseDown={stopEdit}
                    onClick={stopEdit}
                    onChange={e => setItems(prev => prev.map(i => i.id === item.id ? { ...i, url: e.target.value } : i))}
                  />
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-4">
                <LinkIcon className="w-8 h-8 text-gray-400 mb-2" />
                <input
                  type="text"
                  className="w-full bg-transparent text-center outline-none text-sm border-b border-gray-200"
                  placeholder="Paste URL and press Enter"
                  value={item.url || ''}
                  onMouseDown={stopEdit}
                  onClick={stopEdit}
                  onChange={e => setItems(prev => prev.map(i => i.id === item.id ? { ...i, url: e.target.value } : i))}
                  onKeyDown={e => { if (e.key === 'Enter' && item.url) { /* Fetch preview */ } }}
                />
              </div>
            )}
          </div>
        );
        break;

      case 'comment':
        content = (
          <div
            {...sharedHandlers}
            className={cn(wrapperCls, 'rounded-lg shadow-md overflow-hidden flex flex-col')}
            style={{ left: item.x, top: item.y, width: w, height: h, backgroundColor: item.backgroundColor || item.color }}
          >
            <div className="p-3 flex-1">
              <textarea
                className="w-full h-full bg-transparent resize-none outline-none text-sm cursor-text"
                value={item.description ?? ''}
                placeholder="Add a comment..."
                onMouseDown={stopEdit}
                onClick={stopEdit}
                onChange={e => setItems(prev => prev.map(i => i.id === item.id ? { ...i, description: e.target.value } : i))}
              />
            </div>
          </div>
        );
        break;

      default:
        return null;
    }

    return (
      <React.Fragment key={item.id}>
        <div
          {...sharedHandlers}
          className={wrapperCls}
          style={{ left: item.x, top: item.y, width: w, height: h, zIndex }}
          data-item-id={item.id}
        >
          {content}
          {/* Connector circles - visible on hover */}
          {isHovered && !item.locked && (
            <>
              {connectorPoints.map((point, idx) => (
                <div
                  key={`connector-${idx}`}
                  className="absolute w-4 h-4 bg-white border-2 border-blue-500 rounded-full cursor-crosshair hover:bg-blue-500 hover:border-blue-600 transition-colors z-50"
                  style={{
                    left: point.x - 8,
                    top: point.y - 8,
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setConnectorDrag({
                      sourceId: item.id,
                      sourcePoint: { x: item.x + point.x, y: item.y + point.y },
                    });
                  }}
                />
              ))}
            </>
          )}
        </div>
        {isSelected && !item.locked && renderBlockToolbar(item)}
        {isSelected && renderResizeHandles(item)}
      </React.Fragment>
    );
  };

  // ── Render connections ────────────────────────────────────────────────────
  const renderConnections = () => (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0, transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transformOrigin: '0 0' }}
    >
      <defs>
        {connections.map(c => (
          <marker key={`m-${c.id}`} id={`arrow-${c.id}`} markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill={c.color || '#6366f1'} />
          </marker>
        ))}
      </defs>
      {connections.map(conn => {
        const src = items.find(i => i.id === conn.sourceId);
        const tgt = items.find(i => i.id === conn.targetId);
        if (!src || !tgt) return null;
        const sx = src.x + (src.width || 0) / 2;
        const sy = src.y + (src.height || 0) / 2;
        const tx = tgt.x + (tgt.width || 0) / 2;
        const ty = tgt.y + (tgt.height || 0) / 2;
        const cx1 = sx + (tx - sx) / 3;
        const cy1 = sy;
        const cx2 = tx - (tx - sx) / 3;
        const cy2 = ty;
        const thickness = conn.thickness === 'thin' ? 1 : conn.thickness === 'thick' ? 4 : 2;
        
        return (
          <g key={conn.id}>
            <path
              d={`M ${sx} ${sy} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${tx} ${ty}`}
              stroke={conn.color || '#6366f1'}
              strokeWidth={thickness}
              fill="none"
              markerEnd={`url(#arrow-${conn.id})`}
              className={selectedConnection === conn.id ? 'cursor-pointer' : ''}
              style={{ pointerEvents: 'auto' }}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedConnection(conn.id);
                setShowConnectionToolbar(true);
              }}
            />
            {selectedConnection === conn.id && renderConnectionToolbar(conn, sx, sy, tx, ty)}
          </g>
        );
      })}
      {/* Connector drag preview */}
      {connectorDrag && (
        <path
          d={`M ${connectorDrag.sourcePoint.x} ${connectorDrag.sourcePoint.y} L ${(mousePos.x - offset.x) / zoom} ${(mousePos.y - offset.y) / zoom}`}
          stroke="#6366f1"
          strokeWidth={2}
          fill="none"
          strokeDasharray="5,5"
        />
      )}
    </svg>
  );

  // ── Connection floating toolbar ─────────────────────────────────────────────
  const renderConnectionToolbar = (conn: Connection, sx: number, sy: number, tx: number, ty: number) => {
    const midX = (sx + tx) / 2;
    const midY = (sy + ty) / 2;
    const colors = ['#6366f1', '#ef4444', '#22c55e', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#64748b'];
    
    return (
      <div 
        className="absolute bg-white rounded-lg shadow-lg border border-gray-200 px-2 py-1 flex items-center gap-1 z-50"
        style={{ 
          left: midX * zoom + offset.x, 
          top: midY * zoom + offset.y - 40,
          transform: 'translate(-50%, 0)'
        }}
      >
        {/* Color picker */}
        <div className="relative group">
          <button className="p-1.5 text-gray-500 hover:text-gray-700">
            <Palette className="w-4 h-4" />
          </button>
          <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 p-2 grid grid-cols-4 gap-1 z-50 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity">
            {colors.map(color => (
              <button
                key={color}
                onClick={() => changeConnectionColor(conn.id, color)}
                className={`w-5 h-5 rounded ${conn.color === color ? 'ring-2 ring-blue-500' : ''}`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
        
        {/* Thickness */}
        <div className="relative group">
          <button className="p-1.5 text-gray-500 hover:text-gray-700">
            <Layers className="w-4 h-4" />
          </button>
          <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity min-w-[100px]">
            {['thin', 'medium', 'thick'].map(thick => (
              <button
                key={thick}
                onClick={() => changeConnectionThickness(conn.id, thick as any)}
                className={`w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 capitalize ${conn.thickness === thick ? 'bg-gray-100' : ''}`}
              >
                {thick}
              </button>
            ))}
          </div>
        </div>
        
        <div className="w-px h-4 bg-gray-200 mx-1" />
        
        {/* Delete */}
        <button onClick={() => deleteConnection(conn.id)} className="p-1.5 text-gray-500 hover:text-red-500">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full w-full bg-gray-50 relative" onPointerMove={isResizing ? handleResizePointerMove : undefined} onPointerUp={isResizing ? handleResizePointerUp : undefined}>
      {/* Hidden inputs */}
      <input type="file" accept="image/*" ref={imageInputRef} onChange={handleImageUpload} className="hidden" multiple={false} />
      <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" multiple={false} />

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-[110] bg-background/70 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
            <p className="text-sm font-medium text-muted-foreground">Loading canvas...</p>
          </div>
        </div>
      )}

      {/* Left toolbar */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-2xl p-1.5 shadow-xl">
        {tools.map(tool => (
          <button
            key={tool.id}
            title={tool.name}
            onClick={() => setActiveTool(tool.id)}
            className={cn(
              'p-2.5 rounded-xl transition-all duration-150 flex items-center justify-center',
              activeTool === tool.id ? 'bg-primary text-primary-foreground shadow-md scale-105' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
            )}
          >
            {tool.icon}
          </button>
        ))}
        <div className="w-full h-px bg-gray-200 my-0.5" />
        <button
          title="Clear canvas"
          onClick={() => { setItems([]); setConnections([]); setSelectedItem(null); }}
          className="p-2.5 rounded-xl text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Top bar */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center gap-3">
        {/* Whiteboard selector dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowWhiteboardDropdown(!showWhiteboardDropdown)}
            className="bg-white/90 backdrop-blur-sm shadow-md border border-gray-200 rounded-xl px-3 py-2 flex items-center gap-2 hover:bg-gray-50 transition-colors"
          >
            <div className="w-4 h-4 rounded" style={{ backgroundColor: whiteboardColor }} />
            <span className="text-sm font-semibold text-foreground max-w-[150px] truncate">{whiteboardName}</span>
            <ChevronDown className="w-4 h-4 text-gray-500" />
          </button>
          
          {showWhiteboardDropdown && (
            <div className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-200 w-64 z-30">
              <div className="p-2 border-b border-gray-100">
                <button
                  onClick={async () => {
                    setShowWhiteboardDropdown(false);
                    const newWhiteboard = await createWhiteboard({
                      name: 'Untitled Whiteboard',
                      items: [],
                      connections: [],
                    });
                    if (newWhiteboard) {
                      // Reload the page with the new whiteboard ID
                      window.location.href = `/whiteboard/${newWhiteboard.id}`;
                    }
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 text-sm font-medium text-primary"
                >
                  <Plus className="w-4 h-4" /> New Whiteboard
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {/* Whiteboard list would go here */}
                <div className="p-3 text-sm text-gray-500 text-center">No other whiteboards</div>
              </div>
            </div>
          )}
        </div>

        {/* Current whiteboard info */}
        <div className="bg-white/90 backdrop-blur-sm shadow-md border border-gray-200 rounded-xl px-3 py-2 flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: whiteboardColor }} />
          <span className="text-sm font-semibold text-foreground">{whiteboardName}</span>
          <button onClick={() => setShowEditPopup(!showEditPopup)} className="text-gray-400 hover:text-primary transition-colors">
            <Edit3 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Edit popup */}
        {showEditPopup && (
          <div className="absolute top-full left-48 mt-2 bg-white rounded-xl shadow-xl border border-gray-200 p-4 z-30 w-72">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Name</label>
                <input
                  type="text"
                  value={editingNameValue}
                  onChange={e => setEditingNameValue(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Color</label>
                <div className="flex gap-2">
                  {['#6366f1', '#ef4444', '#22c55e', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#64748b'].map(color => (
                    <button
                      key={color}
                      onClick={() => { setWhiteboardColor(color); saveWhiteboard(); }}
                      className={`w-6 h-6 rounded-full border-2 ${whiteboardColor === color ? 'border-gray-900' : 'border-transparent'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={confirmEditName} className="flex-1 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90">Save</button>
                <button onClick={() => setShowEditPopup(false)} className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Undo/Redo/Export */}
        <div className="bg-white/90 backdrop-blur-sm shadow-md border border-gray-200 rounded-xl p-1 flex gap-1">
          <button onClick={undo} disabled={historyIndex <= 0} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <Undo className="w-4 h-4 text-gray-600" />
          </button>
          <button onClick={redo} disabled={historyIndex >= history.length - 1} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <Redo className="w-4 h-4 text-gray-600" />
          </button>
          <div className="w-px bg-gray-200 mx-1" />
          <button onClick={exportWhiteboard} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <Download className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Delete toolbar */}
      {selectedItem && (
        <div className="absolute top-3 right-3 z-20 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-xl p-1 flex gap-1 shadow-lg">
          <button onClick={deleteSelectedItem} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium">
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        </div>
      )}

      {/* Connector hint */}
      {connecting && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 bg-indigo-500 text-white text-xs px-4 py-2 rounded-full shadow-lg font-medium">
          🔗 Now click another item to connect — or click the canvas to cancel
        </div>
      )}

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="flex-1 relative overflow-hidden"
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onClick={handleCanvasClick}
        style={{
          backgroundImage: 'radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)',
          backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          backgroundPosition: `${offset.x}px ${offset.y}px`,
          cursor: isPanning ? 'grabbing' : activeTool === 'connector' ? 'crosshair' : activeTool !== 'select' ? 'crosshair' : 'default',
        }}
      >
        {/* Items layer */}
        <div
          className="absolute top-0 left-0 w-0 h-0"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transformOrigin: '0 0' }}
        >
          {[...items].sort((a, b) => (a.zIndex || 1) - (b.zIndex || 1)).map(item => renderItem(item))}
        </div>

        {/* Connections SVG */}
        {renderConnections()}

        {/* Connector live preview */}
        {getConnectorPreview()}

        {/* Zoom controls */}
        <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-xl p-1 flex items-center shadow-lg z-20">
          <button onClick={() => setShowTutorial(true)} className="px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/5 rounded-lg transition-colors">
            Guide
          </button>
          <div className="w-px h-5 bg-border mx-1" />
          <button onClick={() => setZoom(z => clampZoom(+(z - ZOOM_STEP).toFixed(2)))} disabled={zoom <= MIN_ZOOM} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-all">
            <ZoomOut className="w-4 h-4 text-gray-500" />
          </button>
          <button onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }} className="px-2    py-1 text-xs font-bold tabular-nums text-gray-700 hover:text-primary rounded-lg hover:bg-gray-100 transition-all min-w-[44px] text-center">
            {zoomPercent}%
          </button>
          <button onClick={() => setZoom(z => clampZoom(+(z + ZOOM_STEP).toFixed(2)))} disabled={zoom >= MAX_ZOOM} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-all">
            <ZoomIn className="w-4 h-4 text-gray-500" />
          </button>
          <div className="w-px h-5 bg-border mx-1" />
          <button onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }} className="p-1.5 rounded-lg hover:bg-gray-100 transition-all" title="Reset to 100%">
            <span className="text-xs font-bold text-gray-600">100%</span>
          </button>
          <button onClick={fitToScreen} className="p-1.5 rounded-lg hover:bg-gray-100 transition-all" title="Fit to screen">
            <Maximize2 className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Tutorial Overlay */}
        {showTutorial && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center bg-background/50 backdrop-blur-md">
            <div className="bg-card border border-border shadow-2xl rounded-2xl max-w-lg w-full p-8 relative overflow-hidden mx-4">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-blue-400" />
              <button onClick={dismissTutorial} className="absolute top-4 right-4 p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
              <div className="space-y-5">
                <div>
                  <h1 className="text-2xl font-bold text-foreground">Welcome to Canvas</h1>
                  <p className="text-sm text-muted-foreground mt-1">Your visual workspace. Here's what you need to know:</p>
                </div>
                <div className="space-y-3">
                  {[
                    { icon: <MousePointer2 className="w-5 h-5 text-primary" />, title: 'Add items', desc: 'Pick a tool from the left bar, then click anywhere on the canvas to place it.' },
                    { icon: <GripVertical className="w-5 h-5 text-primary" />, title: 'Move & resize', desc: 'Select an item to move it. Drag the blue handles on the edges to resize.' },
                    { icon: <LinkIcon className="w-5 h-5 text-primary" />, title: 'Connect items', desc: 'Pick the Connector tool, click one item, then click another to draw an arrow.' },
                    { icon: <ZoomIn className="w-5 h-5 text-primary" />, title: 'Zoom & pan', desc: 'Ctrl + scroll to zoom. Drag empty space to pan around the canvas.' },
                  ].map(tip => (
                    <div key={tip.title} className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 border border-border">
                      <div className="bg-primary/10 p-2 rounded-lg flex-shrink-0">{tip.icon}</div>
                      <div>
                        <h3 className="font-semibold text-sm">{tip.title}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{tip.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={dismissTutorial}
                  className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  Got it — Let's Create!
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Whiteboard;