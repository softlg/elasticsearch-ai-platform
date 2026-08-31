# Elasticsearch AI 查询平台

一个基于 AI 的 Elasticsearch 日志查询分析平台。类似 Kibana 的排查体验：选择系统索引、用**自然语言描述需求**自动生成 ES DSL、按时间/字段/关键字过滤，并由大模型给出问题归纳与解决建议。

> 当前版本为 Beta。项目默认不提供登录、RBAC、租户隔离或审计能力，生产环境请先完成认证、限流和数据脱敏。

![tech](https://img.shields.io/badge/FastAPI-0.115-green) ![tech](https://img.shields.io/badge/React-18-blue) ![tech](https://img.shields.io/badge/Elasticsearch-8.15-orange)

---

## 目录

- [特性](#特性)
- [技术栈](#技术栈)
- [架构与数据流](#架构与数据流)
- [目录结构](#目录结构)
- [环境要求](#环境要求)
- [快速启动](#快速启动)
- [配置说明](#配置说明)
- [API 使用实例](#api-使用实例)
- [前端使用指南](#前端使用指南)
- [常见问题](#常见问题)
- [安全说明](#安全说明)
- [开发与贡献](#开发与贡献)

---

## 特性

- 🔍 **索引选择**：自动探测 ES 集群索引列表，下拉切换（类似 Kibana）
- 💬 **自然语言查询**：中文/英文描述 → OpenAI 兼容大模型生成只读 ES DSL
- ✏️ **DSL 手动编辑**：直接输入/修改 ES DSL，二次编辑时保留时间/字段/关键字过滤
- ⏱️ **时间范围筛选**：左侧快捷筛选与中间时间范围自动取交集
- 🧲 **字段过滤 + 关键字检索**：keyword 精确 / text 分词 / match_phrase 精确短语
- 🛡️ **DSL 安全校验**：仅允许只读查询，拦截写操作与高危聚合，限定 size 与聚合深度
- 📄 **日志结果展示**：默认一次返回 100 条，页面滚动仅浏览当前结果，不会自动重新生成 DSL
- 🧠 **AI 分析**：基于查询结果输出问题归纳、根因分析、解决建议与严重程度
- 🎯 **命中高亮**：搜索结果中关键字自动高亮
- ⚙️ **列配置**：结果列可自由显隐、持久化到浏览器 localStorage
- 🌐 **中英文切换**：界面与 AI 输出语言跟随界面语言
- ⚙️ **配置化大模型**：支持 OpenAI / DeepSeek / 通义 / newapi 等，通过 `.env` 切换

## 技术栈

| 端 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Vite 5 + TailwindCSS + i18next + Recharts |
| 后端 | FastAPI + Pydantic v2 + elasticsearch-py 8.x + OpenAI SDK |
| 数据源 | Elasticsearch 7.x / 8.x（只读） |

## 架构与数据流

```text
浏览器（React/Vite）
        │ REST / SSE
        ▼
FastAPI 后端 ── 只读 DSL 校验 ──► Elasticsearch
        │
        └──── 自然语言 / 日志样本（按需脱敏） ──► OpenAI 兼容 LLM
```

后端负责索引和 mapping 探测、DSL 白名单校验、查询分页以及 AI 分析。发送给 LLM 的内容可能包含用户选中的自然语言、DSL 和日志样本；请根据组织的隐私要求配置脱敏或使用自有模型网关。

## 目录结构

```
elasticsearch-ai-platform/
├── backend/
│   ├── app/
│   │   ├── api/            # 路由：indices / query / analysis
│   │   ├── schemas/        # Pydantic 请求/响应模型
│   │   ├── services/       # ES 网关、AI 生成 DSL、日志分析、LLM 工厂
│   │   └── config.py       # .env 配置
│   ├── requirements.txt    # Python 依赖
│   └── .env.example        # 环境变量模板
├── frontend/
│   ├── src/
│   │   ├── components/     # ResultTable / DslPanel / FilterPanel 等
│   │   ├── api/            # axios API 客户端
│   │   └── i18n.ts         # 中英文文案
│   ├── .env.example        # 前端环境变量模板
│   └── package.json
├── start.bat               # Windows 一键启动
└── start.sh                # Linux/macOS 一键启动
```

## 环境要求

| 组件 | 版本要求 |
|---|---|
| Python | 3.10+ |
| Node.js | 18+ |
| Elasticsearch | 7.x 或 8.x（HTTP 可访问即可） |
| 大模型 API | 任意 OpenAI 兼容接口（OpenAI / DeepSeek / 通义 / newapi） |

> 没有 ES 环境？可用官方镜像起一个临时实例（Docker）：
> ```bash
> docker run -d --name es-dev -p 9200:9200 -e "discovery.type=single-node" -e "xpack.security.enabled=false" docker.elastic.co/elasticsearch/elasticsearch:8.15.1
> ```

## 快速启动

### 方式一：一键脚本（推荐）

```bash
# Windows（双击或在项目根目录运行）
start.bat

# Linux / macOS
chmod +x start.sh && ./start.sh
```

脚本会自动：安装依赖 → 复制 `.env.example` 为 `.env`（如不存在）→ 启动后端（8000 端口）→ 启动前端（5173 端口）。

### 方式二：手动分步启动

**1) 后端**

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate
# Linux / macOS
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env        # 然后编辑 .env 填入 ES 地址 与 LLM_API_KEY

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

健康检查：`GET http://localhost:8000/api/health`，返回 `{"status":"ok"}` 即成功。

**2) 前端**（另开一个终端）

```bash
cd frontend
npm install
npm run dev
```

打开 `http://localhost:5173`。

> 修改了 `frontend/.env` 后**必须重启** `npm run dev` 才生效。

### 方式三：Docker Compose

```bash
cp backend/.env.example backend/.env   # Windows: copy backend\\.env.example backend\\.env
# 编辑 backend/.env，至少配置 Elasticsearch；需要自然语言查询/AI 分析时配置 LLM_API_KEY
docker compose up --build
```

打开 `http://localhost:8080`，API 文档为 `http://localhost:8000/docs`。Compose 示例默认关闭 Elasticsearch 安全认证，仅适合本地开发；生产环境请改用 HTTPS、认证和持久化策略。

## 配置说明

### 后端 `backend/.env`

| 配置项 | 说明 | 示例 |
|---|---|---|
| `ES_HOSTS` | ES 集群地址（多个逗号分隔） | `http://localhost:9200` |
| `ES_USERNAME` / `ES_PASSWORD` | 安全认证（匿名留空） | `elastic` / `xxx` |
| `ES_USE_SSL` / `ES_VERIFY_CERTS` | HTTPS / 自签证书场景 | `false` / `false` |
| `ES_REQUEST_TIMEOUT` | 查询超时（秒） | `30` |
| `ES_MAX_SIZE` | 单次查询 size 上限（兜底） | `1000` |
| `LLM_PROVIDER` | 供应商标识（自定义即可） | `deepseek` |
| `LLM_API_KEY` | API Key | `sk-xxx` |
| `LLM_MODEL` | 模型名 | `gpt-4o-mini` / `deepseek-chat` |
| `LLM_BASE_URL` | OpenAI 兼容地址 | OpenAI `https://api.openai.com/v1`、DeepSeek `https://api.deepseek.com/v1`、newapi `http://你的网关/v1` |
| `LLM_TIMEOUT` | 调用超时（秒） | `60` |
| `LLM_TEMPERATURE` | 温度 | `0.2` |
| `LLM_USE_RESPONSES` | 网关仅支持 `/responses` 时设 `true`（如 newapi codex channel） | `false` |
| `BACKEND_HOST` / `BACKEND_PORT` | 后端监听地址/端口 | `0.0.0.0` / `8000` |
| `CORS_ORIGINS` | 允许跨域来源（开发用 `*`） | `*` |

> 切换模型/供应商只需修改 `.env` 后重启后端，无需改代码。

### 前端 `frontend/.env`

| 配置项 | 说明 |
|---|---|
| `VITE_API_BASE` | 后端 API 地址，如 `http://localhost:8000` |

## API 使用实例

后端启动后，`http://localhost:8000/docs` 可交互调试全部接口。

### 1. 健康检查

```bash
curl http://localhost:8000/api/health
# => {"status":"ok","llm_configured":true}
```

### 2. 获取索引列表

```bash
curl http://localhost:8000/api/indices
# => {"indices":[{"name":"nginx-access","health":"green","docs_count":123456,"store_size":"1.2gb"}, ...]}
```

### 3. 获取索引字段映射

```bash
curl http://localhost:8000/api/indices/nginx-access/mapping
# => {"index":"nginx-access","fields":[{"name":"@timestamp","type":"date","is_date":true}, ...]}
```

### 4. 自然语言查询（推荐）

```bash
curl -X POST http://localhost:8000/api/query \
  -H "Content-Type: application/json" \
  -d '{
    "index": "nginx-access",
    "natural_language": "最近 1 小时状态码为 500 的错误日志",
    "language": "zh",
    "time_range": {"from": "2026-08-14T00:00:00Z", "to": "2026-08-14T12:00:00Z"},
    "size": 100
  }'
```

响应 `QueryResult`：

```json
{
  "index": "nginx-access",
  "total": 86,
  "executed_dsl": { "query": { "bool": { "must": [...] } }, "size": 100 },
  "dsl_explanation": "查询最近1小时状态码为500的日志...",
  "hits": [ { "_source": { "message": "...", "status": 500 } } ],
  "took_ms": 12,
  "from": 0,
  "size": 100,
  "has_more": false
}
```

### 5. 直接提交 DSL 查询（手动编辑）

```bash
curl -X POST http://localhost:8000/api/query \
  -H "Content-Type: application/json" \
  -d '{
    "index": "nginx-access",
    "dsl": {
      "query": {
        "bool": {
          "must": [
            { "term": { "status": 500 } },
            { "range": { "@timestamp": { "gte": "2026-08-14T00:00:00Z", "lt": "2026-08-14T12:00:00Z" } } }
          ]
        }
      }
    },
    "from": 0,
    "size": 20
  }'
```

> 注意：`time_range` / `keyword` / `filters` 会与 `dsl` 自动合并（取交集），无需手写进 DSL。

### 6. 带关键字检索 + 字段过滤

```bash
curl -X POST http://localhost:8000/api/query \
  -H "Content-Type: application/json" \
  -d '{
    "index": "nginx-access",
    "natural_language": "查看错误日志",
    "keyword": "timeout",
    "keyword_exact": false,
    "filters": [
      { "field": "level", "value": "ERROR", "op": "match" }
    ]
  }'
```

### 7. API 手动分页（可选）

前端默认只加载首批 100 条，滚动不会再次请求。通过 API 调用时，仍可使用 `from` 和 `size` 手动分页：

```bash
curl -X POST http://localhost:8000/api/query \
  -H "Content-Type: application/json" \
  -d '{"index":"nginx-access", "from":100, "size":100}'
```

### 8. AI 分析查询结果

```bash
curl -X POST http://localhost:8000/api/analysis \
  -H "Content-Type: application/json" \
  -d '{
    "index": "nginx-access",
    "hits": [ { "message": "connect timeout to backend", "status": 500 } ],
    "focus": "数据库连接问题",
    "language": "zh"
  }'
# => {"summary":"...","root_cause":"...","suggestions":["..."],"severity":"high"}
```

### 9. 基于分析继续提问（followup）

```bash
curl -X POST http://localhost:8000/api/analysis/followup \
  -H "Content-Type: application/json" \
  -d '{
    "index": "nginx-access",
    "history": [ {"role": "user", "content": "..."}, {"role": "assistant", "content": "..."} ],
    "question": "这个错误一般是什么原因导致的？",
    "language": "zh"
  }'
```

> 若返回 `{"detail":"Not Found"}`：说明请求打到的是**旧进程**（未加载 followup 路由）。
> 解决：结束旧进程并重启后端，或换新端口启动并同步前端 `VITE_API_BASE`。

### 10. 流式 AI 分析（SSE）

```bash
curl -N -X POST http://localhost:8000/api/analysis/stream \
  -H "Content-Type: application/json" \
  -d '{"index":"nginx-access","hits":[{"message":"..."}]}'
```

## 前端使用指南

1. **选择索引**：顶部下拉选择系统索引（自动探测，带文档数/存储量）
2. **查询方式**：
   - 自然语言：直接输入中文/英文描述，回车生成 DSL
   - DSL 模式：切换到 DSL 标签，手写/编辑 ES 查询
3. **筛选**：左侧快捷时间范围、时间字段自动识别；中间可输入起止时间（自动取交集）
4. **关键字/字段过滤**：输入关键字全文检索，添加字段过滤条件（支持精确匹配）
5. **结果区**：
   - 点击「列设置」可显隐列（持久化到本地）
   - 命中关键字自动黄色高亮
   - 默认展示首批 100 条结果；滚动仅浏览当前结果，不会自动重新生成 DSL
6. **AI 分析**：点击「分析」基于当前结果生成归纳与建议；「基于分析继续提问」可追问

## 常见问题

**Q1：报 `{"detail":"Not Found"}`**
多为端口上运行的是旧进程。结束旧进程重启，或用新端口（如 8002）启动并改前端 `VITE_API_BASE`。

**Q2：端口被占用**
- Windows：`netstat -ano | findstr :8000` 找到 PID，`taskkill /F /PID <PID>`
- Linux/macOS：`lsof -i :8000` 或 `kill $(lsof -t -i:8000)`

**Q3：查询返回 400 `max_result_window` 超限**
`from + size` 超过 ES 索引的 `index.max_result_window`（默认 10000）。改用分页（from 递增、size 固定），或调大 ES 侧该参数。

**Q4：AI 查询/分析没反应**
确认 `.env` 已配置 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`，且网络能访问该网关；看后端日志有无报错。

**Q5：修改 `frontend/.env` 不生效**
Vite 只在启动时读取 `.env`，改完必须重启 `npm run dev`。

## 安全说明

- 所有查询经 `es_gateway.validate_dsl` 白名单校验，仅执行只读 `search`
- 拒绝 `delete_by_query` / `update` / `bulk` 等写操作，以及 `script`、`runtime_mappings`、`script_fields`、父子关系查询等高风险 DSL
- 默认 size 上限 `ES_MAX_SIZE`（1000），聚合嵌套 ≤ 3 层、每层最多 100 个聚合，terms/composite 等 bucket size ≤ 1000
- 未引入登录鉴权，适用于内网/单机；如需暴露公网，请自行增加鉴权层（项目已预留扩展点）
- 生产环境请将 `CORS_ORIGINS` 设置为实际前端域名，不要使用 `*`
- Elasticsearch 建议使用 HTTPS 和最小权限的只读账号
- 不要把 API Key、密码、真实日志或包含个人信息的样本提交到仓库

更多漏洞报告和部署安全基线请参阅 [SECURITY.md](SECURITY.md)。

## 开发与贡献

```bash
# 后端
cd backend
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
pytest

# 前端
cd ../frontend
npm ci
npm run check
npm run build
```

欢迎提交 Issue 和 Pull Request。请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)、[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) 和 [SECURITY.md](SECURITY.md)。

## 许可证

本项目采用 [MIT License](LICENSE) 开源。Elasticsearch、OpenAI 兼容模型服务以及前端/后端依赖分别遵循其各自的许可证；本项目不代表 Elastic、OpenAI 或任何模型供应商。

维护者：[@softlg](https://github.com/softlg)
