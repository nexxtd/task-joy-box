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
    title: 'Sprint Kickoff & Weekly Goals — Week [Number]',
    description:
      'Objective:\nAlign the team on sprint capacity, commit top-priority deliverables, and clear dependencies before execution.\n\nAgenda:\n1. Velocity & carry-over audit (what slipped and why)\n2. Sprint goal definition (1-sentence outcome)\n3. Capacity check (PTO, meetings, support rotation)\n4. Owner & due-date assignment per ticket\n\nDefinition of Done:\nAll sprint tickets estimated, assigned, and linked to a milestone.',
    priority: 'high',
    duration: 60,
    templateTags: ['Work', 'Team', 'Planning', 'Project'],
    labels: [
      { id: 'def-lbl-sprint', name: 'Sprint', color: 'blue' },
      { id: 'def-lbl-team', name: 'Team Sync', color: 'purple' },
    ],
    subtasks: [
      { text: 'Review last week completions & triage carry-over items', durationMinutes: 15 },
      { text: 'Verify team capacity, PTO & meeting load for the week', durationMinutes: 10 },
      { text: 'Prioritize top 3 sprint deliverables & write acceptance criteria', durationMinutes: 15 },
      { text: 'Assign owners, estimates, and target due dates on board', durationMinutes: 10 },
      { text: 'Surface blockers & schedule mid-week risk check-in', durationMinutes: 10 },
    ],
    checklists: [
      {
        id: 'def-cl-1',
        title: 'Readiness Checks',
        items: [
          { id: 'def-ci-1', text: 'Board columns cleaned and ordered' },
          { id: 'def-ci-2', text: 'Effort estimates reviewed with team' },
          { id: 'def-ci-3', text: 'Project milestones & target dates aligned' },
          { id: 'def-ci-3b', text: 'Every high-priority task has a clear owner' },
        ],
      },
      {
        id: 'def-cl-1b',
        title: 'Post-Planning Handoff',
        items: [
          { id: 'def-ci-3c', text: 'Sprint summary posted in Project Chat' },
          { id: 'def-ci-3d', text: 'Calendar focus blocks reserved for deep work' },
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
      'Severity & Impact:\n- Affected users / endpoints:\n- Workaround available?:\n\nSteps to Reproduce:\n1. Environment / browser / version:\n2. Preconditions & test data:\n3. Expected behavior:\n4. Actual behavior / error trace:\n\nRoot Cause Hypothesis & Fix Plan:\n- Suspected module / commit:\n- Backwards compatibility / migration impact:\n- Regression test coverage plan:',
    priority: 'urgent',
    duration: 75,
    templateTags: ['Work', 'Engineering', 'Project'],
    labels: [
      { id: 'def-lbl-bug', name: 'Bugfix', color: 'red' },
      { id: 'def-lbl-eng', name: 'Engineering', color: 'orange' },
    ],
    subtasks: [
      { text: 'Reproduce locally, capture stack trace & network payload', durationMinutes: 15 },
      { text: 'Isolate root cause & check git blame / recent changes', durationMinutes: 15 },
      { text: 'Write failing regression test capturing exact edge case', durationMinutes: 15 },
      { text: 'Implement minimal safe fix & verify edge cases', durationMinutes: 20 },
      { text: 'Run full test suite, build & request peer review', durationMinutes: 10 },
    ],
    checklists: [
      {
        id: 'def-cl-2',
        title: 'PR & Verification Checklist',
        items: [
          { id: 'def-ci-4', text: 'Automated regression unit/integration test added' },
          { id: 'def-ci-5', text: 'Zero TypeScript, build, or lint errors' },
          { id: 'def-ci-5b', text: 'Verified fix against empty/null/permission edge cases' },
          { id: 'def-ci-5c', text: 'No sensitive logs or debug code left behind' },
        ],
      },
      {
        id: 'def-cl-2b',
        title: 'Release & Follow-up',
        items: [
          { id: 'def-ci-5d', text: 'Updated ticket/chat with root cause summary' },
          { id: 'def-ci-5e', text: 'Confirmed issue resolved in staging/production' },
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
    title: 'Complete [Course] Assignment — [Topic]',
    description:
      'Assignment Overview:\n- Course & Instructor:\n- Weight (% of final grade):\n- Submission portal & file format (PDF/DOCX/Link):\n\nPrompt & Grading Rubric Breakdown:\n- Core question / thesis statement:\n- Target word count / page limit:\n- Required citation style (APA / MLA / Chicago / IEEE):\n\nKey Sources & Evidence:\n1. [Primary source / textbook chapter]\n2. [Peer-reviewed article]',
    priority: 'high',
    duration: 120,
    templateTags: ['School', 'Study', 'Planning'],
    labels: [
      { id: 'def-lbl-school', name: 'Coursework', color: 'purple' },
      { id: 'def-lbl-writing', name: 'Writing', color: 'blue' },
    ],
    subtasks: [
      { text: 'Dissect prompt, rubric criteria & formulate core thesis', durationMinutes: 20 },
      { text: 'Collect credible sources & organize key quotes/data', durationMinutes: 25 },
      { text: 'Draft structured outline with topic sentences per paragraph', durationMinutes: 15 },
      { text: 'Write complete first draft without over-editing', durationMinutes: 40 },
      { text: 'Revise clarity, verify citations, proofread & export final file', durationMinutes: 20 },
    ],
    checklists: [
      {
        id: 'def-cl-3',
        title: 'Submission Check',
        items: [
          { id: 'def-ci-6', text: 'Every grading rubric criterion explicitly addressed' },
          { id: 'def-ci-7', text: 'In-text citations & bibliography formatted accurately' },
          { id: 'def-ci-7b', text: 'Word count within required bounds' },
          { id: 'def-ci-8', text: 'File named properly and uploaded before deadline' },
        ],
      },
      {
        id: 'def-cl-3b',
        title: 'Quality Polish',
        items: [
          { id: 'def-ci-8b', text: 'Spellcheck & grammar pass completed' },
          { id: 'def-ci-8c', text: 'Submission confirmation receipt saved' },
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
    description:
      'Exam Details:\n- Exam Date, Time & Room:\n- Format (MCQ / Free Response / Open Book):\n- Allowed aids (formula sheet, calculator):\n\nHigh-Yield Topics Checklist:\n- Topic A:\n- Topic B:\n- Topic C:\n\nStudy Strategy:\nUse 25m active recall blocks + 5m review breaks. Prioritize weakest topics first.',
    priority: 'high',
    duration: 90,
    templateTags: ['School', 'Study'],
    labels: [
      { id: 'def-lbl-exam', name: 'Exam Prep', color: 'yellow' },
      { id: 'def-lbl-focus', name: 'Deep Focus', color: 'purple' },
    ],
    subtasks: [
      { text: 'Audit syllabus topics & rate confidence (Red / Amber / Green)', durationMinutes: 10 },
      { text: 'Condense weak chapters into 1-page active recall sheet', durationMinutes: 20 },
      { text: 'Run spaced-repetition flashcards on definitions & formulas', durationMinutes: 20 },
      { text: 'Complete timed practice problems without notes', durationMinutes: 25 },
      { text: 'Grade mistakes & log error patterns to re-test tomorrow', durationMinutes: 15 },
    ],
    checklists: [
      {
        id: 'def-cl-exam-1',
        title: 'Active Recall Readiness',
        items: [
          { id: 'def-ci-ex1', text: 'Completed at least one timed past paper / mock quiz' },
          { id: 'def-ci-ex2', text: 'All "Red" confidence concepts practiced again' },
          { id: 'def-ci-ex3', text: 'Key formulas memorized or verified on cheat sheet' },
        ],
      },
      {
        id: 'def-cl-exam-2',
        title: 'Exam Day Prep',
        items: [
          { id: 'def-ci-ex4', text: 'Bag packed (ID, pens, charged device, calculator)' },
          { id: 'def-ci-ex5', text: '8 hours sleep target scheduled night before' },
        ],
      },
    ],
    isPublic: true,
  },
  {
    id: 'default-task-budget-checkin',
    kind: 'task',
    isDefault: true,
    authorName: 'Planora Default',
    name: 'Monthly Budget Review',
    title: 'Monthly Finance & Bills Check-in — [Month]',
    description:
      'Monthly Snapshot:\n- Net Monthly Income:\n- Fixed Costs (Rent, Utilities, Debt):\n- Variable Spend Target (Groceries, Dining, Fun):\n- Savings / Investing Goal:\n\nReview Focus:\nReconcile checking & credit card statements, catch creeping subscriptions, and automate savings transfers first.',
    priority: 'medium',
    duration: 45,
    templateTags: ['Finance', 'Personal', 'Planning'],
    labels: [
      { id: 'def-lbl-fin', name: 'Finance', color: 'green' },
      { id: 'def-lbl-routine', name: 'Monthly Routine', color: 'blue' },
    ],
    subtasks: [
      { text: 'Download checking & card statements and categorize expenses', durationMinutes: 15 },
      { text: 'Verify upcoming bills & audit unused subscriptions to cancel', durationMinutes: 10 },
      { text: 'Compare actual spending vs category budgets & note variances', durationMinutes: 10 },
      { text: 'Execute savings / investment transfer & update net worth log', durationMinutes: 10 },
    ],
    checklists: [
      {
        id: 'def-cl-fin-1',
        title: 'Monthly Financial Hygiene',
        items: [
          { id: 'def-ci-fin1', text: 'All credit cards paid on time (zero late fees)' },
          { id: 'def-ci-fin2', text: 'Emergency fund balance verified' },
          { id: 'def-ci-fin3', text: 'Recurring charges audited' },
          { id: 'def-ci-fin4', text: 'Receipts archived for tax/reimbursement' },
        ],
      },
    ],
    isPublic: true,
  },
  {
    id: 'default-task-workout',
    kind: 'task',
    isDefault: true,
    authorName: 'Planora Default',
    name: 'Health & Weekly Reset',
    title: 'Weekly Health, Training & Meal Prep Plan',
    description:
      'Weekly Wellness Targets:\n- Strength / Cardio Sessions Planned:\n- Daily Steps / Mobility Goal:\n- Sleep Window Target (e.g. 23:00–07:00):\n- Hydration Baseline (Liters/day):\n\nNutrition Plan:\n- Breakfasts:\n- High-protein lunches:\n- Quick dinners:',
    priority: 'medium',
    duration: 60,
    templateTags: ['Health', 'Personal', 'Planning'],
    labels: [
      { id: 'def-lbl-health', name: 'Wellness', color: 'green' },
      { id: 'def-lbl-reset', name: 'Weekly Reset', color: 'pink' },
    ],
    subtasks: [
      { text: 'Schedule 3–5 workout sessions directly on calendar', durationMinutes: 10 },
      { text: 'Plan 3 repeatable balanced meals & batch-cook proteins/grains', durationMinutes: 20 },
      { text: 'Build categorized grocery list (produce, protein, pantry)', durationMinutes: 15 },
      { text: 'Restock water bottles, supplements & prep workout gear', durationMinutes: 15 },
    ],
    checklists: [
      {
        id: 'def-cl-health-1',
        title: 'Sunday Reset Checklist',
        items: [
          { id: 'def-ci-hl1', text: 'Fridge cleared of expired food' },
          { id: 'def-ci-hl2', text: 'Groceries delivered / shopped' },
          { id: 'def-ci-hl3', text: 'Prepped grab-and-go lunches for Mon–Wed' },
          { id: 'def-ci-hl4', text: 'Sleep alarms & bedtime wind-down set' },
        ],
      },
    ],
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
      'Meeting Details:\n- Date & Time:\n- Facilitator:\n- Attendees:\n- Context / Pre-read Link:\n\nAgenda:\n1. Check-in & status updates\n2. Core discussion / trade-offs\n3. Decisions & owners\n\nDiscussion Notes:\n- \n\nKey Decisions Made:\n- [Decision] Rationale & impact\n\nAction Items:\n- [Owner] Specific deliverable — Due [Date]',
    priority: 'medium',
    duration: 45,
    templateTags: ['Work', 'Meetings', 'Team'],
    labels: [
      { id: 'def-lbl-meeting', name: 'Meeting', color: 'blue' },
      { id: 'def-lbl-actions', name: 'Action Items', color: 'orange' },
    ],
    subtasks: [],
    checklists: [
      {
        id: 'def-ncl-1',
        title: 'Post-Meeting Follow-ups',
        items: [
          { id: 'def-nci-1', text: 'Share concise summary & decisions in Project Chat' },
          { id: 'def-nci-2', text: 'Convert every action item into an assigned task with due date' },
          { id: 'def-nci-2b', text: 'Confirm date & owner for follow-up review if needed' },
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
      'Metadata:\n- Course / Professor:\n- Date / Reading Assignment:\n- Core Learning Objective:\n\nCues, Vocabulary & Exam Questions:\n- Q1: Why / how does [concept] work?\n- Key Term 1:\n- Key Term 2:\n\nMain Class Notes:\n- Main idea 1 (examples & diagrams):\n- Main idea 2 (formulas / edge cases):\n- Professor emphasis / hints:\n\n2-Sentence Synthesis Summary:\nIn your own words, what is the big takeaway from today\'s lecture?\n\nUnanswered Questions to Review:\n- ',
    priority: 'medium',
    duration: 55,
    templateTags: ['School', 'Study'],
    labels: [
      { id: 'def-lbl-lecture', name: 'Lecture Notes', color: 'purple' },
      { id: 'def-lbl-study', name: 'Study', color: 'yellow' },
    ],
    subtasks: [],
    checklists: [
      {
        id: 'def-ncl-2',
        title: '24-Hour Spaced Review',
        items: [
          { id: 'def-nci-3', text: 'Highlight key terms & add cue questions within 24h' },
          { id: 'def-nci-4', text: 'Write 2-sentence summary without looking at notes' },
          { id: 'def-nci-4b', text: 'Add difficult concepts to Exam Study flashcards' },
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
      'Problem Statement & Why Now:\nWhat user or business pain are we solving, and why does it matter right now?\n\nTarget Users & Outcome:\n- Primary persona:\n- Desired outcome:\n\nScope (In vs Out):\n- In Scope (Must-have v1):\n- Out of Scope (Explicit non-goals for v1):\n\nArchitecture / Technical Approach:\n- Key components / APIs / data model changes:\n- Constraints & assumptions:\n\nSuccess Metrics & KPIs:\n- Quantitative metric 1:\n- Qualitative signal:\n\nMilestones, Timeline & Top Risks:\n- Milestone 1 (Target date):\n- Risk & mitigation plan:',
    priority: 'high',
    duration: 60,
    templateTags: ['Work', 'Project', 'Planning', 'Engineering'],
    labels: [
      { id: 'def-lbl-spec', name: 'Project Spec', color: 'blue' },
      { id: 'def-lbl-plan', name: 'Planning', color: 'purple' },
    ],
    subtasks: [],
    checklists: [
      {
        id: 'def-ncl-3',
        title: 'Brief Sign-off & Kickoff',
        items: [
          { id: 'def-nci-5', text: 'Stakeholder & engineering review completed' },
          { id: 'def-nci-6', text: 'Milestones & deadlines created in Project Milestones tab' },
          { id: 'def-nci-6b', text: 'Risks & edge cases documented with owners' },
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
    title: 'Idea Scratchpad: [Theme / Concept]',
    description:
      'Core Spark / Inspiration:\nWhat caught your attention or sparked this idea?\n\nTarget Mood, Style & Audience:\n- Tone / vibe:\n- References (links, books, visuals):\n\nWild Ideas (No Self-Filtering Yet):\n1. Bold / weird angle:\n2. Minimal / clean angle:\n3. Remix / mashup angle:\n4. Contrarian angle:\n\nShortlist & Selection Criteria:\n- Most exciting idea & why:\n- Biggest constraint / resource needed:\n\nNext 30-Minute Prototype Experiment:\nWhat is the smallest clickable/sketchable version you can test today?',
    priority: 'low',
    duration: 35,
    templateTags: ['Creative', 'Personal', 'Planning'],
    labels: [
      { id: 'def-lbl-creative', name: 'Creative', color: 'pink' },
      { id: 'def-lbl-ideas', name: 'Brainstorm', color: 'yellow' },
    ],
    subtasks: [],
    checklists: [
      {
        id: 'def-ncl-4',
        title: 'From Spark to Prototype',
        items: [
          { id: 'def-nci-7', text: 'Collected 3+ reference links or visual inspirations' },
          { id: 'def-nci-8', text: 'Picked top 1 concept to prototype first' },
          { id: 'def-nci-9', text: 'Created starter task on board for the first experiment' },
        ],
      },
    ],
    isPublic: true,
  },
];

