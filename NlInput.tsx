import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, Maximize2, Minimize2, Loader2 } from "lucide-react";

export default function NlInput({
  onRun,
  loading,
}: {
  onRun: (text: string) => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [expanded, setExpanded] = useState(false);

  const submit = () => {
    if (!text.trim() || loading) return;
    onRun(text);
  };

  // 放大态：在原位置向下延伸展开为更大的编辑区（与关键字框行为一致）
  if (expanded) {
    return (
      <div className="flex flex-col gap-3 glass glass-hover rounded-2xl p-4 transition animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-brand-blue" />
            <h3 className="text-sm font-semibold tracking-tight text-txt-primary">{t("nl.title")}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={submit}
              disabled={loading || !text.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-blue text-white text-sm font-medium hover:bg-brand-blue/90 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {t("nl.run")}
            </button>
            <button
              onClick={() => setExpanded(false)}
              title={t("nl.collapse")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface/5 hover:bg-surface/10 text-txt-muted hover:text-txt-primary transition cursor-pointer text-sm"
            >
              <Minimize2 className="w-4 h-4" />
              {t("nl.collapse")}
            </button>
          </div>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={t("nl.placeholder")}
          rows={12}
          autoFocus
          className="w-full resize-y bg-bg-800/80 border border-surface/10 rounded-xl px-3 py-2 text-sm text-txt-primary outline-none focus:border-brand-blue transition"
        />
      </div>
    );
  }

  // 折叠态：小输入框 + 右上角放大按钮
  return (
    <div className="glass glass-hover rounded-2xl p-4 transition animate-fade-in flex flex-col shrink-0">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-brand-blue" />
        <h3 className="text-sm font-semibold tracking-tight text-txt-primary">{t("nl.title")}</h3>
      </div>
      <div className="flex gap-2 items-stretch">
        <div className="relative flex-1">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={t("nl.placeholder")}
            rows={2}
            className="w-full resize-none bg-bg-800/80 border border-surface/10 rounded-xl pl-3 pr-12 py-2 text-sm text-txt-primary outline-none focus:border-brand-blue transition"
          />
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button
              onClick={() => setExpanded(true)}
              title={t("nl.expand")}
              className="p-1.5 rounded-md bg-surface/5 hover:bg-surface/10 text-txt-muted hover:text-txt-primary transition cursor-pointer"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        <button
          onClick={submit}
          disabled={loading || !text.trim()}
          title={t("nl.run")}
          className="flex items-center justify-center px-3 rounded-xl bg-brand-blue text-white hover:bg-brand-blue/90 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
