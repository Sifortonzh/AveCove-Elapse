"use client";
import { FileText, Zap } from "lucide-react";
import type { SyncFileChange } from "../lib/sync-feedback";

export default function SyncFileList({ files, syncing, onSync }: { files: SyncFileChange[]; syncing: boolean; onSync: () => void }) {
  return <section className="sync-file-list" aria-label="同步文件清单"><header><strong>📜 最近同步的题库</strong><button type="button" onClick={onSync} disabled={syncing}><Zap size={15} />{syncing ? "正在同步…" : "快速同步"}</button></header><p>仅传输新增或修改的题库；答题、笔记和设置仍会同步。不变的题库不会重复上传。</p>{files.length ? <ul>{files.map((file) => <li key={`${file.direction}-${file.id}`}><FileText size={15} /><span>{file.name}</span><small>{file.direction} · {new Date(file.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</small></li>)}</ul> : <p>本次会话尚无题库文件变动；仅同步学习记录时不会新增文件条目。</p>}</section>;
}
