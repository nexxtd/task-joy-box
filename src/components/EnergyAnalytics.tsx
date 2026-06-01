import React, { useState, useEffect } from 'react';
import { Zap, TrendingUp, Calendar, BarChart3, Clock, Sun, Moon, Coffee } from 'lucide-react';

interface EnergyEntry {
  date: string;
  morning: 'low' | 'medium' | 'high';
  afternoon: 'low' | 'medium' | 'high';
  evening: 'low' | 'medium' | 'high';
  note: string;
}

const STORAGE_KEY = 'energy_history';

const EnergyAnalytics: React.FC = () => {
  const [energyData, setEnergyData] = useState<EnergyEntry[]>([]);
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'quarter'>('week');
  const [avgEnergy, setAvgEnergy] = useState<{morning: number; afternoon: number; evening: number}>({morning: 0, afternoon: 0, evening: 0});

  useEffect(() => {
    // Load energy history from localStorage
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed: EnergyEntry[] = JSON.parse(raw);
        setEnergyData(parsed);
      } catch (error) {
        console.error('Error parsing energy data:', error);
      }
    }
  }, []);

  useEffect(() => {
    // Calculate average energy levels
    if (energyData.length > 0) {
      const morningSum = energyData.reduce((sum, entry) => sum + getNumericValue(entry.morning), 0);
      const afternoonSum = energyData.reduce((sum, entry) => sum + getNumericValue(entry.afternoon), 0);
      const eveningSum = energyData.reduce((sum, entry) => sum + getNumericValue(entry.evening), 0);
      
      setAvgEnergy({
        morning: parseFloat((morningSum / energyData.length).toFixed(1)),
        afternoon: parseFloat((afternoonSum / energyData.length).toFixed(1)),
        evening: parseFloat((eveningSum / energyData.length).toFixed(1))
      });
    }
  }, [energyData]);

  const getNumericValue = (level: 'low' | 'medium' | 'high'): number => {
    switch (level) {
      case 'low': return 1;
      case 'medium': return 2;
      case 'high': return 3;
      default: return 0;
    }
  };

  const getLevelLabel = (value: number): string => {
    if (value >= 2.5) return 'High';
    if (value >= 1.5) return 'Medium';
    return 'Low';
  };

  const getLevelColor = (value: number): string => {
    if (value >= 2.5) return 'text-green-500';
    if (value >= 1.5) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getLevelBg = (value: number): string => {
    if (value >= 2.5) return 'bg-green-500';
    if (value >= 1.5) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  // Prepare data for chart
  const chartData = energyData.map(entry => ({
    date: new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    morning: getNumericValue(entry.morning),
    afternoon: getNumericValue(entry.afternoon),
    evening: getNumericValue(entry.evening),
    avg: (getNumericValue(entry.morning) + getNumericValue(entry.afternoon) + getNumericValue(entry.evening)) / 3
  }));

  // Get recent data based on time range
  const getFilteredData = () => {
    const now = new Date();
    let cutoffDate = new Date(now);

    switch (timeRange) {
      case 'week':
        cutoffDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        cutoffDate.setMonth(now.getMonth() - 1);
        break;
      case 'quarter':
        cutoffDate.setMonth(now.getMonth() - 3);
        break;
    }

    return chartData.filter(item => new Date(`2026 ${item.date}`) >= cutoffDate);
  };

  const filteredData = getFilteredData();

  // Get most recent entries for detailed view
  const recentEntries = [...energyData].reverse().slice(0, 7);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-primary/5 to-accent/5 p-5 rounded-2xl border border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Energy Analytics
          </h2>
          <div className="flex gap-2">
            <button 
              onClick={() => setTimeRange('week')}
              className={`px-3 py-1.5 text-xs rounded-lg ${timeRange === 'week' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
            >
              Week
            </button>
            <button 
              onClick={() => setTimeRange('month')}
              className={`px-3 py-1.5 text-xs rounded-lg ${timeRange === 'month' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
            >
              Month
            </button>
            <button 
              onClick={() => setTimeRange('quarter')}
              className={`px-3 py-1.5 text-xs rounded-lg ${timeRange === 'quarter' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
            >
              Quarter
            </button>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Track your energy patterns over time and optimize your productivity
        </p>

        {/* Average Energy Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <div className="flex items-center justify-center mx-auto mb-2">
              <Sun className="w-5 h-5 text-yellow-500" />
            </div>
            <p className="text-xs text-muted-foreground mb-1">Morning</p>
            <p className={`text-xl font-bold ${getLevelColor(avgEnergy.morning)}`}>
              {getLevelLabel(avgEnergy.morning)}
            </p>
            <p className="text-xs text-muted-foreground">Avg: {avgEnergy.morning}/3</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <div className="flex items-center justify-center mx-auto mb-2">
              <Coffee className="w-5 h-5 text-amber-500" />
            </div>
            <p className="text-xs text-muted-foreground mb-1">Afternoon</p>
            <p className={`text-xl font-bold ${getLevelColor(avgEnergy.afternoon)}`}>
              {getLevelLabel(avgEnergy.afternoon)}
            </p>
            <p className="text-xs text-muted-foreground">Avg: {avgEnergy.afternoon}/3</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <div className="flex items-center justify-center mx-auto mb-2">
              <Moon className="w-5 h-5 text-blue-500" />
            </div>
            <p className="text-xs text-muted-foreground mb-1">Evening</p>
            <p className={`text-xl font-bold ${getLevelColor(avgEnergy.evening)}`}>
              {getLevelLabel(avgEnergy.evening)}
            </p>
            <p className="text-xs text-muted-foreground">Avg: {avgEnergy.evening}/3</p>
          </div>
        </div>

        {/* Simplified Chart Visualization */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-foreground mb-3">Energy Pattern Over Time</h3>
          <div className="space-y-3">
            {filteredData.slice(-7).map((entry, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-xs w-12 text-muted-foreground">{entry.date}</span>
                <div className="flex-1 flex items-center gap-1">
                  {/* Morning */}
                  <div className="flex flex-col items-center w-1/3">
                    <div className="text-[8px] text-muted-foreground mb-1">M</div>
                    <div className="w-4 h-4 rounded-full" style={{backgroundColor: getLevelColor(entry.morning).replace('text-', '')}} />
                  </div>
                  {/* Afternoon */}
                  <div className="flex flex-col items-center w-1/3">
                    <div className="text-[8px] text-muted-foreground mb-1">A</div>
                    <div className="w-4 h-4 rounded-full" style={{backgroundColor: getLevelColor(entry.afternoon).replace('text-', '')}} />
                  </div>
                  {/* Evening */}
                  <div className="flex flex-col items-center w-1/3">
                    <div className="text-[8px] text-muted-foreground mb-1">E</div>
                    <div className="w-4 h-4 rounded-full" style={{backgroundColor: getLevelColor(entry.evening).replace('text-', '')}} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Entries */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Recent Energy Logs
        </h3>
        
        <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
          {recentEntries.length > 0 ? (
            recentEntries.map((entry, idx) => (
              <div key={idx} className="p-3 bg-muted/30 rounded-lg border border-border">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-foreground">
                    {new Date(entry.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                  {entry.note && (
                    <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full">
                      Note
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 flex flex-col items-center">
                    <span className="text-xs text-muted-foreground">Morning</span>
                    <div className={`w-5 h-5 rounded-full mx-auto mt-1 ${getLevelBg(getNumericValue(entry.morning))}`} />
                    <span className="text-xs mt-1 capitalize">{entry.morning}</span>
                  </div>
                  <div className="flex-1 flex flex-col items-center">
                    <span className="text-xs text-muted-foreground">Afternoon</span>
                    <div className={`w-5 h-5 rounded-full mx-auto mt-1 ${getLevelBg(getNumericValue(entry.afternoon))}`} />
                    <span className="text-xs mt-1 capitalize">{entry.afternoon}</span>
                  </div>
                  <div className="flex-1 flex flex-col items-center">
                    <span className="text-xs text-muted-foreground">Evening</span>
                    <div className={`w-5 h-5 rounded-full mx-auto mt-1 ${getLevelBg(getNumericValue(entry.evening))}`} />
                    <span className="text-xs mt-1 capitalize">{entry.evening}</span>
                  </div>
                </div>
                {entry.note && (
                  <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">
                    "{entry.note}"
                  </p>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-6">
              <Zap className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No energy logs recorded yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Your energy logs will appear here</p>
            </div>
          )}
        </div>
      </div>

      {/* Insights */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          Productivity Insights
        </h3>
        
        <div className="space-y-3">
          <div className="p-3 bg-muted/30 rounded-lg">
            <p className="text-sm font-medium text-foreground">Peak Energy Times</p>
            <p className="text-xs text-muted-foreground mt-1">
              Your highest energy levels occur during {avgEnergy.afternoon >= 2.5 ? 'the afternoon' : 
              avgEnergy.morning >= 2.5 ? 'the morning' : 'evening hours'}. Schedule your most challenging tasks during these periods.
            </p>
          </div>
          
          <div className="p-3 bg-muted/30 rounded-lg">
            <p className="text-sm font-medium text-foreground">Energy Consistency</p>
            <p className="text-xs text-muted-foreground mt-1">
              {Math.abs(avgEnergy.morning - avgEnergy.evening) > 1 
                ? 'Your energy varies significantly throughout the day. Consider planning accordingly.'
                : 'Your energy remains relatively consistent throughout the day.'}
            </p>
          </div>
          
          <div className="p-3 bg-muted/30 rounded-lg">
            <p className="text-sm font-medium text-foreground">Optimization Tip</p>
            <p className="text-xs text-muted-foreground mt-1">
              Match your task complexity with your energy levels. Tackle high-priority tasks during your peak energy times.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnergyAnalytics;