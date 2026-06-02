export interface TimeBlock {
  id: string;
  taskId?: string;
  title: string;
  type: 'task' | 'break' | 'meeting' | 'focus' | 'buffer';
  startTime: string; // HH:MM format
  endTime: string;   // HH:MM format
  date: string;     // YYYY-MM-DD format
  color?: string;
  completed?: boolean;
  priority?: 'low' | 'medium' | 'high' | 'urgent' | 'none';
  description?: string;
  isBreak?: boolean;
  breakType?: 'short' | 'long' | 'lunch';
  autoScheduled?: boolean;
}

export interface CalendarDay {
  date: string;
  timeBlocks: TimeBlock[];
  totalWorkTime: number; // in minutes
  totalBreakTime: number; // in minutes
  focusScore: number; // 0-100
  energyLevel?: 'low' | 'medium' | 'high';
}

export interface CalendarWeek {
  startDate: string;
  endDate: string;
  days: CalendarDay[];
  totalWorkTime: number;
  totalBreakTime: number;
  focusScore: number;
}

export interface CalendarMonth {
  year: number;
  month: number;
  weeks: CalendarWeek[];
  stats: {
    totalTasks: number;
    completedTasks: number;
    totalFocusTime: number;
    averageFocusScore: number;
  };
}

export interface CalendarPreferences {
  workDayStart: string; // HH:MM
  workDayEnd: string;   // HH:MM
  breakDuration: {
    short: number;  // minutes
    long: number;   // minutes
    lunch: number;  // minutes
  };
  breakFrequency: number; // minutes between breaks
  autoScheduleBreaks: boolean;
  focusBlockDuration: number; // minutes for focus sessions
  bufferTime: number; // minutes between tasks
  workingDays: number[]; // 0-6 (Sunday-Saturday)
}

export interface DragDropItem {
  type: 'task' | 'timeblock';
  id: string;
  data: any;
}

export type CalendarView = 'day' | 'week' | 'month';
export type TimeScale = '15min' | '30min' | '60min';
