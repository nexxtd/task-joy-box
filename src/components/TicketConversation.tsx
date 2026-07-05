import React, { useEffect, useRef, useState } from 'react';
import { X, Send, Loader2, User } from 'lucide-react';
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
  onSendMessage: (text: string) => Promise<void>;
  onUserNameClick?: () => void;
  sending?: boolean;
  leftPanel?: React.ReactNode;
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
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    setInput('');
    await onSendMessage(trimmed);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isClosed = ticket.status === 'closed';

  const isCurrentUserMessage = (msg: TicketMessage) =>
    viewAs === 'user' ? msg.senderType === 'user' : msg.senderType === 'staff';

  const headerLabel = viewAs === 'admin' ? ticket.userName || 'User' : 'Support Team';

  return (
    <div className="fixed bottom-4 right-4 z-50 flex gap-3" style={{ maxHeight: '85vh' }}>
      {leftPanel && (
        <div className="w-[520px] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {leftPanel}
        </div>
      )}
      <div className={`${leftPanel ? 'w-[420px]' : 'w-[400px]'} bg-card border border-border rounded-2xl shadow-2xl flex flex-col`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono text-muted-foreground flex-shrink-0">#{ticket.id}</span>
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0 ${TYPE_COLORS[ticket.type] || 'bg-muted text-muted-foreground'}`}>
            {ticket.type}
          </span>
          {viewAs === 'admin' && onUserNameClick ? (
            <button
              onClick={onUserNameClick}
              className="text-sm font-semibold text-primary hover:underline truncate"
            >
              {headerLabel}
            </button>
          ) : (
            <span className="text-sm font-semibold truncate">{headerLabel}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {viewAs === 'admin' && onCloseTicket && !isClosed && (
            <button
              onClick={onCloseTicket}
              className="text-xs px-2.5 py-1 bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors font-medium"
            >
              Close Ticket
            </button>
          )}
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="px-3 py-1.5 border-b border-border bg-muted/30 flex-shrink-0">
        <p className="text-xs text-muted-foreground truncate">{ticket.subject}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">No messages yet.</p>
        )}
        {messages.map(msg => {
          const isMe = isCurrentUserMessage(msg);
          return (
            <div key={msg.id} className={`flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground">{msg.senderName || (msg.senderType === 'staff' ? 'Support' : 'You')}</span>
              </div>
              <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${
                isMe
                  ? 'bg-primary text-primary-foreground rounded-tr-sm'
                  : 'bg-muted text-foreground rounded-tl-sm'
              }`}>
                {msg.message}
              </div>
              <span className="text-[10px] text-muted-foreground">
                {format(new Date(msg.createdAt), 'MMM d, HH:mm')}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-border flex-shrink-0">
        {isClosed ? (
          <p className="text-xs text-center text-muted-foreground py-1 italic">This ticket has been closed.</p>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Type a message…"
              rows={1}
              className="flex-1 bg-muted/50 border border-border rounded-xl px-3 py-2 text-sm resize-none outline-none focus:border-primary transition-colors"
              style={{ minHeight: 36, maxHeight: 100 }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="p-2 bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-all disabled:opacity-50 flex-shrink-0"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

export default TicketConversation;
