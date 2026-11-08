"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { type UiLanguage, uiText } from "../lib/ui-preferences";

const updates = [
  { version: "v2.6.0", at: "2026-11-08T00:00:00+08:00", detail: "消息中心、古诗主页、藏经阁排序与语言入口。" },
  { version: "v2.5.2", at: "2026-11-07T00:00:00+08:00", detail: "知识书架题量更清楚，界面说明更简洁。" },
  { version: "v2.5.1", at: "2026-11-06T23:00:00+08:00", detail: "日间淡彩与夜间石墨玻璃主题。" },
  { version: "v2.5.0.1", at: "2026-11-06T22:00:00+08:00", detail: "华山论剑、答题卡批量清理已斩题。" },
  { version: "v2.5.0", at: "2026-11-06T13:00:00+08:00", detail: "个人刷题统计、热力图与时段分布。" },
].slice(0, 5);
type Item = { id: string; title: string; detail: string | null; at: string };
type Feed = { uploads: Item[]; responses: (Item & { kind: "reply" | "like" })[] };
const empty: Feed = { uploads: [], responses: [] };

export default function HomeNotifications({ accountId, language, onOpenVault }: {
  accountId?: string; language: UiLanguage; onOpenVault: () => void;
}) {
  const t = uiText(language);
  const storageKey = `elapse-notifications-seen:${accountId ?? "guest"}`;
  const [seen, setSeen] = useState(0);
  const [feed, setFeed] = useState<Feed>(empty);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(accountId ? "loading" : "ready");
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (!accountId || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    setStatus("loading");
    try {
      const response = await fetch(`/api/notifications?dayStart=${day.getTime()}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("request failed");
      const data = await response.json() as Feed;
      if (controller.signal.aborted) return;
      setFeed(data);
      setStatus("ready");
    } catch {
      if (!controller.signal.aborted) setStatus("error");
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }, [accountId]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const stored = Number(localStorage.getItem(storageKey));
        setSeen(Number.isFinite(stored) && stored > 0 ? stored : 0);
      } catch { /* optional local preference */ }
      void refresh();
    });
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 300_000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      pending.current?.abort();
      pending.current = null;
    };
  }, [refresh, storageKey]);
  const dates = [...feed.uploads, ...feed.responses, ...updates].map(item => Date.parse(item.at));
  const unread = dates.filter(at => at > seen).length;
  const markRead = () => {
    const latest = Math.max(seen, ...dates);
    setSeen(latest);
    try { localStorage.setItem(storageKey, String(latest)); } catch { /* optional local preference */ }
  };
  const responseLabel = {
    "zh-CN": ["回复了你的评论", "赞赏了你的评论"], "zh-TW": ["回覆了你的留言", "讚了你的留言"],
    en: ["replied to your comment", "liked your comment"], ja: ["がコメントに返信しました", "がコメントにいいねしました"],
    ko: ["님이 댓글에 답글을 남겼습니다", "님이 댓글을 좋아합니다"],
  }[language];
  const emptyText = accountId ? t.empty : t.login;
  return <>
    <button type="button" className="home-notification-trigger" aria-label={`${t.messages}${unread ? ` (${unread})` : ""}`} onClick={() => { dialog.current?.showModal(); void refresh(); }}>
      <Bell size={19} />{unread > 0 && <span className="notification-badge">{unread}</span>}
    </button>
    <dialog className="home-notifications" ref={dialog} aria-labelledby="notification-title">
      <header><h2 id="notification-title">{t.messages}</h2><button type="button" className="icon-button" aria-label={t.close} onClick={() => dialog.current?.close()}><X size={19} /></button></header>
      {accountId && status !== "ready" && <div className="notification-status" role="status">{status === "loading" ? t.loading : <button type="button" className="ghost-action" onClick={() => void refresh()}>{t.retry}</button>}</div>}
      <section><h3>{t.uploads}</h3>{feed.uploads.length ? <ul>{feed.uploads.map(item => <li key={item.id}><button type="button" className="notification-link" onClick={() => { dialog.current?.close(); onOpenVault(); }}>{item.title}</button>{item.detail && <p>{item.detail}</p>}</li>)}</ul> : <p>{emptyText}</p>}</section>
      <section><h3>{t.responses}</h3>{feed.responses.length ? <ul>{feed.responses.map(item => <li key={item.id}><strong>{item.title} {responseLabel[item.kind === "reply" ? 0 : 1]}</strong>{item.detail && <p>{item.detail}</p>}</li>)}</ul> : <p>{emptyText}</p>}</section>
      <section><h3>{t.releases}</h3><ul>{updates.map(update => <li key={update.version}><strong>{update.version}</strong> {update.detail}</li>)}</ul></section>
      <footer><button type="button" className="ghost-action" onClick={markRead} disabled={!unread}>{t.readAll}</button></footer>
    </dialog>
  </>;
}
