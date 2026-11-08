import { useState } from "react";
import { Copy, Check } from "lucide-react";

/**
 * Compact monospace share-code pill with click-to-copy.
 * Used for template share codes (Save-as-template success screen + template lists).
 * Renders as a <span role="button"> so it stays valid when nested inside
 * clickable list rows.
 */
export default function CopyShareCode({ code, className = "" }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (permissions / non-secure context) — user can select the code text instead.
    }
  };

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={copy}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") void copy(e); }}
      title="Copy share code"
      className={`inline-flex items-center gap-1.5 font-mono text-[10px] leading-none px-2 py-1 rounded-md border border-border bg-muted/50 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all cursor-pointer select-all ${className}`}
    >
      {code}
      {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
    </span>
  );
}
