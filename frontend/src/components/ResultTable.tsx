import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Table2, Braces, X, ChevronRight, SlidersHorizontal, Check } from "lucide-react";
import type { QueryResult } from "../types";

const CORE_FIELDS = ["@timestamp", "timestamp", "time", "level", "loglevel", "severity", "message", "msg", "log"];

const TIME_FIELDS = new Set(["@timestamp", "timestamp", "time"]);

/**
 * 把检索词（可能含空格）拆成多个关键字，在单元格文本中做大小写不敏感高亮。
 * 返回 React 片段，命中处用 <mark> 包裹。
 */
function highlightText(text: string, terms: string[]): React.ReactNode {
  if (!terms.length || !text) return text;
  // 用正则为所有词构建不区分大小写的全局匹配
  const escaped = terms
    .filter((t) => t.trim().length > 0)
    .map((t) => t.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!escaped.length) return text;
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(re);
  const termRes = escaped.map((e) => new RegExp(`^${e}$`, "i"));
  return parts.map((part, i) =>
    escaped.length && termRes.some((tr) => tr.test(part)) ? (
      <mark key={i} className="bg-yellow-400/70 text-black rounded-[2px] px-0.5">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export default function ResultTable({
  result,
  highlightKeyword = "",
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}: {
  result: QueryResult | null;
  highlightKeyword?: string;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  const { t } = useTranslation();
  const [view, setView] = useState<"table" | "json">("table");
  const [detail, setDetail] = useState<Record<string, any> | null>(null);
  const [colMenu, setColMenu] = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);

  const hits = result?.hits ?? [];

  // 计算当前结果的所有可用列（并集）
  const columns = useMemo(() => {
    return Array.from(new Set(hits.flatMap((h) => Object.keys(h))));
  }, [hits]);

  // 默认展示列：核心字段优先，其余补全（最多 12 列）
  const defaultCols = useMemo(() => {
    const preferred = CORE_FIELDS.filter((c) => columns.includes(c));
    const rest = columns.filter((c) => !CORE_FIELDS.includes(c));
    return [...preferred, ...rest].slice(0, 12);
  }, [columns]);

  // 用户可配置显示列（持久化在 localStorage），为空时使用默认
  const [selectedCols, setSelectedCols] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("ai-es-cols");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 当结果列变化且用户未自定义时，回落到默认
  useEffect(() => {
    if (selectedCols.length === 0) return;
    const valid = selectedCols.filter((c) => columns.includes(c));
    if (valid.length === 0) setSelectedCols([]);
  }, [columns, selectedCols]);

  const displayCols = useMemo(() => {
    if (selectedCols.length > 0) {
      // 保持 columns 中出现的顺序，并补上核心字段（若用户未移除）
      const ordered = columns.filter((c) => selectedCols.includes(c));
      return ordered;
    }
    return defaultCols;
  }, [selectedCols, columns, defaultCols]);

  const toggleCol = (c: string) => {
    setSelectedCols((prev) => {
      const next = prev.length === 0 ? [...defaultCols] : [...prev];
      const idx = next.indexOf(c);
      if (idx >= 0) {
        if (next.length === 1) return prev; // 至少保留一列
        next.splice(idx, 1);
      } else {
        next.push(c);
      }
      localStorage.setItem("ai-es-cols", JSON.stringify(next));
      return next;
    });
  };

  const resetCols = () => {
    setSelectedCols([]);
    localStorage.removeItem("ai-es-cols");
  };

  // 高亮检索词：拆分为多词，大小写不敏感
  const terms = useMemo(() => highlightKeyword.split(/\s+/).filter(Boolean), [highlightKeyword]);

  const formatBeijing = (raw: string) => {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  };

  const renderCell = (h: Record<string, any>, c: string) => {
    const v = h[c];
    if (v == null) return "";
    let s: string;
    if (typeof v === "object") s = JSON.stringify(v);
    else s = String(v);
    if (TIME_FIELDS.has(c)) return formatBeijing(s);
    return highlightText(s, terms);
  };

  // 底部自定义横向滚动条
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startLeftRef = useRef(0);
  const [metrics, setMetrics] = useState({ ratio: 1, left: 0 });

  const updateMetrics = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      // 值未变化时返回旧 state，避免死循环
      setMetrics((prev) => (prev.ratio === 1 && prev.left === 0 ? prev : { ratio: 1, left: 0 }));
      return;
    }
    const ratio = el.scrollWidth > 0 ? el.clientWidth / el.scrollWidth : 1;
    const left = el.scrollWidth > 0 ? el.scrollLeft / el.scrollWidth : 0;
    setMetrics((prev) => (prev.ratio === ratio && prev.left === left ? prev : { ratio, left }));
    // 触底自动加载下一批：距底部小于 80px 时触发
    if (hasMore && !loadingMore && onLoadMore) {
      const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceToBottom < 80) onLoadMore();
    }
  }, [hasMore, loadingMore, onLoadMore]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateMetrics);
    const ro = new ResizeObserver(updateMetrics);
    ro.observe(el);
    updateMetrics();
    return () => {
      el.removeEventListener("scroll", updateMetrics);
      ro.disconnect();
    };
  }, [updateMetrics]);

  useEffect(() => {
    updateMetrics();
  }, [displayCols, view, updateMetrics]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) setColMenu(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const onThumbDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    startXRef.current = e.clientX;
    startLeftRef.current = scrollRef.current?.scrollLeft ?? 0;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onThumbMove = (e: React.PointerEvent) => {
    if (!draggingRef.current || !scrollRef.current) return;
    const el = scrollRef.current;
    const ratioTrack = el.clientWidth / el.scrollWidth || 1;
    el.scrollLeft = startLeftRef.current + (e.clientX - startXRef.current) / ratioTrack;
  };
  const onThumbUp = () => {
    draggingRef.current = false;
  };
  const onTrackClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return; // 点在 thumb 上不处理
    const el = scrollRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const r = track.getBoundingClientRect();
    const clickRatio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    el.scrollLeft = clickRatio * (el.scrollWidth - el.clientWidth);
  };

  // 所有 hook 之后再做条件返回，遵守 Rules of Hooks
  return (
    <div className="glass rounded-2xl p-4 animate-fade-in flex flex-col min-h-0 h-full">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold tracking-tight text-txt-primary">{t("result.title")}</h3>
          <span className="text-xs text-txt-muted">{t("result.total", { n: result?.total ?? 0 })}</span>
          <span className="text-xs text-txt-muted">· {t("result.took", { ms: result?.took_ms ?? 0 })}</span>
        </div>
        <div className="flex items-center gap-1">
          {/* 列配置 */}
          <div className="relative" ref={colMenuRef}>
            <button
              onClick={() => setColMenu((v) => !v)}
              className={`px-2.5 py-1 rounded-md text-xs flex items-center gap-1 transition cursor-pointer ${
                colMenu ? "bg-brand-blue text-white" : "text-txt-muted hover:text-txt-primary"
              }`}
              title={t("result.columns")}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" /> {t("result.columns")}
            </button>
            {colMenu && (
              <div className="absolute right-0 z-50 mt-1 w-56 max-h-72 overflow-auto rounded-xl border border-surface/10 bg-bg-800/95 backdrop-blur shadow-xl p-1">
                <div className="flex items-center justify-between px-2 py-1.5 border-b border-surface/5">
                  <span className="text-xs text-txt-muted">{t("result.columnsCount", { n: displayCols.length })}</span>
                  <button
                    onClick={resetCols}
                    className="text-xs text-brand-blue hover:underline cursor-pointer"
                  >
                    {t("result.columnsReset")}
                  </button>
                </div>
                {columns.length === 0 ? (
                  <div className="px-2 py-3 text-xs text-txt-muted">{t("result.columnsEmpty")}</div>
                ) : (
                  columns.map((c) => {
                    const checked = displayCols.includes(c);
                    return (
                      <button
                        key={c}
                        onClick={() => toggleCol(c)}
                        className="w-full text-left px-2 py-1.5 text-xs flex items-center gap-2 rounded hover:bg-surface/5 transition cursor-pointer"
                      >
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            checked ? "bg-brand-blue border-brand-blue" : "border-surface/30"
                          }`}
                        >
                          {checked && <Check className="w-3 h-3 text-white" />}
                        </span>
                        <span className="text-txt-primary break-all">{c}</span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
          <div className="flex gap-1 bg-surface/5 rounded-lg p-0.5">
            <button
              onClick={() => setView("table")}
              className={`px-3 py-1 rounded-md text-xs flex items-center gap-1 transition cursor-pointer ${
                view === "table" ? "bg-brand-blue text-white" : "text-txt-muted hover:text-txt-primary"
              }`}
            >
              <Table2 className="w-3.5 h-3.5" /> {t("result.table")}
            </button>
            <button
              onClick={() => setView("json")}
              className={`px-3 py-1 rounded-md text-xs flex items-center gap-1 transition cursor-pointer ${
                view === "json" ? "bg-brand-blue text-white" : "text-txt-muted hover:text-txt-primary"
              }`}
            >
              <Braces className="w-3.5 h-3.5" /> {t("result.json")}
            </button>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="overflow-y-auto overflow-x-hidden flex-1 min-h-0">
        {!result ? (
          <div className="h-full flex items-center justify-center text-txt-muted text-sm">
            {t("result.placeholder")}
          </div>
        ) : hits.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-txt-muted text-sm gap-1">
            <span>{t("result.empty")}</span>
            <span className="text-xs">{t("result.emptyHint")}</span>
          </div>
        ) : view === "table" ? (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-bg-800/95 backdrop-blur z-10">
              <tr>
                {displayCols.map((c) => (
                  <th
                    key={c}
                    className="text-left px-3 py-2 text-txt-muted text-[11px] font-semibold tracking-wide uppercase border-b border-surface/10 whitespace-nowrap"
                  >
                    {c}
                  </th>
                ))}
                <th className="w-8 border-b border-surface/10" />
              </tr>
            </thead>
            <tbody>
              {hits.map((h, i) => (
                <tr
                  key={i}
                  onClick={() => setDetail(h)}
                  className="hover:bg-surface/5 transition cursor-pointer group"
                >
                  {displayCols.map((c) => (
                    <td
                      key={c}
                      className="px-3 py-2 border-b border-surface/5 text-txt-primary max-w-[320px] truncate"
                      title={h[c] == null ? "" : typeof h[c] === "object" ? JSON.stringify(h[c]) : String(h[c])}
                    >
                      {renderCell(h, c)}
                    </td>
                  ))}
                  <td className="px-2 border-b border-surface/5 text-txt-muted group-hover:text-brand-blue">
                    <ChevronRight className="w-4 h-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <pre className="text-xs text-txt-primary whitespace-pre-wrap">
            {JSON.stringify(
              hits,
              (k, v) => (TIME_FIELDS.has(k) && typeof v === "string" ? formatBeijing(v) : v),
              2,
            )}
          </pre>
        )}

        {/* 底部加载更多提示 */}
        {hasMore && (
          <div className="py-3 text-center text-xs text-txt-muted">
            {loadingMore ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-t-transparent border-brand-blue rounded-full animate-spin" />
                {t("result.loadingMore")}
              </span>
            ) : (
              <button
                onClick={onLoadMore}
                className="text-brand-blue hover:underline cursor-pointer"
              >
                {t("result.loadMore")}
              </button>
            )}
          </div>
        )}
        {!hasMore && hits.length > 0 && (
          <div className="py-3 text-center text-xs text-txt-muted/60">{t("result.noMore")}</div>
        )}
      </div>

      {metrics.ratio < 0.999 && (
        <div
          ref={trackRef}
          onClick={onTrackClick}
          title={t("result.hScroll")}
          className="relative h-2 mt-2 bg-surface/10 rounded-full cursor-pointer"
        >
          <div
            onPointerDown={onThumbDown}
            onPointerMove={onThumbMove}
            onPointerUp={onThumbUp}
            onPointerCancel={onThumbUp}
            className="absolute top-0 h-2 bg-brand-blue/70 rounded-full hover:bg-brand-blue cursor-grab active:cursor-grabbing"
            style={{
              left: `${metrics.left * 100}%`,
              width: `${Math.max(metrics.ratio, 0.05) * 100}%`,
            }}
          />
        </div>
      )}

      {/* 详情抽屉 */}
      {detail && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40"
          onClick={() => setDetail(null)}
        >
          <div
            className="h-full w-full max-w-lg bg-bg-800 border-l border-surface/10 shadow-xl overflow-auto p-5 animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold tracking-tight text-txt-primary">{t("result.detail.title")}</h3>
              <button
                onClick={() => setDetail(null)}
                className="text-txt-muted hover:text-txt-primary cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <pre className="text-xs text-txt-primary whitespace-pre-wrap break-all">
              {JSON.stringify(
                detail,
                (k, v) => (TIME_FIELDS.has(k) && typeof v === "string" ? formatBeijing(v) : v),
                2,
              )}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
