import { useState } from "react";
import { Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type CopySize = "xs" | "sm" | "md" | "lg";

const SIZE_CLASSES: Record<CopySize, string> = {
  xs: "text-[10px] px-2 py-1 rounded-md",
  sm: "text-[11px] px-2.5 py-1 rounded-lg font-bold",
  md: "text-sm px-3 py-1.5 rounded-lg font-bold tracking-wider",
  lg: "text-base px-3.5 py-2 rounded-xl font-semibold tracking-[0.16em]",
};

/**
 * A code you copy by clicking it. There is no separate copy button: the code itself is the
 * target. Shows a check and a toast when copied. Renders as <span role="button"> so it stays
 * valid when nested inside clickable rows; it stops propagation so row clicks don't fire.
 */
export default function CopyShareCode({
  code,
  className = "",
  size = "xs",
  label,
  toastOnCopy = true,
}: {
  code: string;
  className?: string;
  size?: CopySize;
  /** Optional muted prefix shown before the code, e.g. "Code:". */
  label?: string;
  toastOnCopy?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (toastOnCopy) toast({ title: "Copied", description: `${code} copied to clipboard` });
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (permissions / non-secure context): the text stays selectable.
    }
  };

  return (
    <span
      role="button"
      tabIndex={0}
      draggable={false}
      onClick={copy}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") void copy(e); }}
      title={copied ? "Copied!" : "Click to copy"}
      aria-label={`Copy code ${code}`}
      className={`inline-flex items-center gap-1.5 font-mono leading-none border transition-all cursor-copy select-none break-all ${
        copied
          ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "border-border bg-muted/50 text-foreground hover:border-primary/60 hover:bg-primary/5 active:scale-[0.97]"
      } ${SIZE_CLASSES[size]} ${className}`}
    >
      {label && <span className="font-sans font-bold uppercase text-[9px] tracking-wide text-muted-foreground">{label}</span>}
      {code}
      {copied && <Check className="w-3 h-3 flex-shrink-0" />}
    </span>
  );
}
