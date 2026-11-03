"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bot, CheckCircle2, ChevronLeft, KeyRound, LockKeyhole, PlugZap, Save, ShieldCheck, Trash2 } from "lucide-react";
import { providerPresets, type ProviderId, type ProviderPreset } from "@/app/lib/ai-catalog";

type PersonalProvider = Exclude<ProviderId, "custom">;
type SavedConfig = { provider: PersonalProvider; model: string; hasKey: boolean };
type ConfigReply = { scope?: string; config?: SavedConfig | null; error?: string; message?: string; ok?: boolean; debugCode?: string };
const personalProviders = providerPresets.filter((provider): provider is ProviderPreset & { id: PersonalProvider } => provider.id !== "custom");

export default function PersonalAiPage() {
  const [providerId, setProviderId] = useState<PersonalProvider>(personalProviders[0].id);
  const [model, setModel] = useState(personalProviders[0].model);
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState<SavedConfig | null>(null);
  const [scope, setScope] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("正在读取当前账号的 AI 配置…");
  const [busy, setBusy] = useState<"save" | "test" | "clear" | "send" | "verify" | null>(null);

  const selectedProvider = useMemo(() => personalProviders.find((provider) => provider.id === providerId) ?? personalProviders[0], [providerId]);
  const hasSavedKey = Boolean(saved?.hasKey && saved.provider === providerId);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/account/ai", { cache: "no-store", signal });
      const result = await response.json() as ConfigReply;
      if (signal?.aborted) return;
      setApiKey("");
      setScope(result.scope ?? "");
      setSaved(result.config ?? null);
      if (result.config) {
        setProviderId(result.config.provider);
        setModel(result.config.model);
      }
      setMessage(result.error ?? (result.config ? "已读取当前账号的配置。✅" : "选择厂商，保存自己的 API Key 即可使用。🔑"));
    } catch {
      if (!signal?.aborted) setMessage("暂时无法读取账号配置，请刷新页面重试。");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [load]);

  function chooseProvider(provider: typeof personalProviders[number]) {
    setProviderId(provider.id);
    setModel(provider.model);
    setMessage(`已选择 ${provider.name}；填写 Key 后保存即可。`);
  }

  async function update(action: "save" | "test" | "clear") {
    if (busy || !scope) return;
    if (action !== "clear" && (!model.trim() || (!apiKey.trim() && !hasSavedKey))) {
      return setMessage("请填写模型名称和该厂商的 API Key。🔐");
    }
    setBusy(action);
    if (action === "test") setMessage("正在验证模型权限…");
    try {
      const response = await fetch(action === "test" ? "/api/ai-test" : "/api/account/ai", {
        method: action === "save" ? "PUT" : action === "test" ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json", "x-elapse-ai-scope": scope },
        ...(action === "clear" ? {} : { body: JSON.stringify({ provider: selectedProvider.id, baseUrl: selectedProvider.baseUrl, model: model.trim(), apiKey: apiKey.trim() }) }),
      });
      const result = await response.json() as ConfigReply;
      if (!response.ok) return setMessage(result.error ?? "操作失败，请稍后重试。");
      if (action === "test") {
        setMessage(result.message ?? "连接成功。点击保存后生效。✅");
      } else {
        setSaved(result.config ?? null);
        setApiKey("");
        setMessage(action === "save" ? "已加密保存至当前账号。其他账号不能使用。✅" : "当前账号的 AI 配置已清除。🧹");
      }
    } catch {
      setMessage("网络请求失败，请稍后重试。");
    } finally {
      setBusy(null);
    }
  }

  async function verify(action: "send" | "verify") {
    if (busy) return;
    setBusy(action);
    try {
      const response = await fetch("/api/account/ai/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, code }),
      });
      const result = await response.json() as ConfigReply;
      if (!response.ok) return setMessage(result.error ?? "邮箱验证失败。");
      if (action === "verify") {
        setCode("");
        await load();
      } else {
        setMessage(result.debugCode ? `本地测试验证码：${result.debugCode}` : result.message ?? "验证码已发送。");
      }
    } catch {
      setMessage("邮箱验证暂时不可用。");
    } finally {
      setBusy(null);
    }
  }

  return <main className="admin-page ai-config-page personal-ai-page">
    <header><div><span><Bot /> AveCove Elapse</span><h1>自定义AI</h1><p>每个账号只使用自己的 AI，不需要管理员批准。</p></div><nav className="admin-nav"><Link href="/"><ChevronLeft />返回刷题页</Link></nav></header>
    <section className="personal-ai-banner"><ShieldCheck /><div><strong>个人配置 · 账号隔离</strong><p>API Key 加密保存，不会回传浏览器。通过绑定邮箱验证后，同一账号在不同设备上可使用自己的配置；全站共享和旧浏览器配置不会自动沿用。</p></div></section>
    {!scope ? <form className="ai-config-card" onSubmit={(event) => { event.preventDefault(); void verify("verify"); }}>
      <div className="ai-config-intro"><span><LockKeyhole /></span><div><strong>验证当前账号的绑定邮箱</strong><p>未登录或未绑定邮箱？请从首页打开同步身份窗口完成登录和绑定。</p></div></div>
      <div className="ai-fields"><label><span>邮箱验证码</span><input type="text" inputMode="numeric" maxLength={6} autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} /></label></div>
      <div className="personal-ai-actions"><button type="button" className="personal-ai-test" disabled={Boolean(busy)} onClick={() => void verify("send")}>发送验证码</button><button className="ai-save" disabled={Boolean(busy) || !/^\d{6}$/.test(code)}>验证并继续</button></div>
      <p className="personal-ai-message" role="status">{message}</p>
    </form> : <form className="ai-config-card" onSubmit={(event) => { event.preventDefault(); void update("save"); }}>
      <div className="ai-config-intro"><span><Bot /></span><div><strong>选择 AI 厂商</strong><p>支持常用国内外厂商。接口地址固定为官方地址，模型名可以按你的账号权限修改。</p></div></div>
      <div className="provider-grid">{personalProviders.map((provider) => <button type="button" key={provider.id} className={provider.id === providerId ? "active" : ""} onClick={() => chooseProvider(provider)}><span>{provider.region}</span><strong>{provider.name}</strong><small>{provider.note}</small></button>)}</div>
      <div className="ai-fields">
        <label><span>当前厂商</span><input value={selectedProvider.name} readOnly /></label>
        <label><span>模型名称 / 接入点 ID</span><input value={model} onChange={(event) => setModel(event.target.value)} placeholder="例如 deepseek-flash（V4.1）" /></label>
        <label className="wide"><span>官方接口地址</span><input value={selectedProvider.baseUrl} readOnly /></label>
        <label className="wide"><span>个人 API Key <em>{hasSavedKey ? "当前账号已保存；留空则保持不变" : "首次配置或换厂商时必填"}</em></span><div className="secret-field"><KeyRound /><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={hasSavedKey ? "••••••••（留空不修改）" : "粘贴你自己的 API Key"} autoComplete="new-password" /></div></label>
      </div>
      <div className="ai-security-note"><LockKeyhole /><p><strong>只消耗当前账号的 AI 额度</strong><br />解析、追问和 AI 文件识别不会使用其他账号或管理员的密钥。</p></div>
      <div className="personal-ai-actions"><button className="ai-save" disabled={Boolean(busy)}><Save />保存到当前账号</button><button type="button" className="personal-ai-test" onClick={() => void update("test")} disabled={Boolean(busy)}><PlugZap />{busy === "test" ? "正在测试…" : "测试连接"}</button>{saved && <button type="button" className="personal-ai-clear" onClick={() => void update("clear")} disabled={Boolean(busy)}><Trash2 />清除个人配置</button>}</div>
      <p className="personal-ai-message" role="status">{saved && <CheckCircle2 />}{message}</p>
    </form>}
  </main>;
}
