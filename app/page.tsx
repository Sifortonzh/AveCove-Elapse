"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  AlertCircle, ArrowRight, BookOpen, Bot, BrainCircuit, Check, CheckCircle2,
  ChevronLeft, ChevronRight, CircleHelp, Clock3, Cloud, Download, FileText, Flag, Home, Import,
  Database, Languages, Library, Lightbulb, ListChecks, MessageCircle, Moon, NotebookPen, Pencil, Play,
  RefreshCw, RotateCcw, ScanText, Search, Send, Settings2, Share2, ShieldCheck, Shuffle, Sparkles,
  Star, Sun, Target, ThumbsUp, Trash2, Upload, UserRound, X, Zap,
} from "lucide-react";
import questionBank from "./questions.json";
import EnglishLearningView from "./components/EnglishLearningView";
import { importQuestionFile, QuestionRecognitionError, type ImportUpdate } from "./lib/file-import";
import {
  activateQuestionBank, clearActiveBank, createSharedQuestionBankPackage, deleteQuestionBank,
  listQuestionBanks, loadActiveBank, parseSharedQuestionBankPackage, renameQuestionBank,
  saveActiveBank, type SavedQuestionBank,
} from "./lib/local-bank";
import type { QuizQuestion } from "./lib/question-parser";
import { readPersonalAiConfig } from "./lib/personal-ai";
import { getSearchTerms, searchQuestionBanks } from "./lib/question-search";

type Progress = Record<string, "correct" | "wrong">;
type Scope = "all" | "unanswered" | "wrong" | "favorite";
type QuestionTypeScope = "single" | "all";
type AiMode = "summary" | "pitfall" | "companion";
type View = "home" | "quiz" | "banks" | "copyright";
type AiMessage = { role: "user" | "assistant"; text: string };
type SharedComment = { id: string; nickname: string; text: string; createdAt: string; likes: number; own?: boolean; status?: string };
type AccountSession = { nickname: string; email?: string; expiresAt: number };
type ImportReport = { id: string; name: string; status: "waiting" | "processing" | "success" | "failed" | "cancelled" | "ai-ready"; detail: string };
type AiFallbackFile = { id: string; fileName: string; extractedText: string };
type Settings = {
  scope: Scope;
  questionTypes: QuestionTypeScope;
  questionOrder: "sequential" | "random";
  shuffleOptions: boolean;
  autoNext: boolean;
  autoFavoriteWrong: boolean;
  darkMode: boolean;
};

const defaultSettings: Settings = {
  scope: "all",
  questionTypes: "all",
  questionOrder: "sequential",
  shuffleOptions: false,
  autoNext: false,
  autoFavoriteWrong: true,
  darkMode: false,
};

const homeQuotes = [
  { lead: "今日一页，胜过明日十页。", title: "把每一次判断，都练成临床思维。" },
  { lead: "慢一点想清楚，快一点记牢。", title: "真正的进步，藏在每一道错题里。" },
  { lead: "知识会遗忘，理解会留下。", title: "先问为什么，再记住是什么。" },
  { lead: "一题一得，日日有功。", title: "把模糊的知识，练成确定。" },
  { lead: "不怕答案错，只怕不复盘。", title: "今天弄懂的难题，是明天的底气。" },
  { lead: "医学很长，脚步可以很稳。", title: "认真走过的每一步，都在靠近答案。" },
  { lead: "记忆有潮汐，复习有回声。", title: "在忘记之前，再与知识相遇一次。" },
  { lead: "心里有病人，笔下才有分寸。", title: "用严谨守住知识，也守住生命。" },
];

class ImportTimeoutError extends Error {
  constructor() {
    super("导入超过 3 分钟，已停止等待；建议拆分文件后重试");
    this.name = "ImportTimeoutError";
  }
}

function withImportTimeout<T>(
  promise: Promise<T>,
  timeout = 180_000,
  options: { signal?: AbortSignal; onTimeout?: () => void } = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      window.clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const abort = () => finish(() => reject(new DOMException("导入已取消", "AbortError")));
    const timer = window.setTimeout(() => finish(() => {
      reject(new ImportTimeoutError());
      options.onTimeout?.();
    }), timeout);
    if (options.signal?.aborted) return abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    promise.then((value) => finish(() => resolve(value)), (error) => finish(() => reject(error)));
  });
}

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function HighlightMatches({ text, query }: { text: string; query: string }) {
  const terms = getSearchTerms(query).sort((left, right) => right.length - left.length);
  if (!terms.length) return <>{text}</>;
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const matcher = new RegExp(`(${escaped.join("|")})`, "giu");
  const normalizedTerms = new Set(terms.map((term) => term.toLocaleLowerCase()));
  return <>{text.split(matcher).map((part, index) => normalizedTerms.has(part.normalize("NFKC").toLocaleLowerCase()) ? <mark className="search-highlight" key={`${part}-${index}`}>{part}</mark> : <span key={`${part}-${index}`}>{part}</span>)}</>;
}

