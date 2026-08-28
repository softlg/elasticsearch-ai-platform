import axios from "axios";
import type { IndexInfo, MappingField, QueryResult, AnalysisResult } from "../types";

const baseURL = import.meta.env.VITE_API_BASE || "http://localhost:8000";

const http = axios.create({ baseURL, timeout: 120000 });

export async function fetchIndices(): Promise<IndexInfo[]> {
  const { data } = await http.get("/api/indices");
  return data.indices;
}

export async function fetchMapping(index: string): Promise<MappingField[]> {
  const { data } = await http.get(`/api/indices/${encodeURIComponent(index)}/mapping`);
  return data.fields;
}

export async function runQuery(payload: Record<string, any>): Promise<QueryResult> {
  const { data } = await http.post("/api/query", payload);
  return data;
}

export async function analyzeLogs(payload: Record<string, any>): Promise<AnalysisResult> {
  const { data } = await http.post("/api/analysis", payload);
  return data;
}

/**
 * 流式分析：返回 SSE 增量文本流。回调 onDelta 每收到一段增量触发，
 * onDone 在收到结构化结果时触发。返回取消函数。
 */
export async function analyzeLogsStream(
  payload: Record<string, any>,
  onDelta: (text: string) => void,
  onDone: (result: AnalysisResult) => void,
  onError: (msg: string) => void,
): Promise<() => void> {
  const controller = new AbortController();
  const resp = await fetch(`${baseURL}/api/analysis/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: controller.signal,
  });
  if (!resp.ok || !resp.body) {
    const msg = await resp.text().catch(() => resp.statusText);
    onError(msg || `HTTP ${resp.status}`);
    return () => controller.abort();
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // 按 SSE 事件分割（双换行）
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payloadStr = line.slice(5).trim();
          if (!payloadStr || payloadStr === "[DONE]") continue;
          try {
            const evt = JSON.parse(payloadStr);
            if (evt.error) {
              onError(evt.error);
            } else if (evt.done) {
              onDone(evt.result);
            } else if (evt.text) {
              onDelta(evt.text);
            }
          } catch {
            /* 忽略无法解析的片段 */
          }
        }
      }
    }
  } catch (e: any) {
    if (e?.name !== "AbortError") onError(e?.message || "stream aborted");
  }
  return () => controller.abort();
}

export async function health(): Promise<{ llm_configured: boolean }> {
  const { data } = await http.get("/api/health");
  return data;
}

/**
 * 流式追问：基于已有分析结果持续提问。回调 onDelta 收到增量文本，
 * onDone 在流式结束时触发。返回取消函数。
 */
export async function analyzeFollowupStream(
  payload: Record<string, any>,
  onDelta: (text: string) => void,
  onDone: () => void,
  onError: (msg: string) => void,
): Promise<() => void> {
  const controller = new AbortController();
  const resp = await fetch(`${baseURL}/api/analysis/followup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: controller.signal,
  });
  if (!resp.ok || !resp.body) {
    const msg = await resp.text().catch(() => resp.statusText);
    onError(msg || `HTTP ${resp.status}`);
    return () => controller.abort();
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payloadStr = line.slice(5).trim();
          if (!payloadStr || payloadStr === "[DONE]") continue;
          try {
            const evt = JSON.parse(payloadStr);
            if (evt.error) onError(evt.error);
            else if (evt.done) onDone();
            else if (evt.text) onDelta(evt.text);
          } catch {
            /* 忽略无法解析的片段 */
          }
        }
      }
    }
  } catch (e: any) {
    if (e?.name !== "AbortError") onError(e?.message || "stream aborted");
  }
  return () => controller.abort();
}
