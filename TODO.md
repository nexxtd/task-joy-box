# TODO - Task Joy Box fixes

## Step 1 (now)
- [ ] Update `src/pages/Tasks.tsx`:
  - Remove “status” and “due” UI from:
    - task expanded inline section (expanded details area)
    - `TaskFullView` modal:
      - status select
      - due date/time inputs
      - due/status display near comments header
      - due/status entries in Activity list (if present)

## Step 2
- [ ] Harden expand-button expanded renderer in `src/pages/Tasks.tsx` to prevent blank white screen:
  - Guard against missing/legacy subtasks fields (e.g., ensure `subtasks` rendering uses safe defaults / fallback mapping)

## Step 3
- [ ] Replace ONLY the “Create Task” modal subtasks editor in `src/pages/Tasks.tsx`:
  - Match DeepFocusMode subtasks editor markup/behavior
  - Keep draft state usage (`newTaskSubtasks`, `newSubtaskText`, `newSubtaskDuration`)

## Step 4
- [ ] Run build/lint and manually verify flows:
  - Expand button no longer whitescreens
  - Tasks UI no longer shows due/status
  - New Task modal subtasks editor matches Deep Focus UI
