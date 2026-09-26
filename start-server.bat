@echo off
title YouTube Downloader Pro
cd /d "%~dp0"
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [HATA] Python bulunamadi! Lutfen Python'i yukleyin ve PATH'e ekleyin.
    pause
    exit /b 1
)
python -m pip install yt-dlp --quiet
python server.py
pause
