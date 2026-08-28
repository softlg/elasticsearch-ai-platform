@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

rem ============================================================
rem  Elasticsearch AI 查询平台 - Windows 一键启动
rem  首次使用：先在 backend/.env 中填入 ES 地址与 LLM_API_KEY
rem ============================================================
set ROOT=%~dp0
set BACKEND_DIR=%ROOT%backend
set FRONTEND_DIR=%ROOT%frontend

echo.
echo  ==========================================
echo   Elasticsearch AI 查询平台 启动器
echo  ==========================================
echo.

rem ---------- 1. 检查 Python / Node ----------
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Python，请先安装 Python 3.10+ 并加入 PATH
    pause & exit /b 1
)
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Node.js，请先安装 Node.js 18+ 并加入 PATH
    pause & exit /b 1
)

rem ---------- 2. 初始化 .env ----------
if not exist "%BACKEND_DIR%\.env" (
    copy "%BACKEND_DIR%\.env.example" "%BACKEND_DIR%\.env" >nul
    echo [提示] 已从 .env.example 生成 backend\.env
    echo        请打开 backend\.env 填入 ES_HOSTS 与 LLM_API_KEY 后重新启动！
    echo.
)
if not exist "%FRONTEND_DIR%\.env" (
    copy "%FRONTEND_DIR%\.env.example" "%FRONTEND_DIR%\.env" >nul
    echo [提示] 已生成 frontend\.env
)

rem ---------- 3. 后端依赖 ----------
if not exist "%BACKEND_DIR%\.venv" (
    echo [步骤] 创建后端虚拟环境并安装依赖...
    cd /d "%BACKEND_DIR%"
    python -m venv .venv
    call .venv\Scripts\activate.bat
    pip install -r requirements.txt -q
) else (
    echo [步骤] 使用已存在的后端虚拟环境 .venv
)

rem ---------- 4. 启动后端 ----------
echo [步骤] 启动后端  http://localhost:8000/docs
start "ES-AI-Backend" cmd /k "cd /d "%BACKEND_DIR%" && call .venv\Scripts\activate.bat && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

rem ---------- 5. 前端依赖 ----------
if not exist "%FRONTEND_DIR%\node_modules" (
    echo [步骤] 安装前端依赖...
    cd /d "%FRONTEND_DIR%"
    call npm install
) else (
    echo [步骤] 使用已存在的前端 node_modules
)

rem ---------- 6. 启动前端 ----------
echo [步骤] 启动前端  http://localhost:5173
start "ES-AI-Frontend" cmd /k "cd /d "%FRONTEND_DIR%" && npm run dev"

echo.
echo  ==========================================
echo   启动完成！请打开浏览器访问:
echo   前端工作台: http://localhost:5173
echo   API 文档:   http://localhost:8000/docs
echo  ==========================================
echo.
pause
