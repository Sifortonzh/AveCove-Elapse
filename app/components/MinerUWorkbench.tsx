"use client";

import { useMemo, useRef, useState } from "react";
import { AlertCircle, BookOpenCheck, CheckCircle2, FileJson, Layers3, Sigma, Upload, X } from "lucide-react";
import { MathText } from "./MathText";
import {
  mergeMineruHybridDocuments,
  parseMineruHybridQuestionBank,
  type MinerUQuestionBank,
} from "../lib/mineru-import";

type Props = {
  onClose: () => void;
  onSave: (bank: MinerUQuestionBank) => Promise<void>;
};

type Report = {
  files: number;
  pages: number;
  inputPages: number;
  duplicatePages: number;
  questions: number;
  answered: number;
  pending: number;
  formulas: number;
};

const formulaPattern = /(?:\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\])/g;

function formulaCount(bank: MinerUQuestionBank) {
  return bank.questions.reduce((total, question) => total
    + (question.stem.match(formulaPattern)?.length ?? 0)
    + question.options.reduce((sum, option) => sum + (option.text.match(formulaPattern)?.length ?? 0), 0), 0);
}

function chapterCounts(bank: MinerUQuestionBank) {
  const counts = new Map<string, number>();
  bank.questions.forEach((question) => counts.set(question.category || "未分章", (counts.get(question.category || "未分章") ?? 0) + 1));
  return [...counts.entries()].sort((left, right) => right[1] - left[1]);
}

function inputName(files: File[]) {
  const first = files[0]?.name.replace(/\.json$/i, "").replace(/^MinerU_/, "").replace(/__?\d{14,}$/, "") || "MinerU 题库";
  return files.length > 1 ? `${first} · 合并${files.length}份` : first;
}

