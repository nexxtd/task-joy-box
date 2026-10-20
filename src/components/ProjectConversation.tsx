import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
  MessageCircle,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  Search,
  Send,
  Share2,
  StickyNote,
  CheckSquare,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ConversationMessage {
  id: string;
  text: string;
  authorName: string;
  authorId: number;
  createdAt: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentType?: string | null;
  attachmentSize?: number | null;
  linkedType?: 'task' | 'note' | null;
  linkedId?: string | null;
  linkedTitle?: string | null;
  linkedColumn?: string | null;
}

export interface LinkableItem {
  id: string;
  title: string;
  columnName?: string;
  done?: boolean;
}

export type ConversationMode = 'inline' | 'docked' | 'floating';

interface Props {
  projectId: number | null;
  projectName: string;
  currentUserId?: number;
  tasks: LinkableItem[];
  notes: LinkableItem[];
  mode: ConversationMode;
  onClose?: () => void;
  onModeChange?: (mode: ConversationMode) => void;
  onInvite?: () => void;
  onOpenTask?: (taskId: string) => void;
  onOpenNote?: (noteId: string) => void;
}

const MIN_W = 320;
const MIN_H = 360;
const GAP = 12;
const DEFAULT_SIZE = { w: 420, h: 600 };
const WINDOW_KEY = 'project_chat_window_v1';

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatBytes(size?: number | null) {
  if (!size) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function isImageMessage(msg: ConversationMessage) {
  const type = msg.attachmentType || '';
  const name = msg.attachmentName || '';
  return type.startsWith('image/') || /\.(jpe?g|png|gif|webp|svg|avif)$/i.test(name);
}

function readStoredWindow() {
  try {
    const raw = localStorage.getItem(WINDOW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as { x?: number; y?: number; w?: number; h?: number };
  } catch {
    return null;
  }
}

export const ProjectConversation: React.FC<Props> = ({
  projectId,
  projectName,
  currentUserId,
  tasks,
  notes,
  mode,
  onClose,
  onModeChange,
  onInvite,
  onOpenTask,
  onOpenNote,
}) => {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [link, setLink] = useState<{ type: 'task' | 'note'; id: string; title: string; column?: string } | null>(null);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [linkTab, setLinkTab] = useState<'task' | 'note'>('task');
  const [linkSearch, setLinkSearch] = useState('');
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const linkPickerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isFloating = mode === 'floating';

  // --- Window position / size (floating mode) -----------------------------
  const [size, setSize] = useState(() => {
    const stored = typeof window !== 'undefined' ? readStoredWindow() : null;
    if (!stored?.w || !stored?.h) return DEFAULT_SIZE;
    return { w: stored.w, h: stored.h };
  });
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const dragRef = useRef<{
    kind: 'move' | ResizeDir;
    startX: number;
    startY: number;
    startPos: { x: number; y: number };
    startSize: { w: number; h: number };
  } | null>(null);

  // Pin to the bottom-right corner the first time the panel opens.
  useEffect(() => {
    if (!isFloating || pos) return;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const w = Math.min(size.w, Math.max(MIN_W, vw - GAP * 2));
    const h = Math.min(size.h, Math.max(MIN_H, vh - GAP * 2));
    const stored = readStoredWindow();
    setSize({ w, h });
    setPos({
      x: stored?.x != null ? clamp(stored.x, GAP, Math.max(GAP, vw - w - GAP)) : vw - w - GAP,
      y: stored?.y != null ? clamp(stored.y, GAP, Math.max(GAP, vh - h - GAP)) : vh - h - GAP,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFloating]);

  // Keep the window reachable after a viewport resize.
  useEffect(() => {
    if (!isFloating || !pos) return;
    const handleResize = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setSize(prev => {
        const w = Math.min(prev.w, Math.max(MIN_W, vw - GAP * 2));
        const h = Math.min(prev.h, Math.max(MIN_H, vh - GAP * 2));
        setPos(current => (current
          ? { x: clamp(current.x, GAP, Math.max(GAP, vw - w - GAP)), y: clamp(current.y, GAP, Math.max(GAP, vh - h - GAP)) }
          : current));
        return { w, h };
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isFloating, pos]);

  useEffect(() => {
    if (!isFloating) return;
    try { localStorage.setItem(WINDOW_KEY, JSON.stringify({ ...pos, ...size })); } catch {}
  }, [isFloating, pos, size]);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    try { window.removeEventListener('pointermove', onDragMove); } catch {}
    try { window.removeEventListener('pointerup', endDrag); } catch {}
    try { document.body.style.userSelect = ''; } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDragMove = useCallback((event: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (drag.kind === 'move') {
      setPos({
        x: clamp(drag.startPos.x + dx, GAP, Math.max(GAP, vw - drag.startSize.w - GAP)),
        y: clamp(drag.startPos.y + dy, GAP, Math.max(GAP, vh - drag.startSize.h - GAP)),
      });
      return;
    }

    const dir = drag.kind;
    const maxW = Math.min(980, Math.max(MIN_W, vw - GAP * 2));
    const maxH = Math.min(920, Math.max(MIN_H, vh - GAP * 2));
    let w = drag.startSize.w;
    let h = drag.startSize.h;
    if (dir.includes('e')) w = drag.startSize.w + dx;
    if (dir.includes('s')) h = drag.startSize.h + dy;
    if (dir.includes('w')) w = drag.startSize.w - dx;
    if (dir.includes('n')) h = drag.startSize.h - dy;
    w = clamp(w, MIN_W, maxW);
    h = clamp(h, MIN_H, maxH);

    // West/north drags move the origin so the opposite edge stays pinned.
    let x = drag.startPos.x + (dir.includes('w') ? drag.startSize.w - w : 0);
    let y = drag.startPos.y + (dir.includes('n') ? drag.startSize.h - h : 0);
    x = clamp(x, GAP, Math.max(GAP, vw - w - GAP));
    y = clamp(y, GAP, Math.max(GAP, vh - h - GAP));

    setSize({ w, h });
    setPos({ x, y });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startDrag = useCallback((kind: 'move' | ResizeDir, event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!pos) return;
    dragRef.current = { kind, startX: event.clientX, startY: event.clientY, startPos: pos, startSize: size };
    try { document.body.style.userSelect = 'none'; } catch {}
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', endDrag);
  }, [pos, size, onDragMove, endDrag]);

  useEffect(() => () => {
    try { window.removeEventListener('pointermove', onDragMove); } catch {}
    try { window.removeEventListener('pointerup', endDrag); } catch {}
  }, [onDragMove, endDrag]);

  // --- Messages ------------------------------------------------------------
  useEffect(() => {
    if (!projectId) { setMessages([]); return; }
    let cancelled = false;
    const fetchMessages = async () => {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(`/api/projects/${projectId}/chat`, { credentials: 'include', signal: ctrl.signal });
        clearTimeout(tid);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setMessages((data.messages || []).map((m: any) => ({
          id: String(m.id),
          text: m.message,
          authorName: m.authorName,
          authorId: m.userId,
          createdAt: m.createdAt,
          attachmentUrl: m.attachmentUrl ?? null,
          attachmentName: m.attachmentName ?? null,
          attachmentType: m.attachmentType ?? null,
          attachmentSize: m.attachmentSize ?? null,
          linkedType: m.linkedType ?? null,
          linkedId: m.linkedId ?? null,
          linkedTitle: m.linkedTitle ?? null,
          linkedColumn: m.linkedColumn ?? null,
        })));
      } catch {}
    };
    fetchMessages();
    const interval = setInterval(() => { if (!document.hidden) fetchMessages(); }, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [projectId]);

  // Only autoscroll when the reader is already near the bottom, so polling every
  // few seconds doesn't yank them back down while they read history.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance < 220) bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Close the link picker on outside clicks.
  useEffect(() => {
    if (!linkPickerOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (linkPickerRef.current?.contains(event.target as Node)) return;
      setLinkPickerOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [linkPickerOpen]);

  const canSend = Boolean(input.trim() || file) && !sending && Boolean(projectId);

  const handleSend = async () => {
    if (!canSend || !projectId) return;
    setSending(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append('message', input.trim());
      if (file) form.append('file', file);
      if (link) {
        form.append('linkedType', link.type);
        form.append('linkedId', String(link.id));
        form.append('linkedTitle', link.title);
        form.append('linkedColumn', link.column || '');
      }
      const res = await fetch(`/api/projects/${projectId}/chat`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setUploadError(data.message || data.error || 'Could not send message.');
        return;
      }
      const data = await res.json();
      const m = data.message;
      setMessages(prev => [...prev, {
        id: String(m.id),
        text: m.message,
        authorName: m.authorName,
        authorId: m.userId,
        createdAt: m.createdAt,
        attachmentUrl: m.attachmentUrl ?? null,
        attachmentName: m.attachmentName ?? null,
        attachmentType: m.attachmentType ?? null,
        attachmentSize: m.attachmentSize ?? null,
        linkedType: m.linkedType ?? null,
        linkedId: m.linkedId ?? null,
        linkedTitle: m.linkedTitle ?? null,
        linkedColumn: m.linkedColumn ?? null,
      }]);
      setInput('');
      setFile(null);
      setPreviewUrl(null);
      setLink(null);
      setLinkPickerOpen(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch {
      setUploadError('Could not send message. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0] || null;
    if (!picked) return;
    if (picked.size > 25 * 1024 * 1024) {
      setUploadError('File too large. Max 25MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setUploadError(null);
    setFile(picked);
  };

  const clearFile = () => {
    setFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const linkSource = linkTab === 'task' ? tasks : notes;
  const filteredLinkSource = useMemo(() => {
    const query = linkSearch.trim().toLowerCase();
    if (!query) return linkSource.slice(0, 60);
    return linkSource.filter(item => item.title.toLowerCase().includes(query)).slice(0, 60);
  }, [linkSource, linkSearch]);

  const openLinkedItem = (msg: ConversationMessage) => {
    if (!msg.linkedId) return;
    if (msg.linkedType === 'note') onOpenNote?.(msg.linkedId);
    else onOpenTask?.(msg.linkedId);
  };

  const header = (
    <div
      className={cn(
        'flex items-center justify-between gap-2 px-4 py-3 border-b border-border flex-shrink-0',
        isFloating && 'cursor-grab active:cursor-grabbing touch-none select-none',
      )}
      onPointerDown={isFloating ? event => startDrag('move', event) : undefined}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <MessageCircle className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground truncate">Project Chat</h3>
          <p className="text-xs text-muted-foreground truncate">
            {projectName} · {messages.length} {messages.length === 1 ? 'message' : 'messages'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0" onPointerDown={event => event.stopPropagation()}>
        {onInvite && (
          <button
            onClick={onInvite}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
          >
            <Share2 className="h-3.5 w-3.5" />
            Invite
          </button>
        )}
        {onModeChange && (
          <button
            onClick={() => onModeChange(mode === 'docked' ? 'floating' : 'docked')}
            title={mode === 'docked' ? 'Float the chat window' : 'Dock the chat to the side'}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            {mode === 'docked' ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </button>
        )}
        {onClose && (
          <button onClick={onClose} title="Close chat" className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );

  const messageList = (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-10">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
            <MessageCircle className="w-7 h-7 text-muted-foreground/50" />
          </div>
          <p className="text-sm font-medium text-foreground">No messages yet</p>
          <p className="text-xs text-muted-foreground max-w-xs">Start the conversation with your project team. Share updates, ask questions, or leave notes.</p>
        </div>
      ) : (
        messages.map(msg => {
          const isMe = msg.authorId === currentUserId;
          const hasAttachment = Boolean(msg.attachmentUrl && msg.attachmentName);
          const hasLink = Boolean(msg.linkedType && msg.linkedTitle);
          return (
            <div key={msg.id} className={`flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}>
              <span className="text-[10px] text-muted-foreground px-1">{msg.authorName}</span>
              <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed break-words ${
                isMe ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted text-foreground rounded-tl-sm'
              }`}>
                {msg.text && <div className="whitespace-pre-wrap break-words">{msg.text}</div>}

                {hasLink && (
                  <button
                    onClick={() => openLinkedItem(msg)}
                    title={msg.linkedTitle ? `Open ${msg.linkedType}: ${msg.linkedTitle}` : 'Open linked item'}
                    className={cn(
                      'mt-1.5 flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left transition-colors',
                      isMe ? 'bg-white/15 hover:bg-white/25' : 'bg-background border border-border hover:bg-muted',
                    )}
                  >
                    {msg.linkedType === 'note'
                      ? <StickyNote className="h-3.5 w-3.5 flex-shrink-0 opacity-80" />
                      : <CheckSquare className="h-3.5 w-3.5 flex-shrink-0 opacity-80" />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10px] uppercase tracking-wide opacity-70">{msg.linkedType}</span>
                      <span className="block text-xs font-semibold truncate">{msg.linkedTitle}</span>
                    </span>
                    {msg.linkedColumn && <span className="text-[10px] opacity-70 flex-shrink-0">{msg.linkedColumn}</span>}
                  </button>
                )}

                {hasAttachment && (
                  <div className="mt-1.5">
                    {isImageMessage(msg) ? (
                      <div className="block">
                        <button onClick={() => setLightbox({ url: msg.attachmentUrl!, name: msg.attachmentName || 'image' })} className="block text-left">
                          <img
                            src={msg.attachmentUrl!}
                            alt={msg.attachmentName || 'image'}
                            loading="eager"
                            decoding="async"
                            // Eager on purpose: a lazy img inside this fixed/overflow-hidden
                            // panel is never intersected, so shared images silently never
                            // load. The chat caps at 200 messages, so the cost is small.
                            className="min-h-[64px] min-w-[48px] max-w-[280px] max-h-[320px] rounded-xl border border-black/10 object-contain bg-black/5 cursor-zoom-in hover:opacity-90 transition-opacity"
                          />
                        </button>
                        <span className="text-[11px] opacity-75 flex items-center gap-1 mt-1">
                          <ImageIcon className="w-3 h-3" />
                          {msg.attachmentName}{msg.attachmentSize ? ` (${formatBytes(msg.attachmentSize)})` : ''}
                        </span>
                      </div>
                    ) : (
                      <a
                        href={msg.attachmentUrl!}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={msg.attachmentName || undefined}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors',
                          isMe ? 'bg-white/15 hover:bg-white/25' : 'bg-background border border-border hover:bg-muted',
                        )}
                      >
                        <FileText className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{msg.attachmentName}</span>
                        {msg.attachmentSize ? <span className="opacity-70 flex-shrink-0">{formatBytes(msg.attachmentSize)}</span> : null}
                        <Download className="h-3.5 w-3.5 ml-auto flex-shrink-0" />
                      </a>
                    )}
                  </div>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground px-1">
                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {' · '}
                {new Date(msg.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
              </span>
            </div>
          );
        })
      )}
      <div ref={bottomRef} />
    </div>
  );

  const composer = (
    <div className="p-3 border-t border-border flex-shrink-0">
      {(file || link) && (
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {file && (
            <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-xl px-2.5 py-1.5 max-w-full">
              {previewUrl ? (
                <img src={previewUrl} alt="preview" loading="lazy" decoding="async" className="w-9 h-9 rounded-lg object-cover border border-border flex-shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-medium truncate max-w-[160px]">{file.name}</p>
                <p className="text-[10px] text-muted-foreground">{formatBytes(file.size)}</p>
              </div>
              <button onClick={clearFile} className="p-1 hover:bg-muted rounded-lg flex-shrink-0" title="Remove attachment">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          )}
          {link && (
            <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 rounded-xl px-2.5 py-1.5">
              {link.type === 'note' ? <StickyNote className="h-3.5 w-3.5 text-primary flex-shrink-0" /> : <CheckSquare className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-primary/80">{link.type}</p>
                <p className="text-xs font-medium truncate max-w-[160px]">{link.title}</p>
              </div>
              <button onClick={() => setLink(null)} className="p-1 hover:bg-muted/60 rounded-lg flex-shrink-0" title="Remove link">
                <X className="h-3.5 w-3.5 text-primary" />
              </button>
            </div>
          )}
        </div>
      )}

      {uploadError && (
        <p className="mb-2 text-[11px] text-destructive">{uploadError}</p>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.txt,.csv,.md,.zip,.doc,.docx,.xls,.xlsx"
          className="hidden"
          onChange={handleFileSelect}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={sending}
          title="Attach an image or file"
          className="p-2.5 bg-muted border border-border rounded-2xl hover:bg-muted/70 transition-colors flex-shrink-0 disabled:opacity-50"
        >
          <Paperclip className="h-4 w-4 text-muted-foreground" />
        </button>

        <div className="relative flex-shrink-0" ref={linkPickerRef}>
          <button
            onClick={() => setLinkPickerOpen(open => !open)}
            disabled={sending}
            title="Link a task or note to this message"
            className={cn(
              'p-2.5 border rounded-2xl transition-colors disabled:opacity-50',
              link ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-muted border-border hover:bg-muted/70 text-muted-foreground',
            )}
          >
            <Link2 className="h-4 w-4" />
          </button>

          {linkPickerOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-[300px] max-w-[calc(100vw-48px)] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden z-30">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                <div className="flex items-center gap-1 rounded-xl bg-muted/60 p-0.5">
                  {(['task', 'note'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => { setLinkTab(tab); setLinkSearch(''); }}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors',
                        linkTab === tab ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {tab === 'task' ? <CheckSquare className="h-3 w-3" /> : <StickyNote className="h-3 w-3" />}
                      {tab === 'task' ? 'Tasks' : 'Notes'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                <Search className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <input
                  autoFocus
                  value={linkSearch}
                  onChange={event => setLinkSearch(event.target.value)}
                  placeholder={linkTab === 'task' ? 'Search tasks…' : 'Search notes…'}
                  className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                />
              </div>
              <div className="max-h-56 overflow-y-auto p-1.5">
                {filteredLinkSource.length === 0 ? (
                  <p className="px-2.5 py-4 text-center text-[11px] text-muted-foreground">
                    {linkTab === 'task' ? 'No tasks in this project yet.' : 'No notes in this project yet.'}
                  </p>
                ) : (
                  filteredLinkSource.map(item => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setLink({ type: linkTab, id: String(item.id), title: item.title, column: item.columnName });
                        setLinkPickerOpen(false);
                        setLinkSearch('');
                      }}
                      className={cn(
                        'w-full flex items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-muted',
                        link?.id === String(item.id) && link.type === linkTab && 'bg-muted',
                      )}
                    >
                      {linkTab === 'task'
                        ? <CheckSquare className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        : <StickyNote className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-medium truncate">{item.title}</span>
                        {item.columnName ? <span className="block text-[10px] text-muted-foreground truncate">{item.columnName}</span> : null}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <textarea
          value={input}
          onChange={event => setInput(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSend(); }
          }}
          placeholder="Type a message…"
          rows={1}
          className="flex-1 bg-muted/50 border border-border rounded-2xl px-4 py-2.5 text-sm resize-none outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-colors"
          style={{ minHeight: 40, maxHeight: 120 }}
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="p-2.5 bg-primary text-primary-foreground rounded-2xl hover:opacity-90 transition-all disabled:opacity-40 flex-shrink-0"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground mt-2 text-center">Messages are shared with all project members.</p>
    </div>
  );

  const lightboxOverlay = lightbox ? (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setLightbox(null)}>
      <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center" onClick={event => event.stopPropagation()}>
        <button onClick={() => setLightbox(null)} className="absolute -top-2 -right-2 p-2 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-md transition-colors">
          <X className="h-5 w-5 text-white" />
        </button>
        <img src={lightbox.url} alt={lightbox.name} loading="lazy" decoding="async" className="max-w-[90vw] max-h-[85vh] rounded-xl object-contain shadow-2xl" />
        <span className="text-sm text-white/80 mt-3">{lightbox.name}</span>
      </div>
    </div>
  ) : null;

  // Resize affordances for the floating window: corners + edges.
  const resizeHandles = isFloating && pos ? (
    <>
      {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as ResizeDir[]).map(dir => (
        <div
          key={dir}
          onPointerDown={event => startDrag(dir, event)}
          className={cn(
            'absolute z-10 touch-none',
            dir === 'n' && 'top-0 left-3 right-3 h-1.5 cursor-ns-resize',
            dir === 's' && 'bottom-0 left-3 right-3 h-1.5 cursor-ns-resize',
            dir === 'e' && 'right-0 top-3 bottom-3 w-1.5 cursor-ew-resize',
            dir === 'w' && 'left-0 top-3 bottom-3 w-1.5 cursor-ew-resize',
            dir === 'nw' && 'top-0 left-0 w-4 h-4 cursor-nwse-resize',
            dir === 'se' && 'bottom-0 right-0 w-4 h-4 cursor-nwse-resize',
            dir === 'ne' && 'top-0 right-0 w-4 h-4 cursor-nesw-resize',
            dir === 'sw' && 'bottom-0 left-0 w-4 h-4 cursor-nesw-resize',
          )}
        />
      ))}
    </>
  ) : null;

  if (mode === 'floating') {
    return (
      <>
        <div
          className="fixed z-50 bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden
            max-md:!left-3 max-md:!right-3 max-md:!top-auto max-md:!bottom-3 max-md:!w-auto max-md:!h-[72vh]"
          style={{
            left: pos?.x ?? undefined,
            top: pos?.y ?? undefined,
            width: size.w,
            height: size.h,
            maxWidth: 'calc(100vw - 24px)',
            maxHeight: 'calc(100vh - 24px)',
          }}
          role="dialog"
          aria-label={`${projectName} conversation`}
        >
          {resizeHandles}
          {header}
          {messageList}
          {composer}
        </div>
        {lightboxOverlay}
      </>
    );
  }

  if (mode === 'docked') {
    return (
      <aside className="h-full w-full min-w-0 flex flex-col bg-card border-l border-border">
        {header}
        {messageList}
        {composer}
        {lightboxOverlay}
      </aside>
    );
  }

  return (
    <div className="rounded-3xl border border-border bg-card shadow-sm flex flex-col" style={{ height: 'calc(100vh - 280px)', minHeight: 400 }}>
      {header}
      {messageList}
      {composer}
      {lightboxOverlay}
    </div>
  );
};

export default ProjectConversation;