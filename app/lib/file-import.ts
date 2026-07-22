import { parseQuestionText, type QuizQuestion } from "./question-parser";

export type ImportUpdate = { phase: string; progress: number; detail: string };

export class QuestionRecognitionError extends Error {
  readonly fileName: string;
  readonly extractedText: string;

  constructor(fileName: string, extractedText: string) {
    super("普通识别没有找到完整题目与答案，可以尝试用 AI 快速整理答案区");
    this.name = "QuestionRecognitionError";
    this.fileName = fileName;
    this.extractedText = extractedText;
  }
}

export async function extractQuestionFileText(
  file: File,
  onUpdate: (update: ImportUpdate) => void,
): Promise<{ text: string; usedOcr: boolean }> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  let text = "";
  let usedOcr = false;

  if (extension === "doc") {
    onUpdate({ phase: "转换旧版 Word", progress: 12, detail: "正在本站服务器内存中提取 .doc 文字；原文件不会保存" });
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/extract-doc", { method: "POST", body: form });
    const result = await response.json() as { text?: string; error?: string };
    if (!response.ok || !result.text) throw new Error(result.error || "旧版 Word 解析失败");
    text = result.text;
  } else if (extension === "docx") {
    onUpdate({ phase: "读取 Word", progress: 18, detail: "正在提取题目与答案" });
    const mammoth = await import("mammoth/mammoth.browser");
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    text = result.value;
  } else if (extension === "pdf") {
    const result = await extractPdf(file, onUpdate);
    text = result.text;
    usedOcr = result.usedOcr;
  } else {
    throw new Error("目前仅支持 .doc、.docx、.pdf 和红豆题库 .json 文件");
  }

  return { text, usedOcr };
}

export async function importQuestionFile(
  file: File,
  onUpdate: (update: ImportUpdate) => void,
): Promise<{ questions: QuizQuestion[]; usedOcr: boolean; rawLength: number }> {
  const { text, usedOcr } = await extractQuestionFileText(file, onUpdate);

  onUpdate({ phase: "整理题库", progress: 92, detail: "正在识别题干、选项和答案" });
  const questions = parseQuestionText(text, file.name.replace(/\.(doc|docx|pdf)$/i, ""));
  if (!questions.length) {
    throw new QuestionRecognitionError(file.name, text);
  }
  onUpdate({ phase: "导入完成", progress: 100, detail: `成功识别 ${questions.length} 道题` });
  return { questions, usedOcr, rawLength: text.length };
}

async function extractPdf(file: File, onUpdate: (update: ImportUpdate) => void) {
  onUpdate({ phase: "读取 PDF", progress: 8, detail: "正在分析页面结构" });
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pageTexts: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => "str" in item ? `${item.str}${item.hasEOL ? "\n" : " "}` : "")
      .join("")
      .replace(/[ \t]+\n/g, "\n")
      .trim();
    pageTexts.push(pageText);
    onUpdate({
      phase: "提取 PDF 文字",
      progress: 10 + Math.round((pageNumber / pdf.numPages) * 35),
      detail: `已读取 ${pageNumber} / ${pdf.numPages} 页`,
    });
  }

  const extracted = pageTexts.join("\n");
  const sparsePages = pageTexts.filter((page) => page.replace(/\s/g, "").length < 30).length;
  const needsOcr = extracted.replace(/\s/g, "").length < 120 || sparsePages > pdf.numPages * 0.2;
  if (!needsOcr) return { text: extracted, usedOcr: false };

  onUpdate({ phase: "启动 OCR", progress: 48, detail: `检测到 ${sparsePages} 个扫描页，只识别缺少文字层的页面` });
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(["chi_sim", "eng"], 1, {
    logger: (message) => {
      if (message.status === "recognizing text") {
        onUpdate({ phase: "OCR 文字识别", progress: 50 + Math.round((message.progress ?? 0) * 35), detail: "正在识别当前页面" });
      }
    },
  });
  const mergedTexts = [...pageTexts];
  const pagesToOcr = pageTexts.map((pageText, index) => ({ pageText, index })).filter((item) => item.pageText.replace(/\s/g, "").length < 30);
  try {
    for (let ocrIndex = 0; ocrIndex < pagesToOcr.length; ocrIndex += 1) {
      const pageNumber = pagesToOcr[ocrIndex].index + 1;
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.6 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("浏览器无法创建 OCR 画布");
      await page.render({ canvasContext: context, viewport, canvas }).promise;
      const result = await worker.recognize(canvas);
      mergedTexts[pageNumber - 1] = result.data.text;
      onUpdate({ phase: "OCR 文字识别", progress: 50 + Math.round(((ocrIndex + 1) / pagesToOcr.length) * 38), detail: `已识别 ${ocrIndex + 1} / ${pagesToOcr.length} 个扫描页（第 ${pageNumber} 页）` });
      canvas.width = 1;
      canvas.height = 1;
    }
  } finally {
    await worker.terminate();
  }
  return { text: mergedTexts.map((pageText, index) => `[[PAGE ${index + 1}]]\n${pageText}`).join("\n"), usedOcr: true };
}
