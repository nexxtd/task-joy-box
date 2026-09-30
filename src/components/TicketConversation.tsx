import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Send, Loader2, Paperclip, Download, Image as ImageIcon, FileText, MoveDiagonal } from 'lucide-react';
import { format } from 'date-fns';

export interface TicketMessage {
  id: number;
  ticketId: number;
  senderId: number;
  senderType: 'user' | 'staff';
  message: string;
  readByUser: boolean;
  readByStaff: boolean;
  createdAt: string;
  senderName: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentType?: string | null;
  attachmentSize?: number | null;
}

export interface TicketData {
  id: number;
  type: string;
  subject: string;
  status: string;
  staffReplied: boolean;
  createdAt: string;
  userId?: number;
  userName?: string;
}

interface Props {
  ticket: TicketData;
  messages: TicketMessage[];
  viewAs: 'user' | 'admin';
  currentUserName: string;
  onClose: () => void;
  onCloseTicket?: () => void;
  onSendMessage: (text: string, file?: File | null) => Promise<void>;
  onUserNameClick?: () => void;
  sending?: boolean;
  leftPanel?: React.ReactNode;
  /** @deprecated No longer used — full-page expand was removed. Kept for backward compat. */
  expanded?: boolean;
  /** @deprecated No longer used — full-page expand was removed. Kept for backward compat. */
  onToggleExpand?: () => void;
  /** @deprecated No longer used — all chats render as bottom-right modal. Kept for backward compat. */
  embedded?: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  suggestion: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  bug: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  report: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  support: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
};

