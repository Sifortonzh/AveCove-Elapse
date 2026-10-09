export type SyncFileChange = { id: string; name: string; direction: "上传" | "下载"; at: string };

export function syncHasProblem(status: string, syncing = false): boolean {
  if (syncing || /已同步|已接入|已创建/.test(status)) return false;
  return /超过|失败|不足|拒绝|离线|损坏|不支持|扩容|过大|超时|繁忙|未完成|failed|error/i.test(status);
}

export function syncErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === "TimeoutError") return "同步等待超时，本机记录保留，请重试。";
  const message = error instanceof Error ? error.message : "";
  return message && !/^(?:sync failed|failed|failed to fetch|network error)$/i.test(message)
    ? message : "同步暂时离线，本机记录仍已保存，请稍后重试。";
}
