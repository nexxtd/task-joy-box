import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Paperclip, FileWarning, Download, Trash2 } from 'lucide-react';

const SUPPORTED_DOC_MIMES = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'application/rtf',
  'text/rtf',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/html',
  'application/xhtml+xml',
  'application/pdf',
  'application/epub+zip',
];

const SUPPORTED_DOC_EXT_REGEX = /\.(docx?|odt|rtf|txt|md|html?|pdf|epub)$/i;

export function isDocumentCompatible(attachment: any): boolean {
  const fileType = attachment?.fileType || '';
  const fileName = attachment?.fileName || '';
  const fileUrl = attachment?.fileUrl || '';
  return SUPPORTED_DOC_MIMES.includes(fileType)
    || SUPPORTED_DOC_EXT_REGEX.test(fileName)
    || SUPPORTED_DOC_EXT_REGEX.test(fileUrl);
}

interface AttachmentRowProps {
  attachment: any;
  taskId: string | number;
  taskTitle?: string;
  onDelete?: () => void;
  disabledInBuilder?: boolean;
}

const AttachmentRow: React.FC<AttachmentRowProps> = ({ attachment, taskId, taskTitle, onDelete, disabledInBuilder = false }) => {
  const navigate = useNavigate();
  const [opening, setOpening] = useState(false);
  const [showIncompatible, setShowIncompatible] = useState(false);

  const isServerAtt = /^\d+$/.test(String(attachment.id));
  const href = isServerAtt ? `/api/attachments/file/${attachment.id}` : attachment.fileUrl;

  const openInEditor = async () => {
    if (disabledInBuilder) return;
    if (!isDocumentCompatible(attachment)) {
      setShowIncompatible(true);
      return;
    }
    setOpening(true);
    try {
      const res = await fetch('/api/documents/adopt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          taskId: String(taskId),
          taskTitle: taskTitle || '',
          fileName: attachment.fileName,
          fileType: attachment.fileType || 'application/octet-stream',
          fileSize: attachment.fileSize || 0,
          fileUrl: attachment.fileUrl,
        }),
      });
      if (!res.ok) {
        setShowIncompatible(true);
        return;
      }
      const doc = await res.json();
      navigate(`/documents?doc=${doc.id}`);
    } catch (err) {
      console.error('Failed to open document:', err);
      setShowIncompatible(true);
    } finally {
      setOpening(false);
    }
  };

  return (
    <>
      <div className="relative group/att">
        <button
          onClick={openInEditor}
          disabled={opening || disabledInBuilder}
          className={`flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/40 transition-all w-full text-left ${disabledInBuilder ? 'pr-12 cursor-default' : 'hover:bg-muted pr-24 cursor-pointer'}`}
          title={disabledInBuilder ? 'Download & Editor available after task creation' : (opening ? 'Opening in Document Editor...' : 'Open in Document Editor')}
        >
          <div className="w-10 h-10 rounded-lg bg-background border border-border flex items-center justify-center flex-shrink-0">
            <Paperclip className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{attachment.fileName}</p>
            <p className="text-xs text-muted-foreground">{attachment.fileSize ? `${(attachment.fileSize / 1024).toFixed(1)} KB` : 'Attached file'}</p>
          </div>
        </button>
        {!disabledInBuilder && href && (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            download
            onClick={e => e.stopPropagation()}
            title="Download file"
            className="absolute top-1/2 -translate-y-1/2 right-10 p-1.5 rounded-lg bg-background/80 border border-border text-muted-foreground hover:text-primary transition-all"
          >
            <Download className="w-3.5 h-3.5" />
          </a>
        )}
        {onDelete && (
          <button
            onClick={e => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
            title="Delete attachment"
            className="absolute top-1/2 -translate-y-1/2 right-2 p-1.5 rounded-lg bg-background/80 border border-border text-muted-foreground hover:text-destructive opacity-0 group-hover/att:opacity-100 transition-all shadow-sm"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {showIncompatible && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
          onClick={() => setShowIncompatible(false)}
        >
          <div
            className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-sm w-full text-center space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <FileWarning className="w-6 h-6 text-destructive" />
            </div>
            <h3 className="text-base font-bold text-foreground">File not compatible</h3>
            <p className="text-sm text-muted-foreground">
              Compatible document types include Word (.docx, .doc), Google Docs exports, OpenDocument (.odt), RTF, Text, Markdown, HTML, and PDF.
            </p>
            <button
              onClick={() => setShowIncompatible(false)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default AttachmentRow;