"use client";

import { RefreshCw, AlertCircle, CheckCircle2, ChevronRight } from "lucide-react";
import { syncHasProblem } from "../lib/sync-feedback";

export default function SyncStatusNotice({ status, syncing, onSync, onDetails }: { status: string; syncing: boolean; onSync: () => void; onDetails: () => void }) {
  const problem = syncHasProblem(status, syncing);
  return <div className={`sync-notice ${problem ? "has-problem" : ""}`}>
    <div className="sync-notice-heading">{problem ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}<strong>{problem ? "同步需要处理" : syncing ? "正在同步" : "同步状态"}</strong><button type="button" className="sync-now" aria-label="立即手动同步" title="立即手动同步" onClick={onSync} disabled={syncing}><RefreshCw className={syncing ? "spinning" : ""} /></button></div>
    <p role="status" aria-live="polite">{status}</p>
    <button type="button" className="sync-notice-details" onClick={onDetails}>查看同步详情<ChevronRight size={14} /></button>
  </div>;
}
