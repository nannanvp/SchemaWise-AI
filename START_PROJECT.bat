@echo off
title SchemaWise AI - Learn, Download & Help
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
echo  Open this in your browser:
echo    http://127.0.0.1:8001
echo ==========================================
echo.
echo  This copy runs on port 8001 so it can be
echo  started beside the original build (8000).
echo.
echo  Tip: copy backend\.env.example to backend\.env
echo       and add your GROQ_API_KEY for online AI.
echo.

python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8001

pause
