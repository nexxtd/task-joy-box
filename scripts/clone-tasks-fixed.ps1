$source = Get-Content -Path "src/pages/Tasks.tsx" -Raw

function Process-Content {
    param([string]$text, [string]$SingularTitle, [string]$PluralTitle, [string]$SingularLower, [string]$PluralLower)
    
    $result = $text -creplace 'Tasks', $PluralTitle `
                    -creplace 'Task', $SingularTitle `
                    -creplace 'tasks', $PluralLower `
                    -creplace 'task', $SingularLower `
                    -creplace 'TASKS', $PluralTitle.ToUpper() `
                    -creplace 'TASK', $SingularTitle.ToUpper() `
                    -creplace 'useBoardContext', "use$($PluralTitle)Context" `
                    -creplace 'BoardContext', "$($PluralTitle)Context"

    # Undo specific API/property breaks
    $result = $result -creplace "sub$($PluralLower)", 'subtasks' `
                      -creplace "sub$($SingularLower)", 'subtask' `
                      -creplace "Sub$($SingularLower)", 'Subtask' `
                      -creplace "$($SingularLower)Id", 'taskId' `
                      -creplace "$($SingularTitle)Id", 'TaskId' `
                      -creplace "add$($SingularTitle)", 'addTask' `
                      -creplace "update$($SingularTitle)", 'updateTask' `
                      -creplace "delete$($SingularTitle)", 'deleteTask' `
                      -creplace "move$($SingularTitle)", 'moveTask' `
                      -creplace "board\.$($PluralLower)", 'board.tasks' `
                      -creplace "b\.$($PluralLower)", 'b.tasks' `
                      -creplace "fetch$($SingularTitle)Templates", 'fetchTemplates' `
                      -creplace "create$($SingularTitle)Template", 'createTemplate' `
                      -creplace "update$($SingularTitle)Template", 'updateTemplate' `
                      -creplace "delete$($SingularTitle)Template", 'deleteTemplate' `
                      -creplace "delete$($SingularTitle)TemplateApi", 'deleteTemplateApi' `
                      -creplace "$($SingularTitle)Status", 'TaskStatus' `
                      -creplace "$($SingularTitle)Activity", 'TaskActivity' `
                      -creplace "$($SingularTitle)Template", 'TaskTemplate' `
                      -creplace "$($SingularTitle)TemplateApi", 'TaskTemplateApi'

    return $result
}

$notes = Process-Content -text $source -SingularTitle 'Note' -PluralTitle 'Notes' -SingularLower 'note' -PluralLower 'notes'
Set-Content -Path "src/pages/Notes.tsx" -Value $notes -Encoding UTF8

$goals = Process-Content -text $source -SingularTitle 'Goal' -PluralTitle 'Goals' -SingularLower 'goal' -PluralLower 'goals'
Set-Content -Path "src/pages/Goals.tsx" -Value $goals -Encoding UTF8
