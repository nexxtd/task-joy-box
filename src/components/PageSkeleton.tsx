import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Short skeleton states matching the page layout (item 6). Route chunks and
 * data fill in behind these instantly — no blank screen, no long
 * full-screen spinners. Pure layout, no user-facing strings.
 */
export const PageSkeleton: React.FC = () => (
  <div className="flex-1 min-h-0 overflow-hidden bg-background" aria-busy="true">
    <div className="px-4 sm:px-6 h-16 border-b border-border bg-card/30 flex items-center gap-3">
      <Skeleton className="w-9 h-9 rounded-xl flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-4 w-40 max-w-[50%]" />
        <Skeleton className="h-3 w-56 max-w-[70%] mt-1.5 hidden sm:block" />
      </div>
      <Skeleton className="h-9 w-28 rounded-xl flex-shrink-0 hidden sm:block" />
    </div>
    <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-w-[1440px] mx-auto">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-card border border-border p-5">
          <div className="flex items-center gap-3 mb-4">
            <Skeleton className="w-9 h-9 rounded-xl" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-3 w-full mb-2" />
          <Skeleton className="h-3 w-4/5 mb-2" />
          <Skeleton className="h-8 w-full rounded-xl mt-4" />
        </div>
      ))}
    </div>
  </div>
);

/** App-shell skeleton for the auth boot window: sidebar + content placeholders. */
export const AppShellSkeleton: React.FC = () => (
  <div className="min-h-dvh flex bg-background" aria-busy="true">
    <div className="hidden md:flex w-60 flex-shrink-0 flex-col border-r border-border bg-card/30 p-3 gap-2">
      <Skeleton className="h-10 w-full rounded-xl" />
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full rounded-xl" />
      ))}
      <div className="flex-1" />
      <Skeleton className="h-12 w-full rounded-xl" />
    </div>
    <div className="flex-1 min-w-0">
      <PageSkeleton />
    </div>
  </div>
);
