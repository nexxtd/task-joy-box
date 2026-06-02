export const FAQS = [
  {
    id: 'create-task',
    question: 'How do I create a task?',
    answer: 'Click the "+ Add task" button on any column of your board, or open the Tasks page and use the quick-add bar at the top. Give your task a title, set a priority level (Low, Medium, High, or Urgent), add a due date, and write an optional description. You can also open the task card to add sub-tasks, checklists, labels, attachments, and a deep focus timer.',
  },
  {
    id: 'use-calendar',
    question: 'How do I use the calendar?',
    answer: 'Navigate to the Calendar page from the sidebar. Any task that has a due date will automatically appear on the calendar on the correct day. You can click an empty slot to add a new time block, drag existing tasks to reschedule them, and switch between day, week, and month views. Connect Google Calendar from Settings > Calendar to sync your events two-ways.',
  },
  {
    id: 'set-goal',
    question: 'How do I set a goal?',
    answer: 'Go to the Goals page and click "New Goal". Fill in the title, a short description, your numeric target (e.g. 100), the unit (e.g. pages, km, sessions), a category, and a timeframe. Once created, you can add sub-goals to break the objective down, link board tasks to it, and update your progress manually as you work towards it.',
  },
  {
    id: 'deep-focus',
    question: 'What is deep focus?',
    answer: 'Deep Focus is a distraction-free work mode tied to a specific task. Open any task card and click "Start Deep Focus" to enter a full-screen timer session. The screen clears of all other distractions and counts your focused time. When you finish or pause, the session is automatically saved to your History under Settings so you can review your focused work over time.',
  },
  {
    id: 'how-habits-work',
    question: 'How do habits work?',
    answer: 'On the Habits page you create daily habits with a title, category, and colour. Each day you mark a habit complete by clicking the day tile — this builds your streak counter. You can set a daily time commitment in minutes and a total duration in days (e.g. a 30-day challenge). Habits that are overdue are highlighted so you never lose track of your progress.',
  },
  {
    id: 'free-vs-premium',
    question: 'What is the difference between free and premium?',
    answer: 'Free users get full access to tasks, calendar, goals, habits, notes, and the Kanban board. Pro users unlock AI-powered features (task builder, insights), custom themes, accent colours, and advanced font options. Premium users get everything in Pro plus priority support, team collaboration workspaces, and full access to all future features. You can compare plans in detail on the Pricing page.',
  },
  {
    id: 'delete-row',
    question: 'How do I delete a column on the project board?',
    answer: 'On the Kanban board, hover over the column header you want to remove. A three-dot menu icon will appear — click it and select "Delete Column". You will be asked to confirm before anything is removed. Note that all tasks inside that column will also be deleted, so make sure to move any tasks you want to keep to another column first.',
  },
  {
    id: 'create-whiteboard',
    question: 'How do I create a whiteboard?',
    answer: 'From the Projects page, click the Whiteboard option in the top navigation, then click "New Whiteboard". Give it a name and an optional description, then click Create. Inside the whiteboard canvas you can add sticky notes, text blocks, document blocks, images, shapes, task cards, tables, and links. Use the connector tool to draw arrows between any two items.',
  },
  {
    id: 'ai-assistant',
    question: 'How do I use the AI assistant?',
    answer: 'Open the AI Chat page from the sidebar (the sparkles icon). Type a message and press Send or hit Enter. Planora can create new tasks directly on your board, update existing tasks, suggest priorities and schedules, and answer questions about your workload. You can also ask it to generate a daily plan or analyse your productivity patterns.',
  },
  {
    id: 'track-habit',
    question: 'How do I track a habit?',
    answer: 'Go to the Habits page and find the habit you want to log. Click the tile for today to mark it as complete — the tile will fill in and your streak counter will increase. If you miss a day your streak resets to zero. You can scroll back to see previous weeks and check your history. The habit card always shows your current streak and total completions.',
  },
  {
    id: 'connect-tasks-goals',
    question: 'How do I connect tasks to goals?',
    answer: 'Open the Goals page and click on a goal to expand it. In the goal detail panel, scroll to the "Linked Tasks" section and click "Link a task". A search panel will appear where you can find and attach tasks from any of your boards. Completing a linked task can count towards your goal progress automatically depending on your settings.',
  },
  {
    id: 'deep-focus-mode',
    question: 'How do I use deep focus mode?',
    answer: 'Click "Start Deep Focus" on any task card. A full-screen overlay will launch showing the task name and a timer. Press the play button to begin your session. You can pause at any time using the pause button, or end the session early with the stop button. All completed sessions are stored in Settings > History > Deep Focus so you can review your total focused time.',
  },
  {
    id: 'schedule-calendar',
    question: 'How do I schedule tasks on the calendar?',
    answer: 'When editing a task, set a due date and an optional due time. The task will then appear on the Calendar page at the right day and time. You can drag the task block to a different slot to reschedule it. For automated scheduling, use the Smart Schedule button in the Calendar header — the AI will arrange your open tasks into optimal time slots based on priority and your energy profile.',
  },
  {
    id: 'create-subtasks',
    question: 'How do I create sub-tasks?',
    answer: 'Open a task card by clicking on it. Inside the task detail view, scroll to the Sub-tasks section and click "Add sub-task". Type a title and press Enter. You can add as many sub-tasks as you need, and each one can be checked off independently. Sub-task completion is shown as a progress bar on the parent task card in the board view.',
  },
];

