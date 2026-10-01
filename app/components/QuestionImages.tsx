"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn } from "lucide-react";
import { normalizeQuestionImages, questionImageSource } from "../lib/question-images";
import "./question-images.css";

export function QuestionImages({ images, extraImages, missing = false, label = "题目图片" }: {
  images?: unknown; extraImages?: unknown; missing?: boolean; label?: string;
}) {
  const pictures = useMemo(() => normalizeQuestionImages(images, extraImages), [images, extraImages]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const selected = pictures.find((picture) => questionImageSource(picture) === expanded);

  useEffect(() => {
    if (!selected) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(null); };
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", close); };
  }, [selected]);

  if (!pictures.length) return missing ? <span className="question-image-missing">原资料未附图片，请对照原文件核查</span> : null;
  return <div className="question-image-gallery" aria-label={label}>
    {pictures.map((picture, index) => {
      const source = questionImageSource(picture);
      const alt = picture.alt || `${label} ${index + 1}`;
      return <figure key={source}>
        <button type="button" className="question-image-trigger" onClick={() => setExpanded(source)} aria-label={`放大${alt}`}>
          {/* Source images stay portable inside the imported bank; no optimization server is required. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={source} alt={alt} loading="lazy" decoding="async" onError={() => setFailed((items) => items.includes(source) ? items : [...items, source])} />
          <span><ZoomIn size={16} />点击放大</span>
        </button>
        {picture.caption && <figcaption>{picture.caption}</figcaption>}
        {failed.includes(source) && <small>图片加载失败，请检查图片链接或原文件</small>}
      </figure>;
    })}
    {selected && createPortal(<div className="question-image-lightbox" onClick={() => setExpanded(null)}>
      <section role="dialog" aria-modal="true" aria-label="图片放大" onClick={(event) => event.stopPropagation()}>
        <button type="button" autoFocus aria-label="关闭图片放大" onClick={() => setExpanded(null)}><X /></button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={questionImageSource(selected)} alt={selected.alt || label} />
        {selected.caption && <p>{selected.caption}</p>}
      </section>
    </div>, document.body)}
  </div>;
}
