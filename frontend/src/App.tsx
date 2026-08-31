import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity, AlertCircle, Plus, X, Settings } from "lucide-react";
import IndexSelector from "./components/IndexSelector";
import FilterBar, { FilterState } from "./components/FilterBar";
import NlInput from "./components/NlInput";
import DslPanel from "./components/DslPanel";
import ResultTable from "./components/ResultTable";
import ResultFilterBar, {
  ResultFilterState,
  DEFAULT_RESULT_FILTER,
} from "./components/ResultFilterBar";
import AnalysisPanel from "./components/AnalysisPanel";
import { runQuery } from "./api/client";
import type { QueryResult } from "./types";

const MIN_WIDTH = 280;
const LS_KEY = "ai-es-layout";
const DEFAULT_QUERY_SIZE = 100;

/**
 * 将 datetime-local 的本地时间字符串（如 "2026-08-14T10:00"）转成带时区的
 * UTC ISO 字符串（如 "2026-08-14T02:00:00.000Z"），与 ES date 字段（UTC）对齐。
 * 空值或非法值返回 undefined，让后端忽略该边界。
 */
function toUtcIso(local: string | undefined): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

/**
 * 合并"左侧全局过滤"与"中栏结果筛选"两处时间范围，取交集避免冲突：
 * - from 取两侧中较晚者（较大值）
 * - to   取两侧中较早者（较小值）
 * 仅一侧填写时直接使用该侧；都为空时返回 {from:undefined,to:undefined}。
 * 若两侧范围逻辑矛盾（from>to），则退化回单侧重叠判断，避免查不到。
 */
function mergeTimeRange(
  a: { from?: string; to?: string },
  b: { from?: string; to?: string },
): { from?: string; to?: string } {
  const parse = (s?: string) => {
    const iso = toUtcIso(s);
    return iso ? new Date(iso).getTime() : undefined;
  };
  const af = parse(a.from);
  const at = parse(a.to);
  const bf = parse(b.from);
  const bt = parse(b.to);

  let from: number | undefined;
  let to: number | undefined;

  // from：取较大（更晚）
  if (af != null && bf != null) from = Math.max(af, bf);
  else from = af ?? bf;

  // to：取较小（更早）
  if (at != null && bt != null) to = Math.min(at, bt);
  else to = at ?? bt;

  // 防止矛盾区间（from 晚于 to）导致查不到：退化为较宽松的一侧
  if (from != null && to != null && from > to) {
    from = Math.min(af ?? Infinity, bf ?? Infinity);
    to = Math.max(at ?? -Infinity, bt ?? -Infinity);
  }

  return {
    from: from != null ? new Date(from).toISOString() : undefined,
    to: to != null ? new Date(to).toISOString() : undefined,
  };
}

interface TabState {
  id: string;
  index: string;
  name: string;
  filters: FilterState;
  resultFilters: ResultFilterState;
  result: QueryResult | null;
  loading: boolean;
  error: string;
  liveOn: boolean;
  lastPayload: Record<string, any>;
}

let tabSeq = 0;
const makeTab = (): TabState => {
  tabSeq += 1;
  return {
    id: `tab-${Date.now()}-${tabSeq}`,
    index: "",
    name: "",
    filters: { from: "", to: "", keyword: "", exact: false },
    resultFilters: DEFAULT_RESULT_FILTER,
    result: null,
    loading: false,
    error: "",
    liveOn: false,
    lastPayload: {},
  };
};

