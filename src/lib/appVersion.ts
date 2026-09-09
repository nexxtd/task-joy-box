export const APP_VERSION = "0.4.0";
export const APP_BUILD_DATE = "2026-09-09";

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.4.0",
    date: "2026-09-09",
    title: "What's New",
    changes: [
      "Goals, Habits and Whiteboard removed everywhere including tutorial and help",
      "Support guides and pricing now reflect Tasks, Notes, Tags and Projects only",
      "Projects add menu now shows only Tasks and Notes",
    ],
  },
  {
    version: "0.3.0",
    date: "2026-09-09",
    title: "What's New",
    changes: [
      "Dashboard & Insights now focus on Tasks, Notes, Tags and Projects only",
      "New note widgets added to Dashboard and Insights",
      "Goals and Habits removed from navigation and hidden from Dashboard/Insights",
      "Admin panel cleaned: whiteboard, goals and habit settings removed",
    ],
  },
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
