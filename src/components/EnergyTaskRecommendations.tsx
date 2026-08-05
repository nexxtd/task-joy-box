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

  const getEnergyFill = (level: string) => {
    switch (level) {
      case 'high': return { background: 'hsl(var(--label-green))', color: '#ffffff' };
      case 'medium': return { background: 'hsl(var(--label-yellow))', color: '#2c2c1c' };
      case 'low': return { background: 'hsl(var(--label-red))', color: '#ffffff' };
      default: return { background: 'hsl(var(--label-blue))', color: '#ffffff' };
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

  const getPriorityFill = (priority: string) => {
    switch (priority) {
      case 'urgent': return { background: 'hsl(var(--priority-urgent))', color: '#ffffff' };
      case 'high': return { background: 'hsl(var(--priority-high))', color: '#ffffff' };
      case 'low': return { background: 'hsl(var(--priority-low))', color: '#ffffff' };
      default: return { background: 'hsl(var(--priority-medium))', color: '#2c2c1c' };
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-amber-50/70 via-orange-50/40 to-amber-50/30 p-4 rounded-2xl border border-orange-200/40 shadow-[0_8px_24px_-18px_hsl(25_85%_52%/0.3)]">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400/90 to-orange-500/90 flex items-center justify-center shadow-sm">
            <Zap className="w-4 h-4 text-white" />
          </div>
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
                  className="p-3 bg-white/70 border border-amber-200/40 rounded-xl shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-foreground truncate">{task.title}</h4>
                      <div className="flex items-center gap-3 mt-1">
                        <span
                          className="text-[10px] font-bold uppercase px-2 py-1 rounded-full text-primary-foreground"
                          style={getPriorityFill(task.priority || 'medium')}
                        >
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
                    <div className="mt-2 pt-2 border-t border-amber-200/30">
                      <div className="flex flex-wrap gap-1">
                        {timeBlocks.map((block, idx) => (
                          <span 
                            key={idx} 
                            className="text-xs px-2.5 py-1 rounded-full font-medium text-white"
                            style={getEnergyFill(block.energyLevel)}
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
              <div className="w-10 h-10 rounded-full bg-orange-200/40 flex items-center justify-center mx-auto mb-2">
                <TrendingUp className="w-5 h-5 text-orange-500/80" />
              </div>
              <p className="text-sm text-muted-foreground">No tasks to recommend</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Add tasks to get personalized recommendations</p>
            </div>
          )}
        </div>
      </div>
      
      <div className="bg-gradient-to-br from-teal-50/60 to-emerald-50/40 p-4 rounded-2xl border border-teal-200/40 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-teal-400/90 to-emerald-500/90 flex items-center justify-center shadow-sm">
            <Calendar className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-semibold text-foreground">Your Peak Hours</h3>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {peakHours.length > 0 ? (
            peakHours.map((hour, idx) => (
              <div 
                key={idx} 
                className="flex items-center gap-1.5 px-3 py-1.5 text-white text-xs font-bold rounded-lg shadow-sm"
                style={{ background: 'hsl(var(--label-green))' }}
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