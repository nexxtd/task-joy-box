import React from 'react';
import { Paperclip, Trash2 } from 'lucide-react';
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
  const href = isServerAtt ? `/api/attachments/file/${attachment.id}` : attachment.fileUrl;

  return (
    <div className="relative group/att">
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        download={attachment.fileName}
        onClick={e => { if (disabledInBuilder) { e.preventDefault(); } }}
        className={`flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/40 transition-all w-full text-left ${disabledInBuilder ? 'cursor-default pr-12' : 'hover:bg-muted cursor-pointer pr-12'} ${dragHandleProps ? 'pl-8' : ''}`}
        title={disabledInBuilder ? t('Download & Editor available after task creation') : t('Download file')}
      >
        <div className="w-10 h-10 rounded-lg bg-background border border-border flex items-center justify-center flex-shrink-0">
          <Paperclip className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{attachment.fileName}</p>
          <p className="text-xs text-muted-foreground">{attachment.fileSize ? `${(attachment.fileSize / 1024).toFixed(1)} KB` : t('Attached file')}</p>
        </div>
      </a>
      {dragHandleProps && (
        <div {...dragHandleProps} className="absolute top-1/2 -translate-y-1/2 left-1.5 p-1 rounded-md bg-background/80 border border-border text-muted-foreground cursor-grab active:cursor-grabbing opacity-0 group-hover/att:opacity-100 transition-all shadow-sm">
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
