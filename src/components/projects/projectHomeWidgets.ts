import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  Clock3,
  FileText,
  Flag,
  Gauge,
  Layers,
  StickyNote,
  Target,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import type { GridWidget, GridWidgetDef } from '@/hooks/useWidgetGrid';

export type ProjectHomeWidgetType =
  | 'project-details'
  | 'summary-stats'
  | 'progress-overview'
  | 'members'
  | 'milestones'
  | 'next-milestone'
  | 'recent-activity'
  | 'task-status'
  | 'priority-breakdown'
  | 'upcoming-deadlines'
  | 'overdue-tasks'
  | 'project-notes'
  | 'team-workload'
  | 'join-requests';

export const PROJECT_HOME_STORAGE_KEY = 'project-home-grid-v1';

/** Every widget is available on every plan: a project's home is shared by its whole team. */
export const PROJECT_HOME_WIDGETS: GridWidgetDef<ProjectHomeWidgetType>[] = [
  { type: 'project-details', title: 'Project Details', desc: 'Description, status and your permission level', icon: FileText, accent: 'label-blue', w: 8, h: 3, tier: 'free', minW: 4, minH: 2, maxW: 12, maxH: 6 },
  { type: 'summary-stats', title: 'Summary Stats', desc: 'Total, completed and overdue tasks plus member count', icon: BarChart3, accent: 'label-purple', w: 4, h: 3, tier: 'free', minW: 3, minH: 2, maxW: 12, maxH: 5 },
  { type: 'progress-overview', title: 'Progress Overview', desc: 'Completion percentage across every project task', icon: TrendingUp, accent: 'label-green', w: 4, h: 2, tier: 'free', minW: 3, minH: 2, maxW: 12, maxH: 4 },
  { type: 'members', title: 'Members', desc: 'Everyone on the project and their role', icon: Users, accent: 'label-blue', w: 4, h: 3, tier: 'free', minW: 3, minH: 2, maxW: 12, maxH: 8 },
  { type: 'milestones', title: 'Milestones', desc: 'Roadmap checkpoints you can tick off, edit or add', icon: Flag, accent: 'label-orange', w: 6, h: 3, tier: 'free', minW: 4, minH: 2, maxW: 12, maxH: 8 },
  { type: 'next-milestone', title: 'Next Milestone', desc: 'Countdown to the next open milestone', icon: Target, accent: 'label-red', w: 4, h: 2, tier: 'free', minW: 3, minH: 2, maxW: 8, maxH: 4 },
  { type: 'recent-activity', title: 'Recent Activity', desc: 'The latest changes and who made them', icon: Clock3, accent: 'label-purple', w: 6, h: 3, tier: 'free', minW: 4, minH: 2, maxW: 12, maxH: 8 },
  { type: 'task-status', title: 'Tasks by Status', desc: 'How many tasks sit in each board column', icon: Layers, accent: 'label-blue', w: 4, h: 3, tier: 'free', minW: 3, minH: 2, maxW: 12, maxH: 6 },
  { type: 'priority-breakdown', title: 'Priority Breakdown', desc: 'Open tasks grouped by urgent, high, medium and low', icon: Gauge, accent: 'label-orange', w: 4, h: 3, tier: 'free', minW: 3, minH: 2, maxW: 12, maxH: 6 },
  { type: 'upcoming-deadlines', title: 'Upcoming Deadlines', desc: 'Open tasks due in the next two weeks', icon: CalendarClock, accent: 'label-yellow', w: 6, h: 3, tier: 'free', minW: 4, minH: 2, maxW: 12, maxH: 8 },
  { type: 'overdue-tasks', title: 'Overdue Tasks', desc: 'Every open task past its due date', icon: AlertTriangle, accent: 'label-red', w: 6, h: 3, tier: 'free', minW: 4, minH: 2, maxW: 12, maxH: 8 },
  { type: 'project-notes', title: 'Project Notes', desc: 'The most recently updated notes in this project', icon: StickyNote, accent: 'label-yellow', w: 6, h: 3, tier: 'free', minW: 4, minH: 2, maxW: 12, maxH: 8 },
  { type: 'team-workload', title: 'Team Workload', desc: 'Open and finished tasks assigned to each member', icon: UserCheck, accent: 'label-green', w: 6, h: 3, tier: 'free', minW: 4, minH: 2, maxW: 12, maxH: 8 },
  { type: 'join-requests', title: 'Join Requests', desc: 'Approve or deny people asking to join (owner only)', icon: UserPlus, accent: 'label-blue', w: 4, h: 3, tier: 'free', minW: 3, minH: 2, maxW: 12, maxH: 6 },
];

const place = (
  id: string,
  type: ProjectHomeWidgetType,
  col: number,
  row: number,
  w: number,
  h: number,
): GridWidget<ProjectHomeWidgetType> => ({
  id,
  type,
  title: PROJECT_HOME_WIDGETS.find(d => d.type === type)?.title || type,
  col,
  row,
  w,
  h,
});

export const defaultProjectHomeLayout = (): GridWidget<ProjectHomeWidgetType>[] => [
  place('ph1', 'project-details', 1, 1, 8, 3),
  place('ph2', 'summary-stats', 9, 1, 4, 3),
  place('ph3', 'members', 1, 4, 4, 3),
  place('ph4', 'progress-overview', 5, 4, 4, 3),
  place('ph5', 'task-status', 9, 4, 4, 3),
  place('ph6', 'milestones', 1, 7, 6, 3),
  place('ph7', 'recent-activity', 7, 7, 6, 3),
];
