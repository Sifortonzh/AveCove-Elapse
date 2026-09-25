"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Download, FileText, ScanText, Upload, X } from "lucide-react";
import { importQuestionFile, QuestionRecognitionError, type ImportUpdate } from "../lib/file-import";
import { AI_SOURCE_CONVERSION_PROMPT, downloadAiSourcePackage } from "../lib/ai-source-export";
import type { QuizQuestion } from "../lib/question-parser";

type Props = {
  onClose: () => void;
  onSave: (fileName: string, questions: QuizQuestion[]) => Promise<void>;
  initialFile?: File | null;
};

export default function DocumentImportWorkbench({ onClose, onSave, initialFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [extractedText, setExtractedText] = useState("");
  const [state, setState] = useState<ImportUpdate>({ phase: "等待文件", progress: 0, detail: "Word 优先；PDF 仅使用文字提取和 OCR" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [usedOcr, setUsedOcr] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  useEffect(() => () => controllerRef.current?.abort(), []);

  function chooseFile(selected: File | undefined) {
    if (!selected || busy || saving) return;
    if (!/\.(doc|docx|pdf)$/i.test(selected.name)) {
      setError("请选择 .doc、.docx 或 .pdf 文件；标准题库 JSON 请使用左侧快速导入。 ");
      return;
    }
    setFile(selected);
    setQuestions([]);
    setExtractedText("");
    setUsedOcr(false);
    setError("");
    setState({ phase: "文件已就绪", progress: 0, detail: selected.name });
  }

  async function recognize() {
    if (!file || busy) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    setError("");
    setQuestions([]);
    setExtractedText("");
    try {
      const result = await importQuestionFile(file, setState, controller.signal);
      setQuestions(result.questions);
      setUsedOcr(result.usedOcr);
    } catch (caught) {
      if (caught instanceof QuestionRecognitionError) {
        setExtractedText(caught.extractedText);
        setError("未识别出完整的选择/判断题。可下载提取文字 JSON 交给 AI 整理，再将生成的红豆题库 JSON 导入。 ");
      } else if (caught instanceof DOMException && caught.name === "AbortError") {
        setError("识别已取消，未保存任何题库。 ");
      } else {
        setError(caught instanceof Error ? caught.message : "识别失败，请改用 Word 或先整理为红豆题库 JSON。 ");
      }
    } finally {
      controllerRef.current = null;
      setBusy(false);
    }
  }

  function exportForAi() {
    if (!file || !extractedText) return;
    downloadAiSourcePackage(file.name, extractedText);
  }

  const answered = questions.filter((question) => question.answer.length > 0).length;
  return <div className="modal-layer document-import-layer" onMouseDown={() => !busy && !saving && onClose()}>
    <section className="document-import-modal" role="dialog" aria-modal="true" aria-label="Word 与 PDF 识别工作台" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span>DOCUMENT RECOGNITION · LOCAL FIRST</span><h2>Word / PDF 识别工作台</h2><p>只做提取、OCR 与题目识别；预览无误后再保存。这里不会调用 AI。</p></div><button aria-label="关闭工作台" disabled={busy || saving} onClick={onClose}><X /></button></header>
      <div className="document-import-flow"><div><FileText /><strong>Word .doc / .docx</strong><small>优先保留题干、选项与原文答案</small></div><div><ScanText /><strong>PDF 文字 / OCR</strong><small>扫描效果不足时建议先制作标准 JSON</small></div><div><CheckCircle2 /><strong>识别后审阅</strong><small>确认题数与答案数，再入库</small></div></div>
      <div className="document-import-picker" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files[0]); }}>
        <Upload /><div><strong>{file?.name || "拖入 Word 或 PDF 文件"}</strong><small>{file ? "可更换文件后重新识别" : "也可以点击选择文件"}</small></div>
        <button type="button" disabled={busy || saving} onClick={() => inputRef.current?.click()}>选择文件</button>
        <input ref={inputRef} hidden type="file" accept=".doc,.docx,.pdf" onChange={(event) => { chooseFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
      </div>
      {state.progress > 0 && <div className="document-import-progress"><div><strong>{state.phase}</strong><span>{state.progress}%</span></div><i><b style={{ width: `${state.progress}%` }} /></i><p>{state.detail}</p></div>}
      {error && <div className="import-error"><AlertCircle />{error}</div>}
      {questions.length > 0 && <div className="document-import-result"><div><strong>识别 {questions.length} 题</strong><span>有答案 {answered} · 待答案 {questions.length - answered}{usedOcr ? " · 已用 OCR" : ""}</span></div><ol>{questions.slice(0, 3).map((question, index) => <li key={`${question.id}-${index}`}><b>{question.sourceNumber || index + 1}. {question.stem}</b><small>{question.options.map((option) => `${option.label}. ${option.text}`).join("　")}</small></li>)}</ol><p>仅预览前 3 题；答案与文字请在保存后抽查。</p></div>}
      <div className="document-import-guidance"><strong>识别不理想？</strong><p>先下载提取文字 JSON，交给 AI 整理为红豆题库 JSON，再回到导入页选择生成的 JSON。这通常比在网页内逐段调用 AI 更快。</p><div className="ai-json-actions">{extractedText && <button type="button" onClick={exportForAi}><Download />下载供 AI 整理的 JSON</button>}<button type="button" onClick={async () => { try { await navigator.clipboard.writeText(AI_SOURCE_CONVERSION_PROMPT); setPromptCopied(true); } catch { setError("无法自动复制，请在下方手动选中提示词复制。"); } }}>{promptCopied ? "提示词已复制" : "复制给 AI 的提示词"}</button></div><details><summary>查看完整提示词</summary><p className="ai-json-prompt-text">{AI_SOURCE_CONVERSION_PROMPT}</p></details></div>
      <footer><button type="button" className="ghost-action" disabled={busy || saving} onClick={onClose}>关闭</button>{busy ? <button type="button" onClick={() => controllerRef.current?.abort()}>取消识别</button> : questions.length ? <button type="button" className="primary-action" disabled={saving} onClick={async () => { if (!file) return; setSaving(true); try { await onSave(file.name, questions); onClose(); } catch (caught) { setError(caught instanceof Error ? caught.message : "保存失败，请重试"); } finally { setSaving(false); } }}>{saving ? "正在保存…" : "确认并保存题库"}</button> : <button type="button" className="primary-action" disabled={!file} onClick={() => void recognize()}>开始识别</button>}</footer>
    </section>
  </div>;
}
