import React, { useEffect, useState } from 'react';

const ModalShell: React.FC<{ onCancel: () => void; children: React.ReactNode }> = ({ onCancel, children }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onCancel} />
    <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-sm animate-fade-in">
      {children}
    </div>
  </div>
);

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  icon?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  icon,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;
  return (
    <ModalShell onCancel={onCancel}>
      <div className="flex items-center gap-3 mb-4">
        {icon}
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-foreground">{title}</h3>
          {description && <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-line">{description}</p>}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all"
        >
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          className="px-4 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all"
        >
          {confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
};

interface PromptModalProps {
  open: boolean;
  title: string;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  icon?: React.ReactNode;
  inputType?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export const PromptModal: React.FC<PromptModalProps> = ({
  open,
  title,
  description,
  placeholder,
  defaultValue = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  icon,
  inputType = 'text',
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (open) setValue(defaultValue);
  }, [open, defaultValue]);

  if (!open) return null;

  const submit = () => onConfirm(value);

  return (
    <ModalShell onCancel={onCancel}>
      <div className="flex items-center gap-3 mb-4">
        {icon}
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-foreground">{title}</h3>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </div>
      <input
        autoFocus
        type={inputType}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        placeholder={placeholder}
        className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 mb-4"
      />
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all"
        >
          {cancelLabel}
        </button>
        <button
          onClick={submit}
          className="px-4 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all"
        >
          {confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
};