export default function MinerUWorkbench({ onClose, onSave }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [bank, setBank] = useState<MinerUQuestionBank | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const chapters = useMemo(() => bank ? chapterCounts(bank) : [], [bank]);

  async function analyze(nextFiles: File[]) {
    const ordered = [...nextFiles].filter((file) => /\.json$/i.test(file.name))
      .sort((left, right) => left.name.localeCompare(right.name, "zh-CN", { numeric: true }));
    setFiles(ordered);
    setBank(null);
    setReport(null);
    setError("");
    if (!ordered.length) {
      setError("请选择 MinerU 导出的 Hybrid JSON 文件");
      return;
    }
    setBusy(true);
    try {
      const payloads: unknown[] = [];
      for (const file of ordered) {
        try {
          payloads.push(JSON.parse(await file.text()) as unknown);
        } catch {
          throw new Error(`“${file.name}”不是有效 JSON`);
        }
      }
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      const merged = mergeMineruHybridDocuments(payloads);
      const parsed = parseMineruHybridQuestionBank(merged, inputName(ordered));
      const answered = parsed.questions.filter((question) => question.answer.length > 0).length;
      setBank({
        ...parsed,
        name: parsed.name.replace(/ · MinerU导入$/, ""),
        description: [
          `Elapse MinerU 工作台 2.1.0：合并 ${ordered.length} 份 Hybrid JSON，共 ${merged.pdf_info.length} 页。`,
          parsed.description,
        ].filter(Boolean).join("\n"),
      });
      setReport({
        files: ordered.length,
        pages: merged.pdf_info.length,
        inputPages: merged._elapse_merge.inputPageCount,
        duplicatePages: merged._elapse_merge.duplicatePageCount,
        questions: parsed.questions.length,
        answered,
        pending: parsed.questions.length - answered,
        formulas: formulaCount(parsed),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "MinerU 文件整理失败");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!bank || saving) return;
    setSaving(true);
    setError("");
    try {
      await onSave(bank);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存题库失败");
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-layer mineru-workbench-layer" onMouseDown={() => !busy && !saving && onClose()}>
    <section className="mineru-workbench" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="mineru-workbench-title">
      <header><div><span>ELAPSE MINERU WORKBENCH · 2.1.0</span><h2 id="mineru-workbench-title">MinerU 题库工作台</h2><p>直接读取一份或多份 Hybrid JSON，按文件顺序拼接、去除重复页、关联答案并生成可刷题库。</p></div><button onClick={onClose} disabled={busy || saving} aria-label="关闭 MinerU 工作台"><X /></button></header>
      <div className="mineru-workbench-body">
        <section className="mineru-upload-panel">
          <FileJson />
          <div><strong>{files.length ? `已选择 ${files.length} 份 JSON` : "选择 MinerU Hybrid JSON"}</strong><p>同一本书被拆成多份时可一次全选；不需要重复上传原 PDF，也不会调用 AI 或消耗 AI 额度。</p></div>
          <button onClick={() => fileRef.current?.click()} disabled={busy || saving}><Upload />{busy ? "正在整理…" : files.length ? "重新选择" : "选择文件"}</button>
          <input ref={fileRef} type="file" accept=".json,application/json" multiple hidden onChange={(event) => { const selected = Array.from(event.target.files ?? []); if (selected.length) void analyze(selected); event.currentTarget.value = ""; }} />
        </section>
        {error && <div className="mineru-workbench-error"><AlertCircle />{error}</div>}
        {report && bank && <>
          <section className="mineru-report-grid">
            <article><Layers3 /><span><b>{report.files}</b><small>JSON 文件</small></span></article>
            <article><FileJson /><span><b>{report.pages}</b><small>有效页面{report.duplicatePages ? ` · 去重 ${report.duplicatePages}` : ""}</small></span></article>
            <article><BookOpenCheck /><span><b>{report.questions}</b><small>客观题 · 已关联 {report.answered}</small></span></article>
            <article><Sigma /><span><b>{report.formulas}</b><small>公式已启用排版</small></span></article>
          </section>
          <section className="mineru-bank-editor">
            <label><span>题库名称</span><input value={bank.name} onChange={(event) => setBank({ ...bank, name: event.target.value })} /></label>
            <label><span>题库分组</span><input value={bank.groupName} onChange={(event) => setBank({ ...bank, groupName: event.target.value })} placeholder="如：妇产科学 · 人卫" /></label>
            <label className="wide"><span>来源名称</span><input value={bank.sourceTitle} onChange={(event) => setBank({ ...bank, sourceTitle: event.target.value })} /></label>
          </section>
          <div className="mineru-quality-strip"><CheckCircle2 /><div><strong>已生成可练习版本</strong><p>{report.answered} 题已有关联答案；{report.pending ? `${report.pending} 题将以“待答案”标记入库，不会丢题。` : "没有待答案题目。"}</p></div></div>
          <section className="mineru-preview"><header><div><span>结构预览</span><strong>{chapters.length} 个章节 / 分类</strong></div><p>{chapters.slice(0, 6).map(([name, count]) => `${name} ${count}题`).join(" · ")}{chapters.length > 6 ? " …" : ""}</p></header><div>{bank.questions.slice(0, 5).map((question) => <article key={question.id}><span>{question.medicalQuestionType || (question.multiple ? "多选" : "单选")} · {question.sourceNumber}</span><strong><MathText text={question.stem} /></strong><p>{question.options.slice(0, 2).map((option) => <span key={option.label}><b>{option.label}</b><MathText text={option.text} /></span>)}</p></article>)}</div></section>
        </>}
      </div>
      <footer><span>{report ? `${report.questions} 题 · ${report.pages}/${report.inputPages} 页有效` : "先选择文件并完成结构检查"}</span><button className="ghost-action" onClick={onClose} disabled={busy || saving}>取消</button><button className="primary-action" onClick={() => void save()} disabled={!bank || busy || saving || !bank.name.trim()}><BookOpenCheck />{saving ? "正在写入题库…" : "一键保存并开始刷题"}</button></footer>
    </section>
  </div>;
}
