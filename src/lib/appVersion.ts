export const APP_VERSION = "0.2.0";
export const APP_BUILD_DATE = "2026-09-09";

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.2.0",
    date: "2026-09-09",
    title: "What's New",
    changes: [
      "Deep Focus: images now upload reliably and persist after reload",
      "Deep Focus: completion flow fixed — Redo restarts the timer, Done marks the task complete and moves it to Done",
      "Navigation cleaned up: Habits and Goals hidden from sidebar (still available via direct link if needed)",
      "Performance and stability improvements",
    ],
  },
  {
    version: "0.1.0-beta",
    date: "2026-09-01",
    title: "Initial beta",
    changes: ["Task board, projects, notes, calendar and insights"],
  },
];
