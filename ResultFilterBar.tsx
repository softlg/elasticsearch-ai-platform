import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, Filter, Plus, X, Search, Maximize2, Minimize2 } from "lucide-react";

export interface ExtraFilter {
  field: string;
  value: string;
  exact: boolean;
}

export interface ResultFilterState {
  from: string;
  to: string;
  message: string;
  messageExact: boolean;
  messageExactField: string;
  level: string;
  levelExact: boolean;
  levelExactField: string;
  extras: ExtraFilter[];
}

export const DEFAULT_RESULT_FILTER: ResultFilterState = {
  from: "",
  to: "",
  message: "",
  messageExact: false,
  messageExactField: "message.keyword",
  level: "",
  levelExact: false,
  levelExactField: "level.keyword",
  extras: [],
};

export default function ResultFilterBar({
  value,
  onChange,
  onApply,
  live = false,
  onToggleLive,
  expanded = false,
  onToggleExpand,
  hasIndex = true,
}: {
  value: ResultFilterState;
  onChange: (v: ResultFilterState) => void;
  onApply: () => void;
  live?: boolean;
  onToggleLive?: () => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
  hasIndex?: boolean;
}) {
  const { t } = useTranslation();
  const [showMore, setShowMore] = useState(false);
  const set = (patch: Partial<ResultFilterState>) => onChange({ ...value, ...patch });

  return (
    <div className="glass rounded-2xl p-3 flex flex-col gap-2 shrink-0">
      <div className="flex items-center gap-2 text-txt-muted text-sm">
        <Filter className="w-4 h-4 text-brand-blue" />
        <span>{t("result.filter.title")}</span>
        <button
          onClick={() => setShowMore((s) => !s)}
          className="ml-1 text-xs px-2 py-0.5 rounded-md bg-surface/5 hover:bg-surface/10 text-txt-muted hover:text-txt-primary transition cursor-pointer"
        >
          {showMore ? t("result.filter.hideMore") : t("result.filter.more")}
        </button>
        {onToggleLive && (
          <button
            onClick={onToggleLive}
            disabled={!hasIndex}
            title={hasIndex ? t("result.liveHint", { n: 3 }) : t("index.placeholder")}
            className={`ml-auto flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition cursor-pointer ${
              !hasIndex
                ? "bg-surface/5 text-txt-muted/40 cursor-not-allowed"
                : live
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/40"
                : "bg-surface/5 hover:bg-surface/10 text-txt-muted hover:text-txt-primary"
            }`}
          >
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                live ? "bg-emerald-400 animate-pulse" : "bg-txt-muted/40"
              }`}
            />
            {live ? t("result.liveOn") : t("result.live")}
          </button>
        )}
        <button
          onClick={onApply}
          disabled={!hasIndex}
          title={hasIndex ? "" : t("index.placeholder")}
          className={`px-3 py-1 rounded-md text-white text-xs transition cursor-pointer ${
            hasIndex
              ? "bg-brand-blue hover:bg-brand-blue/80"
              : "bg-brand-blue/40 text-white/60 cursor-not-allowed"
          }`}
        >
          {t("result.filter.apply")}
        </button>
        {onToggleExpand && (
          <button
            onClick={onToggleExpand}
            title={expanded ? t("panel.collapse") : t("panel.expandResult")}
            className="flex items-center justify-center p-1.5 rounded-md bg-surface/5 hover:bg-surface/10 text-txt-muted hover:text-txt-primary transition cursor-pointer"
          >
            {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* 第一行：时间 + message */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-txt-muted text-xs">
          <Clock className="w-3.5 h-3.5" />
        </div>
        <input
          type="datetime-local"
          value={value.from}
          onChange={(e) => set({ from: e.target.value })}
          title={t("filter.from")}
          className="bg-bg-800/80 border border-surface/10 rounded-lg px-2 py-1.5 text-xs text-txt-primary outline-none focus:border-brand-blue transition"
        />
        <span className="text-txt-muted text-xs">~</span>
        <input
          type="datetime-local"
          value={value.to}
          onChange={(e) => set({ to: e.target.value })}
          title={t("filter.to")}
          className="bg-bg-800/80 border border-surface/10 rounded-lg px-2 py-1.5 text-xs text-txt-primary outline-none focus:border-brand-blue transition"
        />

        <div className="flex items-center gap-1.5 bg-bg-800/80 border border-surface/10 rounded-lg px-2 py-1.5 focus-within:border-brand-blue transition">
          <Search className="w-3.5 h-3.5 text-brand-blue shrink-0" />
          <input
            value={value.message}
            onChange={(e) => set({ message: e.target.value })}
            placeholder={t("result.filter.message")}
            className="bg-transparent outline-none text-xs text-txt-primary w-40 min-w-[6rem]"
          />
          <button
            onClick={() => set({ messageExact: !value.messageExact })}
            title={value.messageExact ? t("result.filter.exact") : t("result.filter.fuzzy")}
            className={`text-[10px] px-1.5 py-0.5 rounded ${
              value.messageExact
                ? "bg-brand-blue text-white"
                : "bg-surface/10 text-txt-muted hover:text-txt-primary"
            } transition cursor-pointer`}
          >
            {value.messageExact ? "= " : "~ "}
          </button>
        </div>

        <div className="flex items-center gap-1.5 bg-bg-800/80 border border-surface/10 rounded-lg px-2 py-1.5 focus-within:border-brand-blue transition">
          <span className="text-xs text-txt-muted">{t("result.filter.level")}</span>
          <input
            value={value.level}
            onChange={(e) => set({ level: e.target.value })}
            placeholder="ERROR/WARN/INFO"
            className="bg-transparent outline-none text-xs text-txt-primary w-28 min-w-[5rem]"
          />
          <button
            onClick={() => set({ levelExact: !value.levelExact })}
            title={value.levelExact ? t("result.filter.exact") : t("result.filter.fuzzy")}
            className={`text-[10px] px-1.5 py-0.5 rounded ${
              value.levelExact
                ? "bg-brand-blue text-white"
                : "bg-surface/10 text-txt-muted hover:text-txt-primary"
            } transition cursor-pointer`}
          >
            {value.levelExact ? "= " : "~ "}
          </button>
        </div>
      </div>

      {/* 更多条件 */}
      {showMore && (
        <div className="flex flex-col gap-2 pt-1 border-t border-surface/10">
          {value.extras.map((ex, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={ex.field}
                onChange={(e) => {
                  const next = [...value.extras];
                  next[i] = { ...ex, field: e.target.value };
                  set({ extras: next });
                }}
                placeholder={t("result.filter.field")}
                className="bg-bg-800/80 border border-surface/10 rounded-lg px-2 py-1.5 text-xs text-txt-primary outline-none focus:border-brand-blue transition w-40"
              />
              <input
                value={ex.value}
                onChange={(e) => {
                  const next = [...value.extras];
                  next[i] = { ...ex, value: e.target.value };
                  set({ extras: next });
                }}
                placeholder={t("result.filter.value")}
                className="flex-1 bg-bg-800/80 border border-surface/10 rounded-lg px-2 py-1.5 text-xs text-txt-primary outline-none focus:border-brand-blue transition"
              />
              <button
                onClick={() => {
                  const next = [...value.extras];
                  next[i] = { ...ex, exact: !ex.exact };
                  set({ extras: next });
                }}
                className={`text-[10px] px-1.5 py-1 rounded shrink-0 ${
                  ex.exact ? "bg-brand-blue text-white" : "bg-surface/10 text-txt-muted"
                } transition cursor-pointer`}
              >
                {ex.exact ? "= " : "~ "}
              </button>
              <button
                onClick={() => set({ extras: value.extras.filter((_, j) => j !== i) })}
                className="text-txt-muted hover:text-danger transition cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            onClick={() => set({ extras: [...value.extras, { field: "", value: "", exact: false }] })}
            className="self-start flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-surface/5 hover:bg-surface/10 text-txt-muted hover:text-txt-primary transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> {t("result.filter.addCondition")}
          </button>
        </div>
      )}
    </div>
  );
}
