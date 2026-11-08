"use client";
import { uiText, type UiLanguage } from "../lib/ui-preferences";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Trophy } from "lucide-react";
import type { RankEntry, RankMetric } from "../lib/leaderboard";
import "./study-profile.css";

export default function StudyLeaderboard({ language, loggedIn, onBack, onAccount }: { language: UiLanguage; loggedIn: boolean; onBack: () => void; onAccount: () => void }) {
  const [metric, setMetric] = useState<RankMetric>("time");
  const [result, setResult] = useState<{ entries: RankEntry[]; month: string; joined: boolean } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    await Promise.resolve();
    if (signal?.aborted) return;
    setError("");
    try {
      const response = await fetch(`/api/leaderboard?metric=${metric}`, { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (!signal?.aborted) setResult(data);
    } catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : "暂时无法读取榜单"); }
  }, [metric]);
  useEffect(() => { if (!loggedIn) return; const controller = new AbortController(); queueMicrotask(() => void load(controller.signal)); return () => controller.abort(); }, [load, loggedIn]);
  async function join() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/leaderboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ joined: !result?.joined }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败"); } finally { setBusy(false); }
  }
  const value = (entry: RankEntry) => metric === "answers" ? `${entry.answers}题` : metric === "average" ? `${entry.average}秒/题` : `${Math.floor(entry.seconds / 3600)}时${Math.floor(entry.seconds % 3600 / 60)}分`;
  const t = uiText(language);
  return <section className="study-profile study-ranking"><header className="study-profile-nav"><button onClick={onBack}><ArrowLeft size={18}/>{t.home}</button></header><section className="study-identity"><Trophy size={54}/><div><h1>{language === "zh-CN" ? "华山论剑" : t.arena}</h1><p>{result?.month ?? "本月"} · 月度前十榜</p></div></section><section className="study-panel rank-rules" aria-labelledby="rank-rules-title">
    <h2 id="rank-rules-title">榜单规则</h2>
    <ul>
      <li><strong>每月重置：</strong>只比较当月新增记录，不累计历史题量。总时长与总题数从高到低，平均用时从短到长（至少确认 10 题）。</li>
      <li><strong>自愿公开：</strong>登录用户只能看到昵称与当月汇总，不会看到题库、笔记、答案或账号标识。加入后可随时退出。</li>
      <li><strong>同步后更新：</strong>刷题后请先同步。榜单仅供自我激励，不代表成绩，暂无防刷榜审核。</li>
    </ul>
  </section>{!loggedIn ? <button onClick={onAccount}>🔐 登录后查看／加入榜单</button> : <><div className="study-period"><div role="group" aria-label="榜单排序">{([["time","总时长"],["answers","总题数"],["average","平均用时"]] as const).map(([id,label])=><button key={id} aria-pressed={metric===id} onClick={()=>{setMetric(id);setResult(null);}}>{label}</button>)}</div><button onClick={join} disabled={busy || !result}>{busy ? "正在保存…" : result?.joined ? "退出公开榜单" : "自愿加入榜单"}</button></div>{error && <p role="alert">{error}<button onClick={()=>void load()}>重试</button></p>}{!result && !error && <p role="status">正在读取榜单…</p>}{result && <><div className="rank-podium">{result.entries.slice(0,3).map((entry,index)=><article key={index} className={`rank-medal medal-${index}`}><span>{["🥇","🥈","🥉"][index]}</span><strong>{entry.nickname}{entry.own ? " · 我" : ""}</strong><b>{value(entry)}</b><small>第{index+1}名</small></article>)}</div><ol className="rank-list" start={4}>{result.entries.slice(3).map((entry,index)=><li key={index}><span>{index+4}</span><strong>{entry.nickname}{entry.own ? " · 我" : ""}</strong><b>{value(entry)}</b></li>)}</ol>{!result.entries.length && <div className="study-panel">本月暂无符合条件的记录。</div>}</>}</>}</section>;
}
