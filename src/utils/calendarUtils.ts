import { format, addMinutes, parse, isBefore, isAfter, differenceInMinutes, startOfDay, endOfDay } from 'date-fns';
import { TimeBlock, CalendarDay, CalendarPreferences, CalendarWeek } from '@/types/calendar';
import { Task } from '@/types/board';

export const DEFAULT_CALENDAR_PREFERENCES: CalendarPreferences = {
  workDayStart: '09:00',
  workDayEnd: '17:00',
  breakDuration: {
    short: 5,
    long: 15,
    lunch: 30,
  },
  breakFrequency: 90, // minutes between breaks
  autoScheduleBreaks: true,
  focusBlockDuration: 25,
  bufferTime: 15,
  workingDays: [1, 2, 3, 4, 5], // Monday-Friday
};

export const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

export const minutesToTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

export const addMinutesToTime = (time: string, minutes: number): string => {
  const totalMinutes = timeToMinutes(time) + minutes;
  return minutesToTime(totalMinutes);
};

export const isTimeBetween = (time: string, start: string, end: string): boolean => {
  const timeMinutes = timeToMinutes(time);
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  return timeMinutes >= startMinutes && timeMinutes <= endMinutes;
};

export const calculateDuration = (startTime: string, endTime: string): number => {
  return timeToMinutes(endTime) - timeToMinutes(startTime);
};

export const createBreakBlock = (
  startTime: string,
  type: 'short' | 'long' | 'lunch',
  preferences: CalendarPreferences
): TimeBlock => {
  const duration = preferences.breakDuration[type];
  return {
    id: `break-${Date.now()}-${Math.random()}`,
    title: type === 'lunch' ? 'Lunch Break' : type === 'long' ? 'Long Break' : 'Short Break',
    type: 'break',
    startTime,
    endTime: addMinutesToTime(startTime, duration),
    date: '', // Will be set when used
    isBreak: true,
    breakType: type,
    autoScheduled: true,
  };
};

export const convertTaskToTimeBlock = (task: Task, date: string, startTime: string): TimeBlock => {
  const duration = task.duration || 60; // Default 1 hour
  return {
    id: `task-${task.id}`,
    taskId: task.id,
    title: task.title,
    type: 'task',
    startTime,
    endTime: addMinutesToTime(startTime, duration),
    date,
    color: task.color,
    completed: false,
    priority: task.priority,
    description: task.description,
  };
};

export const findAvailableTimeSlot = (
  existingBlocks: TimeBlock[],
  duration: number,
  preferences: CalendarPreferences,
  date: string
): { startTime: string; endTime: string } | null => {
  const workStart = timeToMinutes(preferences.workDayStart);
  const workEnd = timeToMinutes(preferences.workDayEnd);
  
  // Sort existing blocks by start time
  const sortedBlocks = existingBlocks
    .filter(block => !block.isBreak)
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  // Try to find a slot before the first block
  if (sortedBlocks.length === 0) {
    return {
      startTime: preferences.workDayStart,
      endTime: addMinutesToTime(preferences.workDayStart, duration),
    };
  }

  // Check if there's space before the first block
  const firstBlockStart = timeToMinutes(sortedBlocks[0].startTime);
  if (firstBlockStart - workStart >= duration) {
    return {
      startTime: preferences.workDayStart,
      endTime: addMinutesToTime(preferences.workDayStart, duration),
    };
  }

  // Check between blocks
  for (let i = 0; i < sortedBlocks.length - 1; i++) {
    const currentBlockEnd = timeToMinutes(sortedBlocks[i].endTime);
    const nextBlockStart = timeToMinutes(sortedBlocks[i + 1].startTime);
    const availableTime = nextBlockStart - currentBlockEnd - preferences.bufferTime;
    
    if (availableTime >= duration) {
      const startTime = minutesToTime(currentBlockEnd + preferences.bufferTime);
      return {
        startTime,
        endTime: addMinutesToTime(startTime, duration),
      };
    }
  }

  // Check after the last block
  const lastBlockEnd = timeToMinutes(sortedBlocks[sortedBlocks.length - 1].endTime);
  if (workEnd - lastBlockEnd >= duration) {
    const startTime = minutesToTime(lastBlockEnd + preferences.bufferTime);
    return {
      startTime,
      endTime: addMinutesToTime(startTime, duration),
    };
  }

  return null;
};

