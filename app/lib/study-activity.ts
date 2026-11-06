import type { StudyActivity } from "./record-sync";

export function localDay(time: number) {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addStudyActivity(input: StudyActivity, session: string, from: number, to: number, result?: "correct" | "wrong" | "pending"): StudyActivity {
  const next = { ...input };
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from || to - from > 20_000) return next;
  let start = from;
  do {
    const date = new Date(start);
    const bucket = Math.floor(date.getHours() / 4);
    const boundary = new Date(date.getFullYear(), date.getMonth(), date.getDate(), (bucket + 1) * 4).getTime();
    const end = Math.min(to, boundary);
    const id = `${localDay(start)}|${bucket}|${session}`;
    const old = next[id] ?? { seconds: 0, answers: 0, graded: 0, correct: 0, start, end: start };
    const counted = end === to && result;
    next[id] = { seconds: old.seconds + (end - start) / 1000, answers: old.answers + (counted ? 1 : 0),
      graded: old.graded + (counted && result !== "pending" ? 1 : 0),
      correct: old.correct + (counted && result === "correct" ? 1 : 0), start: Math.min(start, old.start), end: Math.max(end, old.end) };
    start = end;
  } while (start < to);
  return next;
}

export function activitySummary(activity: StudyActivity, now: number) {
  const days = new Map<string, number>();
  const slots = [0, 0, 0, 0, 0, 0];
  let seconds = 0, answers = 0;
  for (const [key, row] of Object.entries(activity)) {
    const [day, slot] = key.split("|");
    seconds += row.seconds; answers += row.answers; slots[Number(slot)] += row.seconds;
    if (row.seconds > 0 || row.answers > 0) days.set(day, (days.get(day) ?? 0) + row.seconds);
  }
  const sorted = [...days.keys()].sort();
  let longest = 0, run = 0, previous = "";
  for (const day of sorted) {
    const d = new Date(day + "T12:00:00"); d.setDate(d.getDate() - 1);
    run = localDay(d.getTime()) === previous ? run + 1 : 1;
    longest = Math.max(longest, run); previous = day;
  }
  const today = localDay(now);
  const d = new Date(now); d.setDate(d.getDate() - 1);
  if (days.has(today)) d.setDate(d.getDate() + 1);
  let current = 0;
  while (days.has(localDay(d.getTime()))) { current++; d.setDate(d.getDate() - 1); }
  const max = Math.max(...slots);
  return { seconds, answers, days, slots, longest, current, bestSlot: max > 0 ? slots.indexOf(max) : null,
    perAnswer: answers ? seconds / answers : 0, perDay: days.size ? seconds / days.size : 0 };
}

export type ActivityPeriod = "day" | "week" | "month" | "year";
export function activitySeries(activity: StudyActivity, period: ActivityPeriod, time: number) {
  const anchor = new Date(time);
  const today = localDay(time);
  let labels: string[], keys: string[];
  if (period === "day") {
    labels = Array.from({ length: 6 }, (_, i) => `${i * 4}–${(i + 1) * 4}时`);
    keys = labels.map((_, i) => `${today}|${i}`);
  } else if (period === "year") {
    labels = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);
    keys = labels.map((_, i) => `${anchor.getFullYear()}-${String(i + 1).padStart(2, "0")}`);
  } else {
    const count = period === "week" ? 7 : new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
    const start = period === "week" ? new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - (anchor.getDay() + 6) % 7) : new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    keys = Array.from({ length: count }, (_, i) => localDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i).getTime()));
    labels = keys.map(key => key.slice(5));
  }
  return keys.map((key, i) => {
    const rows = Object.entries(activity).filter(([id]) => period === "day" ? id.startsWith(key + "|") : period === "year" ? id.startsWith(key) : id.startsWith(key + "|"));
    return { key, label: labels[i], seconds: rows.reduce((s, [, r]) => s + r.seconds, 0), answers: rows.reduce((s, [, r]) => s + r.answers, 0) };
  });
}
