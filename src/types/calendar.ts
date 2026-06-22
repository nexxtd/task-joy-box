export interface CalendarSlot {
  id: string;
  title: string;
  type: 'task' | 'goal' | 'habit' | 'fixed-event' | 'break';
  startTime: string;
  endTime: string;
  date: string;
  color: string;
  description?: string;
  icon?: string;
  recurrence?: 'daily' | 'weekly' | 'monthly' | null;
  linkedId?: string;
  linkedType?: 'task' | 'goal' | 'habit';
  linkedSubId?: string;
  linkedSubType?: 'subtask' | 'subgoal';
  duration: number;
}

export interface CalendarDay {
  date: string;
  slots: CalendarSlot[];
}

export interface CalendarWeek {
  startDate: string;
  days: CalendarDay[];
}

export interface DragPreview {
  visible: boolean;
  x: number;
  y: number;
  startTime: string;
  endTime: string;
  title: string;
  color: string;
}

export interface SchedulingPopupData {
  open: boolean;
  type: 'task' | 'goal' | 'habit' | 'fixed-event' | 'break' | null;
  date: string;
  startTime: string;
  endTime: string;
  linkedItem?: any;
}

export type CalendarViewMode = 'day' | 'week' | 'month';
export type TimeScale = '15min' | '30min' | '60min';
