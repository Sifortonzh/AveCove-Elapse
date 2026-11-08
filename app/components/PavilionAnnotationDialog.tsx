"use client";

import { useEffect, useRef, useState } from "react";
import type { PavilionQuestionBank } from "../lib/local-bank";

export default function PavilionAnnotationDialog({ entry, onSave, onClose }: {
  entry: PavilionQuestionBank; onSave: (annotation: string) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const original = entry.annotation ?? "";
  const [draft, setDraft] = useState(original);
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
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ annotation: draft }),
      });
      const result = await response.json() as { annotation?: string; error?: string };
      if (!response.ok || typeof result.annotation !== "string") throw new Error(result.error ?? "暂时无法保存备注，请重试。");
      onSave(result.annotation);
    } catch (error) {
      setError(error instanceof Error ? error.message : "暂时无法保存备注，请重试。");
    } finally {
      setBusy(false);
    }
  }
  return <dialog ref={dialog} className="pavilion-note-dialog" aria-labelledby="pavilion-note-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <h2 id="pavilion-note-title">📝 编辑公开备注</h2>
      <p>{entry.name}</p>
      <label className="pavilion-annotation-editor">公开备注
        <textarea value={draft} rows={3} disabled={busy} onChange={event => setDraft(Array.from(event.target.value).slice(0, 50).join(""))} />
        <small>{Array.from(draft).length}/50 字 · 注册用户可见，留空可清除</small>
      </label>
      {error && <p role="alert">{error}</p>}
      <footer><button type="button" className="ghost-action" disabled={busy} onClick={onClose}>取消</button><button className="primary-action" disabled={busy || draft.trim() === original}>{busy ? "保存中…" : "保存备注"}</button></footer>
    </form>
  </dialog>;
}
