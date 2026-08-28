import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Database, CalendarDays, RefreshCw, Search } from "lucide-react";
import { fetchIndices } from "../api/client";
import type { IndexInfo } from "../types";

const MAX_VISIBLE = 200;

// 从索引名末尾提取日期（如 2026.07.15 / 2026-07-15 / 2026.07.15-000001）
const DATE_RE = /[-._](\d{4})[-.](\d{2})[-.](\d{2})(?:[-.]\d{6})?$/;

interface Parsed {
  idx: IndexInfo;
  base: string | null; // 日期前缀（含末尾分隔符）
  raw: string | null; // YYYY-MM-DD
  y: number;
  mo: number;
  d: number;
}

function parseDate(name: string): Parsed | { idx: IndexInfo; base: null; raw: null } {
  const m = name.match(DATE_RE);
  if (!m) return { idx: { name } as IndexInfo, base: null, raw: null };
  return {
    idx: { name } as IndexInfo,
    base: name.slice(0, (m.index ?? 0) + 1), // 保留分隔符
    raw: `${m[1]}-${m[2]}-${m[3]}`,
    y: +m[1],
    mo: +m[2],
    d: +m[3],
  };
}

function cmpDateDesc(a: Parsed, b: Parsed): number {
  if (a.y !== b.y) return b.y - a.y;
  if (a.mo !== b.mo) return b.mo - a.mo;
  return b.d - a.d;
}

type DisplayItem =
  | { all: true; base: string; value: string; count: number }
  | { all: false; idx: IndexInfo; date: string | null };

export default function IndexSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (idx: string) => void;
}) {
  const { t } = useTranslation();
  const [indices, setIndices] = useState<IndexInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchIndices();
      setIndices(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // 按日期倒序构建展示列表，并为每个前缀分组插入"全部日期"选项
  const displayList = useMemo<DisplayItem[]>(() => {
    const parsed = indices
      .map((idx) => parseDate(idx.name))
      .filter((p): p is Parsed => p.base !== null) as Parsed[];
    const noDate = indices.filter((idx) => parseDate(idx.name).base === null);

    parsed.sort(cmpDateDesc);

    const seen = new Set<string>();
    const out: DisplayItem[] = [];
    for (const p of parsed) {
      if (!seen.has(p.base!)) {
        seen.add(p.base!);
        const names = indices
          .filter((idx) => parseDate(idx.name).base === p.base)
          .map((idx) => idx.name)
          .join(",");
        out.push({ all: true, base: p.base!, value: names, count: names.split(",").length });
      }
      out.push({ all: false, idx: p.idx, date: p.raw });
    }
    // 无日期的索引用原名追加
    for (const idx of noDate) {
      out.push({ all: false, idx, date: null });
    }
    return out;
  }, [indices]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return displayList;
    return displayList.filter((item) => {
      if (item.all) {
        return (
          item.base.toLowerCase().includes(q) ||
          item.value.toLowerCase().includes(q)
        );
      }
      return item.idx.name.toLowerCase().includes(q);
    });
  }, [displayList, query]);

  const visible = filtered.slice(0, MAX_VISIBLE);

  const select = (val: string) => {
    onChange(val);
    setOpen(false);
    setQuery("");
    setHighlight(0);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, visible.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = visible[highlight];
      if (item) select(item.all ? item.value : item.idx.name);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const isSelected = (item: DisplayItem) =>
    item.all ? value === item.value : value === item.idx.name;

  return (
    <div className="flex items-center gap-2 w-full" ref={containerRef}>
      <Database className="w-4 h-4 text-brand-blue shrink-0" />
      <div className="relative w-full">
        <input
          ref={inputRef}
          value={open ? query : value}
          placeholder={t("index.searchPlaceholder")}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onKeyDown={onKeyDown}
          className="w-full bg-bg-800/80 border border-surface/10 rounded-lg pl-8 pr-3 py-2 text-sm text-txt-primary outline-none focus:border-brand-blue transition"
        />
        <Search className="w-4 h-4 text-txt-muted absolute left-2.5 top-2.5 pointer-events-none" />

        {open && (
          <div className="absolute z-50 left-0 right-0 mt-1 w-full min-w-[16rem] max-h-72 overflow-auto rounded-xl border border-surface/10 bg-bg-800/95 backdrop-blur shadow-xl">
            {visible.length === 0 ? (
              <div className="px-3 py-3 text-sm text-txt-muted">{t("index.noMatch")}</div>
            ) : (
              <>
                <div className="px-3 py-1.5 text-xs text-txt-muted border-b border-surface/5 sticky top-0 bg-bg-800/95">
                  {t("index.matched", { n: filtered.length })}
                  {filtered.length > MAX_VISIBLE ? ` (${MAX_VISIBLE})` : ""}
                </div>
                {visible.map((item, i) => (
                  <button
                    key={item.all ? `all:${item.base}` : item.idx.name}
                    onClick={() => select(item.all ? item.value : item.idx.name)}
                    onMouseEnter={() => setHighlight(i)}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 transition ${
                      i === highlight ? "bg-brand-blue/15" : "hover:bg-surface/5"
                    } ${item.all ? "bg-surface/[0.03]" : ""}`}
                  >
                    {item.all ? (
                      <span className="flex items-center gap-2 text-txt-primary">
                        <CalendarDays className="w-4 h-4 text-brand-blue shrink-0" />
                        <span className="font-medium">{item.base}…</span>
                        <span className="text-xs text-txt-muted">
                          {t("index.allDates", { n: item.count })}
                        </span>
                      </span>
                    ) : (
                      <span className="text-txt-primary break-all flex items-center gap-2">
                        {item.date && (
                          <span className="text-xs text-brand-blue/80 shrink-0">{item.date}</span>
                        )}
                        <span className="break-all">{item.idx.name}</span>
                      </span>
                    )}
                    <span className="flex items-center gap-2 shrink-0">
                      {!item.all && item.idx.docs_count != null && (
                        <span className="text-xs text-txt-muted">{item.idx.docs_count}</span>
                      )}
                      {isSelected(item) && <Check className="w-3.5 h-3.5 text-brand-blue" />}
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      <button
        onClick={load}
        disabled={loading}
        className="p-2 rounded-lg bg-surface/5 hover:bg-surface/10 text-txt-muted hover:text-txt-primary transition cursor-pointer"
        title={t("index.refresh")}
      >
        <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
      </button>
    </div>
  );
}
