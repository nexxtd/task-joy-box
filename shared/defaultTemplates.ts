export const DEFAULT_TEMPLATE_TAGS = [
  'Work',
  'School',
  'Personal',
  'Study',
  'Planning',
  'Project',
  'Team',
  'Meetings',
  'Health',
  'Finance',
  'Creative',
  'Engineering',
] as const;

export type DefaultTemplateTag = (typeof DEFAULT_TEMPLATE_TAGS)[number];

const VALID_TEMPLATE_TAG_SET = new Set<string>(DEFAULT_TEMPLATE_TAGS);

export function sanitizeTemplateTags(input: unknown): DefaultTemplateTag[] {
  if (!Array.isArray(input)) return [];
  const out: DefaultTemplateTag[] = [];
  for (const raw of input) {
    const val = String(raw || '').trim();
    if (VALID_TEMPLATE_TAG_SET.has(val) && !out.includes(val as DefaultTemplateTag)) {
      out.push(val as DefaultTemplateTag);
    }
  }
  return out;
}

export interface DefaultGalleryTemplate {
  id: string;
  kind: 'task' | 'note';
  isDefault: true;
  authorName: string;
  name: string;
  title: string;
  description: string;
  priority: 'urgent' | 'high' | 'medium' | 'low' | 'none';
  duration: number;
  templateTags: DefaultTemplateTag[];
  labels: any[];
  subtasks: Array<{ text: string; durationMinutes: number }>;
  checklists: Array<{ id: string; title: string; items: Array<{ id: string; text: string; done?: boolean }> }>;
  isPublic: true;
}

