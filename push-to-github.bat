@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

set "REPO_URL=https://github.com/wms365com-dev/budget.git"
set "DEFAULT_BRANCH=main"
set "COMMIT_MSG=%*"

echo.
echo Budget dashboard GitHub push helper
echo Repo: %REPO_URL%
echo Branch: %DEFAULT_BRANCH%
echo Folder: %CD%
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo ERROR: Git is not installed or not in PATH.
  echo Install Git for Windows, then run this file again.
  goto :fail
)

git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo Initializing a new git repository...
  git init
  if errorlevel 1 goto :fail
)

set "CURRENT_REMOTE="
for /f "delims=" %%R in ('git remote get-url origin 2^>nul') do set "CURRENT_REMOTE=%%R"

if not defined CURRENT_REMOTE (
  echo Adding origin remote...
  git remote add origin "%REPO_URL%"
  if errorlevel 1 goto :fail
) else (
  if /I not "!CURRENT_REMOTE!"=="%REPO_URL%" (
    echo ERROR: Existing origin remote does not match.
    echo Current origin: !CURRENT_REMOTE!
    echo Expected origin: %REPO_URL%
    echo.
    echo Run this if you want to fix it:
    echo git remote set-url origin %REPO_URL%
    goto :fail
  )
)

echo Setting branch to %DEFAULT_BRANCH%...
git branch -M %DEFAULT_BRANCH%
if errorlevel 1 goto :fail

if not defined COMMIT_MSG (
  set /p "COMMIT_MSG=Commit message [Update budget dashboard]: "
)
if not defined COMMIT_MSG (
  set "COMMIT_MSG=Update budget dashboard"
)

echo Staging files...
git add .
if errorlevel 1 goto :fail

git diff --cached --quiet
if errorlevel 1 (
  echo Creating commit...
  git commit -m "%COMMIT_MSG%"
  if errorlevel 1 goto :fail
) else (
  echo No new file changes to commit. Continuing to push current branch.
)

echo Pushing to GitHub...
git push -u origin %DEFAULT_BRANCH%
if errorlevel 1 goto :push_failed

echo.
echo Push completed successfully.
echo.
pause
exit /b 0

:push_failed
echo.
echo Push failed.
echo If the GitHub repo already has files in it, run these commands manually:
echo   git fetch origin
echo   git pull origin %DEFAULT_BRANCH% --allow-unrelated-histories
echo Then resolve any merge conflicts and run this batch file again.
echo.
pause
exit /b 1

:fail
echo.
echo Script stopped before push finished.
echo.
pause
exit /b 1
