import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Check, X } from "lucide-react";
import { CHANGELOG, APP_VERSION } from "@/lib/appVersion";
import { useAuth } from "@/context/AuthContext";

const WhatsNewModal: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    try {
      const pending = localStorage.getItem("whats_new_pending");
      const seen = localStorage.getItem("whats_new_seen");
      if (pending && pending === APP_VERSION && seen !== APP_VERSION) {
        setOpen(true);
      }
    } catch {}
  }, [user]);

  if (!open || !user) return null;
  const latest = CHANGELOG[0];

  const dismiss = (goToPage = false) => {
    try { localStorage.removeItem("whats_new_pending"); localStorage.setItem("whats_new_seen", APP_VERSION); } catch {}
    setOpen(false);
    if (goToPage) navigate("/whats-new");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => dismiss()} />
      <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
        <div className="bg-primary/10 px-6 py-5 flex items-center gap-3 border-b border-border">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-bold text-foreground">What's New</h2>
            <p className="text-xs text-muted-foreground">Version {latest.version} · {latest.date}</p>
          </div>
          <button onClick={() => dismiss()} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-3">
          <p className="text-sm font-medium text-foreground">{latest.title}</p>
          <ul className="space-y-2.5">
            {latest.changes.map((c, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-muted-foreground">
                <span className="mt-0.5 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-primary" />
                </span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="px-6 py-4 bg-muted/20 border-t border-border flex gap-3 justify-end">
          <button onClick={() => dismiss(true)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">View full page</button>
          <button onClick={() => dismiss()} className="px-5 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-xl hover:bg-primary/90">Got it</button>
        </div>
      </div>
    </div>
  );
};

export default WhatsNewModal;
