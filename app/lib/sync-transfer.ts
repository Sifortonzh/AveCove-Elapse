export const MAX_SYNC_TRANSFER_BYTES = 24_000_000;
export const MAX_SYNC_CONTENT_BYTES = 96_000_000;

export async function encodeSyncRequest(value: unknown): Promise<{ body: BodyInit; headers: Record<string, string>; originalBytes: number; transferBytes: number }> {
  const json = JSON.stringify(value);
  const original = new Blob([json], { type: "application/json" });
  if (original.size > MAX_SYNC_CONTENT_BYTES) throw new Error("同步数据超过 96 MB。本机数据未删除，请导出备份后联系管理员扩容；不要清除浏览器数据。");
  if (typeof CompressionStream !== "undefined") {
    const compressed = await new Response(original.stream().pipeThrough(new CompressionStream("gzip"))).blob();
    if (compressed.size > MAX_SYNC_TRANSFER_BYTES) throw new Error("压缩后的同步包仍超过 24 MB，通常是图片较多。本机数据未删除，请导出备份并联系管理员接入图片存储。");
    return { body: compressed, headers: { "Content-Type": "application/octet-stream", "X-Elapse-Sync-Encoding": "gzip" }, originalBytes: original.size, transferBytes: compressed.size };
  }
  if (original.size > MAX_SYNC_TRANSFER_BYTES) throw new Error("当前浏览器不支持压缩同步，请更新 Safari / Chrome 后重试。本机题库与记录仍保留。");
  return { body: json, headers: { "Content-Type": "application/json" }, originalBytes: original.size, transferBytes: original.size };
}
