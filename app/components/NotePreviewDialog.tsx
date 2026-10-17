"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

export default function NotePreviewDialog({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); };
  }, []);
  return <dialog ref={dialogRef} className="note-preview-dialog" aria-label="笔记预览" onClose={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <header><h2>📓 笔记预览</h2><div className="note-preview-tools"><button type="button" aria-label="缩小笔记字号" disabled={scale <= 0.8} onClick={() => setScale(value => Math.max(0.8, +(value - 0.1).toFixed(1)))}>A−</button><button type="button" aria-label="重置笔记字号" onClick={() => setScale(1)}>{Math.round(scale * 100)}%</button><button type="button" aria-label="放大笔记字号" disabled={scale >= 1.8} onClick={() => setScale(value => Math.min(1.8, +(value + 0.1).toFixed(1)))}>A＋</button><button type="button" aria-label="关闭笔记预览" onClick={onClose} autoFocus><X /></button></div></header>
    <div className="note-preview-content" style={{ fontSize: `${scale}rem` }}>{children}</div>
  </dialog>;
}
