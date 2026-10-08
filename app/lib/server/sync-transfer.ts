import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import { MAX_SYNC_CONTENT_BYTES, MAX_SYNC_TRANSFER_BYTES } from "../sync-transfer";

const unzip = promisify(gunzip);
const zip = promisify(gzip);

export class SyncTransferError extends Error {
  constructor(message: string, public status = 413) { super(message); }
}

export async function readSyncRequest(request: Request, transferLimit = MAX_SYNC_TRANSFER_BYTES, contentLimit = MAX_SYNC_CONTENT_BYTES) {
  if (Number(request.headers.get("content-length")) > transferLimit) throw new SyncTransferError("同步传输包过大。本机数据仍保留，请先导出备份。");
  const encoding = request.headers.get("x-elapse-sync-encoding");
  if (encoding && encoding !== "gzip") throw new SyncTransferError("不支持的同步压缩格式。请刷新网页重试。", 415);
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > transferLimit) { await reader.cancel(); throw new SyncTransferError("同步传输包超过 24 MB。本机数据仍保留，请先导出备份。"); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
  }
  const input = Buffer.concat(chunks, length);
  let decoded: Buffer;
  try { decoded = encoding === "gzip" ? await unzip(input, { maxOutputLength: contentLimit }) : input; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE") throw new SyncTransferError("解压后的同步数据超过 96 MB。本机数据仍保留，请先导出备份后联系管理员扩容。");
    throw new SyncTransferError("同步压缩包损坏，请刷新网页后重试。", 400);
  }
  if (decoded.byteLength > contentLimit) throw new SyncTransferError("同步数据超过 96 MB。本机数据仍保留，请先导出备份。");
  return decoded.toString("utf8");
}

export async function syncJsonResponse(value: unknown, request: Request) {
  const json = JSON.stringify(value);
  if (request.headers.get("x-elapse-sync-accept") !== "gzip") return new Response(json, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  const compressed = await zip(json, { level: 4 });
  return new Response(new Uint8Array(compressed), { headers: { "Content-Type": "application/json", "Content-Encoding": "gzip", "Cache-Control": "no-store", "Vary": "X-Elapse-Sync-Accept" } });
}