export const DEFAULT_GALLERY_TEMPLATES: DefaultGalleryTemplate[] = [
  {
    id: 'default-task-weekly-sprint',
    kind: 'task',
    isDefault: true,
    authorName: 'Planora Default',
    name: 'Weekly Sprint Planning',
    title: 'Sprint Kickoff & Weekly Goals',
    description:
      'Review carry-over items, lock in sprint deliverables, assign owners, and surface blockers early.',
    priority: 'high',
    duration: 45,
    templateTags: ['Work', 'Team', 'Planning', 'Project'],
    labels: [],
    subtasks: [
      { text: 'Review last week completions & carry-overs', durationMinutes: 15 },
      { text: 'Prioritize top 3 sprint deliverables', durationMinutes: 15 },
      { text: 'Identify dependencies and blockers', durationMinutes: 15 },
    ],
    checklists: [
      {
        id: 'def-cl-1',
        title: 'Readiness Checks',
        items: [
          { id: 'def-ci-1', text: 'Board columns updated' },
          { id: 'def-ci-2', text: 'Estimates reviewed with team' },
          { id: 'def-ci-3', text: 'Milestones aligned' },
        ],
      },
    ],
    isPublic: true,
  },
  {
    id: 'default-task-bug-triage',
    kind: 'task',
    isDefault: true,
    authorName: 'Planora Default',
    name: 'Engineering Bug Investigation',
    title: 'Investigate & Fix: [Issue Summary]',
    description:
      'Steps to reproduce:\n1. Environment / version\n2. Expected behavior\n3. Actual behavior\n\nRoot cause & regression test plan:',
    priority: 'urgent',
    duration: 60,
    templateTags: ['Work', 'Engineering', 'Project'],
    labels: [],
    subtasks: [
      { text: 'Reproduce locally and capture logs', durationMinutes: 15 },
      { text: 'Implement minimal fix & add regression test', durationMinutes: 30 },
      { text: 'Verify build and request code review', durationMinutes: 15 },
    ],
    checklists: [
      {
        id: 'def-cl-2',
        title: 'PR Checklist',
        items: [
          { id: 'def-ci-4', text: 'Unit test added' },
          { id: 'def-ci-5', text: 'No TypeScript or lint errors' },
        ],
      },
    ],
    isPublic: true,
  },
  {
    id: 'default-task-assignment',
    kind: 'task',
    isDefault: true,
    authorName: 'Planora Default',
    name: 'Essay / Assignment Tracker',
    title: 'Complete [Course] Assignment',
    description:
      'Prompt & grading rubric notes:\n- Target word count / format:\n- Key sources needed:',
    priority: 'high',
    duration: 90,
    templateTags: ['School', 'Study', 'Planning'],
    labels: [],
    subtasks: [
      { text: 'Read prompt & outline main thesis/sections', durationMinutes: 20 },
      { text: 'Gather sources and write first draft', durationMinutes: 50 },
      { text: 'Proofread, format citations, and submit', durationMinutes: 20 },
    ],
    checklists: [
      {
        id: 'def-cl-3',
        title: 'Submission Check',
        items: [
          { id: 'def-ci-6', text: 'Rubric requirements met' },
          { id: 'def-ci-7', text: 'Citations formatted' },
          { id: 'def-ci-8', text: 'Uploaded before deadline' },
        ],
      },
    ],
    isPublic: true,
  },
  {
    id: 'default-task-exam-prep',
    kind: 'task',
    isDefault: true,
    authorName: 'Planora Default',
    name: 'Exam Study Session',
    title: 'Exam Prep: [Subject / Chapters]',
    description: 'Active recall practice blocks, weak-topic drills, and timed mock questions.',
    priority: 'high',
    duration: 60,
    templateTags: ['School', 'Study'],
    labels: [],
    subtasks: [
      { text: 'Review summary notes & highlight gaps', durationMinutes: 15 },
      { text: 'Practice problems / flashcards', durationMinutes: 30 },
      { text: 'Self-quiz weak concepts', durationMinutes: 15 },
    ],
    checklists: [],
    isPublic: true,
  },
  {
    id: 'default-task-budget-checkin',
    kind: 'task',
    isDefault: true,
    authorName: 'Planora Default',
    name: 'Monthly Budget Review',
    title: 'Monthly Finance & Bills Check-in',
    description: 'Reconcile bank statements, categorize recurring bills, and review savings targets.',
    priority: 'medium',
    duration: 30,
    templateTags: ['Finance', 'Personal', 'Planning'],
    labels: [],
    subtasks: [
      { text: 'Check upcoming bills & subscriptions', durationMinutes: 15 },
      { text: 'Update monthly savings tracker', durationMinutes: 15 },
    ],
    checklists: [],
    isPublic: true,
  },
  {
    id: 'default-task-workout',
    kind: 'task',
    isDefault: true,
    authorName: 'Planora Default',
    name: 'Health & Weekly Reset',
    title: 'Weekly Health & Meal Prep Plan',
    description: 'Plan workouts, hydration goals, and groceries for a balanced week.',
    priority: 'medium',
    duration: 45,
    templateTags: ['Health', 'Personal', 'Planning'],
    labels: [],
    subtasks: [
      { text: 'Schedule 3+ workout blocks on calendar', durationMinutes: 15 },
      { text: 'Write grocery list & prep staples', durationMinutes: 30 },
    ],
    checklists: [],
    isPublic: true,
  },
  {
    id: 'default-note-meeting',
    kind: 'note',
    isDefault: true,
    authorName: 'Planora Default',
    name: 'Meeting Notes & Action Items',
    title: 'Meeting Notes — [Topic / Date]',
    description:
      'Attendees:\n\nAgenda:\n- \n\nKey Decisions:\n- \n\nAction Items:\n- [Owner] Next step & due date',
    priority: 'medium',
    duration: 30,
    templateTags: ['Work', 'Meetings', 'Team'],
    labels: [],
    subtasks: [],
    checklists: [
      {
        id: 'def-ncl-1',
        title: 'Follow-ups',
        items: [
          { id: 'def-nci-1', text: 'Share summary in project chat' },
          { id: 'def-nci-2', text: 'Create follow-up tasks' },
        ],
      },
    ],
    isPublic: true,
  },
  {
    id: 'default-note-cornell',
    kind: 'note',
    isDefault: true,
    authorName: 'Planora Default',
    name: 'Cornell Lecture Notes',
    title: 'Lecture: [Course — Topic]',
    description:
      'Cues & Key Questions:\n- \n\nMain Class Notes:\n- \n\n2-Sentence Summary:\n',
    priority: 'medium',
    duration: 50,
    templateTags: ['School', 'Study'],
    labels: [],
    subtasks: [],
    checklists: [
      {
        id: 'def-ncl-2',
        title: 'After Class',
        items: [
          { id: 'def-nci-3', text: 'Highlight key terms within 24h' },
          { id: 'def-nci-4', text: 'Write summary section' },
        ],
      },
    ],
    isPublic: true,
  },
  {
    id: 'default-note-project-brief',
    kind: 'note',
    isDefault: true,
    authorName: 'Planora Default',
    name: 'Project Brief & Spec',
    title: 'Project Brief: [Project Name]',
    description:
      'Goal & Why:\n\nScope (In / Out):\n- In:\n- Out:\n\nSuccess Metrics:\n\nTimeline & Risks:',
    priority: 'high',
    duration: 45,
    templateTags: ['Work', 'Project', 'Planning', 'Engineering'],
    labels: [],
    subtasks: [],
    checklists: [
      {
        id: 'def-ncl-3',
        title: 'Sign-off',
        items: [
          { id: 'def-nci-5', text: 'Stakeholder review' },
          { id: 'def-nci-6', text: 'Milestones scheduled' },
        ],
      },
    ],
    isPublic: true,
  },
  {
    id: 'default-note-creative-brainstorm',
    kind: 'note',
    isDefault: true,
    authorName: 'Planora Default',
    name: 'Creative Brainstorm Canvas',
    title: 'Idea Scratchpad: [Theme]',
    description:
      'Core spark / inspiration:\n\nWild ideas (no filtering):\n1. \n2. \n3. \n\nNext experiment to prototype:',
    priority: 'low',
    duration: 25,
    templateTags: ['Creative', 'Personal', 'Planning'],
    labels: [],
    subtasks: [],
    checklists: [],
    isPublic: true,
  },
];

