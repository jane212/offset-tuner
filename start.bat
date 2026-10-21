@echo off
cd /d "%~dp0"
echo Offset tuner: http://127.0.0.1:8765
echo Press Ctrl+C to stop.
python -m http.server 8765
