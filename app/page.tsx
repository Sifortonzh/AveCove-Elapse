"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  AlertCircle, ArrowRight, BookOpen, Bot, BrainCircuit, Check, CheckCircle2,
  ChevronLeft, ChevronRight, CircleHelp, Clock3, Cloud, Download, FileText, Flag, Home, Import,
  Library, Lightbulb, ListChecks, MessageCircle, Moon, NotebookPen, Play,
  RefreshCw, RotateCcw, ScanText, Search, Send, Settings2, ShieldCheck, Shuffle, Sparkles, Star,
  Sun, Target, ThumbsUp, Trash2, Upload, UserRound, X, Zap,
} from "lucide-react";
import questionBank from "./questions.json";
import { importQuestionFile, type ImportUpdate } from "./lib/file-import";
import { clearActiveBank, loadActiveBank, saveActiveBank } from "./lib/local-bank";
import type { QuizQuestion } from "./lib/question-parser";

type Progress = Record<string, "correct" | "wrong">;
type Scope = "all" | "unanswered" | "wrong" | "favorite";
type AiMode = "summary" | "pitfall" | "companion";
type View = "home" | "quiz" | "copyright";
type AiMessage = { role: "user" | "assistant"; text: string };
type SharedComment = { id: string; nickname: string; text: string; createdAt: string; likes: number; own?: boolean; status?: string };
type AccountSession = { nickname: string; email?: string; expiresAt: number };
type Settings = {
  scope: Scope;
  questionOrder: "sequential" | "random";
  shuffleOptions: boolean;
  autoNext: boolean;
  autoFavoriteWrong: boolean;
  darkMode: boolean;
};

