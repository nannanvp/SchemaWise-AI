@echo off
title SchemaWise AI
echo ==========================================
echo        SchemaWise AI - Starting
echo ==========================================
echo.

if not exist venv (
    echo Creating Python environment...
    python -m venv venv
)

call venv\Scripts\activate

echo Installing required packages...
python -m pip install -r backend\requirements.txt

echo.
echo ==========================================
echo Open this in Chrome:
echo http://127.0.0.1:8000
echo ==========================================
echo.

python -m uvicorn backend.main:app --reload

pause
