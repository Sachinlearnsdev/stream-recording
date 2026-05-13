' clip-prep-dashboard.vbs
' Target of the Sasi Studio Desktop + Start Menu shortcuts.
'
' Flow:
'   1. Probe http://127.0.0.1:6789/dashboard.html — if it answers, watcher is already up.
'   2. If not up, run clip-prep-launcher.vbs and wait ~3s for the listener to bind.
'   3. Open the dashboard URL in the default browser via rundll32 (no cmd flash).
'
' Why not just `cmd /c start "" "URL"` like the old Desktop .lnk?
'   That works when the watcher is already running (auto-start from Run-key), but
'   silently does nothing if it isn't — user gets a browser tab with "can't connect".
'   The MSXML probe + auto-launch covers the cold case.

Option Explicit
Dim fso, sh, scriptDir, http, alive
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")

alive = False
On Error Resume Next
Set http = CreateObject("MSXML2.XMLHTTP")
http.Open "GET", "http://127.0.0.1:6789/dashboard.html", False
http.send
If Err.Number = 0 And http.status = 200 Then alive = True
On Error Goto 0

If Not alive Then
  sh.Run """" & scriptDir & "\clip-prep-launcher.vbs""", 0, False
  ' launcher.vbs sleeps 2s before spawning node + brief node startup
  WScript.Sleep 3000
End If

' rundll32 url.dll,FileProtocolHandler is the no-window way to open a URL in
' the user's default browser (avoids the cmd console flash from `cmd /c start`).
sh.Run "rundll32.exe url.dll,FileProtocolHandler http://127.0.0.1:6789/dashboard.html", 0, False
