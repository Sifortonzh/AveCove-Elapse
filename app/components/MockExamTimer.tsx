"use client";

import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import { formatMockExamTime, mockExamClock } from "../lib/mock-exam";

export default function MockExamTimer({ startedAt, finishedAt, defaultMinutes }: {
  startedAt: number; finishedAt: number | null; defaultMinutes: number;
}) {
  const [mode, setMode] = useState<"elapsed" | "countdown">("elapsed");
  const [duration, setDuration] = useState(String(defaultMinutes));
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    if (finishedAt !== null) return;
    const tick = () => setNow(Date.now());
    const interval = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [finishedAt]);
  const minutes = Math.min(600, Math.max(1, Number(duration) || defaultMinutes));
  const { elapsed, remaining } = mockExamClock(startedAt, finishedAt ?? now, minutes);
  const countdown = finishedAt === null && mode === "countdown";
  const expired = countdown && remaining === 0;
  return <div className="mock-exam-clock">
    <Clock3 size={18} aria-hidden="true" />
    {finishedAt !== null ? <span>本场用时</span> : <select aria-label="计时方式" value={mode} onChange={event => setMode(event.target.value === "countdown" ? "countdown" : "elapsed")}>
      <option value="elapsed">正计时</option><option value="countdown">倒计时</option>
    </select>}
    <time role="timer" aria-live="off" className={expired ? "expired" : undefined} aria-label={countdown ? "剩余时间" : "作答用时"}>{formatMockExamTime(countdown ? remaining : elapsed)}</time>
    {countdown && <label><input aria-label="倒计时分钟数" type="number" inputMode="numeric" min={1} max={600} step={1} value={duration}
      onChange={event => { if (/^\d{0,3}$/.test(event.target.value)) setDuration(event.target.value); }} onBlur={() => setDuration(String(minutes))} />分钟</label>}
    {expired && <span className="expired" role="status">时间到</span>}
  </div>;
}
