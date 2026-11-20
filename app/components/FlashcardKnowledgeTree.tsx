"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { QuizQuestion } from "../lib/question-parser";
import { parseKnowledgeOutline, relatedFlashcardStems, type KnowledgeNode } from "../lib/knowledge-tree";

function Branches({ nodes, renderMarkdown }: { nodes: KnowledgeNode[]; renderMarkdown: (text: string) => ReactNode }) {
  return <ul>{nodes.map((node, index) => <li key={index}><div>{renderMarkdown(node.text)}</div>{node.children.length > 0 && <Branches nodes={node.children} renderMarkdown={renderMarkdown} />}</li>)}</ul>;
}

export default function FlashcardKnowledgeTree({ card, deck, accountId, renderMarkdown, onSave }: {
  card: QuizQuestion; deck: QuizQuestion[]; accountId?: string; renderMarkdown: (text: string) => ReactNode; onSave: (text: string) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [raw, setRaw] = useState(false);
  const [saved, setSaved] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function generate() {
    if (request.current) return;
    const controller = new AbortController(); request.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 125_000);
    setBusy(true); setError(""); setSaved(false);
    try {
      const response = await fetch("/api/explain", { method: "POST", headers: { "Content-Type": "application/json", "x-elapse-account-id": accountId ?? "" }, signal: controller.signal, body: JSON.stringify({
        mode: "knowledge-tree", question: { stem: card.stem.slice(0, 2000), options: [{ label: "A", text: (card.flashcardAnswer ?? "").slice(0, 4000) }], answer: ["A"], category: card.category, sourceNumber: card.sourceNumber },
        followUp: keyword, related: relatedFlashcardStems(card, deck, keyword),
      }) });
      const data = await response.json() as { explanation?: string; error?: string };
      if (!response.ok || !data.explanation) throw new Error(data.error ?? "未收到知识树，请重试");
      if (!controller.signal.aborted) setResult(data.explanation.slice(0, 12_000));
    } catch (cause) {
      setError(controller.signal.aborted ? "已取消或超时，可重新生成" : cause instanceof Error ? cause.message : "生成失败");
    } finally { window.clearTimeout(timer); request.current = null; setBusy(false); }
  }
  const nodes = parseKnowledgeOutline(result);
  return <section className="flashcard-tool-card flashcard-tree"><h2>知识树</h2><form onSubmit={event => { event.preventDefault(); void generate(); }}><input aria-label="知识树考点关键词" maxLength={60} placeholder="考点关键词（可选）" value={keyword} onChange={event => setKeyword(event.target.value)} /><button type="submit" disabled={busy}>{busy ? "生成中…" : "以此卡为锚点生成"}</button>{busy && <button type="button" onClick={() => request.current?.abort()}>取消</button>}</form>
    {error && <p role="alert">{error}</p>}
    {result && <><div className="flashcard-tree-actions"><button onClick={() => setRaw(value => !value)}>{raw ? "查看树状图" : "查看 Markdown"}</button><button disabled={saved} onClick={() => { onSave(result); setSaved(true); }}>{saved ? "已写入" : "写入笔记"}</button></div>{raw || !nodes.length ? renderMarkdown(result) : <Branches nodes={nodes} renderMarkdown={renderMarkdown} />}</>}
  </section>;
}