export default function HomePage() {
  const [view, setView] = useState<View>("home");
  const [learningMode, setLearningMode] = useState<"medical" | "english">("medical");
  const [questions, setQuestions] = useState<QuizQuestion[]>(questionBank as QuizQuestion[]);
  const [bankName, setBankName] = useState("演示题库");
  const [questionBanks, setQuestionBanks] = useState<SavedQuestionBank[]>([]);
  const [activeBankId, setActiveBankId] = useState<string | null>(null);
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
  const [importReports, setImportReports] = useState<ImportReport[]>([]);
  const [aiFallbackFiles, setAiFallbackFiles] = useState<AiFallbackFile[]>([]);
  const [showAiImport, setShowAiImport] = useState(false);
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
  const [quoteIndex, setQuoteIndex] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const importAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => importAbortRef.current?.abort(), []);

  useEffect(() => {
    let active = true;

    async function restoreLocalData() {
      await Promise.resolve();
      if (!active) return;
      setQuoteIndex(Math.floor(Math.random() * homeQuotes.length));
      try {
        const savedLearningMode = localStorage.getItem("avecove-learning-mode");
        if (savedLearningMode === "english" || savedLearningMode === "medical") setLearningMode(savedLearningMode);
        setProgress(JSON.parse(localStorage.getItem("hongdou-progress") ?? localStorage.getItem("medquiz-progress") ?? "{}"));
        setFavorites(JSON.parse(localStorage.getItem("hongdou-favorites") ?? "[]"));
        setNotes(JSON.parse(localStorage.getItem("hongdou-notes") ?? "{}"));
        setSettings({ ...defaultSettings, ...JSON.parse(localStorage.getItem("hongdou-settings") ?? "{}") });
        setNickname(localStorage.getItem("hongdou-nickname") ?? "红豆同学");
      } catch {
        // Ignore invalid local data and keep safe defaults.
      }

      const saved = await loadActiveBank().catch(() => undefined);
      const banks = await listQuestionBanks().catch(() => []);
      if (!active) return;
      setQuestionBanks(banks);
      if (!saved?.questions.length) return;
      setQuestions(saved.questions);
      setBankName(saved.name);
      setActiveBankId(saved.id);
    }

    void restoreLocalData();
    return () => {
      active = false;
    };
  }, []);

  function switchLearningMode(mode: "medical" | "english") {
    setLearningMode(mode);
    localStorage.setItem("avecove-learning-mode", mode);
  }

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
  const correct = questions.filter((question) => progress[question.id] === "correct").length;
  const wrong = questions.filter((question) => progress[question.id] === "wrong").length;
  const accuracy = answered ? Math.round((correct / answered) * 100) : 0;
  const isFavorite = current ? favorites.includes(current.id) : false;

  const homeProgress = Math.min(100, Math.round((answered / Math.max(questions.length, 1)) * 100));
  const typeCounts = useMemo(() => ({
    single: questions.filter((question) => !question.multiple).length,
    multiple: questions.filter((question) => question.multiple).length,
    all: questions.length,
  }), [questions]);
  const scopeCounts = useMemo(() => {
    const typedQuestions = settings.questionTypes === "single" ? questions.filter((question) => !question.multiple) : questions;
    return {
      all: typedQuestions.length,
      unanswered: typedQuestions.filter((question) => !progress[question.id]).length,
      wrong: typedQuestions.filter((question) => progress[question.id] === "wrong").length,
      favorite: typedQuestions.filter((question) => favorites.includes(question.id)).length,
    };
  }, [favorites, progress, questions, settings.questionTypes]);
  const searchableBanks = useMemo(() => {
    const savedCurrent = activeBankId ? questionBanks.find((bank) => bank.id === activeBankId) : undefined;
    const currentBank: SavedQuestionBank = savedCurrent ? { ...savedCurrent, name: bankName, questions } : {
      id: "__demo__",
      name: bankName,
      questions,
      importedAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    };
    return [currentBank, ...questionBanks.filter((bank) => bank.id !== currentBank.id)];
  }, [activeBankId, bankName, questionBanks, questions]);

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
      if (active.questionTypes === "single" && question.multiple) return false;
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
        body: JSON.stringify({ question: current, mode, personalAi: readPersonalAiConfig() ?? undefined }),
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
        body: JSON.stringify({ question: current, mode: "companion", followUp: question, history: aiMessages.slice(-6), personalAi: readPersonalAiConfig() ?? undefined }),
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

  function updateImportReport(id: string, patch: Partial<ImportReport>) {
    setImportReports((reports) => reports.map((report) => report.id === id ? { ...report, ...patch } : report));
  }

  function cancelImport() {
    if (!importAbortRef.current || importAbortRef.current.signal.aborted) return;
    setImportState((state) => ({ ...state, phase: "正在取消导入", detail: "正在停止当前文件解析与 OCR，请稍候…" }));
    importAbortRef.current.abort();
  }

  async function handleFiles(files: File[]) {
    if (!files.length || importBusy) return;
    const batch = files.map((file, index) => ({ file, id: `${Date.now()}-${index}-${file.name}` }));
    const initialReports: ImportReport[] = batch.map(({ file, id }) => ({ id, name: file.name, status: "waiting", detail: "等待导入" }));
    setImportBusy(true);
    setImportError("");
    setImportReports(initialReports);
    setImportState({ phase: "准备批量导入", progress: 2, detail: `共 ${files.length} 个文件` });
    const fallbackFiles: AiFallbackFile[] = [];
    let successCount = 0;
    let failureCount = 0;
    let cancelled = false;
    const batchController = new AbortController();
    importAbortRef.current = batchController;

    for (let index = 0; index < batch.length; index += 1) {
      const { file, id } = batch[index];
      if (batchController.signal.aborted) {
        cancelled = true;
        break;
      }
      updateImportReport(id, { status: "processing", detail: `正在处理 ${index + 1} / ${batch.length}` });
      let acceptUpdates = true;
      const fileController = new AbortController();
      const cancelCurrentFile = () => fileController.abort();
      batchController.signal.addEventListener("abort", cancelCurrentFile, { once: true });
      try {
        let importedName = file.name.replace(/\.(doc|docx|pdf|json)$/i, "");
        let importedQuestions: QuizQuestion[];
        let usedOcr = false;
        if (/\.json$/i.test(file.name)) {
          const shared = parseSharedQuestionBankPackage(JSON.parse(await withImportTimeout(file.text(), 30_000, {
            signal: fileController.signal,
            onTimeout: () => fileController.abort(),
          })) as unknown);
          importedName = shared.name;
          importedQuestions = shared.questions;
          setImportState({ phase: "正在接收分享题库", progress: 82, detail: `[${index + 1}/${batch.length}] ${file.name}` });
        } else {
          const result = await withImportTimeout(importQuestionFile(file, (update) => {
            if (acceptUpdates) setImportState({ ...update, detail: `[${index + 1}/${batch.length}] ${file.name} · ${update.detail}` });
          }, fileController.signal), 180_000, {
            signal: fileController.signal,
            onTimeout: () => fileController.abort(),
          });
          importedQuestions = result.questions;
          importedName = result.questions[0]?.category || importedName;
          usedOcr = result.usedOcr;
        }
        const saved = await saveActiveBank({ name: importedName, questions: importedQuestions, importedAt: new Date().toISOString() });
        setQuestions(saved.questions);
        setBankName(saved.name);
        setActiveBankId(saved.id);
        successCount += 1;
        updateImportReport(id, { status: "success", detail: `${saved.questions.length} 道题${usedOcr ? " · OCR" : ""}` });
      } catch (error) {
        if (batchController.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
          cancelled = true;
          updateImportReport(id, { status: "cancelled", detail: "已由你取消，未保存当前文件" });
          break;
        } else if (error instanceof QuestionRecognitionError && error.extractedText.trim()) {
          fallbackFiles.push({ id, fileName: error.fileName, extractedText: error.extractedText });
          updateImportReport(id, { status: "ai-ready", detail: "普通模式未识别，可尝试 AI 快速整理" });
        } else {
          failureCount += 1;
          updateImportReport(id, { status: "failed", detail: error instanceof Error ? error.message : "导入失败，请检查文件" });
        }
      } finally {
        acceptUpdates = false;
        batchController.signal.removeEventListener("abort", cancelCurrentFile);
      }
    }

    if (cancelled) {
      setImportReports((reports) => reports.map((report) => report.status === "waiting" ? { ...report, status: "cancelled", detail: "批量导入已取消，未开始处理" } : report));
    }
    setQuestionBanks(await listQuestionBanks().catch(() => questionBanks));
    setImportState(cancelled
      ? { phase: "导入已取消", progress: 100, detail: `已保留成功导入的 ${successCount} 个文件，其余文件未继续处理` }
      : { phase: "批量导入完成", progress: 100, detail: `成功 ${successCount} 个 · 待 AI ${fallbackFiles.length} 个 · 失败 ${failureCount} 个` });
    setImportError(cancelled ? "本次导入已安全取消；当前正在处理的文件没有写入题库。" : failureCount ? `${failureCount} 个文件导入失败或超时，请查看下方明细后重试。` : "");
    setImportBusy(false);
    importAbortRef.current = null;
    if (successCount) {
      setToast(`${successCount} 份题库已就位 🎉 此刻就是新起点，题海有岸，胜利正在装进口袋 🫘📚🏆✨`);
      window.setTimeout(() => setToast(""), 4600);
    }
    if (fallbackFiles.length && !cancelled) {
      setAiFallbackFiles(fallbackFiles);
      setShowImport(false);
      setShowAiImport(true);
    }
  }

  async function recognizeFileWithAi(file: AiFallbackFile) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 120_000);
    try {
      const response = await fetch("/api/import-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ fileName: file.fileName, text: file.extractedText.slice(0, 100_000), personalAi: readPersonalAiConfig() ?? undefined }),
      });
      const result = await response.json() as { questions?: QuizQuestion[]; error?: string };
      if (!response.ok || !result.questions?.length) throw new Error(result.error || "AI 没有返回可用题目");
      const saved = await saveActiveBank({ name: file.fileName.replace(/\.(doc|docx|pdf)$/i, ""), questions: result.questions, importedAt: new Date().toISOString() });
      setQuestions(saved.questions);
      setBankName(saved.name);
      setActiveBankId(saved.id);
      setQuestionBanks(await listQuestionBanks());
      return saved.questions.length;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw new Error("AI 识别超过 2 分钟，请缩小文件后重试");
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function restoreDemoBank() {
    await clearActiveBank();
    setQuestions(questionBank as QuizQuestion[]);
    setBankName("演示题库");
    setActiveBankId(null);
    setToast("已恢复演示题库，随时可以重新出发");
    window.setTimeout(() => setToast(""), 3600);
  }

  async function selectQuestionBank(id: string, destination: View = "home") {
    try {
      const bank = await activateQuestionBank(id);
      setQuestions(bank.questions);
      setBankName(bank.name);
      setActiveBankId(bank.id);
      setView(destination);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "暂时无法切换题库");
    }
  }

  async function renameSavedBank(id: string, name: string) {
    const renamed = await renameQuestionBank(id, name);
    setQuestionBanks((banks) => banks.map((bank) => bank.id === id ? renamed : bank));
    if (activeBankId === id) setBankName(renamed.name);
    setToast(`题库已更名为“${renamed.name}” ✍️`);
    window.setTimeout(() => setToast(""), 3000);
  }

  async function removeSavedBank(id: string) {
    await deleteQuestionBank(id);
    setQuestionBanks((banks) => banks.filter((bank) => bank.id !== id));
    if (activeBankId === id) await restoreDemoBank();
    else {
      setToast("题库已从本机移除，其他学习记录不受影响");
      window.setTimeout(() => setToast(""), 3000);
    }
  }

  async function resetSavedBankProgress(bank: SavedQuestionBank) {
    const questionIds = new Set(bank.questions.map((question) => question.id));
    const nextProgress = Object.fromEntries(Object.entries(progress).filter(([id]) => !questionIds.has(id))) as Progress;
    const nextFavorites = favorites.filter((id) => !questionIds.has(id));
    const nextNotes = Object.fromEntries(Object.entries(notes).filter(([id]) => !questionIds.has(id)));
    setProgress(nextProgress);
    setFavorites(nextFavorites);
    setNotes(nextNotes);
    localStorage.setItem("hongdou-progress", JSON.stringify(nextProgress));
    localStorage.setItem("hongdou-favorites", JSON.stringify(nextFavorites));
    localStorage.setItem("hongdou-notes", JSON.stringify(nextNotes));
    setToast(`“${bank.name}”的刷题记录已重置，题库本身仍然保留。`);
    window.setTimeout(() => setToast(""), 3800);
  }

  async function openSavedQuestion(bank: SavedQuestionBank, questionId: string) {
    await selectQuestionBank(bank.id, "quiz");
    const index = bank.questions.findIndex((question) => question.id === questionId);
    setSessionQuestions(bank.questions);
    setCurrentIndex(Math.max(0, index));
    setSelected([]);
    setSubmitted(false);
    setAiTexts({});
    setAiMessages([]);
  }

  if (learningMode === "english") {
    return <main className={`product english-product ${settings.darkMode ? "dark" : ""}`}><EnglishLearningView onExit={() => switchLearningMode("medical")} /></main>;
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
          onBanks={() => setView("banks")}
          onSearch={() => setShowSearch(true)}
          onNotes={() => setShowNotes(true)}
          onCopyright={() => setView("copyright")}
          onToggleTheme={() => saveSettings({ ...settings, darkMode: !settings.darkMode })}
          darkMode={settings.darkMode}
          nickname={nickname}
          account={account}
          syncStatus={syncStatus}
          quote={homeQuotes[quoteIndex]}
          onAccount={() => setShowAccount(true)}
          onEnglish={() => switchLearningMode("english")}
        />
      ) : view === "banks" ? (
        <QuestionBankPage
          banks={questionBanks}
          activeBankId={activeBankId}
          onHome={() => setView("home")}
          onImport={() => setShowImport(true)}
          onSelect={(id) => selectQuestionBank(id, "home")}
          onRename={renameSavedBank}
          onDelete={removeSavedBank}
          onReset={resetSavedBankProgress}
          onOpenQuestion={openSavedQuestion}
          progress={progress}
          favorites={favorites}
          notes={notes}
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
        <SettingsModal settings={settings} counts={scopeCounts} typeCounts={typeCounts} onChange={saveSettings} onClose={() => setShowSettings(false)} onStart={() => buildSession()} />
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
          reports={importReports}
          fileRef={fileRef}
          onClose={() => setShowImport(false)}
          onFiles={handleFiles}
          onCancel={cancelImport}
          onDrag={setDragActive}
        />
      )}
      {showAiImport && <AiImportFallbackModal files={aiFallbackFiles} onRecognize={recognizeFileWithAi} onClose={() => { setShowAiImport(false); setAiFallbackFiles([]); }} />}
      {showSearch && <SearchModal banks={searchableBanks} onOpen={async (bank, questionId) => { if (bank.id === "__demo__") openQuestion(questionId); else { await openSavedQuestion(bank, questionId); setShowSearch(false); } }} onClose={() => setShowSearch(false)} />}
      {showNotes && <NotesModal questions={questions} notes={notes} onOpen={openQuestion} onClose={() => setShowNotes(false)} />}
      {showAccount && <AccountModal account={account} syncStatus={syncStatus} nickname={nickname} onClose={() => setShowAccount(false)} onAuthenticated={finishAuthentication} onLogout={logoutAccount} onDelete={deleteAccount} onSync={() => pullRemoteState(true)} onExport={exportLearningRecord} onImport={importLearningRecord} />}
      {toast && <SuccessToast message={toast} onClose={() => setToast("")} />}
    </main>
  );
}

