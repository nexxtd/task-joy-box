import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';

export const ROLE_OPTIONS = [
  { value: 'view', label: 'View only', description: 'Read-only access — can view tasks, milestones and project details, but can\'t create or edit anything.', color: '#6b7280' },
  { value: 'edit', label: 'Edit', description: 'Can create, edit and complete tasks and milestones, but can\'t manage members or delete the project.', color: '#3b82f6' },
  { value: 'full edit', label: 'Full Edit', description: 'Everything in Edit, plus full board control — assign, label and organise tasks across columns.', color: '#8b5cf6' },
  { value: 'admin', label: 'Admin', description: 'Everything in Full Edit — the highest collaborator role below the project owner.', color: '#f59e0b' },
  { value: 'owner', label: 'Owner', description: 'Full control — manages members, invites, project settings, archiving and deletion.', color: '#10b981' },
];

interface RolePermissionSelectProps {
  value: string;
  onChange: (role: string) => void;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  /** Compact trigger for inline rows. */
  size?: 'default' | 'sm';
  className?: string;
}

/** Permission dropdown that explains what each role can do. */
export const RolePermissionSelect: React.FC<RolePermissionSelectProps> = ({
  value, onChange, disabled, id, ariaLabel, size = 'default', className = '',
}) => {
  const current = ROLE_OPTIONS.find(r => r.value === value);
  const triggerSize = size === 'sm'
    ? 'h-8 min-w-[9.5rem] px-2.5 text-xs'
    : 'w-full h-12 px-3.5 text-sm';
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        className={`${triggerSize} bg-muted/40 border border-border rounded-xl text-foreground outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 ${className}`}
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: current?.color ?? '#6b7280' }} />
          <span className="font-semibold truncate">
            {current?.label ?? value.charAt(0).toUpperCase() + value.slice(1)}
          </span>
        </span>
      </SelectTrigger>
      <SelectContent
        align={size === 'sm' ? 'end' : 'start'}
        sideOffset={6}
        collisionPadding={16}
        style={{
          width: size === 'sm' ? '18rem' : 'var(--radix-select-trigger-width)',
          maxWidth: size === 'sm' ? 'calc(100vw - 32px)' : 'var(--radix-select-trigger-width)',
          maxHeight: 'min(24rem, var(--radix-select-content-available-height))',
        }}
        className="overflow-hidden rounded-xl p-1 [&_[data-radix-select-viewport]]:h-auto [&_[data-radix-select-viewport]]:min-w-0 [&_[data-radix-select-viewport]]:w-full [&_[data-radix-select-viewport]]:max-w-full [&_[data-radix-select-viewport]]:p-0"
      >
        {ROLE_OPTIONS.filter(option => option.value !== 'owner').map(option => (
          <SelectItem key={option.value} value={option.value} className="items-start rounded-lg py-2.5 pl-3.5 pr-9 focus:bg-muted [&>span:first-child]:left-auto [&>span:first-child]:right-2.5 [&>span:first-child]:top-3 [&>span:last-child]:min-w-0 [&>span:last-child]:flex-1">
            <span className="flex min-w-0 items-start gap-2.5 whitespace-normal">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-[3px]" style={{ backgroundColor: option.color }} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-foreground leading-tight">{option.label}</span>
                <span className="block text-[11px] leading-snug text-muted-foreground mt-1 whitespace-normal break-words">{option.description}</span>
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default RolePermissionSelect;
