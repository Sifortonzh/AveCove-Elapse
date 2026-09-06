"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { readPersonalAiConfig } from "../lib/personal-ai";
import type { QuizQuestion } from "../lib/question-parser";

export function AnnotatedOption({ label, note, submitted, onNote, children }: { label: string; note: string; submitted: boolean; onNote: (value: string) => void; children: ReactNode }) {
  const marker = `> 选项 ${label} 批注：`;
  const value = note.split("\n").find((line) => line.startsWith(marker))?.slice(marker.length) ?? "";
  const [editing, setEditing] = useState(false);
  const save = (text: string) => {
    const lines = note.split("\n").filter((line) => !line.startsWith(marker));
    onNote([...lines, ...(text ? [marker + text.replace(/\n/g, " ")] : [])].join("\n"));
  };
  return <div className="annotated-option">
    {children}<button className="option-annotation-toggle" aria-label={`${editing ? "收起" : "编辑"}选项 ${label} 批注`} title={value ? "已保存批注，点击查看" : "添加批注"} onClick={() => setEditing(!editing)}>{editing ? "×" : "✎"}{value && <i aria-hidden="true" />}</button>
    {editing ? <textarea aria-label={`选项 ${label} 批注`} value={value} maxLength={500} onChange={(e) => save(e.target.value)} placeholder="输入批注，也可使用 iPad 随手写" /> : submitted && value && <p className="option-annotation-text">✎ {value}</p>}
  </div>;
}

export function ChapterDirectory({ questions, onOpen, onClose }: { questions: QuizQuestion[]; onOpen: (id: string) => void; onClose: () => void }) {
  const groups = new Map<string, QuizQuestion[]>();
  for (const question of questions) { const name = question.category || "未分类"; groups.set(name, [...(groups.get(name) ?? []), question]); }
  return <div className="modal-layer" onMouseDown={onClose}><section className="search-modal chapter-directory" role="dialog" aria-modal="true" aria-label="章节目录" onMouseDown={(e) => e.stopPropagation()}><header><h2>章节目录 · {questions.length} 题</h2><button aria-label="关闭章节目录" onClick={onClose}>×</button></header><p>按题库已有分类显示；展开章节可直接定位题目。</p>{[...groups].map(([name, items]) => <details key={name}><summary>{name}<span>{items.length} 题 · {((items.length / questions.length) * 100).toFixed(1)}%</span></summary>{items.map((q) => <button key={q.id} onClick={() => { onOpen(q.id); onClose(); }}><b>{q.sourceNumber}</b><span>{q.stem}</span></button>)}</details>)}</section></div>;
}

export function AiDialogue({ question, onSave }: { question: QuizQuestion; onSave: (text: string) => void }) {
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function ask(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true); setError("");
    const controller = new AbortController(); request.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch("/api/explain", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ question, mode: "companion", followUp: text, history: messages.slice(-6), personalAi: readPersonalAiConfig() ?? undefined }) });
      if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("AI 服务暂时不可用，请稍后重试");
      const data = await response.json();
      if (!response.ok || !data.explanation) throw new Error(data.error || "没有收到 AI 回复");
      setMessages((prev) => [...prev, { role: "user", text }, { role: "assistant", text: data.explanation }]); setDraft("");
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "请求失败"); else setError("请求已取消或超时，可重新提问"); }
    finally { window.clearTimeout(timer); setBusy(false); }
  }
  return <section className="practice-dialogue"><h3>追问 AI · 同类考点</h3>{messages.map((message, i) => <div key={i} className={`dialogue-${message.role}`}><strong>{message.role === "user" ? "我" : "AI"}</strong><p>{message.text}</p>{message.role === "assistant" && <button onClick={() => onSave(message.text)}>写入笔记</button>}</div>)}<textarea value={draft} maxLength={500} onChange={(e) => setDraft(e.target.value)} placeholder="追问判断依据、易混点或同类考点…" /><button disabled={busy || !draft.trim()} onClick={() => void ask(draft)}>{busy ? "正在回答…" : "发送追问"}</button><button disabled={busy} onClick={() => void ask("请总结本题的同类考点及易混淆区别")}>总结同类考点</button>{busy && <button onClick={() => request.current?.abort()}>取消</button>}{error && <p role="alert">{error}</p>}</section>;
}