function Brand({ compact = false, hideTagline = false }: { compact?: boolean; hideTagline?: boolean }) {
  return <div className={`brand ${compact ? "compact" : ""}`}><span className="brand-logo"><Image src="/hongdou-logo.png" alt="红豆生南国蛇形医学标识" width={48} height={48} priority /></span><div><strong>红豆生南国</strong>{!hideTagline && <small>医学知识训练与复盘</small>}</div></div>;
}

function HomeView({ bankName, questions, answered, wrong, accuracy, progress, onPractice, onImport, onBanks, onSearch, onNotes, onCopyright, onToggleTheme, darkMode, nickname, account, syncStatus, quote, onAccount, onEnglish }: {
  bankName: string; questions: number; answered: number; wrong: number; accuracy: number; progress: number;
  onPractice: (custom?: Partial<Settings>) => void; onImport: () => void; onBanks: () => void; onSearch: () => void; onNotes: () => void;
  onCopyright: () => void; onToggleTheme: () => void; darkMode: boolean; nickname: string;
  account: AccountSession | null; syncStatus: string; quote: (typeof homeQuotes)[number]; onAccount: () => void; onEnglish: () => void;
}) {
  return <div className="home-shell">
    <aside className="home-sidebar">
      <Brand hideTagline />
      <nav className="side-nav">
        <button className="active"><Home size={19} />首页</button>
        <button onClick={onBanks}><Database size={19} />我的题库</button>
        <button onClick={() => onPractice({ scope: "all" })}><BookOpen size={19} />开始刷题</button>
        <button onClick={() => onPractice({ scope: "wrong" })}><AlertCircle size={19} />错题复盘{wrong > 0 && <em>{wrong}</em>}</button>
        <button onClick={() => onPractice({ scope: "favorite" })}><Star size={19} />收藏题目</button>
        <button onClick={onNotes}><NotebookPen size={19} />我的笔记</button>
      </nav>
      <div className="sidebar-bottom"><button className="sync-entry" onClick={onAccount}><Cloud size={18} />{account ? "管理多端同步" : "开启多端同步"}</button>{account && <small className="sync-caption">{syncStatus}</small>}<button className="import-entry" aria-label="导入题库" onClick={onImport}><Import size={18} /><span>导入题库</span></button><a className="custom-ai-entry" aria-label="自定义 AI" href="/custom-ai"><Bot size={17} /><span>自定义AI</span></a><button className="copyright-link" onClick={onCopyright}><FileText size={16} />版权、声明与协议</button><p>本地优先 · 无广告<br />.docx / PDF 本机处理 · 旧 .doc 仅内存转换</p></div>
    </aside>
    <section className="home-main">
      <header className="home-topbar"><div className="home-quote"><p><Sparkles size={13} />{quote.lead}</p><h1>{quote.title}</h1></div><div className="top-actions"><button className="english-learning-toggle" aria-label="English Learning" onClick={onEnglish}><Languages size={17} /><span>English Learning</span></button><button aria-label="搜索题目" onClick={onSearch}><Search size={19} /></button><button aria-label="切换主题" onClick={onToggleTheme}>{darkMode ? <Sun size={19} /> : <Moon size={19} />}</button><button className="profile" onClick={onAccount} aria-label="同步身份">{(nickname.trim()[0] || "红").toUpperCase()}</button></div></header>
      <section className="hero-card">
        <div className="hero-copy"><span className="overline"><Sparkles size={14} /> 今日学习</span><h2>{bankName}</h2><p>{bankName === "演示题库" ? "用少量示例题体验完整流程；准备好后，导入属于自己的医学题库。" : "从上次停下的地方继续。系统会把错题与薄弱知识点带回你的学习节奏。"}</p><div className="hero-actions"><button className="primary-action" onClick={() => onPractice({ scope: answered ? "unanswered" : "all" })}><Play size={17} fill="currentColor" />{answered ? "继续学习" : "开始学习"}</button><button className="ghost-action" onClick={() => onPractice()}>练习设置 <Settings2 size={16} /></button></div></div>
        <div className="hero-progress"><div className="progress-orbit" style={{ "--p": `${progress * 3.6}deg` } as React.CSSProperties}><div><strong>{progress}%</strong><span>总进度</span></div></div><ul><li><span>题目总数</span><b>{questions}</b></li><li><span>已完成</span><b>{answered}</b></li><li><span>当前正确率</span><b>{accuracy}%</b></li></ul></div>
      </section>
      <div className="section-heading"><div><span>选择一种节奏</span><h2>开始今天的练习</h2></div><button onClick={() => onPractice()}>更多设置 <ChevronRight size={16} /></button></div>
      <section className="mode-grid">
        <button className="mode-card red" onClick={() => onPractice({ scope: "unanswered", questionOrder: "sequential" })}><span><BookOpen size={20} /></span><div><strong>顺序练习</strong><p>按原题顺序稳步推进，适合系统完成第一遍。</p></div><ChevronRight size={18} /></button>
        <button className="mode-card green" onClick={() => onPractice({ scope: "all", questionOrder: "random" })}><span><Shuffle size={20} /></span><div><strong>随机挑战</strong><p>打乱题目位置，检验真正掌握而非顺序记忆。</p></div><ChevronRight size={18} /></button>
        <button className="mode-card gold" onClick={() => onPractice({ scope: "wrong", questionOrder: "random" })}><span><RotateCcw size={20} /></span><div><strong>错题复盘</strong><p>{wrong ? `${wrong} 道错题集中回炉，把薄弱点逐个拿下。` : "当前没有错题，可以先完成一组新练习。"}</p></div><ChevronRight size={18} /></button>
        <button className="mode-card blue" onClick={() => onPractice({ scope: "all", questionOrder: "random", shuffleOptions: true })}><span><Clock3 size={20} /></span><div><strong>模拟考试</strong><p>题序与选项同时随机，减少提示，更接近实战。</p></div><ChevronRight size={18} /></button>
      </section>
      <section className="home-lower">
        <article className="insight-card"><div className="card-title"><span><Target size={18} /></span><div><strong>学习洞察</strong><p>你的个人复盘视图</p></div></div><div className="metrics"><div><b>{answered}</b><span>累计完成</span></div><div><b>{accuracy}%</b><span>正确率</span></div><div><b>{wrong}</b><span>待巩固</span></div></div><div className="tip"><Lightbulb size={17} /><p>{wrong ? "优先重做错题，比盲目刷新题更有效。" : "先完成一组题，系统就能开始生成复盘建议。"}</p></div></article>
        <article className="ai-preview"><div className="ai-preview-head"><span className="ai-orb"><BrainCircuit size={22} /></span><div><small>AI 学习讨论区</small><strong>不是只给答案，而是陪你把题想明白</strong></div></div><div className="ai-chips"><span>大神总结</span><span>易错提示</span><span>知微</span></div><p>提交答案后，针对当前题目生成总结、辨析常见误区，并继续追问。</p><button onClick={() => onPractice({ scope: "unanswered" })}>去体验 <ArrowRight size={16} /></button></article>
      </section>
      <footer className="home-footer"><span>© 2026 红豆生南国</span><button onClick={onCopyright}>版权、免责声明与用户协议 <ChevronRight size={14} /></button></footer>
    </section>
  </div>;
}

