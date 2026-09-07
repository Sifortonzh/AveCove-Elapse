"use client";
/* Original authenticated scan blobs must not pass through the public image optimizer. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "./workbench.module.css";

type Source = { source_page: number; bbox: { x0: number; y0: number; x1: number; y1: number } | null; ocr_text: string };
type Question = { id: string; source_question_number: string; stem: string; source: Source[]; flags: string[]; review_status: string };
type Job = { id: string; state: string; revision: number; payload: { source_name: string; page_count: number; pages_done?: number; questions?: Question[]; issues?: string[]; error?: { message: string } } };
type Curriculum = { id: string; title: string };
const filters = ["all", "confirmed", "needs_review", "ocr_issue", "missing_answer", "missing_options", "answer_mismatch", "curriculum_uncertain", "schema_invalid"];

export default function ForgeWorkbench() {
  const [token, setToken] = useState("");
  const [courses, setCourses] = useState<Curriculum[]>([]);
  const [course, setCourse] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [selected, setSelected] = useState("");
  const [filter, setFilter] = useState("all");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pageImage, setPageImage] = useState("");
  const [anchorIndex, setAnchorIndex] = useState(0);
  const [manualPage, setManualPage] = useState(1);
  const [jobId, setJobId] = useState("");
  const sourceBox = useRef<HTMLDivElement>(null);
  const question = job?.payload.questions?.find((q) => q.id === selected);
  const source = question?.source[anchorIndex];
  const page = source?.source_page || manualPage;

  async function api(path: string, init?: RequestInit) {
    const response = await fetch(`/api/forge/${path}`, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail));
    }
    return response;
  }
  async function perform(action: () => Promise<void>) {
    setError(""); setBusy(true);
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "操作失败"); } finally { setBusy(false); }
  }
  function choose(q: Question) { setSelected(q.id); setAnchorIndex(0); setDraft(JSON.stringify(q, null, 2)); }

  useEffect(() => {
    if (!job || !token) return;
    const controller = new AbortController();
    let url = "";
    fetch(`/api/forge/jobs/${job.id}/pages/${page}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async (r) => { if (!r.ok) throw new Error("原页加载失败"); return r.blob(); })
      .then((blob) => { url = URL.createObjectURL(blob); setPageImage(url); })
      .catch((e) => { if (!controller.signal.aborted) setError(e.message); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [job?.id, page, token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { sourceBox.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [selected, anchorIndex, pageImage]);

  async function review(action: string) {
    if (!job) return;
    const result = await (await api(`jobs/${job.id}/review`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, expected_revision: job.revision, question_id: selected || null,
        ...(action === "edit" ? { question: JSON.parse(draft) } : {}), ...(action === "retry_ocr" ? { page_number: page } : {}) }) })).json() as Job;
    setJob(result); setJobId(result.id);
    const updated = result.payload.questions?.find((q) => q.id === selected);
    if (updated) setDraft(JSON.stringify(updated, null, 2)); else setSelected("");
  }

  return <main className={styles.workbench}>
    <header><div><small>ELAPSE FORGE · FOUNDATION 0.1</small><h1>扫描题库导入工作台</h1><p>上传 → OCR → 文档关联 → 人工复核 → 导出 Elapse</p></div><Link href="/">返回 Elapse</Link></header>
    <section className={styles.controls}>
      <label>工作台访问令牌<input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" /></label>
      <button disabled={busy || !token} onClick={() => perform(async () => { setCourses(await (await api("curriculums")).json()); const capability = await (await api("capabilities")).json(); if (!capability.ocr.ready) setError(capability.ocr.issues.join("；")); })}>连接与检查配置</button>
      <label>标准课程<select value={course} onChange={(e) => setCourse(e.target.value)}><option value="">暂不映射（需后续复核）</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
      <label>上传 PDF / 图片<input type="file" accept=".pdf,.png,.jpg,.jpeg" disabled={busy || !token} onChange={(e) => { const file = e.target.files?.[0]; if (file) void perform(async () => { const body = new FormData(); body.append("file", file); body.append("course_id", course); const result = await (await api("jobs", { method: "POST", body })).json(); setJob(result); setJobId(result.id); setSelected(""); }); }} /></label>
      <label>恢复任务 ID<input value={jobId} onChange={(e) => setJobId(e.target.value)} /></label><button disabled={busy || !jobId} onClick={() => perform(async () => setJob(await (await api(`jobs/${jobId}`)).json()))}>打开 / 刷新任务</button>
    </section>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {job && <><section className={styles.controls}><strong>{job.payload.source_name}</strong><span>{job.state} · 已处理 {job.payload.pages_done || 0}/{job.payload.page_count} 页</span><code>{job.id}</code>
      <button disabled={busy} onClick={() => perform(() => review("retry_parser"))}>新任务重试解析</button><button disabled={busy} onClick={() => perform(() => review("retry_ocr"))}>新任务重试当前页 OCR</button>
      <button disabled={busy} onClick={() => perform(async () => { const blob = await (await api(`jobs/${job.id}/export`)).blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "elapse-forge-export.zip"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); })}>导出已确认题目</button></section>
      {job.payload.error && <p role="alert">{job.payload.error.message}</p>}
      {Boolean(job.payload.issues?.length) && <details><summary>文档级待处理项目（{job.payload.issues?.length}）</summary><pre>{job.payload.issues?.join("\n")}</pre></details>}
      <div className={styles.layout}><aside><label>复核筛选<select value={filter} onChange={(e) => setFilter(e.target.value)}>{filters.map((f) => <option key={f}>{f}</option>)}</select></label>
        {job.payload.questions?.filter((q) => filter === "all" || q.review_status === filter || q.flags.includes(filter)).map((q) => <button key={q.id} aria-pressed={q.id === selected} onClick={() => choose(q)}>{q.source_question_number} · {q.stem.slice(0, 35)}<small>{q.review_status}</small></button>)}
        {!job.payload.questions?.length && <p>尚无题目候选。任务需由独立 worker 执行。</p>}</aside>
        <section><label>原始 PDF 页<input type="number" min={1} max={job.payload.page_count} value={page} onChange={(e) => { setSelected(""); setManualPage(Math.max(1, Math.min(job.payload.page_count, Number(e.target.value)))); }} /></label>
          {question && <select aria-label="选择来源位置" value={anchorIndex} onChange={(e) => setAnchorIndex(Number(e.target.value))}>{question.source.map((s, i) => <option key={i} value={i}>来源 {i + 1} · 第 {s.source_page} 页</option>)}</select>}
          <div className={styles.page}>{pageImage && <img src={pageImage} alt={`原始扫描第 ${page} 页`} />}{source?.bbox && <div ref={sourceBox} className={styles.bbox} style={{ left: `${source.bbox.x0 * 100}%`, top: `${source.bbox.y0 * 100}%`, width: `${(source.bbox.x1 - source.bbox.x0) * 100}%`, height: `${(source.bbox.y1 - source.bbox.y0) * 100}%` }} />}</div></section>
        <section><h2>题目复核</h2>{question ? <><p>{question.flags.join(" · ") || "结构检查通过"}</p><label>结构化编辑（第一阶段）<textarea value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} /></label><div className={styles.controls}>{[["edit", "保存编辑"], ["accept", "确认"], ["reject", "拒绝"], ["mark_uncertain", "标为不确定"]].map(([action, label]) => <button key={action} disabled={busy} onClick={() => perform(() => review(action))}>{label}</button>)}</div><details><summary>原始 OCR 文字</summary><pre>{source?.ocr_text}</pre></details></> : <p>选择一道题，定位扫描来源并检查结构。</p>}</section>
      </div></>}
  </main>;
}
