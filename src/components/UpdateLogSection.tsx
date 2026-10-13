import React, { useEffect, useState } from "react";
import { Check, ChevronDown, History } from "lucide-react";
import {
  fetchServerChangelog,
  getCombinedChangelog,
  readAdminChangelog,
  readServerChangelogCache,
  subscribeChangelog,
  type ChangelogEntry,
} from "@/lib/appVersion";

/**
 * Update Log section for the Support page (item 9). Lists every update
 * newest-first (version, release date, changes); the newest entry is open by
 * default, older entries are collapsed and expandable. Sources: built-in
 * CHANGELOG merged with admin-added updates (local + server-mirrored).
 */
const UpdateLogSection: React.FC<{ id?: string }> = ({ id = "update-log" }) => {
  const [entries, setEntries] = useState<ChangelogEntry[]>(() => getCombinedChangelog());
  const [openVersion, setOpenVersion] = useState<string | null>(() => getCombinedChangelog()[0]?.version ?? null);

  useEffect(() => {
    // Instant paint from local data, then merge server-mirrored updates.
    let cancelled = false;
    fetchServerChangelog().then((server) => {
      if (cancelled) return;
      const combined = getCombinedChangelog(readAdminChangelog(), server.length ? server : readServerChangelogCache());
      setEntries(combined);
      setOpenVersion((prev) => prev ?? combined[0]?.version ?? null);
    });
    const unsub = subscribeChangelog(() => {
      setEntries(getCombinedChangelog());
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  return (
    <div id={id} className="mt-10 scroll-mt-20">
      <div className="flex items-center gap-2 mb-3">
        <History className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Update Log</h2>
      </div>
      {entries.length === 0 ? (
        <div className="rounded-2xl bg-card border border-border py-12 text-center">
          <History className="w-8 h-8 mx-auto mb-2 opacity-30 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">No updates yet</p>
          <p className="text-xs text-muted-foreground mt-1">Check back soon for the latest changes.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, idx) => {
            const isOpen = openVersion === entry.version;
            return (
              <div key={entry.version} className="rounded-xl border border-border/70 bg-card/60 overflow-hidden">
                <button
                  onClick={() => setOpenVersion(isOpen ? null : entry.version)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center gap-3 p-3.5 text-left transition-colors hover:bg-card"
                >
                  <span className="flex-shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                    v{entry.version}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-foreground truncate">{entry.title}</span>
                    <span className="block text-[11px] text-muted-foreground mt-0.5">{entry.date}</span>
                  </span>
                  {idx === 0 && (
                    <span className="flex-shrink-0 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold uppercase px-2 py-0.5">
                      Latest
                    </span>
                  )}
                  <ChevronDown className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <ul className="px-3.5 pb-4 pt-3 space-y-2.5 border-t border-border/50">
                    {entry.changes.map((c, i) => (
                      <li key={i} className="flex gap-2.5 text-sm text-muted-foreground">
                        <span className="mt-0.5 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Check className="w-3 h-3 text-primary" />
                        </span>
                        <span className="flex-1">{c}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default UpdateLogSection;