function QuestionBankPage({ banks, activeBankId, progress, favorites, notes, onHome, onImport, onSelect, onRename, onDelete, onReset, onOpenQuestion }: {
  banks: SavedQuestionBank[];
  activeBankId: string | null;
  progress: Progress;
  favorites: string[];
  notes: Record<string, string>;
  onHome: () => void;
  onImport: () => void;
  onSelect: (id: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReset: (bank: SavedQuestionBank) => Promise<void>;
  onOpenQuestion: (bank: SavedQuestionBank, questionId: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sharingBank, setSharingBank] = useState<SavedQuestionBank | null>(null);
  const [resettingBank, setResettingBank] = useState<SavedQuestionBank | null>(null);
  const keyword = query.trim();
  const totalQuestions = banks.reduce((sum, bank) => sum + bank.questions.length, 0);
  const multipleQuestions = banks.reduce((sum, bank) => sum + bank.questions.filter((question) => question.multiple).length, 0);
  const searchResults = useMemo(() => searchQuestionBanks(banks, query, 100), [banks, query]);

  async function submitRename(bank: SavedQuestionBank) {
    const name = renameValue.trim();
    if (!name || name === bank.name) return setRenamingId(null);
    await onRename(bank.id, name.slice(0, 60));
    setRenamingId(null);
  }

  return <div className="bank-page">
    <header className="bank-page-header"><button className="icon-button" onClick={onHome} aria-label="返回首页"><ChevronLeft /></button><Brand compact /><div><span>本机题库空间</span><strong>我的题库</strong></div><button className="primary-action" onClick={onImport}><Import size={17} />导入题库</button></header>
    <main>
      <section className="bank-page-intro"><div><span className="overline"><Database size={15} /> QUESTION LIBRARY</span><h1>把散落的题目，<br />收进自己的知识书架。</h1><p>已导入题库都保存在当前浏览器。可随时切换、重命名、跨题库检索，或在确认版权边界后分享给同学。</p></div><div className="bank-overview"><article><b>{banks.length}</b><span>已导入题库</span></article><article><b>{totalQuestions}</b><span>收录题目</span></article><article><b>{multipleQuestions}</b><span>多选题</span></article></div></section>
      <label className="bank-global-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="全局搜索：题库名、疾病、症状或知识点" /><span>{keyword ? `${searchResults.length} 条结果` : "搜索全部题库"}</span></label>
      {keyword ? <section className="bank-search-section"><div className="bank-section-title"><div><span>GLOBAL SEARCH · 按相关度排序</span><h2>全局搜索结果</h2></div><button onClick={() => setQuery("")}><X size={16} />清除搜索</button></div>{searchResults.length ? <div className="bank-question-results">{searchResults.map(({ bank, question, matchedFields, matchedOption }) => <button key={`${bank.id}-${question.id}`} onClick={() => onOpenQuestion(bank, question.id)}><span className={question.multiple ? "multi" : ""}>{question.multiple ? "多选" : "单选"}</span><div><strong><HighlightMatches text={question.stem} query={query} /></strong><small className="search-result-location"><Database size={13} />题库：<b><HighlightMatches text={bank.name} query={query} /></b><i>·</i>分类：<b><HighlightMatches text={question.category} query={query} /></b><i>·</i>原题号 {question.sourceNumber}</small>{matchedOption && <p className="search-match-snippet">命中选项：<HighlightMatches text={matchedOption} query={query} /></p>}<em className="search-match-fields">命中 {matchedFields.join("、")}</em></div><ChevronRight /></button>)}</div> : <div className="bank-empty"><CircleHelp /><h2>还没有找到这条知识线索</h2><p>可输入多个关键词并用空格分隔，例如“肺炎 发热”；系统会要求每个关键词都有命中。</p></div>}</section> : <section className="bank-library-section"><div className="bank-section-title"><div><span>LOCAL COLLECTION</span><h2>已导入的题库</h2></div><p>点击“设为当前”即可回到首页继续学习</p></div>{banks.length ? <div className="bank-card-grid">{banks.map((bank) => {
        const singleCount = bank.questions.filter((question) => !question.multiple).length;
        const multipleCount = bank.questions.length - singleCount;
        const isActive = bank.id === activeBankId;
        const isRenaming = renamingId === bank.id;
        const isDeleting = deletingId === bank.id;
        return <article className={`bank-card ${isActive ? "active" : ""}`} key={bank.id}>
          <header><span className="bank-card-icon"><Database /></span>{isActive && <em><Check size={13} />当前题库</em>}</header>
          {isRenaming ? <form className="bank-rename" onSubmit={(event) => { event.preventDefault(); void submitRename(bank); }}><input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} maxLength={60} /><div><button type="submit"><Check size={15} />保存</button><button type="button" onClick={() => setRenamingId(null)}><X size={15} />取消</button></div></form> : <><h3>{bank.name}</h3><p>{bank.questions.length} 道题 · 单选 {singleCount} · 多选 {multipleCount}</p></>}
          <div className="bank-card-meta"><span>导入于 {new Date(bank.importedAt).toLocaleDateString("zh-CN")}</span><span>仅存本机</span></div>
          {isDeleting ? <div className="bank-delete-confirm"><p>确认从本机移除这份题库？此操作无法撤销。</p><div><button onClick={() => { void onDelete(bank.id); setDeletingId(null); }}>确认移除</button><button onClick={() => setDeletingId(null)}>取消</button></div></div> : <footer><button className="bank-open" onClick={() => onSelect(bank.id)} disabled={isActive}>{isActive ? "正在使用" : "设为当前"}</button><button aria-label="重命名" title="重命名" onClick={() => { setRenamingId(bank.id); setRenameValue(bank.name); }}><Pencil /></button><button aria-label="重置刷题记录" title="重置刷题记录" onClick={() => setResettingBank(bank)}><RotateCcw /></button><button aria-label="分享题库" title="分享题库" onClick={() => setSharingBank(bank)}><Share2 /></button><button className="danger" aria-label="删除题库" title="删除题库" onClick={() => setDeletingId(bank.id)}><Trash2 /></button></footer>}
        </article>;
      })}</div> : <div className="bank-empty"><Database /><h2>题库书架还是空的</h2><p>导入 Word、PDF 或同学分享的红豆题库文件后，会自动收录在这里。</p><button className="primary-action" onClick={onImport}><Import size={17} />导入第一份题库</button></div>}</section>}
    </main>
    {sharingBank && <ShareBankModal bank={sharingBank} onClose={() => setSharingBank(null)} />}
    {resettingBank && <ResetBankProgressModal bank={resettingBank} progress={progress} favorites={favorites} notes={notes} onReset={onReset} onClose={() => setResettingBank(null)} />}
  </div>;
}

function ResetBankProgressModal({ bank, progress, favorites, notes, onReset, onClose }: {
  bank: SavedQuestionBank;
  progress: Progress;
  favorites: string[];
  notes: Record<string, string>;
  onReset: (bank: SavedQuestionBank) => Promise<void>;
  onClose: () => void;
}) {
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const questionIds = new Set(bank.questions.map((question) => question.id));
  const answered = bank.questions.filter((question) => progress[question.id]).length;
  const wrong = bank.questions.filter((question) => progress[question.id] === "wrong").length;
  const favoriteCount = favorites.filter((id) => questionIds.has(id)).length;
  const noteCount = Object.entries(notes).filter(([id, note]) => questionIds.has(id) && note.trim()).length;
  const hasRecords = answered + favoriteCount + noteCount > 0;

  async function confirmReset() {
    if (!accepted || !hasRecords) return;
    setBusy(true);
    await onReset(bank);
    setBusy(false);
    onClose();
  }

  return <div className="modal-layer reset-progress-layer" onMouseDown={() => !busy && onClose()}><section className="reset-progress-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><span>IRREVERSIBLE ACTION</span><h2>重置“{bank.name}”的刷题记录</h2></div><button onClick={onClose} disabled={busy}><X /></button></header><div className="reset-warning"><AlertCircle /><div><strong>{hasRecords ? "请谨慎操作：清空后无法撤销" : "这份题库目前没有可重置的记录"}</strong><p>题库与题目本身会保留，但该题库的完成进度、错题状态、收藏和个人笔记会被清空。</p></div></div><div className="reset-impact-grid"><article><b>{answered}</b><span>已答记录</span></article><article><b>{wrong}</b><span>错题记录</span></article><article><b>{favoriteCount}</b><span>收藏题目</span></article><article><b>{noteCount}</b><span>个人笔记</span></article></div><p className="reset-sync-note"><Cloud />若已开启多端同步，这次重置也会同步到云端和其他设备。</p><button className={`reset-confirm-check ${accepted ? "checked" : ""}`} role="checkbox" aria-checked={accepted} disabled={!hasRecords} onClick={() => setAccepted((value) => !value)}><i>{accepted && <Check />}</i><span>我已了解上述记录将永久清空，并确认继续。</span></button><footer><button className="ghost-action" onClick={onClose} disabled={busy}>取消</button><button className="reset-danger-action" onClick={() => void confirmReset()} disabled={!accepted || !hasRecords || busy}><RotateCcw />{busy ? "正在重置…" : "永久重置记录"}</button></footer></section></div>;
}

function ShareBankModal({ bank, onClose }: { bank: SavedQuestionBank; onClose: () => void }) {
  const [accepted, setAccepted] = useState(false);
  const [message, setMessage] = useState("");

  function makeFile() {
    const payload = createSharedQuestionBankPackage(bank);
    const safeName = bank.name.replace(/[\\/:*?"<>|]/g, "-").slice(0, 60) || "红豆题库";
    return new File([JSON.stringify(payload, null, 2)], `${safeName}.hongdou.json`, { type: "application/json" });
  }

  function downloadFile(file: File) {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("分享文件已保存，可发送给同学；对方能在“导入题库”中直接打开。 ✨");
  }

  async function systemShare() {
    const file = makeFile();
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: bank.name, text: "红豆生南国题库分享", files: [file] });
        setMessage("题库已交给系统分享面板。");
      } else {
        downloadFile(file);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      downloadFile(file);
    }
  }

  return <div className="modal-layer" onMouseDown={onClose}><section className="share-bank-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><span>SHARE WITH CARE</span><h2>分享“{bank.name}”</h2></div><button onClick={onClose}><X /></button></header><div className="share-copyright-alert"><ShieldCheck /><div><strong>分享之前，请先确认版权与隐私边界</strong><p>请确认你拥有这份题库的使用与传播权限。不要分享未经授权的教材、课程内容，也不要包含姓名、学号、患者资料或其他敏感信息。</p></div></div><div className="share-summary"><Database /><div><strong>{bank.questions.length} 道题</strong><span>文件包含题干、选项与答案，可被“红豆生南国”再次导入</span></div></div><button className={`copyright-check ${accepted ? "checked" : ""}`} role="checkbox" aria-checked={accepted} onClick={() => setAccepted((value) => !value)}><i>{accepted && <Check />}</i><span>我已确认拥有必要权限，并会尊重题库原作者与相关权利人的版权。</span></button>{message && <p className="share-message">{message}</p>}<footer><button className="ghost-action" onClick={() => accepted && downloadFile(makeFile())} disabled={!accepted}><Download />保存分享文件</button><button className="primary-action" onClick={() => void systemShare()} disabled={!accepted}><Share2 />系统分享</button></footer></section></div>;
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
    { id: "companion", label: "知微", icon: <Bot size={16} /> },
  ];
  const sendFollowUp = () => { if (!followUp.trim()) return; onFollowUp(followUp); setFollowUp(""); };
  const sendComment = () => { if (!comment.trim()) return; onComment(comment); setComment(""); };
  return <aside className="learning-panel"><div className="learning-heading"><div><span>AI 学习讨论区</span><h2>把这道题真正弄懂</h2></div><span className="beta">BETA</span></div><div className="learning-tabs">{modes.map((mode) => <button key={mode.id} className={aiMode === mode.id ? "active" : ""} onClick={() => onAi(mode.id)}>{mode.icon}{mode.label}</button>)}</div>
    <div className="discussion-card"><div className="comment-author"><span className={`comment-avatar ${aiMode}`}><Sparkles size={16} /></span><div><strong>{modes.find((mode) => mode.id === aiMode)?.label}</strong><small>AI 学习助理 · 针对当前题目</small></div></div>{!submitted ? <div className="discussion-placeholder"><CircleHelp size={24} /><p>提交答案后开放讨论，避免提前泄露答案。</p></div> : <>{aiTexts[aiMode] && <p className="ai-copy">{aiTexts[aiMode]}</p>}{aiMode === "companion" && aiMessages.length > 0 && <div className="chat-thread">{aiMessages.map((message, index) => <p key={`${message.role}-${index}`} className={message.role}>{message.text}</p>)}</div>}{aiLoading ? <div className="thinking"><i /><i /><i /><span>正在组织更易懂的解释</span></div> : !aiTexts[aiMode] && !(aiMode === "companion" && aiMessages.length) && <><p className="discussion-intro">{aiMode === "summary" ? `围绕题库答案 ${current.answer.join("、")} 提炼核心考点，并解释其他选项。` : aiMode === "pitfall" ? "识别题干里的否定词、相似概念和最容易混淆的选项。" : "没听懂也没关系，我会换一种方式继续讲，直到你能复述。"}</p><button className="generate-button" onClick={() => onAi(aiMode)}><Sparkles size={16} />生成这一条</button></>}{aiMode === "companion" && <div className="followup-form"><input value={followUp} onChange={(event) => setFollowUp(event.target.value)} onKeyDown={(event) => event.key === "Enter" && sendFollowUp()} placeholder="继续追问，例如：能换个例子吗？" /><button onClick={sendFollowUp} disabled={!followUp.trim() || aiLoading} aria-label="发送追问"><Send size={15} /></button></div>}</>}<div className="comment-actions"><button><ThumbsUp size={15} />有帮助</button><span>内容仅用于学习辅助</span></div></div>
    <div className="note-card"><div><NotebookPen size={17} /><strong>我的笔记</strong><span>{account ? "自动参与多端同步" : "当前保存在本机"}</span></div><textarea value={note} onChange={(event) => onNote(event.target.value)} placeholder="记下判断依据、口诀或需要再次核对的知识点…" /><button><Send size={15} />已自动保存</button></div>
    <div className="community-card"><div className="community-title"><MessageCircle size={17} /><strong>同学讨论</strong><span>云端共享 · 有审核</span></div>{account ? <div className="comment-identity"><ShieldCheck size={15} /><span>{nickname} · 已保护身份</span></div> : <button className="comment-login" onClick={onRequireLogin}><UserRound size={16} />登录后参与讨论</button>}<div className="comment-form"><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="写下你的判断方法或易错提醒…" /><button onClick={sendComment} disabled={!comment.trim()}><Send size={15} />发布</button></div>{comments.length ? <div className="local-comments">{comments.slice(0, 20).map((item) => <article key={item.id}><div><b>{item.nickname}</b><time>{item.status === "pending" ? "审核中" : new Date(item.createdAt).toLocaleDateString("zh-CN")}</time></div><p>{item.text}</p><div className="comment-tools"><button onClick={() => onLikeComment(item.id)}><ThumbsUp size={13} />{item.likes || "赞"}</button>{item.own ? <button onClick={() => onDeleteComment(item.id)}><Trash2 size={13} />删除</button> : <button onClick={() => onReportComment(item.id)}><Flag size={13} />举报</button>}</div></article>)}</div> : <p className="empty-comments">还没有公开讨论，成为第一个留下学习线索的人。</p>}</div>
  </aside>;
}

