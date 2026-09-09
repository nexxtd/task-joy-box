import React from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Check, X } from "lucide-react";
import { CHANGELOG, APP_VERSION } from "@/lib/appVersion";

const WhatsNew: React.FC = () => {
  const navigate = useNavigate();
  const latest = CHANGELOG[0];

  const dismiss = () => {
    try { localStorage.removeItem("whats_new_pending"); localStorage.setItem("whats_new_seen", APP_VERSION); } catch {}
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-lg overflow-hidden animate-fade-in">
        <div className="bg-primary/10 px-6 py-5 flex items-center gap-3 border-b border-border">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-foreground">What's New</h1>
            <p className="text-xs text-muted-foreground">Version {latest.version} · {latest.date}</p>
          </div>
          <button onClick={dismiss} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">{latest.title}</h2>
          <ul className="space-y-2.5">
            {latest.changes.map((c, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-muted-foreground">
                <span className="mt-0.5 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-primary" />
                </span>
                <span className="flex-1">{c}</span>
              </li>
            ))}
          </ul>
          {CHANGELOG.length > 1 && (
            <details className="text-xs text-muted-foreground border-t border-border pt-4">
              <summary className="cursor-pointer font-medium text-foreground">Previous updates</summary>
              <div className="mt-3 space-y-3">
                {CHANGELOG.slice(1).map((e) => (
                  <div key={e.version}>
                    <p className="font-medium text-foreground">{e.version} · {e.date}</p>
                    <ul className="list-disc list-inside mt-1 space-y-0.5">
                      {e.changes.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
        <div className="px-6 py-4 bg-muted/20 border-t border-border flex justify-end">
          <button onClick={dismiss} className="px-5 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-xl hover:bg-primary/90 transition-colors">
            Continue to app
          </button>
        </div>
      </div>
    </div>
  );
};

export default WhatsNew;