export const optimizeSchedule = (
  timeBlocks: TimeBlock[],
  preferences: CalendarPreferences
): TimeBlock[] => {
  const optimized = [...timeBlocks];
  
  // Sort by priority and duration
  const taskBlocks = optimized
    .filter(block => block.type === 'task')
    .sort((a, b) => {
      const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1, none: 0 };
      const aPriority = priorityOrder[a.priority || 'medium'];
      const bPriority = priorityOrder[b.priority || 'medium'];
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }
      
      // For same priority, schedule shorter tasks first
      const aDuration = calculateDuration(a.startTime, a.endTime);
      const bDuration = calculateDuration(b.startTime, b.endTime);
      return aDuration - bDuration;
    });

  // Remove existing task blocks to reschedule
  const nonTaskBlocks = optimized.filter(block => block.type !== 'task');
  
  // Reschedule tasks in optimized order
  const newTaskBlocks: TimeBlock[] = [];
  for (const task of taskBlocks) {
    const existingBlocks = [...nonTaskBlocks, ...newTaskBlocks];
    const slot = findAvailableTimeSlot(
      existingBlocks,
      calculateDuration(task.startTime, task.endTime),
      preferences,
      task.date
    );
    
    if (slot) {
      newTaskBlocks.push({
        ...task,
        startTime: slot.startTime,
        endTime: slot.endTime,
      });
    }
  }

  return [...nonTaskBlocks, ...newTaskBlocks].sort((a, b) => 
    timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
  );
};

export const generateBreakSchedule = (
  timeBlocks: TimeBlock[],
  preferences: CalendarPreferences,
  date: string
): TimeBlock[] => {
  if (!preferences.autoScheduleBreaks) return [];

  const breaks: TimeBlock[] = [];
  const workBlocks = timeBlocks.filter(block => block.type === 'task');
  
  // Sort work blocks by start time
  workBlocks.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  let lastBreakTime = timeToMinutes(preferences.workDayStart) - preferences.breakFrequency;
  
  for (const block of workBlocks) {
    const blockStart = timeToMinutes(block.startTime);
    const blockEnd = timeToMinutes(block.endTime);
    
    // Check if we need a break before this block
    if (blockStart - lastBreakTime >= preferences.breakFrequency) {
      const breakStartTime = Math.max(
        lastBreakTime + preferences.breakFrequency,
        blockStart - 15 // Don't schedule break too close to task start
      );
      
      if (breakStartTime < blockStart) {
        const breakType = blockStart - breakStartTime >= 30 ? 'long' : 'short';
        const breakBlock = createBreakBlock(
          minutesToTime(breakStartTime),
          breakType,
          preferences
        );
        breakBlock.date = date;
        breaks.push(breakBlock);
        lastBreakTime = breakStartTime;
      }
    }
    
    // Check if we need a lunch break (around noon)
    const noon = 12 * 60; // 12:00 in minutes
    if (blockStart <= noon && blockEnd > noon && lastBreakTime < noon - 60) {
      const lunchBreak = createBreakBlock('12:00', 'lunch', preferences);
      lunchBreak.date = date;
      breaks.push(lunchBreak);
      lastBreakTime = noon + preferences.breakDuration.lunch;
    }
  }

  return breaks;
};

export const calculateDayStats = (timeBlocks: TimeBlock[]): {
  totalWorkTime: number;
  totalBreakTime: number;
  focusScore: number;
} => {
  const workTime = timeBlocks
    .filter(block => block.type === 'task')
    .reduce((total, block) => total + calculateDuration(block.startTime, block.endTime), 0);

  const breakTime = timeBlocks
    .filter(block => block.type === 'break')
    .reduce((total, block) => total + calculateDuration(block.startTime, block.endTime), 0);

  // Calculate focus score based on work/break ratio and task completion
  const completedTasks = timeBlocks.filter(block => 
    block.type === 'task' && block.completed
  ).length;
  const totalTasks = timeBlocks.filter(block => block.type === 'task').length;
  
  const completionScore = totalTasks > 0 ? (completedTasks / totalTasks) * 50 : 0;
  const balanceScore = workTime > 0 ? Math.min(50, (workTime / (workTime + breakTime)) * 100) : 0;
  
  const focusScore = Math.round(completionScore + balanceScore);

  return {
    totalWorkTime: workTime,
    totalBreakTime: breakTime,
    focusScore,
  };
};