function SettingsModal({ settings, counts, typeCounts, onChange, onClose, onStart }: { settings: Settings; counts: Record<Scope, number>; typeCounts: { single: number; multiple: number; all: number }; onChange: (settings: Settings) => void; onClose: () => void; onStart: () => void }) {
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => onChange({ ...settings, [key]: value });
  return <div className="modal-layer" onMouseDown={onClose}><section className="settings-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><span>开始之前</span><h2>设置你的练习方式</h2></div><button onClick={onClose}><X /></button></header><div className="setting-section"><label>题目范围</label><div className="choice-grid">{([
    ["all", "全部题目", Library], ["unanswered", "未练题目", Zap], ["wrong", "错题复盘", RotateCcw], ["favorite", "收藏题目", Star],
  ] as Array<[Scope, string, typeof Library]>).map(([value, label, Icon]) => <button key={value} className={settings.scope === value ? "active" : ""} onClick={() => update("scope", value)}><Icon size={18} /><span>{label}</span><em>{counts[value]}</em></button>)}</div></div><div className="setting-section"><label>题型范围</label><div className="segmented type-segmented"><button className={settings.questionTypes === "single" ? "active" : ""} onClick={() => update("questionTypes", "single")}><CheckCircle2 size={17} /><span>仅做单选</span><em>{typeCounts.single} 道</em></button><button className={settings.questionTypes === "all" ? "active" : ""} onClick={() => update("questionTypes", "all")}><ListChecks size={17} /><span>单选＋多选</span><em>{typeCounts.single}＋{typeCounts.multiple} 道</em></button></div></div><div className="setting-section"><label>题目顺序</label><div className="segmented"><button className={settings.questionOrder === "sequential" ? "active" : ""} onClick={() => update("questionOrder", "sequential")}><BookOpen size={17} />顺序练习</button><button className={settings.questionOrder === "random" ? "active" : ""} onClick={() => update("questionOrder", "random")}><Shuffle size={17} />随机练习</button></div></div><div className="switch-list"><SwitchRow label="选项随机" detail="减少位置记忆干扰" value={settings.shuffleOptions} onChange={(value) => update("shuffleOptions", value)} /><SwitchRow label="答对自动下一题" detail="答对后 0.7 秒进入下一题；答错时停留复盘" value={settings.autoNext} onChange={(value) => update("autoNext", value)} /><SwitchRow label="错题自动收藏" detail="自动进入复盘清单" value={settings.autoFavoriteWrong} onChange={(value) => update("autoFavoriteWrong", value)} /><SwitchRow label="夜间模式" detail="降低暗光环境刺激" value={settings.darkMode} onChange={(value) => update("darkMode", value)} /></div><button className="start-button" onClick={onStart} disabled={!counts[settings.scope]}><Play size={17} fill="currentColor" />{counts[settings.scope] ? "开始练习" : "当前筛选没有题目"} <span>{counts[settings.scope]} 道</span></button></section></div>;
}

