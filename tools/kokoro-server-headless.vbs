' Lanza kokoro-server.bat SIN ventana (headless).
' Para arrancar con Windows: Win+R -> shell:startup -> pega un acceso directo a ESTE .vbs
' (en vez del .bat, que deja la consola visible).
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
bat = fso.GetParentFolderName(WScript.ScriptFullName) & "\kokoro-server.bat"
sh.Run """" & bat & """", 0, False
