$source = Get-Content -Path "src/pages/Tasks.tsx" -Raw

$notes = $source -creplace 'Tasks', 'Notes' `
                 -creplace 'Task', 'Note' `
                 -creplace 'tasks', 'notes' `
                 -creplace 'task', 'note' `
                 -creplace 'TASKS', 'NOTES' `
                 -creplace 'TASK', 'NOTE' `
                 -creplace 'useBoardContext', 'useNotesContext' `
                 -creplace 'BoardContext', 'NotesContext'

Set-Content -Path "src/pages/Notes.tsx" -Value $notes -Encoding UTF8

$goals = $source -creplace 'Tasks', 'Goals' `
                 -creplace 'Task', 'Goal' `
                 -creplace 'tasks', 'goals' `
                 -creplace 'task', 'goal' `
                 -creplace 'TASKS', 'GOALS' `
                 -creplace 'TASK', 'GOAL' `
                 -creplace 'useBoardContext', 'useGoalsContext' `
                 -creplace 'BoardContext', 'GoalsContext'

Set-Content -Path "src/pages/Goals.tsx" -Value $goals -Encoding UTF8
