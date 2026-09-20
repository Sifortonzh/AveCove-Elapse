import type { QuizQuestion } from "./question-parser";
import { hasOptionAnnotation, readOptionAnnotation } from "./note-annotations";

type Progress = Record<string, "correct" | "wrong">;

export type NoteExportSection = {
  title: string;
  questions: QuizQuestion[];
};

export function collectNoteExportSections(
  questions: QuizQuestion[],
  _progress: Progress,
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
  const featured = take((question) => favoriteIds.has(question.id));
  const annotated = take((question) => hasOptionAnnotation(notes[question.id] ?? "")
    || Boolean(question.explanation?.trim() && /AI/i.test(question.explanationSource ?? "")));
  return [
    { title: "精选题", questions: featured },
    { title: "批注题", questions: annotated },
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
  const body = sections.map((section) => `<section><h2>${escapeHtml(section.title)} <small>${section.questions.length} 题</small></h2><div class="question-grid">${section.questions.map((question) => {
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
    const explanationLabel = /AI/i.test(question.explanationSource ?? "") ? "AI 解析" : "原题解析";
    return `<article><header><span>${escapeHtml(question.medicalQuestionType || (question.multiple ? "多选题" : "单选题"))}</span><em>${escapeHtml(question.category)} · 原题号 ${escapeHtml(question.sourceNumber)}</em></header><h3>${escapeHtml(question.stem)}</h3><ol>${optionItems}</ol><p class="answer">答案：${escapeHtml(question.answer.join("、") || "待补录")}</p>${generalNote ? `<div class="note"><strong>笔记</strong><p>${inlineMarkdown(generalNote)}</p></div>` : ""}${question.explanation ? `<div class="explanation"><strong>${explanationLabel}</strong><p>${inlineMarkdown(question.explanation)}</p></div>` : ""}</article>`;
  }).join("")}</div></section>`).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(bankName)} · 学习笔记</title><style>@page{size:A4;margin:11mm}*{box-sizing:border-box}body{margin:0;color:#172724;font:9.5pt/1.48 "Times New Roman","Songti SC","STSong","SimSun",serif}main{max-width:100%;margin:auto}.cover{padding:0 0 8mm;border-bottom:2px solid #174b40}.cover h1{margin:0 0 4px;font-size:21pt}.cover p{margin:2px 0;color:#6d7b78}h2{margin:9mm 0 4mm;padding-bottom:4px;border-bottom:1.5px solid #174b40;font-size:15pt;break-after:avoid}.question-grid{columns:2;column-gap:8mm}article{display:inline-block;width:100%;margin:0 0 5mm;padding:0 0 4mm;border-bottom:1px solid #dedbd3;break-inside:avoid;page-break-inside:avoid}article header{display:flex;justify-content:space-between;gap:8px;color:#788682;font-size:7.5pt}article header span{color:#174b40;font-weight:700}article header em{text-align:right}h3{margin:4px 0 5px;font-size:10.5pt;line-height:1.45}ol{margin:0;padding:0;list-style:none;display:grid;gap:2px}li{display:grid;grid-template-columns:18px 1fr;gap:3px;padding:3px 5px;border:1px solid #e1ded6;border-radius:4px}li b{color:#174b40}li p,li img{grid-column:2;margin:2px 0 0}img{display:block;max-width:100%;max-height:55mm;object-fit:contain}.answer{margin:5px 0 0;color:#a33e35;font-weight:700}.note,.explanation{margin-top:4px;padding:5px 7px;background:#f4f1e9;border-radius:4px}.note p,.explanation p{margin:2px 0}code{font-family:monospace;background:#eee;padding:1px 3px}</style></head><body><main><div class="cover"><h1>${escapeHtml(bankName)} · 学习笔记</h1><p>仅收录精选题与带批注题，共 ${total} 题；保留题干、选项、答案、批注和解析来源。</p><p>导出时间：${new Date().toLocaleString("zh-CN")}</p></div>${body}</main></body></html>`;
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
