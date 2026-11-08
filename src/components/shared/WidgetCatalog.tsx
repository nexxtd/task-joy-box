import { useMemo, useState } from 'react';
import type { ComponentType, PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Crown, LayoutDashboard, Lock, Search, X } from 'lucide-react';

type CatalogTier = 'free' | 'premium' | 'pro';

interface CatalogDefinition {
  type: string;
  title: string;
  desc: string;
  tier: CatalogTier;
  accent: string;
  icon: ComponentType<{ className?: string; style?: React.CSSProperties }>;
}

interface Props<D extends CatalogDefinition> {
  definitions: readonly D[];
  surface: 'dashboard' | 'insights';
  closing: boolean;
  hasWidget: (type: D['type']) => boolean;
  canAccessTier: (tier: CatalogTier) => boolean;
  onStartDrag: (definition: D) => (event: PointerEvent) => void;
  onAdd?: (definition: D) => void;
  onClose: () => void;
  onUpgrade: () => void;
  onReset: () => void;
}

const TIERS: CatalogTier[] = ['free', 'premium', 'pro'];

export function WidgetCatalog<D extends CatalogDefinition>({
  definitions, surface, closing, hasWidget, canAccessTier, onStartDrag, onAdd,
  onClose, onUpgrade, onReset,
}: Props<D>) {
  const [search, setSearch] = useState('');
  const visible = useMemo(() => {
    const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return definitions.filter(def => {
      const text = `${def.title} ${def.desc} ${def.tier}`.toLocaleLowerCase();
      return terms.every(term => text.includes(term));
    });
  }, [definitions, search]);
  const title = surface === 'dashboard' ? 'Customize Dashboard' : 'Customize Insights';

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" data-widget-catalog={surface}>
      <div
        className={closing ? 'absolute inset-0 pointer-events-none' : 'absolute inset-0 bg-black/20 backdrop-blur-[2px]'}
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={event => { if (event.key === 'Escape') onClose(); }}
        className={`relative flex h-full max-h-dvh w-full max-w-sm min-h-0 min-w-0 flex-col overflow-hidden border-l border-border bg-card shadow-2xl ${closing ? 'animate-slide-out-right' : 'animate-slide-in-right'}`}
      >
        <div className="shrink-0 border-b border-border bg-card px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex min-w-0 items-center gap-2 text-sm font-bold text-foreground">
              <LayoutDashboard className="h-4 w-4 shrink-0 text-primary" /> {title}
            </h2>
            <button onClick={onClose} aria-label="Close customize panel" title="Close customize panel" className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <label className="relative mt-3 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              aria-label={`Search ${surface} modules`}
              placeholder="Search modules..."
              className="w-full min-w-0 rounded-xl border border-border bg-muted/40 py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          <p className="px-1 pb-4 text-xs leading-relaxed text-muted-foreground">
            Drag a module onto the {surface}, or use Add. Modules already placed stay in this list. Grab a module's grip to move it, or its corner to resize it.
          </p>
          {visible.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center" role="status">
              <p className="text-sm font-semibold text-foreground">No modules match your search.</p>
              <button onClick={() => setSearch('')} className="mt-2 text-xs font-semibold text-primary hover:underline">Clear search</button>
            </div>
          ) : (
            <div className="space-y-4">
              {TIERS.map(tier => {
                const section = visible.filter(def => def.tier === tier);
                if (section.length === 0) return null;
                const lockedCount = section.filter(def => !canAccessTier(def.tier)).length;
                return (
                  <section key={tier} aria-label={`${tier[0].toUpperCase()}${tier.slice(1)} modules`}>
                    <div className="mb-1.5 flex items-center justify-between px-1">
                      <h3 className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">{tier}</h3>
                      {lockedCount > 0 && <span className="text-[10px] font-bold text-muted-foreground">{lockedCount} locked</span>}
                    </div>
                    <div className="space-y-2">
                      {section.map(def => {
                        const placed = hasWidget(def.type);
                        const unlocked = canAccessTier(def.tier);
                        const Icon = def.icon;
                        return (
                          <div
                            key={def.type}
                            data-widget-type={def.type}
                            onClick={!placed && !unlocked ? onUpgrade : undefined}
                            onPointerDown={placed || !unlocked ? undefined : event => {
                              if (event.pointerType !== 'touch') onStartDrag(def)(event);
                            }}
                            className={`rounded-2xl border border-border p-3 ${placed ? 'bg-muted opacity-70' : unlocked ? 'cursor-grab touch-pan-y select-none bg-card active:cursor-grabbing' : 'cursor-pointer select-none bg-card'}`}
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ background: unlocked ? `hsl(var(--${def.accent}) / 0.12)` : 'hsl(var(--muted))' }}>
                                {unlocked ? <Icon className="h-4 w-4" style={{ color: `hsl(var(--${def.accent}))` }} /> : <Lock className="h-4 w-4 text-muted-foreground" />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="break-words text-sm font-bold text-foreground">{def.title}</p>
                                <p className="mt-0.5 break-words text-xs text-muted-foreground">{def.desc}</p>
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                  {def.tier !== 'free' && <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase text-primary"><Crown className="h-2.5 w-2.5" /> {def.tier}</span>}
                                  <span className={`rounded-full border border-border px-2 py-0.5 text-[10px] font-bold ${!placed && !unlocked ? 'text-primary' : 'text-muted-foreground'}`}>
                                    {placed ? `In ${surface}` : unlocked ? 'Drag to add' : 'Upgrade'}
                                  </span>
                                  {!placed && unlocked && onAdd && (
                                    <button
                                      type="button"
                                      aria-label={`Add ${def.title}`}
                                      onPointerDown={event => event.stopPropagation()}
                                      onClick={event => { event.stopPropagation(); onAdd(def); }}
                                      className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground hover:bg-primary/90"
                                    >Add</button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
        <div className="shrink-0 border-t border-border bg-card p-3">
          <button onClick={onReset} className="w-full rounded-xl border border-border py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted">Reset to default layout</button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