function SwitchRow({ label, detail, value, onChange }: { label: string; detail: string; value: boolean; onChange: (value: boolean) => void }) {
  return <button className="switch-row" onClick={() => onChange(!value)}><div><strong>{label}</strong><span>{detail}</span></div><i className={value ? "on" : ""}><b /></i></button>;
}

function AnswerSheet({ questions, progress, currentIndex, onJump, onClose }: { questions: QuizQuestion[]; progress: Progress; currentIndex: number; onJump: (index: number) => void; onClose: () => void }) {
  return <div className="modal-layer answer-layer" onMouseDown={onClose}><section className="answer-sheet" onMouseDown={(event) => event.stopPropagation()}><header><div><span>练习进度</span><h2>答题卡</h2></div><button onClick={onClose}><X /></button></header><div className="answer-legend"><span><i className="done" />已答</span><span><i className="wrong" />错题</span><span><i className="current" />当前</span><span><i />未答</span></div><div className="number-grid">{questions.map((question, index) => <button key={`${question.id}-${index}`} className={`${progress[question.id] ?? ""} ${index === currentIndex ? "current" : ""}`} onClick={() => onJump(index)}>{index + 1}</button>)}</div></section></div>;
}

function ImportModal({ state, busy, error, dragActive, reports, fileRef, onClose, onFiles, onCancel, onDrag }: { state: ImportUpdate; busy: boolean; error: string; dragActive: boolean; reports: ImportReport[]; fileRef: React.RefObject<HTMLInputElement | null>; onClose: () => void; onFiles: (files: File[]) => void; onCancel: () => void; onDrag: (value: boolean) => void }) {
  return <div className="modal-layer" onMouseDown={() => !busy && onClose()}><section className="import-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><span>批量导入 · 新版文件默认在本机处理</span><h2>导入自己的题库</h2></div><button onClick={onClose} disabled={busy}><X /></button></header><div className={`drop-zone ${dragActive ? "drag" : ""}`} onDragOver={(event) => { event.preventDefault(); onDrag(true); }} onDragLeave={() => onDrag(false)} onDrop={(event) => { event.preventDefault(); onDrag(false); const files = Array.from(event.dataTransfer.files); if (files.length) onFiles(files); }}><span className="upload-art"><Upload /></span><strong>一次拖入一个或多个文件</strong><p>支持旧版 .doc、.docx、文字/扫描 PDF 与红豆题库 .json</p><button onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? "正在逐个处理…" : "选择多个文件"}</button><input ref={fileRef} type="file" multiple accept=".doc,.docx,.pdf,.json,application/msword,application/json" hidden onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) onFiles(files); event.currentTarget.value = ""; }} /></div><div className="format-row"><div><FileText /><span><b>Word / 分享文件</b><small>.docx 本机解析；旧版 .doc 由本站内存转换</small></span></div><div><ScanText /><span><b>PDF + OCR</b><small>逐个处理，单个文件最长等待 3 分钟</small></span></div></div>{(busy || state.progress > 0) && <div className="import-progress"><div><span>{state.phase}</span><b>{state.progress}%</b></div><i><b style={{ width: `${state.progress}%` }} /></i><p>{state.detail}</p>{busy && <button type="button" className="import-cancel" onClick={onCancel}><X />取消当前导入</button>}</div>}{reports.length > 0 && <div className="import-report-list">{reports.map((report) => <div className={report.status} key={report.id}>{report.status === "success" ? <CheckCircle2 /> : report.status === "failed" ? <AlertCircle /> : report.status === "cancelled" ? <X /> : report.status === "ai-ready" ? <BrainCircuit /> : <Clock3 />}<span><strong>{report.name}</strong><small>{report.detail}</small></span></div>)}</div>}{error && <div className="import-error"><AlertCircle />{error}</div>}<p className="privacy-note">.docx 与 PDF 默认在浏览器本地处理；由于旧版 .doc 是二进制格式，选择后会临时发送到你部署的本站服务器内存提取文字，不落盘、不保留原文件。普通识别失败时仍会先征求同意，再决定是否交给 AI 整理。</p></section></div>;
}