type Point = [number, number];
export function NoteImages({ note, onNote }: { note: string; onNote: (value: string) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const latest = useRef(note);
  useEffect(() => { latest.current = note; }, [note]);
  const images = [...note.matchAll(/!\[笔记图片\]\((data:image\/jpeg;base64,[A-Za-z0-9+/=]+)\)/g)];
  async function add(file: File) {
    setError(""); setBusy(true);
    const url = URL.createObjectURL(file);
    try {
      if (file.size > 20_000_000) throw new Error("请选择小于 20 MB 的图片");
      const image = new window.Image(); image.src = url;
      await image.decode();
      const scale = Math.min(1, 1000 / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("无法处理图片");
      context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/jpeg", .7);
      if (data.length > 350_000 || latest.current.length + data.length > 600_000) throw new Error("本题图片较多，请先删除不需要的图片");
      onNote(`${latest.current.trimEnd()}\n\n![笔记图片](${data})\n`);
    } catch (e) { setError(e instanceof Error ? e.message : "图片读取失败，请先转换为 JPG 或 PNG"); }
    finally { URL.revokeObjectURL(url); setBusy(false); }
  }
  return <section className="note-images" tabIndex={0} aria-label="笔记图片，可粘贴图片" onPaste={(e) => { const file = [...e.clipboardData.files].find((item) => item.type.startsWith("image/")); if (file && !busy) { e.preventDefault(); void add(file); } }}><label>添加笔记图片<input type="file" accept="image/*" disabled={busy} onChange={(e) => { const file = e.target.files?.[0]; if (file) void add(file); e.target.value = ""; }} /></label><small>也可点击此区域后粘贴图片</small>{busy && <p>正在保存图片…</p>}{error && <p role="alert">{error}</p>}{images.map((match, index) => <figure key={index}><Image unoptimized src={match[1]} alt={`笔记图片 ${index + 1}`} width={1000} height={750} style={{ height: "auto" }} /><button onClick={() => onNote(note.replace(match[0], ""))}>删除图片</button></figure>)}</section>;
}
export function InkNote({ note, onNote }: { note: string; onNote: (value: string) => void }) {
  const match = note.match(/```elapse-ink\n([^`]+)\n```/);
  let saved: Point[][] = [];
  try { const parsed = JSON.parse(match?.[1] ?? "[]"); if (Array.isArray(parsed)) saved = parsed.filter((stroke) => Array.isArray(stroke) && stroke.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))); } catch { /* Keep text intact when a drawing is malformed. */ }
  const [stroke, setStroke] = useState<Point[]>([]);
  const active = useRef<Point[]>([]);
  const save = (strokes: Point[][]) => onNote(note.replace(/```elapse-ink\n[^`]+\n```\n?/g, "").trimEnd() + (strokes.length ? `\n\n\`\`\`elapse-ink\n${JSON.stringify(strokes)}\n\`\`\`\n` : ""));
  return <details className="ink-note"><summary>✎ 手绘笔记</summary><p>在画板内书写；画板外可正常滚动。松笔自动保存并随笔记同步。</p><svg viewBox="0 0 600 300" aria-label="手绘笔记画板" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); const r = e.currentTarget.getBoundingClientRect(); active.current = [[Math.round((e.clientX-r.left)/r.width*600), Math.round((e.clientY-r.top)/r.height*300)]]; setStroke(active.current); }} onPointerMove={(e) => { if (!e.currentTarget.hasPointerCapture(e.pointerId) || active.current.length >= 2000) return; const r=e.currentTarget.getBoundingClientRect(); active.current=[...active.current,[Math.round((e.clientX-r.left)/r.width*600),Math.round((e.clientY-r.top)/r.height*300)]]; setStroke(active.current); }} onPointerUp={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) { save([...saved, active.current].slice(-100)); active.current=[]; setStroke([]); e.currentTarget.releasePointerCapture(e.pointerId); } }} onPointerCancel={() => { active.current=[]; setStroke([]); }}>{[...saved, stroke].map((s,i) => <polyline key={i} points={s.map((p)=>p.join(",")).join(" ")} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />)}</svg><button disabled={!saved.length} onClick={() => save(saved.slice(0,-1))}>撤销最后一笔</button></details>;
}
