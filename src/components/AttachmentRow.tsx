import React from 'react';
import { Lock, Paperclip, Trash2 } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface AttachmentRowProps {
  attachment: any;
  taskId: string | number;
  taskTitle?: string;
  onDelete?: () => void;
  disabledInBuilder?: boolean;
  dragHandleProps?: any;
}

const AttachmentRow: React.FC<AttachmentRowProps> = ({ attachment, onDelete, disabledInBuilder = false, dragHandleProps }) => {
  const { t } = useLanguage();
  const isServerAtt = /^\d+$/.test(String(attachment.id));
  const isLocked = Boolean(attachment.locked || attachment.archived);
  const href = isServerAtt ? `/api/attachments/file/${attachment.id}` : attachment.fileUrl;

  return (
    <div className="relative group/att">
      <a
        href={isLocked ? undefined : href}
        target={isLocked ? undefined : '_blank'}
        rel={isLocked ? undefined : 'noreferrer'}
        download={isLocked ? undefined : attachment.fileName}
        onClick={e => { if (disabledInBuilder || isLocked) { e.preventDefault(); } }}
        className={`flex items-center gap-3 p-3 rounded-xl border transition-all w-full text-left ${
          isLocked
            ? 'border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10 cursor-not-allowed pr-12 opacity-90'
            : `border-border bg-muted/40 ${disabledInBuilder ? 'cursor-default pr-12' : 'hover:bg-muted cursor-pointer pr-12'}`
        } ${dragHandleProps ? 'pl-8' : ''}`}
        title={
          isLocked
            ? t('Archived & Locked — Upgrade within 30 days to restore')
            : disabledInBuilder
              ? t('Download & Editor available after task creation')
              : t('Download file')
        }
      >
        <div className={`w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0 ${isLocked ? 'bg-amber-500/10 border-amber-500/30' : 'bg-background border-border'}`}>
          {isLocked ? (
            <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          ) : (
            <Paperclip className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{attachment.fileName}</p>
          <p className="text-xs text-muted-foreground">{attachment.fileSize ? `${(attachment.fileSize / 1024).toFixed(1)} KB` : t('Attached file')}</p>
          {isLocked && (
            <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[10px] font-semibold text-amber-700 dark:text-amber-300 leading-tight">
              <Lock className="w-2.5 h-2.5 flex-shrink-0" />
              <span>{t('Archived & Locked — Upgrade within 30 days to restore')}</span>
            </span>
          )}
        </div>
      </a>
      {dragHandleProps && (
        <div {...dragHandleProps} title={t('Drag to reorder')} aria-label={t('Drag to reorder')} className="absolute top-1/2 -translate-y-1/2 left-1.5 p-1 rounded-md bg-background/80 border border-border text-muted-foreground cursor-grab active:cursor-grabbing shadow-sm touch-none select-none">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>
        </div>
      )}
      {onDelete && (
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
          title={t('Delete attachment')}
          className="absolute top-1/2 -translate-y-1/2 right-2 p-1.5 rounded-lg bg-background/80 border border-border text-muted-foreground hover:text-destructive opacity-0 group-hover/att:opacity-100 transition-all shadow-sm"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

export default AttachmentRow;
