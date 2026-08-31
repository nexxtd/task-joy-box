import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useGoalsContext } from '@/context/GoalsContext';
import { useAuth } from '@/context/AuthContext';
import { Attachment, ChecklistItem, DEFAULT_LABELS, Label, LabelColor, Priority, PRIORITY_CONFIG, Subtask, Task, TaskStatus, TaskTemplate, LABEL_COLORS } from '@/types/board';
import { fetchGoalTemplates as fetchTemplates, createGoalTemplate as createTemplate, updateGoalTemplate as updateTemplate, deleteGoalTemplate as deleteTemplateApi } from '@/services/goalTemplateService';
import { createTag, deleteTag, updateTag, fetchTags, type SharedTag } from '@/services/tagService';
import { fileToDataUrl as dataUrlForFile } from '@/lib/fileDataUrl';
import DraggableImageGrid from '@/components/shared/DraggableImageGrid';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Brain,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Clock3,
  Edit3,
  GripVertical,
  FolderKanban,
  Image,
  Paperclip,
  Plus,
  Save,
  Search,
  Tag,
  Sparkles,
  Star,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { useDeepFocus } from '@/hooks/useDeepFocus';
import { useAnchoredPopup } from '@/hooks/useAnchoredPopup';
import CreateTaskModal, { type CreateTaskInitialValues } from '@/components/CreateTaskModal';
import TagsModal from '@/components/shared/TagsModal';
import AttachmentRow from '@/components/AttachmentRow';
import { CircleToggle, SquareToggle } from '@/components/ToggleComponents';
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from '@hello-pangea/dnd';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import CenteredDragClone from '@/components/CenteredDragClone';

const PRIORITY_FILTERS: Array<'all' | 'urgent' | 'high' | 'medium' | 'low'> = ['all', 'urgent', 'high', 'medium', 'low'];
const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: 'to_do', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'review', label: 'Review' },
  { value: 'completed', label: 'Completed' },
];

type AnalysisTab = 'overview' | 'deadlines' | 'progress' | 'priority';

type AnalysisFactTone = 'ok' | 'warn' | 'bad' | 'neutral';

interface AnalysisFact {
  label: string;
  value: string;
  tone: AnalysisFactTone;
}

interface AnalysisTaskItem {
  taskId: string;
  title: string;
  statusLabel: string;
  facts: AnalysisFact[];
  reasoning: string;
  suggestion?: string;
}

interface AnalysisResult {
  title: string;
  summary: string;
  lines: Array<{ text: string; taskId?: string }>;
  items?: AnalysisTaskItem[];
}

const PRIORITY_PTS: Record<Priority, number> = { urgent: 4, high: 3, medium: 2, low: 1, none: 0 };

const analysisDueTime = (t: Task): number | null => {
  if (!t.dueDate) return null;
  const d = new Date(`${t.dueDate}T${t.dueTime || '23:59'}`);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
};

const analysisDaysUntil = (ts: number) => Math.floor((ts - Date.now()) / 86400000);

const analysisDaysSince = (iso?: string): number | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
};

const analysisTaskBreakdown = (t: Task) => {
  const legacySubtasks = t.checklists.find(list => list.title.toLowerCase().trim() === 'subtasks');
  const subtasks = (t.subtasks && t.subtasks.length > 0) ? t.subtasks : (legacySubtasks?.items || []);
  const subDone = subtasks.filter(s => s.completed).length;
  const checklistLists = t.checklists.filter(list => list.id !== legacySubtasks?.id);
  const checklistTotal = checklistLists.reduce((s, l) => s + l.items.length, 0);
  const checklistDone = checklistLists.reduce((s, l) => s + l.items.filter(i => i.completed).length, 0);
  return { subtaskTotal: subtasks.length, subDone, checklistTotal, checklistDone };
};

const buildDeadlineItems = (activeScope: Task[]): AnalysisTaskItem[] =>
  activeScope
    .sort((a, b) => (analysisDueTime(a) ?? Number.MAX_SAFE_INTEGER) - (analysisDueTime(b) ?? Number.MAX_SAFE_INTEGER))
    .map(task => {
      const due = analysisDueTime(task);
      const prio = task.priority === 'none' ? 'unprioritized' : PRIORITY_CONFIG[task.priority].label.toLowerCase();
      const { subtaskTotal, subDone, checklistTotal, checklistDone } = analysisTaskBreakdown(task);
      const openWork = (subtaskTotal - subDone) + (checklistTotal - checklistDone);
      if (due == null) {
        const contradiction = task.priority === 'urgent' || task.priority === 'high';
        return {
          taskId: task.id,
          title: task.title,
          statusLabel: getStatusLabel(getTaskStatus(task)),
          facts: [
            { label: 'Due date', value: 'Not set', tone: 'neutral' },
            { label: 'Urgency', value: contradiction ? 'Unanchored urgency' : 'No deadline pressure', tone: contradiction ? 'warn' : 'neutral' },
            { label: 'Open work', value: openWork > 0 ? `${openWork} item${openWork > 1 ? 's' : ''} open` : 'Nothing open', tone: 'neutral' },
          ],
          reasoning: contradiction
            ? `"${task.title}" is tagged ${prio} but has no due date at all. Nothing in the data is forcing it forward - a ${prio} label with no deadline has no anchor, so it gets deprioritized piece by piece as dated tasks pile up. This is the most fragile shape in the view: urgent work nobody can actually be late on.`
            : `"${task.title}" has no due date, and at ${prio} priority there is nothing pulling it into the schedule. Tasks without deadlines only get worked on once everything dated is done, which rarely happens, so this one is at risk of being quietly forgotten. If it matters it needs a date; if it genuinely doesn't matter, that is a sign it may not need to stay active at all.`,
          suggestion: contradiction
            ? 'Set a concrete due date in the next few days to make the urgency real - or drop the priority.'
            : 'Give it a due date within the next week, or consciously park it until it has one.',
        };
      }
      const days = analysisDaysUntil(due);
      let urgency: string;
      let tone: AnalysisFactTone;
      let reasoning: string;
      let suggestion: string | undefined;
      if (days < 0) {
        urgency = `Overdue by ${-days}d`;
        tone = 'bad';
        reasoning = `"${task.title}" was due ${formatDate(task.dueDate)} - ${-days} day${-days > 1 ? 's' : ''} ago - and still sits ${getTaskStatus(task) === 'to_do' ? 'unstarted' : 'in progress'}. Overdue tasks drop out of any ordered "up next" surface, so nothing pulls them back; each passing day quietly raises the odds this one is never finished. ${openWork > 0 ? `It still has ${openWork} open item${openWork > 1 ? 's' : ''} to close out.` : 'No breakdown work is left open, but the overdue date itself is still unresolved.'}`;
        suggestion = 'Re-date it within the next 2-3 days, or downscope it and close it out this week.';
      } else if (days === 0) {
        urgency = 'Due today';
        tone = 'bad';
        reasoning = `"${task.title}" hits its deadline today with ${openWork > 0 ? `${openWork} open item${openWork > 1 ? 's' : ''} still outstanding` : 'no outstanding breakdown items'}. There is zero slack left, so whatever remains has to be done now or the date will silently pass. The usual trap is pushing a due-today task to tomorrow without formally rescheduling it, which is exactly how tasks turn into overdue ones.`;
        suggestion = 'Finish it today, or explicitly re-date it before the day ends.';
      } else if (days <= 3) {
        urgency = `Due in ${days}d`;
        tone = 'warn';
        reasoning = `"${task.title}" is due in ${days} day${days > 1 ? 's' : ''} (${formatDate(task.dueDate)}) - the window where the deadline is near enough to matter but far enough to feel safe. ${openWork > 0 ? `It still has ${openWork} open item${openWork > 1 ? 's' : ''} to get through, so the remaining effort is a real block of time.` : 'Its breakdown is fully done, so completion depends only on actually doing it.'} At ${prio} priority, the next ${days} day${days > 1 ? 's' : ''} are effectively the budget for finishing it.`;
        suggestion = 'Start it within the next 48 hours - do not let it reach "due tomorrow".';
      } else if (days <= 7) {
        urgency = `Due in ${days}d`;
        tone = 'warn';
        reasoning = `"${task.title}" lands ${days} days out (${formatDate(task.dueDate)}), in the 3-7 day band where scheduling usually goes wrong: not urgent yet, so it is easy to keep pushing. ${openWork > 0 ? `It carries ${openWork} open item${openWork > 1 ? 's' : ''} of work, which means the real effort spans more than a day.` : 'No breakdown items are open, but the task itself is still not completed.'} If the next few days fill up, this is the task that quietly drifts into next week.`;
        suggestion = `Slot it into the schedule before ${formatDate(task.dueDate)} rather than waiting for the deadline to arrive.`;
      } else {
        urgency = `Due in ${days}d`;
        tone = 'ok';
        reasoning = `"${task.title}" is ${days} days out (${formatDate(task.dueDate)}) - a comfortable runway with no immediate pressure. ${openWork > 0 ? `The only watch point is its ${openWork} open item${openWork > 1 ? 's' : ''} of breakdown work: plenty of time, but the longer the runway, the easier it is to defer.` : 'No breakdown items are open, so completing it is straightforward whenever it gets scheduled.'} For a ${prio} task this window is healthy rather than risky.`;
        suggestion = undefined;
      }
      return {
        taskId: task.id,
        title: task.title,
        statusLabel: getStatusLabel(getTaskStatus(task)),
        facts: [
          { label: 'Due date', value: `${formatDate(task.dueDate)}${task.dueTime ? ` · ${task.dueTime}` : ''}`, tone: 'neutral' },
          { label: 'Urgency', value: urgency, tone },
          { label: 'Open work', value: openWork > 0 ? `${openWork} item${openWork > 1 ? 's' : ''} open` : 'Nothing open', tone: 'neutral' },
        ],
        reasoning,
        suggestion,
      };
    });

const buildAnalysisOverview = (scope: Task[], activeScope: Task[]): AnalysisResult => {
  const completedCount = scope.filter(t => isTaskCompleted(t)).length;
  const reviewCount = scope.filter(t => getTaskStatus(t) === 'review').length;
  const withSubtasks = scope.filter(t => (t.subtasks || []).length > 0).length;
  const withChecklist = scope.filter(t => t.checklists.some(cl => cl.items.length > 0)).length;
  return {
    title: 'Goal Overview',
    summary: `${scope.length} task${scope.length !== 1 ? 's' : ''} in the current view, ${activeScope.length} still open. The tabs below break this down task-by-task: Deadlines reads the due-date pressure and risk on each task, Progress checks whether each task is actually moving, and Priority re-tests whether each priority tag still holds up.`,
    lines: [
      { text: `${activeScope.length} active` },
      { text: `${completedCount} completed` },
      { text: `${reviewCount} in review` },
      { text: `${withSubtasks} with sub-tasks` },
      { text: `${withChecklist} with checklist items` },
    ],
  };
};

const buildProgressItems = (activeScope: Task[]): AnalysisTaskItem[] =>
  activeScope
    .sort((a, b) => (analysisDaysSince(b.updatedAt || b.createdAt) ?? 0) - (analysisDaysSince(a.updatedAt || a.createdAt) ?? 0))
    .map(task => {
      const { subtaskTotal, subDone, checklistTotal, checklistDone } = analysisTaskBreakdown(task);
      const totalItems = subtaskTotal + checklistTotal;
      const doneItems = subDone + checklistDone;
      const openItems = totalItems - doneItems;
      const pct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : null;
      const lastTouched = analysisDaysSince(task.updatedAt || task.createdAt);
      const est = Math.max(0, Number(task.duration) || 0);
      const subTotalMin = task.subtasks.reduce((s, st) => s + Math.max(0, Number(st.durationMinutes) || 0), 0);
      const stalled = pct !== null && pct === 0 && lastTouched !== null && lastTouched >= 7;
      const facts: AnalysisFact[] = [
        { label: 'Status', value: getStatusLabel(getTaskStatus(task)), tone: getTaskStatus(task) === 'in_progress' ? 'ok' : 'neutral' },
        { label: 'Sub-tasks', value: subtaskTotal > 0 ? `${subDone}/${subtaskTotal} done` : 'None', tone: subtaskTotal > 0 && subDone === subtaskTotal ? 'ok' : 'neutral' },
        { label: 'Checklist', value: checklistTotal > 0 ? `${checklistDone}/${checklistTotal} done` : 'None', tone: checklistTotal > 0 && checklistDone === checklistTotal ? 'ok' : 'neutral' },
        { label: 'Last activity', value: lastTouched == null ? '-' : lastTouched === 0 ? 'Today' : `${lastTouched}d ago`, tone: stalled ? 'bad' : 'neutral' },
      ];
      if (est > 0 && subtaskTotal > 0 && est !== subTotalMin) {
        facts.push({
          label: 'Est. vs sub-tasks',
          value: `${formatDuration(est)} est - ${subTotalMin > 0 ? formatDuration(subTotalMin) : '0 min'} in sub-tasks`,
          tone: 'warn',
        });
      }
      let reasoning: string;
      let suggestion: string | undefined;
      if (totalItems === 0) {
        reasoning = `"${task.title}" has no sub-tasks and no checklist items, so there is no breakdown to measure progress against - only its status (${getStatusLabel(getTaskStatus(task))}) and its last activity ${lastTouched == null ? '(not recorded)' : lastTouched === 0 ? 'today' : `${lastTouched} day${lastTouched > 1 ? 's' : ''} ago`}. A task with no decomposition is hard to verify: "in progress" can mean almost-done or barely-touched. ${est > 0 ? `It is estimated at ${formatDuration(est)}, which at least gives it a concrete size.` : 'Without an estimate or breakdown, nothing here tracks how far along it really is.'}`;
        suggestion = est > 0 || lastTouched == null ? undefined : 'Add checklist items so progress becomes measurable, or finish it.';
      } else if (pct === 100) {
        reasoning = `"${task.title}" shows ${doneItems}/${totalItems} items done - 100% of its breakdown is complete, yet the task itself still reads as ${getStatusLabel(getTaskStatus(task))}${lastTouched != null && lastTouched > 0 ? ` and has been untouched for ${lastTouched} day${lastTouched > 1 ? 's' : ''}` : ''}. Everything planned is finished; the only remaining step is marking it completed, and the longer that waits, the easier it is to lose the completion entirely.`;
        suggestion = 'Mark it completed - all breakdown work is done.';
      } else if (stalled) {
        reasoning = `"${task.title}" has ${totalItems} planned item${totalItems > 1 ? 's' : ''} with ${doneItems} done, and nothing has changed in ${lastTouched} day${lastTouched > 1 ? 's' : ''}. On paper it is ${pct}% complete, but in practice it has been idle for over a week - not slow progress, but stalled. The plan exists and execution stopped near the start, which is the most common way tasks quietly die.`;
        suggestion = 'Restart it this week, or consciously cut it from the active set.';
      } else if (pct === 0) {
        reasoning = `"${task.title}"'s breakdown is fully untouched (0/${totalItems} items done) but it was worked on ${lastTouched == null ? 'recently' : lastTouched === 0 ? 'today' : `${lastTouched} day${lastTouched > 1 ? 's' : ''} ago`} - early motion without execution yet. It has been picked up, but none of the actual work has started, so it still ranks as "about to start" rather than in progress.`;
        suggestion = lastTouched !== null && lastTouched <= 2 ? 'Start the first checklist item now, while the momentum exists.' : undefined;
      } else {
        const recently = lastTouched != null && lastTouched <= 3;
        reasoning = recently
          ? `"${task.title}" is genuinely moving: ${doneItems}/${totalItems} items done (${pct}%), last touched${lastTouched === 0 ? ' today' : ` ${lastTouched} day${lastTouched > 1 ? 's' : ''} ago`}. With ${openItems} item${openItems > 1 ? 's' : ''} left, the momentum looks real - this is one of the tasks actually trending toward completion.`
          : `"${task.title}" shows partial progress - ${doneItems}/${totalItems} items done (${pct}%) - but the last change was ${lastTouched == null ? 'some time ago' : `${lastTouched} day${lastTouched > 1 ? 's' : ''} ago`}, which puts it in a stalled-midway state: work started, then paused. ${openItems > 0 ? `The remaining ${openItems} item${openItems > 1 ? 's' : ''} still represent a real block of effort.` : ''}`;
        suggestion = recently ? undefined : 'Pick it up again within the next few days, or it will slip from half-done to abandoned.';
      }
      return { taskId: task.id, title: task.title, statusLabel: getStatusLabel(getTaskStatus(task)), facts, reasoning, suggestion };
    });

const buildPriorityItems = (activeScope: Task[]): AnalysisTaskItem[] =>
  activeScope.map(task => {
    const due = analysisDueTime(task);
    const days = due == null ? null : analysisDaysUntil(due);
    const { subtaskTotal, subDone, checklistTotal, checklistDone } = analysisTaskBreakdown(task);
    const totalItems = subtaskTotal + checklistTotal;
    const doneItems = subDone + checklistDone;
    const openItems = totalItems - doneItems;
    const pct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : null;
    const dueText = due == null ? 'no due date' : days! < 0 ? `overdue by ${-days} day${-days > 1 ? 's' : ''}` : days === 0 ? 'due today' : `due in ${days} day${days > 1 ? 's' : ''}`;
    let reasoning: string;
    let suggestion: string;
    let tone: AnalysisFactTone;
    switch (task.priority) {
      case 'urgent':
        if (days != null && days <= 2) {
          tone = 'ok';
          reasoning = `"${task.title}" is Urgent, and the data backs it up: ${days! < 0 ? `it is ${-days} day${-days > 1 ? 's' : ''} past due` : days === 0 ? 'it is due today' : `it lands in ${days} day${days > 1 ? 's' : ''}`}, and ${openItems > 0 ? `it still has ${openItems} open item${openItems > 1 ? 's' : ''}` : 'its breakdown is fully done'}. The label matches the deadline pressure exactly, so the urgency is honest.`;
          suggestion = `Keep it Urgent - ${days! < 0 ? 'the overdue date' : 'the deadline'} justifies it. Just make sure it is actually worked on ${days! < 0 ? 'immediately' : 'before the date arrives'}.`;
        } else if (days != null && days <= 7) {
          tone = 'warn';
          reasoning = `"${task.title}" is Urgent with a deadline ${days} day${days > 1 ? 's' : ''} out, plus ${openItems > 0 ? `${openItems} open item${openItems > 1 ? 's' : ''}` : 'no remaining breakdown work'}. The tag is still defensible at this distance, but Urgent should mean it is one of the next things you touch, not merely scheduled - this is where the label starts to outrun the actual plan.`;
          suggestion = 'Start it within the next 48 hours to keep the label honest.';
        } else {
          tone = 'bad';
          reasoning = `"${task.title}" carries the strongest label available, yet nothing in the data earns it: ${dueText}, with only ${openItems} open item${openItems !== 1 ? 's' : ''}. An urgent tag with no deadline and no heavy workload is how tasks become permanently stressful while still being deferred.`;
          suggestion = 'Demote it to Medium, or give it a real deadline and keep Urgent.';
        }
        break;
      case 'high':
        if (due != null && days! <= 5) {
          tone = 'ok';
          reasoning = `"${task.title}" is High and the conditions agree: it is ${dueText} with ${openItems > 0 ? `${openItems} open item${openItems > 1 ? 's' : ''}` : 'all breakdown work done'}. High is the right band for work with a near-term deadline, so the ordering holds.`;
          suggestion = `Keep it High - the ${days! < 0 ? 'overdue' : 'approaching'} deadline keeps it justified.`;
        } else if (due != null && days! <= 14) {
          tone = 'ok';
          reasoning = `"${task.title}" is High with a deadline ${days!} day${days! > 1 ? 's' : ''} out. That is a medium-range window, and a High tag there is defensible - close enough that it should stay visible, not so close that it needs to run the show.`;
          suggestion = 'Keep it High; reassess once it moves inside the 5-day window.';
        } else if (openItems >= 3) {
          tone = 'warn';
          reasoning = `"${task.title}" is High with a substantial workload attached - ${openItems} open item${openItems > 1 ? 's' : ''} - but ${dueText}. A heavy High-priority task with an open-ended date tends to sit at the top of the list while nothing concrete forces it forward.`;
          suggestion = 'Either set a target date to justify High, or trim the workload before it lingers.';
        } else {
          tone = 'ok';
          reasoning = `"${task.title}" is High: a small, focused task with ${openItems > 0 ? `${openItems} open item${openItems > 1 ? 's' : ''} ` : 'nothing open '}and ${dueText}. The tag gives it weight without needing a deadline; it holds up fine as long as it keeps getting picked.`;
          suggestion = 'Keep it High, but park it as Low if it keeps getting skipped for two weeks.';
        }
        break;
      case 'medium':
        if (days != null && days < 0) {
          tone = 'warn';
          reasoning = `"${task.title}" is already ${-days} day${-days > 1 ? 's' : ''} past due but only sits at Medium. Either the deadline stopped mattering (renegotiate it or close the task) or it matters more than Medium admits - an overdue task that is genuinely unimportant should be Low or closed, not drifting.`;
          suggestion = 'Re-date it and raise it to High, or consciously drop it to Low and close it out.';
        } else if (days != null && days <= 3) {
          tone = 'warn';
          reasoning = `"${task.title}" is ${dueText}, which makes it one of the nearest deadlines in the active set - yet it is only Medium. The closer a deadline gets, the more the Medium tag understates it: in any priority-sorted view this task will sit below work with far fewer time constraints.`;
          suggestion = 'Bump it to High for now - its deadline is inside the 72-hour window.';
        } else {
          tone = 'ok';
          reasoning = `"${task.title}" sits at Medium, and for a task that is ${dueText} with ${openItems > 0 ? `${openItems} open item${openItems > 1 ? 's' : ''}` : 'an empty breakdown'} that is a defensible middle band - real but not immediate. It belongs in the queue, just not at the front.`;
          suggestion = 'Keep it at Medium; elevate it if its deadline moves inside 3 days.';
        }
        break;
      case 'low':
        if (days != null && days <= 5) {
          tone = 'bad';
          reasoning = `"${task.title}" is Low but carries a deadline that is ${dueText}. That is a contradiction the data cannot square: either it matters enough to hit that date (then Low is wrong) or it does not matter (then the deadline is noise). Low-priority tasks with real deadlines are exactly the ones that quietly slip past the date.`;
          suggestion = 'Raise it to High/Medium, or remove the deadline and accept it stays parked.';
        } else if (openItems >= 3) {
          tone = 'warn';
          reasoning = `"${task.title}" is Low yet carries ${openItems} open item${openItems > 1 ? 's' : ''} of work - a deceptively large footprint for something tagged low priority. If it truly is Low, that work will sit far down every ordered list; if the work is important, the tag is holding it back.`;
          suggestion = 'Either trim the workload down, or admit it is more than Low and re-tag it.';
        } else {
          tone = 'ok';
          reasoning = `"${task.title}" is Low with ${openItems > 0 ? `${openItems} open item${openItems > 1 ? 's' : ''} ` : 'no open breakdown items '}and ${dueText} - fully consistent. Nothing scheduled expects it soon, so the low tag costs nothing and keeps the list honest.`;
          suggestion = 'Keep it at Low; revisit once the higher-priority queue clears.';
        }
        break;
      default:
        if (due != null && days! <= 3) {
          tone = 'warn';
          reasoning = `"${task.title}" has no priority tag at all, but it is ${dueText} - the least-important-looking task becomes the most important one when it holds the nearest deadline. Unprioritized tasks are invisible to every priority-based view, which makes this the riskiest configuration in the set.`;
          suggestion = `Tag it High (or at least Medium) - it has a deadline inside ${days} day${days! > 1 ? 's' : ''}.`;
        } else if (openItems >= 5) {
          tone = 'warn';
          reasoning = `"${task.title}" is the task with no priority tag and the largest workload in view - ${openItems} open item${openItems > 1 ? 's' : ''}. The absence of a tag means it cannot surface in priority ordering even though it represents a significant block of work.`;
          suggestion = 'Give it a priority - Medium at minimum, given its size.';
        } else {
          tone = 'ok';
          reasoning = `"${task.title}" is unprioritized, and with ${dueText} and ${openItems > 0 ? `${openItems} open item${openItems > 1 ? 's' : ''}` : 'no open work'} nothing critical depends on tagging it today. But any task without a priority value stays invisible to priority-based views, so the tag is worth adding whenever you next touch it.`;
          suggestion = 'Give it a priority so it shows up in ordered views.';
        }
    }
    return {
      taskId: task.id,
      title: task.title,
      statusLabel: getStatusLabel(getTaskStatus(task)),
      facts: [
        { label: 'Priority', value: task.priority === 'none' ? 'Unprioritized' : PRIORITY_CONFIG[task.priority].label, tone },
        { label: 'Due', value: due == null ? 'Not set' : `${formatDate(task.dueDate)}${task.dueTime ? ` · ${task.dueTime}` : ''}`, tone: 'neutral' },
        { label: 'Progress', value: pct == null ? 'No breakdown' : `${doneItems}/${totalItems} items (${pct}%)`, tone: 'neutral' },
      ],
      reasoning,
      suggestion,
    };
  });