export default function App() {
  const { t, i18n } = useTranslation();
  const [tabs, setTabs] = useState<TabState[]>(() => [makeTab()]);
  const [activeId, setActiveId] = useState<string>(() => tabs[0].id);

  const activeTab = tabs.find((tb) => tb.id === activeId) ?? tabs[0];
  const updateActive = (patch: Partial<TabState>) =>
    setTabs((prev) => prev.map((tb) => (tb.id === activeId ? { ...tb, ...patch } : tb)));
  const updateTab = (id: string, patch: Partial<TabState>) =>
    setTabs((prev) => prev.map((tb) => (tb.id === id ? { ...tb, ...patch } : tb)));

  // 实时日志轮询（绑定当前激活页）
  const liveTimer = useRef<number | null>(null);
  const LIVE_INTERVAL = 3000;

  // 面板放大（全局全屏展示）：null=正常三栏，"center"=中栏，"right"=右栏，"nl"=自然语言框
  const [expandedPanel, setExpandedPanel] = useState<null | "center" | "right">(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [colWidths, setColWidths] = useState<number[]>(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(LS_KEY) : null;
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 3) return parsed;
      } catch {}
    }
    return [320, 0, 340];
  });
  const [dragging, setDragging] = useState<number | null>(null);

  const lang = i18n.language;
  const toggleLang = () => i18n.changeLanguage(lang === "zh" ? "en" : "zh");

  // 主题（背景颜色）：system / dark / light
  const [theme, setTheme] = useState<"system" | "dark" | "light">(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("ai-es-theme") : null;
    return saved === "dark" || saved === "light" || saved === "system" ? saved : "dark";
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === "undefined" ? true : window.matchMedia("(min-width: 1024px)").matches,
  );

  // 只挂载当前断点对应的布局，避免桌面/移动两套结果表同时占用内存。
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktop(media.matches);
    onChange();
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, []);

  const applyTheme = (th: "system" | "dark" | "light") => {
    const el = document.documentElement;
    if (th === "system") el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", th);
    window.localStorage.setItem("ai-es-theme", th);
  };

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(LS_KEY, JSON.stringify(colWidths));
  }, [colWidths]);

  // 选择索引后清除旧的报错提示
  useEffect(() => {
    if (activeTab.index && activeTab.error) updateActive({ error: "" });
  }, [activeTab.index]);

  // 实时日志：轮询当前激活页索引的最新日志
  const stopLive = () => {
    if (liveTimer.current !== null) {
      clearInterval(liveTimer.current);
      liveTimer.current = null;
    }
    if (activeTab.liveOn) updateActive({ liveOn: false });
  };

  const startLive = () => {
    if (!activeTab.index) {
      updateActive({ error: t("index.placeholder") });
      return;
    }
    updateActive({ liveOn: true });
    const fetchOnce = async () => {
      try {
        const data = await runQuery({
          index: activeTab.index,
          language: i18n.language,
          time_range: mergeTimeRange(activeTab.filters, activeTab.resultFilters),
          dsl: { query: { match_all: {} }, size: DEFAULT_QUERY_SIZE },
        });
        updateActive({ result: { ...data, from_user_dsl: false, has_more: false } });
      } catch (e) {
        /* 轮询中的瞬时错误忽略 */
      }
    };
    fetchOnce();
    liveTimer.current = window.setInterval(fetchOnce, LIVE_INTERVAL);
  };

  const toggleLive = () => (activeTab.liveOn ? stopLive() : startLive());

  useEffect(() => {
    return () => {
      if (liveTimer.current !== null) clearInterval(liveTimer.current);
    };
  }, []);

  // 由结果过滤条件拼出用于"命中高亮"的检索词（与后端 multi_match 语义一致：非精确项做分词高亮）
  const buildKeywordParts = (rf: ResultFilterState): string[] => {
    const parts: string[] = [];
    if (rf.message && !rf.messageExact) parts.push(rf.message);
    if (rf.level && !rf.levelExact) parts.push(rf.level);
    for (const ex of rf.extras) {
      if (ex.field && ex.value && !ex.exact) parts.push(ex.value);
    }
    return parts;
  };

  const doQuery = async (payload: Record<string, any>, fromUser = false) => {
    if (!activeTab.index) {
      updateActive({ error: t("index.placeholder") });
      return;
    }
    stopLive();
    updateActive({ loading: true, error: "" });
    if (payload && (payload.natural_language || payload.dsl)) {
      updateActive({ lastPayload: payload });
    }

    const rf = activeTab.resultFilters;
    const keywordParts: string[] = buildKeywordParts(rf);
    const filterConds: { field: string; value: string; op: string }[] = [];

    if (rf.message) {
      if (rf.messageExact) filterConds.push({ field: rf.messageExactField || "message", value: rf.message, op: "term" });
      else keywordParts.push(rf.message);
    }
    if (rf.level) {
      if (rf.levelExact) filterConds.push({ field: rf.levelExactField || "level", value: rf.level, op: "term" });
      else keywordParts.push(rf.level);
    }
    for (const ex of rf.extras) {
      if (!ex.field || !ex.value) continue;
      filterConds.push({ field: ex.field, value: ex.value, op: ex.exact ? "term" : "match" });
    }

    try {
      // 始终注入当前 Tab 的时间范围/关键字/结果过滤，且把本地时间转成 UTC，
      // 避免被 payload 覆盖；用户的 dsl / natural_language 仍从 payload 取。
      const time_range = mergeTimeRange(activeTab.filters, activeTab.resultFilters);
      const data = await runQuery({
        index: activeTab.index,
        language: i18n.language,
        dsl: payload.dsl,
        natural_language: payload.natural_language,
        time_range,
        keyword: activeTab.filters.keyword || keywordParts.join(" ") || undefined,
        keyword_exact: activeTab.filters.exact || undefined,
        filters: filterConds.length ? filterConds : undefined,
        size: DEFAULT_QUERY_SIZE,
        from: 0,
      });
      updateActive({
        result: {
          ...data,
          from_user_dsl: fromUser,
          // 页面滚动只滚动当前 100 条结果，不再触发下一次查询。
          has_more: false,
        },
      });
    } catch (e: any) {
      updateActive({ error: e?.response?.data?.detail || e.message || "query failed" });
      console.error(e);
    } finally {
      updateActive({ loading: false });
    }
  };

  // 仅用关键字直接全文检索：若已存在自然语言/DSL 查询意图则沿用，否则以 match_all 为基底由后端叠加 keyword 过滤
  const searchByKeyword = () => {
    if (!activeTab.filters.keyword.trim()) return;
    stopLive();
    if (activeTab.lastPayload && (activeTab.lastPayload.natural_language || activeTab.lastPayload.dsl)) {
      doQuery(activeTab.lastPayload);
    } else {
      doQuery({ dsl: { query: { match_all: {} } } });
    }
  };

  const startDrag = (idx: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(idx);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    if (dragging === null) return;
    const onMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const total = rect.width;
      const left = rect.left;
      const ratio = Math.min(Math.max((e.clientX - left) / total, 0), 1);

      setColWidths((prev) => {
        const next = [...prev];
        if (dragging === 0) {
          const leftW = Math.max(MIN_WIDTH, Math.min(Math.round(ratio * total), total - next[2] - MIN_WIDTH));
          next[0] = leftW;
          next[1] = 0;
        } else if (dragging === 1) {
          const rightW = Math.max(
            MIN_WIDTH,
            Math.min(rect.right - e.clientX, total - next[0] - MIN_WIDTH)
          );
          next[2] = rightW;
          next[1] = 0;
        }
        return next;
      });
    };
    const onUp = () => {
      setDragging(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  const gridStyle = {
    gridTemplateColumns: `${colWidths[0]}px 6px 1fr 6px ${colWidths[2]}px`,
  };

  // 页面切换 / 新建 / 关闭
  const newTab = () => {
    const tab = makeTab();
    setTabs((prev) => [...prev, tab]);
    stopLive();
    setActiveId(tab.id);
  };
  const switchTab = (id: string) => {
    if (id === activeId) return;
    stopLive();
    setActiveId(id);
  };
  const closeTab = (id: string) => {
    if (tabs.length <= 1) {
      updateActive({ error: t("tabs.closeLast") });
      return;
    }
    if (id === activeId) stopLive();
    setTabs((prev) => {
      const idx = prev.findIndex((tb) => tb.id === id);
      const next = prev.filter((tb) => tb.id !== id);
      if (id === activeId) setActiveId(next[Math.min(idx, next.length - 1)].id);
      return next;
    });
  };

  // 页面重命名（双击 / 右键触发）
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const startEdit = (id: string) => {
    const tb = tabs.find((t) => t.id === id);
    if (!tb) return;
    setEditingId(id);
    setEditText(tb.name || tb.index || "");
  };
  const commitEdit = () => {
    if (editingId) {
      const v = editText.trim();
      updateTab(editingId, { name: v });
    }
    setEditingId(null);
  };

  return (
    <div className="h-screen overflow-hidden flex flex-col">
      {/* 顶部导航 + 页面标签栏 */}
      <header className="fixed top-0 inset-x-0 z-20 glass border-b border-surface/10">
        <div className="px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-brand-blue flex items-center justify-center">
              <Activity className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-txt-primary leading-tight">{t("app.title")}</h1>
              <p className="text-xs text-txt-muted">{t("app.subtitle")}</p>
            </div>
          </div>
          <div className="relative flex items-center gap-2">
            <button
              onClick={() => setSettingsOpen((v) => !v)}
              title={t("settings.title")}
              className="flex items-center justify-center p-2 rounded-lg bg-surface/5 hover:bg-surface/10 text-txt-muted hover:text-txt-primary transition cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>
            {settingsOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setSettingsOpen(false)}
                />
                <div className="absolute right-0 top-11 z-40 w-56 glass rounded-xl p-3 flex flex-col gap-3 animate-fade-in">
                  <div>
                    <p className="text-xs text-txt-muted mb-1.5">{t("settings.language")}</p>
                    <div className="flex gap-1">
                      {(["zh", "en"] as const).map((l) => (
                        <button
                          key={l}
                          onClick={() => i18n.changeLanguage(l)}
                          className={`flex-1 px-2 py-1.5 rounded-lg text-sm transition cursor-pointer ${
                            lang === l
                              ? "bg-brand-blue/15 text-txt-primary"
                              : "bg-surface/5 hover:bg-surface/10 text-txt-muted"
                          }`}
                        >
                          {l === "zh" ? "中文" : "EN"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-txt-muted mb-1.5">{t("settings.theme")}</p>
                    <div className="flex flex-col gap-1">
                      {(["system", "dark", "light"] as const).map((th) => (
                        <button
                          key={th}
                          onClick={() => setTheme(th)}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition cursor-pointer ${
                            theme === th
                              ? "bg-brand-blue/15 text-txt-primary"
                              : "bg-surface/5 hover:bg-surface/10 text-txt-muted"
                          }`}
                        >
                          <span
                            className={`w-3 h-3 rounded-full border ${
                              th === "dark"
                                ? "bg-bg-900 border-surface/30"
                                : th === "light"
                                ? "bg-bg-800 border-surface/30"
                                : "bg-gradient-to-br from-bg-900 to-bg-800 border-surface/30"
                            }`}
                          />
                          {th === "system"
                            ? t("settings.themeSystem")
                            : th === "dark"
                            ? t("settings.themeDark")
                            : t("settings.themeLight")}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        {/* 页面标签栏 */}
        <div className="px-2 h-10 flex items-center gap-1 overflow-x-auto border-t border-surface/5">
          {tabs.map((tb) => {
            const isActive = tb.id === activeId;
            return (
              <div
                key={tb.id}
                onClick={() => editingId !== tb.id && switchTab(tb.id)}
                onDoubleClick={() => startEdit(tb.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  startEdit(tb.id);
                }}
                className={`group flex items-center gap-1.5 max-w-[200px] px-2 h-7 rounded-lg text-sm cursor-pointer transition shrink-0 border ${
                  isActive
                    ? "bg-brand-blue/15 border-brand-blue/40 text-txt-primary"
                    : "bg-surface/5 border-transparent text-txt-muted hover:text-txt-primary hover:bg-surface/10"
                }`}
                title={t("tabs.dblEdit")}
              >
                {editingId === tb.id ? (
                  <input
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      else if (e.key === "Escape") setEditingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    placeholder={tb.index || t("tabs.untitled")}
                    className="flex-1 min-w-0 bg-bg-800/80 border border-brand-blue/60 rounded px-1.5 py-0.5 text-sm text-txt-primary outline-none"
                  />
                ) : (
                  <span className="truncate">{tb.name || tb.index || t("tabs.untitled")}</span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tb.id);
                  }}
                  title={t("tabs.close")}
                  className="flex items-center justify-center w-4 h-4 rounded hover:bg-surface/15 text-txt-muted hover:text-danger transition cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
          <button
            onClick={newTab}
            title={t("tabs.new")}
            className="flex items-center justify-center w-7 h-7 rounded-lg bg-surface/5 hover:bg-surface/10 text-txt-muted hover:text-txt-primary transition cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 三栏主内容 */}
      {isDesktop && <main
        ref={containerRef}
        className="pt-[110px] pb-2 px-2 flex-1 min-h-0 hidden lg:grid gap-0 overflow-hidden"
        style={gridStyle}
      >
        {/* 左栏：索引 + 过滤 + 自然语言 + DSL */}
        <section className={`flex flex-col gap-3 h-full min-w-0 ${expandedPanel ? "hidden" : ""}`}>
          <div className="glass rounded-2xl p-4 flex flex-col gap-4 shrink-0 relative z-40">
            <IndexSelector
              value={activeTab.index}
              onChange={(v) => updateActive({ index: v })}
            />
            <FilterBar
              value={activeTab.filters}
              onChange={(v) => updateActive({ filters: v })}
              onSearch={searchByKeyword}
              loading={activeTab.loading}
            />
          </div>
          <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
            <NlInput
              onRun={(text) => doQuery({ natural_language: text })}
              loading={activeTab.loading}
            />
            <div className="flex-1 min-h-0 overflow-auto">
              <DslPanel
                dsl={activeTab.result?.executed_dsl ?? null}
                explanation={activeTab.result?.dsl_explanation}
                fromUser={activeTab.result?.from_user_dsl}
                onExecute={(dsl) => doQuery({ dsl }, true)}
                executing={activeTab.loading}
              />
            </div>
          </div>
        </section>

        {/* 分隔条 1 */}
        <div
          onMouseDown={startDrag(0)}
          className={`relative group flex items-center justify-center ${dragging === 0 ? "bg-brand-blue/40" : "bg-surface/5 hover:bg-surface/10"} ${expandedPanel ? "hidden" : ""}`}
        >
          <div className="h-10 w-1 rounded-full bg-txt-muted/30 group-hover:bg-brand-blue transition" />
        </div>

        {/* 中栏：筛选 + 结果 */}
        <section
          className={`flex flex-col gap-3 h-full min-w-0 min-h-0 ${
            expandedPanel === "center"
              ? "fixed inset-0 z-50 px-2 pb-2 pt-2 bg-bg-900"
              : expandedPanel === "right"
              ? "hidden"
              : "relative"
          }`}
        >
          <ResultFilterBar
            value={activeTab.resultFilters}
            onChange={(v) => updateActive({ resultFilters: v })}
            onApply={() => {
              const p = activeTab.lastPayload;
              if (p && (p.natural_language || p.dsl)) doQuery(p);
            }}
            live={activeTab.liveOn}
            onToggleLive={toggleLive}
            hasIndex={!!activeTab.index}
            expanded={expandedPanel === "center"}
            onToggleExpand={() => setExpandedPanel(expandedPanel === "center" ? null : "center")}
          />
          {activeTab.error && (
            <div className="glass rounded-2xl p-3 flex items-center gap-2 text-danger text-sm bg-danger/10 border border-danger/30 shrink-0">
              <AlertCircle className="w-4 h-4" /> {activeTab.error}
            </div>
          )}
          <div className="min-h-0 glass rounded-2xl overflow-hidden flex-1">
            <ResultTable
              result={activeTab.result}
              highlightKeyword={[activeTab.filters.keyword, ...buildKeywordParts(activeTab.resultFilters)].filter(Boolean).join(" ")}
              hasMore={false}
            />
          </div>
        </section>

        {/* 分隔条 2 */}
        <div
          onMouseDown={startDrag(1)}
          className={`relative group flex items-center justify-center ${dragging === 1 ? "bg-brand-blue/40" : "bg-surface/5 hover:bg-surface/10"} ${expandedPanel ? "hidden" : ""}`}
        >
          <div className="h-10 w-1 rounded-full bg-txt-muted/30 group-hover:bg-brand-blue transition" />
        </div>

        {/* 右栏：AI 分析 */}
        <section
          className={`h-full min-w-0 glass rounded-2xl overflow-hidden ${
            expandedPanel === "right"
              ? "fixed inset-0 z-50 px-2 pb-2 pt-2 rounded-none bg-bg-900 border-0"
              : expandedPanel === "center"
              ? "hidden"
              : "relative"
          }`}
        >
          <AnalysisPanel
            result={activeTab.result}
            expanded={expandedPanel === "right"}
            onToggleExpand={() => setExpandedPanel(expandedPanel === "right" ? null : "right")}
          />
        </section>
      </main>}

      {/* 窄屏回退 */}
      {!isDesktop && <main className="pt-[110px] px-4 py-4 flex-1 min-h-0 overflow-y-auto flex flex-col gap-4">
        <div className="glass rounded-2xl p-4 flex flex-col gap-4">
          <IndexSelector value={activeTab.index} onChange={(v) => updateActive({ index: v })} />
          <FilterBar
            value={activeTab.filters}
            onChange={(v) => updateActive({ filters: v })}
            onSearch={searchByKeyword}
            loading={activeTab.loading}
          />
        </div>
        <NlInput onRun={(text) => doQuery({ natural_language: text })} loading={activeTab.loading} />
        <DslPanel
          dsl={activeTab.result?.executed_dsl ?? null}
          explanation={activeTab.result?.dsl_explanation}
          fromUser={activeTab.result?.from_user_dsl}
          onExecute={(dsl) => doQuery({ dsl }, true)}
          executing={activeTab.loading}
        />
        {activeTab.error && (
          <div className="glass rounded-2xl p-3 flex items-center gap-2 text-danger text-sm bg-danger/10 border border-danger/30">
            <AlertCircle className="w-4 h-4" /> {activeTab.error}
          </div>
        )}
        <ResultFilterBar
          value={activeTab.resultFilters}
          onChange={(v) => updateActive({ resultFilters: v })}
          onApply={() => {
            const p = activeTab.lastPayload;
            if (p && (p.natural_language || p.dsl)) doQuery(p);
          }}
          live={activeTab.liveOn}
          hasIndex={!!activeTab.index}
          onToggleLive={toggleLive}
        />
        <div className="glass rounded-2xl flex-1 min-h-[400px]">
          <ResultTable
            result={activeTab.result}
            highlightKeyword={[activeTab.filters.keyword, ...buildKeywordParts(activeTab.resultFilters)].filter(Boolean).join(" ")}
            hasMore={false}
          />
        </div>
        <div className="glass rounded-2xl min-h-[300px]">
          <AnalysisPanel result={activeTab.result} />
        </div>
      </main>}

      <footer className="h-8 flex items-center justify-center text-xs text-txt-muted">
        {t("footer.tagline")}
      </footer>
    </div>
  );
}
