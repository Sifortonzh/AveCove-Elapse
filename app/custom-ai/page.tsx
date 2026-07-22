"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bot, CheckCircle2, ChevronLeft, KeyRound, LockKeyhole, Save, ShieldCheck, Trash2 } from "lucide-react";
import { providerPresets, type ProviderPreset } from "@/app/lib/ai-catalog";
import {
  clearPersonalAiConfig, readPersonalAiConfig, savePersonalAiConfig, type PersonalAiConfig,
} from "@/app/lib/personal-ai";

const personalProviders = providerPresets.filter((provider): provider is ProviderPreset & { id: PersonalAiConfig["provider"] } => provider.id !== "custom");

export default function PersonalAiPage() {
  const [providerId, setProviderId] = useState<PersonalAiConfig["provider"]>(personalProviders[0].id);
  const [model, setModel] = useState(personalProviders[0].model);
  const [apiKey, setApiKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [message, setMessage] = useState("选择厂商，填写自己的 API Key 即可使用；不需要管理员批准。🔑✨");

  const selectedProvider = useMemo(() => personalProviders.find((provider) => provider.id === providerId) ?? personalProviders[0], [providerId]);

  useEffect(() => {
    const saved = readPersonalAiConfig();
    if (!saved) return;
    const timer = window.setTimeout(() => {
      setProviderId(saved.provider);
      setModel(saved.model);
      setSavedKey(saved.apiKey);
      setMessage("已读取当前浏览器中的个人 AI 配置。只在这台设备上生效。✅");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function chooseProvider(provider: typeof personalProviders[number]) {
    setProviderId(provider.id);
    setModel(provider.model);
    setMessage(`已选择 ${provider.name}；填写 Key 后保存即可。`);
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    const nextKey = apiKey.trim() || savedKey;
    if (!nextKey) return setMessage("请填写该厂商提供的 API Key。🔐");
    if (!model.trim()) return setMessage("请填写有效的模型名称或接入点 ID。");
    savePersonalAiConfig({
      provider: selectedProvider.id,
      baseUrl: selectedProvider.baseUrl,
      model: model.trim(),
      apiKey: nextKey,
    });
    setSavedKey(nextKey);
    setApiKey("");
    setMessage(`${selectedProvider.name} 已在当前浏览器启用，“知微”和 AI 题库识别可以直接使用了。🫘🤖✨`);
  }

  function remove() {
    clearPersonalAiConfig();
    setSavedKey("");
    setApiKey("");
    setMessage("个人 AI 配置已从当前浏览器清除。🧹");
  }

  return <main className="admin-page ai-config-page personal-ai-page">
    <header><div><span><Bot /> AveCove Elapse</span><h1>自定义AI</h1><p>每个人都可以接入自己的 AI，不需要管理员同意，也不会占用站点公共密钥。</p></div><nav className="admin-nav"><Link href="/"><ChevronLeft />返回刷题页</Link></nav></header>
    <section className="personal-ai-banner"><ShieldCheck /><div><strong>个人配置 · 当前设备专属</strong><p>配置保存在此浏览器的本地存储中，不写入站点数据库；调用时经 HTTPS 临时转发给所选 AI 厂商。请勿在公共设备保存 Key。</p></div></section>
    <form className="ai-config-card" onSubmit={save}>
      <div className="ai-config-intro"><span><Bot /></span><div><strong>选择 AI 厂商</strong><p>支持常用国内外厂商。接口地址固定为官方地址，模型名可以按你的账号权限修改。</p></div></div>
      <div className="provider-grid">{personalProviders.map((provider) => <button type="button" key={provider.id} className={provider.id === providerId ? "active" : ""} onClick={() => chooseProvider(provider)}><span>{provider.region}</span><strong>{provider.name}</strong><small>{provider.note}</small></button>)}</div>
      <div className="ai-fields">
        <label><span>当前厂商</span><input value={selectedProvider.name} readOnly /></label>
        <label><span>模型名称 / 接入点 ID</span><input value={model} onChange={(event) => setModel(event.target.value)} placeholder="例如 deepseek-chat" /></label>
        <label className="wide"><span>官方接口地址</span><input value={selectedProvider.baseUrl} readOnly /></label>
        <label className="wide"><span>个人 API Key <em>{savedKey ? "已保存在当前浏览器；留空则保持不变" : "首次配置必填"}</em></span><div className="secret-field"><KeyRound /><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={savedKey ? "••••••••（留空不修改）" : "粘贴你自己的 API Key"} autoComplete="new-password" /></div></label>
      </div>
      <div className="ai-security-note"><LockKeyhole /><p><strong>无需管理员权限</strong><br />保存后，刷题解析、连续追问和 AI 文件识别会优先使用你的个人配置；没有个人配置时，才回退到站点公共 AI。</p></div>
      <div className="personal-ai-actions"><button className="ai-save"><Save />保存到当前浏览器</button>{savedKey && <button type="button" className="personal-ai-clear" onClick={remove}><Trash2 />清除个人配置</button>}</div>
      <p className="personal-ai-message">{savedKey && <CheckCircle2 />}{message}</p>
    </form>
  </main>;
}
