import { allowRequest, requestFingerprint } from "@/app/lib/server/rate-limit";

export const runtime = "nodejs";

const MAX_DOC_BYTES = 20 * 1024 * 1024;
const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

export async function POST(request: Request) {
  if (!allowRequest(`legacy-doc:${requestFingerprint(request)}`, 12, 60 * 60_000)) {
    return Response.json({ error: "旧版 Word 转换请求过于频繁，请稍后再试。" }, { status: 429 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || !/\.doc$/i.test(file.name)) {
    return Response.json({ error: "请选择旧版 Word .doc 文件。" }, { status: 400 });
  }
  if (!file.size || file.size > MAX_DOC_BYTES) {
    return Response.json({ error: "旧版 Word 文件需小于 20 MB。" }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length < OLE_SIGNATURE.length || !buffer.subarray(0, OLE_SIGNATURE.length).equals(OLE_SIGNATURE)) {
    return Response.json({ error: "文件扩展名是 .doc，但内容不是可识别的旧版 Word 文档。" }, { status: 415 });
  }

  try {
    const { default: WordExtractor } = await import("word-extractor");
    const extractor = new WordExtractor();
    const document = await Promise.race([
      extractor.extract(buffer),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("legacy doc timeout")), 30_000)),
    ]);
    const text = [document.getBody(), document.getFootnotes(), document.getEndnotes(), document.getTextboxes()]
      .filter(Boolean)
      .join("\n")
      .trim()
      .slice(0, 300_000);
    if (text.replace(/\s/g, "").length < 20) {
      return Response.json({ error: "这份 .doc 没有提取到足够文字；可先用 Word 另存为 .docx 后再导入。" }, { status: 422 });
    }
    return Response.json({ text }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "旧版 Word 解析失败；文件可能已损坏、加密，或包含不兼容结构。建议另存为 .docx 后重试。" }, { status: 422 });
  }
}