function AiImportFallbackModal({ files, onRecognize, onClose }: { files: AiFallbackFile[]; onRecognize: (file: AiFallbackFile) => Promise<number>; onClose: () => void }) {
  const [rows, setRows] = useState(() => files.map((file) => ({ ...file, status: "waiting" as "waiting" | "processing" | "success" | "failed", detail: "等待你的确认" })));
  const [busy, setBusy] = useState(false);

  async function startRecognition() {
    setBusy(true);
    for (const file of files) {
      const completed = rows.find((row) => row.id === file.id)?.status === "success";
      if (completed) continue;
      setRows((value) => value.map((row) => row.id === file.id ? { ...row, status: "processing", detail: "AI 正在关联题目与文件答案区…" } : row));
      try {
        const count = await onRecognize(file);
        setRows((value) => value.map((row) => row.id === file.id ? { ...row, status: "success", detail: `已整理 ${count} 道题，请在练习中复核答案` } : row));
      } catch (error) {
        setRows((value) => value.map((row) => row.id === file.id ? { ...row, status: "failed", detail: error instanceof Error ? error.message : "AI 识别失败，请稍后重试" } : row));
      }
    }
    setBusy(false);
  }

  const hasProcessed = rows.some((row) => row.status === "success" || row.status === "failed");
  const hasRetry = rows.some((row) => row.status === "failed");
  return <div className="modal-layer ai-import-layer" onMouseDown={() => !busy && onClose()}><section className="ai-import-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><span>OPTIONAL AI RECOGNITION</span><h2>普通模式没有认出答案结构</h2></div><button onClick={onClose} disabled={busy}><X /></button></header><div className="ai-import-intro"><BrainCircuit /><div><strong>是否用 AI 快速整理文件中的答案部分？</strong><p>AI 会尝试把末尾答案表、非标准答案标记与题号关联，不再要求固定使用“题目＋答案：A”的格式。</p></div></div><div className="ai-import-warning"><ShieldCheck /><p>继续后，仅把浏览器已提取的文字发送给你配置的 AI 厂商，不发送原始文件；可能消耗接口额度。AI 可能识别错误，导入后请抽查答案，并确认文件不含患者或其他敏感信息。</p></div><div className="ai-import-files">{rows.map((row) => <div className={row.status} key={row.id}>{row.status === "success" ? <CheckCircle2 /> : row.status === "failed" ? <AlertCircle /> : row.status === "processing" ? <RefreshCw className="spin" /> : <FileText />}<span><strong>{row.fileName}</strong><small>{row.detail}</small></span></div>)}</div><footer><button className="ghost-action" onClick={onClose} disabled={busy}>{hasProcessed ? "完成并关闭" : "暂不使用 AI"}</button><button className="primary-action" onClick={() => void startRecognition()} disabled={busy || (!hasRetry && rows.every((row) => row.status === "success"))}><Sparkles />{busy ? "AI 正在识别…" : hasRetry ? "重试失败文件" : "同意并用 AI 识别"}</button></footer></section></div>;
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

  return <div className="modal-layer" onMouseDown={onClose}><section className="account-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><span>轻量身份 · 多端同步</span><h2>{account ? "管理同步身份" : "把学习进度稳稳接上"}</h2></div><button onClick={onClose}><X /></button></header>{account ? <div className="account-signed"><div className="account-badge"><span>{account.nickname.slice(0, 1)}</span><div><strong>{account.nickname}</strong><p>{account.email ?? "未绑定邮箱"}</p></div><ShieldCheck /></div><div className="sync-state"><Cloud /><div><strong>多端同步已开启</strong><p>{syncStatus}</p></div></div><div className="record-actions"><button onClick={onSync}><RefreshCw />立即同步</button><button onClick={onExport}><Download />导出学习记录</button><button onClick={() => importRef.current?.click()}><Upload />导入学习记录</button><input ref={importRef} hidden type="file" accept="application/json,.json" onChange={(event) => event.target.files?.[0] && onImport(event.target.files[0])} /></div><div className="account-danger"><button onClick={onLogout}>退出当前设备</button><button onClick={onDelete}><Trash2 />注销云端身份</button></div></div> : <form className="account-form" onSubmit={login}><div className="privacy-banner"><span className="privacy-icon"><ShieldCheck /></span><div><strong>放心同步 <span aria-hidden="true">🔐☁️</span></strong><p>学号只生成不可逆的同步标识，服务器不保存原始学号。邮箱仅在你主动填写时，用于验证码登录与评论身份保护。</p><div className="privacy-tags"><span>🔒 不存原始学号</span><span>📮 邮箱按需使用</span></div></div></div><label><span>学号 <em>同步主键</em></span><input value={studentId} onChange={(event) => setStudentId(event.target.value)} placeholder="首次使用请填写学号" autoComplete="username" /></label><label><span>昵称 <em>评论区显示</em></span><input value={nickname} onChange={(event) => setNickname(event.target.value.slice(0, 20))} placeholder="例如：红豆同学" /></label><label><span>邮箱 <em>可选 · 登录与身份保护</em></span><div className="code-field"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="绑定时需验证码" autoComplete="email" /><button type="button" onClick={sendCode} disabled={busy || !email.trim()}>发送验证码</button></div></label>{email && <label><span>邮箱验证码</span><input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="6 位验证码" /></label>}<p className="email-login-hint">已有绑定邮箱？学号留空，填写邮箱与验证码即可登录 📮</p>{message && <p className="account-message">{message}</p>}<button className="account-submit" disabled={busy || (!studentId.trim() && !email.trim())}><Cloud />{busy ? "正在连接…" : "开启安全同步"}</button></form>}</section></div>;
}

