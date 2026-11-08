"use client";
import { uiText, type UiLanguage } from "../lib/ui-preferences";

import { useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Clock3, Flame, UserRound } from "lucide-react";
import type { StudyActivity } from "../lib/record-sync";
import { activitySeries, activitySummary, localDay, type ActivityPeriod } from "../lib/study-activity";
import "./study-profile.css";
import AccountAvatar from "./AccountAvatar";

function duration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${Math.floor(minutes / 60)}时${String(minutes % 60).padStart(2, "0")}分`;
}
const periods: [ActivityPeriod, string][] = [["day", "日"], ["week", "周"], ["month", "月"], ["year", "年"]];
const slots = Array.from({ length: 6 }, (_, i) => `${i * 4}–${(i + 1) * 4}时`);

export default function StudyProfile({ language, nickname, account, activity, progress, onBack, onAccount }: {
  language: UiLanguage;
  nickname: string; account: { id: string; email?: string; avatarSlot?: number } | null; activity: StudyActivity;
  progress: Record<string, "correct" | "wrong">; onBack: () => void; onAccount: () => void;
}) {
  const [period, setPeriod] = useState<ActivityPeriod>("week");
  const [detail, setDetail] = useState("");
  const [anchor, setAnchor] = useState(() => Date.now());
  const [today] = useState(() => Date.now());
  const summary = useMemo(() => activitySummary(activity, today), [activity, today]);
  const series = useMemo(() => activitySeries(activity, period, anchor), [activity, period, anchor]);
  const answered = Object.keys(progress).length;
  const accuracy = answered ? Math.round(Object.values(progress).filter(v => v === "correct").length / answered * 1000) / 10 : 0;
  const maximum = Math.max(60, ...series.map(row => row.seconds));
  const points = series.map((row, i) => `${32 + i * 736 / Math.max(1, series.length - 1)},${164 - row.seconds / maximum * 140}`).join(" ");
  const heatmap = useMemo(() => {
    if (period !== "year") return series;
    const year = new Date(anchor).getFullYear();
    const start = new Date(year, 0, 1), end = new Date(year + 1, 0, 1);
    const rows = [];
    for (const day = new Date(start); day < end; day.setDate(day.getDate() + 1)) {
      const key = localDay(day.getTime());
      rows.push({ key, label: key, seconds: summary.days.get(key) ?? 0 });
    }
    return rows;
  }, [period, anchor, series, summary]);
  const bands = series.map(row => ({ ...row, slots: slots.map((_, slot) => Object.entries(activity)
    .filter(([key]) => period === "day" ? key.startsWith(`${localDay(anchor)}|${slot}|`) : key.startsWith(row.key) && key.split("|")[1] === String(slot))
    .reduce((sum, [, value]) => sum + value.seconds, 0)) }));
  const bandMaximum = Math.max(1, ...bands.flatMap(row => row.slots));
  function move(direction: number) {
    const date = new Date(anchor);
    if (period === "year") date.setFullYear(date.getFullYear() + direction);
    else if (period === "month") { date.setDate(1); date.setMonth(date.getMonth() + direction); }
    else date.setDate(date.getDate() + direction * (period === "week" ? 7 : 1));
    setAnchor(date.getTime());
  }
  const title = period === "year" ? `${new Date(anchor).getFullYear()}年` : period === "month" ? `${new Date(anchor).getFullYear()}年${new Date(anchor).getMonth() + 1}月` : period === "week" ? `${series[0].label} — ${series.at(-1)?.label}` : localDay(anchor);
  const t = uiText(language);
  return <section className="study-profile" aria-label={t.profile}>
    <header className="study-profile-nav"><button onClick={onBack}><ArrowLeft size={18} />{t.home}</button><button onClick={onAccount}><UserRound size={18} />{account ? "管理账号" : "登录同步"}</button></header>
    <section className="study-identity"><button className="study-avatar" onClick={onAccount} aria-label="管理个人身份"><AccountAvatar slot={account?.avatarSlot} nickname={nickname} /></button><div><h1>{nickname}</h1></div></section>
    <section className="study-totals" aria-label="累计学习数据" aria-describedby="study-timing-note"><div><span><Clock3 size={17} />累计刷题时长 <sup aria-hidden="true">*</sup></span><strong className="study-clock">{Math.floor(summary.seconds / 3600)}<small>时</small>{String(Math.floor(summary.seconds % 3600 / 60)).padStart(2,"0")}<small>分</small></strong></div><div><span>已答题量</span><b>{answered.toLocaleString()}<small>题</small></b></div></section>
    <section className="study-metrics"><div><b>{summary.answers ? `${Math.round(summary.perAnswer)}秒` : "—"}</b><span>平均每题用时</span></div><div><b>{duration(summary.perDay)}</b><span>平均每日用时</span></div><div><b>{answered ? `${accuracy}%` : "—"}</b><span>当前平均正确率</span></div><div><b>{summary.longest}天</b><span>最长连续学习</span></div><div><b><Flame size={19} />{summary.current}天</b><span>当前连续学习</span></div></section>
    <div className="study-period"><div role="group" aria-label="统计周期">{periods.map(([id, label]) => <button key={id} aria-pressed={id === period} onClick={() => setPeriod(id)}>{label}</button>)}</div><div className="study-date"><button aria-label="上一周期" onClick={() => move(-1)}><ChevronLeft size={18} /></button><strong>{title}</strong><button aria-label="下一周期" onClick={() => move(1)}><ChevronRight size={18} /></button><button onClick={() => setAnchor(Date.now())}>今天</button></div></div>
    <div className="study-chart-grid"><article className="study-panel"><header><h2>学习热力图</h2><span>本期 {duration(series.reduce((s, r) => s + r.seconds, 0))}</span></header><div className={`study-heatmap ${period === "year" ? "annual" : ""}`}>{heatmap.map(row => <button key={row.key} onClick={() => setDetail(`${row.label} · ${duration(row.seconds)}`)} style={{ "--level": row.seconds ? Math.min(1, .18 + row.seconds / 7200) : 0 } as React.CSSProperties} aria-label={`${row.label} ${duration(row.seconds)}`} title={`${row.label} · ${duration(row.seconds)}`}>{period !== "year" && <span>{row.label}</span>}</button>)}</div><p className="study-chart-hint" aria-live="polite">{detail}</p></article>
    <article className="study-panel"><header><h2>学习趋势</h2><span>纵轴：分钟</span></header><svg className="study-line" viewBox="0 0 800 200" role="img" aria-label={`${title}学习时长趋势`}><title>{series.map(row => `${row.label}：${Math.round(row.seconds / 60)}分钟`).join("；")}</title>{[0, .5, 1].map(ratio => <g key={ratio}><line x1="32" x2="780" y1={164 - ratio * 140} y2={164 - ratio * 140} stroke="var(--line)" /><text x="0" y={169 - ratio * 140}>{Math.round(maximum / 60 * ratio)}</text></g>)}<polyline points={points} fill="none" stroke="var(--bean)" strokeWidth="3" />{series.map((row, i) => <circle key={row.key} cx={32 + i * 736 / Math.max(1, series.length - 1)} cy={164 - row.seconds / maximum * 140} r="4" fill="var(--bean)"><title>{row.label} · {duration(row.seconds)}</title></circle>)}</svg><div className="study-axis"><span>{series[0].label}</span><span>{series.at(-1)?.label}</span></div></article></div>
    <article className="study-panel study-band-panel"><header><h2>学习时间分布</h2><span>{summary.bestSlot === null ? "还没有计时数据" : `最常刷题：${slots[summary.bestSlot]}（累计）`}</span></header><div className="study-band-scroll"><div className="study-band-head"><span>日期／时段</span>{slots.map(slot => <span key={slot}>{slot}</span>)}</div>{(period === "day" ? bands.slice(0, 1) : bands).map(row => <div className="study-band-row" key={row.key}><span>{period === "day" ? localDay(anchor) : row.label}</span>{row.slots.map((seconds, i) => <button key={i} aria-label={`${row.label} ${slots[i]} ${duration(seconds)}`} title={`${slots[i]} · ${duration(seconds)}`} style={{ "--level": seconds ? .2 + seconds / bandMaximum * .8 : 0 } as React.CSSProperties}>{seconds > 0 ? `${Math.round(seconds / 60)}分` : "—"}</button>)}</div>)}</div></article>
    <footer className="ui-footnote" id="study-timing-note">* 用时自 v2.5.0 起统计，仅累计前台刷题，90 秒无操作后暂停。精选复刷与独立考试不计入日常答题量和正确率。</footer>
  </section>;
}
