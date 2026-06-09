@echo off
setlocal EnableDelayedExpansion

:: Self-relaunch into a persistent window so it never disappears
if not defined FISH_LAUNCHED (
    set FISH_LAUNCHED=1
    cmd /k "%~f0"
    exit /b
)

:: ============================================================
::  FISH-Drugs  --  Dev Environment Startup Script
:: ============================================================

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONTEND=%ROOT%frontend"
set "VENV=%BACKEND%\venv"
set "VENV_PIP=%VENV%\Scripts\pip.exe"
set "REQUIREMENTS=%ROOT%requirements.txt"

echo.
echo ============================================================
echo   FISH-Drugs  ^|  Dev Startup
echo ============================================================
echo   Root     : %ROOT%
echo   Backend  : %BACKEND%
echo   Frontend : %FRONTEND%
echo ============================================================
echo.

:: ------------------------------------------------------------
:: Folder / file sanity checks
:: ------------------------------------------------------------
echo [CHECK] Project structure...

if not exist "%BACKEND%" (
    echo  ERROR: backend\ folder not found.
    echo  Make sure start.bat is in the FISH-Drugs root folder.
    goto :fail
)
if not exist "%FRONTEND%" (
    echo  ERROR: frontend\ folder not found.
    goto :fail
)
if not exist "%REQUIREMENTS%" (
    echo  ERROR: requirements.txt not found.
    goto :fail
)
if not exist "%BACKEND%\main.py" (
    echo  ERROR: backend\main.py not found.
    goto :fail
)
echo  OK -- project structure looks good.

:: ------------------------------------------------------------
:: STEP 1 -- Python
:: ------------------------------------------------------------
echo.
echo [CHECK] Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Python not on PATH.  https://www.python.org/downloads/
    goto :fail
)
for /f "tokens=*" %%v in ('python --version 2^>^&1') do echo  OK -- %%v

:: ------------------------------------------------------------
:: STEP 1b -- Node / npm
:: ------------------------------------------------------------
echo [CHECK] Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Node.js not on PATH.  https://nodejs.org/
    goto :fail
)
for /f "tokens=*" %%v in ('node --version 2^>^&1') do echo  OK -- node %%v

echo [CHECK] npm...

::The following is BAD for some reason:   npm --version >nul 2>&1
where npm >nul 2>&1
if errorlevel 1 ( echo  ERROR: npm not found. & goto :fail )

if errorlevel 1 (
    echo  ERROR: npm not found.  Re-install Node.js.
    goto :fail
)
for /f "tokens=*" %%v in ('npm --version 2^>^&1') do echo  OK -- npm %%v
echo Reached critical step
:: ------------------------------------------------------------
:: STEP 2 -- Python venv + pip install
:: ------------------------------------------------------------

echo [VENV] Checking virtual environment...
if not exist "%VENV%\Scripts\activate.bat" (
    echo  Creating venv at backend\venv ...
    python -m venv "%VENV%"
    if errorlevel 1 ( echo  ERROR: venv creation failed. & goto :fail )
    echo  venv created.
) else (
    echo  OK -- venv already exists.
)

echo [DEPS] pip install -r requirements.txt ...
"%VENV_PIP%" install -r "%REQUIREMENTS%"
if errorlevel 1 ( echo  ERROR: pip install failed. & goto :fail )
echo  OK -- Python dependencies ready.

:: ------------------------------------------------------------
:: STEP 3 -- npm install if needed
:: ------------------------------------------------------------
echo "TODO - this check was buggy, for now we assume npm is there"
:: echo [DEPS] Checking frontend node_modules...
:: echo Houston, we have a start
:: echo "%FRONTEND%\node_modules\"
:: if not exist "%FRONTEND%\node_modules\" (
::     echo  Running npm install (this may take a minute)
::     pushd "%FRONTEND%"
::     echo Houston, we did an install.
::     npm install
::     if errorlevel 1 ( echo  ERROR: npm install failed. & popd & goto :fail )
::     popd
::     echo  OK -- npm packages installed.
:: ) else (
::     echo  OK -- node_modules already present.
:: )
:: echo Houston, we did a check

:: ------------------------------------------------------------
:: STEP 4 -- Launch frontend
:: ------------------------------------------------------------
echo [START] Launching frontend window...
start "FISH-Drugs Frontend" cmd.exe /K "cd /D "%FRONTEND%" && npm run dev"

:: ------------------------------------------------------------
:: STEP 5 -- Launch python venv and backend
:: ------------------------------------------------------------
echo.
echo [START] Launching backend window...

cd "%BACKEND%"

:: Activate the venv and launch uvicorn in a new cmd window - if it's in the same window, somehow it can't find the directory...
start "FISH-Drugs Backend" cmd.exe /K ".\venv\Scripts\activate && .\venv\Scripts\uvicorn.exe main:app --reload --port 8000"

echo  Waiting 4 seconds for uvicorn to initialise...
timeout /t 4 /nobreak >nul

echo.
echo ============================================================
echo   Both servers launched in separate windows.
echo.
echo   Backend   -->  http://localhost:8000
echo   Frontend  -->  http://localhost:5173
echo.
echo   Press Ctrl+C in each window to stop the servers.
echo ============================================================
echo.
goto :end

:fail
echo.
echo ============================================================
echo   Startup FAILED -- see error above.
echo ============================================================

:end
echo Press any key to close this launcher window...
pause >nul
