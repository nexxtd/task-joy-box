import { Task } from '@/types/board';

interface UserEnergySettings {
  energyMorning: 'low' | 'medium' | 'high';
  energyAfternoon: 'low' | 'medium' | 'high';
  energyEvening: 'low' | 'medium' | 'high';
}

interface EnergyTimeBlock {
  period: 'morning' | 'afternoon' | 'evening';
  startTime: string;
  endTime: string;
  energyLevel: 'low' | 'medium' | 'high';
}

/**
 * Determines the recommended time blocks for a task based on its priority
 * and the user's energy patterns
 */
export function getOptimalTimeBlocks(
  task: Task,
  energySettings: UserEnergySettings
): EnergyTimeBlock[] {
  const timeBlocks: EnergyTimeBlock[] = [
    {
      period: 'morning',
      startTime: '07:00',
      endTime: '12:00',
      energyLevel: energySettings.energyMorning,
    },
    {
      period: 'afternoon',
      startTime: '12:00',
      endTime: '17:00',
      energyLevel: energySettings.energyAfternoon,
    },
    {
      period: 'evening',
      startTime: '17:00',
      endTime: '22:00',
      energyLevel: energySettings.energyEvening,
    },
  ];

  // Determine task intensity based on priority
  const taskIntensity = getTaskIntensity(task.priority || 'medium');

  // Filter time blocks that match the task's intensity needs
  return timeBlocks.filter(block => {
    if (taskIntensity === 'high') {
      // High-intensity tasks need high energy periods
      return block.energyLevel === 'high';
    } else if (taskIntensity === 'medium') {
      // Medium-intensity tasks need medium or high energy periods
      return block.energyLevel === 'high' || block.energyLevel === 'medium';
    } else {
      // Low-intensity tasks can be done during any energy period
      return true;
    }
  });
}

/**
 * Maps task priority to required intensity level
 */
function getTaskIntensity(priority: string): 'low' | 'medium' | 'high' {
  switch (priority) {
    case 'urgent':
      return 'high';
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
      return 'low';
    default:
      return 'medium';
  }
}

/**
 * Ranks tasks by optimal timing based on energy levels
 */
export function rankTasksByOptimalTiming(
  tasks: Task[],
  energySettings: UserEnergySettings
): Task[] {
  return [...tasks].sort((a, b) => {
    const aTimeBlocks = getOptimalTimeBlocks(a, energySettings);
    const bTimeBlocks = getOptimalTimeBlocks(b, energySettings);

    // Prioritize tasks that have fewer optimal time slots
    if (aTimeBlocks.length !== bTimeBlocks.length) {
      return aTimeBlocks.length - bTimeBlocks.length;
    }

    // Then prioritize by task priority
    return getPriorityValue(b.priority) - getPriorityValue(a.priority);
  });
}

/**
 * Gets a numeric value for priority to assist with sorting
 */
function getPriorityValue(priority?: string): number {
  switch (priority) {
    case 'urgent':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 2;
  }
}

/**
 * Calculates the user's peak energy hours in a day
 */
export function getPeakEnergyHours(energySettings: UserEnergySettings): string[] {
  const peaks: string[] = [];

  if (energySettings.energyMorning === 'high') peaks.push('morning (07:00-12:00)');
  if (energySettings.energyAfternoon === 'high') peaks.push('afternoon (12:00-17:00)');
  if (energySettings.energyEvening === 'high') peaks.push('evening (17:00-22:00)');

  return peaks;
}

/**
 * Checks if a given time falls within a high energy period
 */
export function isHighEnergyTime(time: string, energySettings: UserEnergySettings): boolean {
  const hour = parseInt(time.split(':')[0], 10);
  
  if (hour >= 7 && hour < 12) {
    return energySettings.energyMorning === 'high';
  } else if (hour >= 12 && hour < 17) {
    return energySettings.energyAfternoon === 'high';
  } else if (hour >= 17 && hour < 22) {
    return energySettings.energyEvening === 'high';
  }
  
  return false;
}