export const TicketConversation: React.FC<Props> = ({
  ticket,
  messages,
  viewAs,
  currentUserName,
  onClose,
  onCloseTicket,
  onSendMessage,
  onUserNameClick,
  sending = false,
  leftPanel,
}) => {
  const [input, setInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Resizable bottom-right modal. Drag the top-left handle to resize.
  const [size, setSize] = useState({ w: 400, h: 560 });
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  const onResizeMove = useCallback((e: PointerEvent) => {
    const s = resizeRef.current;
    if (!s || typeof window === 'undefined') return;
    // Dragging top-left: moving left/up grows, right/down shrinks.
    const dw = s.startX - e.clientX;
    const dh = s.startY - e.clientY;
    const maxW = Math.min(860, window.innerWidth - 32);
    const maxH = Math.min(window.innerHeight - 32, 820);
    const w = Math.max(320, Math.min(maxW, s.startW + dw));
    const h = Math.max(380, Math.min(maxH, s.startH + dh));
    setSize({ w, h });
  }, []);

  const endResize = useCallback(() => {
    resizeRef.current = null;
    try { window.removeEventListener('pointermove', onResizeMove as any); } catch {}
    try { window.removeEventListener('pointerup', endResize as any); } catch {}
    try { document.body.style.userSelect = ''; } catch {}
  }, [onResizeMove]);

  const startResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, startW: size.w, startH: size.h };
    try { document.body.style.userSelect = 'none'; } catch {}
    window.addEventListener('pointermove', onResizeMove as any);
    window.addEventListener('pointerup', endResize as any);
  }, [size, onResizeMove, endResize]);

  useEffect(() => {
    return () => {
      try { window.removeEventListener('pointermove', onResizeMove as any); } catch {}
      try { window.removeEventListener('pointerup', endResize as any); } catch {}
    };
  }, [onResizeMove, endResize]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (selectedFile && selectedFile.type.startsWith('image/')) {
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [selectedFile]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if ((!trimmed && !selectedFile) || sending) return;
    const fileToSend = selectedFile;
    setInput('');
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    await onSendMessage(trimmed, fileToSend);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    if (f) {
      if (f.size > 25 * 1024 * 1024) {
        alert('File too large. Max 25MB');
        return;
      }
      setSelectedFile(f);
    }
  };

  const isImageAttachment = (msg: TicketMessage) => {
    const t = msg.attachmentType || '';
    const name = msg.attachmentName || '';
    return t.startsWith('image/') || /\.(jpe?g|png|gif|webp|svg)$/i.test(name);
  };

  const isClosed = ticket.status === 'closed';
  const isCurrentUserMessage = (msg: TicketMessage) =>
    viewAs === 'user' ? msg.senderType === 'user' : msg.senderType === 'staff';
  const headerLabel = viewAs === 'admin' ? ticket.userName || 'User' : 'Support Team';

  const conversationPanel = (
    <div
      className="bg-card border border-border rounded-2xl shadow-2xl flex flex-col min-h-0 overflow-hidden relative"
      style={{ width: leftPanel ? undefined : size.w, height: size.h, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 32px)' }}
    >
      {/* Resize handle — top left, drag to resize */}
      <button
        onPointerDown={startResize}
        title="Drag to resize"
        aria-label="Resize chat window"
        className="absolute top-1 left-1 z-10 p-1.5 rounded-lg hover:bg-muted cursor-nwse-resize text-muted-foreground hover:text-foreground transition-colors touch-none"
      >
        <MoveDiagonal className="w-3.5 h-3.5" />
      </button>
      <div className="flex items-center justify-between pl-8 pr-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono text-muted-foreground flex-shrink-0">#{ticket.id}</span>
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0 ${TYPE_COLORS[ticket.type] || 'bg-muted text-muted-foreground'}`}>{ticket.type}</span>
          {viewAs === 'admin' && onUserNameClick ? (
            <button onClick={onUserNameClick} className="text-sm font-semibold text-primary hover:underline truncate">{headerLabel}</button>
          ) : (
            <span className="text-sm font-semibold truncate">{headerLabel}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {viewAs === 'admin' && onCloseTicket && !isClosed && (
            <button onClick={onCloseTicket} className="text-xs px-2.5 py-1 bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors font-medium">Close Ticket</button>
          )}
          <button onClick={onClose} aria-label="Close chat" className="p-1 hover:bg-muted rounded-lg transition-colors"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
      </div>
      <div className="px-3 py-1.5 border-b border-border bg-muted/30 flex-shrink-0"><p className="text-xs text-muted-foreground truncate">{ticket.subject}</p></div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No messages yet.</p>}
        {messages.map(msg => {
          const isMe = isCurrentUserMessage(msg);
          return (
            <div key={msg.id} className={`flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}>
              <div className="flex items-center gap-1"><span className="text-[10px] text-muted-foreground">{msg.senderName || (msg.senderType === 'staff' ? 'Support' : 'You')}</span></div>
              <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${isMe ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted text-foreground rounded-tl-sm'}`}>
                {msg.message && <div className="whitespace-pre-wrap break-words">{msg.message}</div>}
                {msg.attachmentUrl && (
                  <div className="mt-2">
                    {isImageAttachment(msg) ? (
                      <div className="block">
                        <button onClick={() => setLightbox({ url: msg.attachmentUrl!, name: msg.attachmentName || 'image' })} className="block text-left">
                          <img src={msg.attachmentUrl} alt={msg.attachmentName || 'image'} loading="lazy" decoding="async" className="max-w-[260px] max-h-[300px] rounded-lg border border-white/20 object-contain bg-black/5 cursor-zoom-in hover:opacity-90 transition-opacity" />
                        </button>
                        <span className="text-[11px] opacity-80 flex items-center gap-1 mt-1"><ImageIcon className="w-3 h-3" />{msg.attachmentName} {msg.attachmentSize ? `(${(msg.attachmentSize / 1024).toFixed(1)}KB)` : ''}</span>
                      </div>
                    ) : (
                      <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer" download={msg.attachmentName || undefined} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${isMe ? 'bg-white/15 text-white hover:bg-white/20' : 'bg-background border border-border hover:bg-muted'} transition-colors`}>
                        <FileText className="w-4 h-4 flex-shrink-0" /><span className="truncate">{msg.attachmentName || 'File'}</span>{msg.attachmentSize && <span className="opacity-70">({(msg.attachmentSize / 1024).toFixed(1)}KB)</span>}<Download className="w-3.5 h-3.5 ml-auto flex-shrink-0" />
                      </a>
                    )}
                  </div>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground">{format(new Date(msg.createdAt), 'MMM d, HH:mm')}</span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="p-3 border-t border-border flex-shrink-0">
        {isClosed ? (
          <p className="text-xs text-center text-muted-foreground py-1 italic">This ticket has been closed.</p>
        ) : (
          <div className="space-y-2">
            {selectedFile && (
              <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-xl px-3 py-2">
                {previewUrl ? <img src={previewUrl} alt="preview" loading="lazy" decoding="async" className="w-10 h-10 rounded-lg object-cover border border-border" /> : <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center"><FileText className="w-5 h-5 text-muted-foreground" /></div>}
                <div className="min-w-0 flex-1"><p className="text-xs font-medium truncate">{selectedFile.name}</p><p className="text-[11px] text-muted-foreground">{(selectedFile.size / 1024).toFixed(1)}KB</p></div>
                <button onClick={() => { setSelectedFile(null); setPreviewUrl(null); if (fileInputRef.current) fileInputRef.current.value=''; }} className="p-1 hover:bg-muted rounded-lg"><X className="w-4 h-4 text-muted-foreground" /></button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <input ref={fileInputRef} type="file" accept="image/*,.pdf,.txt,.csv,.md,.zip,.doc,.docx" className="hidden" onChange={handleFileSelect} />
              <button onClick={() => fileInputRef.current?.click()} disabled={sending} className="p-2 bg-muted border border-border rounded-xl hover:bg-muted/80 transition-colors flex-shrink-0" title="Attach image or file"><Paperclip className="w-4 h-4 text-muted-foreground" /></button>
              <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey} placeholder="Type a message…" rows={1} className="flex-1 bg-muted/50 border border-border rounded-xl px-3 py-2 text-sm resize-none outline-none focus:border-primary transition-colors" style={{ minHeight: 36, maxHeight: 100 }} />
              <button onClick={handleSend} disabled={(!input.trim() && !selectedFile) || sending} className="p-2 bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-all disabled:opacity-50 flex-shrink-0">{sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const lightboxOverlay = lightbox ? (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setLightbox(null)}>
      <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
        <button onClick={() => setLightbox(null)} className="absolute -top-2 -right-2 p-2 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-md transition-colors">
          <X className="w-5 h-5 text-white" />
        </button>
        <img src={lightbox.url} alt={lightbox.name} loading="lazy" decoding="async" className="max-w-[90vw] max-h-[85vh] rounded-xl object-contain shadow-2xl" />
        <span className="text-sm text-white/80 mt-3">{lightbox.name}</span>
      </div>
    </div>
  ) : null;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const totalW = leftPanel ? Math.min(size.w + 420, vw - 32) : size.w;

  return (
    <>
      {/* Clicking outside the modal closes it */}
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div
        className="fixed bottom-4 right-4 z-50 flex gap-3 items-end"
        style={{ maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 32px)' }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label={`Ticket #${ticket.id} chat`}
      >
        {leftPanel && (
          <div
            className="hidden sm:flex bg-card border border-border rounded-2xl shadow-2xl flex-col overflow-hidden flex-shrink-0"
            style={{ width: 380, height: size.h, maxHeight: 'calc(100vh - 32px)' }}
          >
            {leftPanel}
          </div>
        )}
        <div style={{ width: leftPanel ? size.w : totalW, maxWidth: 'calc(100vw - 32px)' }} className="flex-shrink-0">
          {conversationPanel}
        </div>
      </div>
      {lightboxOverlay}
    </>
  );
};

export default TicketConversation;
