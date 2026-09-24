. (Join-Path $PSScriptRoot 'scripts\windows\ROX.Common.ps1')
Write-RoxHeader 'Create desktop shortcut'
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'ZUVYR Manager.lnk'
$target = Join-Path $script:RoxRoot 'ROX-MANAGER.cmd'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $target
$shortcut.WorkingDirectory = $script:RoxRoot
$shortcut.Description = 'ZUVYR one-click manager'
$shortcut.Save()
Write-RoxOk "Desktop shortcut created: $shortcutPath"
