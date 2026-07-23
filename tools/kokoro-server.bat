@echo off
REM Lanza el servidor Kokoro TTS (puerto 8880).
REM Para que arranque con Windows: Win+R -> shell:startup -> pega un acceso directo a este .bat
cd /d "%~dp0"
python kokoro-server.py
pause
