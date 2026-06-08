import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, DropResult, Draggable } from '@hello-pangea/dnd';
import { Search, ChevronDown, MoreHorizontal, GripVertical, MessageCircle, Clock, User, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Ticket {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  type: 'support' | 'bug' | 'feature' | 'report';
  subject: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  createdAt: string;
  updatedAt: string;
  staffReplied: boolean;
  lastMessage?: string;
}

const TYPE_CONFIG: Record<Ticket['type'], { label: string; className: string }> = {
  support: { label: 'Support', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  bug: { label: 'Bug', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  feature: { label: 'Feature', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  report: { label: 'Report', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
};

const STATUS_CONFIG: Record<Ticket['status'], { label: string; className: string; icon: React.ElementType }> = {
  open: { label: 'Open', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: AlertCircle },
  in_progress: { label: 'In Progress', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: Clock },
  resolved: { label: 'Resolved', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle },
  closed: { label: 'Closed', className: 'bg-muted text-muted-foreground', icon: CheckCircle },
};

const TicketsPanel: React.FC = () => {
  const [searchValue, setSearchValue] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      const res = await fetch('/api/admin/tickets', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
      }
    } catch (err) {
      console.error('Failed to fetch tickets:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    
    const reordered = [...tickets];
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    setTickets(reordered);
  };

  const filteredTickets = tickets.filter(t => {
    const matchesSearch = !searchValue || 
      t.subject.toLowerCase().includes(searchValue.toLowerCase()) ||
      t.userName.toLowerCase().includes(searchValue.toLowerCase());
    const matchesCategory = category === 'all' || t.type === category;
    const matchesStatus = status === 'all' || t.status === status;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const stats = {
    open: tickets.filter(t => t.status === 'open').length,
    inProgress: tickets.filter(t => t.status === 'in_progress').length,
    resolved: tickets.filter(t => t.status === 'resolved').length,
    total: tickets.length,
  };

  const handleStatusChange = async (ticketId: number, newStatus: Ticket['status']) => {
    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });
      
      if (res.ok) {
        setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: newStatus } : t));
        toast({ title: 'Updated', description: 'Ticket status updated' });
      }
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to update ticket', variant: 'destructive' });
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-6 py-4 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold text-foreground">Support Tickets</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{stats.total} total tickets</span>
          </div>
        </div>
        
        {/* Stats badges */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
            <AlertCircle className="w-3.5 h-3.5" />
            <span className="text-xs font-bold">Open: {stats.open}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-xs font-bold">In Progress: {stats.inProgress}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
            <CheckCircle className="w-3.5 h-3.5" />
            <span className="text-xs font-bold">Resolved: {stats.resolved}</span>
          </div>
        </div>

        {/* Search and filters */}
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search tickets..."
              value={searchValue}
              onChange={e => setSearchValue(e.target.value)}
              className="w-full bg-muted/30 border border-border rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[150px] bg-muted/30 border border-border rounded-xl">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="support">Support</SelectItem>
              <SelectItem value="bug">Bug</SelectItem>
              <SelectItem value="feature">Feature</SelectItem>
              <SelectItem value="report">Report</SelectItem>
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[130px] bg-muted/30 border border-border rounded-xl">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="text-center py-16">
            <MessageCircle className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No tickets found</p>
          </div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="tickets" type="ticket">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-3">
                  {filteredTickets.map((ticket, index) => {
                    const typeCfg = TYPE_CONFIG[ticket.type];
                    const statusCfg = STATUS_CONFIG[ticket.status];
                    
                    return (
                      <Draggable key={ticket.id} draggableId={`ticket-${ticket.id}`} index={index}>
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            onClick={() => setSelectedTicket(ticket)}
                            className={cn(
                              "group bg-card border border-border rounded-2xl p-4 cursor-pointer transition-all hover:shadow-md hover:border-primary/20",
                              dragSnapshot.isDragging && "shadow-lg border-primary/30 bg-card/95"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <div {...dragProvided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-muted flex items-center justify-center">
                                <GripVertical className="w-4 h-4 text-muted-foreground/60" />
                              </div>
                              
                              <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full ${typeCfg.className}`}>
                                {typeCfg.label}
                              </span>
                              
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate">{ticket.subject}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <User className="w-3 h-3 text-muted-foreground" />
                                  <span className="text-xs text-muted-foreground">{ticket.userName}</span>
                                  <span className="text-[10px] text-muted-foreground/50">•</span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {new Date(ticket.createdAt).toLocaleDateString()}
                                  </span>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-2">
                                {ticket.staffReplied && (
                                  <span className="text-[10px] text-green-600 font-medium flex items-center gap-1">
                                    <MessageCircle className="w-3 h-3" />
                                    Replied
                                  </span>
                                )}
                                
                                <Select 
                                  value={ticket.status} 
                                  onValueChange={(v) => {
                                    event?.stopPropagation();
                                    handleStatusChange(ticket.id, v as Ticket['status']);
                                  }}
                                >
                                  <SelectTrigger className="w-[120px] h-7 text-[10px] bg-transparent border border-border rounded-lg">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="open">Open</SelectItem>
                                    <SelectItem value="in_progress">In Progress</SelectItem>
                                    <SelectItem value="resolved">Resolved</SelectItem>
                                    <SelectItem value="closed">Closed</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </div>
    </div>
  );
};

export default TicketsPanel;