const STATUS_CONFIG: Record<TaskStatus, { label: string; className: string }> = {
  to_do: { label: 'To Do', className: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'In Progress', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  review: { label: 'Review', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  completed: { label: 'Completed', className: 'bg-label-green/15 text-label-green' },
};

const formatDate = (value?: string) => {
  if (!value) return 'No due date';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatDuration = (minutes: number) => {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

const isTaskCompleted = (task: Task) => Boolean(task.completed || task.status === 'completed');

const getTaskStatus = (task: Task): TaskStatus => {
  if (task.status) return task.status;
  return task.completed ? 'completed' : 'to_do';
};

const getStatusLabel = (status: TaskStatus) =>
  STATUS_OPTIONS.find(o => o.value === status)?.label || 'To Do';

export const fileToDataUrl = (file: File): Promise<string> => dataUrlForFile(file);

const imageToDataUrl = (file: File): Promise<string> => dataUrlForFile(file);

const daysUntilAutoDelete = (completedAt?: string) => {
  if (!completedAt) return 5;
  const started = new Date(completedAt);
  if (Number.isNaN(started.getTime())) return 5;
  const expires = new Date(started);
  expires.setDate(expires.getDate() + 5);
  return Math.max(0, Math.ceil((expires.getTime() - Date.now()) / 86400000));
};

type DueWarningLevel = null | 'soon' | 'imminent' | 'overdue';

const getDueTimeWarning = (task: Task): DueWarningLevel => {
  if (!task.dueDate || isTaskCompleted(task)) return null;
  const due = task.dueTime
    ? new Date(`${task.dueDate}T${task.dueTime}`)
    : new Date(`${task.dueDate}T23:59:59`);
  if (Number.isNaN(due.getTime())) return null;
  const diffMs = due.getTime() - Date.now();
  if (diffMs < 0) return 'overdue';
  if (diffMs < 30 * 60 * 1000) return 'imminent';
  if (diffMs < 2 * 60 * 60 * 1000) return 'soon';
  return null;
};

const dueBadgeClass = (warning: DueWarningLevel, base: boolean) => {
  if (base) {
    if (warning === 'overdue' || warning === 'imminent') return 'bg-destructive/15 text-destructive';
    if (warning === 'soon') return 'bg-orange-500/15 text-orange-600 dark:text-orange-400';
  }
  return 'bg-muted text-muted-foreground';
};

const TAG_COLOR_OPTIONS: LabelColor[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'];

const randomTagColor = (): LabelColor => TAG_COLOR_OPTIONS[Math.floor(Math.random() * TAG_COLOR_OPTIONS.length)] || 'blue';

const normalizeTagName = (value: string) => value.trim().replace(/\s+/g, ' ');

const SHARED_TAG_PREFIX = 'shared-tag-';
const SHARED_COLOR_MAP: Record<string, LabelColor> = {
  red: 'red',
  orange: 'orange',
  yellow: 'yellow',
  green: 'green',
  blue: 'blue',
  purple: 'purple',
  pink: 'pink',
};
const SHARED_COLOR_HEX_MAP: Array<{ hex: string; color: LabelColor }> = [
  { hex: '#ef4444', color: 'red' },
  { hex: '#f97316', color: 'orange' },
  { hex: '#eab308', color: 'yellow' },
  { hex: '#22c55e', color: 'green' },
  { hex: '#3b82f6', color: 'blue' },
  { hex: '#8b5cf6', color: 'purple' },
  { hex: '#ec4899', color: 'pink' },
];
const sharedTagLabelId = (id: number) => `${SHARED_TAG_PREFIX}${id}`;
const sharedTagToLabel = (tag: SharedTag): Label => ({
  id: sharedTagLabelId(tag.id),
  name: tag.name,
  color: SHARED_COLOR_MAP[tag.color.toLowerCase()]
    || SHARED_COLOR_HEX_MAP.find(item => item.hex.toLowerCase() === tag.color.toLowerCase())?.color
    || 'blue',
});

interface ProjectMeta {
  id: number;
  name: string;
  color: string;
  description: string;
}

interface NewTaskSubtaskDraft {
  id: string;
  text: string;
  durationMinutes: number;
}

interface AIGeneratedTask {
  title: string;
  description: string;
  priority: Priority;
  startDate: string | null;
  startTime: string | null;
  dueDate: string | null;
  dueTime: string | null;
  duration: number | null;
  group: string | null;
  status: TaskStatus;
  subtasks: Array<{ text: string; durationMinutes: number }>;
  checklistItems: string[];
  tags: string[];
}

const PRIORITY_COLORS: Record<string, { bg: string; label: string }> = {
  urgent: { bg: '#dc2626', label: 'Urgent' },
  high: { bg: '#ea580c', label: 'High' },
  medium: { bg: '#ca8a04', label: 'Medium' },
  low: { bg: '#2563eb', label: 'Low' },
  none: { bg: '#9ca3af', label: 'None' },
};

export const PriorityBadge: React.FC<{
  task: Task;
  onUpdate: (priority: Priority) => void;
  isOpen: boolean;
  onToggle: () => void;
}> = ({ task, onUpdate, isOpen, onToggle }) => {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onToggle(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onToggle]);
  const pc = PRIORITY_COLORS[task.priority];
  return (
    <div className="relative flex-shrink-0 flex items-center" ref={ref}>
      {task.priority !== 'none' ? (
        <button
          onClick={e => { e.stopPropagation(); onToggle(); }}
          style={{ backgroundColor: pc?.bg }}
          className="text-[11px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 text-white inline-flex items-center"
        >
          {pc?.label}
        </button>
      ) : isOpen ? (
        <button
          onClick={e => { e.stopPropagation(); onToggle(); }}
          className="text-[11px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 border border-border text-muted-foreground"
        >
          Priority
        </button>
      ) : null}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 w-36 bg-card border border-border rounded-xl shadow-xl p-1.5 space-y-0.5">
          {(['urgent', 'high', 'medium', 'low', 'none'] as const).map(p => {
            const c = PRIORITY_COLORS[p];
            return (
              <button
                key={p}
                onClick={e => { e.stopPropagation(); onUpdate(p); }}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs rounded-lg transition-all ${task.priority === p ? 'bg-primary/10 font-bold' : 'hover:bg-muted'}`}
              >
                <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.bg }} />
                {c.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const PremiumGate: React.FC<{
  title: string;
  description: string;
  icon?: React.ReactNode;
}> = ({ title, description, icon }) => (
  <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
      {icon || <Star className="w-6 h-6 text-primary" />}
    </div>
    <h4 className="text-sm font-semibold text-foreground mb-1">{title}</h4>
    <p className="text-xs text-muted-foreground mb-4 max-w-xs">{description}</p>
    <button
      onClick={() => window.location.href = '/pricing'}
      className="px-4 py-2 text-xs font-bold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all"
    >
      Subscribe to Unlock
    </button>
  </div>
);

interface DeleteConfirmDialogProps {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}

const DeleteConfirmDialog: React.FC<DeleteConfirmDialogProps> = ({ count, onConfirm, onCancel }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onCancel} />
    <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-sm animate-fade-in">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
          <Trash2 className="w-5 h-5 text-destructive" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-foreground">Delete {count} task{count === 1 ? '' : 's'}?</h3>
          <p className="text-xs text-muted-foreground mt-0.5">This action cannot be undone.</p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="px-4 py-2 text-sm font-bold bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-all"
        >
          Delete {count} task{count === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  </div>
);

const Tasks: React.FC = () => {
  const {
    board,
    addTask,
    updateTask,
    toggleChecklistItem,
    addChecklistItem,
    deleteChecklistItem,
    deleteTask,
    updateColumn,
    reorderTasksInSection,
  } = useGoalsContext();
  const { user } = useAuth();
  const { open: openDeepFocus } = useDeepFocus();

  const tier = user?.subscriptionTier || 'free';
  const isPremium = tier === 'premium' || tier === 'pro';
  const isPro = tier === 'pro';
  const mediaLimit = tier === 'free' ? 5 : tier === 'premium' ? 10 : 20;

  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [sharedTags, setSharedTags] = useState<SharedTag[]>([]);
  const [projectFilterId, setProjectFilterId] = useState<number | 'all'>('all');
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [tagFilterIds, setTagFilterIds] = useState<string[]>([]);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState<LabelColor>(randomTagColor());
  const [quickEditTaskId, setQuickEditTaskId] = useState<string | null>(null);
  const [quickEditField, setQuickEditField] = useState<'duration' | 'project' | null>(null);
  const [priorityEditTaskId, setPriorityEditTaskId] = useState<string | null>(null);
  const [quickEditDueDate, setQuickEditDueDate] = useState('');
  const [quickEditDueTime, setQuickEditDueTime] = useState('');
  const [quickEditDuration, setQuickEditDuration] = useState(0);
  const [quickEditStatus, setQuickEditStatus] = useState<TaskStatus>('to_do');
  const [quickEditProjectId, setQuickEditProjectId] = useState<number | ''>('');

  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState<string[]>(() => {
    try { const v = localStorage.getItem('goals-expanded-ids'); return v ? JSON.parse(v) : []; } catch { return []; }
  });

  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'urgent' | 'high' | 'medium' | 'low'>('all');
  const [groupFilterId, setGroupFilterId] = useState<string | null>(null);
  const [sortByDueDate, setSortByDueDate] = useState(false);
  const [sortDueDateDesc, setSortDueDateDesc] = useState(false);

  const [addingTask, setAddingTask] = useState(false);
  const [createModalProjectId, setCreateModalProjectId] = useState<number | null | undefined>(undefined);

  // "Add New" from the Projects page: ?new=1&project=<id> opens the create modal
  // with the project pre-selected so the new task is assigned to it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('new') === '1') {
      const pid = params.get('project');
      setCreateModalProjectId(pid ? Number(pid) : undefined);
      setAddingTask(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>('medium');
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>('to_do');
  const [newTaskStartDate, setNewTaskStartDate] = useState('');
  const [newTaskStartTime, setNewTaskStartTime] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskDueTime, setNewTaskDueTime] = useState('');
  const [newTaskDuration, setNewTaskDuration] = useState<number>(60);
  const [newTaskColumnId, setNewTaskColumnId] = useState<string>('');
  const [newTaskProjectId, setNewTaskProjectId] = useState<number | ''>('');
  const [newTaskSubtasks, setNewTaskSubtasks] = useState<NewTaskSubtaskDraft[]>([]);
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [newSubtaskDuration, setNewSubtaskDuration] = useState<number>(10);
  const [newChecklistItems, setNewChecklistItems] = useState<{id: string; text: string}[]>([]);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [newChecklistLists, setNewChecklistLists] = useState<{id: string; title: string; items: {id: string; text: string; completed: boolean}[]}[]>([]);
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [perChecklistInput, setPerChecklistInput] = useState<Record<string, string>>({});
  const [collapsedDraftChecklists, setCollapsedDraftChecklists] = useState<Set<string>>(new Set());
  const [editingDraftChecklistId, setEditingDraftChecklistId] = useState<string | null>(null);
  const [editingDraftChecklistTitle, setEditingDraftChecklistTitle] = useState('');
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [newTaskImages, setNewTaskImages] = useState<Attachment[]>([]);
  const [newTaskLabels, setNewTaskLabels] = useState<Label[]>([]);
  const [newTagPickerOpen, setNewTagPickerOpen] = useState(false);
  const [pendingDragMove, setPendingDragMove] = useState<{ taskId: string; srcDroppableId: string; dstDroppableId: string; srcIndex: number; dstIndex: number; dstProject: number | 'my-goals' | null; moveType: 'column' | 'project' } | null>(null);
  const [dontAsk, setDontAsk] = useState(false);
  const [editingDraftSubtaskId, setEditingDraftSubtaskId] = useState<string | null>(null);
  const [editingDraftSubtaskText, setEditingDraftSubtaskText] = useState('');
  const [editingDraftSubtaskDuration, setEditingDraftSubtaskDuration] = useState<number>(0);
  const [editingDraftChecklistIndex, setEditingDraftChecklistIndex] = useState<number | null>(null);
  const [editingDraftChecklistText, setEditingDraftChecklistText] = useState('');

  // Creation modal section collapse states
  const [draftSubtasksCollapsed, setDraftSubtasksCollapsed] = useState(false);
  const [draftChecklistCollapsed, setDraftChecklistCollapsed] = useState(false);
  const [draftAttachmentsCollapsed, setDraftAttachmentsCollapsed] = useState(false);
  const [draftImagesCollapsed, setDraftImagesCollapsed] = useState(false);

  const [myTasksCollapsed, setMyTasksCollapsed] = useState(() => localStorage.getItem('goals-mygoals-collapsed') === 'true');
  const [columnEditId, setColumnEditId] = useState<string | null>(null);
  const { open: openColumnEdit, close: closeColumnEdit, pos: columnEditPos } = useAnchoredPopup();
  const [columnEditName, setColumnEditName] = useState('');
  const [columnEditColor, setColumnEditColor] = useState('');
  const [columnEditIcon, setColumnEditIcon] = useState('');
  const COLUMN_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280', '#14b8a6', '#f43f5e'];
  const [collapsedProjects, setCollapsedProjects] = useState<number[]>(() => {
    try { const v = localStorage.getItem('goals-collapsed-projects'); return v ? JSON.parse(v) : []; } catch { return []; }
  });
  const [collapsedColumns, setCollapsedColumns] = useState<string[]>(() => {
    try { const v = localStorage.getItem('goals-collapsed-columns'); return v ? JSON.parse(v) : []; } catch { return []; }
  });

  useEffect(() => { localStorage.setItem('goals-mygoals-collapsed', String(myTasksCollapsed)); }, [myTasksCollapsed]);
  useEffect(() => { localStorage.setItem('goals-collapsed-projects', JSON.stringify(collapsedProjects)); }, [collapsedProjects]);
  useEffect(() => { localStorage.setItem('goals-collapsed-columns', JSON.stringify(collapsedColumns)); }, [collapsedColumns]);
  useEffect(() => { localStorage.setItem('goals-expanded-ids', JSON.stringify(expandedTaskIds)); }, [expandedTaskIds]);
  useEffect(() => { if (!pendingDragMove) setDontAsk(false); }, [pendingDragMove]);

  const [collapsedCompletedSections, setCollapsedCompletedSections] = useState<Record<string, boolean>>({});
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [isTaskDragging, setIsTaskDragging] = useState(false);
  const [selectedDeleteTaskIds, setSelectedDeleteTaskIds] = useState<string[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [singleDeleteTaskId, setSingleDeleteTaskId] = useState<string | null>(null);
  const [dateEditTaskId, setDateEditTaskId] = useState<string | null>(null);
  const [dateEditField, setDateEditField] = useState<'start' | 'due' | null>(null);
  const [tagPopupTaskId, setTagPopupTaskId] = useState<string | null>(null);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagName, setEditingTagName] = useState('');
  const [tagDeleteConfirm, setTagDeleteConfirm] = useState<string | null>(null);

  const [analysisPanelOpen, setAnalysisPanelOpen] = useState(false);
  const [activeAnalysisTab, setActiveAnalysisTab] = useState<AnalysisTab>('overview');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisExpanded, setAnalysisExpanded] = useState<string[]>([]);
  const [mainTmplPopupOpen, setMainTmplPopupOpen] = useState(false);
  const [mainTemplates, setMainTemplates] = useState<TaskTemplate[]>([]);

  const [aiBuilderOpen, setAiBuilderOpen] = useState(false);
  const [aiBuilderInput, setAiBuilderInput] = useState('');
  const [aiBuilderLoading, setAiBuilderLoading] = useState(false);
  const [aiBuilderError, setAiBuilderError] = useState('');
  const [aiBuilderFiles, setAiBuilderFiles] = useState<File[]>([]);
  const [aiBuilderImages, setAiBuilderImages] = useState<Attachment[]>([]);
  const [aiBuilderFilesCollapsed, setAiBuilderFilesCollapsed] = useState(false);
  const [aiBuilderImagesCollapsed, setAiBuilderImagesCollapsed] = useState(false);
  const [aiTaskDraft, setAiTaskDraft] = useState<CreateTaskInitialValues | null>(null);

  const [orderedActiveIds, setOrderedActiveIds] = useState<string[]>([]);

  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [loadTemplateOpen, setLoadTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateError, setTemplateError] = useState('');
  const [editingTemplateMeta, setEditingTemplateMeta] = useState<{ id: number; name: string; template: TaskTemplate } | null>(null);
  const [templateEditOverrides, setTemplateEditOverrides] = useState<Partial<Task> | null>(null);
  const [templateEditName, setTemplateEditName] = useState('');

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const response = await fetch('/api/projects', { credentials: 'include' });
        if (!response.ok) return;
        const data = await response.json().catch(() => ({}));
        setProjects(Array.isArray(data.projects) ? data.projects : []);
      } catch {
        setProjects([]);
      }
    };
    loadProjects();
  }, []);

  useEffect(() => {
    const loadSharedTags = async () => {
      try {
        setSharedTags(await fetchTags());
      } catch {
        setSharedTags([]);
      }
    };
    loadSharedTags();
  }, []);

  const allTags = useMemo<Label[]>(() => {
    const byName = new Map<string, Label>();
    DEFAULT_LABELS.forEach(label => byName.set(normalizeTagName(label.name).toLowerCase(), label));
    board.tasks.forEach(task => task.labels.forEach(label => {
      const key = normalizeTagName(label.name).toLowerCase();
      if (!byName.has(key)) byName.set(key, label);
    }));
    sharedTags.forEach(tag => {
      const label = sharedTagToLabel(tag);
      const key = normalizeTagName(label.name).toLowerCase();
      byName.set(key, label);
    });
    return Array.from(byName.values());
  }, [board.tasks, sharedTags]);

  const filteredTasksByBase = useMemo(() => {
    return board.tasks.filter(task => {
      const matchesSearch = task.title.toLowerCase().includes(search.toLowerCase().trim());
      const matchesPriority = priorityFilter === 'all' ? true : task.priority === priorityFilter;
      const matchesProject = projectFilterId === 'all' ? true : task.projectId === projectFilterId;
      const matchesTags = tagFilterIds.length === 0
        ? true
        : tagFilterIds.every(tagId => task.labels.some(label => label.id === tagId));
      return matchesSearch && matchesPriority && matchesProject && matchesTags;
    });
  }, [board.tasks, priorityFilter, projectFilterId, search, tagFilterIds]);

  const filtered = useMemo(() => {
    const byGroup = filteredTasksByBase.filter(task =>
      !groupFilterId ? true : task.columnId === groupFilterId
    );

    const active = byGroup.filter(task => !isTaskCompleted(task));
    const completed = byGroup.filter(task => isTaskCompleted(task));

    const sortByDue = (a: Task, b: Task) => {
      const aDate = a.dueDate ? new Date(`${a.dueDate}T${a.dueTime || '23:59'}`) : null;
      const bDate = b.dueDate ? new Date(`${b.dueDate}T${b.dueTime || '23:59'}`) : null;
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;
      const diff = aDate.getTime() - bDate.getTime();
      return sortDueDateDesc ? -diff : diff;
    };

    const sortByPriorityOrder = (a: Task, b: Task) => {
      const order: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
      const diff = (order[a.priority] ?? 4) - (order[b.priority] ?? 4);
      if (diff !== 0) return diff;
      return (a.order || 0) - (b.order || 0);
    };

    let activeSorted: Task[];
    if (sortByDueDate) {
      activeSorted = [...active].sort(sortByDue);
    } else if (orderedActiveIds.length > 0) {
      const idSet = new Set(active.map(t => t.id));
      const ordered = orderedActiveIds.filter(id => idSet.has(id));
      const unordered = active.filter(t => !orderedActiveIds.includes(t.id));
      const orderedTasks = ordered.map(id => active.find(t => t.id === id)!).filter(Boolean);
      activeSorted = [...orderedTasks, ...unordered];
    } else {
      activeSorted = [...active].sort(sortByPriorityOrder);
    }

    const completedSorted = [...completed].sort((a, b) => {
      const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return bTime - aTime;
    });

    return { active: activeSorted, completed: completedSorted };
  }, [filteredTasksByBase, groupFilterId, sortByDueDate, sortDueDateDesc, orderedActiveIds]);

  const myTasksGroup = useMemo(() =>
    filtered.active.filter(t => !t.projectId),
    [filtered.active]
  );

  const projectTaskGroups = useMemo(() => {
    return projects.map(project => {
      const tasks = filtered.active.filter(t => t.projectId === project.id);
      const columns = board.columns
        .filter(col => (col as any).projectId === project.id)
        .sort((a, b) => a.order - b.order);
      const columnGroups = columns.map(col => ({
        column: col,
        tasks: tasks.filter(t => t.columnId === col.id).sort((a, b) => (a.order || 0) - (b.order || 0)),
        completed: filtered.completed.filter(t => t.projectId === project.id && t.columnId === col.id),
      })).filter(cg => cg.tasks.length > 0 || cg.completed.length > 0);
      const columnIds = new Set(columns.map(c => c.id));
      const uncategorized = tasks.filter(t => !columnIds.has(t.columnId));
      const uncategorizedCompleted = filtered.completed.filter(t => t.projectId === project.id && !columnIds.has(t.columnId));
      if (tasks.length === 0 && columnGroups.length === 0 && uncategorizedCompleted.length === 0) return null;
      return { project, tasks, columnGroups, uncategorized, uncategorizedCompleted };
    }).filter(Boolean) as Array<{ project: ProjectMeta; tasks: Task[]; columnGroups: Array<{ column: any; tasks: Task[]; completed: Task[] }>; uncategorized: Task[]; uncategorizedCompleted: Task[] }>;
  }, [filtered.active, filtered.completed, projects, board.columns]);

  const matchingCount = filtered.active.length + filtered.completed.length;
  const openTask = openTaskId ? board.tasks.find(task => task.id === openTaskId) ?? null : null;

  const templateEditTask = useMemo(() => {
    if (!editingTemplateMeta) return null;
    const tmpl = editingTemplateMeta.template;
    const base = {
      id: `template-edit-${tmpl.id}`,
      title: tmpl.title || '',
      description: tmpl.description || '',
      priority: tmpl.priority || ('medium' as Priority),
      duration: tmpl.duration || 0,
      startDate: tmpl.startDate || '',
      startTime: tmpl.startTime || '',
      dueDate: tmpl.dueDate || '',
      dueTime: tmpl.dueTime || '',
      projectId: tmpl.projectId ?? null,
      columnId: tmpl.columnId || '',
      labels: tmpl.labels || [],
      subtasks: tmpl.subtasks || [],
      checklists: tmpl.checklists || [],
      images: tmpl.images || [],
      attachments: tmpl.attachments || [],
      comments: [],
      columnName: '',
      projectName: '',
      createdAt: new Date().toISOString(),
    };
    return (templateEditOverrides ? { ...base, ...templateEditOverrides } : base) as unknown as Task;
  }, [editingTemplateMeta, templateEditOverrides]);

  const handleEditTemplate = useCallback((template: TaskTemplate) => {
    setTemplateEditOverrides(null);
    setTemplateEditName(template.name);
    setEditingTemplateMeta({ id: template.id, name: template.name, template });
  }, []);

  const wrappedUpdateTask = useCallback((taskId: string, updates: Partial<Task>) => {
    if (taskId.startsWith('template-edit-')) {
      setTemplateEditOverrides(prev => ({ ...prev, ...updates } as Partial<Task>));
    } else {
      updateTask(taskId, updates);
    }
  }, [updateTask]);

  const handleSaveTemplate = useCallback(async () => {
    if (!editingTemplateMeta) return;
    const edited = templateEditOverrides || {};
    try {
      const saved = await updateTemplate(editingTemplateMeta.id, {
        name: templateEditName || editingTemplateMeta.name,
        title: (edited.title ?? editingTemplateMeta.template.title) || '',
        description: (edited.description ?? editingTemplateMeta.template.description) || '',
        priority: (edited.priority ?? editingTemplateMeta.template.priority) || 'medium',
        duration: Number(edited.duration ?? editingTemplateMeta.template.duration) || 0,
        startDate: (edited.startDate ?? editingTemplateMeta.template.startDate) || undefined,
        startTime: (edited.startTime ?? editingTemplateMeta.template.startTime) || undefined,
        dueDate: (edited.dueDate ?? editingTemplateMeta.template.dueDate) || undefined,
        dueTime: (edited.dueTime ?? editingTemplateMeta.template.dueTime) || undefined,
        projectId: (edited.projectId !== undefined ? edited.projectId : editingTemplateMeta.template.projectId) ?? null,
        columnId: (edited.columnId ?? editingTemplateMeta.template.columnId) || undefined,
        labels: (edited.labels ?? editingTemplateMeta.template.labels) || [],
        subtasks: ((edited.subtasks ?? editingTemplateMeta.template.subtasks) || []).map((st: any) => ({ text: st.text, durationMinutes: st.durationMinutes || 0 })),
        checklists: (edited.checklists ?? editingTemplateMeta.template.checklists) || [],
        images: (edited.images ?? editingTemplateMeta.template.images) || [],
        attachments: (edited.attachments ?? editingTemplateMeta.template.attachments) || [],
      });
      setTemplates(prev => prev.map(t => t.id === saved.id ? saved : t));
      setMainTemplates(prev => prev.map(t => (t as any).id === saved.id ? saved : t));
      setTemplateEditName('');
      setTemplateEditOverrides(null);
      setEditingTemplateMeta(null);
      setOpenTaskId(null);
    } catch (err) {
      console.error('Failed to save template:', err);
    }
  }, [editingTemplateMeta, templateEditOverrides, templateEditName]);

  const toggleSortByDueDate = () => {
    if (!sortByDueDate) {
      setSortByDueDate(true);
      setSortDueDateDesc(false);
    } else if (!sortDueDateDesc) {
      setSortDueDateDesc(true);
    } else {
      setSortByDueDate(false);
      setSortDueDateDesc(false);
    }
  };

  const getProjectIdForDroppable = (id: string): number | 'my-goals' | null => {
    if (id === 'my-goals') return 'my-goals';
    if (id.startsWith('col-')) {
      const col = board.columns.find(c => c.id === id.slice(4));
      return col?.projectId ?? null;
    }
    if (id.startsWith('uncat-')) return Number(id.slice(6));
    return null;
  };

  const getTasksForDroppable = (id: string): Task[] | null => {
    if (id === 'my-goals') return myTasksGroup;
    if (id.startsWith('col-')) {
      const colGroup = projectTaskGroups.flatMap(pg => pg.columnGroups).find(cg => cg.column.id === id.slice(4));
      return colGroup?.tasks ?? null;
    }
    if (id.startsWith('uncat-')) {
      const pg = projectTaskGroups.find(p => p.project.id === Number(id.slice(6)));
      return pg?.uncategorized ?? null;
    }
    return null;
  };

  const applyDragMoveDirect = (srcDroppableId: string, dstDroppableId: string, srcIndex: number, dstIndex: number, dstProject: number | 'my-goals' | null) => {
    const srcTasks = getTasksForDroppable(srcDroppableId);
    const dstTasks = getTasksForDroppable(dstDroppableId);
    if (!srcTasks || !dstTasks) return;
    if (srcTasks.length <= srcIndex) return;

    const movingTaskId = srcTasks[srcIndex]?.id;
    if (!movingTaskId) return;

    const newColumnId = dstDroppableId.startsWith('col-') ? dstDroppableId.slice(4) : undefined;
    const updateFields: Record<string, any> = {};
    if (newColumnId) updateFields.columnId = newColumnId;
    if (dstProject === 'my-goals') {
      updateFields.projectId = null;
      updateFields.projectName = undefined;
    } else if (typeof dstProject === 'number') {
      const proj = projects.find(p => p.id === dstProject);
      updateFields.projectId = dstProject;
      if (proj) updateFields.projectName = proj.name;
    }
    if (Object.keys(updateFields).length > 0) updateTask(movingTaskId, updateFields);

    const isSameDroppable = srcDroppableId === dstDroppableId;
    if (!isSameDroppable) {
      const dstIds = dstTasks.map(t => t.id);
      const srcIds = srcTasks.map(t => t.id);
      if (srcDroppableId !== dstDroppableId) {
        const insertIdx = Math.min(dstIndex, dstIds.length);
        dstIds.splice(insertIdx, 0, movingTaskId);
        const filteredSrcIds = srcIds.filter(id => id !== movingTaskId);
        filteredSrcIds.forEach((id, idx) => updateTask(id, { order: idx }));
        dstIds.forEach((id, idx) => updateTask(id, { order: idx }));
        const base = orderedActiveIds.length > 0 ? [...orderedActiveIds] : filtered.active.map(t => t.id);
        const srcSet = new Set(srcTasks.map(t => t.id));
        const dstSet = new Set(dstTasks.map(t => t.id));
        const resultIds: string[] = [];
        let srcInserted = false;
        let dstInserted = false;
        for (const id of base) {
          if (srcSet.has(id) && !srcInserted) { resultIds.push(...filteredSrcIds); srcInserted = true; }
          else if (dstSet.has(id) && !dstInserted) { resultIds.push(...dstIds); dstInserted = true; }
          else if (!srcSet.has(id) && !dstSet.has(id)) { resultIds.push(id); }
        }
        if (!srcInserted) resultIds.push(...filteredSrcIds);
        if (!dstInserted) resultIds.push(...dstIds);
        setOrderedActiveIds(resultIds);
      }
    }
  };

  useEffect(() => {
    const onWindowUp = () => setIsTaskDragging(false);
    window.addEventListener('mouseup', onWindowUp);
    window.addEventListener('touchend', onWindowUp);
    return () => { window.removeEventListener('mouseup', onWindowUp); window.removeEventListener('touchend', onWindowUp); };
  }, []);

  const handleDragEnd = (result: DropResult) => {
    setIsTaskDragging(false);
    if (!result.destination || sortByDueDate) return;

    const srcProject = getProjectIdForDroppable(result.source.droppableId);
    const dstProject = getProjectIdForDroppable(result.destination.droppableId);
    if (srcProject === null || dstProject === null) return;

    const srcId = result.source.droppableId;
    const dstId = result.destination.droppableId;
    const isCrossColumn = srcId !== dstId;
    const isCrossProject = srcProject !== dstProject;

    if (isCrossProject || isCrossColumn) {
      applyDragMoveDirect(result.source.droppableId, result.destination.droppableId, result.source.index, result.destination.index, dstProject);
      return;
    } else {
      const sectionTasks = getTasksForDroppable(srcId);
      if (!sectionTasks) return;

      const sectionTaskIds = sectionTasks.map(t => t.id);
      const ids = [...sectionTaskIds];
      const [removed] = ids.splice(result.source.index, 1);
      ids.splice(result.destination.index, 0, removed);

      reorderTasksInSection(ids);

      const base = orderedActiveIds.length > 0 ? [...orderedActiveIds] : filtered.active.map(t => t.id);
      const sectionIdSet = new Set(sectionTaskIds);
      const resultIds: string[] = [];
      let inserted = false;
      for (const id of base) {
        if (sectionIdSet.has(id)) {
          if (!inserted) {
            resultIds.push(...ids);
            inserted = true;
          }
        } else {
          resultIds.push(id);
        }
      }
      setOrderedActiveIds(resultIds);
    }
  };

  const runTaskAnalysis = useCallback((type: AnalysisTab) => {
    setActiveAnalysisTab(type);
    setAnalysisLoading(true);
    setAnalysisExpanded([]);
    const scope = [...filtered.active, ...filtered.completed];
    const activeScope = scope.filter(task => !isTaskCompleted(task));
    let result: AnalysisResult;

    if (type === 'overview') {
      result = buildAnalysisOverview(scope, activeScope);
    } else if (type === 'deadlines') {
      const items = buildDeadlineItems(activeScope);
      result = {
        title: 'Deadline Analysis',
        summary: `${items.length} active task${items.length !== 1 ? 's' : ''} - ${items.filter(i => i.facts.some(f => f.tone === 'bad')).length} in distress, ${items.filter(i => i.facts.some(f => f.tone === 'warn')).length} approaching risk`,
        lines: [],
        items,
      };
    } else if (type === 'progress') {
      const items = buildProgressItems(activeScope);
      result = {
        title: 'Progress Analysis',
        summary: `${items.length} active task${items.length !== 1 ? 's' : ''} - ${items.filter(i => i.facts.some(f => f.tone === 'bad')).length} stalled, ${items.filter(i => i.facts.some(f => f.tone === 'ok')).length} moving`,
        lines: [],
        items,
      };
    } else {
      const items = buildPriorityItems(activeScope);
      result = {
        title: 'Priority Analysis',
        summary: `${items.length} active task${items.length !== 1 ? 's' : ''} - ${items.filter(i => i.facts.some(f => f.tone === 'bad')).length} with a priority tag that no longer matches the data`,
        lines: [],
        items,
      };
    }

    setTimeout(() => {
      setAnalysisResult(result);
      setAnalysisLoading(false);
    }, 200);
  }, [filtered]);

  const toggleTaskCompletion = (task: Task) => {
    if (isTaskCompleted(task)) {
      updateTask(task.id, { completed: false, completedAt: undefined, status: 'to_do' });
    } else {
      updateTask(task.id, { completed: true, completedAt: new Date().toISOString(), status: 'completed' });
    }
  };

  const toggleExpand = (taskId: string) => {
    setExpandedTaskIds(prev =>
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  };

  const addSubtaskDraft = () => {
    if (!newSubtaskText.trim()) return;
    setNewTaskSubtasks(prev => [
      ...prev,
      { id: crypto.randomUUID(), text: newSubtaskText.trim(), durationMinutes: Math.max(0, Number(newSubtaskDuration) || 0) },
    ]);
    setNewSubtaskText('');
    setNewSubtaskDuration(10);
  };

  const addChecklistDraft = () => {
    if (!newChecklistText.trim()) return;
    setNewChecklistItems(prev => [...prev, { id: crypto.randomUUID(), text: newChecklistText.trim() }]);
    setNewChecklistText('');
  };

  const addDraftChecklist = () => {
    if (!newChecklistTitle.trim()) return;
    setNewChecklistLists(prev => [...prev, { id: crypto.randomUUID(), title: newChecklistTitle.trim(), items: [] }]);
    setNewChecklistTitle('');
  };

  const addDraftChecklistItem = (listId: string) => {
    const text = perChecklistInput[listId] ?? '';
    if (!text.trim()) return;
    setNewChecklistLists(prev => prev.map(l => l.id === listId ? { ...l, items: [...l.items, { id: crypto.randomUUID(), text: text.trim(), completed: false }] } : l));
    setPerChecklistInput(prev => ({ ...prev, [listId]: '' }));
  };

  const handleDraftReorder = useCallback((result: DropResult) => {
    if (!result.destination) return;
    if (result.source.droppableId === 'draft-subtasks') {
      setNewTaskSubtasks(prev => {
        const items = Array.from(prev);
        const [removed] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, removed);
        return items;
      });
    } else if (result.source.droppableId === 'draft-checklist') {
      setNewChecklistItems(prev => {
        const items = Array.from(prev);
        const [removed] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, removed);
        return items;
      });
    } else if (result.source.droppableId === 'draft-checklist-lists') {
      setNewChecklistLists(prev => {
        const items = Array.from(prev);
        const [removed] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, removed);
        return items;
      });
    } else {
      const srcListId = result.source.droppableId.replace('draft-checklist-items-', '');
      const dstListId = result.destination.droppableId.replace('draft-checklist-items-', '');
      if (srcListId === dstListId) {
        setNewChecklistLists(prev => prev.map(l => {
          if (l.id !== srcListId) return l;
          const items = Array.from(l.items);
          const [removed] = items.splice(result.source.index, 1);
          items.splice(result.destination.index, 0, removed);
          return { ...l, items };
        }));
      } else {
        let movedItem: { id: string; text: string; completed: boolean } | null = null;
        setNewChecklistLists(prev => {
          const next = prev.map(l => {
            if (l.id === srcListId) {
              const items = Array.from(l.items);
              movedItem = items.splice(result.source.index, 1)[0];
              return { ...l, items };
            }
            return l;
          });
          if (!movedItem) return prev;
          return next.map(l => {
            if (l.id === dstListId) {
              const items = Array.from(l.items);
              items.splice(result.destination.index, 0, movedItem!);
              return { ...l, items };
            }
            return l;
          });
        });
      }
    }
  }, []);

  const resetTaskDraft = () => {
    setNewTaskTitle('');
    setNewTaskDescription('');
    setNewTaskPriority('medium');
    setNewTaskStatus('to_do');
    setNewTaskStartDate('');
    setNewTaskStartTime('');
    setNewTaskDueDate('');
    setNewTaskDueTime('');
    setNewTaskDuration(60);
    setNewTaskColumnId('');
    setNewTaskProjectId('');
    setNewTaskSubtasks([]);
    setNewSubtaskText('');
    setNewSubtaskDuration(10);
    setNewChecklistItems([]);
    setNewChecklistText('');
    setNewChecklistLists([]);
    setNewChecklistTitle('');
    setPerChecklistInput({});
    setCollapsedDraftChecklists(new Set());
    setNewFiles([]);
    setNewTaskLabels([]);
    setNewTaskImages([]);
  };

  const createTask = async () => {
    if (!newTaskTitle.trim()) return;
    const targetColumnId = newTaskColumnId || board.columns[0]?.id;
    if (!targetColumnId) return;

    const taskId = crypto.randomUUID();
    const checklistItems = newChecklistItems.map(item => ({
      id: crypto.randomUUID(),
      text: item.text,
      completed: false,
    }));

    const allChecklists = [
      ...(checklistItems.length ? [{ id: crypto.randomUUID(), title: 'Checklist', items: checklistItems }] : []),
      ...newChecklistLists.map(l => ({
        id: l.id,
        title: l.title,
        items: l.items.map(it => ({ id: it.id, text: it.text, completed: false })),
      })),
    ];

    const attachmentUrls = newFiles.length > 0
      ? await Promise.all(newFiles.map(f => fileToDataUrl(f)))
      : [];

    addTask(targetColumnId, newTaskTitle.trim(), {
      id: taskId,
      description: newTaskDescription,
      status: 'to_do',
      priority: newTaskPriority,
      duration: Math.max(0, Number(newTaskDuration) || 0),
      startDate: newTaskStartDate || undefined,
      startTime: newTaskStartTime || undefined,
      dueDate: newTaskDueDate || undefined,
      dueTime: newTaskDueTime || undefined,
      projectId: newTaskProjectId === '' ? null : Number(newTaskProjectId),
      projectName: newTaskProjectId === '' ? undefined : (projects.find(project => project.id === Number(newTaskProjectId))?.name || undefined),
      subtasks: newTaskSubtasks.map(st => ({
        id: st.id,
        text: st.text,
        completed: false,
        durationMinutes: st.durationMinutes,
      })),
      labels: newTaskLabels,
      checklists: allChecklists,
      attachments: newFiles.map((file, i) => ({
        id: crypto.randomUUID(),
        taskId,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        fileUrl: attachmentUrls[i],
        createdAt: new Date().toISOString(),
      })),
      images: newTaskImages,
      completed: false,
      completedAt: undefined,
    });

    resetTaskDraft();
    setAddingTask(false);
  };

  const handleBulkDelete = () => {
    if (selectedDeleteTaskIds.length === 0) return;
    setDeleteConfirmOpen(true);
  };

  const confirmBulkDelete = () => {
    selectedDeleteTaskIds.forEach(id => deleteTask(id));
    setSelectedDeleteTaskIds([]);
    setIsDeleteMode(false);
    setDeleteConfirmOpen(false);
  };

  const confirmSingleDelete = () => {
    if (singleDeleteTaskId) deleteTask(singleDeleteTaskId);
    setSingleDeleteTaskId(null);
  };

  const generateAITask = async () => {
    if (!aiBuilderInput.trim()) return;
    setAiBuilderLoading(true);
    setAiBuilderError('');
    try {
      const res = await fetch('/api/ai/task-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          input: aiBuilderInput,
          columns: board.columns.map(c => ({ id: c.id, title: c.title })),
          tags: allTags.map(t => t.name),
          attachedFiles: aiBuilderFiles.map(f => f.name),
          attachedImages: aiBuilderImages.map(img => img.fileName),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to generate task');
      }
      const data: AIGeneratedTask = await res.json();

      setNewTaskTitle(data.title || '');
      setNewTaskDescription(data.description || '');
      setNewTaskPriority((data.priority as Priority) || 'medium');
      setNewTaskStatus((data.status as TaskStatus) || 'to_do');
      setNewTaskStartDate(data.startDate || '');
      setNewTaskStartTime(data.startTime || '');
      setNewTaskDueDate(data.dueDate || '');
      setNewTaskDueTime(data.dueTime || '');
      setNewTaskDuration(data.duration || 60);

      if (data.group) {
        const matchedCol = board.columns.find(c =>
          c.title.toLowerCase() === data.group!.toLowerCase()
        );
        if (matchedCol) setAiTaskDraft(prev => ({ ...prev, columnId: matchedCol.id }));
      }

      const matchedTags: Label[] = (data.tags && data.tags.length > 0)
        ? (data.tags.map(tagName =>
            allTags.find(t => t.name.toLowerCase() === tagName.toLowerCase())
          ).filter(Boolean) as Label[])
        : [];

      setAiTaskDraft({
        title: data.title || '',
        description: data.description || '',
        priority: (data.priority as Priority) || 'medium',
        status: (data.status as TaskStatus) || 'to_do',
        startDate: data.startDate || '',
        startTime: data.startTime || '',
        dueDate: data.dueDate || '',
        dueTime: data.dueTime || '',
        duration: data.duration || 60,
        subtasks: (data.subtasks || []).map(st => ({
          text: st.text,
          durationMinutes: st.durationMinutes || 0,
        })),
        checklistItems: (data.checklistItems || []).map(text => text),
        labels: matchedTags,
        files: [...aiBuilderFiles],
        images: [...aiBuilderImages],
      });

      setAiBuilderOpen(false);
      setAiBuilderInput('');
      setAiBuilderFiles([]);
      setAiBuilderImages([]);
      setAddingTask(true);
    } catch (err: any) {
      setAiBuilderError(err.message || 'Something went wrong');
    } finally {
      setAiBuilderLoading(false);
    }
  };

  const newSubtaskTotal = newTaskSubtasks.reduce((s, st) => s + st.durationMinutes, 0);
  const newSubtaskRemaining = newTaskDuration - newSubtaskTotal;

  const openQuickEdit = (task: Task, field: 'duration' | 'project') => {
    setQuickEditTaskId(task.id); setDateEditTaskId(null); setDateEditField(null); setTagPopupTaskId(null);
    setQuickEditField(field);
    setQuickEditStatus(getTaskStatus(task));
    setQuickEditDuration(Math.max(0, Number(task.duration) || 0));
    setQuickEditProjectId(task.projectId || '');
  };

  const closeQuickEdit = () => {
    setQuickEditTaskId(null);
    setQuickEditField(null);
  };

  const applyQuickEdit = (task: Task) => {
    const updates: Partial<Task> = {};
    if (quickEditField === 'duration') {
      updates.duration = Math.max(0, Number(quickEditDuration) || 0);
    }
    if (quickEditField === 'project') {
      updates.projectId = quickEditProjectId === '' ? null : Number(quickEditProjectId);
      updates.projectName = quickEditProjectId === ''
        ? undefined
        : (projects.find(project => project.id === Number(quickEditProjectId))?.name || undefined);
    }
    updateTask(task.id, updates);
    closeQuickEdit();
  };

  const toggleTaskTag = (taskId: string, label: Label) => {
    const task = board.tasks.find(item => item.id === taskId);
    if (!task) return;
    
    const has = task.labels.some(item => item.id === label.id);
    const nextLabels = has
      ? task.labels.filter(item => item.id !== label.id)
      : [...task.labels, label];
    updateTask(taskId, { labels: nextLabels });
  };

  const createSharedTaskLabel = async (name: string, color: LabelColor): Promise<Label> => {
    const tag = await createTag({ name, color });
    setSharedTags(prev => [...prev, tag]);
    return sharedTagToLabel(tag);
  };

  const createTaskTag = async (taskId: string) => {
    const task = board.tasks.find(item => item.id === taskId);
    if (!task) return;

    const name = normalizeTagName(newTagName);
    if (!name) return;

    try {
      const newLabel = await createSharedTaskLabel(name, newTagColor);
      updateTask(taskId, { labels: [...task.labels, newLabel] });
      setNewTagName('');
      setNewTagColor(randomTagColor());
      setTagPickerOpen(false);
    } catch (error) {
      console.error('Failed to create task tag:', error);
    }
  };

  const deleteTagEverywhere = async (tagId: string) => {
    if (tagId.startsWith(SHARED_TAG_PREFIX)) {
      const sharedTagId = Number(tagId.slice(SHARED_TAG_PREFIX.length));
      if (!Number.isNaN(sharedTagId)) {
        try {
          await deleteTag(sharedTagId);
          setSharedTags(prev => prev.filter(t => t.id !== sharedTagId));
        } catch (error) {
          console.error('Failed to delete shared tag:', error);
          return;
        }
      }
    }

    board.tasks.forEach(task => {
      if (task.labels.some(label => label.id === tagId)) {
        updateTask(task.id, { labels: task.labels.filter(label => label.id !== tagId) });
      }
    });
    setTagFilterIds(prev => prev.filter(id => id !== tagId));
  };

  const renameTagEverywhere = async (tagId: string, newName: string) => {
    const name = normalizeTagName(newName);
    if (!name) return;

    if (tagId.startsWith(SHARED_TAG_PREFIX)) {
      const sharedTagId = Number(tagId.slice(SHARED_TAG_PREFIX.length));
      if (!Number.isNaN(sharedTagId)) {
        try {
          const updated = await updateTag(sharedTagId, { name });
          setSharedTags(prev => prev.map(tag => tag.id === sharedTagId ? { ...tag, name: updated.name } : tag));
        } catch (error) {
          console.error('Failed to rename shared tag:', error);
          return;
        }
      }
    }

    board.tasks.forEach(task => {
      if (task.labels.some(label => label.id === tagId)) {
        updateTask(task.id, { labels: task.labels.map(label => label.id === tagId ? { ...label, name } : label) });
      }
    });
  };

  const changeTagColorEverywhere = async (tagId: string, color: LabelColor) => {
    if (tagId.startsWith(SHARED_TAG_PREFIX)) {
      const sharedTagId = Number(tagId.slice(SHARED_TAG_PREFIX.length));
      if (!Number.isNaN(sharedTagId)) {
        try {
          const updated = await updateTag(sharedTagId, { color });
          setSharedTags(prev => prev.map(tag => tag.id === sharedTagId ? { ...tag, color: updated.color } : tag));
        } catch (error) {
          console.error('Failed to update tag color:', error);
          return;
        }
      }
    }

    board.tasks.forEach(task => {
      if (task.labels.some(label => label.id === tagId)) {
        updateTask(task.id, { labels: task.labels.map(label => label.id === tagId ? { ...label, color } : label) });
      }
    });
  };


  const toggleTagFilter = (tagId: string) => {
    setTagFilterIds(prev => prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]);
  };

  const renderTaskRow = (task: Task, dragHandleProps?: any, isDragging?: boolean) => {
    const isExpanded = expandedTaskIds.includes(task.id);
    const subtaskCount = task.subtasks?.length || 0;
    const checklistTotal = task.checklists.reduce((s, l) => s + l.items.length, 0);
    const checklistDone = task.checklists.reduce((s, l) => s + l.items.filter(i => i.completed).length, 0);
    const taskDurFmt = formatDuration(task.duration || 0);
    const taskTags = task.labels.slice(0, 3);
    return (
      <div
        key={task.id}
        onClick={() => {
          if (isDeleteMode) {
            setSelectedDeleteTaskIds(prev =>
              prev.includes(task.id) ? prev.filter(id => id !== task.id) : [...prev, task.id]
            );
          } else {
            setOpenTaskId(task.id);
          }
        }}
        className={`group border rounded-xl bg-card transition-[opacity,box-shadow,border-color] duration-200 cursor-pointer ${
          isDeleteMode
            ? selectedDeleteTaskIds.includes(task.id)
              ? 'border-destructive bg-destructive/5 hover:bg-destructive/10'
              : 'border-border hover:bg-muted/20'
            : isDragging
              ? 'border-primary/40 shadow-lg rotate-[2deg]'
              : 'border-border hover:border-border/80 hover:shadow-sm'
        }`}
      >
        <div className="flex items-center gap-1 px-3 py-3">
          {dragHandleProps && (
            <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
              <GripVertical className="w-4 h-4" />
            </div>
          )}
          {isDeleteMode ? (
            <input
              type="checkbox"
              checked={selectedDeleteTaskIds.includes(task.id)}
              onChange={() => {
                setSelectedDeleteTaskIds(prev =>
                  prev.includes(task.id) ? prev.filter(id => id !== task.id) : [...prev, task.id]
                );
              }}
              onClick={e => e.stopPropagation()}
              className="w-4 h-4 rounded border-border accent-destructive flex-shrink-0 cursor-pointer"
            />
          ) : (
            <div onClick={e => { e.stopPropagation(); toggleTaskCompletion(task); }}>
              <CircleToggle
                completed={isTaskCompleted(task)}
                onClick={e => { e.stopPropagation(); toggleTaskCompletion(task); }}
                size="md"
                title="Mark complete"
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-left text-foreground truncate">{task.title}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              {(task.priority !== 'none' || priorityEditTaskId === task.id) && (
                <PriorityBadge
                  task={task}
                  onUpdate={(priority) => updateTask(task.id, { priority })}
                  isOpen={priorityEditTaskId === task.id}
                  onToggle={() => setPriorityEditTaskId(priorityEditTaskId === task.id ? null : task.id)}
                />
              )}
              {taskDurFmt && (
                <button
                  onClick={e => { e.stopPropagation(); openQuickEdit(task, 'duration'); }}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0"
                >
                  {taskDurFmt}
                </button>
              )}
              <button
                onClick={e => {
                  e.stopPropagation();
                  setQuickEditTaskId(null); setQuickEditField(null); setTagPopupTaskId(null); setDateEditTaskId(dateEditTaskId === task.id && dateEditField === 'start' ? null : task.id);
                  setDateEditField(prev => prev === 'start' ? null : 'start');
                }}
                className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 flex items-center gap-1 bg-muted text-muted-foreground"
              >
                <Calendar className="w-2.5 h-2.5" />
                {task.startDate ? `${formatDate(task.startDate)}${task.startTime ? ` ${task.startTime}` : ''}` : 'Add start date'}
              </button>
              <button
                onClick={e => {
                  e.stopPropagation();
                  setQuickEditTaskId(null); setQuickEditField(null); setTagPopupTaskId(null); setDateEditTaskId(dateEditTaskId === task.id && dateEditField === 'due' ? null : task.id);
                  setDateEditField(prev => prev === 'due' ? null : 'due');
                }}
                className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 flex items-center gap-1 ${
                  task.dueDate
                    ? (() => {
                        const warning = getDueTimeWarning(task);
                        return warning === 'overdue'
                          ? 'bg-destructive/10 text-destructive'
                          : warning === 'imminent' || warning === 'soon'
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'bg-muted text-muted-foreground';
                      })()
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <Calendar className="w-2.5 h-2.5" />
                {task.dueDate ? `${formatDate(task.dueDate)}${task.dueTime ? ` ${task.dueTime}` : ''}` : 'Add due date'}
              </button>
              {checklistTotal > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
                  {checklistDone}/{checklistTotal} checklist
                </span>
              )}
              {subtaskCount > 0 && (() => {
                const subtaskDone = (task.subtasks || []).filter(s => s.completed).length;
                return (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
                    {subtaskDone}/{subtaskCount} sub task
                  </span>
                );
              })()}
              {taskTags.map(label => (
                <span
                  key={label.id}
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${LABEL_COLORS[label.color]} text-primary-foreground`}
                >
                  {label.name}
                </span>
              ))}
              {task.labels.length > taskTags.length && (
                <button
                  onClick={e => { e.stopPropagation(); setQuickEditTaskId(null); setQuickEditField(null); setDateEditTaskId(null); setDateEditField(null); setTagPopupTaskId(tagPopupTaskId === task.id ? null : task.id); }}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0"
                >
                  +{task.labels.length - taskTags.length}
                </button>
              )}
              <button
                onClick={e => { e.stopPropagation(); setQuickEditTaskId(null); setQuickEditField(null); setDateEditTaskId(null); setDateEditField(null); setTagPopupTaskId(tagPopupTaskId === task.id ? null : task.id); }}
                className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 flex items-center gap-1 ${
                  tagPopupTaskId === task.id ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                }`}
              >
                <Tag className="w-2.5 h-2.5" />
                {tagPopupTaskId === task.id ? 'Close' : 'Tags'}
              </button>
            </div>
          </div>
          {!isDeleteMode && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={e => { e.stopPropagation(); toggleExpand(task.id); }}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                title={isExpanded ? 'Collapse' : 'Expand'}
              >
                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={e => { e.stopPropagation(); openDeepFocus(task); }}
                className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary"
                title="Open Deep Focus"
              >
                <Brain className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
        {quickEditTaskId === task.id && (
          <div onClick={e => e.stopPropagation()} className="border-t border-border px-4 py-3 bg-muted/20 rounded-b-xl">
            <div className="flex flex-wrap items-center gap-2">
              {quickEditField === 'duration' && (
                <div className="flex items-center gap-2">
                  <input type="number" min={0} value={quickEditDuration} onChange={e => setQuickEditDuration(Math.max(0, Number(e.target.value) || 0))} onBlur={() => applyQuickEdit(task)} className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  <span className="text-xs text-muted-foreground">minutes</span>
                </div>
              )}
              {quickEditField === 'project' && (
                <Select value={quickEditProjectId === '' ? 'my-goals' : String(quickEditProjectId)} onValueChange={val => setQuickEditProjectId(val === 'my-goals' ? '' : Number(val))}>
                  <SelectTrigger className="w-40 rounded-lg border border-border bg-background px-3 py-2 text-sm h-9">
                    <SelectValue placeholder="My Goals" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="my-goals">My Goals</SelectItem>
                    {projects.map(project => (<SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              )}
              <button onClick={() => applyQuickEdit(task)} className="ml-auto rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">Save</button>
              <button onClick={closeQuickEdit} className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">Cancel</button>
            </div>
          </div>
        )}
        {dateEditTaskId === task.id && dateEditField && (
          <div onClick={e => e.stopPropagation()} className="border-t border-border px-4 py-3 bg-muted/20 rounded-b-xl">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="date"
                  value={dateEditField === 'start' ? (task.startDate || '') : (task.dueDate || '')}
                  onChange={e => {
                    const val = e.target.value || undefined;
                    updateTask(task.id, dateEditField === 'start' ? { startDate: val } : { dueDate: val });
                  }}
                  className="w-full bg-background border border-border rounded-lg pl-8 pr-3 py-2 text-sm [color-scheme:var(--color-scheme)]"
                />
              </div>
              <div className="relative w-[140px]">
                <Clock3 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="time"
                  value={dateEditField === 'start' ? (task.startTime || '') : (task.dueTime || '')}
                  onChange={e => {
                    const val = e.target.value || undefined;
                    updateTask(task.id, dateEditField === 'start' ? { startTime: val } : { dueTime: val });
                  }}
                  className="w-full bg-background border border-border rounded-lg pl-8 pr-3 py-2 text-sm [color-scheme:var(--color-scheme)]"
                />
              </div>
              {((dateEditField === 'start' && task.startDate) || (dateEditField === 'due' && task.dueDate)) && (
                <button
                  onClick={() => {
                    updateTask(task.id, dateEditField === 'start' ? { startDate: undefined, startTime: undefined } : { dueDate: undefined, dueTime: undefined });
                    setDateEditTaskId(null);
                    setDateEditField(null);
                  }}
                  className="text-xs text-destructive hover:bg-destructive/10 px-3 py-2 rounded-lg"
                >
                  Clear
                </button>
              )}
              <button onClick={() => { setDateEditTaskId(null); setDateEditField(null); }} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">Save</button>
              <button onClick={() => { setDateEditTaskId(null); setDateEditField(null); }} className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">Cancel</button>
            </div>
          </div>
        )}
        {isExpanded && !isDeleteMode && !isTaskDragging && (
          <div onClick={e => e.stopPropagation()} className="border-t border-border px-4 py-3 space-y-4 bg-muted/10 rounded-b-xl">
            <TaskDropdownExpanded
              task={task}
              onUpdateTask={updateTask}
              onToggleChecklistItem={toggleChecklistItem}
              onAddChecklistItem={addChecklistItem}
              onDeleteChecklistItem={deleteChecklistItem}
              isPremium={isPremium}
              isPro={isPro}
            />
            <div className="flex justify-end pt-1">
              <button
                onClick={e => { e.stopPropagation(); setSingleDeleteTaskId(task.id); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-lg transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Goal
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderTaskClone = (cloneProvided: any, cloneSnapshot: any, rubric: any) => {
    const task = board.tasks.find(t => t.id === rubric.draggableId);
    if (!task) return null;
    return (
      <CenteredDragClone
        draggableProps={cloneProvided.draggableProps}
        dragHandleProps={cloneProvided.dragHandleProps}
        innerRef={cloneProvided.innerRef}
        style={cloneProvided.draggableProps.style as any}
      >
        {renderTaskRow(task, cloneProvided.dragHandleProps, cloneSnapshot.isDragging)}
      </CenteredDragClone>
    );
  };

  const renderCompletedTaskRow = (task: Task) => (
    <div
      key={task.id}
      onClick={() => {
        if (isDeleteMode) {
          setSelectedDeleteTaskIds(prev =>
            prev.includes(task.id) ? prev.filter(id => id !== task.id) : [...prev, task.id]
          );
        } else {
          setOpenTaskId(task.id);
        }
      }}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all group ${
        isDeleteMode
          ? selectedDeleteTaskIds.includes(task.id)
            ? 'border-destructive bg-destructive/5 hover:bg-destructive/10'
            : 'border-border bg-background/50 hover:bg-muted/20'
          : 'border-label-green/15 bg-background/70 hover:bg-muted/40'
      }`}
    >
      {isDeleteMode ? (
        <input
          type="checkbox"
          checked={selectedDeleteTaskIds.includes(task.id)}
          onChange={() => {
            setSelectedDeleteTaskIds(prev =>
              prev.includes(task.id) ? prev.filter(id => id !== task.id) : [...prev, task.id]
            );
          }}
          onClick={e => e.stopPropagation()}
          className="w-4 h-4 rounded border-border accent-destructive flex-shrink-0 cursor-pointer"
        />
      ) : (
        <CircleToggle
          completed
          onClick={e => { e.stopPropagation(); toggleTaskCompletion(task); }}
          size="md"
          title="Mark active"
        />
      )}
      <span className={`text-sm text-left flex-1 ${isDeleteMode ? 'text-foreground font-medium' : 'text-muted-foreground/80 line-through'}`}>
        {task.title}
      </span>
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-label-green/15 text-label-green font-medium flex-shrink-0">
        Auto-delete in {daysUntilAutoDelete(task.completedAt)} day{daysUntilAutoDelete(task.completedAt) === 1 ? '' : 's'}
      </span>
      <button
        onClick={e => { e.stopPropagation(); setSingleDeleteTaskId(task.id); }}
        className="p-1.5 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex-shrink-0"
        title="Delete goal"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  const renderCompletedSection = (sectionKey: string, tasks: Task[]) => {
    if (tasks.length === 0) return null;
    const collapsed = collapsedCompletedSections[sectionKey] ?? false;
    return (
      <div className="mt-1.5 border border-label-green/20 rounded-xl bg-label-green/5 overflow-hidden">
        <button
          onClick={() => setCollapsedCompletedSections(prev => ({ ...prev, [sectionKey]: !collapsed }))}
          className="w-full flex items-center justify-between px-3 py-2"
        >
          <span className="text-[11px] font-semibold text-label-green flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Completed ({tasks.length})
          </span>
          {collapsed ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/60" /> : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground/60" />}
        </button>
        {!collapsed && (
          <div className="border-t border-label-green/15 px-2 py-2 space-y-1.5">
            {tasks.map(task => renderCompletedTaskRow(task))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-6 h-16 border-b border-border flex items-center justify-between bg-card/30">
        <div className="flex items-baseline gap-2 min-w-0">
          <h1 className="text-base font-bold text-foreground whitespace-nowrap">All Goals</h1>
          <p className="text-xs text-muted-foreground truncate">{matchingCount} goals matching filters</p>
        </div>
        <div className="flex items-center gap-2">

          <button
            onClick={() => {
              if (isDeleteMode) {
                setIsDeleteMode(false);
                setSelectedDeleteTaskIds([]);
              } else {
                setIsDeleteMode(true);
                setSelectedDeleteTaskIds([]);
              }
            }}
            className={`flex items-center gap-2 px-4 py-2 text-sm rounded-xl font-bold border transition-all ${
              isDeleteMode
                ? 'bg-destructive/15 border-destructive/30 text-destructive'
                : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            {isDeleteMode ? 'Exit Delete' : 'Delete'}
          </button>

          <div className="relative">
            <button
              onClick={async () => {
                if (mainTmplPopupOpen) {
                  setMainTmplPopupOpen(false);
                  return;
                }
                setMainTmplPopupOpen(true);
                try {
                  const t = await fetchTemplates();
                  setMainTemplates(t);
                } catch (err) {
                  console.error('Failed to fetch templates:', err);
                }
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl font-bold border transition-all bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <Star className="w-4 h-4" />
              Templates
            </button>
            {mainTmplPopupOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMainTmplPopupOpen(false)} />
                <div className="absolute right-0 mt-1.5 w-80 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Templates</h3>
                  </div>
                  <button onClick={() => setMainTmplPopupOpen(false)} className="p-1.5 rounded-lg hover:bg-muted">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
                {mainTemplates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                    <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center mb-2">
                      <Star className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-foreground">No templates yet</p>
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto divide-y divide-border">
                    {mainTemplates.map(tmpl => (
                      <div key={tmpl.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-all group">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-7 h-7 rounded-lg bg-primary/5 flex items-center justify-center flex-shrink-0">
                            <Star className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="text-sm font-medium text-foreground block truncate">{tmpl.name}</span>
                            {tmpl.title && <span className="text-[11px] text-muted-foreground truncate block">{tmpl.title}</span>}
                          </div>
                        </div>
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 ml-2">
                          <button
                            onClick={() => {
                              setMainTmplPopupOpen(false);
                              handleEditTemplate(tmpl);
                            }}
                            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-all"
                            title="Edit template"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={async () => {
                              if (!window.confirm(`Delete template "${tmpl.name}"?`)) return;
                              try {
                                await deleteTemplateApi(tmpl.id);
                                setMainTemplates(await fetchTemplates());
                              } catch (err) {
                                console.error('Failed to delete template:', err);
                              }
                            }}
                            className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg hover:bg-destructive/10 transition-all"
                            title="Delete template"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => setAddingTask(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-all"
          >
            <Plus className="w-4 h-4" />
            New Goal
          </button>
        </div>
      </header>

      <div className="px-6 py-4 border-b border-border bg-card/10">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search goals..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-muted/50 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl border border-border">
            {PRIORITY_FILTERS.map(priority => (
              <button
                key={priority}
                onClick={() => setPriorityFilter(priority)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
                  priorityFilter === priority
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {priority === 'all' ? 'All' : priority.charAt(0).toUpperCase() + priority.slice(1)}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 min-w-0">
            {tagFilterIds.length > 0 && (
              <button
                onClick={() => setTagFilterIds([])}
                className="px-3 py-1.5 text-xs rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
              >
                Clear tags
              </button>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => setTagPickerOpen(prev => !prev)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-xl border bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            >
              <Tag className="w-3.5 h-3.5" />
              Tags
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <TagsModal
              open={tagPickerOpen}
              onClose={() => setTagPickerOpen(false)}
              tags={allTags}
              selectedIds={tagFilterIds}
              onToggle={tagId => toggleTagFilter(tagId)}
              onCreate={async (name, color) => {
                try {
                  await createSharedTaskLabel(name, color);
                } catch (error) {
                  console.error('Failed to create task tag:', error);
                }
              }}
              onDelete={tagId => deleteTagEverywhere(tagId)}
              onRename={renameTagEverywhere}
              onColorChange={changeTagColorEverywhere}
              emptyText="No tags yet. Create one below."
            />
          </div>

          <div className="relative">
            <button
              onClick={() => setProjectDropdownOpen(prev => !prev)}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-xl border transition-all ${
                projectFilterId !== 'all'
                  ? 'bg-primary/10 border-primary/20 text-primary font-bold shadow-sm'
                  : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <FolderKanban className="w-3.5 h-3.5" />
              <span>
                {projectFilterId === 'all'
                  ? 'Project Filter'
                  : `Project: ${projects.find(project => project.id === projectFilterId)?.name || 'Selected'}`}
              </span>
              <ChevronDown className="w-3.5 h-3.5 ml-1" />
            </button>
            {projectDropdownOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setProjectDropdownOpen(false)} />
              <div className="absolute left-0 mt-1.5 w-64 bg-card border border-border rounded-xl shadow-lg z-30 p-2">
                <button
                  onClick={() => { setProjectFilterId('all'); setProjectDropdownOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-muted"
                >
                  All projects
                </button>
                <div className="space-y-1 max-h-52 overflow-y-auto">
                  {projects.map(project => (
                    <button
                      key={project.id}
                      onClick={() => { setProjectFilterId(project.id); setProjectDropdownOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-muted flex items-center gap-2 ${
                        projectFilterId === project.id ? 'bg-primary/10 text-primary' : ''
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: project.color }} />
                      <span className="flex-1 truncate">{project.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              </>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={toggleSortByDueDate}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-xl border transition-all ${
                sortByDueDate
                  ? 'bg-primary/10 border-primary/30 text-primary font-semibold'
                  : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground'
              }`}
              title={sortByDueDate ? (sortDueDateDesc ? 'Latest first — click to disable' : 'Soonest first — click for latest first') : 'Sort by due date'}
            >
              {sortByDueDate && sortDueDateDesc ? (
                <ArrowDown className="w-3.5 h-3.5" />
              ) : sortByDueDate ? (
                <ArrowUp className="w-3.5 h-3.5" />
              ) : (
                <ArrowUp className="w-3.5 h-3.5 opacity-40" />
              )}
              Sort by Due Date
            </button>
            <button
              onClick={() => { setAnalysisPanelOpen(true); runTaskAnalysis(activeAnalysisTab); }}
              className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-xl border bg-primary/5 border-primary/20 text-primary hover:bg-primary/10 transition-all"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Goal Analysis
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 relative" style={{ scrollbarGutter: 'stable' }}>
        <DragDropContext onDragStart={() => setIsTaskDragging(true)} onDragEnd={(result) => { setIsTaskDragging(false); handleDragEnd(result); }}>
        <div className="max-w-5xl mx-auto space-y-2 pb-24">
          {myTasksGroup.length === 0 && projectTaskGroups.length === 0 && filtered.completed.length === 0 && (
            <div className="text-center py-16">
              <CheckCircle2 className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-sm text-muted-foreground">No goals found</p>
            </div>
          )}

          {/* MY TASKS section */}
          {(myTasksGroup.length > 0 || filtered.completed.some(t => !t.projectId)) && (
            <div className="mb-3">
              <button
                onClick={() => setMyTasksCollapsed(prev => !prev)}
                className="flex items-center gap-2 w-full px-2 py-2 text-left hover:bg-muted/30 rounded-lg transition-all mb-1"
              >
                {myTasksCollapsed
                  ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />}
                <span className="text-xs font-bold tracking-wider text-muted-foreground">My Goals</span>
                <span className="text-[10px] text-muted-foreground/50 ml-1">({myTasksGroup.length})</span>
              </button>
              {!myTasksCollapsed && (
                <Droppable droppableId="my-goals" renderClone={renderTaskClone}>
                  {(dropProvided, snapshot) => (
                    <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} className="space-y-1.5">
                      {myTasksGroup.map((task, index) => (
                        <Draggable key={task.id} draggableId={task.id} index={index}>
                          {(taskProvided, taskSnapshot) => (
                            <div ref={taskProvided.innerRef} {...taskProvided.draggableProps}>
                              {renderTaskRow(task, taskProvided.dragHandleProps, taskSnapshot.isDragging)}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {dropProvided.placeholder}
                    </div>
                  )}
                </Droppable>
              )}
              {!myTasksCollapsed && renderCompletedSection('my-goals', filtered.completed.filter(t => !t.projectId))}
            </div>
          )}

          {myTasksGroup.length > 0 && projectTaskGroups.length > 0 && <div className="w-full h-0.5 bg-border/40 my-4" />}

          {/* Project sections */}
          {projectTaskGroups.map(({ project, tasks, columnGroups, uncategorized, uncategorizedCompleted }, idx) => {
            const isProjectCollapsed = collapsedProjects.includes(project.id);
            return (
              <div key={project.id} className="mb-3">
                {idx > 0 && <div className="w-full h-0.5 bg-border/40 my-4" />}
                <button
                  onClick={() => setCollapsedProjects(prev =>
                    prev.includes(project.id) ? prev.filter(id => id !== project.id) : [...prev, project.id]
                  )}
                  className="flex items-center gap-2 w-full px-2 py-2 text-left hover:bg-muted/30 rounded-lg transition-all mb-1"
                >
                  {isProjectCollapsed
                    ? <ChevronDown className="w-3.5 h-3.5" style={{ color: project.color }} />
                    : <ChevronUp className="w-3.5 h-3.5" style={{ color: project.color }} />}
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
                  <span className="text-xs font-bold tracking-wider text-foreground">{project.name}</span>
                  <span className="text-[10px] text-muted-foreground/50 ml-1">({tasks.length})</span>
                </button>
                {!isProjectCollapsed && (
                  <div className="pl-4 space-y-2">
                    {columnGroups.map(({ column, tasks: colTasks }, colIdx) => {
                      const isColumnCollapsed = collapsedColumns.includes(column.id);
                      return (
                        <div key={column.id}>
                          <div className="column-header-row flex items-center gap-1 w-full px-1 py-1.5 mb-1 group">
                            <button
                              onClick={() => setCollapsedColumns(prev =>
                                prev.includes(column.id) ? prev.filter(id => id !== column.id) : [...prev, column.id]
                              )}
                              className="flex items-center gap-1.5 px-1.5 py-1 rounded-lg hover:bg-muted/30 transition-all"
                            >
                              {isColumnCollapsed
                                ? <ChevronDown className="w-3 h-3 text-muted-foreground/60" />
                                : <ChevronUp className="w-3 h-3 text-muted-foreground/60" />}
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: column.color }} />
                              {column.icon && <span className="text-xs">{column.icon}</span>}
                            </button>
                            <button
                              onClick={(e) => { openColumnEdit(e.currentTarget.closest('.column-header-row') as HTMLElement); setColumnEditId(column.id); setColumnEditName(column.title); setColumnEditColor(column.color); setColumnEditIcon(column.icon || ''); }}
                              className="flex items-center gap-1.5 px-1.5 py-1 rounded-lg hover:bg-muted/30 transition-all text-left"
                            >
                              <span className="text-[11px] font-semibold tracking-widest text-muted-foreground/80">{column.title}</span>
                              <span className="text-[10px] text-muted-foreground/40">({colTasks.length})</span>
                            </button>
                          </div>
                          {!isColumnCollapsed && (
                            <>
                              <Droppable droppableId={"col-" + column.id} renderClone={renderTaskClone}>
                                {(dropProvided, snapshot) => (
                                  <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} className="pl-3 space-y-1.5">
                                    {colTasks.map((task, index) => (
                                      <Draggable key={task.id} draggableId={task.id} index={index}>
                                        {(taskProvided, taskSnapshot) => (
                                          <div ref={taskProvided.innerRef} {...taskProvided.draggableProps}>
                                            {renderTaskRow(task, taskProvided.dragHandleProps, taskSnapshot.isDragging)}
                                          </div>
                                        )}
                                      </Draggable>
                                    ))}
                                    {dropProvided.placeholder}
                                  </div>
                                )}
                              </Droppable>
                              <div className="pl-3">
                                {renderCompletedSection('col-' + column.id, filtered.completed.filter(t => t.projectId === project.id && t.columnId === column.id))}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                    {uncategorized.length > 0 && (
                      <Droppable droppableId={"uncat-" + project.id} renderClone={renderTaskClone}>
                        {(dropProvided, snapshot) => (
                          <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} className="pl-3 space-y-1.5">
                            {uncategorized.map((task, index) => (
                              <Draggable key={task.id} draggableId={task.id} index={index}>
                                {(taskProvided, taskSnapshot) => (
                                  <div ref={taskProvided.innerRef} {...taskProvided.draggableProps}>
                                    {renderTaskRow(task, taskProvided.dragHandleProps, taskSnapshot.isDragging)}
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {dropProvided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    )}
                    <div className="pl-3">
                      {renderCompletedSection('uncat-' + project.id, uncategorizedCompleted)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </DragDropContext>

        {/* Floating AI Task button */}
        <button
          onClick={() => setAiBuilderOpen(true)}
          className="fixed bottom-8 right-8 z-40 w-14 h-14 rounded-full bg-foreground text-background shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200"
          title="AI Goal Builder"
        >
          <Sparkles className="w-5 h-5" />
        </button>
      </div>

      {addingTask && (
        <CreateTaskModal
          open={addingTask}
          onClose={() => setAddingTask(false)}
          initialValues={aiTaskDraft}
          defaultProjectId={createModalProjectId}
        />
      )}

      {false && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-8" onClick={() => setAddingTask(false)}>
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Create Goal</h2>
              <button onClick={() => { setAddingTask(false); resetTaskDraft(); }} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Goal title</label>
                <input
                  autoFocus
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">Priority</label>
                  <Select value={newTaskPriority} onValueChange={v => setNewTaskPriority(v as Priority)}>
                    <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="none">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">Estimated duration (minutes)</label>
                  <input
                    type="number"
                    min={0}
                    value={newTaskDuration}
                    onChange={e => setNewTaskDuration(Math.max(0, Number(e.target.value) || 0))}
                    className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">Project</label>
                  <Select value={newTaskProjectId === '' ? 'my-goals' : String(newTaskProjectId)} onValueChange={v => { setNewTaskProjectId(v === 'my-goals' ? '' : Number(v)); setNewTaskColumnId(''); }}>
                    <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="my-goals">My Goals</SelectItem>
                      {projects.map(project => (
                        <SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {newTaskProjectId !== '' && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">Column</label>
                    <Select value={newTaskColumnId} onValueChange={v => setNewTaskColumnId(v)}>
                      <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        {board.columns
                          .filter(col => col.projectId === Number(newTaskProjectId))
                          .sort((a, b) => a.order - b.order)
                          .map(col => (
                            <SelectItem key={col.id} value={col.id}>{col.title}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {newTaskColumnId === '' && (
                      <p className="text-[10px] text-destructive mt-1">Column is required when a project is selected</p>
                    )}
                  </div>
                )}
          </div>

          {/* Start Date and Time Section */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Start Date</label>
              <input
                type="date"
                value={newTaskStartDate}
                onChange={e => setNewTaskStartDate(e.target.value)}
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Start Time</label>
              <input
                type="time"
                value={newTaskStartTime}
                onChange={e => setNewTaskStartTime(e.target.value)}
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
              />
            </div>
          </div>

          {/* Due Date and Time Section */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Due Date</label>
              <input
                type="date"
                value={newTaskDueDate}
                onChange={e => setNewTaskDueDate(e.target.value)}
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Due Time</label>
              <input
                type="time"
                value={newTaskDueTime}
                onChange={e => setNewTaskDueTime(e.target.value)}
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Description</label>
                <textarea
                  value={newTaskDescription}
                  onChange={e => setNewTaskDescription(e.target.value)}
                  rows={3}
                  className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm resize-none"
                />
              </div>

              <div className="relative">
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Tags</label>
                <div className="mt-1">
                  {newTaskLabels.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {newTaskLabels.map(label => (
                        <span key={label.id} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${LABEL_COLORS[label.color]} text-primary-foreground`}>
                          {label.name}
                          <button onClick={() => setNewTaskLabels(prev => prev.filter(l => l.id !== label.id))} className="hover:opacity-70">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => setNewTagPickerOpen(prev => !prev)}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-xl border bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                  >
                    <Tag className="w-3.5 h-3.5" />
                    {newTaskLabels.length > 0 ? `${newTaskLabels.length} tag${newTaskLabels.length > 1 ? 's' : ''} selected` : 'Add tags'}
                  </button>
                  {newTagPickerOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setNewTagPickerOpen(false)}>
                      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
                      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="mb-4 flex items-center justify-between">
                          <h3 className="text-base font-semibold text-foreground">Tags</h3>
                          <button onClick={() => setNewTagPickerOpen(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
                        </div>
                        <div className="max-h-60 space-y-2 overflow-y-auto mb-4">
                          {allTags.length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-3">No tags yet. Create one below.</p>
                          )}
                          {allTags.map(label => {
                            const active = newTaskLabels.some(l => l.id === label.id);
                            return (
                              <div key={label.id} className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2">
                                <button onClick={() => setNewTaskLabels(prev => active ? prev.filter(l => l.id !== label.id) : [...prev, label])} className="flex flex-1 items-center gap-2 text-left">
                                  <span className={`w-3 h-3 rounded-full ${LABEL_COLORS[label.color]}`} />
                                  <span className="text-sm text-foreground">{label.name}</span>
                                  {active && <span className="ml-auto text-[10px] text-primary font-semibold">Selected</span>}
                                </button>
                                <button onClick={() => setTagDeleteConfirm(label.id)} className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                            );
                          })}
                        </div>
                        <div className="border-t border-border pt-4">
                          <div className="flex gap-2 mb-2">
                            <input value={newTagName} onChange={e => setNewTagName(e.target.value)} placeholder="Create tag"
                              className="flex-1 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
                            <button onClick={() => setNewTagColor(randomTagColor())} className={`w-11 rounded-xl border border-border ${LABEL_COLORS[newTagColor]}`} title="Random color" />
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={async () => {
                                const name = normalizeTagName(newTagName);
                                if (!name) return;
                                try {
                                  const newLabel = await createSharedTaskLabel(name, newTagColor);
                                  setNewTaskLabels(prev => [...prev, newLabel]);
                                  setNewTagName('');
                                  setNewTagColor(randomTagColor());
                                } catch (error) {
                                  console.error('Failed to create task tag:', error);
                                }
                              }}
                              disabled={!newTagName.trim()}
                              className="flex-1 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:bg-primary disabled:text-primary-foreground disabled:opacity-100 disabled:cursor-not-allowed"
                            >
                              Add tag
                            </button>
                            <button onClick={() => setNewTagPickerOpen(false)} className="rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground">Done</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sub-tasks Card */}
              <div className="rounded-2xl border border-border bg-muted/20">
                <button
                  onClick={() => setDraftSubtasksCollapsed(prev => !prev)}
                  className="w-full flex items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">Sub-tasks</h3>
                    {newTaskSubtasks.length > 0 && (
                      <span className="text-xs text-muted-foreground">({newTaskSubtasks.length})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {newTaskDuration > 0 && (
                      <span className={`text-xs font-medium ${
                        newSubtaskRemaining > 0 ? 'text-muted-foreground' :
                        newSubtaskRemaining < 0 ? 'text-orange-500' : 'text-label-green'
                      }`}>
                        {newSubtaskRemaining > 0
                          ? `${newSubtaskRemaining} mins left`
                          : newSubtaskRemaining < 0
                          ? `Over by ${Math.abs(newSubtaskRemaining)} mins`
                          : '0 mins left ✓'}
                      </span>
                    )}
                    {draftSubtasksCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>
                {!draftSubtasksCollapsed && (
                  <div className="border-t border-border/60 px-4 py-3 space-y-3">
                    <DragDropContext onDragEnd={handleDraftReorder}>
                      <Droppable droppableId="draft-subtasks">
                        {(provided) => (
                          <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
                            {newTaskSubtasks.map((subtask, index) => (
                              <Draggable key={subtask.id} draggableId={subtask.id} index={index}>
                                {(provided) => (
                                  <div ref={provided.innerRef} {...provided.draggableProps} className="grid grid-cols-[auto_1fr_auto_auto] gap-2 items-center bg-muted/20 px-3 py-2 rounded-lg border border-border/50 group/subtask min-w-0">
                                    <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
                                      <GripVertical className="w-4 h-4" />
                                    </div>
                                    {editingDraftSubtaskId === subtask.id ? (
                                      <>
                                        <input
                                          autoFocus
                                          className="text-sm bg-muted/40 border border-primary/30 rounded px-2 py-0.5"
                                          value={editingDraftSubtaskText}
                                          onChange={e => setEditingDraftSubtaskText(e.target.value)}
                                          onBlur={() => { setNewTaskSubtasks(prev => prev.map(st => st.id === subtask.id ? { ...st, text: editingDraftSubtaskText, durationMinutes: editingDraftSubtaskDuration } : st)); setEditingDraftSubtaskId(null); }}
                                          onKeyDown={e => { if (e.key === 'Enter') { setNewTaskSubtasks(prev => prev.map(st => st.id === subtask.id ? { ...st, text: editingDraftSubtaskText, durationMinutes: editingDraftSubtaskDuration } : st)); setEditingDraftSubtaskId(null); } }}
                                        />
                                        <input
                                          type="number"
                                          className="w-20 text-xs bg-muted/40 border border-primary/30 rounded px-2 py-0.5"
                                          value={editingDraftSubtaskDuration}
                                          onChange={e => setEditingDraftSubtaskDuration(Math.max(0, Number(e.target.value) || 0))}
                                        />
                                      </>
                                    ) : (
                                      <>
                                        <span
                                          onClick={() => { setEditingDraftSubtaskId(subtask.id); setEditingDraftSubtaskText(subtask.text); setEditingDraftSubtaskDuration(subtask.durationMinutes); }}
                                          className="text-sm text-foreground font-medium cursor-text truncate"
                                        >
                                          {subtask.text}
                                        </span>
                                        <div className="flex items-center gap-2">
                                          <input
                                            type="number"
                                            min={0}
                                            className="w-16 text-xs bg-muted/40 border border-border rounded px-1.5 py-0.5 text-right focus:outline-none focus:ring-1 focus:ring-primary/30"
                                            value={subtask.durationMinutes || 0}
                                            onChange={e => {
                                              const val = Math.max(0, Number(e.target.value) || 0);
                                              setNewTaskSubtasks(prev => prev.map(st => st.id === subtask.id ? { ...st, durationMinutes: val } : st));
                                            }}
                                          />
                                          <span className="text-[10px] text-muted-foreground">min</span>
                                          <button
                                            onClick={() => setNewTaskSubtasks(prev => prev.filter(st => st.id !== subtask.id))}
                                            className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover/item:opacity-100 transition-opacity duration-200"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </DragDropContext>
                    <div className="grid grid-cols-[1fr_120px_auto] gap-2">
                      <input
                        value={newSubtaskText}
                        onChange={e => setNewSubtaskText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addSubtaskDraft()}
                        placeholder="New sub-task"
                        className="bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm"
                      />
                      <input
                        type="number"
                        min={0}
                        value={newSubtaskDuration}
                        onChange={e => setNewSubtaskDuration(Math.max(0, Number(e.target.value) || 0))}
                        placeholder="min"
                        className="bg-muted/40 border border-border rounded-lg px-2 py-2 text-sm"
                      />
                      <button onClick={addSubtaskDraft} className="px-3 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 shrink-0">
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Checklist Card */}
              <div className="rounded-2xl border border-border bg-muted/20">
                <button
                  onClick={() => setDraftChecklistCollapsed(prev => !prev)}
                  className="w-full flex items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">Checklist</h3>
                    {newChecklistLists.length > 0 && (
                      <span className="text-xs text-muted-foreground">({newChecklistLists.length})</span>
                    )}
                  </div>
                  {draftChecklistCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                </button>
                {!draftChecklistCollapsed && (
                  <div className="border-t border-border/60 px-4 py-3 space-y-3">
                    {newChecklistItems.length === 0 && newChecklistLists.length === 0 && <p className="text-xs text-muted-foreground">No checklist yet. Add a checklist to get started.</p>}
                <DragDropContext onDragEnd={handleDraftReorder}>
                  {newChecklistItems.length > 0 && (
                    <div className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden checklist-card">
                      <div className="flex items-center px-3 py-2">
                        <span className="text-xs font-semibold text-foreground">Checklist</span>
                      </div>
                      <div className="px-3 pb-2 space-y-1.5">
                        <Droppable droppableId="draft-checklist">
                          {(provided) => (
                            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
                              {newChecklistItems.map((item, index) => (
                                <Draggable key={item.id} draggableId={item.id} index={index}>
                                  {(provided) => (
                                    <div ref={provided.innerRef} {...provided.draggableProps} className="flex items-center gap-2.5 text-sm group/item checklist-item">
                                      <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
                                        <GripVertical className="w-4 h-4" />
                                      </div>
                                      <span className="flex-1">{item.text}</span>
                                      <button onClick={() => setNewChecklistItems(prev => prev.filter(it => it.id !== item.id))} className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover/item:opacity-100 transition-opacity duration-200">
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                        <div className="flex gap-2 pt-1">
                          <input
                            value={newChecklistText}
                            onChange={e => setNewChecklistText(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && addChecklistDraft()}
                            placeholder="Add checklist item"
                            className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-2 text-xs"
                          />
                          <button onClick={addChecklistDraft} className="px-3 py-2 text-xs bg-primary text-primary-foreground rounded-lg">Add</button>
                        </div>
                      </div>
                    </div>
                  )}
                  <Droppable droppableId="draft-checklist-lists" type="checklistList">
                    {(provided) => (
                      <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                        {newChecklistLists.map((list, listIndex) => {
                          const isCollapsed = collapsedDraftChecklists.has(list.id);
                          return (
                            <Draggable key={list.id} draggableId={list.id} index={listIndex}>
                              {(provided) => (
                                <div ref={provided.innerRef} {...provided.draggableProps} className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden checklist-card">
                                <div className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/30 transition-all group/header">
                                  <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
                                    <GripVertical className="w-4 h-4" />
                                  </div>
                                    <button
                                      onClick={() => setCollapsedDraftChecklists(prev => { const next = new Set(prev); isCollapsed ? next.delete(list.id) : next.add(list.id); return next; })}
                                      className="flex-1 flex items-center gap-2 text-left"
                                    >
                                      {editingDraftChecklistId === list.id ? (
                                        <input
                                          autoFocus
                                          className="text-xs font-semibold text-foreground bg-muted/40 border border-primary/30 rounded px-1.5 py-0.5"
                                          value={editingDraftChecklistTitle}
                                          onChange={e => setEditingDraftChecklistTitle(e.target.value)}
                                          onBlur={() => {
                                            if (editingDraftChecklistTitle.trim()) {
                                              setNewChecklistLists(prev => prev.map(l => l.id === list.id ? { ...l, title: editingDraftChecklistTitle.trim() } : l));
                                            }
                                            setEditingDraftChecklistId(null);
                                          }}
                                          onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                              if (editingDraftChecklistTitle.trim()) {
                                                setNewChecklistLists(prev => prev.map(l => l.id === list.id ? { ...l, title: editingDraftChecklistTitle.trim() } : l));
                                              }
                                              setEditingDraftChecklistId(null);
                                            }
                                          }}
                                        />
                                      ) : (
                                        <span onClick={() => { setEditingDraftChecklistId(list.id); setEditingDraftChecklistTitle(list.title); }} className="text-sm font-semibold text-foreground cursor-text truncate">
                                          {list.title}
                                        </span>
                                      )}
                                    </button>
                                    <div className="flex items-center gap-1">
                                      <button onClick={() => setNewChecklistLists(prev => prev.filter(l => l.id !== list.id))} className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover/header:opacity-100 checklist-header-delete transition-opacity duration-200">
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                      <button onClick={() => setCollapsedDraftChecklists(prev => { const next = new Set(prev); isCollapsed ? next.delete(list.id) : next.add(list.id); return next; })} className="p-1 text-muted-foreground hover:text-foreground">
                                        {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                                      </button>
                                    </div>
                                  </div>
                                  {!isCollapsed && (
                                    <div className="border-t border-border/60 px-3 py-2 space-y-1.5">
                                      <Droppable droppableId={`draft-checklist-items-${list.id}`} type="checklistItem">
                                        {(provided) => (
                                          <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
                                            {list.items.map((item, itemIndex) => (
                                              <Draggable key={item.id} draggableId={item.id} index={itemIndex}>
                                                {(provided) => (
                                                  <div ref={provided.innerRef} {...provided.draggableProps} className="flex items-center gap-2.5 text-sm group/item checklist-item">
                                                    <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
                                                      <GripVertical className="w-4 h-4" />
                                                    </div>
                                                    <span className="flex-1 text-foreground">{item.text}</span>
                                                    <button onClick={() => setNewChecklistLists(prev => prev.map(l => l.id === list.id ? { ...l, items: l.items.filter(it => it.id !== item.id) } : l))} className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover/item:opacity-100 transition-opacity duration-200">
                                                      <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                  </div>
                                                )}
                                              </Draggable>
                                            ))}
                                            {provided.placeholder}
                                          </div>
                                        )}
                                      </Droppable>
                                      <div className="flex gap-2 pt-1">
                                        <input
                                          value={perChecklistInput[list.id] ?? ''}
                                          onChange={e => setPerChecklistInput(prev => ({ ...prev, [list.id]: e.target.value }))}
                                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDraftChecklistItem(list.id); } }}
                                          placeholder="Add checklist item"
                                          className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-2 text-xs"
                                        />
                                        <button onClick={() => addDraftChecklistItem(list.id)} className="px-3 py-2 text-xs bg-primary text-primary-foreground rounded-lg">Add</button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
                    <div className="flex gap-2">
                      <input
                        value={newChecklistTitle}
                        onChange={e => setNewChecklistTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && newChecklistTitle.trim()) { addDraftChecklist(); } }}
                        placeholder="New checklist name"
                        className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm"
                      />
                      <button onClick={addDraftChecklist} disabled={!newChecklistTitle.trim()} className="px-4 py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-lg">Add checklist</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Attachments Card */}
              <div className="rounded-2xl border border-border bg-muted/20">
                <button
                  onClick={() => setDraftAttachmentsCollapsed(prev => !prev)}
                  className="w-full flex items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <Paperclip className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground">Attachments</h3>
                    {newFiles.length > 0 && (
                      <span className="text-xs text-muted-foreground">({newFiles.length})</span>
                    )}
                  </div>
                  {draftAttachmentsCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                </button>
                {!draftAttachmentsCollapsed && (
                  <div className="border-t border-border/60 px-4 py-3 space-y-3">
                    {!isPremium ? (
                      <div className="border border-dashed border-border rounded-xl">
                        <PremiumGate
                          title="File Attachments"
                          description="Attach files, images, and documents directly to your tasks."
                          icon={<Paperclip className="w-6 h-6 text-primary" />}
                        />
                      </div>
                    ) : (
                      <>
                        <label className="flex flex-col items-center justify-center w-full min-h-[100px] border-2 border-dashed border-border rounded-xl bg-muted/20 hover:bg-muted/40 hover:border-primary/50 transition-all cursor-pointer">
                          <div className="flex flex-col items-center justify-center py-4">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                              <Paperclip className="w-5 h-5 text-primary" />
                            </div>
                            <p className="text-sm font-medium text-foreground">Click to upload or drag and drop</p>
                            <p className="text-xs text-muted-foreground mt-1">PDF, Images, Documents (max 10MB)</p>
                          </div>
                          <input
                            type="file"
                            multiple
                            onChange={e => {
                              if (!e.target.files) return;
                              setNewFiles(prev => [...prev, ...Array.from(e.target.files || [])]);
                            }}
                            className="hidden"
                          />
                        </label>
                        {newFiles.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {newFiles.map((file, fileIdx) => (
                              <div key={`${file.name}-${fileIdx}`} className="relative group/att">
                                <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/40">
                                  <div className="w-10 h-10 rounded-lg bg-background border border-border flex items-center justify-center">
                                    <Paperclip className="w-5 h-5 text-muted-foreground" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                                    <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                                  </div>
                                </div>
                                <button
                                  onClick={e => { e.preventDefault(); e.stopPropagation(); setNewFiles(prev => prev.filter((_, idx) => idx !== fileIdx)); }}
                                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-background/80 border border-border text-muted-foreground hover:text-destructive opacity-0 group-hover/att:opacity-100 transition-all shadow-sm"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Images Card */}
              <div className="rounded-2xl border border-border bg-muted/20">
                <button
                  onClick={() => setDraftImagesCollapsed(prev => !prev)}
                  className="w-full flex items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <Image className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground">Images</h3>
                    {newTaskImages.length > 0 && (
                      <span className="text-xs text-muted-foreground">({newTaskImages.length})</span>
                    )}
                  </div>
                  {draftImagesCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                </button>
                {!draftImagesCollapsed && (
                  <div className="border-t border-border/60 px-4 py-3 space-y-3">
                    {!isPremium ? (
                      <div className="border border-dashed border-border rounded-xl">
                        <PremiumGate
                          title="Image Attachments"
                          description="Upload images directly to your tasks."
                          icon={<Image className="w-6 h-6 text-primary" />}
                        />
                      </div>
                    ) : (
                      <>
                        <label className="flex flex-col items-center justify-center w-full min-h-[100px] border-2 border-dashed border-border rounded-xl bg-muted/20 hover:bg-muted/40 hover:border-primary/50 transition-all cursor-pointer">
                          <div className="flex flex-col items-center justify-center py-4">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                              <Image className="w-5 h-5 text-primary" />
                            </div>
                            <p className="text-sm font-medium text-foreground">Click to upload</p>
                            <p className="text-xs text-muted-foreground mt-1">PNG, JPG, GIF (max 10MB)</p>
                          </div>
                          <input type="file" multiple accept="image/*,.heic,.heif" onChange={async e => {
                            if (!e.target.files) return;
                            const files = Array.from(e.target.files);
                            const newImgs: Attachment[] = [];
                            for (const file of files) {
                              const fileUrl = await imageToDataUrl(file);
                              const fileType = /\.heic$/i.test(file.name) ? 'image/jpeg' : (file.type || 'image/*');
                              newImgs.push({ id: crypto.randomUUID(), taskId: 'new', fileName: file.name, fileType, fileSize: file.size, fileUrl, createdAt: new Date().toISOString() });
                            }
                            setNewTaskImages(prev => [...prev, ...newImgs]);
                            e.target.value = '';
                          }} className="hidden" />
                        </label>
                        {newTaskImages.length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {newTaskImages.map(img => (
                              <div key={img.id} className="relative group/img aspect-square rounded-xl border border-border bg-muted/40 overflow-hidden">
                                {img.fileUrl ? (
                                  <img src={img.fileUrl} alt={img.fileName} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center"><Image className="w-8 h-8 text-muted-foreground" /></div>
                                )}
                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 pt-6">
                                  <p className="text-xs font-medium text-white truncate">{img.fileName}</p>
                                  {img.fileSize != null && <p className="text-[10px] text-white/70">{(img.fileSize / 1024).toFixed(1)} KB</p>}
                                </div>
                                <button
                                  onClick={() => setNewTaskImages(prev => prev.filter(x => x.id !== img.id))}
                                  className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-background/80 border border-border text-muted-foreground hover:text-destructive opacity-0 group-hover/img:opacity-100 transition-all shadow-sm z-10"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-4 border-t border-border flex justify-between items-center gap-2">
              <div className="relative">
                <button
                  onClick={() => setTemplateMenuOpen(!templateMenuOpen)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-all"
                >
                  <Star className="w-3.5 h-3.5" />
                  Templates
                </button>
                {templateMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setTemplateMenuOpen(false)} />
                    <div className="absolute bottom-full left-0 mb-2 w-48 bg-card border border-border rounded-xl shadow-xl z-30 p-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); setTemplateMenuOpen(false); setSaveTemplateOpen(true); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground rounded-lg hover:bg-muted transition-all"
                      >
                        <div className="w-6 h-6 rounded-md bg-primary/5 flex items-center justify-center">
                          <Plus className="w-3.5 h-3.5 text-primary" />
                        </div>
                        Save as template
                      </button>
                      <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        setTemplateMenuOpen(false);
                        setTemplateError('');
                        try {
                          const t = await fetchTemplates();
                          setTemplates(t);
                          setLoadTemplateOpen(true);
                        } catch (err) {
                          setTemplateError('Failed to load templates. Check your connection and try again.');
                          setTimeout(() => setTemplateError(''), 4000);
                        }
                      }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground rounded-lg hover:bg-muted transition-all"
                      >
                        <div className="w-6 h-6 rounded-md bg-muted/50 flex items-center justify-center">
                          <FolderKanban className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        Load template
                      </button>
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setAddingTask(false); resetTaskDraft(); }} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
                <button
                  onClick={createTask}
                  disabled={!newTaskTitle.trim() || (newTaskProjectId !== '' && newTaskColumnId === '')}
                  className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-all"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {saveTemplateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSaveTemplateOpen(false)}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Star className="w-4 h-4 text-primary" />
                </div>
                <h2 className="text-sm font-semibold text-foreground">Save as template</h2>
              </div>
              <button onClick={() => { setSaveTemplateOpen(false); setTemplateName(''); }} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">
              {templateError && (
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-destructive bg-destructive/10 rounded-lg">
                  <span>⚠</span>
                  <span>{templateError}</span>
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Template name</label>
                <input
                  autoFocus
                  placeholder="e.g. Daily Standup Task"
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && templateName.trim() && document.getElementById('save-template-btn')?.click()}
                  className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
              <button onClick={() => { setSaveTemplateOpen(false); setTemplateName(''); }} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-all">Cancel</button>
              <button
                id="save-template-btn"
                onClick={async () => {
                  if (!templateName.trim()) return;
                  setTemplateError('');
                  try {
                    await createTemplate({
                      name: templateName.trim(),
                      title: newTaskTitle || '',
                      description: newTaskDescription || '',
                      priority: newTaskPriority || 'medium',
                      duration: newTaskDuration || 0,
                      startDate: newTaskStartDate || undefined,
                      startTime: newTaskStartTime || undefined,
                      dueDate: newTaskDueDate || undefined,
                      dueTime: newTaskDueTime || undefined,
                      projectId: newTaskProjectId ? Number(newTaskProjectId) : null,
                      columnId: newTaskColumnId || undefined,
                      labels: newTaskLabels || [],
                      subtasks: (newTaskSubtasks || []).map(st => ({ text: st.text, durationMinutes: st.durationMinutes })),
                      checklists: newChecklistItems.map(item => ({ id: crypto.randomUUID(), title: 'Checklist', items: [{ id: crypto.randomUUID(), text: item.text, checked: false }] })),
                    });
                    setSaveTemplateOpen(false);
                    setTemplateName('');
                  } catch (err) {
                    setTemplateError('Failed to save template. Check your connection and try again.');
                    setTimeout(() => setTemplateError(''), 4000);
                  }
                }}
                disabled={!templateName.trim()}
                className="px-4 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-all"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {loadTemplateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setLoadTemplateOpen(false)}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FolderKanban className="w-4 h-4 text-primary" />
                </div>
                <h2 className="text-sm font-semibold text-foreground">Load template</h2>
              </div>
              <button onClick={() => setLoadTemplateOpen(false)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            {templateError && (
              <div className="flex items-center gap-2 px-5 py-2 text-xs text-destructive bg-destructive/10">
                <span>⚠</span>
                <span>{templateError}</span>
              </div>
            )}
            <div className="max-h-80 overflow-y-auto p-2">
              {templates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                  <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center mb-3">
                    <FolderKanban className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No templates yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Save a task as a template first.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {templates.map(tmpl => (
                    <div key={tmpl.id} className="group flex items-center gap-2 px-3 py-2 hover:bg-muted/50 rounded-xl border border-transparent hover:border-border transition-all">
                      <button
                        onClick={() => {
                          setNewTaskTitle(tmpl.title || '');
                          setNewTaskDescription(tmpl.description || '');
                          setNewTaskPriority(tmpl.priority || 'medium');
                          setNewTaskDuration(tmpl.duration || 0);
                          setNewTaskStartDate(tmpl.startDate || '');
                          setNewTaskStartTime(tmpl.startTime || '');
                          setNewTaskDueDate(tmpl.dueDate || '');
                          setNewTaskDueTime(tmpl.dueTime || '');
                          setNewTaskProjectId(tmpl.projectId ? Number(tmpl.projectId) : '');
                          setNewTaskColumnId(tmpl.columnId || '');
                          setNewTaskLabels(tmpl.labels || []);
                          setNewTaskSubtasks((tmpl.subtasks || []).map(st => ({ id: crypto.randomUUID(), ...st })));
                          setNewChecklistItems((tmpl.checklists || []).flatMap(cl => (cl.items || []).map(item => ({ id: crypto.randomUUID(), text: item.text }))));
                          setLoadTemplateOpen(false);
                        }}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                      >
                        <div className="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center flex-shrink-0">
                          <Star className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium block truncate">{tmpl.name}</span>
                          {tmpl.title && <span className="text-xs text-muted-foreground truncate block">{tmpl.title}</span>}
                        </div>
                      </button>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex-shrink-0">
                        <button
                          onClick={() => {
                            setLoadTemplateOpen(false);
                            handleEditTemplate(tmpl);
                          }}
                          className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-all"
                          title="Edit template"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Delete template "${tmpl.name}"?`)) return;
                            try {
                              await deleteTemplateApi(tmpl.id);
                              setTemplates(await fetchTemplates());
                            } catch (err) {
                              console.error('Failed to delete template:', err);
                            }
                          }}
                          className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg hover:bg-destructive/10 transition-all"
                          title="Delete template"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end px-5 py-4 border-t border-border">
              <button onClick={() => setLoadTemplateOpen(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-all">Close</button>
            </div>
          </div>
        </div>
      )}

      {analysisPanelOpen && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          <div className="absolute inset-0 bg-black/10 pointer-events-auto" onClick={() => setAnalysisPanelOpen(false)} />
          <aside className="absolute right-0 top-0 h-full w-full max-w-sm bg-card border-l border-border shadow-[-10px_0_30px_rgba(0,0,0,0.08)] pointer-events-auto flex flex-col">
            <header className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BarChart3 className="w-4 h-4 text-primary" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">Goal Analysis</h3>
              </div>
              <button onClick={() => setAnalysisPanelOpen(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </header>

            {!isPremium ? (
              <div className="flex-1 flex items-center">
                <PremiumGate
                  title="Goal Analysis"
                  description="Get AI-style insights into your tasks with overview, deadline risk, progress tracking, and priority checks."
                  icon={<BarChart3 className="w-6 h-6 text-primary" />}
                />
              </div>
            ) : (
              <>
                <div className="flex border-b border-border">
                  {(
                    [
                      { key: 'overview', label: 'Overview' },
                      { key: 'deadlines', label: 'Deadlines' },
                      { key: 'progress', label: 'Progress' },
                      { key: 'priority', label: 'Priority' },
                    ] as Array<{ key: AnalysisTab; label: string }>
                  ).map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => runTaskAnalysis(tab.key)}
                      className={`flex-1 px-2 py-3 text-xs font-semibold transition-all border-b-2 ${
                        activeAnalysisTab === tab.key
                          ? 'text-primary border-primary'
                          : 'text-muted-foreground border-transparent hover:text-foreground'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  {analysisLoading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      Analyzing tasks...
                    </div>
                  )}
                  {!analysisLoading && !analysisResult && (
                    <p className="text-sm text-muted-foreground">Select a tab to run analysis.</p>
                  )}
                  {!analysisLoading && analysisResult && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h4 className="text-base font-semibold text-foreground">{analysisResult.title}</h4>
                          <p className="text-sm text-muted-foreground mt-0.5">{analysisResult.summary}</p>
                        </div>
                        {analysisResult.items && analysisResult.items.length > 0 && (
                          <button
                            onClick={() => {
                              const allExpanded = analysisResult.items!.length > 0 &&
                                analysisResult.items!.every(i => analysisExpanded.includes(i.taskId));
                              setAnalysisExpanded(allExpanded ? [] : analysisResult.items!.map(i => i.taskId));
                            }}
                            className="shrink-0 text-xs font-semibold text-primary hover:underline"
                          >
                            {analysisResult.items.length > 0 && analysisResult.items.every(i => analysisExpanded.includes(i.taskId))
                              ? 'Collapse all'
                              : 'Expand all'}
                          </button>
                        )}
                      </div>

                      {!analysisResult.items || analysisResult.items.length === 0 ? (
                        <div className="space-y-2">
                          {analysisResult.lines.map((line, idx) => (
                            <div
                              key={idx}
                              className={`text-sm text-foreground bg-muted/30 rounded-lg px-3 py-2 ${line.taskId ? 'cursor-pointer hover:bg-muted/60 transition-colors' : ''}`}
                              onClick={() => {
                                if (line.taskId) {
                                  setAnalysisPanelOpen(false);
                                  setOpenTaskId(line.taskId);
                                }
                              }}
                            >
                              {line.text}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {analysisResult.items.map(item => {
                            const expanded = analysisExpanded.includes(item.taskId);
                            const hasBad = item.facts.some(f => f.tone === 'bad');
                            const hasWarn = item.facts.some(f => f.tone === 'warn');
                            return (
                              <div key={item.taskId} className="rounded-lg border border-border bg-card overflow-hidden">
                                <button
                                  onClick={() =>
                                    setAnalysisExpanded(prev =>
                                      prev.includes(item.taskId)
                                        ? prev.filter(id => id !== item.taskId)
                                        : [...prev, item.taskId]
                                    )
                                  }
                                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
                                >
                                  <ChevronRight className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                                  <div className="min-w-0 flex-1">
                                    <div className="text-sm font-medium text-foreground truncate">{item.title}</div>
                                    <div className="text-xs text-muted-foreground">{item.statusLabel}</div>
                                  </div>
                                  {hasBad && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
                                  {!hasBad && hasWarn && <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />}
                                </button>
                                {expanded && (
                                  <div className="px-3 pb-3 pt-0.5 space-y-1.5">
                                    <p className="text-xs text-muted-foreground leading-relaxed">{item.reasoning}</p>
                                    {item.facts.map((fact, idx) => (
                                      <div key={idx} className="flex items-start gap-2 text-sm">
                                        <span
                                          className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${
                                            fact.tone === 'ok' ? 'bg-green-500' : fact.tone === 'warn' ? 'bg-amber-500' : fact.tone === 'bad' ? 'bg-red-500' : 'bg-muted-foreground'
                                          }`}
                                        />
                                        <span className="text-foreground"><span className="font-medium">{fact.label}:</span> {fact.value}</span>
                                      </div>
                                    ))}
                                    <button
                                      onClick={() => {
                                        setAnalysisPanelOpen(false);
                                        setOpenTaskId(item.taskId);
                                      }}
                                      className="mt-1 text-xs font-semibold text-primary hover:underline"
                                    >
                                      Open task
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      {(openTask || templateEditTask) && (
        <TaskFullView
          task={templateEditTask || openTask!}
          onClose={() => { setOpenTaskId(null); setEditingTemplateMeta(null); setTemplateEditName(''); }}
          boardColumns={board.columns}
          projects={projects}
          allTags={allTags}
          onUpdateTask={wrappedUpdateTask}
          onToggleChecklistItem={(taskId, checklistId, itemId) => {
            if (taskId.startsWith('template-edit-')) {
              const overrides = templateEditOverrides || {};
              const checklists = overrides.checklists || editingTemplateMeta?.template.checklists || [];
              const next = checklists.map((list: any) =>
                list.id === checklistId
                  ? { ...list, items: (list.items || []).map((item: any) => item.id === itemId ? { ...item, done: !item.done } : item) }
                  : list
              );
              wrappedUpdateTask(taskId, { checklists: next } as any);
            } else {
              toggleChecklistItem(taskId, checklistId, itemId);
            }
          }}
          onAddChecklistItem={(taskId, checklistId, text) => {
            if (taskId.startsWith('template-edit-')) {
              const overrides = templateEditOverrides || {};
              const checklists = overrides.checklists || editingTemplateMeta?.template.checklists || [];
              const item = { id: `item-${crypto.randomUUID()}`, text, done: false };
              const next = checklists.map((list: any) =>
                list.id === checklistId ? { ...list, items: [...(list.items || []), item] } : list
              );
              wrappedUpdateTask(taskId, { checklists: next } as any);
            } else {
              addChecklistItem(taskId, checklistId, text);
            }
          }}
          onDeleteChecklistItem={(taskId, checklistId, itemId) => {
            if (taskId.startsWith('template-edit-')) {
              const overrides = templateEditOverrides || {};
              const checklists = overrides.checklists || editingTemplateMeta?.template.checklists || [];
              const next = checklists.map((list: any) =>
                list.id === checklistId ? { ...list, items: (list.items || []).filter((item: any) => item.id !== itemId) } : list
              );
              wrappedUpdateTask(taskId, { checklists: next } as any);
            } else {
              deleteChecklistItem(taskId, checklistId, itemId);
            }
          }}
          onDeleteTask={taskId => { setSingleDeleteTaskId(taskId); setOpenTaskId(null); }}
          onToggleTag={(taskId, label) => {
            if (taskId.startsWith('template-edit-')) {
              wrappedUpdateTask(taskId, { labels: [...((templateEditTask?.labels || []) as Label[]), label] });
            } else {
              toggleTaskTag(taskId, label);
            }
          }}
          onCreateTag={async (taskId, name, color) => {
            try {
              const label = await createSharedTaskLabel(name, color);
              if (taskId.startsWith('template-edit-')) {
                wrappedUpdateTask(taskId, { labels: [...((templateEditTask?.labels || []) as Label[]), label] });
              } else {
                const task = board.tasks.find(item => item.id === taskId);
                if (!task) return;
                updateTask(taskId, { labels: [...task.labels, label] });
              }
            } catch (error) {
              console.error('Failed to create task tag:', error);
            }
          }}
          onDeleteTagEverywhere={deleteTagEverywhere}
          onRenameTagEverywhere={renameTagEverywhere}
          onColorChangeTagEverywhere={changeTagColorEverywhere}
          isPremium={isPremium}
          isPro={isPro}
          onJumpToTask={id => { setOpenTaskId(null); setTimeout(() => setOpenTaskId(id), 50); }}
          onEditTemplate={handleEditTemplate}
          onSaveTemplate={handleSaveTemplate}
          editingTemplateMeta={editingTemplateMeta}
          templateEditName={templateEditName}
          onTemplateEditNameChange={setTemplateEditName}
        />
      )}

      {isDeleteMode && (
        <div className="sticky bottom-0 left-0 right-0 z-30 p-4 bg-background/80 backdrop-blur-md border-t border-border flex justify-center animate-fade-in">
          <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-xl px-5 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center text-destructive flex-shrink-0">
                <Trash2 className="w-4 h-4" />
              </div>
              <span className="text-sm font-bold text-foreground">
                {selectedDeleteTaskIds.length === 0
                  ? 'Select tasks to delete'
                  : `${selectedDeleteTaskIds.length} task${selectedDeleteTaskIds.length === 1 ? '' : 's'} selected`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setSelectedDeleteTaskIds([]); setIsDeleteMode(false); }}
                className="px-4 py-2 text-xs font-semibold rounded-lg hover:bg-muted text-muted-foreground transition-all"
              >
                Cancel
              </button>
              <button
                disabled={selectedDeleteTaskIds.length === 0}
                onClick={handleBulkDelete}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-destructive text-destructive-foreground rounded-lg disabled:opacity-40 hover:bg-destructive/95 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete selected — {selectedDeleteTaskIds.length} task{selectedDeleteTaskIds.length === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmOpen && (
        <DeleteConfirmDialog
          count={selectedDeleteTaskIds.length}
          onConfirm={confirmBulkDelete}
          onCancel={() => setDeleteConfirmOpen(false)}
        />
      )}

      {singleDeleteTaskId && (
        <DeleteConfirmDialog
          count={1}
          onConfirm={confirmSingleDelete}
          onCancel={() => setSingleDeleteTaskId(null)}
        />
      )}

      {columnEditId && columnEditPos && (() => {
        const col = board.columns.find(c => c.id === columnEditId);
        if (!col) return null;
        return createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { setColumnEditId(null); closeColumnEdit(); }}>
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
            <div className="relative w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl animate-fade-in" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <span className="text-base font-bold text-foreground">Edit Column</span>
                <button onClick={() => { setColumnEditId(null); closeColumnEdit(); }} className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Name</label>
                  <input
                    autoFocus
                    value={columnEditName}
                    onChange={e => setColumnEditName(e.target.value)}
                    className="w-full bg-muted/30 border border-border rounded-xl p-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Color</label>
                  <div className="flex flex-wrap gap-2">
                    {COLUMN_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => setColumnEditColor(c)}
                        className={`w-7 h-7 rounded-full border-2 transition-all hover:scale-110 ${columnEditColor === c ? 'border-foreground ring-2 ring-primary/30' : 'border-transparent'}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Icon</label>
                  <div className="flex gap-2">
                    <input
                      value={columnEditIcon}
                      onChange={e => setColumnEditIcon(e.target.value)}
                      placeholder="e.g. 📁 or 🚀"
                      className="flex-1 bg-muted/30 border border-border rounded-xl p-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                    <button
                      onClick={() => { updateColumn(columnEditId, { title: columnEditName, color: columnEditColor, icon: columnEditIcon || undefined }); setColumnEditId(null); closeColumnEdit(); }}
                      className="px-5 py-2.5 bg-foreground text-background text-sm font-bold rounded-xl hover:opacity-90 transition-opacity"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}
      {aiBuilderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setAiBuilderOpen(false)}>
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">AI Goal Builder</h2>
                  <p className="text-xs text-muted-foreground">Describe your task and AI will structure it for you</p>
                </div>
              </div>
              <button onClick={() => setAiBuilderOpen(false)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {!isPro ? (
              <div className="p-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-base font-semibold text-foreground">Pro Feature</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">AI Goal Builder is available exclusively for Pro users. Upgrade to unlock AI-powered task creation.</p>
                <button
                  onClick={() => window.location.href = '/pricing'}
                  className="px-6 py-2.5 text-sm font-bold bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-all"
                >
                  Upgrade to Pro
                </button>
              </div>
            ) : (
              <div className="p-5 space-y-4 max-h-[calc(90vh-88px)] overflow-y-auto">
                <textarea
                  autoFocus
                  value={aiBuilderInput}
                  onChange={e => setAiBuilderInput(e.target.value)}
                  placeholder="Describe your task, project, or goal in detail...&#10;&#10;e.g. 'I need to launch a new website by next Friday. It requires designing 3 pages, writing copy, setting up hosting, and testing on mobile.'"
                  rows={7}
                  className="w-full bg-muted/40 border border-border rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                {aiBuilderError && (
                  <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{aiBuilderError}</p>
                )}

                <div className="rounded-2xl border border-border bg-muted/20">
                  <button onClick={() => setAiBuilderFilesCollapsed(v => !v)} className="w-full flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Paperclip className="w-4 h-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold text-foreground">Files</h3>
                      {aiBuilderFiles.length > 0 && <span className="text-xs text-muted-foreground">({aiBuilderFiles.length})</span>}
                    </div>
                    {aiBuilderFilesCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                  </button>
                  {!aiBuilderFilesCollapsed && (
                    <div className="border-t border-border/60 px-4 py-3 space-y-3">
                      <label className="flex flex-col items-center justify-center w-full min-h-[100px] border-2 border-dashed border-border rounded-xl bg-muted/20 hover:bg-muted/40 hover:border-primary/50 transition-all cursor-pointer">
                        <div className="flex flex-col items-center justify-center py-4">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                            <Paperclip className="w-5 h-5 text-primary" />
                          </div>
                          <p className="text-sm font-medium text-foreground">Click to upload or drag and drop</p>
                          <p className="text-xs text-muted-foreground mt-1">PDF, Images, Documents (max 10MB)</p>
                        </div>
                        <input type="file" multiple onChange={e => { if (!e.target.files) return; setAiBuilderFiles(prev => [...prev, ...Array.from(e.target.files || [])]); e.target.value=''; }} className="hidden" />
                      </label>
                      {aiBuilderFiles.length > 0 && (
                        <DragDropContext onDragEnd={result => { if (!result.destination) return; const items = Array.from(aiBuilderFiles); const [r]=items.splice(result.source.index,1); items.splice(result.destination.index,0,r); setAiBuilderFiles(items); }}>
                          <Droppable droppableId="ai-builder-files-tasks">
                            {provided => (
                              <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
                                {aiBuilderFiles.map((file, fileIdx) => (
                                  <Draggable key={`${file.name}-${fileIdx}`} draggableId={`ai-task-file-${fileIdx}-${file.name}`} index={fileIdx}>
                                    {provided => (
                                      <div ref={provided.innerRef} {...provided.draggableProps} className="flex items-center gap-2 group/file">
                                        <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground"><GripVertical className="w-4 h-4" /></div>
                                        <div className="flex-1 flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/40">
                                          <div className="w-10 h-10 rounded-lg bg-background border border-border flex items-center justify-center"><Paperclip className="w-5 h-5 text-muted-foreground" /></div>
                                          <div className="flex-1 min-w-0"><p className="text-sm font-medium text-foreground truncate">{file.name}</p><p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p></div>
                                          <button onClick={e => { e.preventDefault(); e.stopPropagation(); setAiBuilderFiles(prev => prev.filter((_, idx) => idx !== fileIdx)); }} className="p-1.5 rounded-lg bg-background/80 border border-border text-muted-foreground hover:text-destructive opacity-0 group-hover/file:opacity-100 transition-opacity duration-200"><Trash2 className="w-3.5 h-3.5" /></button>
                                        </div>
                                      </div>
                                    )}
                                  </Draggable>
                                ))}
                                {provided.placeholder}
                              </div>
                            )}
                          </Droppable>
                        </DragDropContext>
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-border bg-muted/20">
                  <button onClick={() => setAiBuilderImagesCollapsed(v => !v)} className="w-full flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Image className="w-4 h-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold text-foreground">Images</h3>
                      {aiBuilderImages.length > 0 && <span className="text-xs text-muted-foreground">({aiBuilderImages.length})</span>}
                    </div>
                    {aiBuilderImagesCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                  </button>
                  {!aiBuilderImagesCollapsed && (
                    <div className="border-t border-border/60 px-4 py-3 space-y-3">
                      <label className="flex flex-col items-center justify-center w-full min-h-[100px] border-2 border-dashed border-border rounded-xl bg-muted/20 hover:bg-muted/40 hover:border-primary/50 transition-all cursor-pointer">
                        <div className="flex flex-col items-center justify-center py-4">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                            <Image className="w-5 h-5 text-primary" />
                          </div>
                          <p className="text-sm font-medium text-foreground">Click to upload</p>
                          <p className="text-xs text-muted-foreground mt-1">PNG, JPG, GIF (max 10MB)</p>
                        </div>
                        <input type="file" multiple accept="image/*,.heic,.heif" onChange={async e => { if (!e.target.files) return; const files = Array.from(e.target.files); const newImgs: Attachment[]=[]; for (const file of files){ const fileUrl=await imageToDataUrl(file); const fileType=/\.heic$/i.test(file.name)?'image/jpeg':(file.type||'image/*'); newImgs.push({ id: crypto.randomUUID(), taskId: 'new', fileName: file.name, fileType, fileSize: file.size, fileUrl, createdAt: new Date().toISOString() }); } setAiBuilderImages(prev=>[...prev,...newImgs]); e.target.value=''; }} className="hidden" />
                      </label>
                      {aiBuilderImages.length > 0 && (
                        <DraggableImageGrid images={aiBuilderImages} onReorder={setAiBuilderImages} onRemove={id => setAiBuilderImages(prev=>prev.filter(x=>x.id!==id))} disabledInBuilder />
                      )}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setAiBuilderOpen(false)}
                    className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={generateAITask}
                    disabled={!aiBuilderInput.trim() || aiBuilderLoading}
                    className="flex items-center gap-2 px-5 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-all"
                  >
                    {aiBuilderLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Generate
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {pendingDragMove && (() => {
        const { srcDroppableId, dstDroppableId, srcIndex, dstIndex, dstProject, moveType } = pendingDragMove;

        const confirmMove = () => {
          if (dontAsk) {
            localStorage.setItem(`tasks-drag-confirm-${moveType}`, 'true');
          }
          applyDragMoveDirect(srcDroppableId, dstDroppableId, srcIndex, dstIndex, dstProject);
          setPendingDragMove(null);
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setPendingDragMove(null)}>
            <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
            <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-bold text-foreground">Move task?</h3>
              <p className="text-xs text-muted-foreground mt-2">
                {moveType === 'project'
                  ? 'Are you sure you want to move this task? It will change the task\'s project.'
                  : 'Are you sure you want to move this task? It will change the task\'s column.'}
              </p>
              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input type="checkbox" checked={dontAsk} onChange={e => setDontAsk(e.target.checked)} className="rounded border-border" />
                <span className="text-xs text-muted-foreground">Don't ask me again</span>
              </label>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setPendingDragMove(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
                <button onClick={confirmMove} className="px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-xl hover:opacity-90">Move</button>
              </div>
            </div>
          </div>
        );
      })()}

      {tagDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setTagDeleteConfirm(null)}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-foreground">Delete tag everywhere?</h3>
            <p className="text-xs text-muted-foreground mt-2">This will remove this tag from the whole app. This action cannot be undone.</p>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setTagDeleteConfirm(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={() => { deleteTagEverywhere(tagDeleteConfirm); setTagDeleteConfirm(null); setTagPopupTaskId(null); }} className="px-4 py-2 text-sm font-semibold bg-destructive text-destructive-foreground rounded-xl hover:opacity-90">Delete</button>
            </div>
          </div>
        </div>
      )}

      {tagPopupTaskId && (() => {
        const popupTask = board.tasks.find(t => t.id === tagPopupTaskId);
        if (!popupTask) return null;
        return (
          <TagsModal
            open={!!tagPopupTaskId}
            onClose={() => setTagPopupTaskId(null)}
            tags={allTags}
            selectedIds={popupTask.labels.map(label => label.id)}
            onToggle={tagId => { const label = allTags.find(t => t.id === tagId); if (label) toggleTaskTag(popupTask.id, label); }}
            onCreate={async (name, color) => {
              try {
                const newLabel = await createSharedTaskLabel(name, color);
                updateTask(popupTask.id, { labels: [...popupTask.labels, newLabel] });
              } catch (error) {
                console.error('Failed to create task tag:', error);
              }
            }}
            onDelete={tagId => deleteTagEverywhere(tagId)}
            onRename={(tagId, newName) => renameTagEverywhere(tagId, newName)}
            onColorChange={(tagId, color) => changeTagColorEverywhere(tagId, color)}
          />
        );
      })()}

    </div>
  );
};

export interface TaskFullViewProps {
  task: Task;
  boardColumns: Array<{ id: string; title: string; color: string; order: number; projectId?: number | null }>;
  projects: ProjectMeta[];
  allTags: Label[];
  onClose: () => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  onToggleChecklistItem: (taskId: string, checklistId: string, itemId: string) => void;
  onAddChecklistItem: (taskId: string, checklistId: string, text: string) => void;
  onDeleteChecklistItem: (taskId: string, checklistId: string, itemId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onToggleTag: (taskId: string, tag: Label) => void;
  onCreateTag: (taskId: string, name: string, color: LabelColor) => void;
  onDeleteTagEverywhere: (tagId: string) => void;
  onRenameTagEverywhere: (tagId: string, newName: string) => void;
  onColorChangeTagEverywhere: (tagId: string, color: LabelColor) => void;
  isPremium: boolean;
  isPro: boolean;
  onJumpToTask?: (taskId: string) => void;
  onEditTemplate?: (template: TaskTemplate) => void;
  onSaveTemplate?: () => Promise<void>;
  editingTemplateMeta?: { id: number; name: string; template: TaskTemplate } | null;
  templateEditName?: string;
  onTemplateEditNameChange?: (name: string) => void;
}

export const TaskDropdownExpanded: React.FC<{
  task: Task;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  onToggleChecklistItem: (taskId: string, checklistId: string, itemId: string) => void;
  onAddChecklistItem: (taskId: string, checklistId: string, text: string) => void;
  onDeleteChecklistItem: (taskId: string, checklistId: string, itemId: string) => void;
  isPremium: boolean;
  isPro: boolean;
}> = ({ task, onUpdateTask, onToggleChecklistItem, onAddChecklistItem, onDeleteChecklistItem, isPremium, isPro }) => {
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [newSubtaskDuration, setNewSubtaskDuration] = useState(10);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingSubtaskText, setEditingSubtaskText] = useState('');
  const [newChecklistText, setNewChecklistText] = useState('');
  const [editingChecklistItemId, setEditingChecklistItemId] = useState<string | null>(null);
  const [editingChecklistText, setEditingChecklistText] = useState('');
  const [subtasksCollapsed, setSubtasksCollapsed] = useState(false);

  // Added checklist states
  const [checklistsSectionCollapsed, setChecklistsSectionCollapsed] = useState(false);
  const [collapsedChecklists, setCollapsedChecklists] = useState<Set<string>>(new Set());
  const [perChecklistInput, setPerChecklistInput] = useState<Record<string, string>>({});
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [editingChecklistId, setEditingChecklistId] = useState<string | null>(null);
  const [editingChecklistTitle, setEditingChecklistTitle] = useState('');

  // Added attachments/images states
  const [imagesCollapsed, setImagesCollapsed] = useState(false);
  const [attachmentsCollapsed, setAttachmentsCollapsed] = useState(false);
  const [uploading, setUploading] = useState(false);

  const mediaLimit = isPro ? 20 : isPremium ? 10 : 5;
  const canUseServerAttachmentApi = /^\d+$/.test(String(task.id));

  const legacySubtasksChecklist = task.checklists.find(list => list.title.toLowerCase().trim() === 'subtasks');
  const checklistLists = task.checklists.filter(list => list.id !== legacySubtasksChecklist?.id);
  const effectiveSubtasks = (task.subtasks && task.subtasks.length > 0)
    ? task.subtasks
    : (legacySubtasksChecklist?.items || []).map(item => ({ ...item, durationMinutes: 0 }));
  const primaryChecklist = checklistLists[0];
  const taskDuration = Math.max(0, Number(task.duration) || 0);
  const subtaskTotal = effectiveSubtasks.reduce((s, st) => s + Math.max(0, Number(st.durationMinutes) || 0), 0);
  const subtaskTimeRemaining = taskDuration - subtaskTotal;
  const allSubtasksDone = effectiveSubtasks.length > 0 && effectiveSubtasks.every(st => st.completed);
  const subtaskDoneCount = effectiveSubtasks.filter(st => st.completed).length;
  const subtaskPct = effectiveSubtasks.length > 0 ? Math.round((subtaskDoneCount / effectiveSubtasks.length) * 100) : 0;
  const checklistTotal = checklistLists.reduce((s, l) => s + l.items.length, 0);
  const checklistDone = checklistLists.reduce((s, l) => s + l.items.filter(i => i.completed).length, 0);
  const checklistPct = checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : 0;
  const allChecklistsDone = checklistTotal > 0 && checklistDone === checklistTotal;

  const persistSubtasks = (nextSubtasks: Task['subtasks']) => {
    const nextChecklists = legacySubtasksChecklist
      ? task.checklists.filter(list => list.id !== legacySubtasksChecklist.id)
      : task.checklists;
    onUpdateTask(task.id, { subtasks: nextSubtasks as any, checklists: nextChecklists });
  };

  const updateSubtask = (subtaskId: string, updates: Partial<Subtask>) => {
    const updateRecursive = (list: Subtask[]): Subtask[] =>
      list.map(st => st.id === subtaskId ? { ...st, ...updates } : { ...st, children: st.children ? updateRecursive(st.children) : undefined });
    persistSubtasks(updateRecursive(effectiveSubtasks as any) as any);
  };

  const addSubtask = () => {
    if (!newSubtaskText.trim()) return;
    persistSubtasks([
      ...effectiveSubtasks,
      { id: crypto.randomUUID(), text: newSubtaskText.trim(), completed: false, durationMinutes: Math.max(0, Number(newSubtaskDuration) || 0) },
    ]);
    setNewSubtaskText('');
    setNewSubtaskDuration(10);
  };

  const removeSubtask = (subtaskId: string) => {
    const removeRecursive = (list: Subtask[]): Subtask[] =>
      list.filter(st => st.id !== subtaskId).map(st => st.children ? { ...st, children: removeRecursive(st.children) } : st);
    persistSubtasks(removeRecursive(effectiveSubtasks as any) as any);
  };

  const saveSubtaskEdit = (subtaskId: string) => {
    const next = editingSubtaskText.trim();
    if (next) updateSubtask(subtaskId, { text: next });
    setEditingSubtaskId(null);
    setEditingSubtaskText('');
  };

  const saveChecklistItemEdit = (checklistId: string, itemId: string) => {
    const next = editingChecklistText.trim();
    if (next) {
      onUpdateTask(task.id, {
        checklists: task.checklists.map(list =>
          list.id !== checklistId ? list : {
            ...list,
            items: list.items.map(item => item.id === itemId ? { ...item, text: next } : item),
          }
        ),
      });
    }
    setEditingChecklistItemId(null);
    setEditingChecklistText('');
  };

  const handleDropdownReorder = useCallback((result: DropResult) => {
    if (!result.destination) return;
    if (result.source.droppableId === `dropdown-subtasks-${task.id}`) {
      const items = Array.from(effectiveSubtasks);
      const [removed] = items.splice(result.source.index, 1);
      items.splice(result.destination.index, 0, removed);
      persistSubtasks(items);
    } else if (result.source.droppableId === `dropdown-checklist-lists-${task.id}`) {
      const items = Array.from(task.checklists);
      const [removed] = items.splice(result.source.index, 1);
      items.splice(result.destination.index, 0, removed);
      onUpdateTask(task.id, { checklists: items });
    } else if (result.source.droppableId.startsWith(`dropdown-checklist-${task.id}-`)) {
      const srcChecklistId = result.source.droppableId.replace(`dropdown-checklist-${task.id}-`, '');
      const dstChecklistId = result.destination.droppableId.replace(`dropdown-checklist-${task.id}-`, '');

      if (srcChecklistId === dstChecklistId) {
        onUpdateTask(task.id, {
          checklists: task.checklists.map(cl =>
            cl.id === srcChecklistId
              ? { ...cl, items: (() => {
                  const items = Array.from(cl.items);
                  const [removed] = items.splice(result.source.index, 1);
                  items.splice(result.destination.index, 0, removed);
                  return items;
                })() }
              : cl
          ),
        });
      } else {
        let movedItem: ChecklistItem | null = null;
        const without = task.checklists.map(cl =>
          cl.id === srcChecklistId
            ? (() => { const items = Array.from(cl.items); [movedItem] = items.splice(result.source.index, 1); return { ...cl, items }; })()
            : cl
        );
        if (!movedItem) return;
        onUpdateTask(task.id, {
          checklists: without.map(cl =>
            cl.id === dstChecklistId
              ? { ...cl, items: [...cl.items.slice(0, result.destination!.index), movedItem!, ...cl.items.slice(result.destination!.index)] }
              : cl
          ),
        });
      }
    }
  }, [effectiveSubtasks, persistSubtasks, task.checklists, onUpdateTask]);

  const handleImageReorder = useCallback((result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(task.images || []);
    const [removed] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, removed);
    onUpdateTask(task.id, { images: items });
  }, [task.images, onUpdateTask]);

  const handleAttachmentReorder = useCallback((result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(task.attachments || []);
    const [removed] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, removed);
    onUpdateTask(task.id, { attachments: items });
  }, [task.attachments, onUpdateTask]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    setUploading(true);
    const uploaded: Attachment[] = [];
    for (const file of files) {
      if (canUseServerAttachmentApi) {
        try {
          const formData = new FormData();
          formData.append('file', file);
          const res = await fetch(`/api/attachments/${task.id}`, { method: 'POST', credentials: 'include', body: formData });
          if (res.ok) {
            uploaded.push(await res.json());
          } else {
            uploaded.push({ id: crypto.randomUUID(), taskId: task.id, fileName: file.name, fileType: file.type || 'application/octet-stream', fileSize: file.size, fileUrl: await fileToDataUrl(file), createdAt: new Date().toISOString() });
          }
        } catch {
          uploaded.push({ id: crypto.randomUUID(), taskId: task.id, fileName: file.name, fileType: file.type || 'application/octet-stream', fileSize: file.size, fileUrl: await fileToDataUrl(file), createdAt: new Date().toISOString() });
        }
      } else {
        uploaded.push({ id: crypto.randomUUID(), taskId: task.id, fileName: file.name, fileType: file.type || 'application/octet-stream', fileSize: file.size, fileUrl: await fileToDataUrl(file), createdAt: new Date().toISOString() });
      }
    }
    if (uploaded.length > 0) onUpdateTask(task.id, { attachments: [...(task.attachments || []), ...uploaded] });
    setUploading(false);
    e.currentTarget.value = '';
  };

  const deleteAttachment = async (attachmentId: string) => {
    onUpdateTask(task.id, { attachments: (task.attachments || []).filter(item => item.id !== attachmentId) });
    if (canUseServerAttachmentApi && /^\d+$/.test(String(attachmentId))) {
      try { await fetch(`/api/attachments/${attachmentId}`, { method: 'DELETE', credentials: 'include' }); } catch {}
    }
  };

  const renderSubtaskItem = (subtask: Subtask, index: number): React.ReactNode => {
    return (
      <Draggable key={subtask.id} draggableId={subtask.id} index={index}>
        {(provided) => (
          <div ref={provided.innerRef} {...provided.draggableProps} className="min-w-0">
            <div className="grid grid-cols-[auto_auto_1fr_auto] gap-2 items-center rounded-lg border border-border px-3 py-2 group/subtask">
              <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
                <GripVertical className="w-4 h-4" />
              </div>
              <CircleToggle
                completed={subtask.completed}
                onClick={() => updateSubtask(subtask.id, { completed: !subtask.completed })}
                size="sm"
              />
              {editingSubtaskId === subtask.id ? (
                <input
                  autoFocus
                  className="text-sm bg-muted/40 border border-primary/30 rounded px-2 py-0.5"
                  value={editingSubtaskText}
                  onChange={e => setEditingSubtaskText(e.target.value)}
                  onBlur={() => saveSubtaskEdit(subtask.id)}
                  onKeyDown={e => e.key === 'Enter' && saveSubtaskEdit(subtask.id)}
                />
              ) : (
                <span
                  onClick={() => { setEditingSubtaskId(subtask.id); setEditingSubtaskText(subtask.text); }}
                  className={`text-sm cursor-text truncate ${subtask.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}
                >
                  {subtask.text}
                </span>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  className="w-16 text-xs bg-muted/40 border border-border rounded px-1.5 py-0.5 text-right focus:outline-none focus:ring-1 focus:ring-primary/30"
                  value={subtask.durationMinutes || 0}
                  onChange={e => updateSubtask(subtask.id, { durationMinutes: Math.max(0, Number(e.target.value) || 0) })}
                />
                <span className="text-[10px] text-muted-foreground">min</span>
                <button
                  onClick={() => removeSubtask(subtask.id)}
                  className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover/item:opacity-100 transition-opacity duration-200"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </Draggable>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground mb-1.5">Description</h4>
        <textarea
          value={task.description}
          onChange={e => onUpdateTask(task.id, { description: e.target.value })}
          rows={3}
          className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm resize-none"
        />
      </div>

      {/* Sub-tasks Section */}
      <div className="rounded-2xl border border-border bg-muted/20">
        <button
          onClick={() => setSubtasksCollapsed(prev => !prev)}
          className="w-full flex items-center justify-between px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Sub-tasks</h3>
            {effectiveSubtasks.length > 0 && (
              <span className="text-xs text-muted-foreground">({effectiveSubtasks.length})</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {taskDuration > 0 && (
              <span className={`text-xs font-medium ${
                subtaskTimeRemaining > 0 ? 'text-muted-foreground' :
                subtaskTimeRemaining < 0 ? 'text-orange-500' : 'text-label-green'
              }`}>
                {subtaskTimeRemaining > 0
                  ? `${subtaskTimeRemaining} mins left`
                  : subtaskTimeRemaining < 0
                  ? `Over by ${Math.abs(subtaskTimeRemaining)} mins`
                  : '0 mins left ✓'}
              </span>
            )}
            {subtasksCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
          </div>
        </button>
        {!subtasksCollapsed && (
          <div className="border-t border-border/60 px-4 py-3 space-y-3">
            <div className="h-2 bg-muted rounded-full overflow-hidden" role="progressbar" aria-valuenow={subtaskPct} aria-valuemin={0} aria-valuemax={100} aria-label="Sub-tasks progress" data-testid="subtasks-progress">
              <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${subtaskPct}%` }} data-testid="subtasks-progress-bar" />
            </div>
            {allSubtasksDone && (
              <div className="text-xs text-primary bg-primary/10 px-2.5 py-1 rounded-md inline-block">
                All sub-tasks are done ✓
              </div>
            )}

            <DragDropContext onDragEnd={handleDropdownReorder}>
              <Droppable droppableId={`dropdown-subtasks-${task.id}`} type="subtask">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
                    {effectiveSubtasks.map((subtask, si) => renderSubtaskItem(subtask as any, si))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>

            <div className="grid grid-cols-[1fr_120px_auto] gap-2">
              <input
                value={newSubtaskText}
                onChange={e => setNewSubtaskText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addSubtask()}
                placeholder="Add sub-task"
                className="bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="number"
                min={0}
                value={newSubtaskDuration}
                onChange={e => setNewSubtaskDuration(Math.max(0, Number(e.target.value) || 0))}
                placeholder="min"
                className="bg-muted/40 border border-border rounded-lg px-2 py-2 text-sm"
              />
              <button onClick={addSubtask} className="px-3 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 shrink-0">
                Add
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Checklist Section */}
      <div className="rounded-2xl border border-border bg-muted/20">
        <button
          onClick={() => setChecklistsSectionCollapsed(prev => !prev)}
          className="w-full flex items-center justify-between px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Checklist</h3>
            {checklistLists.length > 0 && (
              <span className="text-xs text-muted-foreground">({checklistLists.length})</span>
            )}
          </div>
          {checklistsSectionCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
        </button>
        {!checklistsSectionCollapsed && (
          <div className="border-t border-border/60 px-4 py-3 space-y-3">
            <div className="h-2 bg-muted rounded-full overflow-hidden" role="progressbar" aria-valuenow={checklistPct} aria-valuemin={0} aria-valuemax={100} aria-label="Checklist progress" data-testid="checklist-progress">
              <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${checklistPct}%` }} data-testid="checklist-progress-bar" />
            </div>
            {allChecklistsDone && (
              <div className="text-xs text-primary bg-primary/10 px-2.5 py-1 rounded-md inline-block">
                All checklists are done ✓
              </div>
            )}
            {checklistLists.length === 0 && <p className="text-xs text-muted-foreground">No checklist yet. Add an item to create one.</p>}
            <DragDropContext onDragEnd={handleDropdownReorder}>
              <Droppable droppableId={`dropdown-checklist-lists-${task.id}`} type="checklistList">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                    {checklistLists.map((list, listIndex) => {
                      const isCollapsed = collapsedChecklists.has(list.id);
                      return (
                        <Draggable key={list.id} draggableId={`checklist-list-${list.id}`} index={listIndex}>
                          {(provided) => (
                            <div ref={provided.innerRef} {...provided.draggableProps} className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden checklist-card">
                              <div className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/30 transition-all group/header">
                                <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
                                  <GripVertical className="w-4 h-4" />
                                </div>
                                <button
                                  onClick={() => {
                                    const next = new Set(collapsedChecklists);
                                    if (isCollapsed) next.delete(list.id); else next.add(list.id);
                                    setCollapsedChecklists(next);
                                  }}
                                  className="flex-1 flex items-center gap-2 text-left"
                                >
                                  {editingChecklistId === list.id ? (
                                    <input
                                      autoFocus
                                      className="text-xs font-semibold text-foreground bg-muted/40 border border-primary/30 rounded px-1.5 py-0.5"
                                      value={editingChecklistTitle}
                                      onChange={e => setEditingChecklistTitle(e.target.value)}
                                      onBlur={() => {
                                        if (editingChecklistTitle.trim()) {
                                          onUpdateTask(task.id, { checklists: task.checklists.map(cl => cl.id === list.id ? { ...cl, title: editingChecklistTitle.trim() } : cl) });
                                        }
                                        setEditingChecklistId(null);
                                        setEditingChecklistTitle('');
                                      }}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                          if (editingChecklistTitle.trim()) {
                                            onUpdateTask(task.id, { checklists: task.checklists.map(cl => cl.id === list.id ? { ...cl, title: editingChecklistTitle.trim() } : cl) });
                                          }
                                          setEditingChecklistId(null);
                                          setEditingChecklistTitle('');
                                        }
                                      }}
                                    />
                                  ) : (
                                    <span
                                      onClick={(e) => { e.stopPropagation(); setEditingChecklistId(list.id); setEditingChecklistTitle(list.title); }}
                                      className="text-sm font-semibold text-foreground cursor-text"
                                    >
                                      {list.title}
                                    </span>
                                  )}
                                  <span className="text-xs text-muted-foreground shrink-0">({list.items.length})</span>
                                </button>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => onUpdateTask(task.id, { checklists: task.checklists.filter(cl => cl.id !== list.id) })}
                                    className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover/header:opacity-100 checklist-header-delete transition-opacity duration-200"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      const next = new Set(collapsedChecklists);
                                      if (isCollapsed) next.delete(list.id); else next.add(list.id);
                                      setCollapsedChecklists(next);
                                    }}
                                    className="p-1 text-muted-foreground hover:text-foreground"
                                  >
                                    {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              </div>
                              {!isCollapsed && (
                                <div className="border-t border-border/60 px-3 py-2 space-y-1.5">
                                  <Droppable droppableId={`dropdown-checklist-${task.id}-${list.id}`} type="checklistItem">
                                    {(provided) => (
                                      <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
                                        {list.items.map((item, index) => (
                                          <Draggable key={item.id} draggableId={item.id} index={index}>
                                            {(provided) => (
                                              <div ref={provided.innerRef} {...provided.draggableProps} className="flex items-center gap-2.5 text-sm group/item checklist-item">
                                                <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
                                                  <GripVertical className="w-4 h-4" />
                                                </div>
                                                <SquareToggle
                                                  completed={item.completed}
                                                  onClick={() => onToggleChecklistItem(task.id, list.id, item.id)}
                                                  size="md"
                                                />
                                                {editingChecklistItemId === item.id ? (
                                                  <input
                                                    autoFocus
                                                    className="flex-1 text-sm bg-muted/40 border border-primary/30 rounded px-2 py-0.5"
                                                    value={editingChecklistText}
                                                    onChange={e => setEditingChecklistText(e.target.value)}
                                                    onBlur={() => saveChecklistItemEdit(list.id, item.id)}
                                                    onKeyDown={e => e.key === 'Enter' && saveChecklistItemEdit(list.id, item.id)}
                                                  />
                                                ) : (
                                                  <span
                                                    onClick={(e) => { e.stopPropagation(); setEditingChecklistItemId(item.id); setEditingChecklistText(item.text); }}
                                                    className={`flex-1 cursor-text ${item.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}
                                                  >
                                                    {item.text}
                                                  </span>
                                                )}
                                                <button
                                                  onClick={() => onDeleteChecklistItem(task.id, list.id, item.id)}
                                                  className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover/item:opacity-100 transition-opacity duration-200"
                                                >
                                                  <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                              </div>
                                            )}
                                          </Draggable>
                                        ))}
                                        {provided.placeholder}
                                      </div>
                                    )}
                                  </Droppable>
                                  <div className="flex gap-2 pt-1">
                                    <input
                                      value={perChecklistInput[list.id] ?? ''}
                                      onChange={e => setPerChecklistInput(prev => ({ ...prev, [list.id]: e.target.value }))}
                                      onKeyDown={e => { if (e.key === 'Enter') { const text = perChecklistInput[list.id] ?? ''; if (text.trim()) { onAddChecklistItem(task.id, list.id, text.trim()); setPerChecklistInput(prev => ({ ...prev, [list.id]: '' })); } } }}
                                      placeholder="Add checklist item"
                                      className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-2 text-xs"
                                    />
                                    <button onClick={() => { const text = perChecklistInput[list.id] ?? ''; if (text.trim()) { onAddChecklistItem(task.id, list.id, text.trim()); setPerChecklistInput(prev => ({ ...prev, [list.id]: '' })); } }} className="px-3 py-2 text-xs bg-primary text-primary-foreground rounded-lg">Add</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
            <div className="flex gap-2">
              <input
                value={newChecklistTitle}
                onChange={e => setNewChecklistTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newChecklistTitle.trim()) { onUpdateTask(task.id, { checklists: [...task.checklists, { id: crypto.randomUUID(), title: newChecklistTitle.trim(), items: [] }] }); setNewChecklistTitle(''); } }}
                placeholder="New checklist name"
                className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm"
              />
              <button
                onClick={() => { if (newChecklistTitle.trim()) { onUpdateTask(task.id, { checklists: [...task.checklists, { id: crypto.randomUUID(), title: newChecklistTitle.trim(), items: [] }] }); setNewChecklistTitle(''); } }}
                disabled={!newChecklistTitle.trim()}
                className="px-4 py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-lg"
              >
                Add checklist
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Attachments Section */}
      <div className="rounded-2xl border border-border bg-muted/20">
        <button
          onClick={() => setAttachmentsCollapsed(prev => !prev)}
          className="w-full flex items-center justify-between px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Attachments</h3>
            {(task.attachments ?? []).length > 0 && (
              <span className="text-xs text-muted-foreground">({(task.attachments ?? []).length})</span>
            )}
          </div>
          {attachmentsCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
        </button>
        {!attachmentsCollapsed && (
          <div className="border-t border-border/60 px-4 py-3 space-y-3">
            {!isPremium ? (
              <div className="border border-dashed border-border rounded-xl">
                <PremiumGate
                  title="File Attachments"
                  description="Attach files, images, and documents directly to your tasks."
                  icon={<Paperclip className="w-6 h-6 text-primary" />}
                />
              </div>
            ) : (
              <>
                <label className="flex flex-col items-center justify-center w-full min-h-[100px] border-2 border-dashed border-border rounded-xl bg-muted/20 hover:bg-muted/40 hover:border-primary/50 transition-all cursor-pointer">
                  <div className="flex flex-col items-center justify-center py-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                      <Paperclip className="w-5 h-5 text-primary" />
                    </div>
                    <p className="text-sm font-medium text-foreground">Click to upload or drag and drop</p>
                    <p className="text-xs text-muted-foreground mt-1">PDF, Images, Documents (max 10MB)</p>
                  </div>
                  <input type="file" multiple onChange={handleFileUpload} disabled={uploading} className="hidden" />
                </label>
                {uploading && (
                  <div className="bg-background/60 backdrop-blur-[1px] flex items-center justify-center rounded-xl py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm font-medium">Uploading...</span>
                    </div>
                  </div>
                )}
                {(task.attachments || []).length > 0 && (
                  <DragDropContext onDragEnd={handleAttachmentReorder}>
                    <Droppable droppableId={"dropdown-attachments-" + task.id}>
                      {(provided) => (
                        <div ref={provided.innerRef} {...provided.droppableProps} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {(task.attachments || []).map((attachment, idx) => (
                            <Draggable key={attachment.id} draggableId={attachment.id} index={idx}>
                              {(provided) => (
                                <div ref={provided.innerRef} {...provided.draggableProps}>
                                  <AttachmentRow
                                    attachment={attachment}
                                    taskId={task.id}
                                    taskTitle={task.title}
                                    onDelete={() => deleteAttachment(attachment.id)}
                                    dragHandleProps={provided.dragHandleProps}
                                  />
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Images Section */}
      <div className="rounded-2xl border border-border bg-muted/20">
        <button
          onClick={() => setImagesCollapsed(prev => !prev)}
          className="w-full flex items-center justify-between px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <Image className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Images</h3>
            {task.images && task.images.length > 0 && (
              <span className="text-xs text-muted-foreground">({task.images.length})</span>
            )}
          </div>
          {imagesCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
        </button>
        {!imagesCollapsed && (
          <div className="border-t border-border/60 px-4 py-3 space-y-3">
            {!isPremium ? (
              <div className="border border-dashed border-border rounded-xl">
                <PremiumGate
                  title="Image Attachments"
                  description="Upload images directly to your tasks."
                  icon={<Image className="w-6 h-6 text-primary" />}
                />
              </div>
            ) : (
              <>
                {(task.images?.length || 0) + (task.attachments?.length || 0) >= mediaLimit ? (
                  <p className="text-xs text-muted-foreground text-center py-2">Limit reached — upgrade for more</p>
                ) : (
                  <label className="flex flex-col items-center justify-center w-full min-h-[100px] border-2 border-dashed border-border rounded-xl bg-muted/20 hover:bg-muted/40 hover:border-primary/50 transition-all cursor-pointer">
                    <div className="flex flex-col items-center justify-center py-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                        <Image className="w-5 h-5 text-primary" />
                      </div>
                      <p className="text-sm font-medium text-foreground">Click to upload</p>
                      <p className="text-xs text-muted-foreground mt-1">PNG, JPG, GIF (max 10MB)</p>
                    </div>
                    <input type="file" multiple accept="image/*,.heic,.heif" onChange={async e => {
                      if (!e.target.files) return;
                      const files = Array.from(e.target.files);
                      const newImages: Attachment[] = [];
                      for (const file of files) {
                        const fileUrl = await imageToDataUrl(file);
                        const fileType = /\.heic$/i.test(file.name) ? 'image/jpeg' : (file.type || 'image/*');
                        newImages.push({ id: crypto.randomUUID(), taskId: String(task.id), fileName: file.name, fileType, fileSize: file.size, fileUrl, createdAt: new Date().toISOString() });
                      }
                      onUpdateTask(task.id, { images: [...(task.images || []), ...newImages] });
                      e.target.value = '';
                    }} className="hidden" />
                  </label>
                )}
                {task.images && task.images.length > 0 && (
                  <DraggableImageGrid
                    images={task.images}
                    onReorder={(newImages) => onUpdateTask(task.id, { images: newImages })}
                    onRemove={(id) => onUpdateTask(task.id, { images: (task.images || []).filter(x => x.id !== id) })}
                    droppableId={`dropdown-images-${task.id}`}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const TaskFullView: React.FC<TaskFullViewProps> = ({
  task,
  boardColumns,
  projects,
  allTags,
  onClose,
  onUpdateTask,
  onToggleChecklistItem,
  onAddChecklistItem,
  onDeleteChecklistItem,
  onDeleteTask,
  onToggleTag,
  onCreateTag,
  onDeleteTagEverywhere,
  onRenameTagEverywhere,
  onColorChangeTagEverywhere,
  isPremium,
  isPro,
  onJumpToTask,
  onEditTemplate,
  onSaveTemplate,
  editingTemplateMeta,
  templateEditName,
  onTemplateEditNameChange,
}) => {
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [newSubtaskDuration, setNewSubtaskDuration] = useState(10);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [newCommentText, setNewCommentText] = useState('');
  const [editingChecklistItemId, setEditingChecklistItemId] = useState<string | null>(null);
  const [editingChecklistText, setEditingChecklistText] = useState('');
  const [editingSubtaskText, setEditingSubtaskText] = useState('');
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState<LabelColor>(randomTagColor());
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagName, setEditingTagName] = useState('');

  const [templatePopupOpen, setTemplatePopupOpen] = useState(false);
  const [fullViewTemplates, setFullViewTemplates] = useState<TaskTemplate[]>([]);
  const [editingTmpl, setEditingTmpl] = useState<TaskTemplate | null>(null);
  const [editingTmplName, setEditingTmplName] = useState('');
  const [editingTmplTitle, setEditingTmplTitle] = useState('');
  const [editingTmplDesc, setEditingTmplDesc] = useState('');
  const [editingTmplPriority, setEditingTmplPriority] = useState<string>('medium');
  const [editingTmplDuration, setEditingTmplDuration] = useState(0);
  const [editingTmplStartDate, setEditingTmplStartDate] = useState('');
  const [editingTmplStartTime, setEditingTmplStartTime] = useState('');
  const [editingTmplDueDate, setEditingTmplDueDate] = useState('');
  const [editingTmplDueTime, setEditingTmplDueTime] = useState('');
  const [fullViewSaveTmplOpen, setFullViewSaveTmplOpen] = useState(false);
  const [fullViewTmplName, setFullViewTmplName] = useState('');
  const [fullViewLoadTmplOpen, setFullViewLoadTmplOpen] = useState(false);
  const [fullViewLoadTemplates, setFullViewLoadTemplates] = useState<TaskTemplate[]>([]);
  const [activityCollapsed, setActivityCollapsed] = useState(false);
  const [imagesCollapsed, setImagesCollapsed] = useState(false);
  const [subtasksCollapsed, setSubtasksCollapsed] = useState(false);
  const [attachmentsCollapsed, setAttachmentsCollapsed] = useState(false);
  const [checklistsSectionCollapsed, setChecklistsSectionCollapsed] = useState(false);
  const [editingChecklistId, setEditingChecklistId] = useState<string | null>(null);
  const [editingChecklistTitle, setEditingChecklistTitle] = useState('');
  const [tagDeleteConfirm, setTagDeleteConfirm] = useState<string | null>(null);
  const [projectChangeConfirm, setProjectChangeConfirm] = useState<{ v: string; oldProjectId: number | null | undefined } | null>(null);
  const [collapsedChecklists, setCollapsedChecklists] = useState<Set<string>>(new Set());
  const [perChecklistInput, setPerChecklistInput] = useState<Record<string, string>>({});
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const mediaLimit = isPro ? 20 : isPremium ? 10 : 5;
  const canUseServerAttachmentApi = /^\d+$/.test(String(task.id));

  const legacySubtasksChecklist = task.checklists.find(list => list.title.toLowerCase().trim() === 'subtasks');
  const checklistLists = task.checklists.filter(list => list.id !== legacySubtasksChecklist?.id);
  const effectiveSubtasks = (task.subtasks && task.subtasks.length > 0)
    ? task.subtasks
    : (legacySubtasksChecklist?.items || []).map(item => ({ ...item, durationMinutes: 0 }));
  const primaryChecklist = checklistLists[0];
  const taskDuration = Math.max(0, Number(task.duration) || 0);
  const subtaskTotal = effectiveSubtasks.reduce((s, st) => s + Math.max(0, Number(st.durationMinutes) || 0), 0);
  const subtaskTimeRemaining = taskDuration - subtaskTotal;
  const allSubtasksDone = effectiveSubtasks.length > 0 && effectiveSubtasks.every(st => st.completed);
  const subtaskDoneCount = effectiveSubtasks.filter(st => st.completed).length;
  const subtaskPct = effectiveSubtasks.length > 0 ? Math.round((subtaskDoneCount / effectiveSubtasks.length) * 100) : 0;
  const checklistTotal = checklistLists.reduce((s, l) => s + l.items.length, 0);
  const checklistDone = checklistLists.reduce((s, l) => s + l.items.filter(i => i.completed).length, 0);
  const checklistPct = checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : 0;
  const allChecklistsDone = checklistTotal > 0 && checklistDone === checklistTotal;

  const taskProject = task.projectId ? projects.find(project => project.id === task.projectId) || null : null;

  const activityEntries = useMemo(() => {
    const entries: Array<{ id: string; text: string; createdAt: string; actor?: string }> = [
      ...(task.activityLog || []).map(entry => ({ id: entry.id, text: entry.text, createdAt: entry.createdAt, actor: entry.actor })),
      { id: 'created', text: `Created ${new Date(task.createdAt).toLocaleDateString()}`, createdAt: task.createdAt },
      ...(task.updatedAt ? [{ id: 'updated', text: `Updated ${new Date(task.updatedAt).toLocaleDateString()}`, createdAt: task.updatedAt }] : []),
      ...(task.projectId ? [{ id: 'project', text: `Assigned to ${taskProject?.name || 'project'}`, createdAt: task.updatedAt || task.createdAt }] : []),
      ...(task.comments || []).map(comment => ({
        id: comment.id,
        text: `Commented: ${comment.text.slice(0, 80)}${comment.text.length > 80 ? '...' : ''}`,
        createdAt: comment.createdAt,
      })),
    ];
    return entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [task.activityLog, task.createdAt, task.projectId, task.updatedAt, taskProject?.name, task.comments]);

  const persistSubtasks = (nextSubtasks: Task['subtasks']) => {
    const nextChecklists = legacySubtasksChecklist
      ? task.checklists.filter(list => list.id !== legacySubtasksChecklist.id)
      : task.checklists;
    onUpdateTask(task.id, { subtasks: nextSubtasks, checklists: nextChecklists });
  };

  const updateSubtask = (subtaskId: string, updates: Partial<Subtask>) => {
    const updateRecursive = (list: Subtask[]): Subtask[] =>
      list.map(st => st.id === subtaskId ? { ...st, ...updates } : { ...st, children: st.children ? updateRecursive(st.children) : undefined });
    persistSubtasks(updateRecursive(effectiveSubtasks));
  };

  const addSubtask = () => {
    if (!newSubtaskText.trim()) return;
    persistSubtasks([
      ...effectiveSubtasks,
      { id: crypto.randomUUID(), text: newSubtaskText.trim(), completed: false, durationMinutes: Math.max(0, Number(newSubtaskDuration) || 0) },
    ]);
    setNewSubtaskText('');
    setNewSubtaskDuration(10);
  };

  const removeSubtask = (subtaskId: string) => {
    const removeRecursive = (list: Subtask[]): Subtask[] =>
      list.filter(st => st.id !== subtaskId).map(st => st.children ? { ...st, children: removeRecursive(st.children) } : st);
    persistSubtasks(removeRecursive(effectiveSubtasks));
  };

  const insertSubtask = (beforeId: string | null) => {
    const newSub: Subtask = { id: crypto.randomUUID(), text: 'title', completed: false, durationMinutes: 0 };
    if (beforeId) {
      const idx = effectiveSubtasks.findIndex(st => st.id === beforeId);
      if (idx >= 0) {
        const next = [...effectiveSubtasks];
        next.splice(idx, 0, newSub);
        persistSubtasks(next);
        return;
      }
    }
    persistSubtasks([...effectiveSubtasks, newSub]);
  };

  const renderSubtaskItem = (subtask: Subtask, index: number): React.ReactNode => {
    return (
      <Draggable key={subtask.id} draggableId={subtask.id} index={index}>
        {(provided) => (
          <div ref={provided.innerRef} {...provided.draggableProps} className="min-w-0">
            <div className="grid grid-cols-[auto_auto_1fr_auto] gap-2 items-center rounded-lg border border-border px-3 py-2 group/subtask">
              <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
                <GripVertical className="w-4 h-4" />
              </div>
              <CircleToggle
                completed={subtask.completed}
                onClick={() => updateSubtask(subtask.id, { completed: !subtask.completed })}
                size="sm"
              />
              {editingSubtaskId === subtask.id ? (
                <input
                  autoFocus
                  className="text-sm bg-muted/40 border border-primary/30 rounded px-2 py-0.5"
                  value={editingSubtaskText}
                  onChange={e => setEditingSubtaskText(e.target.value)}
                  onBlur={() => saveSubtaskEdit(subtask.id)}
                  onKeyDown={e => e.key === 'Enter' && saveSubtaskEdit(subtask.id)}
                />
              ) : (
                <span
                  onClick={() => { setEditingSubtaskId(subtask.id); setEditingSubtaskText(subtask.text); }}
                  className={`text-sm cursor-text truncate ${subtask.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}
                >
                  {subtask.text}
                </span>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  className="w-16 text-xs bg-muted/40 border border-border rounded px-1.5 py-0.5 text-right focus:outline-none focus:ring-1 focus:ring-primary/30"
                  value={subtask.durationMinutes || 0}
                  onChange={e => updateSubtask(subtask.id, { durationMinutes: Math.max(0, Number(e.target.value) || 0) })}
                />
                <span className="text-[10px] text-muted-foreground">min</span>
                <button
                  onClick={() => removeSubtask(subtask.id)}
                  className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover/item:opacity-100 transition-opacity duration-200"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </Draggable>
    );
  };

  const saveSubtaskEdit = (subtaskId: string) => {
    const next = editingSubtaskText.trim();
    if (next) updateSubtask(subtaskId, { text: next });
    setEditingSubtaskId(null);
    setEditingSubtaskText('');
  };

  const addChecklistItemToTask = () => {
    if (!newChecklistText.trim()) return;
    if (!primaryChecklist) {
      onUpdateTask(task.id, {
        checklists: [...checklistLists, {
          id: crypto.randomUUID(),
          title: 'Checklist',
          items: [{ id: crypto.randomUUID(), text: newChecklistText.trim(), completed: false }],
        }],
      });
      setNewChecklistText('');
      return;
    }
    onAddChecklistItem(task.id, primaryChecklist.id, newChecklistText.trim());
    setNewChecklistText('');
  };

  const addChecklistItemToList = (checklistId: string) => {
    if (!newChecklistText.trim()) return;
    onAddChecklistItem(task.id, checklistId, newChecklistText.trim());
    setNewChecklistText('');
  };

  const saveChecklistItemEdit = (checklistId: string, itemId: string) => {
    const next = editingChecklistText.trim();
    if (next) {
      onUpdateTask(task.id, {
        checklists: task.checklists.map(list =>
          list.id !== checklistId ? list : {
            ...list,
            items: list.items.map(item => item.id === itemId ? { ...item, text: next } : item),
          }
        ),
      });
    }
    setEditingChecklistItemId(null);
    setEditingChecklistText('');
  };

  const handleChecklistListReorder = useCallback((result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(task.checklists);
    const [removed] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, removed);
    onUpdateTask(task.id, { checklists: items });
  }, [task.checklists, onUpdateTask]);

  const handleFullViewReorder = useCallback((result: DropResult) => {
    if (!result.destination) return;
    if (result.source.droppableId === 'fullview-subtasks') {
      const items = Array.from(effectiveSubtasks);
      const [removed] = items.splice(result.source.index, 1);
      items.splice(result.destination.index, 0, removed);
      persistSubtasks(items);
    } else if (result.source.droppableId === 'fullview-checklist-lists') {
      const items = Array.from(task.checklists);
      const [removed] = items.splice(result.source.index, 1);
      items.splice(result.destination.index, 0, removed);
      onUpdateTask(task.id, { checklists: items });
    } else if (result.source.droppableId.startsWith('fullview-checklist-')) {
      const srcChecklistId = result.source.droppableId.replace('fullview-checklist-', '');
      const dstChecklistId = result.destination.droppableId.replace('fullview-checklist-', '');

      if (srcChecklistId === dstChecklistId) {
        onUpdateTask(task.id, {
          checklists: task.checklists.map(cl =>
            cl.id === srcChecklistId
              ? { ...cl, items: (() => {
                  const items = Array.from(cl.items);
                  const [removed] = items.splice(result.source.index, 1);
                  items.splice(result.destination.index, 0, removed);
                  return items;
                })() }
              : cl
          ),
        });
      } else {
        let movedItem: ChecklistItem | null = null;
        const without = task.checklists.map(cl =>
          cl.id === srcChecklistId
            ? (() => { const items = Array.from(cl.items); [movedItem] = items.splice(result.source.index, 1); return { ...cl, items }; })()
            : cl
        );
        if (!movedItem) return;
        onUpdateTask(task.id, {
          checklists: without.map(cl =>
            cl.id === dstChecklistId
              ? { ...cl, items: [...cl.items.slice(0, result.destination!.index), movedItem!, ...cl.items.slice(result.destination!.index)] }
              : cl
          ),
        });
      }
    }
  }, [effectiveSubtasks, persistSubtasks, task.checklists, onUpdateTask]);

  const handleImageReorder = useCallback((result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(task.images || []);
    const [removed] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, removed);
    onUpdateTask(task.id, { images: items });
  }, [task.images, onUpdateTask]);

  const handleAttachmentReorder = useCallback((result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(task.attachments || []);
    const [removed] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, removed);
    onUpdateTask(task.id, { attachments: items });
  }, [task.attachments, onUpdateTask]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    setUploading(true);
    const uploaded: Attachment[] = [];
    for (const file of files) {
      if (canUseServerAttachmentApi) {
        try {
          const formData = new FormData();
          formData.append('file', file);
          const res = await fetch(`/api/attachments/${task.id}`, { method: 'POST', credentials: 'include', body: formData });
          if (res.ok) {
            uploaded.push(await res.json());
          } else {
            uploaded.push({ id: crypto.randomUUID(), taskId: task.id, fileName: file.name, fileType: file.type || 'application/octet-stream', fileSize: file.size, fileUrl: await fileToDataUrl(file), createdAt: new Date().toISOString() });
          }
        } catch {
          uploaded.push({ id: crypto.randomUUID(), taskId: task.id, fileName: file.name, fileType: file.type || 'application/octet-stream', fileSize: file.size, fileUrl: await fileToDataUrl(file), createdAt: new Date().toISOString() });
        }
      } else {
        uploaded.push({ id: crypto.randomUUID(), taskId: task.id, fileName: file.name, fileType: file.type || 'application/octet-stream', fileSize: file.size, fileUrl: await fileToDataUrl(file), createdAt: new Date().toISOString() });
      }
    }
    if (uploaded.length > 0) onUpdateTask(task.id, { attachments: [...(task.attachments || []), ...uploaded] });
    setUploading(false);
    e.currentTarget.value = '';
  };

  const deleteAttachment = async (attachmentId: string) => {
    onUpdateTask(task.id, { attachments: (task.attachments || []).filter(item => item.id !== attachmentId) });
    if (canUseServerAttachmentApi && /^\d+$/.test(String(attachmentId))) {
      try { await fetch(`/api/attachments/${attachmentId}`, { method: 'DELETE', credentials: 'include' }); } catch {}
    }
  };

  const createTagForTask = () => {
    const name = normalizeTagName(newTagName);
    if (!name) return;
    onCreateTag(task.id, name, newTagColor);
    setNewTagName('');
    setNewTagColor(randomTagColor());
    setTagPickerOpen(false);
  };

  const addComment = () => {
    if (!newCommentText.trim()) return;
    onUpdateTask(task.id, {
      comments: [...(task.comments || []), { id: crypto.randomUUID(), text: newCommentText.trim(), createdAt: new Date().toISOString() }],
    });
    setNewCommentText('');
  };

  const deleteComment = (commentId: string) => {
    onUpdateTask(task.id, { comments: (task.comments || []).filter(c => c.id !== commentId) });
  };

  const updateComment = (commentId: string, text: string) => {
    onUpdateTask(task.id, { comments: (task.comments || []).map(c => c.id === commentId ? { ...c, text } : c) });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <div
        className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-y-auto p-5 space-y-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 pt-1">
            {editingTemplateMeta && (
              <div className="mb-2">
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Template name</label>
                <input
                  className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  value={templateEditName || ''}
                  onChange={e => onTemplateEditNameChange?.(e.target.value)}
                  placeholder="Template name"
                />
              </div>
            )}
            <input
              className="w-full px-1 text-2xl font-semibold text-foreground bg-transparent border-none focus:outline-none focus:ring-0"
              value={task.title}
              onChange={e => onUpdateTask(task.id, { title: e.target.value })}
            />
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground flex-shrink-0 mt-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Priority</label>
            <Select value={task.priority} onValueChange={v => onUpdateTask(task.id, { priority: v as Priority })}>
              <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                <SelectValue placeholder="Select priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Estimated duration (minutes)</label>
            <input
              type="number"
              min={0}
              value={task.duration || 0}
              onChange={e => onUpdateTask(task.id, { duration: Math.max(0, Number(e.target.value) || 0) })}
              className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Project</label>
              <Select value={task.projectId ? String(task.projectId) : 'my-goals'} onValueChange={v => {
                const newId = v === 'my-goals' ? null : Number(v);
                if (newId !== task.projectId) {
                  setProjectChangeConfirm({ v, oldProjectId: task.projectId });
                }
              }}>
                <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="my-goals">My Goals</SelectItem>
                  {projects.map(project => (
                    <SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {task.projectId && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Column</label>
                <Select value={task.columnId} onValueChange={v => onUpdateTask(task.id, { columnId: v })}>
                  <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                    <SelectValue placeholder="Column" />
                  </SelectTrigger>
                  <SelectContent>
                    {boardColumns
                      .filter(col => col.projectId === task.projectId)
                      .sort((a, b) => a.order - b.order)
                      .map(col => (
                        <SelectItem key={col.id} value={col.id}>{col.title}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Calendar className="w-3 h-3" /> Start
            </label>
            <div className="flex items-center gap-2 mt-1">
              <div className="relative flex-1">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="date"
                  value={task.startDate || ''}
                  onChange={e => onUpdateTask(task.id, { startDate: e.target.value || undefined })}
                  className="w-full bg-muted/40 border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all [color-scheme:var(--color-scheme)]"
                />
              </div>
              <div className="relative w-[130px]">
                <Clock3 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="time"
                  value={task.startTime || ''}
                  onChange={e => onUpdateTask(task.id, { startTime: e.target.value || undefined })}
                  className="w-full bg-muted/40 border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all [color-scheme:var(--color-scheme)]"
                />
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Calendar className="w-3 h-3" /> End
            </label>
            <div className="flex items-center gap-2 mt-1">
              <div className="relative flex-1">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="date"
                  value={task.dueDate || ''}
                  onChange={e => onUpdateTask(task.id, { dueDate: e.target.value || undefined })}
                  className="w-full bg-muted/40 border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all [color-scheme:var(--color-scheme)]"
                />
              </div>
              <div className="relative w-[130px]">
                <Clock3 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="time"
                  value={task.dueTime || ''}
                  onChange={e => onUpdateTask(task.id, { dueTime: e.target.value || undefined })}
                  className="w-full bg-muted/40 border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all [color-scheme:var(--color-scheme)]"
                />
              </div>
            </div>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1 block">Description</label>
          <textarea
            value={task.description}
            onChange={e => onUpdateTask(task.id, { description: e.target.value })}
            rows={4}
            className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm resize-none"
          />
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Tag className="w-4 h-4 text-muted-foreground" />
            Tags
          </h3>

          {task.labels.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {task.labels.map(label => (
                <button
                  key={label.id}
                  onClick={() => setTagPickerOpen(true)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${LABEL_COLORS[label.color]} text-primary-foreground`}
                >
                  {label.name}
                  <X className="w-3 h-3 opacity-80" />
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => setTagPickerOpen(prev => !prev)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-xl border bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            <Tag className="w-3.5 h-3.5" />
            {task.labels.length > 0 ? `${task.labels.length} tag${task.labels.length > 1 ? 's' : ''} selected` : 'Add tags'}
          </button>

          {tagPickerOpen && (
            <TagsModal
              open={tagPickerOpen}
              onClose={() => setTagPickerOpen(false)}
              tags={allTags}
              selectedIds={task.labels.map(label => label.id)}
              onToggle={labelId => { const label = allTags.find(t => t.id === labelId); if (label) onToggleTag(task.id, label); }}
              onCreate={(name, color) => {
                onCreateTag(task.id, name, color);
              }}
              onDelete={tagId => onDeleteTagEverywhere(tagId)}
              onRename={(tagId, newName) => onRenameTagEverywhere(tagId, newName)}
              onColorChange={(tagId, color) => onColorChangeTagEverywhere(tagId, color)}
            />
          )}
          {tagDeleteConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setTagDeleteConfirm(null)}>
              <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
              <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-bold text-foreground">Delete tag everywhere?</h3>
                <p className="text-xs text-muted-foreground mt-2">This will remove this tag from the whole app. This action cannot be undone.</p>
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => setTagDeleteConfirm(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
                  <button onClick={() => { onDeleteTagEverywhere(tagDeleteConfirm); setTagDeleteConfirm(null); }} className="px-4 py-2 text-sm font-semibold bg-destructive text-destructive-foreground rounded-xl hover:opacity-90">Delete</button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-muted/20">
          <button
            onClick={() => setSubtasksCollapsed(prev => !prev)}
            className="w-full flex items-center justify-between px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">Sub-tasks</h3>
              {(task.subtasks ?? []).length > 0 && (
                <span className="text-xs text-muted-foreground">({(task.subtasks ?? []).length})</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {taskDuration > 0 && (
                <span className={`text-xs font-medium ${
                  subtaskTimeRemaining > 0 ? 'text-muted-foreground' :
                  subtaskTimeRemaining < 0 ? 'text-orange-500' : 'text-label-green'
                }`}>
                  {subtaskTimeRemaining > 0
                    ? `${subtaskTimeRemaining} mins left`
                    : subtaskTimeRemaining < 0
                    ? `Over by ${Math.abs(subtaskTimeRemaining)} mins`
                    : '0 mins left ✓'}
                </span>
              )}
              {subtasksCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
            </div>
          </button>
          {!subtasksCollapsed && (
            <div className="border-t border-border/60 px-4 py-3 space-y-3">
              <div className="h-2 bg-muted rounded-full overflow-hidden" role="progressbar" aria-valuenow={subtaskPct} aria-valuemin={0} aria-valuemax={100} aria-label="Sub-tasks progress" data-testid="subtasks-progress">
                <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${subtaskPct}%` }} data-testid="subtasks-progress-bar" />
              </div>
              {allSubtasksDone && (
                <div className="text-xs text-primary bg-primary/10 px-2.5 py-1 rounded-md inline-block">
                  All sub-tasks are done ✓
                </div>
              )}

              <DragDropContext onDragEnd={handleFullViewReorder}>
                <Droppable droppableId="fullview-subtasks" type="subtask">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
                      {(task.subtasks || []).map((subtask, si) => renderSubtaskItem(subtask, si))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>

              <div className="grid grid-cols-[1fr_120px_auto] gap-2">
                <input
                  value={newSubtaskText}
                  onChange={e => setNewSubtaskText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSubtask()}
                  placeholder="Add sub-task"
                  className="bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  min={0}
                  value={newSubtaskDuration}
                  onChange={e => setNewSubtaskDuration(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="min"
                  className="bg-muted/40 border border-border rounded-lg px-2 py-2 text-sm"
                />
                <button onClick={addSubtask} className="px-3 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 shrink-0">
                  Add
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-muted/20">
          <button
            onClick={() => setChecklistsSectionCollapsed(prev => !prev)}
            className="w-full flex items-center justify-between px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">Checklist</h3>
              {checklistLists.length > 0 && (
                <span className="text-xs text-muted-foreground">({checklistLists.length})</span>
              )}
            </div>
            {checklistsSectionCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
          </button>
          {!checklistsSectionCollapsed && (
            <div className="border-t border-border/60 px-4 py-3 space-y-3">
              <div className="h-2 bg-muted rounded-full overflow-hidden" role="progressbar" aria-valuenow={checklistPct} aria-valuemin={0} aria-valuemax={100} aria-label="Checklist progress" data-testid="checklist-progress">
                <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${checklistPct}%` }} data-testid="checklist-progress-bar" />
              </div>
              {allChecklistsDone && (
                <div className="text-xs text-primary bg-primary/10 px-2.5 py-1 rounded-md inline-block">
                  All checklists are done ✓
                </div>
              )}
              {checklistLists.length === 0 && <p className="text-xs text-muted-foreground">No checklist yet. Add an item to create one.</p>}
              <DragDropContext onDragEnd={handleFullViewReorder}>
                <Droppable droppableId="fullview-checklist-lists" type="checklistList">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                      {checklistLists.map((list, listIndex) => {
                        const isCollapsed = collapsedChecklists.has(list.id);
                        return (
                          <Draggable key={list.id} draggableId={`checklist-list-${list.id}`} index={listIndex}>
                            {(provided) => (
                              <div ref={provided.innerRef} {...provided.draggableProps} className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden checklist-card">
                                <div className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/30 transition-all group/header">
                                  <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
                                    <GripVertical className="w-4 h-4" />
                                  </div>
                                  <button
                                    onClick={() => {
                                      const next = new Set(collapsedChecklists);
                                      if (isCollapsed) next.delete(list.id); else next.add(list.id);
                                      setCollapsedChecklists(next);
                                    }}
                                    className="flex-1 flex items-center gap-2 text-left"
                                  >
                                    {editingChecklistId === list.id ? (
                                      <input
                                        autoFocus
                                        className="text-xs font-semibold text-foreground bg-muted/40 border border-primary/30 rounded px-1.5 py-0.5"
                                        value={editingChecklistTitle}
                                        onChange={e => setEditingChecklistTitle(e.target.value)}
                                        onBlur={() => {
                                          if (editingChecklistTitle.trim()) {
                                            onUpdateTask(task.id, { checklists: task.checklists.map(cl => cl.id === list.id ? { ...cl, title: editingChecklistTitle.trim() } : cl) });
                                          }
                                          setEditingChecklistId(null);
                                          setEditingChecklistTitle('');
                                        }}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') {
                                            if (editingChecklistTitle.trim()) {
                                              onUpdateTask(task.id, { checklists: task.checklists.map(cl => cl.id === list.id ? { ...cl, title: editingChecklistTitle.trim() } : cl) });
                                            }
                                            setEditingChecklistId(null);
                                            setEditingChecklistTitle('');
                                          }
                                        }}
                                      />
                                    ) : (
                                      <span
                                        onClick={(e) => { e.stopPropagation(); setEditingChecklistId(list.id); setEditingChecklistTitle(list.title); }}
                                        className="text-sm font-semibold text-foreground cursor-text"
                                      >
                                        {list.title}
                                      </span>
                                    )}
                                    <span className="text-xs text-muted-foreground shrink-0">({list.items.length})</span>
                                  </button>
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => onUpdateTask(task.id, { checklists: task.checklists.filter(cl => cl.id !== list.id) })}
                                      className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover/header:opacity-100 checklist-header-delete transition-opacity duration-200"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => {
                                        const next = new Set(collapsedChecklists);
                                        if (isCollapsed) next.delete(list.id); else next.add(list.id);
                                        setCollapsedChecklists(next);
                                      }}
                                      className="p-1 text-muted-foreground hover:text-foreground"
                                    >
                                      {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                                    </button>
                                  </div>
                                </div>
                                {!isCollapsed && (
                                  <div className="border-t border-border/60 px-3 py-2 space-y-1.5">
                                      <Droppable droppableId={"fullview-checklist-" + list.id} type="checklistItem">
                                        {(provided) => (
                                          <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
                                            {list.items.map((item, index) => (
                                              <Draggable key={item.id} draggableId={item.id} index={index}>
                                                {(provided) => (
                                                  <div ref={provided.innerRef} {...provided.draggableProps} className="flex items-center gap-2.5 text-sm group/item checklist-item">
                                                    <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
                                                      <GripVertical className="w-4 h-4" />
                                                    </div>
                                                    <SquareToggle
                                                      completed={item.completed}
                                                      onClick={() => onToggleChecklistItem(task.id, list.id, item.id)}
                                                      size="md"
                                                    />
                                                    {editingChecklistItemId === item.id ? (
                                                      <input
                                                        autoFocus
                                                        className="flex-1 text-sm bg-muted/40 border border-primary/30 rounded px-2 py-0.5"
                                                        value={editingChecklistText}
                                                        onChange={e => setEditingChecklistText(e.target.value)}
                                                        onBlur={() => saveChecklistItemEdit(list.id, item.id)}
                                                        onKeyDown={e => e.key === 'Enter' && saveChecklistItemEdit(list.id, item.id)}
                                                      />
                                                    ) : (
                                                      <span
                                                        onClick={(e) => { e.stopPropagation(); setEditingChecklistItemId(item.id); setEditingChecklistText(item.text); }}
                                                        className={`flex-1 cursor-text ${item.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}
                                                      >
                                                        {item.text}
                                                      </span>
                                                    )}
                                                    <button
                                                      onClick={() => onDeleteChecklistItem(task.id, list.id, item.id)}
                                                      className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover/item:opacity-100 transition-opacity duration-200"
                                                    >
                                                      <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                  </div>
                                                )}
                                              </Draggable>
                                            ))}
                                            {provided.placeholder}
                                          </div>
                                        )}
                                      </Droppable>
                                    <div className="flex gap-2 pt-1">
                                      <input
                                        value={perChecklistInput[list.id] ?? ''}
                                        onChange={e => setPerChecklistInput(prev => ({ ...prev, [list.id]: e.target.value }))}
                                        onKeyDown={e => { if (e.key === 'Enter') { const text = perChecklistInput[list.id] ?? ''; if (text.trim()) { onAddChecklistItem(task.id, list.id, text.trim()); setPerChecklistInput(prev => ({ ...prev, [list.id]: '' })); } } }}
                                        placeholder="Add checklist item"
                                        className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-2 text-xs"
                                      />
                                      <button onClick={() => { const text = perChecklistInput[list.id] ?? ''; if (text.trim()) { onAddChecklistItem(task.id, list.id, text.trim()); setPerChecklistInput(prev => ({ ...prev, [list.id]: '' })); } }} className="px-3 py-2 text-xs bg-primary text-primary-foreground rounded-lg">Add</button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
              <div className="flex gap-2">
                <input
                  value={newChecklistTitle}
                  onChange={e => setNewChecklistTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newChecklistTitle.trim()) { onUpdateTask(task.id, { checklists: [...task.checklists, { id: crypto.randomUUID(), title: newChecklistTitle.trim(), items: [] }] }); setNewChecklistTitle(''); } }}
                  placeholder="New checklist name"
                  className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm"
                />
                <button
                  onClick={() => { if (newChecklistTitle.trim()) { onUpdateTask(task.id, { checklists: [...task.checklists, { id: crypto.randomUUID(), title: newChecklistTitle.trim(), items: [] }] }); setNewChecklistTitle(''); } }}
                  disabled={!newChecklistTitle.trim()}
                  className="px-4 py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-lg"
                >
                  Add checklist
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-muted/20">
          <button
            onClick={() => setAttachmentsCollapsed(prev => !prev)}
            className="w-full flex items-center justify-between px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <Paperclip className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Attachments</h3>
              {(task.attachments ?? []).length > 0 && (
                <span className="text-xs text-muted-foreground">({(task.attachments ?? []).length})</span>
              )}
            </div>
            {attachmentsCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
          </button>
          {!attachmentsCollapsed && (
            <div className="border-t border-border/60 px-4 py-3 space-y-3">
              {!isPremium ? (
                <div className="border border-dashed border-border rounded-xl">
                  <PremiumGate
                    title="File Attachments"
                    description="Attach files, images, and documents directly to your tasks."
                    icon={<Paperclip className="w-6 h-6 text-primary" />}
                  />
                </div>
              ) : (
                <>
                  <label className="flex flex-col items-center justify-center w-full min-h-[100px] border-2 border-dashed border-border rounded-xl bg-muted/20 hover:bg-muted/40 hover:border-primary/50 transition-all cursor-pointer">
                    <div className="flex flex-col items-center justify-center py-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                        <Paperclip className="w-5 h-5 text-primary" />
                      </div>
                      <p className="text-sm font-medium text-foreground">Click to upload or drag and drop</p>
                      <p className="text-xs text-muted-foreground mt-1">PDF, Images, Documents (max 10MB)</p>
                    </div>
                    <input type="file" multiple onChange={handleFileUpload} disabled={uploading} className="hidden" />
                  </label>
                  {uploading && (
                    <div className="bg-background/60 backdrop-blur-[1px] flex items-center justify-center rounded-xl py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm font-medium">Uploading...</span>
                      </div>
                    </div>
                  )}
                  {(task.attachments || []).length > 0 && (
                    <DragDropContext onDragEnd={handleAttachmentReorder}>
                      <Droppable droppableId={"attachments-" + task.id}>
                        {(provided) => (
                          <div ref={provided.innerRef} {...provided.droppableProps} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {(task.attachments || []).map((attachment, idx) => (
                              <Draggable key={attachment.id} draggableId={attachment.id} index={idx}>
                                {(provided) => (
                                  <div ref={provided.innerRef} {...provided.draggableProps} className="relative group/att">
                                    <AttachmentRow
                                      attachment={attachment}
                                      taskId={task.id}
                                      taskTitle={task.title}
                                      onDelete={() => deleteAttachment(attachment.id)}
                                      dragHandleProps={provided.dragHandleProps}
                                    />
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </DragDropContext>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-muted/20">
          <button
            onClick={() => setImagesCollapsed(prev => !prev)}
            className="w-full flex items-center justify-between px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <Image className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Images</h3>
              {task.images && task.images.length > 0 && (
                <span className="text-xs text-muted-foreground">({task.images.length})</span>
              )}
            </div>
            {imagesCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
          </button>
          {!imagesCollapsed && (
            <div className="border-t border-border/60 px-4 py-3 space-y-3">
              {!isPremium ? (
                <div className="border border-dashed border-border rounded-xl">
                  <PremiumGate
                    title="Image Attachments"
                    description="Upload images directly to your tasks."
                    icon={<Image className="w-6 h-6 text-primary" />}
                  />
                </div>
              ) : (
                <>
              {(task.images?.length || 0) + (task.attachments?.length || 0) >= mediaLimit ? (
                <p className="text-xs text-muted-foreground text-center py-2">Limit reached — upgrade for more</p>
              ) : (
                <label className="flex flex-col items-center justify-center w-full min-h-[100px] border-2 border-dashed border-border rounded-xl bg-muted/20 hover:bg-muted/40 hover:border-primary/50 transition-all cursor-pointer">
                  <div className="flex flex-col items-center justify-center py-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                      <Image className="w-5 h-5 text-primary" />
                    </div>
                    <p className="text-sm font-medium text-foreground">Click to upload</p>
                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG, GIF (max 10MB)</p>
                  </div>
                   <input type="file" multiple accept="image/*,.heic,.heif" onChange={async e => {
                    if (!e.target.files) return;
                    const files = Array.from(e.target.files);
                    const newImages: Attachment[] = [];
                    for (const file of files) {
                      const fileUrl = await imageToDataUrl(file);
                      const fileType = /\.heic$/i.test(file.name) ? 'image/jpeg' : (file.type || 'image/*');
                      newImages.push({ id: crypto.randomUUID(), taskId: String(task.id), fileName: file.name, fileType, fileSize: file.size, fileUrl, createdAt: new Date().toISOString() });
                    }
                    onUpdateTask(task.id, { images: [...(task.images || []), ...newImages] });
                    e.target.value = '';
                  }} className="hidden" />
                </label>
              )}
              {task.images && task.images.length > 0 && (
                <DraggableImageGrid
                  images={task.images}
                  onReorder={(newImages) => onUpdateTask(task.id, { images: newImages })}
                  onRemove={(id) => onUpdateTask(task.id, { images: (task.images || []).filter(x => x.id !== id) })}
                  droppableId={`fullview-images-${task.id}`}
                />
              )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-muted/20">
          <button
            onClick={() => setActivityCollapsed(prev => !prev)}
            className="w-full flex items-center justify-between px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Activity</h3>
            </div>
            {activityCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
          </button>
          {!activityCollapsed && (
            <div className="border-t border-border/60 px-4 py-3 space-y-2 max-h-56 overflow-y-auto">
              {activityEntries.map(entry => (
                <div key={entry.id} className="rounded-xl border border-border/50 bg-background/70 px-3 py-2">
                  <p className="text-sm text-foreground">{entry.text}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {entry.actor && <><span className="font-semibold">{entry.actor}</span> · </>}
                    {new Date(entry.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Comments</h3>
          <div className="space-y-2">
            {(task.comments || []).map(comment => (
              <div key={comment.id} className="border border-border rounded-lg px-3 py-2 group">
                <div className="flex items-start justify-between gap-2">
                  {editingCommentId === comment.id ? (
                    <textarea
                      autoFocus
                      className="flex-1 bg-muted/40 border border-primary/30 rounded px-2 py-1 text-sm resize-none"
                      value={editingCommentText}
                      onChange={e => setEditingCommentText(e.target.value)}
                      onBlur={() => { updateComment(comment.id, editingCommentText); setEditingCommentId(null); }}
                    />
                  ) : (
                    <p
                      onClick={() => { setEditingCommentId(comment.id); setEditingCommentText(comment.text); }}
                      className="text-sm text-foreground whitespace-pre-wrap flex-1 cursor-text"
                    >
                      {comment.text}
                    </p>
                  )}
                  <button
                    onClick={() => deleteComment(comment.id)}
                    className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">{new Date(comment.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>

          {/* Removed status + due from comments header area */}

          <div className="flex gap-2">
            <input
              value={newCommentText}
              onChange={e => setNewCommentText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addComment()}
              placeholder="Add a comment..."
              className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={addComment}
              className="px-4 py-2 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all font-medium"
            >
              Send
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            {task.priority !== 'none' && (
              <span className={`${PRIORITY_CONFIG[task.priority as Exclude<typeof task.priority, 'none'>]?.className} text-[10px] font-medium px-2 py-0.5 rounded-full text-primary-foreground`}>
                {PRIORITY_CONFIG[task.priority as Exclude<typeof task.priority, 'none'>]?.label}
              </span>
            )}
            <span className="text-xs text-muted-foreground">Created: {new Date(task.createdAt).toLocaleDateString()}</span>
            <div className="relative">
              <button
                onClick={async () => {
                  try {
                    const t = await fetchTemplates();
                    setFullViewTemplates(t);
                    setTemplatePopupOpen(true);
                  } catch (err) {
                    console.error('Failed to fetch templates:', err);
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-all"
              >
                <Star className="w-3.5 h-3.5" />
                Templates
              </button>
              {templatePopupOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setTemplatePopupOpen(false)} />
                  <div className="absolute bottom-full left-0 mb-2 w-48 bg-card border border-border rounded-xl shadow-xl z-30 p-1.5">
                    <button
                      onClick={() => { setTemplatePopupOpen(false); setFullViewSaveTmplOpen(true); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground rounded-lg hover:bg-muted transition-all"
                    >
                      <div className="w-6 h-6 rounded-md bg-primary/5 flex items-center justify-center">
                        <Plus className="w-3.5 h-3.5 text-primary" />
                      </div>
                      Save as template
                    </button>
                    <button
                      onClick={async () => {
                        setTemplatePopupOpen(false);
                        try {
                          const t = await fetchTemplates();
                          setFullViewLoadTemplates(t);
                          setFullViewLoadTmplOpen(true);
                        } catch (err) {
                          console.error('Failed to load templates:', err);
                        }
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground rounded-lg hover:bg-muted transition-all"
                    >
                      <div className="w-6 h-6 rounded-md bg-muted/50 flex items-center justify-center">
                        <FolderKanban className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      Load template
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {editingTemplateMeta ? (
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-all font-medium">
                Cancel
              </button>
              <button onClick={() => onSaveTemplate?.()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-all">
                <Save className="w-3.5 h-3.5" />
                Save Template
              </button>
            </div>
          ) : (
            <button
              onClick={() => onDeleteTask(task.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-lg transition-all font-medium"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Goal
            </button>
          )}
        </div>
      </div>

      {fullViewSaveTmplOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setFullViewSaveTmplOpen(false)}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Star className="w-4 h-4 text-primary" />
                </div>
                <h2 className="text-sm font-semibold text-foreground">Save as template</h2>
              </div>
              <button onClick={() => { setFullViewSaveTmplOpen(false); setFullViewTmplName(''); }} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Template name</label>
                <input
                  autoFocus
                  placeholder="e.g. Daily Standup Task"
                  value={fullViewTmplName}
                  onChange={e => setFullViewTmplName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && fullViewTmplName.trim() && (async () => {
                    try {
                      await createTemplate({
                        name: fullViewTmplName.trim(),
                        title: task.title || '',
                        description: task.description || '',
                        priority: task.priority || 'medium',
                        duration: Number(task.duration) || 0,
                        startDate: task.startDate || undefined,
                        startTime: task.startTime || undefined,
                        dueDate: task.dueDate || undefined,
                        dueTime: task.dueTime || undefined,
                        projectId: task.projectId ?? null,
                        columnId: task.columnId || undefined,
                        labels: task.labels || [],
                        subtasks: (task.subtasks || []).map(st => ({ text: st.text, durationMinutes: st.durationMinutes || 0 })),
                        checklists: task.checklists || [],
                      });
                      setFullViewSaveTmplOpen(false);
                      setFullViewTmplName('');
                    } catch (err) {
                      console.error('Failed to save template:', err);
                    }
                  })()}
                  className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
              <button onClick={() => { setFullViewSaveTmplOpen(false); setFullViewTmplName(''); }} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-all">Cancel</button>
              <button
                onClick={async () => {
                  if (!fullViewTmplName.trim()) return;
                  try {
                    await createTemplate({
                      name: fullViewTmplName.trim(),
                      title: task.title || '',
                      description: task.description || '',
                      priority: task.priority || 'medium',
                      duration: Number(task.duration) || 0,
                      startDate: task.startDate || undefined,
                      startTime: task.startTime || undefined,
                      dueDate: task.dueDate || undefined,
                      dueTime: task.dueTime || undefined,
                      projectId: task.projectId ?? null,
                      columnId: task.columnId || undefined,
                      labels: task.labels || [],
                      subtasks: (task.subtasks || []).map(st => ({ text: st.text, durationMinutes: st.durationMinutes || 0 })),
                      checklists: task.checklists || [],
                    });
                    setFullViewSaveTmplOpen(false);
                    setFullViewTmplName('');
                  } catch (err) {
                    console.error('Failed to save template:', err);
                  }
                }}
                disabled={!fullViewTmplName.trim()}
                className="px-4 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-all"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {fullViewLoadTmplOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setFullViewLoadTmplOpen(false)}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FolderKanban className="w-4 h-4 text-primary" />
                </div>
                <h2 className="text-sm font-semibold text-foreground">Load template</h2>
              </div>
              <button onClick={() => setFullViewLoadTmplOpen(false)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {fullViewLoadTemplates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                  <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center mb-3">
                    <FolderKanban className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No templates yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Save a task as a template first.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {fullViewLoadTemplates.map(tmpl => (
                    <div key={tmpl.id} className="group flex items-center gap-2 px-3 py-2 hover:bg-muted/50 rounded-xl border border-transparent hover:border-border transition-all">
                      <button
                        onClick={() => {
                          setFullViewLoadTmplOpen(false);
                          onEditTemplate?.(tmpl);
                        }}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                      >
                        <div className="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center flex-shrink-0">
                          <Star className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium block truncate">{tmpl.name}</span>
                          {tmpl.title && <span className="text-xs text-muted-foreground truncate block">{tmpl.title}</span>}
                        </div>
                      </button>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex-shrink-0">
                        <button
                          onClick={() => {
                            setFullViewLoadTmplOpen(false);
                            onEditTemplate?.(tmpl);
                          }}
                          className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-all"
                          title="Edit template"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Delete template "${tmpl.name}"?`)) return;
                            try {
                              await deleteTemplateApi(tmpl.id);
                              setFullViewLoadTemplates(await fetchTemplates());
                            } catch (err) {
                              console.error('Failed to delete template:', err);
                            }
                          }}
                          className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg hover:bg-destructive/10 transition-all"
                          title="Delete template"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end px-5 py-4 border-t border-border">
              <button onClick={() => setFullViewLoadTmplOpen(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-all">Close</button>
            </div>
          </div>
        </div>
      )}

      {projectChangeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setProjectChangeConfirm(null)}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-foreground">Move task?</h3>
            <p className="text-xs text-muted-foreground mt-2">Changing the project will move this task. Do you want to continue?</p>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setProjectChangeConfirm(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={() => {
                const { v } = projectChangeConfirm;
                const newProjectId = v === 'my-goals' ? null : Number(v);
                onUpdateTask(task.id, {
                  projectId: newProjectId,
                  projectName: v === 'my-goals' ? undefined : (projects.find(p => p.id === Number(v))?.name || undefined),
                });
                if (v === 'my-goals') {
                  onUpdateTask(task.id, { columnId: boardColumns[0]?.id || task.columnId });
                } else if (newProjectId && (!task.projectId || task.projectId !== newProjectId)) {
                  const firstCol = boardColumns.filter(c => c.projectId === newProjectId).sort((a, b) => a.order - b.order)[0];
                  if (firstCol) onUpdateTask(task.id, { columnId: firstCol.id });
                }
                setProjectChangeConfirm(null);
              }} className="px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-xl hover:opacity-90">Move</button>
            </div>
          </div>
        </div>
      )}

      {editingTmpl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setEditingTmpl(null)}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Edit3 className="w-4 h-4 text-primary" />
                </div>
                <h2 className="text-sm font-semibold text-foreground">Edit template</h2>
              </div>
              <button onClick={() => setEditingTmpl(null)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Template name</label>
                <input value={editingTmplName} onChange={e => setEditingTmplName(e.target.value)} placeholder="Template name" className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Title</label>
                <input value={editingTmplTitle} onChange={e => setEditingTmplTitle(e.target.value)} placeholder="Goal title" className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Description</label>
                <textarea value={editingTmplDesc} onChange={e => setEditingTmplDesc(e.target.value)} placeholder="Task description" rows={3} className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Priority</label>
                  <Select value={editingTmplPriority} onValueChange={setEditingTmplPriority}>
                    <SelectTrigger className="w-full bg-muted/40 border-border rounded-xl px-3 py-2.5 text-sm h-auto">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Duration (min)</label>
                  <input type="number" min={0} value={editingTmplDuration} onChange={e => setEditingTmplDuration(Math.max(0, Number(e.target.value) || 0))} className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Start date</label>
                  <input type="date" value={editingTmplStartDate} onChange={e => setEditingTmplStartDate(e.target.value)} className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all [color-scheme:var(--color-scheme)]" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Start time</label>
                  <input type="time" value={editingTmplStartTime} onChange={e => setEditingTmplStartTime(e.target.value)} className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Due date</label>
                  <input type="date" value={editingTmplDueDate} onChange={e => setEditingTmplDueDate(e.target.value)} className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all [color-scheme:var(--color-scheme)]" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Due time</label>
                  <input type="time" value={editingTmplDueTime} onChange={e => setEditingTmplDueTime(e.target.value)} className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
              <button onClick={() => setEditingTmpl(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-all">Cancel</button>
              <button
                onClick={async () => {
                  if (!editingTmpl || !editingTmplName.trim()) return;
                  try {
                    await updateTemplate(editingTmpl.id, {
                      name: editingTmplName,
                      title: editingTmplTitle,
                      description: editingTmplDesc,
                      priority: editingTmplPriority,
                      duration: editingTmplDuration,
                      startDate: editingTmplStartDate || undefined,
                      startTime: editingTmplStartTime || undefined,
                      dueDate: editingTmplDueDate || undefined,
                      dueTime: editingTmplDueTime || undefined,
                      labels: editingTmpl.labels,
                      subtasks: editingTmpl.subtasks,
                      checklists: editingTmpl.checklists,
                    });
                    const t = await fetchTemplates();
                    setFullViewTemplates(t);
                    setEditingTmpl(null);
                  } catch (err) {
                    console.error('Failed to update template:', err);
                  }
                }}
                disabled={!editingTmplName.trim()}
                className="px-4 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-all"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Tasks;