const defaultSettings: Settings = {
  scope: "all",
  questionOrder: "sequential",
  shuffleOptions: false,
  autoNext: false,
  autoFavoriteWrong: true,
  darkMode: false,
};

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export default function HomePage() {
  const [view, setView] = useState<View>("home");
  const [questions, setQuestions] = useState<QuizQuestion[]>(questionBank as QuizQuestion[]);
  const [bankName, setBankName] = useState("演示题库");
  const [sessionQuestions, setSessionQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [progress, setProgress] = useState<Progress>({});
  const [favorites, setFavorites] = useState<string[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [showAnswerSheet, setShowAnswerSheet] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showMobilePanel, setShowMobilePanel] = useState(false);
  const [importState, setImportState] = useState<ImportUpdate>({ phase: "等待文件", progress: 0, detail: "支持 Word、文字 PDF 和扫描 PDF" });
  const [importError, setImportError] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [aiMode, setAiMode] = useState<AiMode>("summary");
  const [aiTexts, setAiTexts] = useState<Partial<Record<AiMode, string>>>({});
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [nickname, setNickname] = useState("红豆同学");
  const [comments, setComments] = useState<Record<string, SharedComment[]>>({});
  const [account, setAccount] = useState<AccountSession | null>(null);
  const [showAccount, setShowAccount] = useState(false);
  const [syncReady, setSyncReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState("尚未开启多端同步");
  const [toast, setToast] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;

    async function restoreLocalData() {
      await Promise.resolve();
      if (!active) return;
      try {
        setProgress(JSON.parse(localStorage.getItem("hongdou-progress") ?? localStorage.getItem("medquiz-progress") ?? "{}"));
        setFavorites(JSON.parse(localStorage.getItem("hongdou-favorites") ?? "[]"));
        setNotes(JSON.parse(localStorage.getItem("hongdou-notes") ?? "{}"));
        setSettings({ ...defaultSettings, ...JSON.parse(localStorage.getItem("hongdou-settings") ?? "{}") });
        setNickname(localStorage.getItem("hongdou-nickname") ?? "红豆同学");
      } catch {
        // Ignore invalid local data and keep safe defaults.
      }

      const saved = await loadActiveBank().catch(() => undefined);
      if (!active || !saved?.questions.length) return;
      setQuestions(saved.questions);
      setBankName(saved.name);
    }

    void restoreLocalData();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function restoreAccount() {
      try {
        const response = await fetch("/api/auth/session");
        const result = await response.json() as { user?: AccountSession | null };
        if (!active || !result.user) return;
        setAccount(result.user);
        setNickname(result.user.nickname);
        await pullRemoteState();
      } catch {
        // The local-only experience remains available when the server is offline.
      }
    }
    void restoreAccount();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!account || !syncReady) return;
    const timer = window.setTimeout(async () => {
      setSyncStatus("正在安全同步… ☁️");
      try {
        const response = await fetch("/api/sync", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: { progress, favorites, notes, settings, nickname } }),
        });
        if (!response.ok) throw new Error("sync failed");
        setSyncStatus(`已同步 · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} ☁️`);
      } catch {
        setSyncStatus("同步暂时离线，本机记录仍已保存");
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [account, favorites, nickname, notes, progress, settings, syncReady]);

  const current = sessionQuestions[currentIndex];
  const currentId = current?.id;
  useEffect(() => {
    if (!currentId) return;
    let active = true;
    void fetch(`/api/comments?questionId=${encodeURIComponent(currentId)}`)
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((result: { comments?: SharedComment[] }) => {
        if (active) setComments((value) => ({ ...value, [currentId]: result.comments ?? [] }));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [account, currentId]);

  const answered = Object.keys(progress).filter((id) => questions.some((question) => question.id === id)).length;
  const correct = Object.values(progress).filter((value) => value === "correct").length;
  const wrong = Object.values(progress).filter((value) => value === "wrong").length;
  const accuracy = answered ? Math.round((correct / answered) * 100) : 0;
  const isFavorite = current ? favorites.includes(current.id) : false;

  const homeProgress = Math.min(100, Math.round((answered / Math.max(questions.length, 1)) * 100));
  const scopeCounts = useMemo(() => ({
    all: questions.length,
    unanswered: questions.filter((question) => !progress[question.id]).length,
    wrong: questions.filter((question) => progress[question.id] === "wrong").length,
    favorite: questions.filter((question) => favorites.includes(question.id)).length,
  }), [favorites, progress, questions]);

  function saveSettings(next: Settings) {
    setSettings(next);
    localStorage.setItem("hongdou-settings", JSON.stringify(next));
  }

  function applyLearningState(state: Record<string, unknown>) {
    if (state.progress && typeof state.progress === "object" && !Array.isArray(state.progress)) {
      setProgress(state.progress as Progress);
      localStorage.setItem("hongdou-progress", JSON.stringify(state.progress));
    }
    if (Array.isArray(state.favorites)) {
      const next = state.favorites.filter((item): item is string => typeof item === "string");
      setFavorites(next);
      localStorage.setItem("hongdou-favorites", JSON.stringify(next));
    }
    if (state.notes && typeof state.notes === "object" && !Array.isArray(state.notes)) {
      setNotes(state.notes as Record<string, string>);
      localStorage.setItem("hongdou-notes", JSON.stringify(state.notes));
    }
    if (state.settings && typeof state.settings === "object" && !Array.isArray(state.settings)) {
      const next = { ...defaultSettings, ...(state.settings as Partial<Settings>) };
      setSettings(next);
      localStorage.setItem("hongdou-settings", JSON.stringify(next));
    }
    if (typeof state.nickname === "string" && state.nickname.trim()) saveNickname(state.nickname);
  }

  async function pullRemoteState(showMessage = false) {
    setSyncStatus("正在读取云端学习记录… ☁️");
    try {
      const response = await fetch("/api/sync");
      if (!response.ok) throw new Error("sync unavailable");
      const result = await response.json() as { state?: { payload?: Record<string, unknown> } | null };
      if (result.state?.payload && Object.keys(result.state.payload).length) applyLearningState(result.state.payload);
      setSyncReady(true);
      setSyncStatus(result.state ? "云端记录已接入 ☁️✨" : "同步空间已创建，正在上传本机记录 ☁️");
      if (showMessage) setToast("多端学习记录已刷新 ☁️✨");
    } catch {
      setSyncReady(false);
      setSyncStatus("同步服务暂时离线，本机记录仍安全保存");
    }
  }

  async function finishAuthentication(user: AccountSession) {
    setAccount(user);
    saveNickname(user.nickname);
    setSyncReady(false);
    await pullRemoteState();
    setShowAccount(false);
    setToast("身份已接入 🔐☁️ 现在换台设备，也能接着上次的进度继续学 ✨");
    window.setTimeout(() => setToast(""), 4600);
  }

  async function logoutAccount() {
    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
    setAccount(null);
    setSyncReady(false);
    setSyncStatus("尚未开启多端同步");
    setShowAccount(false);
    setToast("已退出同步身份，本机学习记录仍然保留 🌿");
  }

  async function deleteAccount() {
    if (!window.confirm("确定注销同步身份吗？云端学习记录和评论将永久删除，本机记录仍会保留。")) return;
    const response = await fetch("/api/account", { method: "DELETE" });
    if (!response.ok) return setToast("暂时无法注销，请稍后再试。");
    setAccount(null);
    setSyncReady(false);
    setShowAccount(false);
    setToast("云端身份与相关数据已删除。本机题库和学习记录没有受到影响。");
  }

  function exportLearningRecord() {
    const content = JSON.stringify({ product: "AveCove Elapse", version: 1, exportedAt: new Date().toISOString(), state: { progress, favorites, notes, settings, nickname } }, null, 2);
    const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `红豆生南国-学习记录-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importLearningRecord(file: File) {
    try {
      const data = JSON.parse(await file.text()) as { product?: string; state?: Record<string, unknown> };
      if (!data.state || typeof data.state !== "object") throw new Error("invalid");
      applyLearningState(data.state);
      setToast("学习记录已接回来了 📚☁️ 熟悉的进度，一步都没有落下 ✨");
    } catch {
      setToast("这份学习记录无法识别，请选择从本产品导出的 JSON 文件。");
    }
  }

  function buildSession(custom?: Partial<Settings>) {
    const active = { ...settings, ...custom };
    let pool = questions.filter((question) => {
      if (active.scope === "unanswered") return !progress[question.id];
      if (active.scope === "wrong") return progress[question.id] === "wrong";
      if (active.scope === "favorite") return favorites.includes(question.id);
      return true;
    });
    if (active.questionOrder === "random") pool = shuffle(pool);
    if (active.shuffleOptions) pool = pool.map((question) => ({ ...question, options: shuffle(question.options) }));
    setSessionQuestions(pool);
    setCurrentIndex(0);
    setSelected([]);
    setSubmitted(false);
    setAiTexts({});
    setAiMessages([]);
    setView("quiz");
    setShowSettings(false);
  }

  function openPractice(custom?: Partial<Settings>) {
    if (custom) {
      const next = { ...settings, ...custom };
      saveSettings(next);
      buildSession(custom);
    } else {
      setShowSettings(true);
    }
  }

  function resetQuestion(nextIndex: number) {
    setCurrentIndex(Math.max(0, Math.min(nextIndex, sessionQuestions.length - 1)));
    setSelected([]);
    setSubmitted(false);
    setAiTexts({});
    setAiMessages([]);
    setAiMode("summary");
  }

  function openQuestion(questionId: string) {
    const index = questions.findIndex((question) => question.id === questionId);
    if (index < 0) return;
    setSessionQuestions(questions);
    setCurrentIndex(index);
    setSelected([]);
    setSubmitted(false);
    setAiTexts({});
    setAiMessages([]);
    setView("quiz");
    setShowSearch(false);
    setShowNotes(false);
  }

  function toggleOption(label: string) {
    if (!current || submitted) return;
    if (current.multiple) {
      setSelected((value) => value.includes(label) ? value.filter((item) => item !== label) : [...value, label]);
    } else {
      setSelected([label]);
    }
  }

  function submitAnswer() {
    if (!current || !selected.length) return;
    const result = [...selected].sort().join("") === [...current.answer].sort().join("") ? "correct" : "wrong";
    const nextProgress = { ...progress, [current.id]: result as "correct" | "wrong" };
    setProgress(nextProgress);
    localStorage.setItem("hongdou-progress", JSON.stringify(nextProgress));
    if (result === "wrong" && settings.autoFavoriteWrong && !favorites.includes(current.id)) {
      const nextFavorites = [...favorites, current.id];
      setFavorites(nextFavorites);
      localStorage.setItem("hongdou-favorites", JSON.stringify(nextFavorites));
    }
    setSubmitted(true);
    if (settings.autoNext && result === "correct") window.setTimeout(() => resetQuestion(currentIndex + 1), 700);
  }

  function toggleFavorite() {
    if (!current) return;
    const next = isFavorite ? favorites.filter((id) => id !== current.id) : [...favorites, current.id];
    setFavorites(next);
    localStorage.setItem("hongdou-favorites", JSON.stringify(next));
  }

  function updateNote(value: string) {
    if (!current) return;
    const next = { ...notes, [current.id]: value };
    setNotes(next);
    localStorage.setItem("hongdou-notes", JSON.stringify(next));
  }

  async function askAi(mode: AiMode) {
    if (!current) return;
    setAiMode(mode);
    if (!submitted) return;
    if (aiTexts[mode]) return;
    setAiLoading(true);
    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: current, mode }),
      });
      const result = await response.json() as { explanation?: string; error?: string };
      setAiTexts((value) => ({ ...value, [mode]: result.explanation ?? result.error ?? "暂时没有生成内容。" }));
    } catch {
      setAiTexts((value) => ({ ...value, [mode]: "AI 服务暂时不可用，部署时配置密钥即可启用。" }));
    } finally {
      setAiLoading(false);
    }
  }

  async function askFollowUp(text: string) {
    if (!current || !submitted || !text.trim() || aiLoading) return;
    const question = text.trim().slice(0, 500);
    const nextMessages: AiMessage[] = [...aiMessages, { role: "user", text: question }];
    setAiMode("companion");
    setAiMessages(nextMessages);
    setAiLoading(true);
    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: current, mode: "companion", followUp: question, history: aiMessages.slice(-6) }),
      });
      const result = await response.json() as { explanation?: string; error?: string };
      setAiMessages((value) => [...value, { role: "assistant", text: result.explanation ?? result.error ?? "暂时没有生成内容。" }]);
    } catch {
      setAiMessages((value) => [...value, { role: "assistant", text: "AI 服务暂时不可用，部署时配置密钥即可继续追问。" }]);
    } finally {
      setAiLoading(false);
    }
  }

  function saveNickname(value: string) {
    const next = value.slice(0, 20);
    setNickname(next);
    localStorage.setItem("hongdou-nickname", next);
  }

  async function reloadComments(questionId: string) {
    const response = await fetch(`/api/comments?questionId=${encodeURIComponent(questionId)}`);
    if (!response.ok) return;
    const result = await response.json() as { comments?: SharedComment[] };
    setComments((value) => ({ ...value, [questionId]: result.comments ?? [] }));
  }

  async function addComment(text: string) {
    if (!current || !text.trim()) return;
    if (!account) return setShowAccount(true);
    const response = await fetch("/api/comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: current.id, text }) });
    const result = await response.json() as { error?: string; message?: string };
    setToast(result.message ?? result.error ?? "评论暂时没有发布成功。");
    if (response.ok) await reloadComments(current.id);
  }

  async function likeComment(commentId: string) {
    if (!current) return;
    if (!account) return setShowAccount(true);
    const response = await fetch(`/api/comments/${commentId}/like`, { method: "POST" });
    if (response.ok) await reloadComments(current.id);
  }

  async function reportComment(commentId: string) {
    if (!current) return;
    if (!account) return setShowAccount(true);
    const response = await fetch(`/api/comments/${commentId}/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "内容不当或可能误导" }) });
    const result = await response.json() as { error?: string; message?: string };
    setToast(result.message ?? result.error ?? "举报暂时没有提交成功。");
  }

  async function deleteComment(commentId: string) {
    if (!current) return;
    const response = await fetch(`/api/comments/${commentId}`, { method: "DELETE" });
    if (response.ok) await reloadComments(current.id);
  }

  async function handleFile(file: File) {
    setImportBusy(true);
    setImportError("");
    setImportState({ phase: "准备导入", progress: 3, detail: file.name });
    try {
      const result = await importQuestionFile(file, setImportState);
      const importedName = result.questions[0]?.category || file.name.replace(/\.(docx|pdf)$/i, "");
      setQuestions(result.questions);
      setBankName(importedName);
      await saveActiveBank({ name: importedName, questions: result.questions, importedAt: new Date().toISOString() });
      setProgress({});
      setFavorites([]);
      setNotes({});
      localStorage.removeItem("hongdou-progress");
      localStorage.removeItem("hongdou-favorites");
      localStorage.removeItem("hongdou-notes");
      setImportState({ phase: "导入完成", progress: 100, detail: `${result.questions.length} 道题${result.usedOcr ? " · 已使用 OCR" : ""}` });
      setToast("题库已就位 🎉 此刻就是新起点，题海有岸，胜利正在装进口袋 🫘📚🏆✨");
      window.setTimeout(() => setToast(""), 4200);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "导入失败，请检查文件格式");
      setImportState((value) => ({ ...value, phase: "导入未完成" }));
    } finally {
      setImportBusy(false);
    }
  }

  async function restoreDemoBank() {
    await clearActiveBank();
    setQuestions(questionBank as QuizQuestion[]);
    setBankName("演示题库");
    setProgress({});
    setFavorites([]);
    setNotes({});
    localStorage.removeItem("hongdou-progress");
    localStorage.removeItem("hongdou-favorites");
    localStorage.removeItem("hongdou-notes");
    setToast("已恢复演示题库，随时可以重新出发");
    window.setTimeout(() => setToast(""), 3600);
  }

  return (
    <main className={`product ${settings.darkMode ? "dark" : ""}`}>
      {view === "home" ? (
        <HomeView
          bankName={bankName}
          questions={questions.length}
          answered={answered}
          wrong={wrong}
          accuracy={accuracy}
          progress={homeProgress}
          onPractice={openPractice}
          onImport={() => setShowImport(true)}
          onSearch={() => setShowSearch(true)}
          onNotes={() => setShowNotes(true)}
          onCopyright={() => setView("copyright")}
          onToggleTheme={() => saveSettings({ ...settings, darkMode: !settings.darkMode })}
          darkMode={settings.darkMode}
          nickname={nickname}
          account={account}
          syncStatus={syncStatus}
          onAccount={() => setShowAccount(true)}
        />
      ) : view === "copyright" ? (
        <CopyrightPage bankName={bankName} onHome={() => setView("home")} onRestoreDemo={restoreDemoBank} />
      ) : current ? (
        <QuizView
          current={current}
          currentIndex={currentIndex}
          total={sessionQuestions.length}
          selected={selected}
          submitted={submitted}
          result={progress[current.id]}
          favorite={isFavorite}
          note={notes[current.id] ?? ""}
          aiMode={aiMode}
          aiTexts={aiTexts}
          aiMessages={aiMessages}
          aiLoading={aiLoading}
          nickname={nickname}
          account={account}
          comments={comments[current.id] ?? []}
          mobilePanel={showMobilePanel}
          onHome={() => setView("home")}
          onToggleOption={toggleOption}
          onSubmit={submitAnswer}
          onPrevious={() => resetQuestion(currentIndex - 1)}
          onNext={() => resetQuestion(currentIndex + 1)}
          onFavorite={toggleFavorite}
          onAnswerSheet={() => setShowAnswerSheet(true)}
          onSettings={() => setShowSettings(true)}
          onNote={updateNote}
          onAi={askAi}
          onFollowUp={askFollowUp}
          onComment={addComment}
          onLikeComment={likeComment}
          onReportComment={reportComment}
          onDeleteComment={deleteComment}
          onRequireLogin={() => setShowAccount(true)}
          onMobilePanel={() => setShowMobilePanel((value) => !value)}
        />
      ) : (
        <EmptySession onHome={() => setView("home")} />
      )}

      {showSettings && (
        <SettingsModal settings={settings} counts={scopeCounts} onChange={saveSettings} onClose={() => setShowSettings(false)} onStart={() => buildSession()} />
      )}
      {showAnswerSheet && (
        <AnswerSheet questions={sessionQuestions} progress={progress} currentIndex={currentIndex} onJump={(next) => { resetQuestion(next); setShowAnswerSheet(false); }} onClose={() => setShowAnswerSheet(false)} />
      )}
      {showImport && (
        <ImportModal
          state={importState}
          busy={importBusy}
          error={importError}
          dragActive={dragActive}
          fileRef={fileRef}
          onClose={() => setShowImport(false)}
          onFile={handleFile}
          onDrag={setDragActive}
        />
      )}
      {showSearch && <SearchModal questions={questions} onOpen={openQuestion} onClose={() => setShowSearch(false)} />}
      {showNotes && <NotesModal questions={questions} notes={notes} onOpen={openQuestion} onClose={() => setShowNotes(false)} />}
      {showAccount && <AccountModal account={account} syncStatus={syncStatus} nickname={nickname} onClose={() => setShowAccount(false)} onAuthenticated={finishAuthentication} onLogout={logoutAccount} onDelete={deleteAccount} onSync={() => pullRemoteState(true)} onExport={exportLearningRecord} onImport={importLearningRecord} />}
      {toast && <SuccessToast message={toast} onClose={() => setToast("")} />}
    </main>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? "compact" : ""}`}><span className="brand-logo"><Image src="/hongdou-logo.png" alt="红豆生南国蛇形医学标识" width={48} height={48} priority /></span><div><strong>红豆生南国</strong><small>医学知识训练与复盘</small></div></div>;
}

function HomeView({ bankName, questions, answered, wrong, accuracy, progress, onPractice, onImport, onSearch, onNotes, onCopyright, onToggleTheme, darkMode, nickname, account, syncStatus, onAccount }: {
  bankName: string; questions: number; answered: number; wrong: number; accuracy: number; progress: number;
  onPractice: (custom?: Partial<Settings>) => void; onImport: () => void; onSearch: () => void; onNotes: () => void;
  onCopyright: () => void; onToggleTheme: () => void; darkMode: boolean; nickname: string;
  account: AccountSession | null; syncStatus: string; onAccount: () => void;
}) {
  return <div className="home-shell">
    <aside className="home-sidebar">
      <Brand />
      <nav className="side-nav">
        <button className="active"><Home size={19} />首页</button>
        <button onClick={() => onPractice({ scope: "all" })}><BookOpen size={19} />开始刷题</button>
        <button onClick={() => onPractice({ scope: "wrong" })}><AlertCircle size={19} />错题复盘{wrong > 0 && <em>{wrong}</em>}</button>
        <button onClick={() => onPractice({ scope: "favorite" })}><Star size={19} />收藏题目</button>
        <button onClick={onNotes}><NotebookPen size={19} />我的笔记</button>
      </nav>
      <div className="sidebar-bottom"><button className="sync-entry" onClick={onAccount}><Cloud size={18} />{account ? "管理多端同步" : "开启多端同步"}</button>{account && <small className="sync-caption">{syncStatus}</small>}<button onClick={onImport}><Import size={18} />导入题库</button><button className="copyright-link" onClick={onCopyright}><FileText size={16} />版权与使用说明</button><p>本地优先 · 无广告<br />原始题库文件不会上传</p></div>
    </aside>
    <section className="home-main">
      <header className="home-topbar"><div><p>早上好，今天也稳稳推进。</p><h1>把模糊的知识，练成确定。</h1></div><div className="top-actions"><button aria-label="搜索题目" onClick={onSearch}><Search size={19} /></button><button aria-label="切换主题" onClick={onToggleTheme}>{darkMode ? <Sun size={19} /> : <Moon size={19} />}</button><button className="profile" onClick={onAccount} aria-label="同步身份">{(nickname.trim()[0] || "红").toUpperCase()}</button></div></header>
      <section className="hero-card">
        <div className="hero-copy"><span className="overline"><Sparkles size={14} /> 今日学习</span><h2>{bankName}</h2><p>{bankName === "演示题库" ? "用少量示例题体验完整流程；准备好后，导入属于自己的医学题库。" : "从上次停下的地方继续。系统会把错题与薄弱知识点带回你的学习节奏。"}</p><div className="hero-actions"><button className="primary-action" onClick={() => onPractice({ scope: answered ? "unanswered" : "all" })}><Play size={17} fill="currentColor" />{answered ? "继续学习" : "开始学习"}</button><button className="ghost-action" onClick={() => onPractice()}>练习设置 <Settings2 size={16} /></button></div></div>
        <div className="hero-progress"><div className="progress-orbit" style={{ "--p": `${progress * 3.6}deg` } as React.CSSProperties}><div><strong>{progress}%</strong><span>总进度</span></div></div><ul><li><span>题目总数</span><b>{questions}</b></li><li><span>已完成</span><b>{answered}</b></li><li><span>当前正确率</span><b>{accuracy}%</b></li></ul></div>
      </section>
      <div className="section-heading"><div><span>选择一种节奏</span><h2>开始今天的练习</h2></div><button onClick={() => onPractice()}>更多设置 <ChevronRight size={16} /></button></div>
      <section className="mode-grid">
        <button className="mode-card red" onClick={() => onPractice({ scope: "unanswered", questionOrder: "sequential" })}><span><BookOpen size={20} /></span><div><strong>顺序练习</strong><p>循序推进，不漏知识点</p></div><ChevronRight size={18} /></button>
        <button className="mode-card green" onClick={() => onPractice({ scope: "all", questionOrder: "random" })}><span><Shuffle size={20} /></span><div><strong>随机挑战</strong><p>打破位置记忆，检验掌握</p></div><ChevronRight size={18} /></button>
        <button className="mode-card gold" onClick={() => onPractice({ scope: "wrong", questionOrder: "random" })}><span><RotateCcw size={20} /></span><div><strong>错题复盘</strong><p>{wrong ? `${wrong} 道题等待重新掌握` : "目前没有错题，保持状态"}</p></div><ChevronRight size={18} /></button>
        <button className="mode-card blue" onClick={() => onPractice({ scope: "all", questionOrder: "random", shuffleOptions: true })}><span><Clock3 size={20} /></span><div><strong>模拟考试</strong><p>随机题序与选项，接近实战</p></div><ChevronRight size={18} /></button>
      </section>
      <section className="home-lower">
        <article className="insight-card"><div className="card-title"><span><Target size={18} /></span><div><strong>学习洞察</strong><p>你的个人复盘视图</p></div></div><div className="metrics"><div><b>{answered}</b><span>累计完成</span></div><div><b>{accuracy}%</b><span>正确率</span></div><div><b>{wrong}</b><span>待巩固</span></div></div><div className="tip"><Lightbulb size={17} /><p>{wrong ? "优先重做错题，比盲目刷新题更有效。" : "先完成一组题，系统就能开始生成复盘建议。"}</p></div></article>
        <article className="ai-preview"><div className="ai-preview-head"><span className="ai-orb"><BrainCircuit size={22} /></span><div><small>AI 学习讨论区</small><strong>不是只给答案，而是陪你把题想明白</strong></div></div><div className="ai-chips"><span>大神总结</span><span>易错提示</span><span>AI我在</span></div><p>提交答案后，针对当前题目生成总结、辨析常见误区，并继续追问。</p><button onClick={() => onPractice({ scope: "unanswered" })}>去体验 <ArrowRight size={16} /></button></article>
      </section>
      <footer className="home-footer"><span>© 2026 红豆生南国</span><button onClick={onCopyright}>版权、隐私与医学声明 <ChevronRight size={14} /></button></footer>
    </section>
  </div>;
}

function QuizView(props: {
  current: QuizQuestion; currentIndex: number; total: number; selected: string[]; submitted: boolean;
  result?: "correct" | "wrong"; favorite: boolean; note: string; aiMode: AiMode;
  aiTexts: Partial<Record<AiMode, string>>; aiMessages: AiMessage[]; aiLoading: boolean; mobilePanel: boolean;
  nickname: string; account: AccountSession | null; comments: SharedComment[];
  onHome: () => void; onToggleOption: (label: string) => void; onSubmit: () => void;
  onPrevious: () => void; onNext: () => void; onFavorite: () => void; onAnswerSheet: () => void;
  onSettings: () => void; onNote: (value: string) => void; onAi: (mode: AiMode) => void;
  onFollowUp: (text: string) => void; onComment: (text: string) => void;
  onLikeComment: (commentId: string) => void; onReportComment: (commentId: string) => void;
  onDeleteComment: (commentId: string) => void; onRequireLogin: () => void; onMobilePanel: () => void;
}) {
  const { current, currentIndex, total, selected, submitted, result, favorite, note, aiMode, aiTexts, aiMessages, aiLoading } = props;
  const progress = Math.round(((currentIndex + 1) / total) * 100);
  return <div className="quiz-shell">
    <header className="quiz-header"><button className="icon-button" onClick={props.onHome} aria-label="返回首页"><ChevronLeft /></button><Brand compact /><div className="quiz-header-progress"><span>{current.category}</span><div><i style={{ width: `${progress}%` }} /></div><b>{currentIndex + 1} / {total}</b></div><button className="icon-button" onClick={props.onSettings} aria-label="练习设置"><Settings2 /></button></header>
    <div className="quiz-workspace">
      <section className="question-pane">
        <div className="question-topline"><div><span className={`question-kind ${current.multiple ? "multi" : ""}`}>{current.multiple ? "多选题" : "单选题"}</span><span>原题号 {current.sourceNumber}</span></div><button className={favorite ? "favorite active" : "favorite"} onClick={props.onFavorite}><Star size={17} fill={favorite ? "currentColor" : "none"} />{favorite ? "已收藏" : "收藏"}</button></div>
        <article className="question-body"><h1>{current.stem}</h1><p className="choose-hint">{current.multiple ? "本题有多个正确答案，请选择所有符合项" : "请选择一个最符合题意的答案"}</p><div className="answer-options">{current.options.map((option) => {
          const picked = selected.includes(option.label);
          const isAnswer = submitted && current.answer.includes(option.label);
          const isWrong = submitted && picked && !current.answer.includes(option.label);
          return <button key={option.label} className={`answer-option ${picked ? "selected" : ""} ${isAnswer ? "correct" : ""} ${isWrong ? "wrong" : ""}`} onClick={() => props.onToggleOption(option.label)}><span>{option.label}</span><p>{option.text}</p>{isAnswer && <Check size={18} />}{isWrong && <X size={18} />}</button>;
        })}</div></article>
        {submitted && <div className={`result-strip ${result}`}><span>{result === "correct" ? <CheckCircle2 /> : <AlertCircle />}</span><div><strong>{result === "correct" ? "答对了，知识点已加深" : "这道题值得加入复盘"}</strong><p>你的答案：{selected.join("、")} · 题库答案：{current.answer.join("、")}</p></div><button onClick={() => props.onAi("summary")}><Sparkles size={16} />生成解析</button></div>}
        <div className="quiz-actions"><button className="subtle-button" onClick={props.onPrevious} disabled={currentIndex === 0}><ChevronLeft size={17} />上一题</button>{submitted ? <button className="primary-action" onClick={props.onNext} disabled={currentIndex === total - 1}>下一题<ChevronRight size={17} /></button> : <button className="primary-action" onClick={props.onSubmit} disabled={!selected.length}>提交答案<ArrowRight size={17} /></button>}</div>
      </section>
      <LearningPanel current={current} submitted={submitted} note={note} aiMode={aiMode} aiTexts={aiTexts} aiMessages={aiMessages} aiLoading={aiLoading} nickname={props.nickname} account={props.account} comments={props.comments} onNote={props.onNote} onAi={props.onAi} onFollowUp={props.onFollowUp} onComment={props.onComment} onLikeComment={props.onLikeComment} onReportComment={props.onReportComment} onDeleteComment={props.onDeleteComment} onRequireLogin={props.onRequireLogin} />
    </div>
    <nav className="quiz-bottom"><button onClick={props.onPrevious}><ChevronLeft /><span>上一题</span></button><button onClick={props.onAnswerSheet}><ListChecks /><span>答题卡</span></button><button className={favorite ? "active" : ""} onClick={props.onFavorite}><Star fill={favorite ? "currentColor" : "none"} /><span>收藏</span></button><button onClick={props.onMobilePanel}><MessageCircle /><span>学习区</span></button><button onClick={props.onSettings}><Settings2 /><span>设置</span></button><button onClick={props.onNext}><ChevronRight /><span>下一题</span></button></nav>
      {props.mobilePanel && <div className="mobile-learning"><button className="drawer-close" onClick={props.onMobilePanel}><X /></button><LearningPanel current={current} submitted={submitted} note={note} aiMode={aiMode} aiTexts={aiTexts} aiMessages={aiMessages} aiLoading={aiLoading} nickname={props.nickname} account={props.account} comments={props.comments} onNote={props.onNote} onAi={props.onAi} onFollowUp={props.onFollowUp} onComment={props.onComment} onLikeComment={props.onLikeComment} onReportComment={props.onReportComment} onDeleteComment={props.onDeleteComment} onRequireLogin={props.onRequireLogin} /></div>}
  </div>;
}

function LearningPanel({ current, submitted, note, aiMode, aiTexts, aiMessages, aiLoading, nickname, account, comments, onNote, onAi, onFollowUp, onComment, onLikeComment, onReportComment, onDeleteComment, onRequireLogin }: {
  current: QuizQuestion; submitted: boolean; note: string; aiMode: AiMode;
  aiTexts: Partial<Record<AiMode, string>>; aiMessages: AiMessage[]; aiLoading: boolean;
  nickname: string; account: AccountSession | null; comments: SharedComment[]; onNote: (value: string) => void; onAi: (mode: AiMode) => void;
  onFollowUp: (text: string) => void; onComment: (text: string) => void;
  onLikeComment: (commentId: string) => void; onReportComment: (commentId: string) => void;
  onDeleteComment: (commentId: string) => void; onRequireLogin: () => void;
}) {
  const [followUp, setFollowUp] = useState("");
  const [comment, setComment] = useState("");
  const modes: Array<{ id: AiMode; label: string; icon: React.ReactNode }> = [
    { id: "summary", label: "大神总结", icon: <BrainCircuit size={16} /> },
    { id: "pitfall", label: "易错提示", icon: <Lightbulb size={16} /> },
    { id: "companion", label: "AI我在", icon: <Bot size={16} /> },
  ];
  const sendFollowUp = () => { if (!followUp.trim()) return; onFollowUp(followUp); setFollowUp(""); };
  const sendComment = () => { if (!comment.trim()) return; onComment(comment); setComment(""); };
  return <aside className="learning-panel"><div className="learning-heading"><div><span>AI 学习讨论区</span><h2>把这道题真正弄懂</h2></div><span className="beta">BETA</span></div><div className="learning-tabs">{modes.map((mode) => <button key={mode.id} className={aiMode === mode.id ? "active" : ""} onClick={() => onAi(mode.id)}>{mode.icon}{mode.label}</button>)}</div>
    <div className="discussion-card"><div className="comment-author"><span className={`comment-avatar ${aiMode}`}><Sparkles size={16} /></span><div><strong>{modes.find((mode) => mode.id === aiMode)?.label}</strong><small>AI 学习助理 · 针对当前题目</small></div></div>{!submitted ? <div className="discussion-placeholder"><CircleHelp size={24} /><p>提交答案后开放讨论，避免提前泄露答案。</p></div> : <>{aiTexts[aiMode] && <p className="ai-copy">{aiTexts[aiMode]}</p>}{aiMode === "companion" && aiMessages.length > 0 && <div className="chat-thread">{aiMessages.map((message, index) => <p key={`${message.role}-${index}`} className={message.role}>{message.text}</p>)}</div>}{aiLoading ? <div className="thinking"><i /><i /><i /><span>正在组织更易懂的解释</span></div> : !aiTexts[aiMode] && !(aiMode === "companion" && aiMessages.length) && <><p className="discussion-intro">{aiMode === "summary" ? `围绕题库答案 ${current.answer.join("、")} 提炼核心考点，并解释其他选项。` : aiMode === "pitfall" ? "识别题干里的否定词、相似概念和最容易混淆的选项。" : "没听懂也没关系，我会换一种方式继续讲，直到你能复述。"}</p><button className="generate-button" onClick={() => onAi(aiMode)}><Sparkles size={16} />生成这一条</button></>}{aiMode === "companion" && <div className="followup-form"><input value={followUp} onChange={(event) => setFollowUp(event.target.value)} onKeyDown={(event) => event.key === "Enter" && sendFollowUp()} placeholder="继续追问，例如：能换个例子吗？" /><button onClick={sendFollowUp} disabled={!followUp.trim() || aiLoading} aria-label="发送追问"><Send size={15} /></button></div>}</>}<div className="comment-actions"><button><ThumbsUp size={15} />有帮助</button><span>内容仅用于学习辅助</span></div></div>
    <div className="note-card"><div><NotebookPen size={17} /><strong>我的笔记</strong><span>{account ? "自动参与多端同步" : "当前保存在本机"}</span></div><textarea value={note} onChange={(event) => onNote(event.target.value)} placeholder="记下判断依据、口诀或需要再次核对的知识点…" /><button><Send size={15} />已自动保存</button></div>
    <div className="community-card"><div className="community-title"><MessageCircle size={17} /><strong>同学讨论</strong><span>云端共享 · 有审核</span></div>{account ? <div className="comment-identity"><ShieldCheck size={15} /><span>{nickname} · 已保护身份</span></div> : <button className="comment-login" onClick={onRequireLogin}><UserRound size={16} />登录后参与讨论</button>}<div className="comment-form"><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="写下你的判断方法或易错提醒…" /><button onClick={sendComment} disabled={!comment.trim()}><Send size={15} />发布</button></div>{comments.length ? <div className="local-comments">{comments.slice(0, 20).map((item) => <article key={item.id}><div><b>{item.nickname}</b><time>{item.status === "pending" ? "审核中" : new Date(item.createdAt).toLocaleDateString("zh-CN")}</time></div><p>{item.text}</p><div className="comment-tools"><button onClick={() => onLikeComment(item.id)}><ThumbsUp size={13} />{item.likes || "赞"}</button>{item.own ? <button onClick={() => onDeleteComment(item.id)}><Trash2 size={13} />删除</button> : <button onClick={() => onReportComment(item.id)}><Flag size={13} />举报</button>}</div></article>)}</div> : <p className="empty-comments">还没有公开讨论，成为第一个留下学习线索的人。</p>}</div>
  </aside>;
}

function SettingsModal({ settings, counts, onChange, onClose, onStart }: { settings: Settings; counts: Record<Scope, number>; onChange: (settings: Settings) => void; onClose: () => void; onStart: () => void }) {
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => onChange({ ...settings, [key]: value });
  return <div className="modal-layer" onMouseDown={onClose}><section className="settings-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><span>开始之前</span><h2>设置你的练习方式</h2></div><button onClick={onClose}><X /></button></header><div className="setting-section"><label>题目范围</label><div className="choice-grid">{([
    ["all", "全部题目", Library], ["unanswered", "未练题目", Zap], ["wrong", "错题复盘", RotateCcw], ["favorite", "收藏题目", Star],
  ] as Array<[Scope, string, typeof Library]>).map(([value, label, Icon]) => <button key={value} className={settings.scope === value ? "active" : ""} onClick={() => update("scope", value)}><Icon size={18} /><span>{label}</span><em>{counts[value]}</em></button>)}</div></div><div className="setting-section"><label>题目顺序</label><div className="segmented"><button className={settings.questionOrder === "sequential" ? "active" : ""} onClick={() => update("questionOrder", "sequential")}><BookOpen size={17} />顺序练习</button><button className={settings.questionOrder === "random" ? "active" : ""} onClick={() => update("questionOrder", "random")}><Shuffle size={17} />随机练习</button></div></div><div className="switch-list"><SwitchRow label="选项随机" detail="减少位置记忆干扰" value={settings.shuffleOptions} onChange={(value) => update("shuffleOptions", value)} /><SwitchRow label="答对自动下一题" detail="适合快速刷题" value={settings.autoNext} onChange={(value) => update("autoNext", value)} /><SwitchRow label="错题自动收藏" detail="自动进入复盘清单" value={settings.autoFavoriteWrong} onChange={(value) => update("autoFavoriteWrong", value)} /><SwitchRow label="夜间模式" detail="降低暗光环境刺激" value={settings.darkMode} onChange={(value) => update("darkMode", value)} /></div><button className="start-button" onClick={onStart}><Play size={17} fill="currentColor" />开始练习 <span>{counts[settings.scope]} 道</span></button></section></div>;
}

function SwitchRow({ label, detail, value, onChange }: { label: string; detail: string; value: boolean; onChange: (value: boolean) => void }) {
  return <button className="switch-row" onClick={() => onChange(!value)}><div><strong>{label}</strong><span>{detail}</span></div><i className={value ? "on" : ""}><b /></i></button>;
}

function AnswerSheet({ questions, progress, currentIndex, onJump, onClose }: { questions: QuizQuestion[]; progress: Progress; currentIndex: number; onJump: (index: number) => void; onClose: () => void }) {
  return <div className="modal-layer answer-layer" onMouseDown={onClose}><section className="answer-sheet" onMouseDown={(event) => event.stopPropagation()}><header><div><span>练习进度</span><h2>答题卡</h2></div><button onClick={onClose}><X /></button></header><div className="answer-legend"><span><i className="done" />已答</span><span><i className="wrong" />错题</span><span><i className="current" />当前</span><span><i />未答</span></div><div className="number-grid">{questions.map((question, index) => <button key={`${question.id}-${index}`} className={`${progress[question.id] ?? ""} ${index === currentIndex ? "current" : ""}`} onClick={() => onJump(index)}>{index + 1}</button>)}</div></section></div>;
}

function ImportModal({ state, busy, error, dragActive, fileRef, onClose, onFile, onDrag }: { state: ImportUpdate; busy: boolean; error: string; dragActive: boolean; fileRef: React.RefObject<HTMLInputElement | null>; onClose: () => void; onFile: (file: File) => void; onDrag: (value: boolean) => void }) {
  return <div className="modal-layer" onMouseDown={() => !busy && onClose()}><section className="import-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><span>本地处理，不上传原文件</span><h2>导入自己的题库</h2></div><button onClick={onClose} disabled={busy}><X /></button></header><div className={`drop-zone ${dragActive ? "drag" : ""}`} onDragOver={(event) => { event.preventDefault(); onDrag(true); }} onDragLeave={() => onDrag(false)} onDrop={(event) => { event.preventDefault(); onDrag(false); const file = event.dataTransfer.files[0]; if (file) onFile(file); }}><span className="upload-art"><Upload /></span><strong>拖入 Word 或 PDF</strong><p>支持 .docx、文字型 PDF 与扫描 PDF（OCR）</p><button onClick={() => fileRef.current?.click()} disabled={busy}>选择文件</button><input ref={fileRef} type="file" accept=".docx,.pdf" hidden onChange={(event) => event.target.files?.[0] && onFile(event.target.files[0])} /></div><div className="format-row"><div><FileText /><span><b>Word</b><small>直接提取题干、选项与答案</small></span></div><div><ScanText /><span><b>PDF + OCR</b><small>优先提取文字，扫描件自动识别</small></span></div></div>{(busy || state.progress > 0) && <div className="import-progress"><div><span>{state.phase}</span><b>{state.progress}%</b></div><i><b style={{ width: `${state.progress}%` }} /></i><p>{state.detail}</p></div>}{error && <div className="import-error"><AlertCircle />{error}</div>}<p className="privacy-note">OCR 首次使用会下载中文识别模型；大文件建议保持页面打开。所有识别都在浏览器内完成。</p></section></div>;
}

function AccountModal({ account, syncStatus, nickname: initialNickname, onClose, onAuthenticated, onLogout, onDelete, onSync, onExport, onImport }: {
  account: AccountSession | null; syncStatus: string; nickname: string; onClose: () => void;
  onAuthenticated: (user: AccountSession) => Promise<void>; onLogout: () => Promise<void>; onDelete: () => Promise<void>;
  onSync: () => Promise<void>; onExport: () => void; onImport: (file: File) => Promise<void>;
}) {
  const [studentId, setStudentId] = useState("");
  const [nickname, setNickname] = useState(initialNickname);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  async function sendCode() {
    if (!email.trim()) return setMessage("请先填写邮箱地址。");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/email-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const result = await response.json() as { error?: string; message?: string; debugCode?: string };
      setMessage(result.debugCode ? `${result.message} 本地开发验证码：${result.debugCode}` : result.message ?? result.error ?? "验证码发送失败。");
    } catch {
      setMessage("邮箱服务暂时不可用。");
    } finally {
      setBusy(false);
    }
  }

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId, nickname, email, code }) });
      const result = await response.json() as { error?: string; user?: AccountSession };
      if (!response.ok || !result.user) return setMessage(result.error ?? "暂时无法登录。");
      await onAuthenticated(result.user);
    } catch {
      setMessage("同步服务暂时不可用，本机刷题不受影响。");
    } finally {
      setBusy(false);
    }
  }

  return <div className="modal-layer" onMouseDown={onClose}><section className="account-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><span>轻量身份 · 多端同步</span><h2>{account ? "管理同步身份" : "把学习进度稳稳接上"}</h2></div><button onClick={onClose}><X /></button></header>{account ? <div className="account-signed"><div className="account-badge"><span>{account.nickname.slice(0, 1)}</span><div><strong>{account.nickname}</strong><p>{account.email ?? "未绑定邮箱"}</p></div><ShieldCheck /></div><div className="sync-state"><Cloud /><div><strong>多端同步已开启</strong><p>{syncStatus}</p></div></div><div className="record-actions"><button onClick={onSync}><RefreshCw />立即同步</button><button onClick={onExport}><Download />导出学习记录</button><button onClick={() => importRef.current?.click()}><Upload />导入学习记录</button><input ref={importRef} hidden type="file" accept="application/json,.json" onChange={(event) => event.target.files?.[0] && onImport(event.target.files[0])} /></div><div className="account-danger"><button onClick={onLogout}>退出当前设备</button><button onClick={onDelete}><Trash2 />注销云端身份</button></div></div> : <form className="account-form" onSubmit={login}><div className="privacy-banner"><ShieldCheck /><p><strong>放心同步 🔐☁️</strong><br />学号只会生成不可逆的同步标识，服务器不会保存原始学号；邮箱仅在你主动填写时用于验证码登录与评论身份保护 📮✨</p></div><label><span>学号 <em>同步主键</em></span><input value={studentId} onChange={(event) => setStudentId(event.target.value)} placeholder="首次使用请填写学号" autoComplete="username" /></label><label><span>昵称 <em>评论区显示</em></span><input value={nickname} onChange={(event) => setNickname(event.target.value.slice(0, 20))} placeholder="例如：红豆同学" /></label><label><span>邮箱 <em>可选 · 登录与身份保护</em></span><div className="code-field"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="绑定时需验证码" autoComplete="email" /><button type="button" onClick={sendCode} disabled={busy || !email.trim()}>发送验证码</button></div></label>{email && <label><span>邮箱验证码</span><input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="6 位验证码" /></label>}<p className="email-login-hint">已有绑定邮箱？学号留空，填写邮箱与验证码即可登录 📮</p>{message && <p className="account-message">{message}</p>}<button className="account-submit" disabled={busy || (!studentId.trim() && !email.trim())}><Cloud />{busy ? "正在连接…" : "开启安全同步"}</button></form>}</section></div>;
}

function SearchModal({ questions, onOpen, onClose }: { questions: QuizQuestion[]; onOpen: (id: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return questions.slice(0, 12);
    return questions.filter((question) => `${question.stem} ${question.options.map((option) => option.text).join(" ")}`.toLowerCase().includes(keyword)).slice(0, 40);
  }, [query, questions]);
  return <div className="modal-layer" onMouseDown={onClose}><section className="search-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><span>题目检索</span><h2>搜索当前题库</h2></div><button onClick={onClose}><X /></button></header><label className="search-field"><Search size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入疾病、症状或知识点" /><kbd>{results.length}</kbd></label><div className="search-results">{results.length ? results.map((question) => <button key={question.id} onClick={() => onOpen(question.id)}><span>{question.multiple ? "多选" : "单选"}</span><div><strong>{question.stem}</strong><small>{question.category} · 原题号 {question.sourceNumber}</small></div><ChevronRight size={17} /></button>) : <div className="search-empty"><CircleHelp /><p>没有找到匹配题目，换个关键词试试。</p></div>}</div></section></div>;
}

function NotesModal({ questions, notes, onOpen, onClose }: { questions: QuizQuestion[]; notes: Record<string, string>; onOpen: (id: string) => void; onClose: () => void }) {
  const entries = questions.filter((question) => notes[question.id]?.trim());
  return <div className="modal-layer" onMouseDown={onClose}><section className="search-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><span>个人复盘</span><h2>我的笔记</h2></div><button onClick={onClose}><X /></button></header><div className="notes-list">{entries.length ? entries.map((question) => <button key={question.id} onClick={() => onOpen(question.id)}><NotebookPen size={17} /><div><strong>{question.stem}</strong><p>{notes[question.id]}</p></div><ChevronRight size={17} /></button>) : <div className="search-empty"><NotebookPen /><p>还没有笔记。答题时写下判断依据，会自动汇总到这里。</p></div>}</div></section></div>;
}

function SuccessToast({ message, onClose }: { message: string; onClose: () => void }) {
  const imported = message.startsWith("题库已就位");
  return <div className="success-toast" role="status"><span><CheckCircle2 /></span><div><strong>{imported ? "题库导入成功 🎉" : "红豆提醒"}</strong><p>{message}</p></div><button onClick={onClose} aria-label="关闭提示"><X size={16} /></button></div>;
}

function CopyrightPage({ bankName, onHome, onRestoreDemo }: { bankName: string; onHome: () => void; onRestoreDemo: () => void }) {
  return <div className="copyright-page"><header><button className="icon-button" onClick={onHome} aria-label="返回首页"><ChevronLeft /></button><Brand /><span>版权与使用说明</span></header><main><span className="overline"><FileText size={15} /> COPYRIGHT & USE</span><h1>让知识被认真对待，<br />也让边界清晰可见。</h1><p className="copyright-lead">“红豆生南国”是一款面向医学学习场景的题库训练工具。当前题库：{bankName}。</p><section className="copyright-grid"><article><b>01</b><h2>产品与品牌</h2><p>产品名称、界面设计、蛇杖红豆标识及相关视觉资产由本项目保留。未经许可，不应直接复制为另一款同名或近似产品。</p></article><article><b>02</b><h2>题库内容</h2><p>演示题仅用于功能展示。用户导入的 Word、PDF 及其题目版权归原权利人所有；请确保拥有学习、整理与使用权限。</p></article><article><b>03</b><h2>医学声明</h2><p>题目答案、AI 总结与讨论内容仅用于学习辅助，不能替代教材、现行指南、执业判断或对患者的诊断与治疗建议。</p></article><article><b>04</b><h2>隐私与数据</h2><p>原始学号不会写入数据库，只用于生成不可逆同步标识。学习记录与共享评论可由用户导出或注销删除；原始题库文件仍在浏览器本机处理。</p></article></section><div className="copyright-actions"><button className="primary-action" onClick={onHome}>返回学习</button><button className="ghost-action" onClick={onRestoreDemo}>恢复演示题库</button></div><footer><span>© 2026 红豆生南国</span><span>AveCove Elapse v0.2 · 医学知识训练与复盘</span></footer></main></div>;
}

function EmptySession({ onHome }: { onHome: () => void }) {
  return <div className="empty-session"><span><Check /></span><h1>这一组暂时没有题目</h1><p>可以调整练习范围，或者返回首页导入新的题库。</p><button className="primary-action" onClick={onHome}>返回首页</button></div>;
}
