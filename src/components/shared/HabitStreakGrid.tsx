import React from 'react';
import { useLanguage } from '@/context/LanguageContext';

interface HabitStreakGridProps {
  completedDays?: string[];
  daysToShow?: number;
}

export const HabitStreakGrid: React.FC<HabitStreakGridProps> = ({
  completedDays = [],
  daysToShow = 14,
}) => {
  const { t } = useLanguage();
  const dates: { dateStr: string; label: string; isCompleted: boolean; isToday: boolean }[] = [];
  const today = new Date();
  const completedSet = new Set(completedDays);

  for (let i = daysToShow - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const isToday = i === 0;
    const label = isToday ? t('Today') : d.toLocaleDateString('en-US', { weekday: 'narrow', month: 'numeric', day: 'numeric' });
    dates.push({
      dateStr,
      label,
      isCompleted: completedSet.has(dateStr),
      isToday,
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
        <span>{t('Recent Activity')}</span>
        <span>{t('Last {{count}} days', { count: daysToShow })}</span>
      </div>
      <div className="grid grid-cols-7 sm:grid-cols-14 gap-1.5 p-3 rounded-xl border border-border bg-muted/20">
        {dates.map(({ dateStr, label, isCompleted, isToday }) => (
          <div
            key={dateStr}
            className="flex flex-col items-center gap-1 group/day relative"
            title={`${dateStr}: ${isCompleted ? t('Completed') : t('Not completed')}`}
          >
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold transition-all ${
                isCompleted
                  ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30 scale-105'
                  : isToday
                  ? 'bg-primary/10 border-2 border-primary text-primary'
                  : 'bg-muted/60 text-muted-foreground/60'
              }`}
            >
              {isCompleted ? '✓' : isToday ? '•' : ''}
            </div>
            <span className={`text-[9px] truncate max-w-full ${isToday ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>
              {isToday ? t('Today') : label.slice(0, 3)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HabitStreakGrid;
