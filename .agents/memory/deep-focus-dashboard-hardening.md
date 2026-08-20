# Task Joy Box — Deep focus + dashboard hardening

Covered the 4-part ticket (editable review modal, Start Deep Work picker, widget audit, cursor-centered drag).

- **Review & Complete dialog** (`src/components/DeepFocusMode.tsx`, `showDetailDialog` ~740): sub-tasks now support drag reorder (droppable `deepfocus-review-subtasks`, handled by `handleDeepFocusReorder`) + duration editing, alongside existing add/rename/delete/toggle. Checklist lists/items already had full dnd editing.
- **Dashboard "Start Deep Work"** (`src/pages/Dashboard.tsx`): button (inside `tasks` widget) now opens a task-picker modal (`showTaskPicker`/`taskPickerQuery`/`pickedTasks`). Selecting a task does `navigate('/tasks')` + `openDeepFocus(task)` — works because DeepFocusMode is mounted globally in `App.tsx:135` and `useDeepFocus` dispatches the `openDeepFocus` CustomEvent with `detail.task`.
- **Widget audit**: all 22 dashboard widget bodies already render real board data; the only dead interaction was the Start Deep Work button (fixed above). No stubs remain.
- **Cursor-centered dragging**: both `Dashboard.tsx` `onGestureMove`/panel-drop and `useWidgetGrid.ts` move/panel-drop now center the widget under the cursor using `Math.round((w-1)/2)` / `Math.round((h-1)/2)` (was `Math.floor`, which put the cursor at the top/left edge for even-sized widgets). Insights grid inherits the fix from the hook.

## Gotchas
- Two `DragDropContext`s coexist inside the review dialog (sub-tasks + checklists) and overlay the main view's contexts — sibling (never nested) contexts work fine in @hello-pangea/dnd.
- Widget body props are plain widget-object patches: `updateWidget(id, { projectId, metric, range, ... })` via `useWidgetGrid`.
