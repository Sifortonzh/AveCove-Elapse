import { parseQuestionText, type QuizQuestion } from "./question-parser";

export type ImportUpdate = { phase: string; progress: number; detail: string };

function importCancelledError() {
  return new DOMException("导入已取消", "AbortError");
}

function assertImportActive(signal?: AbortSignal) {
  if (signal?.aborted) throw importCancelledError();
}

function pdfPageNeedsOcr(text: string) {
  const compact = text.replace(/\s/g, "");
  if (compact.length < 55) return true;
  const readable = compact.match(/[\p{L}\p{N}\p{P}\p{S}]/gu)?.length ?? 0;
  const broken = compact.match(/[�□]{1,}|(?:\b[A-Za-z]\b\s*){6,}/g)?.join("").length ?? 0;
  return readable / compact.length < 0.78 || broken / compact.length > 0.16;
}

function enhanceOcrCanvas(context: CanvasRenderingContext2D, width: number, height: number) {
  const image = context.getImageData(0, 0, width, height);
  const pixels = image.data;
  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
    const contrasted = Math.max(0, Math.min(255, (luminance - 128) * 1.32 + 128));
    pixels[index] = contrasted;
    pixels[index + 1] = contrasted;
    pixels[index + 2] = contrasted;
    pixels[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

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
  signal?: AbortSignal,
): Promise<{ text: string; usedOcr: boolean }> {
  assertImportActive(signal);
  const extension = file.name.split(".").pop()?.toLowerCase();
  let text = "";
  let usedOcr = false;

  if (extension === "doc") {
    onUpdate({ phase: "转换旧版 Word", progress: 12, detail: "正在本站服务器内存中提取 .doc 文字；原文件不会保存" });
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/extract-doc", { method: "POST", body: form, signal });
    const result = await response.json() as { text?: string; error?: string };
    if (!response.ok || !result.text) throw new Error(result.error || "旧版 Word 解析失败");
    text = result.text;
  } else if (extension === "docx") {
    onUpdate({ phase: "读取 Word", progress: 18, detail: "正在提取题目与答案" });
    const mammoth = await import("mammoth/mammoth.browser");
    assertImportActive(signal);
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    assertImportActive(signal);
    text = result.value;
  } else if (extension === "pdf") {
    const result = await extractPdf(file, onUpdate, signal);
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
  signal?: AbortSignal,
): Promise<{
  questions: QuizQuestion[];
  usedOcr: boolean;
  rawLength: number;
  answeredCount: number;
  pendingAnswerCount: number;
}> {
  const { text, usedOcr } = await extractQuestionFileText(file, onUpdate, signal);

  assertImportActive(signal);
  onUpdate({ phase: "整理题库", progress: 92, detail: "正在识别题干、选项和答案" });
  const questions = parseQuestionText(text, file.name.replace(/\.(doc|docx|pdf)$/i, ""));
  if (!questions.length) {
    throw new QuestionRecognitionError(file.name, text);
  }
  const answeredCount = questions.filter((question) => question.answer.length).length;
  const pendingAnswerCount = questions.length - answeredCount;
  onUpdate({
    phase: "导入完成",
    progress: 100,
    detail: `识别 ${questions.length} 道客观题 · 已关联答案 ${answeredCount}${pendingAnswerCount ? ` · 待答案 ${pendingAnswerCount}` : ""}`,
  });
  return { questions, usedOcr, rawLength: text.length, answeredCount, pendingAnswerCount };
}

async function extractPdf(file: File, onUpdate: (update: ImportUpdate) => void, signal?: AbortSignal) {
  onUpdate({ phase: "读取 PDF", progress: 8, detail: "正在分析页面结构" });
  assertImportActive(signal);
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const cancelLoading = () => { void loadingTask.destroy(); };
  signal?.addEventListener("abort", cancelLoading, { once: true });
  let pdf: Awaited<typeof loadingTask.promise>;
  try {
    pdf = await loadingTask.promise;
  } catch (error) {
    if (signal?.aborted) throw importCancelledError();
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancelLoading);
  }
  let pdfClosed = false;
  const closePdf = async () => {
    if (pdfClosed) return;
    pdfClosed = true;
    signal?.removeEventListener("abort", cancelPdf);
    await loadingTask.destroy();
  };
  const cancelPdf = () => { void closePdf(); };
  signal?.addEventListener("abort", cancelPdf, { once: true });
  const pageTexts: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    assertImportActive(signal);
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
  const pagesToOcr = pageTexts.map((pageText, index) => ({ pageText, index })).filter((item) => pdfPageNeedsOcr(item.pageText));
  if (!pagesToOcr.length) {
    await closePdf();
    return { text: extracted, usedOcr: false };
  }

  onUpdate({ phase: "启动 OCR", progress: 48, detail: `检测到 ${pagesToOcr.length} 个低质量或扫描页，将进行高清双语识别` });
  const { createWorker } = await import("tesseract.js");
  assertImportActive(signal);
  let currentPage = 0;
  const worker = await createWorker(["chi_sim", "eng"], 1, {
    logger: (message) => {
      if (message.status === "recognizing text") {
        onUpdate({ phase: "OCR 文字识别", progress: 50 + Math.round((message.progress ?? 0) * 34), detail: `正在识别第 ${currentPage} 页的题目与答案` });
      }
    },
  });
  const mergedTexts = [...pageTexts];
  let workerClosed = false;
  const closeWorker = async () => {
    if (workerClosed) return;
    workerClosed = true;
    await worker.terminate();
  };
  const cancelOcr = () => { void closeWorker(); };
  signal?.addEventListener("abort", cancelOcr, { once: true });
  try {
    assertImportActive(signal);
    await worker.setParameters({ preserve_interword_spaces: "1", user_defined_dpi: "300" });
    for (let ocrIndex = 0; ocrIndex < pagesToOcr.length; ocrIndex += 1) {
      assertImportActive(signal);
      const pageNumber = pagesToOcr[ocrIndex].index + 1;
      currentPage = pageNumber;
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const targetWidth = Math.min(2200, Math.max(1650, baseViewport.width * 2.6));
      const viewport = page.getViewport({ scale: targetWidth / baseViewport.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("浏览器无法创建 OCR 画布");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const renderTask = page.render({ canvasContext: context, viewport, canvas });
      const cancelRender = () => renderTask.cancel();
      signal?.addEventListener("abort", cancelRender, { once: true });
      try {
        await renderTask.promise;
      } catch (error) {
        if (signal?.aborted) throw importCancelledError();
        throw error;
      } finally {
        signal?.removeEventListener("abort", cancelRender);
      }
      enhanceOcrCanvas(context, canvas.width, canvas.height);
      const result = await worker.recognize(canvas, { rotateAuto: true });
      const recognized = result.data.text.replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n").trim();
      if (recognized.length > pagesToOcr[ocrIndex].pageText.length) mergedTexts[pageNumber - 1] = recognized;
      onUpdate({ phase: "OCR 文字识别", progress: 50 + Math.round(((ocrIndex + 1) / pagesToOcr.length) * 38), detail: `已识别 ${ocrIndex + 1} / ${pagesToOcr.length} 个扫描页（第 ${pageNumber} 页）` });
      canvas.width = 1;
      canvas.height = 1;
    }
  } catch (error) {
    if (signal?.aborted) throw importCancelledError();
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancelOcr);
    await closeWorker();
    await closePdf();
  }
  return { text: mergedTexts.map((pageText, index) => `[[PAGE ${index + 1}]]\n${pageText}`).join("\n"), usedOcr: true };
}
