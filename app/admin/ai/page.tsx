"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bot, CheckCircle2, ChevronLeft, KeyRound, LockKeyhole, RefreshCw, Save, ServerCog, Sparkles } from "lucide-react";
import { providerPresets, type ProviderPreset as Provider } from "@/app/lib/ai-catalog";

type SavedConfig = { provider: Provider["id"]; baseUrl: string; model: string; hasApiKey: boolean; source: string };

export default function AiConfigPage() {
  const [adminKey, setAdminKey] = useState("");
  const [providers, setProviders] = useState<Provider[]>(providerPresets);
  const [providerId, setProviderId] = useState(providerPresets[0].id);
  const [baseUrl, setBaseUrl] = useState(providerPresets[0].baseUrl);
  const [model, setModel] = useState(providerPresets[0].model);
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [message, setMessage] = useState("输入管理密钥后读取服务器配置。");
  const [busy, setBusy] = useState(false);

  const selectedProvider = useMemo(() => providers.find((item) => item.id === providerId), [providerId, providers]);

  function applyProvider(nextId: Provider["id"]) {
    setProviderId(nextId);
    const next = providers.find((item) => item.id === nextId);
    if (next) {
      setBaseUrl(next.baseUrl);
      setModel(next.model);
    }
  }

  async function load() {
    if (!adminKey.trim()) return setMessage("请先填写管理密钥。");
    setBusy(true);
    try {
      const response = await fetch("/api/admin/ai-config", { headers: { Authorization: `Bearer ${adminKey}` } });
      const result = await response.json() as { providers?: Provider[]; config?: SavedConfig | null; error?: string };
      if (!response.ok) return setMessage(result.error ?? "配置读取失败。");
      const nextProviders = result.providers ?? [];
      setProviders(nextProviders);
      if (result.config) {
        setProviderId(result.config.provider);
        setBaseUrl(result.config.baseUrl);
        setModel(result.config.model);
        setHasApiKey(result.config.hasApiKey);
        setMessage(result.config.source === "environment" ? "当前使用 .env 中的 OpenAI 配置；保存后将切换为后台配置。" : "已读取服务器上的 AI 配置。");
      } else {
        const first = nextProviders[0];
        if (first) {
          setProviderId(first.id);
          setBaseUrl(first.baseUrl);
          setModel(first.model);
        }
        setMessage("尚未配置 AI，请选择厂商并填写密钥。");
      }
    } catch {
      setMessage("配置服务暂时无法连接。");
    } finally {
      setBusy(false);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!adminKey.trim()) return setMessage("请先填写管理密钥。");
    setBusy(true);
    try {
      const response = await fetch("/api/admin/ai-config", {
        method: "PUT",
        headers: { Authorization: `Bearer ${adminKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId, baseUrl, model, apiKey }),
      });
      const result = await response.json() as { message?: string; error?: string };
      setMessage(result.message ?? result.error ?? "配置未保存。");
      if (response.ok) {
        setApiKey("");
        setHasApiKey(true);
      }
    } catch {
      setMessage("保存失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  return <main className="admin-page ai-config-page">
    <header><div><span><Bot /> AveCove Elapse</span><h1>自定义AI</h1><p>在服务器端选择厂商、模型与接口地址，浏览器不会读取已保存的密钥。</p></div><nav className="admin-nav"><Link href="/admin"><ChevronLeft />评论审核</Link><Link href="/">返回刷题页</Link></nav></header>
    <section className="admin-auth"><input type="password" value={adminKey} onChange={(event) => setAdminKey(event.target.value)} placeholder="管理员密钥" autoComplete="current-password" /><button onClick={load} disabled={busy}><RefreshCw />{busy ? "正在读取" : "读取配置"}</button><p>{message}</p></section>
    <form className="ai-config-card" onSubmit={save}>
      <div className="ai-config-intro"><span><Sparkles /></span><div><strong>多厂商接入</strong><p>预置国内外常用厂商，也支持 OpenAI 兼容的自定义网关。接口地址和模型名都可以修改。</p></div></div>
      <div className="provider-grid">{providers.length ? providers.map((provider) => <button type="button" key={provider.id} className={provider.id === providerId ? "active" : ""} onClick={() => applyProvider(provider.id)}><span>{provider.region}</span><strong>{provider.name}</strong><small>{provider.note}</small></button>) : <div className="provider-empty"><ServerCog /><p>厂商列表暂时不可用，请刷新页面重试。</p></div>}</div>
      <div className="ai-fields">
        <label><span>当前厂商</span><input value={selectedProvider?.name ?? providerId} readOnly /></label>
        <label><span>模型名称 / 接入点 ID</span><input value={model} onChange={(event) => setModel(event.target.value)} placeholder="例如 deepseek-chat" /></label>
        <label className="wide"><span>接口地址</span><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" /></label>
        <label className="wide"><span>API Key <em>{hasApiKey ? "已安全保存；留空则保持不变" : "首次配置必填"}</em></span><div className="secret-field"><KeyRound /><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={hasApiKey ? "••••••••（留空不修改）" : "粘贴厂商 API Key"} autoComplete="new-password" /></div></label>
      </div>
      <div className="ai-security-note"><LockKeyhole /><p><strong>密钥只在服务端使用</strong><br />保存后采用 AES-256-GCM 加密写入数据库；管理界面只显示“已配置”，不会回传明文。</p></div>
      <button className="ai-save" disabled={busy || !providers.length}><Save />{busy ? "正在保存…" : "保存 AI 配置"}</button>
      {hasApiKey && <span className="ai-ready"><CheckCircle2 />已有可用密钥配置</span>}
    </form>
  </main>;
}
