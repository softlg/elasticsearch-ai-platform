#!/usr/bin/env bash
# ============================================================
# Elasticsearch AI 查询平台 - Linux/macOS 一键启动
# 首次使用：先在 backend/.env 中填入 ES 地址与 LLM_API_KEY
# 用法：chmod +x start.sh && ./start.sh
# ============================================================
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"

echo ""
echo "  =========================================="
echo "   Elasticsearch AI 查询平台 启动器"
echo "  =========================================="
echo ""

# ---------- 1. 检查 Python / Node ----------
command -v python3 >/dev/null 2>&1 || { echo "[错误] 未找到 python3"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "[错误] 未找到 node"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "[错误] 未找到 npm"; exit 1; }

# ---------- 2. 初始化 .env ----------
if [ ! -f "$BACKEND_DIR/.env" ]; then
    cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
    echo "[提示] 已从 .env.example 生成 backend/.env"
    echo "       请打开 backend/.env 填入 ES_HOSTS 与 LLM_API_KEY 后重新启动！"
    echo ""
fi
[ -f "$FRONTEND_DIR/.env" ] || cp "$FRONTEND_DIR/.env.example" "$FRONTEND_DIR/.env"

# ---------- 3. 后端依赖 ----------
if [ ! -d "$BACKEND_DIR/.venv" ]; then
    echo "[步骤] 创建后端虚拟环境并安装依赖..."
    python3 -m venv "$BACKEND_DIR/.venv"
    "$BACKEND_DIR/.venv/bin/pip" install -r "$BACKEND_DIR/requirements.txt" -q
else
    echo "[步骤] 使用已存在的后端虚拟环境 .venv"
fi

# ---------- 4. 前端依赖 ----------
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    echo "[步骤] 安装前端依赖..."
    (cd "$FRONTEND_DIR" && npm install)
else
    echo "[步骤] 使用已存在的前端 node_modules"
fi

# ---------- 5. 启动后端（后台） ----------
echo "[步骤] 启动后端  http://localhost:8000/docs"
(cd "$BACKEND_DIR" && "$BACKEND_DIR/.venv/bin/python" -m uvicorn app.main:app \
    --host 0.0.0.0 --port 8000 --reload \
    >> "$ROOT/backend.log" 2>&1 &
  echo $! > "$ROOT/backend.pid"
  echo "       后端 PID: $(cat "$ROOT/backend.pid")")

# ---------- 6. 启动前端（后台） ----------
echo "[步骤] 启动前端  http://localhost:5173"
(cd "$FRONTEND_DIR" && npm run dev >> "$ROOT/frontend.log" 2>&1 &
  echo $! > "$ROOT/frontend.pid"
  echo "       前端 PID: $(cat "$ROOT/frontend.pid")")

echo ""
echo "  =========================================="
echo "   启动完成！请打开浏览器访问:"
echo "   前端工作台: http://localhost:5173"
echo "   API 文档:   http://localhost:8000/docs"
echo "   停止服务:   kill \$(cat backend.pid) \$(cat frontend.pid)"
echo "  =========================================="
echo ""
