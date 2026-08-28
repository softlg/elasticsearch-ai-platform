import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BrainCircuit, Loader2, AlertTriangle, Lightbulb, Microscope, Square, Maximize2, Minimize2, Send } from "lucide-react";
import type { AnalysisResult, QueryResult } from "../types";
import { analyzeLogsStream, analyzeFollowupStream } from "../api/client";

const severityColor: Record<string, string> = {
  low: "text-ok border-ok/30 bg-ok/10",
  medium: "text-warn border-warn/30 bg-warn/10",
  high: "text-danger border-danger/30 bg-danger/10",
};

interface ChatMsg {
  role: "user" | "ai";
  text: string;
}

export default function AnalysisPanel({
  result,
  expanded = false,
  onToggleExpand,
}: {
  result: QueryResult | null;
  expanded?: boolean;
  onToggleExpand?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [streaming, setStreaming] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const cancelRef = useRef<(() => void) | null>(null);

  // 持续追问对话
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [question, setQuestion] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const stop = () => {
    cancelRef.current?.();
    cancelRef.current = null;
    setLoading(false);
  };

  const run = async () => {
    if (!result || !result.hits.length || loading) return;
    setLoading(true);
    setError("");
    setAnalysis(null);
    setStreaming("");

    const payload = {
      index: result.index,
      hits: result.hits,
      language: i18n.language,
    };

    cancelRef.current = await analyzeLogsStream(
      payload,
      (delta) => setStreaming((s) => s + delta),
      (final) => {
        setAnalysis(final);
        setStreaming("");
        setLoading(false);
        cancelRef.current = null;
      },
      (msg) => {
        setError(msg);
        setStreaming("");
        setLoading(false);
        cancelRef.current = null;
      },
    );
  };

  const prevAnalysisRaw = analysis?.raw || null;

  const ask = async () => {
    const q = question.trim();
    if (!q || !result || !result.hits.length || askLoading) return;
    setAskLoading(true);
    setAskError("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setQuestion("");
    const aiIndex = messages.length + 1;
    setMessages((m) => [...m, { role: "ai", text: "" }]);

    const payload = {
      index: result.index,
      hits: result.hits,
      language: i18n.language,
      question: q,
      prev_analysis: prevAnalysisRaw,
    };

    await analyzeFollowupStream(
      payload,
      (delta) =>
        setMessages((m) =>
          m.map((msg, i) => (i === aiIndex ? { ...msg, text: msg.text + delta } : msg)),
        ),
      () => setAskLoading(false),
      (msg) => {
        setAskError(msg);
        setAskLoading(false);
      },
    );
  };

  const canRun = !!result && result.hits.length > 0 && !loading;
  const showStreaming = streaming.length > 0 && !analysis;
  const canAsk = !!result && result.hits.length > 0 && !askLoading;

  return (
    <div className="glass rounded-2xl p-4 animate-fade-in h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BrainCircuit className="w-4 h-4 text-brand-blue" />
          <h3 className="text-sm font-semibold tracking-tight text-txt-primary">{t("analysis.title")}</h3>
        </div>
        <div className="flex items-center gap-2">
          {loading ? (
            <button
              onClick={stop}
              className="px-4 py-1.5 rounded-xl bg-surface/10 text-txt-primary text-sm font-medium hover:bg-surface/20 transition cursor-pointer flex items-center gap-2"
            >
              <Square className="w-4 h-4" /> {t("analysis.stop")}
            </button>
          ) : (
            <button
              onClick={run}
              disabled={!canRun}
              className="px-4 py-1.5 rounded-xl bg-brand-blue text-white text-sm font-medium hover:bg-brand-blue/90 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer flex items-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("analysis.run")}
            </button>
          )}
          {onToggleExpand && (
            <button
              onClick={onToggleExpand}
              title={expanded ? t("panel.collapse") : t("panel.expandAnalysis")}
              className="p-1.5 rounded-lg bg-surface/5 hover:bg-surface/10 text-txt-muted hover:text-txt-primary transition cursor-pointer"
            >
              {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="text-danger text-xs bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {!analysis && !showStreaming && !loading && !error && (
        <p className="text-txt-muted text-sm">{t("analysis.empty")}</p>
      )}

      {/* 流式生成中：实时预览原始文本（打字机效果） */}
      {showStreaming && (
        <div className="text-sm text-txt-primary leading-relaxed bg-surface/5 rounded-lg px-3 py-2 whitespace-pre-wrap break-words">
          {streaming}
          <span className="inline-block w-1.5 h-4 bg-brand-blue align-middle animate-pulse ml-0.5" />
        </div>
      )}

      {/* 结构化结果 */}
      {analysis && (
        <div className="space-y-4">
          {analysis.severity && (
            <span className={`inline-block text-xs px-2.5 py-1 rounded-full border ${severityColor[analysis.severity] || ""}`}>
              {t("analysis.severity")}: {analysis.severity}
            </span>
          )}
          <Card icon={<Microscope className="w-4 h-4 text-brand-blue" />} title={t("analysis.summary")} body={analysis.summary} />
          <Card icon={<AlertTriangle className="w-4 h-4 text-warn" />} title={t("analysis.rootCause")} body={analysis.root_cause} />
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-4 h-4 text-ok" />
              <h4 className="text-sm text-txt-primary">{t("analysis.suggestions")}</h4>
            </div>
            <ul className="space-y-1.5">
              {Array.isArray(analysis.suggestions) &&
                analysis.suggestions.map((s, i) => (
                  <li key={i} className="text-sm text-txt-primary bg-surface/5 rounded-lg px-3 py-2 border-l-2 border-brand-blue/40">
                    {s}
                  </li>
                ))}
            </ul>
          </div>
        </div>
      )}

      {/* 持续追问对话区 */}
      {(messages.length > 0 || analysis) && (
        <div className="mt-5 pt-4 border-t border-surface/10">
          <h4 className="text-sm text-txt-primary mb-2 flex items-center gap-2">
            <Send className="w-4 h-4 text-brand-blue" />
            {t("analysis.followupTitle")}
          </h4>

          {messages.length > 0 && (
            <div className="space-y-3 mb-3">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] text-sm leading-relaxed px-3 py-2 rounded-xl whitespace-pre-wrap break-words ${
                      m.role === "user"
                        ? "bg-brand-blue/15 text-txt-primary"
                        : "bg-surface/5 text-txt-primary"
                    }`}
                  >
                    {m.text || (askLoading && i === messages.length - 1 ? (
                      <span className="inline-flex items-center gap-1 text-txt-muted">
                        <Loader2 className="w-3 h-3 animate-spin" /> {t("common.loading")}
                      </span>
                    ) : "")}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          )}

          {askError && (
            <div className="text-danger text-xs bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 mb-2">
              {askError}
            </div>
          )}

          <div className="flex gap-2 sticky bottom-0 bg-bg-900/95 pb-1">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  ask();
                }
              }}
              disabled={!canAsk}
              placeholder={t("analysis.followupPlaceholder")}
              className="flex-1 bg-bg-800/80 border border-surface/10 rounded-xl px-3 py-2 text-sm text-txt-primary outline-none focus:border-brand-blue transition disabled:opacity-40 disabled:cursor-not-allowed"
            />
            <button
              onClick={ask}
              disabled={!canAsk || !question.trim()}
              className="px-4 py-2 rounded-xl bg-brand-blue text-white text-sm font-medium hover:bg-brand-blue/90 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer flex items-center gap-2 shrink-0"
            >
              {askLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {t("analysis.followupSend")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  if (!body) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h4 className="text-sm text-txt-primary">{title}</h4>
      </div>
      <p className="text-sm text-txt-muted leading-relaxed bg-surface/5 rounded-lg px-3 py-2 whitespace-pre-wrap break-words">{body}</p>
    </div>
  );
}
