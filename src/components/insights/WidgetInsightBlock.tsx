import React from 'react';

export interface WidgetInsightChip {
  label: string;
  tone?: 'default' | 'ok' | 'warn' | 'bad';
}

export interface WidgetInsightBlockProps {
  heading: string;
  summary: string;
  detail?: string;
  action?: string;
  chips?: WidgetInsightChip[];
  tone?: 'primary' | 'danger' | 'warning' | 'neutral';
  actionLabel?: string;
}

const TONE_BOX: Record<NonNullable<WidgetInsightBlockProps['tone']>, string> = {
  primary: 'bg-primary/5 border-primary/15',
  danger: 'bg-red-500/5 border-red-500/20',
  warning: 'bg-amber-500/5 border-amber-500/20',
  neutral: 'bg-muted/25 border-border/50',
};

const CHIP_CLS: Record<NonNullable<WidgetInsightChip['tone']>, string> = {
  default: 'text-muted-foreground',
  ok: 'text-emerald-600 dark:text-emerald-400 font-semibold',
  warn: 'text-amber-600 dark:text-amber-400 font-semibold',
  bad: 'text-red-600 dark:text-red-400 font-semibold',
};

/**
 * Shared multi-point analytics summary card rendered inside Dashboard and Insights modules.
 * Displays structured primary analysis, secondary context, concrete next action, and KPI chips.
 */
export const WidgetInsightBlock: React.FC<WidgetInsightBlockProps> = ({
  heading,
  summary,
  detail,
  action,
  chips = [],
  tone = 'neutral',
  actionLabel,
}) => (
  <div className={`mt-3 p-3 rounded-xl border space-y-1.5 ${TONE_BOX[tone]}`}>
    <p className="text-[11px] text-muted-foreground leading-relaxed">
      <span className="font-bold text-foreground">{heading}: </span>
      {summary}
    </p>
    {detail && (
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        {detail}
      </p>
    )}
    {action && (
      <p className="text-[11px] text-foreground/90 leading-relaxed font-medium">
        {actionLabel ? <span className="font-bold text-primary">{actionLabel}: </span> : null}
        {action}
      </p>
    )}
    {chips.length > 0 && (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-[10px]">
        {chips.map((chip, idx) => (
          <React.Fragment key={`${chip.label}-${idx}`}>
            {idx > 0 && <span className="text-muted-foreground/60">·</span>}
            <span className={CHIP_CLS[chip.tone || 'default']}>{chip.label}</span>
          </React.Fragment>
        ))}
      </div>
    )}
  </div>
);

