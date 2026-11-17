"use client";
import { useState } from "react";
import { FLASHCARD_EXAMPLE, FLASHCARD_LEARNING_PROMPT } from "../lib/flashcards";

export default function FlashcardGuide({ onImport }: { onImport: () => void }) {
  const [message, setMessage] = useState("");
  return <section className="ai-json-guide flashcard-guide"><h3>⚡ 让外部 AI 制作闪卡 JSON</h3><p>一张卡，一个要点。把资料和提示词交给自己的 AI，取回 JSON 后导入。</p><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(FLASHCARD_LEARNING_PROMPT); setMessage("✅ 已复制"); } catch { setMessage("请展开提示词手动复制"); } }}>复制闪卡提示词</button><a href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(FLASHCARD_EXAMPLE, null, 2))}`} download="红豆闪卡示例.json">下载示例闪卡</a><button type="button" onClick={onImport}>导入闪卡 JSON</button><details><summary>查看提示词</summary><p className="ai-json-prompt-text">{FLASHCARD_LEARNING_PROMPT}</p></details>{message && <p role="status">{message}</p>}</section>;
}
