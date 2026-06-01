import React, { useState, useEffect } from 'react';
import { Zap, Clock, Calendar, TrendingUp } from 'lucide-react';
import { Task } from '@/types/board';
import { getOptimalTimeBlocks, rankTasksByOptimalTiming, getPeakEnergyHours } from '@/utils/energyTaskScheduler';

interface EnergyTaskRecommendationsProps {
  tasks: Task[];
  energySettings: {
    energyMorning: 'low' | 'medium' | 'high';
    energyAfternoon: 'low' | 'medium' | 'high';
    energyEvening: 'low' | 'medium' | 'high';
  };
}

const EnergyTaskRecommendations: React.FC<EnergyTaskRecommendationsProps> = ({
  tasks,
  energySettings
}) => {
  const [recommendedTasks, setRecommendedTasks] = useState<Task[]>([]);
  const [peakHours, setPeakHours] = useState<string[]>([]);

  useEffect(() => {
    // Filter out completed tasks
    const incompleteTasks = tasks.filter(task => !task.completed);
    
    // Rank tasks by optimal timing
    const rankedTasks = rankTasksByOptimalTiming(incompleteTasks, energySettings);
    setRecommendedTasks(rankedTasks.slice(0, 5)); // Show top 5 recommendations
    
    // Get peak energy hours
    setPeakHours(getPeakEnergyHours(energySettings));
  }, [tasks, energySettings]);

  const getEnergyColor = (level: string) => {
    switch (level) {
      case 'high': return 'text-green-500';
      case 'medium': return 'text-yellow-500';
      case 'low': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'Urgent';
      case 'high': return 'High';
      case 'medium': return 'Medium';
      case 'low': return 'Low';
      default: return 'Medium';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'text-red-500';
      case 'high': return 'text-orange-500';
      case 'medium': return 'text-yellow-500';
      case 'low': return 'text-green-500';
      default: return 'text-gray-500';
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-primary/5 to-accent/5 p-4 rounded-2xl border border-border">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Energy-Aware Recommendations</h3>
        </div>
        
        <p className="text-sm text-muted-foreground mb-4">
          Tasks scheduled during your peak energy hours for maximum productivity
        </p>
        
        <div className="space-y-3">
          {recommendedTasks.length > 0 ? (
            recommendedTasks.map(task => {
              const timeBlocks = getOptimalTimeBlocks(task, energySettings);
              
              return (
                <div 
                  key={task.id} 
                  className="p-3 bg-card border border-border rounded-xl hover:shadow-sm transition-shadow"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-foreground truncate">{task.title}</h4>
                      <div className="flex items-center gap-3 mt-1">
                        <span className={`text-xs px-2 py-1 rounded-full border ${getPriorityColor(task.priority || 'medium')} border-current/20`}>
                          {getPriorityLabel(task.priority || 'medium')}
                        </span>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          <span>
                            {timeBlocks.length > 0 
                              ? `${timeBlocks.length} optimal time${timeBlocks.length > 1 ? 's' : ''}` 
                              : 'No optimal times'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {timeBlocks.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border/50">
                      <div className="flex flex-wrap gap-1">
                        {timeBlocks.map((block, idx) => (
                          <span 
                            key={idx} 
                            className={`text-xs px-2 py-1 rounded-full ${getEnergyColor(block.energyLevel)} bg-current/10 border border-current/20`}
                          >
                            {block.period} ({block.startTime}-{block.endTime})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="py-6 text-center">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-2">
                <TrendingUp className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No tasks to recommend</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Add tasks to get personalized recommendations</p>
            </div>
          )}
        </div>
      </div>
      
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-foreground">Your Peak Hours</h3>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {peakHours.length > 0 ? (
            peakHours.map((hour, idx) => (
              <div 
                key={idx} 
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 text-green-700 dark:text-green-300 text-xs font-medium rounded-lg border border-green-500/20"
              >
                <Zap className="w-3 h-3" />
                {hour}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No peak energy hours detected</p>
          )}
        </div>
        
        <p className="text-xs text-muted-foreground mt-3">
          Schedule high-priority tasks during these times for optimal performance
        </p>
      </div>
    </div>
  );
};

export default EnergyTaskRecommendations;