export interface Guide {
  id: string;
  title: string;
  content: string;
}

export interface ResourceCategory {
  id: string;
  label: string;
  guides: Guide[];
}

export const RESOURCES: ResourceCategory[] = [
  {
    id: 'getting-started',
    label: 'Getting Started',
    guides: [
      {
        id: 'gs-welcome',
        title: 'Welcome to Planora',
        content: 'Planora is your all-in-one productivity platform. It combines tasks, calendar, goals, habits, notes, and AI assistance in one place so you can manage everything from a single app.\n\nAfter signing up you will see the main dashboard. The left sidebar gives you access to every section. We recommend starting by creating your first task board, then exploring the calendar and goals sections.\n\nIf this is your first time, the tutorial will walk you through the core features step by step. You can replay the tutorial at any time from the Dashboard.',
      },
      {
        id: 'gs-profile',
        title: 'Setting up your profile',
        content: 'Open Settings from the bottom of the sidebar to personalise your experience.\n\nUnder Appearance you can choose between Light, Dark, or System theme. Pick an accent colour to match your style. Select a font family that feels comfortable to read.\n\nUnder Account you can update your display name and view your subscription tier. Google Calendar can be connected from the Calendar section of Settings.\n\nAll your preferences are saved automatically and sync across sessions.',
      },
      {
        id: 'gs-first-task',
        title: 'Creating your first task',
        content: 'Go to the Tasks page or open any board. Click the "+ Add task" button at the bottom of any column.\n\nGive your task a clear title. Set a priority — Urgent, High, Medium, or Low. Add a due date if it has a deadline. Write a description with any extra details.\n\nOnce saved the task appears on the board. You can drag it between columns to change its status. Click the task card to open the full detail view where you can add sub-tasks, checklists, attachments, labels, and start a Deep Focus session.',
      },
      {
        id: 'gs-navigate',
        title: 'Navigating the app',
        content: 'The left sidebar is the main navigation. Each icon represents a section:\n\n• Dashboard — your daily overview and energy summary\n• Tasks — your personal Kanban board\n• Projects — shared project boards for collaboration\n• Calendar — schedule view of all tasks with due dates\n• Goals — long-term objectives with progress tracking\n• Habits — daily habit tracker and streak counter\n• Notes — free-form notes with tags\n• Whiteboard — visual planning canvas\n• AI Chat — your Planora AI assistant\n• Insights — productivity analytics\n• Support — FAQs, resources, and help tickets\n• Settings — preferences and account management',
      },
    ],
  },
  {
    id: 'tasks',
    label: 'Tasks',
    guides: [
      {
        id: 'tasks-managing',
        title: 'Creating and managing tasks',
        content: 'Tasks are the core of Planora. Each task lives in a column on a board. The default columns are To Do, In Progress, and Done — but you can rename, recolour, and add as many columns as you need.\n\nTo create a task: click "+ Add task" in any column, fill in the title, and optionally set priority, due date, and description. Press Save or hit Enter.\n\nTo move a task: drag it to another column, or open the task and change the column from the dropdown.\n\nTo complete a task: drag it to your Done column, or open the task and tick the Completed checkbox. Completed tasks show a strikethrough and are dimmed.',
      },
      {
        id: 'tasks-subtasks',
        title: 'Sub-tasks and checklists',
        content: 'Sub-tasks let you break a large task into smaller steps. Open a task card and click "Add sub-task" in the Sub-tasks section. Each sub-task has its own title and can be checked off independently.\n\nChecklists are ordered lists inside a task — useful for step-by-step instructions or shopping lists. Click "Add checklist" inside a task and add items one by one. You can reorder items by dragging them.\n\nBoth sub-tasks and checklists show a completion progress bar on the board card so you can see how far through you are at a glance.',
      },
      {
        id: 'tasks-priority',
        title: 'Setting priorities and due dates',
        content: 'Every task has a priority level: Urgent, High, Medium, Low, or None. Urgent tasks are highlighted in red on the board. High priority tasks show an orange indicator.\n\nSet a due date by clicking the calendar icon in the task editor. You can also set a specific due time if needed. Tasks with due dates appear on the Calendar page.\n\nThe board can be sorted automatically by priority. Enable Auto-sort in Settings > Appearance to keep your most urgent tasks always visible at the top of each column.',
      },
      {
        id: 'tasks-deepfocus',
        title: 'Using Deep Focus mode',
        content: 'Deep Focus is a built-in Pomodoro-style work session tied to a single task. Open any task card and click the "Start Deep Focus" button.\n\nThe screen shifts to a full-screen focus view showing only the task name and a timer. Click the play button to start the timer. Use pause to take a break and resume to continue.\n\nWhen you click Stop the session is saved automatically. You can review all your past focus sessions in Settings > History > Deep Focus, where you can see total time focused and which tasks you worked on.',
      },
      {
        id: 'tasks-attachments',
        title: 'Attaching files to tasks',
        content: 'You can attach files directly to any task to keep related documents in one place. Open a task card and scroll to the Attachments section. Click "Attach file" and select a file from your device.\n\nSupported file types include images, PDFs, documents, spreadsheets, and more. Attached files are shown as thumbnails or file icons inside the task.\n\nAttachments can be downloaded at any time by clicking on them. To remove an attachment, hover over it and click the delete icon.',
      },
    ],
  },
  {
    id: 'projects',
    label: 'Projects',
    guides: [
      {
        id: 'projects-create',
        title: 'Creating a project board',
        content: 'Projects are shared Kanban boards you can collaborate on with your team. Go to the Projects page and click "New Project". Give it a name, description, and choose a colour.\n\nOnce created you will have a default board with columns. You can add tasks just like on your personal board. The difference is that project boards can have multiple members who all see and edit the same tasks in real time.',
      },
      {
        id: 'projects-columns',
        title: 'Managing columns',
        content: 'Each project board starts with a default set of columns. To add a new column, click "+ Add Column" at the right edge of the board and give it a name.\n\nTo rename a column: click the column header and edit the text inline. To change the colour: click the column menu and select a colour from the picker. To delete a column: click the column menu and choose Delete — this also deletes all tasks in that column.\n\nYou can reorder columns by dragging them left or right. Column order is saved automatically.',
      },
      {
        id: 'projects-invite',
        title: 'Inviting collaborators',
        content: 'To invite someone to your project, open the project settings and find the Invite section. Copy the invite code and share it with your collaborator.\n\nThey can join by entering the code in the Projects page under "Join a project". Once they join they will have Member access by default, which allows them to create, edit, and move tasks.\n\nProject owners have full control including the ability to rename the project, change settings, and remove members.',
      },
    ],
  },
  {
    id: 'calendar',
    label: 'Calendar',
    guides: [
      {
        id: 'cal-overview',
        title: 'Using the calendar view',
        content: 'The Calendar page shows all your tasks that have due dates laid out on a timeline. You can switch between Day, Week, and Month views using the buttons in the top right.\n\nEach task appears as a coloured block on the day it is due. The colour corresponds to the task priority — red for urgent, orange for high, and so on.\n\nClick any empty slot to create a new time block. Click an existing task block to open the task detail view.',
      },
      {
        id: 'cal-schedule',
        title: 'Scheduling tasks',
        content: 'To schedule a task on the calendar, open the task and set a due date and optionally a due time. The task will then appear as a block on that day.\n\nYou can drag task blocks to reschedule them — just drag to the new date or time slot and release. The task due date is updated automatically.\n\nFor recurring tasks, set a recurrence pattern (daily, weekly, monthly) in the task editor and a new instance will be created automatically when the current one is completed.',
      },
      {
        id: 'cal-google',
        title: 'Connecting Google Calendar',
        content: 'You can connect your Google Calendar to sync events both ways. Go to Settings > Calendar and click "Connect Google Calendar". You will be redirected to Google to authorise the connection.\n\nOnce connected, you can sync your Planora tasks to Google Calendar (tasks with due dates appear as Google events) and import Google Calendar events into Planora as tasks.\n\nTo disconnect, return to Settings > Calendar and click Disconnect.',
      },
      {
        id: 'cal-smart',
        title: 'Smart Schedule feature',
        content: 'Smart Schedule uses AI to automatically arrange your open tasks into the best time slots for the day. Click "Smart Schedule" in the Calendar header to activate it.\n\nThe AI considers task priority, due dates, your energy profile (morning, afternoon, evening preferences set in Settings), and existing calendar blocks to place tasks optimally.\n\nYou can review the suggested schedule before accepting it. Any changes you make to the AI-generated plan are saved as normal calendar events.',
      },
    ],
  },
  {
    id: 'goals',
    label: 'Goals',
    guides: [
      {
        id: 'goals-create',
        title: 'Creating and tracking goals',
        content: 'Go to the Goals page and click "New Goal". Fill in:\n\n• Title — a clear name for your goal\n• Description — what success looks like\n• Target — the numeric target (e.g. 100)\n• Unit — the unit of measurement (pages, sessions, km)\n• Category — Personal, Work, Health, etc.\n• Timeframe — 1 week, 1 month, 3 months, 1 year\n\nOnce created, the goal shows a progress bar. Click "Update Progress" to record your latest number. The progress bar and percentage update automatically.',
      },
      {
        id: 'goals-subgoals',
        title: 'Adding sub-goals',
        content: 'Sub-goals let you break a large objective into smaller milestones. Open a goal card and click "Add sub-goal". Give it a title and a numeric target.\n\nEach sub-goal has its own progress bar. Completing sub-goals contributes to the overall goal progress. You can have multiple sub-goals per goal.\n\nSub-goals are great for quarterly goals where each month is a milestone, or for project goals where each phase has its own target.',
      },
      {
        id: 'goals-tasks',
        title: 'Connecting tasks to goals',
        content: 'You can link tasks from your boards to a specific goal. Open the goal and click "Link task" in the connected tasks section. Search for the task you want to attach.\n\nLinked tasks show up inside the goal view. When you complete a linked task it can be counted towards your goal progress. This helps you see exactly which daily work is contributing to your bigger objectives.\n\nTo unlink a task, open the goal and click the remove button next to the linked task.',
      },
    ],
  },
  {
    id: 'habits',
    label: 'Habits',
    guides: [
      {
        id: 'habits-create',
        title: 'Creating a new habit',
        content: 'Go to the Habits page and click "New Habit". Fill in the habit title, choose a category (Health, Learning, Productivity, etc.), pick a colour, and optionally set:\n\n• Daily time — how many minutes per day this habit requires\n• Duration — total days to build the habit (e.g. 30, 60, 90 days)\n\nClick Save and your habit appears on the board ready for tracking. Habits are sorted by your preferred display order — you can drag them to reorder.',
      },
      {
        id: 'habits-tracking',
        title: 'Tracking daily habits',
        content: 'Each habit card shows a grid of the past 7 days. Click the tile for today to mark the habit as complete. The tile fills in with the habit colour and your streak count increases by one.\n\nIf you miss a day, the tile stays empty and your streak resets to zero. You cannot backfill a missed day — habits are designed to build real daily consistency.\n\nTo edit a habit (title, category, colour, time), click the three-dot menu on the habit card and choose Edit.',
      },
      {
        id: 'habits-streaks',
        title: 'Understanding streaks',
        content: 'Your streak is the number of consecutive days you have completed a habit without a gap. The streak counter appears prominently on each habit card.\n\nA streak of 7 or more days shows a fire icon. Your longest streak ever is also recorded even if your current streak has reset.\n\nBuilding a long streak creates momentum and shows you how consistent you have been. The habit tracker shows your overall completion rate as a percentage based on the past 30 days.',
      },
    ],
  },
  {
    id: 'notes',
    label: 'Notes',
    guides: [
      {
        id: 'notes-create',
        title: 'Creating notes',
        content: 'Go to the Notes page and click "New Note". Give the note a title and start typing in the content area. Notes support plain text and can hold as much content as you need.\n\nChoose a background colour for the note card — this helps you visually group related notes. Notes are shown in a masonry grid layout so you can see many at once.\n\nNotes are saved automatically as you type. To delete a note, open it and click the delete button, or hover over the note card and click the trash icon.',
      },
      {
        id: 'notes-tags',
        title: 'Organising with tags',
        content: 'Tags help you group and filter notes. Open a note and click "Add tag". You can create a new tag by typing a name and choosing a colour, or select an existing tag from the list.\n\nA note can have multiple tags. Tags appear as small coloured chips below the note title. To filter your notes by tag, click the tag name in the filter bar at the top of the Notes page.\n\nTo manage your tags (rename or delete), open the Tags panel from the top of the Notes page.',
      },
      {
        id: 'notes-pin',
        title: 'Pinning important notes',
        content: 'Pin your most important notes so they always appear at the top of the notes grid. Open a note and click the pin icon in the top right, or hover over a note card and click the pin shortcut.\n\nPinned notes show a pin indicator and are separated from unpinned notes at the top of the page. You can have multiple notes pinned at the same time.\n\nTo unpin a note, click the pin icon again.',
      },
    ],
  },
  {
    id: 'whiteboard',
    label: 'Whiteboard',
    guides: [
      {
        id: 'wb-create',
        title: 'Creating a whiteboard',
        content: 'From the Projects page, click Whiteboard in the navigation, then click "New Whiteboard". Give it a name and an optional description.\n\nThe whiteboard opens to a blank infinite canvas. Use the toolbar on the left to select the type of block you want to place. Click anywhere on the canvas to drop a block at that position.\n\nWhiteboards are saved automatically as you work. You can have as many whiteboards as you need — use them for brainstorming, planning, mind maps, or visual project layouts.',
      },
      {
        id: 'wb-tools',
        title: 'Using the drawing tools',
        content: 'The whiteboard toolbar gives you these block types:\n\n• Sticky note — a coloured card for quick ideas\n• Text block — larger formatted text\n• Document block — a longer text area for notes and docs\n• Image block — upload or link to an image\n• Shape — rectangles, circles, diamonds, and more\n• Task block — embed a Kanban-style task list\n• Table — a simple data grid\n• Link block — a clickable URL card\n• Comment block — a discussion thread\n\nEach block can be moved, resized, and edited by clicking on it.',
      },
      {
        id: 'wb-connect',
        title: 'Connecting elements',
        content: 'You can draw connections (arrows) between any two blocks to show relationships. Select the Connector tool from the toolbar. Hover over the source block until a connection point appears, then click and drag to the target block.\n\nConnections are curved by default. You can change the style (straight, curved, or elbow) by clicking the connection line.\n\nConnections are great for mind maps, flow charts, dependency diagrams, and anywhere you need to show how ideas or tasks relate to each other.',
      },
    ],
  },
  {
    id: 'ai',
    label: 'AI Features',
    guides: [
      {
        id: 'ai-chat',
        title: 'Using the AI assistant',
        content: 'The Planora AI assistant is available on the AI Chat page. Type any request in the chat input and press Send.\n\nExamples of what you can ask:\n• "Create a task to review the Q3 report by Friday, high priority"\n• "What are my most urgent tasks this week?"\n• "Move the design review task to In Progress"\n• "Generate a study plan for learning React in 30 days"\n\nThe AI remembers the context of your conversation within the session and can reference your existing tasks and goals.',
      },
      {
        id: 'ai-task-builder',
        title: 'AI task creation',
        content: 'The AI can create tasks directly on your board from a natural language description. Just tell it what you need:\n\n"Add a task: write monthly report, due next Monday, high priority, in the Work column"\n\nThe AI will confirm what it created and the task will appear on your board immediately. You can ask it to create multiple tasks at once or to create a whole project breakdown from a single description.\n\nPro and Premium users get unlimited AI task creation.',
      },
      {
        id: 'ai-insights',
        title: 'AI insights and analysis',
        content: 'The Insights page (available to Pro and Premium users) uses AI to analyse your productivity patterns. It looks at your task completion rates, focus session history, energy levels, and habit streaks to surface personalised recommendations.\n\nClick "Run Analysis" to get a fresh report. The AI will highlight what is going well, where you have blockers, and suggest specific changes to improve your workflow.\n\nInsights are generated fresh each time you run them so they always reflect your current situation.',
      },
      {
        id: 'ai-schedule',
        title: 'Smart scheduling with AI',
        content: 'The Smart Schedule feature in the Calendar uses AI to automatically fill your day with the right tasks in the right order.\n\nIt works by combining:\n• Task priority and due dates\n• Your energy profile (when you are at high, medium, or low energy)\n• Existing calendar blocks and commitments\n• Estimated task durations\n\nClick "Smart Schedule" in the Calendar header and the AI will generate a suggested daily plan. You can accept it as-is or make manual adjustments. Tasks not scheduled today remain in your backlog for future days.',
      },
    ],
  },
];
