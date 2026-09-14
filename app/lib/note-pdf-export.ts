import type { QuizQuestion } from "./question-parser";
import { hasOptionAnnotation, readOptionAnnotation } from "./note-annotations";

type Progress = Record<string, "correct" | "wrong">;

export type NoteExportSection = {
  title: string;
  questions: QuizQuestion[];
};

export function collectNoteExportSections(
  questions: QuizQuestion[],
  progress: Progress,
  favorites: string[],
  notes: Record<string, string>,
) {
  const favoriteIds = new Set(favorites);
  const assigned = new Set<string>();
  const take = (predicate: (question: QuizQuestion) => boolean) => questions.filter((question) => {
    if (assigned.has(question.id) || !predicate(question)) return false;
    assigned.add(question.id);
    return true;
  });
  const wrong = take((question) => progress[question.id] === "wrong");
  const featured = take((question) => favoriteIds.has(question.id));
  const annotated = take((question) => Boolean(notes[question.id]?.trim()) || hasOptionAnnotation(notes[question.id] ?? "")
    || Boolean(question.explanation?.trim() && /AI/i.test(question.explanationSource ?? "")));
  return [
    { title: "错题复现", questions: wrong },
    { title: "精选温习", questions: featured },
    { title: "批注与 AI 原题解析", questions: annotated },
  ].filter((section) => section.questions.length);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function inlineMarkdown(value: string) {
  return escapeHtml(value)
    .replace(/!\[[^\]]*\]\((data:image\/jpeg;base64,[A-Za-z0-9+/=]+)\)/g, '<img src="$1" alt="笔记图片">')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br>");
}

export function buildNotePdfHtml(bankName: string, sections: NoteExportSection[], notes: Record<string, string>) {
  const total = sections.reduce((sum, section) => sum + section.questions.length, 0);
  const body = sections.map((section) => `<section><h2>${escapeHtml(section.title)} <small>${section.questions.length} 题</small></h2>${section.questions.map((question) => {
    const note = notes[question.id] ?? "";
    const optionItems = question.options.map((option) => {
      const annotation = readOptionAnnotation(note, option.label);
      return `<li><b>${escapeHtml(option.label)}</b><span>${escapeHtml(option.text)}</span>${annotation.text ? `<p>✎ ${escapeHtml(annotation.text)}</p>` : ""}${annotation.images.map((image) => `<img src="${image}" alt="选项 ${escapeHtml(option.label)} 批注图片">`).join("")}</li>`;
    }).join("");
    const generalNote = note
      .replace(/^> 选项 [A-G] 批注：.*$/gm, "")
      .replace(/!\[选项 [A-G] 批注图片\]\(data:image\/jpeg;base64,[A-Za-z0-9+/=]+\)/g, "")
      .replace(/```elapse-ink\n[^`]+\n```/g, "")
      .trim();
    return `<article><header><span>${escapeHtml(question.medicalQuestionType || (question.multiple ? "多选题" : "单选题"))}</span><em>${escapeHtml(question.category)} · 原题号 ${escapeHtml(question.sourceNumber)}</em></header><h3>${escapeHtml(question.stem)}</h3><ol>${optionItems}</ol><p class="answer">答案：${escapeHtml(question.answer.join("、") || "待补录")}</p>${generalNote ? `<div class="note"><strong>笔记</strong><p>${inlineMarkdown(generalNote)}</p></div>` : ""}${question.explanation ? `<div class="explanation"><strong>原题解析</strong><p>${inlineMarkdown(question.explanation)}</p></div>` : ""}</article>`;
  }).join("")}</section>`).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(bankName)} · 学习笔记</title><style>@page{size:A4;margin:16mm}*{box-sizing:border-box}body{margin:0;color:#172724;font:11pt/1.65 "Times New Roman","Songti SC","STSong","SimSun",serif}main{max-width:780px;margin:auto}.cover{min-height:245mm;display:flex;flex-direction:column;justify-content:center;border-bottom:1px solid #ddd}.cover small{color:#b43d35;letter-spacing:.14em}.cover h1{margin:12px 0;font-size:28pt}.cover p{color:#6d7b78}h2{margin:25px 0 12px;padding-bottom:7px;border-bottom:2px solid #174b40;font-size:18pt;break-after:avoid}h2 small{color:#788682;font-size:10pt}article{padding:12px 0 18px;border-bottom:1px solid #dedbd3;break-inside:avoid}article header{display:flex;justify-content:space-between;color:#788682;font-size:9pt}article header span{color:#174b40;font-weight:700}h3{margin:8px 0 10px;font-size:13pt}ol{margin:0;padding:0;list-style:none;display:grid;gap:5px}li{display:grid;grid-template-columns:24px 1fr;gap:5px;padding:6px 8px;border:1px solid #e1ded6;border-radius:6px}li b{color:#174b40}li p,li img{grid-column:2;margin:3px 0 0}img{display:block;max-width:100%;max-height:90mm;object-fit:contain}.answer{color:#a33e35;font-weight:700}.note,.explanation{margin-top:8px;padding:9px 11px;background:#f4f1e9;border-radius:6px}.note p,.explanation p{margin:4px 0}code{font-family:monospace;background:#eee;padding:1px 3px}@media print{.cover{break-after:page}}</style></head><body><main><div class="cover"><small>AVECOVE ELAPSE · v2.1.2</small><h1>${escapeHtml(bankName)} · 学习笔记</h1><p>共 ${total} 题，按错题、精选、选项批注与 AI 原题解析整理。题目、选项和选项批注均保留。</p><p>导出时间：${new Date().toLocaleString("zh-CN")}</p></div>${body}</main></body></html>`;
}

export function printNotePdf(bankName: string, sections: NoteExportSection[], notes: Record<string, string>) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) throw new Error("浏览器阻止了导出窗口，请允许弹出窗口后重试");
  printWindow.opener = null;
  printWindow.document.open();
  printWindow.document.write(buildNotePdfHtml(bankName, sections, notes));
  printWindow.document.close();
  void printWindow.document.fonts.ready.then(() => window.setTimeout(() => printWindow.print(), 500));
}