function SearchModal({ banks, onOpen, onClose }: { banks: SavedQuestionBank[]; onOpen: (bank: SavedQuestionBank, id: string) => Promise<void> | void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => query.trim() ? searchQuestionBanks(banks, query, 60) : [], [banks, query]);
  return <div className="modal-layer" onMouseDown={onClose}><section className="search-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><span>跨题库检索 · 按相关度排序</span><h2>搜索全部题库</h2></div><button onClick={onClose}><X /></button></header><label className="search-field"><Search size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="题库名、疾病、症状或知识点；多个词用空格分隔" /><kbd>{results.length}</kbd></label><div className="search-results">{query.trim() ? results.length ? results.map(({ bank, question, matchedFields, matchedOption }) => <button key={`${bank.id}-${question.id}`} onClick={() => void onOpen(bank, question.id)}><span>{question.multiple ? "多选" : "单选"}</span><div><strong><HighlightMatches text={question.stem} query={query} /></strong><small className="search-result-location"><Database size={13} />题库：<b><HighlightMatches text={bank.name} query={query} /></b> · {question.category} · 原题号 {question.sourceNumber}</small>{matchedOption && <p className="search-match-snippet">命中选项：<HighlightMatches text={matchedOption} query={query} /></p>}<em className="search-match-fields">命中 {matchedFields.join("、")}</em></div><ChevronRight size={17} /></button>) : <div className="search-empty"><CircleHelp /><p>没有找到同时匹配这些关键词的题目。可减少一个词，或改用疾病、症状及题库名称。</p></div> : <div className="search-empty search-guide"><Search /><p>输入关键词后，会同时检索所有题库，并优先显示题库名、分类和题干中的精准命中。</p></div>}</div></section></div>;
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
  return (
    <div className="copyright-page">
      <header>
        <button className="icon-button" onClick={onHome} aria-label="返回首页"><ChevronLeft /></button>
        <Brand />
        <span>版权、免责声明与用户协议</span>
      </header>
      <main>
        <span className="overline"><FileText size={15} /> COPYRIGHT · DISCLAIMER · TERMS</span>
        <h1>让知识被认真对待，<br />也让边界清晰可见。</h1>
        <p className="copyright-lead">“红豆生南国”是一款面向医学学习场景的题库训练工具。当前题库：{bankName}。本页说明使用本产品时必须遵守的版权、隐私、医学与行为边界。</p>

        <section className="legal-alert" aria-labelledby="legal-alert-title">
          <span className="legal-alert-icon"><AlertCircle /></span>
          <div>
            <span>使用前请特别阅读</span>
            <h2 id="legal-alert-title">重要免责声明与权利义务提示</h2>
            <p><strong>题库内容的授权责任、患者隐私保护、AI 与医学信息的使用限制、违规内容处理及责任边界</strong>与你的权益直接相关。继续导入、分享、评论或调用 AI 前，请完整阅读以下协议；如不同意，请停止使用对应功能。</p>
          </div>
        </section>

        <section className="copyright-grid" aria-label="核心使用边界">
          <article><b>01</b><h2>产品与品牌</h2><p>产品名称、界面设计、蛇杖红豆标识及相关视觉资产由本项目保留。未经书面许可，不得冒用品牌、移除权利标识，或复制成同名、近似且足以造成混淆的产品。</p></article>
          <article><b>02</b><h2>题库内容</h2><p>演示题仅用于功能展示。用户导入或分享的 Word、PDF、JSON、教材与课程内容版权归原权利人所有；你应在操作前确认拥有合法的学习、整理、复制与传播权限。</p></article>
          <article><b>03</b><h2>医学与 AI 声明</h2><p>题目答案、AI 总结与讨论内容可能存在错误、遗漏或时效差异，仅用于学习辅助，不构成医疗服务，不能替代现行教材、指南、执业判断、诊断或治疗建议。</p></article>
          <article><b>04</b><h2>隐私与数据</h2><p>原始学号只用于生成不可逆同步标识。原始题库文件默认在浏览器处理；普通识别失败时，仅在你明确同意后，提取文字才会发送至所选 AI 厂商。严禁导入可识别患者身份的资料。</p></article>
        </section>

        <section className="terms-section" aria-labelledby="terms-title">
          <header className="terms-head">
            <div><span>TERMS OF RESPONSIBLE USE</span><h2 id="terms-title">免责声明与使用协议</h2></div>
            <p>版本 1.0 · 生效日期 2026-07-22</p>
          </header>
          <div className="terms-list">
            <article>
              <b>01 · 接受与适用范围</b>
              <p>本协议适用于题库导入、练习、同步、AI、评论与分享等功能。你实际使用相应功能，即表示已阅读并同意与该功能相关的条款；如不同意，请停止使用。未成年人应在监护人知情和指导下使用。</p>
            </article>
            <article className="terms-emphasis">
              <b>02 · 内容权利保证与版权保护</b>
              <p><strong>你保证对上传、导入、发布或分享的内容拥有合法权利或充分授权。</strong>不得擅自传播教材、课程、付费题库、试卷或他人的整理成果，不得转售、公开建库或规避权利人的技术保护。收到具备初步证明的侵权通知后，运营者可先行限制访问、下架或删除相关内容，并通知相关用户依法处理。</p>
            </article>
            <article>
              <b>03 · 禁止行为</b>
              <p>不得发布违法、有害、歧视、欺诈或侵权内容；不得冒用他人身份、骚扰他人、批量抓取数据、攻击或干扰服务、绕过安全措施、恶意消耗 AI 或邮件资源，也不得利用本产品组织作弊、盗版传播或其他违法活动。</p>
            </article>
            <article className="terms-emphasis">
              <b>04 · 患者隐私与个人信息</b>
              <p><strong>不得导入患者姓名、住院号、身份证号、联系方式、面部影像、原始检查资料或其他可识别个人的信息。</strong>使用者必须先完成去标识化，并确认具备合法处理依据。邮箱、学号、密钥等也不得写入题目、评论或公开分享文件。</p>
            </article>
            <article className="terms-emphasis">
              <b>05 · 医学与 AI 使用边界</b>
              <p><strong>本产品不是医疗机构，也不提供诊断、处方、治疗或急救意见。</strong>AI 可能生成不准确、过时或虚构内容，题库答案也可能存在争议。请结合权威教材、最新指南和教师意见复核，严禁直接据此对患者作出临床决定；紧急情况应联系正规医疗机构。</p>
            </article>
            <article>
              <b>06 · 第三方服务与可用性</b>
              <p>AI、邮箱、云存储等第三方服务同时受其自身条款、隐私政策、额度和可用性约束。运营者会在合理范围内维护服务，但不承诺永不中断、完全无错或适合所有特定目的。重要题库与学习记录请自行保留备份。</p>
            </article>
            <article className="terms-emphasis">
              <b>07 · 责任边界</b>
              <p>因用户无权导入或传播内容、泄露个人信息、违规使用 AI 或违反本协议产生的责任，由实施相应行为者依法承担。运营者仅在法律规定范围内承担责任；<strong>本协议不排除或限制依法不得排除的责任，包括因故意或重大过失造成的人身损害或财产损失。</strong></p>
            </article>
            <article>
              <b>08 · 举报、侵权通知与协议更新</b>
              <p>权利人可向具体部署站点公布的运营者渠道提交身份证明、权属材料、涉嫌侵权内容位置及真实联系方式。运营者核验后依法采取措施。正式上线前，站点运营者必须公布有效的版权与隐私联系邮箱。协议有重大更新时，应以醒目方式提示，并在依法需要时重新取得同意。</p>
            </article>
          </div>
          <div className="legal-reference">
            <ShieldCheck />
            <div>
              <strong>法律参考与效力边界</strong>
              <p>本页依据中华人民共和国现行民事、著作权、个人信息保护及生成式 AI 相关规则整理。它用于清晰说明产品边界，不构成针对具体争议的法律意见；公网运营、商业收费或大规模开放前，建议由中国执业律师结合运营主体、服务器所在地和实际数据流进行复核。</p>
              <nav aria-label="法律参考">
                <a href="https://gongbao.court.gov.cn/Details/dfe439fb9450f0525bd7e7b50a6242.html" target="_blank" rel="noreferrer">《中华人民共和国民法典》</a>
                <a href="https://flk.npc.gov.cn/detail?fileId=&id=ff808081752b7d430175e4766bab1557&title=%E4%B8%AD%E5%8D%8E%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9B%BD%E8%91%97%E4%BD%9C%E6%9D%83%E6%B3%95&type=" target="_blank" rel="noreferrer">《中华人民共和国著作权法》</a>
                <a href="https://www.samr.gov.cn/wljys/gzzd/art/2023/art_3ef1e889c1e644d4b65b5f5c7f432386.html" target="_blank" rel="noreferrer">《中华人民共和国个人信息保护法》</a>
                <a href="https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm" target="_blank" rel="noreferrer">《生成式人工智能服务管理暂行办法》</a>
              </nav>
            </div>
          </div>
        </section>

        <div className="copyright-actions">
          <button className="primary-action" onClick={onHome}>我已了解，返回学习</button>
          <button className="ghost-action" onClick={onRestoreDemo}>恢复演示题库</button>
        </div>
        <footer><span>© 2026 红豆生南国 · 保留相关权利</span><span>AveCove Elapse v0.3 · 医学知识训练与复盘</span></footer>
      </main>
    </div>
  );
}

function EmptySession({ onHome }: { onHome: () => void }) {
  return <div className="empty-session"><span><Check /></span><h1>这一组暂时没有题目</h1><p>可以调整练习范围，或者返回首页导入新的题库。</p><button className="primary-action" onClick={onHome}>返回首页</button></div>;
}
