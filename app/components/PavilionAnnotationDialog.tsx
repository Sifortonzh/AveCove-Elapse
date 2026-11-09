"use client";

import { useEffect, useRef, useState } from "react";
import type { PavilionQuestionBank } from "../lib/local-bank";
import InfoNotice from "./InfoNotice";

export default function PavilionAnnotationDialog({ entry, onSave, onClose }: {
  entry: PavilionQuestionBank; onSave: (changes: { annotation: string; rating: number | null }) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const original = entry.annotation ?? "";
  const [draft, setDraft] = useState(original);
  const [rating, setRating] = useState<number | null>(entry.rating ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/pavilion?id=${encodeURIComponent(entry.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(draft.trim() !== original ? { annotation: draft } : {}), ...(rating !== (entry.rating ?? null) ? { rating } : {}) }),
      });
      const result = await response.json() as { annotation?: string; rating?: number | null; error?: string };
      if (!response.ok || typeof result.annotation !== "string") throw new Error(result.error ?? "暂时无法保存备注，请重试。");
      onSave({ annotation: result.annotation, rating: result.rating ?? null });
    } catch (error) {
      setError(error instanceof Error ? error.message : "暂时无法保存备注，请重试。");
    } finally {
      setBusy(false);
    }
  }
  return <dialog ref={dialog} className="pavilion-note-dialog" aria-labelledby="pavilion-note-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <h2 id="pavilion-note-title">📝 编辑公开备注与星级</h2>
      <p>{entry.name}</p>
      <label className="pavilion-annotation-editor">公开备注 · {Array.from(draft).length}/50 字
        <textarea value={draft} rows={3} disabled={busy} onChange={event => setDraft(Array.from(event.target.value).slice(0, 50).join(""))} />
      </label>
      <label className="pavilion-rating-editor">上传者自评
        <select value={rating ?? ""} disabled={busy} onChange={event => setRating(Number(event.target.value))}>
          <option value="" disabled>尚未评星</option>
          {[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value} 星 {"★".repeat(value)}</option>)}
        </select>
      </label>
      <InfoNotice title="公开范围">备注和星级对注册用户可见。留空可清除备注，不会改动题库文件。</InfoNotice>
      {error && <p role="alert">{error}</p>}
      <footer><button type="button" className="ghost-action" disabled={busy} onClick={onClose}>取消</button><button className="primary-action" disabled={busy || (draft.trim() === original && rating === (entry.rating ?? null))}>{busy ? "保存中…" : "保存修改"}</button></footer>
    </form>
  </dialog>;
}
