import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Code2, Copy, Play, Pencil, Check } from "lucide-react";

export default function DslPanel({
  dsl,
  explanation,
  fromUser,
  onExecute,
  executing,
}: {
  dsl: Record<string, any> | null;
  explanation?: string;
  fromUser?: boolean;
  onExecute: (dsl: Record<string, any>) => void;
  executing: boolean;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (dsl) setText(JSON.stringify(dsl, null, 2));
  }, [dsl]);

  if (!dsl) return null;

  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const exec = () => {
    if (!editing) {
      onExecute(dsl);
      return;
    }
    try {
      onExecute(JSON.parse(text));
    } catch (e) {
      console.error(e);
      alert("DSL JSON 解析失败");
    }
  };

  return (
    <div className="glass rounded-2xl p-4 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Code2 className="w-4 h-4 text-brand-blue" />
          <h3 className="text-sm font-semibold tracking-tight text-txt-primary">{t("dsl.title")}</h3>
          {fromUser && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-blue/15 text-brand-blue">
              {t("common.fromUser")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={copy}
            className="p-1.5 rounded-lg hover:bg-surface/10 text-txt-muted hover:text-txt-primary transition cursor-pointer"
            title={t("dsl.copy")}
          >
            {copied ? <Check className="w-4 h-4 text-ok" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setEditing((v) => !v)}
            className="p-1.5 rounded-lg hover:bg-surface/10 text-txt-muted hover:text-txt-primary transition cursor-pointer"
            title={t("dsl.edit")}
          >
            <Pencil className="w-4 h-4" />
          </button>
        </div>
      </div>

      {editing ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          className="w-full font-mono text-xs bg-bg-900/80 border border-surface/10 rounded-xl p-3 text-txt-primary outline-none focus:border-brand-blue transition"
        />
      ) : (
        <pre className="w-full overflow-auto font-mono text-xs bg-bg-900/80 border border-surface/10 rounded-xl p-3 text-txt-primary max-h-60">
          {JSON.stringify(dsl, null, 2)}
        </pre>
      )}

      <button
        onClick={exec}
        disabled={executing}
        className="mt-3 w-full py-2 rounded-xl bg-brand-blue text-white text-sm font-medium hover:bg-brand-blue/90 disabled:opacity-40 transition cursor-pointer flex items-center justify-center gap-2"
      >
        <Play className="w-4 h-4" />
        {t("dsl.execute")}
      </button>
    </div>
  );
}
