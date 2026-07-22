"use client";

import { useState } from "react";
import { Bot, CheckCircle2, EyeOff, RefreshCw, ShieldCheck, UserX } from "lucide-react";
import Link from "next/link";

type ReviewComment = {
  id: string;
  question_id: string;
  nickname: string;
  body: string;
  status: string;
  moderation_reason?: string;
  reports: number;
  created_at: string;
};

export default function AdminPage() {
  const [key, setKey] = useState("");
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [message, setMessage] = useState("输入服务器设置的管理密钥后加载审核队列。");

  async function load() {
    const response = await fetch("/api/admin/comments", { headers: { Authorization: `Bearer ${key}` } });
    const result = await response.json() as { comments?: ReviewComment[]; error?: string };
    setComments(result.comments ?? []);
    setMessage(result.error ?? `已读取 ${result.comments?.length ?? 0} 条评论。`);
  }

  async function act(commentId: string, action: "publish" | "hide" | "mute") {
    const response = await fetch("/api/admin/comments", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ commentId, action, days: 7 }),
    });
    if (response.ok) await load();
  }

  return <main className="admin-page"><header><div><span><ShieldCheck /> AveCove Elapse</span><h1>评论审核台</h1><p>审核疑似敏感内容、处理举报，并对违规账号临时禁言。</p></div><nav className="admin-nav"><Link href="/admin/ai"><Bot />公共 AI 配置</Link><Link href="/">返回刷题页</Link></nav></header><section className="admin-auth"><input type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder="管理员密钥" /><button onClick={load}><RefreshCw />加载队列</button><p>{message}</p></section><section className="admin-list">{comments.map((comment) => <article key={comment.id} className={comment.status}><div className="admin-comment-head"><div><strong>{comment.nickname}</strong><span>{comment.status} · 举报 {comment.reports}</span></div><time>{new Date(comment.created_at).toLocaleString("zh-CN")}</time></div><p>{comment.body}</p><small>{comment.question_id}{comment.moderation_reason ? ` · ${comment.moderation_reason}` : ""}</small><footer><button onClick={() => act(comment.id, "publish")}><CheckCircle2 />通过</button><button onClick={() => act(comment.id, "hide")}><EyeOff />隐藏</button><button onClick={() => act(comment.id, "mute")}><UserX />禁言 7 天</button></footer></article>)}</section></main>;
}
