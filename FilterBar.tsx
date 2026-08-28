import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, Search, Maximize2, Minimize2, Loader2 } from "lucide-react";

export interface FilterState {
  from: string;
  to: string;
  keyword: string;
  exact: boolean;
}

export default function FilterBar({
  value,
  onChange,
  onSearch,
  loading,
}: {
  value: FilterState;
  onChange: (v: FilterState) => void;
  onSearch?: () => void;
  loading?: boolean;
}) {
  const { t } = useTranslation();
  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });
  const [expanded, setExpanded] = useState(false);

  const doSearch = () => {
    if (!value.keyword.trim() || loading) return;
    onSearch?.();
  };

  if (expanded) {
    return (
      <div className="flex flex-col gap-3 glass glass-hover rounded-2xl p-4 transition">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-txt-muted text-sm">
              <Search className="w-4 h-4 text-brand-blue" />
              <span>{t("filter.keyword")}</span>
            </div>
            <div className="flex items-center gap-1.5 text-txt-muted text-sm">
              <Clock className="w-4 h-4 text-brand-blue" />
              <span>{t("filter.timeRange")}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={doSearch}
              disabled={loading || !value.keyword.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-blue text-white text-sm font-medium hover:bg-brand-blue/90 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <Search className="w-4 h-4" />
              {t("filter.keywordSearch")}
            </button>
            <button
              onClick={() => setExpanded(false)}
              title={t("filter.keywordCollapse")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface/5 hover:bg-surface/10 text-txt-muted hover:text-txt-primary transition cursor-pointer text-sm"
            >
              <Minimize2 className="w-4 h-4" />
              {t("filter.keywordCollapse")}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="datetime-local"
            value={value.from}
            onChange={(e) => set({ from: e.target.value })}
            className="bg-bg-800/80 border border-surface/10 rounded-lg px-3 py-2 text-sm text-txt-primary outline-none focus:border-brand-blue transition"
          />
          <span className="text-txt-muted">~</span>
          <input
            type="datetime-local"
            value={value.to}
            onChange={(e) => set({ to: e.target.value })}
            className="bg-bg-800/80 border border-surface/10 rounded-lg px-3 py-2 text-sm text-txt-primary outline-none focus:border-brand-blue transition"
          />
        </div>
        <textarea
          value={value.keyword}
          onChange={(e) => set({ keyword: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              doSearch();
            }
          }}
          placeholder={t("filter.keywordPlaceholder")}
          rows={6}
          autoFocus
          className="w-full resize-y bg-bg-800/80 border border-surface/10 rounded-xl px-3 py-2 text-sm text-txt-primary outline-none focus:border-brand-blue transition"
        />
        <label className="flex items-center gap-2 text-sm text-txt-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={value.exact}
            onChange={(e) => set({ exact: e.target.checked })}
            className="w-4 h-4 rounded border-surface/20 bg-bg-800/80 accent-brand-blue cursor-pointer"
          />
          <span>{t("filter.keywordExact")}</span>
        </label>
        <p className="text-xs text-txt-muted">{t("filter.keywordSearchHint")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1.5 text-txt-muted text-sm">
        <Clock className="w-4 h-4 text-brand-blue" />
        <span>{t("filter.timeRange")}</span>
      </div>
      <input
        type="datetime-local"
        value={value.from}
        onChange={(e) => set({ from: e.target.value })}
        className="bg-bg-800/80 border border-surface/10 rounded-lg px-3 py-2 text-sm text-txt-primary outline-none focus:border-brand-blue transition"
      />
      <span className="text-txt-muted">~</span>
      <input
        type="datetime-local"
        value={value.to}
        onChange={(e) => set({ to: e.target.value })}
        className="bg-bg-800/80 border border-surface/10 rounded-lg px-3 py-2 text-sm text-txt-primary outline-none focus:border-brand-blue transition"
      />
      <div className="flex items-center gap-2 flex-1 min-w-[220px]">
        <Search className="w-4 h-4 text-brand-blue shrink-0" />
        <div className="relative flex-1">
          <input
            value={value.keyword}
            onChange={(e) => set({ keyword: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                doSearch();
              }
            }}
            placeholder={t("filter.keywordPlaceholder")}
            className="w-full bg-bg-800/80 border border-surface/10 rounded-lg pl-3 pr-28 py-2 text-sm text-txt-primary outline-none focus:border-brand-blue transition"
          />
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <label
              title={t("filter.keywordExact")}
              className="flex items-center gap-1 px-1 py-1 rounded-md text-xs text-txt-muted hover:text-txt-primary cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={value.exact}
                onChange={(e) => set({ exact: e.target.checked })}
                className="w-3.5 h-3.5 rounded border-surface/20 bg-bg-800/80 accent-brand-blue cursor-pointer"
              />
              <span>{t("filter.exactShort")}</span>
            </label>
            <button
              onClick={() => setExpanded(true)}
              title={t("filter.keywordExpand")}
              className="p-1.5 rounded-md bg-surface/5 hover:bg-surface/10 text-txt-muted hover:text-txt-primary transition cursor-pointer"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              onClick={doSearch}
              disabled={loading || !value.keyword.trim()}
              title={t("filter.keywordSearch")}
              className="flex items-center justify-center p-1.5 rounded-md bg-brand-blue text-white hover:bg-brand-blue/90 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
