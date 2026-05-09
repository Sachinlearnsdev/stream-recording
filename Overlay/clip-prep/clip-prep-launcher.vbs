' clip-prep-launcher.vbs
' Runs start.bat hidden so no cmd window flashes at login.
' Invoked by the registry Run key entry that install.bat creates,
' AND by the watcher's /restart endpoint to spawn a fresh instance.
'
' The 2-second sleep gives any previous watcher time to fully exit
' and free port 6789 before the new node.exe tries to bind it. Bumped
' from 1s after seeing intermittent EADDRINUSE on rapid restarts.

WScript.Sleep 2000

Dim sh, scriptPath, batPath
Set sh = CreateObject("WScript.Shell")
scriptPath = WScript.ScriptFullName
batPath = Left(scriptPath, InStrRev(scriptPath, "\")) & "start.bat"
' Run("cmdline", windowStyle, waitOnReturn) — 0 = hidden, False = async
sh.Run """" & batPath & """", 0, False
