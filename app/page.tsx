"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  AlertCircle, ArrowDown, ArrowRight, ArrowUp, BookOpen, Bot, BrainCircuit, Check, CheckCircle2,
  ChevronLeft, ChevronRight, CircleHelp, Clock3, Cloud, Download, FileText, Flag, Home, Import,
  Copy, Database, ExternalLink, Eye, EyeOff, GripVertical, Languages, Library, Lightbulb, Link2, ListChecks, MessageCircle, Moon, NotebookPen, Pencil, Play,
  RefreshCw, RotateCcw, ScanText, Search, Send, Settings2, Share2, ShieldCheck, Shuffle, Sparkles,
  Star, Sun, Target, ThumbsUp, Trash2, Upload, UserRound, X, Zap,
} from "lucide-react";
import questionBank from "./questions.json";
import EnglishLearningView from "./components/EnglishLearningView";
import { extractQuestionFileText, importQuestionFile, QuestionRecognitionError, type ImportUpdate } from "./lib/file-import";
import {
  activateQuestionBank, clearActiveBank, createSharedQuestionBankPackage, deleteQuestionBank,
  exportQuestionBankSyncBundle, listQuestionBanks, loadActiveBank, loadQuestionBankGroupOrder, mergeQuestionBankSyncBundle,
  parseSharedQuestionBankPackage, saveActiveBank, saveQuestionBank, saveQuestionBankGroupOrder,
  updateQuestionBankDetails, type QuestionBankInput, type SavedQuestionBank,
} from "./lib/local-bank";
import { exportEnglishTestSyncBundle, mergeEnglishTestSyncBundle } from "./lib/english-test";
import { exportEnglishPracticeSyncBundle, mergeEnglishPracticeSyncBundle } from "./lib/english-practice";
import {
  learningRecordsEqual, mergeLearningRecords, normalizeLearningRecords, stampLearningRecord,
  type LearningRecords, type RecordLedger,
} from "./lib/record-sync";
import { parseQuestionText, type QuizQuestion } from "./lib/question-parser";
import { standardizeParsedWestern306Questions, western306Score } from "./lib/medical-ai-import";
import { suggestQuestionBankGroup } from "./lib/bank-grouping";
import { readPersonalAiConfig } from "./lib/personal-ai";
import { getSearchTerms, searchQuestionBanks } from "./lib/question-search";

type Progress = Record<string, "correct" | "wrong">;
type Scope = "all" | "unanswered" | "wrong" | "favorite";
type QuestionTypeScope = "single" | "all";
type ThemeMode = "system" | "light" | "dark";
type StudyMode = "standard" | "blind" | "memorize";
type AiMode = "summary" | "pitfall" | "companion";
type View = "home" | "quiz" | "banks" | "copyright";
type AiMessage = { role: "user" | "assistant"; text: string };
type SharedComment = { id: string; nickname: string; text: string; createdAt: string; likes: number; own?: boolean; status?: string };
type AccountSession = { nickname: string; email?: string; expiresAt: number };
type ImportReport = { id: string; name: string; status: "waiting" | "processing" | "success" | "failed" | "cancelled" | "ai-ready"; detail: string };
type AiFallbackFile = { id: string; fileName: string; extractedText: string };
type IncomingBankShare = {
  token: string;
  status: "loading" | "ready" | "error" | "importing";
  bank?: QuestionBankInput;
  expiresAt?: string;
  error?: string;
};
type Western306ImportReport = {
  profile?: string;
  recognitionMode?: "deterministic" | "ai";
  examYear?: number;
  examFormat?: string;
  expectedQuestionCount?: number;
  totalPoints?: number;
  typeCounts?: Record<string, number>;
  answeredCount?: number;
  pendingAnswerCount?: number;
  missingSourceNumbers?: string[];
  duplicateSourceNumbers?: string[];
  reconciledAnswerCount?: number;
  oneToOneVerified?: boolean;
  suggestedGroupName?: string;
  warnings?: string[];
};

async function readImportApiPayload<T>(response: Response): Promise<T> {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as T;
  } catch {
    if (response.status === 504 || /<title>\s*504|gateway time-?out/i.test(raw)) {
      throw new Error("AI 标准化超过了网页网关的等待时间。原文件没有损坏，请稍后重试或联系站点管理员延长 AI 导入超时。");
    }
    if (response.status === 502 || /<title>\s*502|bad gateway/i.test(raw)) {
      throw new Error("AI 标准化期间上游服务暂时断开。原文件没有损坏，请检查 AI 厂商状态后重试。");
    }
    if (response.status === 413) {
      throw new Error("提取出的文件内容超过了服务器接收上限，请拆分文件后重试。");
    }
    throw new Error(`服务器没有返回有效的题库数据${response.status ? `（HTTP ${response.status}）` : ""}，请稍后重试。`);
  }
}
type MarkdownLineKind = "heading1" | "heading2" | "heading3" | "quote" | "list" | "paragraph" | "space";
type Settings = {
  scope: Scope;
  questionTypes: QuestionTypeScope;
  questionOrder: "sequential" | "random";
  studyMode: StudyMode;
  shuffleOptions: boolean;
  autoNext: boolean;
  showAnswerOnReturn: boolean;
  autoFavoriteWrong: boolean;
  darkMode: boolean;
  themeMode: ThemeMode;
};

const defaultSettings: Settings = {
  scope: "all",
  questionTypes: "all",
  questionOrder: "sequential",
  studyMode: "standard",
  shuffleOptions: false,
  autoNext: false,
  showAnswerOnReturn: false,
  autoFavoriteWrong: true,
  darkMode: false,
  themeMode: "system",
};

function normalizeSettings(value: unknown): Settings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaultSettings;
  const stored = value as Partial<Settings>;
  const studyMode: StudyMode = stored.studyMode === "blind" || stored.studyMode === "memorize" ? stored.studyMode : "standard";
  const themeMode: ThemeMode = stored.themeMode === "light" || stored.themeMode === "dark" || stored.themeMode === "system"
    ? stored.themeMode
    : stored.darkMode ? "dark" : "system";
  return { ...defaultSettings, ...stored, studyMode, themeMode, darkMode: themeMode === "dark" };
}

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

function noteSource(question: QuizQuestion) {
  return `${question.category} · 原题号 ${question.sourceNumber}`;
}

function parseNoteTags(markdown: string) {
  return [...new Set([...markdown.matchAll(/#([\p{L}\p{N}_-]{1,24})/gu)].map((match) => match[1]))];
}

function parseNoteSource(markdown: string, question: QuizQuestion) {
  return markdown.match(/^>\s*来源[：:]\s*(.+)$/m)?.[1]?.trim() || noteSource(question);
}

function markdownSummary(markdown: string) {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s*(?:来源|标签|参考框架|AI整理)[：:].*$/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function appendTagToNote(markdown: string, tag: string, question: QuizQuestion) {
  const clean = tag.trim().replace(/^#+/, "").replace(/[^\p{L}\p{N}_-]/gu, "").slice(0, 24);
  if (!clean || parseNoteTags(markdown).includes(clean)) return markdown;
  const base = markdown.trim() || `# ${question.stem}\n\n> 来源：${noteSource(question)}`;
  return `${base}\n\n> 标签：#${clean}\n`;
}

function appendAiToNote(markdown: string, question: QuizQuestion, modeLabel: string, content: string) {
  const cleanContent = content.trim();
  if (!cleanContent) return markdown;
  const source = noteSource(question);
  const base = markdown.trim() || `# ${question.stem}\n\n> 来源：${source}`;
  const block = [
    `## AI 整理 · ${modeLabel}`,
    `> 来源：${source}`,
    "> 参考框架：第十版 人卫教材（请以教材原文核对）",
    "",
    cleanContent,
  ].join("\n");
  if (base.includes(block)) return markdown;
  return `${base}\n\n${block}\n`;
}

function inlineMarkdown(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    return <span key={index}>{part}</span>;
  });
}

function MarkdownNotePreview({ value, empty = "还没有可预览的内容。" }: { value: string; empty?: string }) {
  const lines = value.replace(/\r/g, "").split("\n");
  const rendered = lines.map((line, index) => {
    let kind: MarkdownLineKind = "paragraph";
    let content = line;
    if (!line.trim()) kind = "space";
    else if (line.startsWith("### ")) { kind = "heading3"; content = line.slice(4); }
    else if (line.startsWith("## ")) { kind = "heading2"; content = line.slice(3); }
    else if (line.startsWith("# ")) { kind = "heading1"; content = line.slice(2); }
    else if (line.startsWith("> ")) { kind = "quote"; content = line.slice(2); }
    else if (/^[-*]\s+/.test(line)) { kind = "list"; content = line.replace(/^[-*]\s+/, ""); }
    if (kind === "space") return <span className="markdown-space" key={index} />;
    if (kind === "heading1") return <h3 key={index}>{inlineMarkdown(content)}</h3>;
    if (kind === "heading2") return <h4 key={index}>{inlineMarkdown(content)}</h4>;
    if (kind === "heading3") return <h5 key={index}>{inlineMarkdown(content)}</h5>;
    if (kind === "quote") return <blockquote key={index}>{inlineMarkdown(content)}</blockquote>;
    if (kind === "list") return <p className="markdown-list" key={index}>{inlineMarkdown(content)}</p>;
    return <p key={index}>{inlineMarkdown(content)}</p>;
  });
  return <div className="markdown-note-preview">{value.trim() ? rendered : <p className="markdown-empty">{empty}</p>}</div>;
}

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
  const [sessionStudyMode, setSessionStudyMode] = useState<StudyMode>("standard");
  const [revealedAnswers, setRevealedAnswers] = useState<string[]>([]);
  const [progress, setProgress] = useState<Progress>({});
  const [firstProgress, setFirstProgress] = useState<Progress>({});
  const [answerSelections, setAnswerSelections] = useState<Record<string, string[]>>({});
  const [favorites, setFavorites] = useState<string[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [recordLedger, setRecordLedger] = useState<RecordLedger>({});
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [showAnswerSheet, setShowAnswerSheet] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [show306Workbench, setShow306Workbench] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showMobilePanel, setShowMobilePanel] = useState(false);
  const [importState, setImportState] = useState<ImportUpdate>({ phase: "等待文件", progress: 0, detail: "支持 Word、文字 PDF 和扫描 PDF" });
  const [importError, setImportError] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importReports, setImportReports] = useState<ImportReport[]>([]);
  const [aiFallbackFiles, setAiFallbackFiles] = useState<AiFallbackFile[]>([]);
  const [showAiImport, setShowAiImport] = useState(false);
  const [answerTargetBank, setAnswerTargetBank] = useState<SavedQuestionBank | null>(null);
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
  const [manualSyncing, setManualSyncing] = useState(false);
  const [syncRevision, setSyncRevision] = useState(0);
  const [systemDark, setSystemDark] = useState(false);
  const [localReady, setLocalReady] = useState(false);
  const [toast, setToast] = useState("");
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [incomingBankShare, setIncomingBankShare] = useState<IncomingBankShare | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importAbortRef = useRef<AbortController | null>(null);
  const syncInFlightRef = useRef(false);
  const shareImportCheckedRef = useRef(false);

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
        persistLearningRecords(normalizeLearningRecords({
          progress: JSON.parse(localStorage.getItem("hongdou-progress") ?? localStorage.getItem("medquiz-progress") ?? "{}"),
          firstProgress: JSON.parse(localStorage.getItem("hongdou-first-progress") ?? "{}"),
          favorites: JSON.parse(localStorage.getItem("hongdou-favorites") ?? "[]"),
          notes: JSON.parse(localStorage.getItem("hongdou-notes") ?? "{}"),
          ledger: JSON.parse(localStorage.getItem("hongdou-record-ledger") ?? "{}"),
        }));
        setSettings(normalizeSettings(JSON.parse(localStorage.getItem("hongdou-settings") ?? "{}")));
        setNickname(localStorage.getItem("hongdou-nickname") ?? "红豆同学");
      } catch {
        // Ignore invalid local data and keep safe defaults.
      }

      const saved = await loadActiveBank().catch(() => undefined);
      const banks = await listQuestionBanks().catch(() => []);
      if (!active) return;
      setQuestionBanks(banks);
      if (saved?.questions.length) {
        setQuestions(saved.questions);
        setBankName(saved.name);
        setActiveBankId(saved.id);
      }
      setLocalReady(true);
    }

    void restoreLocalData();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!localReady || shareImportCheckedRef.current) return;
    const token = new URL(window.location.href).searchParams.get("importBank")?.trim() ?? "";
    if (!token) return;
    shareImportCheckedRef.current = true;
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      setLearningMode("medical");
      localStorage.setItem("avecove-learning-mode", "medical");
      setIncomingBankShare({ token, status: "loading" });
      return fetch(`/api/share-bank?token=${encodeURIComponent(token)}`, { signal: controller.signal });
    }).then(async (response) => {
        if (!response) return;
        const result = await response.json() as { package?: unknown; expiresAt?: string; error?: string };
        if (!response.ok || !result.package) throw new Error(result.error ?? "无法读取这条题库分享链接。");
        const bank = parseSharedQuestionBankPackage(result.package);
        setIncomingBankShare({ token, status: "ready", bank, expiresAt: result.expiresAt });
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setIncomingBankShare({ token, status: "error", error: error instanceof Error ? error.message : "无法读取这条题库分享链接。" });
      });
    return () => controller.abort();
  }, [localReady]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const changed = () => setSyncRevision((value) => value + 1);
    window.addEventListener("avecove-sync-change", changed);
    return () => window.removeEventListener("avecove-sync-change", changed);
  }, []);

  function switchLearningMode(mode: "medical" | "english") {
    setLearningMode(mode);
    localStorage.setItem("avecove-learning-mode", mode);
  }

  useEffect(() => {
    if (!localReady) return;
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
  }, [localReady]);

  useEffect(() => {
    if (!account || !syncReady) return;
    const timer = window.setTimeout(() => { void pushRemoteState(); }, 1_200);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, favorites, firstProgress, nickname, notes, progress, recordLedger, settings, syncReady, syncRevision]);

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

  const activeGroupName = activeBankId ? questionBanks.find((bank) => bank.id === activeBankId)?.groupName ?? "" : "";
  const activeGroupQuestions = activeGroupName
    ? questionBanks.filter((bank) => bank.groupName === activeGroupName).flatMap((bank) => bank.questions)
    : questions;
  const answered = Object.keys(progress).filter((id) => questions.some((question) => question.id === id)).length;
  const correct = questions.filter((question) => progress[question.id] === "correct").length;
  const wrong = activeGroupQuestions.filter((question) => progress[question.id] === "wrong").length;
  const accuracy = answered ? Math.round((correct / answered) * 100) : 0;
  const examScore = questions.some((question) => question.examProfile === "western-medicine-306")
    ? western306Score(questions, progress, firstProgress)
    : undefined;
  const sessionExamScore = sessionQuestions.some((question) => question.examProfile === "western-medicine-306")
    ? western306Score(sessionQuestions, progress, firstProgress)
    : undefined;
  const isFavorite = current ? favorites.includes(current.id) : false;

  const homeProgress = Math.min(100, Math.round((answered / Math.max(questions.length, 1)) * 100));
  const typeCounts = useMemo(() => ({
    single: questions.filter((question) => !question.multiple).length,
    multiple: questions.filter((question) => question.multiple).length,
    all: questions.length,
  }), [questions]);
  const scopeCounts = useMemo(() => {
    const typedQuestions = settings.questionTypes === "single" ? questions.filter((question) => !question.multiple) : questions;
    const typedGroupQuestions = settings.questionTypes === "single"
      ? activeGroupQuestions.filter((question) => !question.multiple)
      : activeGroupQuestions;
    return {
      all: typedQuestions.length,
      unanswered: typedQuestions.filter((question) => !progress[question.id]).length,
      wrong: typedGroupQuestions.filter((question) => progress[question.id] === "wrong").length,
      favorite: typedQuestions.filter((question) => favorites.includes(question.id)).length,
    };
  }, [activeGroupQuestions, favorites, progress, questions, settings.questionTypes]);
  const searchableBanks = useMemo(() => {
    const savedCurrent = activeBankId ? questionBanks.find((bank) => bank.id === activeBankId) : undefined;
    const currentBank: SavedQuestionBank = savedCurrent ? { ...savedCurrent, name: bankName, questions } : {
      id: "__demo__",
      name: bankName,
      description: "",
      groupName: "",
      featured: false,
      questions,
      importedAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    };
    return [currentBank, ...questionBanks.filter((bank) => bank.id !== currentBank.id)];
  }, [activeBankId, bankName, questionBanks, questions]);

  function saveSettings(next: Settings) {
    const normalized = normalizeSettings(next);
    setSettings(normalized);
    localStorage.setItem("hongdou-settings", JSON.stringify(normalized));
  }

  async function refreshLocalQuestionBanks() {
    const banks = await listQuestionBanks().catch(() => []);
    const active = await loadActiveBank().catch(() => null);
    setQuestionBanks(banks);
    if (active?.questions.length) {
      setQuestions(active.questions);
      setBankName(active.name);
      setActiveBankId(active.id);
    }
  }

  function clearIncomingBankShare() {
    const url = new URL(window.location.href);
    url.searchParams.delete("importBank");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setIncomingBankShare(null);
  }

  async function importIncomingBankShare() {
    if (!incomingBankShare?.bank || incomingBankShare.status !== "ready") return;
    setIncomingBankShare({ ...incomingBankShare, status: "importing" });
    try {
      const saved = await saveQuestionBank({
        ...incomingBankShare.bank,
        importedAt: new Date().toISOString(),
      });
      setQuestionBanks(await listQuestionBanks());
      switchLearningMode("medical");
      setView("banks");
      clearIncomingBankShare();
      setToast(`“${saved.name}”已通过分享链接导入题库 📚✨ 请核对题目与答案后再开始练习。`);
    } catch (error) {
      setIncomingBankShare({
        ...incomingBankShare,
        status: "error",
        error: error instanceof Error ? error.message : "题库暂时无法保存，请稍后重试。",
      });
    }
  }

  function persistLearningRecords(records: LearningRecords) {
    setProgress(records.progress);
    setFirstProgress(records.firstProgress);
    setFavorites(records.favorites);
    setNotes(records.notes);
    setRecordLedger(records.ledger);
    localStorage.setItem("hongdou-progress", JSON.stringify(records.progress));
    localStorage.setItem("hongdou-first-progress", JSON.stringify(records.firstProgress));
    localStorage.setItem("hongdou-favorites", JSON.stringify(records.favorites));
    localStorage.setItem("hongdou-notes", JSON.stringify(records.notes));
    localStorage.setItem("hongdou-record-ledger", JSON.stringify(records.ledger));
  }

  async function collectLearningState() {
    const [questionBanksBundle, englishTests] = await Promise.all([
      exportQuestionBankSyncBundle(),
      exportEnglishTestSyncBundle(),
    ]);
    const records = normalizeLearningRecords({ progress, firstProgress, favorites, notes, ledger: recordLedger });
    return {
      progress: records.progress,
      firstProgress: records.firstProgress,
      favorites: records.favorites,
      notes: records.notes,
      recordLedger: records.ledger,
      settings, nickname, bankName,
      questionBanks: questionBanksBundle,
      englishTests,
      englishPractice: exportEnglishPracticeSyncBundle(),
    };
  }

  async function applyLearningState(state: Record<string, unknown>) {
    const localRecords = normalizeLearningRecords({ progress, firstProgress, favorites, notes, ledger: recordLedger });
    const mergedRecords = mergeLearningRecords(
      localRecords,
      { progress: state.progress, firstProgress: state.firstProgress, favorites: state.favorites, notes: state.notes, ledger: state.recordLedger },
    );
    if (!learningRecordsEqual(localRecords, mergedRecords)) persistLearningRecords(mergedRecords);
    if (state.settings && typeof state.settings === "object" && !Array.isArray(state.settings)) {
      const next = normalizeSettings(state.settings);
      if (JSON.stringify(next) !== JSON.stringify(settings)) {
        setSettings(next);
        localStorage.setItem("hongdou-settings", JSON.stringify(next));
      }
    }
    if (typeof state.nickname === "string" && state.nickname.trim()) saveNickname(state.nickname);
    const bankResult = await mergeQuestionBankSyncBundle(state.questionBanks);
    await mergeEnglishTestSyncBundle(state.englishTests);
    mergeEnglishPracticeSyncBundle(state.englishPractice);
    if (bankResult.merged || bankResult.activeBankId) await refreshLocalQuestionBanks();
  }

  async function pushRemoteState(showMessage = false) {
    if (syncInFlightRef.current) {
      if (showMessage) setToast("已有一次同步正在进行，请稍候 ☁️");
      return;
    }
    syncInFlightRef.current = true;
    if (showMessage) {
      setManualSyncing(true);
      setSyncStatus("正在手动同步题库与学习记录… ☁️");
    }
    try {
      const response = await fetch("/api/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: await collectLearningState() }),
      });
      const result = await response.json().catch(() => ({})) as {
        error?: string;
        state?: { payload?: Record<string, unknown> };
      };
      if (!response.ok) throw new Error(result.error || "sync failed");
      if (result.state?.payload) await applyLearningState(result.state.payload);
      setSyncStatus(`题库与记录已同步 · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} ☁️`);
      if (showMessage) setToast("题库、刷题记录与英文练习已安全同步 ☁️✨");
    } catch (error) {
      setSyncStatus(error instanceof Error && error.message !== "sync failed" ? error.message : "同步暂时离线，本机记录仍已保存");
    } finally {
      syncInFlightRef.current = false;
      if (showMessage) setManualSyncing(false);
    }
  }

  async function pullRemoteState(showMessage = false) {
    if (showMessage) setSyncStatus("正在读取云端学习记录… ☁️");
    try {
      const response = await fetch("/api/sync");
      if (!response.ok) throw new Error("sync unavailable");
      const result = await response.json() as { state?: { payload?: Record<string, unknown> } | null };
      if (result.state?.payload && Object.keys(result.state.payload).length) await applyLearningState(result.state.payload);
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

  async function exportLearningRecord() {
    const content = JSON.stringify({ product: "AveCove Elapse", version: 2, exportedAt: new Date().toISOString(), state: await collectLearningState() }, null, 2);
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
      await applyLearningState(data.state);
      setToast("学习记录已接回来了 📚☁️ 熟悉的进度，一步都没有落下 ✨");
    } catch {
      setToast("这份学习记录无法识别，请选择从本产品导出的 JSON 文件。");
    }
  }

  function buildSession(custom?: Partial<Settings>, limit?: number) {
    const active = { ...settings, ...custom };
    const sourceQuestions = active.scope === "wrong" ? activeGroupQuestions : questions;
    let pool = sourceQuestions.filter((question) => {
      if (active.questionTypes === "single" && question.multiple) return false;
      if (active.scope === "unanswered") return !progress[question.id];
      if (active.scope === "wrong") return progress[question.id] === "wrong";
      if (active.scope === "favorite") return favorites.includes(question.id);
      return true;
    });
    if (active.questionOrder === "random") pool = shuffle(pool);
    if (limit && limit > 0) pool = pool.slice(0, limit);
    if (active.shuffleOptions) pool = pool.map((question) => ({ ...question, options: shuffle(question.options) }));
    const firstQuestion = pool[0];
    const memorizing = active.studyMode === "memorize";
    setSessionQuestions(pool);
    setSessionStudyMode(active.studyMode);
    setRevealedAnswers([]);
    setCurrentIndex(0);
    setSelected(memorizing ? [...(firstQuestion?.answer ?? [])] : []);
    setSubmitted(memorizing);
    setAnswerSelections({});
    setAiTexts({});
    setAiMessages([]);
    setView("quiz");
    setShowSettings(false);
  }

  function openPractice(custom?: Partial<Settings>, limit?: number) {
    if (custom) {
      const next = { ...settings, ...custom };
      saveSettings(next);
      buildSession(custom, limit);
    } else {
      setShowSettings(true);
    }
  }

  function resetQuestion(nextIndex: number, revealAnswer = false) {
    const boundedIndex = Math.max(0, Math.min(nextIndex, sessionQuestions.length - 1));
    const target = sessionQuestions[boundedIndex];
    const memorizing = sessionStudyMode === "memorize";
    const blindRevealed = Boolean(target && sessionStudyMode === "blind" && revealedAnswers.includes(target.id));
    const shouldRevealPrevious = Boolean(
      sessionStudyMode === "standard"
      && revealAnswer
      && target
      && (progress[target.id] || target.draftAnswer?.length)
      && target.answer.length,
    );
    const restoredSelection = target ? [...(answerSelections[target.id] ?? target.draftAnswer ?? [])] : [];
    setCurrentIndex(boundedIndex);
    setSelected(memorizing ? [...(target?.answer ?? [])] : sessionStudyMode === "blind" || shouldRevealPrevious ? restoredSelection : []);
    setSubmitted(memorizing || blindRevealed || shouldRevealPrevious);
    setAiTexts({});
    setAiMessages([]);
    setAiMode("summary");
  }

  function goPreviousQuestion() {
    if (currentIndex <= 0) {
      setToast("千里之行，始于足下 ✨ 已经是本轮第一题了。");
      return;
    }
    resetQuestion(currentIndex - 1, settings.showAnswerOnReturn);
  }

  function goNextQuestion() {
    if (currentIndex >= sessionQuestions.length - 1) {
      setToast("完结撒花 🎉 已经到达本轮最后一题！");
      return;
    }
    resetQuestion(currentIndex + 1);
  }

  function openQuestion(questionId: string) {
    const index = questions.findIndex((question) => question.id === questionId);
    if (index < 0) return;
    setSessionQuestions(questions);
    setSessionStudyMode("standard");
    setRevealedAnswers([]);
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
    setSelected((value) => {
      const next = current.multiple
        ? value.includes(label) ? value.filter((item) => item !== label) : [...value, label]
        : [label];
      if (sessionStudyMode === "blind") {
        setAnswerSelections((answers) => ({ ...answers, [current.id]: next }));
      }
      return next;
    });
  }

  function submitAnswer() {
    if (!current || !selected.length) return;
    setAnswerSelections((value) => ({ ...value, [current.id]: [...selected] }));
    if (sessionStudyMode === "blind") {
      setRevealedAnswers((value) => value.includes(current.id) ? value : [...value, current.id]);
    }
    if (!current.answer.length) {
      setSubmitted(true);
      setSessionQuestions((value) => value.map((question) => question.id === current.id ? { ...question, draftAnswer: [...selected] } : question));
      setQuestions((value) => value.map((question) => question.id === current.id ? { ...question, draftAnswer: [...selected] } : question));
      if (activeBankId) {
        const bank = questionBanks.find((candidate) => candidate.id === activeBankId);
        if (bank) {
          const pendingQuestions = bank.questions.map((question) => question.id === current.id ? { ...question, draftAnswer: [...selected] } : question);
          void saveQuestionBank({ ...bank, questions: pendingQuestions, updatedAt: new Date().toISOString() }, true)
            .then((saved) => setQuestionBanks((banks) => banks.map((candidate) => candidate.id === saved.id ? saved : candidate)))
            .catch(() => setToast("作答已保留在当前页面，但暂时没有写入题库。"));
        }
      }
      setToast("测试模式已记录本题选择；导入答案后可一键核对 ✍️");
      return;
    }
    const result = [...selected].sort().join("") === [...current.answer].sort().join("") ? "correct" : "wrong";
    const nextProgress = { ...progress, [current.id]: result as "correct" | "wrong" };
    const nextFirstProgress = firstProgress[current.id]
      ? firstProgress
      : { ...firstProgress, [current.id]: result as "correct" | "wrong" };
    const shouldFavorite = result === "wrong" && settings.autoFavoriteWrong && !favorites.includes(current.id);
    const nextFavorites = shouldFavorite ? [...favorites, current.id] : favorites;
    const nextLedger = stampLearningRecord(recordLedger, current.id, {
      progress: result,
      ...(!firstProgress[current.id] ? { firstProgress: result } : {}),
      ...(shouldFavorite ? { favorite: true } : {}),
    });
    persistLearningRecords({ progress: nextProgress, firstProgress: nextFirstProgress, favorites: nextFavorites, notes, ledger: nextLedger });
    setSubmitted(true);
    if (sessionStudyMode === "standard" && settings.autoNext && result === "correct") window.setTimeout(goNextQuestion, 700);
  }

  function toggleFavorite() {
    if (!current) return;
    const next = isFavorite ? favorites.filter((id) => id !== current.id) : [...favorites, current.id];
    const nextLedger = stampLearningRecord(recordLedger, current.id, { favorite: !isFavorite });
    persistLearningRecords({ progress, firstProgress, favorites: next, notes, ledger: nextLedger });
  }

  function updateNote(value: string) {
    if (!current) return;
    const next = { ...notes };
    if (value) next[current.id] = value;
    else delete next[current.id];
    const nextLedger = stampLearningRecord(recordLedger, current.id, { note: value || null });
    persistLearningRecords({ progress, firstProgress, favorites, notes: next, ledger: nextLedger });
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
        let importedDescription = "";
        let importedGroupName = "";
        let importedQuestions: QuizQuestion[];
        let usedOcr = false;
        let answeredCount = 0;
        let pendingAnswerCount = 0;
        if (/\.json$/i.test(file.name)) {
          const shared = parseSharedQuestionBankPackage(JSON.parse(await withImportTimeout(file.text(), 30_000, {
            signal: fileController.signal,
            onTimeout: () => fileController.abort(),
          })) as unknown);
          importedName = shared.name;
          importedDescription = shared.description ?? "";
          importedGroupName = shared.groupName ?? "";
          importedQuestions = shared.questions;
          answeredCount = importedQuestions.filter((question) => question.answer.length).length;
          pendingAnswerCount = importedQuestions.length - answeredCount;
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
          answeredCount = result.answeredCount;
          pendingAnswerCount = result.pendingAnswerCount;
        }
        const saved = await saveActiveBank({
          name: importedName,
          description: importedDescription,
          groupName: importedGroupName || suggestQuestionBankGroup(importedName, importedQuestions),
          questions: importedQuestions,
          importedAt: new Date().toISOString(),
        });
        setQuestions(saved.questions);
        setBankName(saved.name);
        setActiveBankId(saved.id);
        successCount += 1;
        updateImportReport(id, {
          status: "success",
          detail: `${saved.questions.length} 道客观题 · 答案 ${answeredCount}${pendingAnswerCount ? ` · 待答案 ${pendingAnswerCount}` : ""}${usedOcr ? " · OCR" : ""}`,
        });
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
    }
    if (fallbackFiles.length && !cancelled) {
      setAiFallbackFiles(fallbackFiles);
      setShowImport(false);
      setShowAiImport(true);
    }
  }

  async function recognizeFileWithAi(file: AiFallbackFile) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12 * 60_000);
    try {
      const response = await fetch("/api/import-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ fileName: file.fileName, text: file.extractedText.slice(0, 480_000), personalAi: readPersonalAiConfig() ?? undefined }),
      });
      const result = await response.json() as {
        questions?: QuizQuestion[];
        error?: string;
        report?: Western306ImportReport & { chunks?: number; successfulChunks?: number };
      };
      if (!response.ok || !result.questions?.length) throw new Error(result.error || "AI 没有返回可用题目");
      const isWestern306 = result.report?.profile === "western-medicine-306";
      const description = isWestern306
        ? `西医综合 306 专项题库：按 A、B、C、X 型题整理。已识别 ${result.questions.length} 题，已关联答案 ${result.report?.answeredCount ?? 0} 题，待导入答案 ${result.report?.pendingAnswerCount ?? 0} 题。请抽查原题号、共用选项与答案。`
        : "";
      const importedName = file.fileName.replace(/\.(doc|docx|pdf)$/i, "");
      const saved = await saveActiveBank({
        name: importedName,
        description,
        groupName: result.report?.suggestedGroupName || suggestQuestionBankGroup(importedName, result.questions),
        questions: result.questions,
        importedAt: new Date().toISOString(),
      });
      setQuestions(saved.questions);
      setBankName(saved.name);
      setActiveBankId(saved.id);
      setQuestionBanks(await listQuestionBanks());
      if ((result.report?.pendingAnswerCount ?? 0) > 0) setAnswerTargetBank(saved);
      if (result.report?.warnings?.length) {
        setToast(`已保留 ${saved.questions.length} 道有效题；${result.report.warnings.length} 个片段未完成，可稍后拆分原文件补充。`);
      } else if ((result.report?.pendingAnswerCount ?? 0) > 0) {
        setToast(`已进入测试模式：${result.report?.pendingAnswerCount} 道题等待答案，可现在导入答案文件。`);
      } else if (result.report?.oneToOneVerified) {
        setToast(`原题与答案已完成一一对应校验，${saved.questions.length} 道题按普通模式保存 ✨`);
      }
      return saved.questions.length;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw new Error("AI 识别超过 12 分钟，已停止等待；可拆分文件后重试");
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function save306WorkbenchResult(name: string, questions: QuizQuestion[], report: Western306ImportReport) {
    const counts = report.typeCounts ?? {};
    const description = [
      `西医综合 306 标准化题库${report.examYear ? ` · ${report.examYear}` : ""}`,
      `版式：${report.examFormat === "legacy-c-type" ? "旧卷 A/B/C/X" : "现代卷 A/B/X"}`,
      `已识别 ${questions.length}${report.expectedQuestionCount ? `/${report.expectedQuestionCount}` : ""} 题`,
      `A ${counts.A ?? 0} · B ${counts.B ?? 0} · C ${counts.C ?? 0} · X ${counts.X ?? 0}`,
      `已关联答案 ${report.answeredCount ?? 0} 题 · 待答案 ${report.pendingAnswerCount ?? 0} 题`,
    ].join("；");
    const saved = await saveActiveBank({
      name,
      description,
      groupName: report.suggestedGroupName || "考研西综306",
      questions,
      importedAt: new Date().toISOString(),
    });
    setQuestions(saved.questions);
    setBankName(saved.name);
    setActiveBankId(saved.id);
    setQuestionBanks(await listQuestionBanks());
    setShow306Workbench(false);
    if ((report.pendingAnswerCount ?? 0) > 0) setAnswerTargetBank(saved);
    setToast(`306 标准化完成：保留 ${saved.questions.length} 道有效题${report.missingSourceNumbers?.length ? `，仍缺 ${report.missingSourceNumbers.length} 题` : ""}。`);
  }

  async function mergeAnswerFile(bank: SavedQuestionBank, file: File, onUpdate: (update: ImportUpdate) => void) {
    const controller = new AbortController();
    const extracted = await withImportTimeout(extractQuestionFileText(file, onUpdate, controller.signal), 8 * 60_000, {
      signal: controller.signal,
      onTimeout: () => controller.abort(),
    });
    onUpdate({ phase: "AI 关联答案", progress: 72, detail: "正在按原题号匹配答案、解析与题目" });
    const response = await fetch("/api/import-answers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        fileName: file.name,
        text: extracted.text.slice(0, 480_000),
        questions: bank.questions.map((question) => ({
          id: question.id,
          sourceNumber: question.sourceNumber,
          category: question.category,
          stem: question.stem,
          options: question.options,
          questionType: question.questionType,
        })),
        personalAi: readPersonalAiConfig() ?? undefined,
      }),
    });
    const result = await response.json() as {
      answers?: Array<{ sourceNumber: string; answer: string[]; explanation?: string; answerSource?: string }>;
      error?: string;
    };
    if (!response.ok || !result.answers?.length) throw new Error(result.error || "没有找到可关联的答案");
    const patches = new Map(result.answers.map((answer) => [answer.sourceNumber, answer]));
    let checkedDrafts = 0;
    const nextProgress = { ...progress };
    const nextFirstProgress = { ...firstProgress };
    let nextLedger = { ...recordLedger };
    const mergedQuestions = bank.questions.map((question) => {
      const patch = patches.get(question.sourceNumber);
      if (!patch) return question;
      const updated = {
        ...question,
        answer: patch.answer,
        answerPending: false,
        explanation: patch.explanation || question.explanation,
        answerSource: patch.answerSource || question.answerSource || file.name,
      };
      if (question.draftAnswer?.length) {
        const status = [...question.draftAnswer].sort().join("") === [...patch.answer].sort().join("") ? "correct" : "wrong";
        nextProgress[question.id] = status;
        if (!nextFirstProgress[question.id]) nextFirstProgress[question.id] = status;
        nextLedger = stampLearningRecord(nextLedger, question.id, {
          progress: status,
          ...(!firstProgress[question.id] ? { firstProgress: status } : {}),
        });
        checkedDrafts += 1;
      }
      return updated;
    });
    const saved = await saveQuestionBank({
      ...bank,
      questions: mergedQuestions,
      description: `${bank.description}\n答案已于 ${new Date().toLocaleDateString("zh-CN")} 从“${file.name}”关联。`.trim(),
      updatedAt: new Date().toISOString(),
    }, true);
    persistLearningRecords({ progress: nextProgress, firstProgress: nextFirstProgress, favorites, notes, ledger: nextLedger });
    setQuestionBanks((banks) => banks.map((candidate) => candidate.id === saved.id ? saved : candidate));
    if (activeBankId === saved.id) {
      setQuestions(saved.questions);
      setBankName(saved.name);
      setSessionQuestions((session) => session.map((question) => saved.questions.find((candidate) => candidate.id === question.id) ?? question));
    }
    onUpdate({ phase: "答案导入完成", progress: 100, detail: `已关联 ${result.answers.length} 题${checkedDrafts ? `，并核对 ${checkedDrafts} 份测试作答` : ""}` });
    setToast(`答案已关联 ${result.answers.length} 题${checkedDrafts ? `，${checkedDrafts} 份测试作答已自动判定` : ""} ✅`);
    return { matched: result.answers.length, checkedDrafts, remaining: saved.questions.filter((question) => !question.answer.length).length };
  }

  async function restoreDemoBank() {
    await clearActiveBank();
    setQuestions(questionBank as QuizQuestion[]);
    setBankName("演示题库");
    setActiveBankId(null);
    setToast("已恢复演示题库，随时可以重新出发");
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

  async function updateSavedBankDetails(id: string, name: string, description: string, groupName: string) {
    const updated = await updateQuestionBankDetails(id, { name, description, groupName });
    setQuestionBanks((banks) => banks.map((bank) => bank.id === id ? updated : bank));
    if (activeBankId === id) setBankName(updated.name);
    setToast(`“${updated.name}”的题库信息已保存 ✍️📚`);
  }

  async function toggleSavedBankFeatured(id: string, featured: boolean) {
    const updated = await updateQuestionBankDetails(id, { featured });
    setQuestionBanks((banks) => banks.map((bank) => bank.id === id ? updated : bank));
    setToast(featured ? `“${updated.name}”已加入精选试卷 ⭐✨` : `“${updated.name}”已移出精选试卷`);
  }

  async function reviseCurrentQuestion(revision: QuizQuestion) {
    const optionLabels = new Set(revision.options.map((option) => option.label.toUpperCase()));
    const revisedAnswer = [...new Set(revision.answer.map((label) => label.toUpperCase()))]
      .filter((label) => optionLabels.has(label));
    const revisedQuestion: QuizQuestion = {
      ...revision,
      stem: revision.stem.trim(),
      options: revision.options.map((option) => ({ ...option, text: option.text.trim() })),
      answer: revisedAnswer,
      answerPending: revisedAnswer.length === 0,
      multiple: revision.questionType === "X" || revisedAnswer.length > 1,
    };
    const replaceQuestion = (items: QuizQuestion[]) => items.map((question) => (
      question.id === revisedQuestion.id ? revisedQuestion : question
    ));
    const nextQuestions = replaceQuestion(questions);
    let saved: SavedQuestionBank;

    if (activeBankId) {
      const bank = questionBanks.find((candidate) => candidate.id === activeBankId);
      if (!bank) throw new Error("当前题库暂时无法写入，请返回“我的题库”后重试");
      saved = await saveQuestionBank({
        ...bank,
        questions: replaceQuestion(bank.questions),
        updatedAt: new Date().toISOString(),
      }, true);
      setQuestionBanks((banks) => banks.map((candidate) => candidate.id === saved.id ? saved : candidate));
    } else {
      saved = await saveQuestionBank({
        id: `revised-demo-${Date.now()}`,
        name: `${bankName}（已修订）`,
        description: "由演示题库在刷题过程中修订并保存。",
        questions: nextQuestions,
        importedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, true);
      setActiveBankId(saved.id);
      setBankName(saved.name);
      setQuestionBanks((banks) => [saved, ...banks.filter((candidate) => candidate.id !== saved.id)]);
    }

    setQuestions(replaceQuestion(saved.questions));
    setSessionQuestions((session) => replaceQuestion(session));
    setAiTexts({});
    setAiMessages([]);

    const previousSelection = answerSelections[revisedQuestion.id] ?? selected;
    if (sessionStudyMode !== "memorize" && submitted && revisedAnswer.length && previousSelection.length) {
      const revisedResult = [...previousSelection].sort().join("") === [...revisedAnswer].sort().join("") ? "correct" : "wrong";
      const nextProgress = { ...progress, [revisedQuestion.id]: revisedResult as "correct" | "wrong" };
      const nextLedger = stampLearningRecord(recordLedger, revisedQuestion.id, { progress: revisedResult });
      persistLearningRecords({
        progress: nextProgress,
        firstProgress,
        favorites,
        notes,
        ledger: nextLedger,
      });
    }

    setToast("题目修订已保存 ✏️✨ 当前题库、多端同步与后续分享都会使用这个版本。");
  }

  async function removeSavedBank(id: string) {
    await deleteQuestionBank(id);
    setQuestionBanks((banks) => banks.filter((bank) => bank.id !== id));
    if (activeBankId === id) await restoreDemoBank();
    else {
      setToast("题库已从本机移除，其他学习记录不受影响");
    }
  }

  async function resetSavedBankProgress(bank: SavedQuestionBank) {
    const questionIds = new Set(bank.questions.map((question) => question.id));
    const nextProgress = Object.fromEntries(Object.entries(progress).filter(([id]) => !questionIds.has(id))) as Progress;
    const nextFirstProgress = Object.fromEntries(Object.entries(firstProgress).filter(([id]) => !questionIds.has(id))) as Progress;
    const nextFavorites = favorites.filter((id) => !questionIds.has(id));
    const nextNotes = Object.fromEntries(Object.entries(notes).filter(([id]) => !questionIds.has(id)));
    const resetAt = Date.now();
    const nextLedger = { ...recordLedger };
    for (const questionId of questionIds) {
      nextLedger[questionId] = {
        ...nextLedger[questionId],
        progress: { value: null, updatedAt: resetAt },
        firstProgress: { value: null, updatedAt: resetAt },
        favorite: { value: false, updatedAt: resetAt },
        note: { value: null, updatedAt: resetAt },
      };
    }
    persistLearningRecords({ progress: nextProgress, firstProgress: nextFirstProgress, favorites: nextFavorites, notes: nextNotes, ledger: nextLedger });
    setToast(`“${bank.name}”的刷题记录已重置，题库本身仍然保留。`);
  }

  async function openSavedQuestion(bank: SavedQuestionBank, questionId: string) {
    await selectQuestionBank(bank.id, "quiz");
    const index = bank.questions.findIndex((question) => question.id === questionId);
    setSessionQuestions(bank.questions);
    setSessionStudyMode("standard");
    setRevealedAnswers([]);
    setCurrentIndex(Math.max(0, index));
    setSelected([]);
    setSubmitted(false);
    setAiTexts({});
    setAiMessages([]);
  }

  const resolvedDark = settings.themeMode === "system" ? systemDark : settings.themeMode === "dark";

  if (learningMode === "english") {
    return <main className={`product english-product ${resolvedDark ? "dark" : ""}`}><EnglishLearningView onExit={() => switchLearningMode("medical")} /></main>;
  }

  return (
    <main className={`product ${resolvedDark ? "dark" : ""}`}>
      {view === "home" ? (
        <HomeView
          bankName={bankName}
          questions={questions.length}
          answered={answered}
          wrong={wrong}
          noteCount={Object.values(notes).filter((note) => note.trim().length > 0).length}
          accuracy={accuracy}
          progress={homeProgress}
          examScore={examScore}
          onPractice={(custom, limit) => openPractice(custom ? { ...custom, studyMode: "standard" } : undefined, limit)}
          onImport={() => setShowImport(true)}
          onBanks={() => setView("banks")}
          onSearch={() => setShowSearch(true)}
          onNotes={() => setShowNotes(true)}
          onCopyright={() => setView("copyright")}
          onToggleTheme={() => saveSettings({ ...settings, themeMode: resolvedDark ? "light" : "dark", darkMode: !resolvedDark })}
          darkMode={resolvedDark}
          nickname={nickname}
          account={account}
          syncStatus={syncStatus}
          syncing={manualSyncing}
          quote={homeQuotes[quoteIndex]}
          onAccount={() => setShowAccount(true)}
          onSync={() => pushRemoteState(true)}
          onEnglish={() => switchLearningMode("english")}
        />
      ) : view === "banks" ? (
        <QuestionBankPage
          banks={questionBanks}
          activeBankId={activeBankId}
          onHome={() => setView("home")}
          onImport={() => setShowImport(true)}
          onImportAnswers={(bank) => setAnswerTargetBank(bank)}
          onSelect={(id) => selectQuestionBank(id, "home")}
          onUpdate={updateSavedBankDetails}
          onToggleFeatured={toggleSavedBankFeatured}
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
          examScore={sessionExamScore}
          selected={selected}
          submitted={submitted}
          studyMode={sessionStudyMode}
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
          onPrevious={goPreviousQuestion}
          onNext={goNextQuestion}
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
          onEditQuestion={reviseCurrentQuestion}
        />
      ) : (
        <EmptySession onHome={() => setView("home")} />
      )}

      {showSettings && (
        <SettingsModal settings={settings} counts={scopeCounts} typeCounts={typeCounts} onChange={saveSettings} onClose={() => setShowSettings(false)} onStart={() => buildSession()} />
      )}
      {showAnswerSheet && (
        <AnswerSheet questions={sessionQuestions} progress={progress} answerSelections={answerSelections} currentIndex={currentIndex} onJump={(next) => { resetQuestion(next); setShowAnswerSheet(false); }} onClose={() => setShowAnswerSheet(false)} />
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
          on306={() => { setShowImport(false); setShow306Workbench(true); }}
        />
      )}
      {show306Workbench && <Western306Workbench onClose={() => setShow306Workbench(false)} onSave={save306WorkbenchResult} />}
      {showAiImport && <AiImportFallbackModal files={aiFallbackFiles} onRecognize={recognizeFileWithAi} onClose={() => { setShowAiImport(false); setAiFallbackFiles([]); }} />}
      {answerTargetBank && <AnswerImportModal bank={answerTargetBank} onMerge={mergeAnswerFile} onClose={() => setAnswerTargetBank(null)} />}
      {showSearch && <SearchModal banks={searchableBanks} onOpen={async (bank, questionId) => { if (bank.id === "__demo__") openQuestion(questionId); else { await openSavedQuestion(bank, questionId); setShowSearch(false); } }} onClose={() => setShowSearch(false)} />}
      {showNotes && <NotesModal questions={questions} notes={notes} onOpen={openQuestion} onClose={() => setShowNotes(false)} />}
      {showAccount && <AccountModal account={account} syncStatus={syncStatus} nickname={nickname} onClose={() => setShowAccount(false)} onAuthenticated={finishAuthentication} onLogout={logoutAccount} onDelete={deleteAccount} onSync={() => pushRemoteState(true)} onExport={() => { void exportLearningRecord(); }} onImport={importLearningRecord} />}
      {incomingBankShare && <IncomingBankShareModal share={incomingBankShare} onImport={() => void importIncomingBankShare()} onClose={clearIncomingBankShare} />}
      {toast && <SuccessToast message={toast} onClose={() => setToast("")} />}
    </main>
  );
}

function Brand({ compact = false, hideTagline = false }: { compact?: boolean; hideTagline?: boolean }) {
  return <div className={`brand ${compact ? "compact" : ""}`}><span className="brand-logo"><Image src="/hongdou-logo.png" alt="红豆生南国蛇形医学标识" width={48} height={48} priority /></span><div><strong>红豆生南国</strong>{!hideTagline && <small>医学知识训练与复盘</small>}</div></div>;
}

function HomeView({ bankName, questions, answered, wrong, noteCount, accuracy, progress, examScore, onPractice, onImport, onBanks, onSearch, onNotes, onCopyright, onToggleTheme, darkMode, nickname, account, syncStatus, syncing, quote, onAccount, onSync, onEnglish }: {
  bankName: string; questions: number; answered: number; wrong: number; noteCount: number; accuracy: number; progress: number;
  examScore?: { earned: number; answeredMaximum: number; total: number };
  onPractice: (custom?: Partial<Settings>, limit?: number) => void; onImport: () => void; onBanks: () => void; onSearch: () => void; onNotes: () => void;
  onCopyright: () => void; onToggleTheme: () => void; darkMode: boolean; nickname: string;
  account: AccountSession | null; syncStatus: string; syncing: boolean; quote: (typeof homeQuotes)[number]; onAccount: () => void; onSync: () => void; onEnglish: () => void;
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
        <button onClick={onNotes}><NotebookPen size={19} />我的笔记{noteCount > 0 && <em>{noteCount}</em>}</button>
      </nav>
      <div className="sidebar-bottom"><button className="sync-entry" onClick={onAccount}><Cloud size={18} />{account ? "管理多端同步" : "开启多端同步"}</button>{account && <div className="sync-caption-row"><small className="sync-caption">{syncStatus}</small><button className="sync-now" aria-label="立即手动同步" title="立即手动同步" onClick={onSync} disabled={syncing}><RefreshCw className={syncing ? "spinning" : ""} /></button></div>}<button className="import-entry" aria-label="导入题库" onClick={onImport}><Import size={18} /><span>导入题库</span></button><a className="custom-ai-entry" aria-label="自定义 AI" href="/custom-ai"><Bot size={17} /><span>自定义AI</span></a><button className="copyright-link" onClick={onCopyright}><FileText size={16} />版权、声明与协议</button><p>本地优先 · 无广告<br />.docx / PDF 本机处理 · 旧 .doc 仅内存转换</p></div>
    </aside>
    <section className="home-main">
      <header className="home-topbar"><div className="home-quote"><p><Sparkles size={13} />{quote.lead}</p><h1>{quote.title}</h1></div><div className="top-actions"><button className="english-learning-toggle" aria-label="English Learning" onClick={onEnglish}><Languages size={17} /><span>English Learning</span></button><button aria-label="搜索题目" onClick={onSearch}><Search size={19} /></button><button aria-label="切换主题" onClick={onToggleTheme}>{darkMode ? <Sun size={19} /> : <Moon size={19} />}</button><button className="profile" onClick={onAccount} aria-label="同步身份">{(nickname.trim()[0] || "红").toUpperCase()}</button></div></header>
      <section className="home-bento" aria-label="今日学习概览">
        <article className="hero-card bento-hero">
          <div className="hero-copy"><span className="overline"><Sparkles size={14} /> 今日学习</span><h2>{bankName}</h2><p>{bankName === "演示题库" ? "用少量示例题体验完整流程；准备好后，导入属于自己的医学题库。" : "从上次停下的地方继续。系统会把错题与薄弱知识点带回你的学习节奏。"}</p><div className="hero-actions"><button className="primary-action" onClick={() => onPractice({ scope: answered ? "unanswered" : "all" })}><Play size={17} fill="currentColor" />{answered ? "继续学习" : "开始学习"}</button><button className="ghost-action" onClick={() => onPractice()}>练习设置 <Settings2 size={16} /></button></div></div>
        </article>
        <article className="bento-progress-card" aria-label={`当前学习进度 ${progress}%`}>
          <span className="overline">STUDY PULSE</span>
          <div className="hero-progress"><div className="progress-orbit" style={{ "--p": `${progress * 3.6}deg` } as React.CSSProperties}><div><strong>{progress}%</strong><span>总进度</span></div></div><ul>{examScore ? <><li><span>西综题目</span><b>{questions}</b></li><li><span>首次作答得分</span><b>{examScore.earned}</b></li><li><span>试卷总分</span><b>{examScore.total}</b></li></> : <><li><span>题目总数</span><b>{questions}</b></li><li><span>已完成</span><b>{answered}</b></li><li><span>当前正确率</span><b>{accuracy}%</b></li></>}</ul></div>
        </article>
        <article className="bento-practice">
          <div className="section-heading"><div><span>选择一种节奏</span><h2>开始今天的练习</h2></div><button onClick={() => onPractice()}>更多设置 <ChevronRight size={16} /></button></div>
          <section className="mode-grid">
            <button className="mode-card red" onClick={() => onPractice({ scope: "unanswered", questionOrder: "sequential" })}><span><BookOpen size={20} /></span><div><strong>顺序练习</strong><p>按原题顺序稳步推进，适合系统完成第一遍。</p></div><ChevronRight size={18} /></button>
            <button className="mode-card green" onClick={() => onPractice({ scope: "all", questionOrder: "random" }, 20)}><span><Shuffle size={20} /></span><div><strong>随机挑战</strong><p>从当前题库随机抽取 20 道，检验真正掌握而非顺序记忆。</p></div><ChevronRight size={18} /></button>
            <button className="mode-card gold" onClick={() => onPractice({ scope: "wrong", questionOrder: "random" })}><span><RotateCcw size={20} /></span><div><strong>错题复盘</strong><p>{wrong ? `${wrong} 道错题集中回炉，把薄弱点逐个拿下。` : "当前没有错题，可以先完成一组新练习。"}</p></div><ChevronRight size={18} /></button>
            <button className="mode-card blue" onClick={() => onPractice({ scope: "all", questionOrder: "random", shuffleOptions: true }, 100)}><span><Clock3 size={20} /></span><div><strong>模拟考试</strong><p>从当前题库随机抽取 100 道，题序与选项同时随机，更接近实战。</p></div><ChevronRight size={18} /></button>
          </section>
        </article>
        <article className="bento-library-card">
          <span className="bento-library-icon"><Database size={24} /></span>
          <div><span className="overline">YOUR LIBRARY</span><h2>知识书架</h2><p>当前题库共收录 <b>{questions}</b> 道题。导入、切换与整理都集中在这里。</p></div>
          <div className="bento-library-actions"><button onClick={onBanks}>查看题库 <ArrowRight size={16} /></button><button onClick={onImport}><Import size={16} />导入</button></div>
        </article>
        <article className="insight-card bento-insight"><div className="card-title"><span><Target size={18} /></span><div><strong>学习洞察</strong><p>你的个人复盘视图</p></div></div><div className="metrics"><div><b>{answered}</b><span>累计完成</span></div><div><b>{accuracy}%</b><span>正确率</span></div><div><b>{wrong}</b><span>待巩固</span></div></div><div className="tip"><Lightbulb size={17} /><p>{wrong ? "优先重做错题，比盲目刷新题更有效。" : "先完成一组题，系统就能开始生成复盘建议。"}</p></div></article>
        <article className="ai-preview bento-ai"><div className="ai-preview-head"><span className="ai-orb"><BrainCircuit size={22} /></span><div><small>AI 学习讨论区</small><strong>不是只给答案，而是陪你把题想明白</strong></div></div><div className="ai-chips"><span>大神总结</span><span>易错提示</span><span>知微</span></div><p>提交答案后，针对当前题目生成总结、辨析常见误区，并继续追问。</p><button onClick={() => onPractice({ scope: "unanswered" })}>去体验 <ArrowRight size={16} /></button></article>
      </section>
      <footer className="home-footer"><span>© 2026 红豆生南国</span><nav aria-label="站点相关链接"><a href="https://avecrouge.top/" target="_blank" rel="noreferrer">访问作者博客</a><button onClick={onCopyright}>版权、免责声明与用户协议 <ChevronRight size={14} /></button></nav></footer>
    </section>
  </div>;
}

const UNGROUPED_BANKS = "未分组题库";

function reconcileQuestionBankGroupOrder(order: string[], names: string[]) {
  const available = new Set(names);
  const kept = order.filter((name, index) => available.has(name) && order.indexOf(name) === index);
  const missing = names
    .filter((name) => !kept.includes(name))
    .sort((left, right) => left === UNGROUPED_BANKS ? 1 : right === UNGROUPED_BANKS ? -1 : left.localeCompare(right, "zh-CN"));
  return [...kept, ...missing];
}

function QuestionBankPage({ banks, activeBankId, progress, favorites, notes, onHome, onImport, onImportAnswers, onSelect, onUpdate, onToggleFeatured, onDelete, onReset, onOpenQuestion }: {
  banks: SavedQuestionBank[];
  activeBankId: string | null;
  progress: Progress;
  favorites: string[];
  notes: Record<string, string>;
  onHome: () => void;
  onImport: () => void;
  onImportAnswers: (bank: SavedQuestionBank) => void;
  onSelect: (id: string) => Promise<void>;
  onUpdate: (id: string, name: string, description: string, groupName: string) => Promise<void>;
  onToggleFeatured: (id: string, featured: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReset: (bank: SavedQuestionBank) => Promise<void>;
  onOpenQuestion: (bank: SavedQuestionBank, questionId: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editGroupName, setEditGroupName] = useState("");
  const [expandedDescriptionIds, setExpandedDescriptionIds] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sharingBank, setSharingBank] = useState<SavedQuestionBank | null>(null);
  const [resettingBank, setResettingBank] = useState<SavedQuestionBank | null>(null);
  const [groupOrder, setGroupOrder] = useState<string[]>([]);
  const [draggedGroup, setDraggedGroup] = useState<string | null>(null);
  const keyword = query.trim();
  const totalQuestions = banks.reduce((sum, bank) => sum + bank.questions.length, 0);
  const multipleQuestions = banks.reduce((sum, bank) => sum + bank.questions.filter((question) => question.multiple).length, 0);
  const searchResults = useMemo(() => searchQuestionBanks(banks, query, 100), [banks, query]);
  const availableGroupNames = useMemo(
    () => [...new Set(banks.map((bank) => bank.groupName || UNGROUPED_BANKS))],
    [banks],
  );

  useEffect(() => {
    let active = true;
    void loadQuestionBankGroupOrder().then((savedOrder) => {
      if (!active) return;
      const next = reconcileQuestionBankGroupOrder(savedOrder, availableGroupNames);
      setGroupOrder(next);
      if (JSON.stringify(next) !== JSON.stringify(savedOrder)) void saveQuestionBankGroupOrder(next);
    });
    return () => { active = false; };
  }, [availableGroupNames]);

  const groupedBanks = useMemo(() => {
    const groups = new Map<string, SavedQuestionBank[]>();
    for (const bank of banks) {
      const key = bank.groupName || UNGROUPED_BANKS;
      groups.set(key, [...(groups.get(key) ?? []), bank]);
    }
    const rank = new Map(groupOrder.map((name, index) => [name, index]));
    return [...groups.entries()]
      .sort(([left], [right]) => {
        const leftRank = rank.get(left);
        const rightRank = rank.get(right);
        if (leftRank !== undefined || rightRank !== undefined) return (leftRank ?? Number.MAX_SAFE_INTEGER) - (rightRank ?? Number.MAX_SAFE_INTEGER);
        return left === UNGROUPED_BANKS ? 1 : right === UNGROUPED_BANKS ? -1 : left.localeCompare(right, "zh-CN");
      })
      .map(([name, entries]) => ({ name, banks: entries }));
  }, [banks, groupOrder]);
  const featuredBanks = useMemo(
    () => banks.filter((bank) => bank.featured).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [banks],
  );

  function persistGroupOrder(next: string[]) {
    setGroupOrder(next);
    void saveQuestionBankGroupOrder(next);
  }

  function moveGroup(name: string, offset: -1 | 1) {
    const current = reconcileQuestionBankGroupOrder(groupOrder, availableGroupNames);
    const index = current.indexOf(name);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= current.length) return;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    persistGroupOrder(next);
  }

  function dropGroup(targetName: string) {
    if (!draggedGroup || draggedGroup === targetName) return setDraggedGroup(null);
    const current = reconcileQuestionBankGroupOrder(groupOrder, availableGroupNames);
    const sourceIndex = current.indexOf(draggedGroup);
    const targetIndex = current.indexOf(targetName);
    if (sourceIndex < 0 || targetIndex < 0) return setDraggedGroup(null);
    const next = [...current];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    persistGroupOrder(next);
    setDraggedGroup(null);
  }

  async function submitEdit(bank: SavedQuestionBank) {
    const name = editName.trim().slice(0, 60);
    const description = editDescription.trim().slice(0, 4_000);
    const groupName = editGroupName.trim().slice(0, 60);
    if (!name) return;
    if (name !== bank.name || description !== bank.description || groupName !== bank.groupName) {
      await onUpdate(bank.id, name, description, groupName);
    }
    setEditingId(null);
  }

  function beginEdit(bank: SavedQuestionBank) {
    setEditingId(bank.id);
    setEditName(bank.name);
    setEditDescription(bank.description);
    setEditGroupName(bank.groupName);
  }

  function toggleDescription(id: string) {
    setExpandedDescriptionIds((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]);
  }

  return <div className="bank-page">
    <header className="bank-page-header"><button className="icon-button" onClick={onHome} aria-label="返回首页"><ChevronLeft /></button><Brand compact /><div><span>本机题库空间</span><strong>我的题库</strong></div><button className="primary-action" onClick={onImport}><Import size={17} />导入题库</button></header>
    <main>
      <section className="bank-page-intro"><div><span className="overline"><Database size={15} /> QUESTION LIBRARY</span><h1>把散落的题目，<br />收进自己的知识书架。</h1><p>已导入题库都保存在当前浏览器。可随时切换、重命名、跨题库检索，或在确认版权边界后分享给同学。</p></div><div className="bank-overview"><article><b>{banks.length}</b><span>已导入题库</span></article><article><b>{totalQuestions}</b><span>收录题目</span></article><article><b>{multipleQuestions}</b><span>多选题</span></article></div></section>
      <label className="bank-global-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="全局搜索：题库名、疾病、症状或知识点" /><span>{keyword ? `${searchResults.length} 条结果` : "搜索全部题库"}</span></label>
      {keyword ? <section className="bank-search-section"><div className="bank-section-title"><div><span>GLOBAL SEARCH · 按相关度排序</span><h2>全局搜索结果</h2></div><button onClick={() => setQuery("")}><X size={16} />清除搜索</button></div>{searchResults.length ? <div className="bank-question-results">{searchResults.map(({ bank, question, matchedFields, matchedOption }) => <button key={`${bank.id}-${question.id}`} onClick={() => onOpenQuestion(bank, question.id)}><span className={question.multiple ? "multi" : ""}>{question.multiple ? "多选" : "单选"}</span><div><strong><HighlightMatches text={question.stem} query={query} /></strong><small className="search-result-location"><Database size={13} />题库：<b><HighlightMatches text={bank.name} query={query} /></b><i>·</i>分组：<b>{bank.groupName || "未分组"}</b><i>·</i>分类：<b><HighlightMatches text={question.category} query={query} /></b><i>·</i>原题号 {question.sourceNumber}</small>{matchedOption && <p className="search-match-snippet">命中选项：<HighlightMatches text={matchedOption} query={query} /></p>}<em className="search-match-fields">命中 {matchedFields.join("、")}</em></div><ChevronRight /></button>)}</div> : <div className="bank-empty"><CircleHelp /><h2>还没有找到这条知识线索</h2><p>可输入多个关键词并用空格分隔，例如“肺炎 发热”；系统会要求每个关键词都有命中。</p></div>}</section> : <section className="bank-library-section"><div className="bank-section-title"><div><span>LOCAL COLLECTION</span><h2>已导入的题库</h2></div><p>分组可拖动排序；手机端可使用上下按钮</p></div>{banks.length ? <div className="bank-library-content"><section className="featured-bank-section" aria-labelledby="featured-bank-title"><header><div><span className="featured-bank-mark"><Sparkles /></span><span><small>CURATED PAPERS</small><h2 id="featured-bank-title">精选试卷</h2><p>把近期重点、经典真题或高频复习卷固定在这里。</p></span></div><em>{featuredBanks.length} 份精选</em></header>{featuredBanks.length ? <div className="featured-bank-grid">{featuredBanks.map((bank) => {
        const completed = bank.questions.filter((question) => Boolean(progress[question.id])).length;
        const completion = bank.questions.length ? Math.round((completed / bank.questions.length) * 100) : 0;
        const isActive = bank.id === activeBankId;
        return <article className={`featured-bank-card ${isActive ? "active" : ""}`} key={`featured-${bank.id}`}><div className="featured-bank-card-head"><span><Star fill="currentColor" />精选</span><small>{bank.groupName || "未分组"}</small></div><h3>{bank.name}</h3><p>{bank.questions.length} 道题 · 已完成 {completed} 道</p><div className="featured-bank-progress" aria-label={`精选试卷学习进度 ${completion}%`}><i><b style={{ width: `${completion}%` }} /></i><strong>{completion}%</strong></div><footer><button className="featured-bank-open" onClick={() => onSelect(bank.id)} disabled={isActive}>{isActive ? "正在使用" : "使用这份试卷"}</button><button className="featured-bank-remove" aria-label={`取消精选 ${bank.name}`} title="取消精选" onClick={() => void onToggleFeatured(bank.id, false)}><Star fill="currentColor" /></button></footer></article>;
      })}</div> : <div className="featured-bank-empty"><Star /><div><strong>还没有精选试卷</strong><p>点击题库卡片右上角的星标，把重点试卷加入这里。</p></div></div>}</section><div className="bank-group-list">{groupedBanks.map((group, groupIndex) => <section className={`bank-group-section ${draggedGroup === group.name ? "dragging" : ""}`} key={group.name} draggable onDragStart={() => setDraggedGroup(group.name)} onDragEnd={() => setDraggedGroup(null)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropGroup(group.name)}><header className="bank-group-heading"><div><GripVertical className="bank-group-grip" aria-hidden="true" /><Library size={18} /><span><strong>{group.name}</strong><small>{group.banks.length} 份题库 · {group.banks.reduce((sum, bank) => sum + bank.questions.length, 0)} 道题</small></span></div><div className="bank-group-order"><em>{group.name === UNGROUPED_BANKS ? "可在编辑中设置分组" : "组内错题可跨文件复盘"}</em><span><button type="button" aria-label={`上移分组 ${group.name}`} title="上移分组" disabled={groupIndex === 0} onClick={() => moveGroup(group.name, -1)}><ArrowUp /></button><button type="button" aria-label={`下移分组 ${group.name}`} title="下移分组" disabled={groupIndex === groupedBanks.length - 1} onClick={() => moveGroup(group.name, 1)}><ArrowDown /></button></span></div></header><div className="bank-card-grid">{group.banks.map((bank) => {
        const singleCount = bank.questions.filter((question) => !question.multiple).length;
        const multipleCount = bank.questions.length - singleCount;
        const isActive = bank.id === activeBankId;
        const isEditing = editingId === bank.id;
        const isDeleting = deletingId === bank.id;
        const descriptionExpanded = expandedDescriptionIds.includes(bank.id);
        const descriptionIsLong = bank.description.length > 120 || bank.description.includes("\n");
        const pendingAnswerCount = bank.questions.filter((question) => !question.answer.length).length;
        const completedCount = bank.questions.filter((question) => Boolean(progress[question.id])).length;
        const completion = bank.questions.length ? Math.round((completedCount / bank.questions.length) * 100) : 0;
        return <article className={`bank-card ${isActive ? "active" : ""}`} key={bank.id}>
          <header><span className="bank-card-icon"><Database /></span><div className="bank-card-head-actions">{isActive && <em><Check size={13} />当前题库</em>}<button type="button" className={`bank-feature-toggle ${bank.featured ? "active" : ""}`} aria-label={`${bank.featured ? "取消精选" : "设为精选"} ${bank.name}`} aria-pressed={bank.featured} title={bank.featured ? "移出精选试卷" : "加入精选试卷"} onClick={() => void onToggleFeatured(bank.id, !bank.featured)}><Star fill={bank.featured ? "currentColor" : "none"} /></button></div></header>
          {isEditing ? <form className="bank-edit" onSubmit={(event) => { event.preventDefault(); void submitEdit(bank); }}>
            <label><span>题库名称</span><input autoFocus value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={60} /></label>
            <label><span>所属分组</span><input value={editGroupName} onChange={(event) => setEditGroupName(event.target.value)} maxLength={60} list="question-bank-groups" placeholder="例如：考研西综306；留空则不分组" /><datalist id="question-bank-groups">{groupedBanks.filter((item) => item.name !== "未分组题库").map((item) => <option key={item.name} value={item.name} />)}</datalist></label>
            <label><span>题库简介</span><textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} maxLength={4_000} rows={7} placeholder="可填写题库范围、章节目录、来源说明或适用考试；请勿录入患者及其他敏感信息。" /></label>
            <small>{editDescription.length} / 4000</small>
            <div><button type="submit" disabled={!editName.trim()}><Check size={15} />保存信息</button><button type="button" onClick={() => setEditingId(null)}><X size={15} />取消</button></div>
          </form> : <><span className="bank-group-chip">{bank.groupName || "未分组"}</span><h3>{bank.name}</h3><p>{bank.questions.length} 道题 · 单选 {singleCount} · 多选 {multipleCount}</p>
            {bank.description && <section className={`bank-description ${descriptionExpanded ? "expanded" : ""}`}><div><span><FileText size={14} />题库简介</span>{descriptionIsLong && <button type="button" aria-expanded={descriptionExpanded} onClick={() => toggleDescription(bank.id)}>{descriptionExpanded ? "收起" : "展开全文"}<ChevronRight size={14} /></button>}</div><p>{bank.description}</p></section>}
            <div className="bank-card-progress" aria-label={`已完成 ${completedCount} 道，共 ${bank.questions.length} 道`}><div><span>学习进度 · {completedCount}/{bank.questions.length}</span><b>{completion}%</b></div><i><b style={{ width: `${completion}%` }} /></i></div>
          </>}
          <div className="bank-card-meta"><span>导入于 {new Date(bank.importedAt).toLocaleDateString("zh-CN")}</span><span>仅存本机</span></div>
          {pendingAnswerCount > 0 && <div className="bank-answer-pending"><CircleHelp /><div><strong>测试模式 · {pendingAnswerCount} 题待答案</strong><span>可以先作答，之后导入答案文件一键核对。</span></div><button onClick={() => onImportAnswers(bank)}><Upload />导入答案</button></div>}
          {isDeleting ? <div className="bank-delete-confirm"><p>确认从本机移除这份题库？此操作无法撤销。</p><div><button onClick={() => { void onDelete(bank.id); setDeletingId(null); }}>确认移除</button><button onClick={() => setDeletingId(null)}>取消</button></div></div> : <footer><button className="bank-open" onClick={() => onSelect(bank.id)} disabled={isActive}>{isActive ? "正在使用" : "设为当前"}</button><button aria-label="编辑题库名称与简介" title="编辑题库名称与简介" onClick={() => beginEdit(bank)}><Pencil /></button><button aria-label="重置刷题记录" title="重置刷题记录" onClick={() => setResettingBank(bank)}><RotateCcw /></button><button aria-label="分享题库" title="分享题库" onClick={() => setSharingBank(bank)}><Share2 /></button><button className="danger" aria-label="删除题库" title="删除题库" onClick={() => setDeletingId(bank.id)}><Trash2 /></button></footer>}
        </article>;
      })}</div></section>)}</div></div> : <div className="bank-empty"><Database /><h2>题库书架还是空的</h2><p>导入 Word、PDF 或同学分享的红豆题库文件后，会自动收录在这里。</p><button className="primary-action" onClick={onImport}><Import size={17} />导入第一份题库</button></div>}</section>}
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
  const [shareUrl, setShareUrl] = useState("");
  const [creatingLink, setCreatingLink] = useState(false);

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

  async function copyShareLink(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const field = document.createElement("textarea");
      field.value = value;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }
    setMessage("导入链接已复制 ✨ 对方打开后确认版权提示，即可收进“我的题库”。");
  }

  async function createImportLink() {
    if (!accepted || creatingLink) return;
    if (shareUrl) return copyShareLink(shareUrl);
    setCreatingLink(true);
    setMessage("");
    try {
      const response = await fetch("/api/share-bank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package: createSharedQuestionBankPackage(bank) }),
      });
      const result = await response.json() as { token?: string; error?: string };
      if (!response.ok || !result.token) throw new Error(result.error ?? "暂时无法生成导入链接。");
      const url = new URL(window.location.origin);
      url.searchParams.set("importBank", result.token);
      const value = url.toString();
      setShareUrl(value);
      await copyShareLink(value);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "暂时无法生成导入链接，请使用分享文件。");
    } finally {
      setCreatingLink(false);
    }
  }

  return <div className="modal-layer" onMouseDown={onClose}><section className="share-bank-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><span>SHARE WITH CARE</span><h2>分享“{bank.name}”</h2></div><button onClick={onClose}><X /></button></header><div className="share-copyright-alert"><ShieldCheck /><div><strong>分享之前，请先确认版权与隐私边界</strong><p>请确认你拥有这份题库的使用与传播权限。不要分享未经授权的教材、课程内容，也不要包含姓名、学号、患者资料或其他敏感信息。</p></div></div><div className="share-summary"><Database /><div><strong>{bank.questions.length} 道题</strong><span>文件或链接都会包含题库简介、题干、选项与答案，并采用当前修订后的版本</span></div></div>{bank.description && <div className="share-bank-description"><FileText /><div><strong>随题库分享的简介</strong><p>{bank.description}</p></div></div>}<button className={`copyright-check ${accepted ? "checked" : ""}`} role="checkbox" aria-checked={accepted} onClick={() => setAccepted((value) => !value)}><i>{accepted && <Check />}</i><span>我已确认拥有必要权限，并会尊重题库原作者与相关权利人的版权。</span></button>{shareUrl && <div className="share-link-result"><Link2 /><div><strong>导入链接已生成 · 7 天有效</strong><input aria-label="题库导入链接" readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} /></div><button type="button" aria-label="复制导入链接" onClick={() => void copyShareLink(shareUrl)}><Copy /></button><a href={shareUrl} target="_blank" rel="noreferrer" aria-label="在新窗口测试导入链接"><ExternalLink /></a></div>}{message && <p className="share-message">{message}</p>}<footer><button className="ghost-action" onClick={() => accepted && downloadFile(makeFile())} disabled={!accepted}><Download />保存分享文件</button><button className="ghost-action share-link-action" onClick={() => void createImportLink()} disabled={!accepted || creatingLink}><Link2 />{creatingLink ? "正在生成…" : shareUrl ? "复制导入链接" : "生成导入链接"}</button><button className="primary-action" onClick={() => void systemShare()} disabled={!accepted}><Share2 />系统分享</button></footer></section></div>;
}

function IncomingBankShareModal({ share, onImport, onClose }: {
  share: IncomingBankShare;
  onImport: () => void;
  onClose: () => void;
}) {
  const loading = share.status === "loading";
  const importing = share.status === "importing";
  const bank = share.bank;
  return <div className="modal-layer incoming-share-layer"><section className="incoming-share-modal"><header><div><span>QUESTION BANK INVITATION</span><h2>{loading ? "正在打开题库分享…" : share.status === "error" ? "分享链接暂时无法打开" : `收到“${bank?.name}”`}</h2></div><button onClick={onClose} disabled={importing}><X /></button></header>{loading ? <div className="incoming-share-loading"><RefreshCw className="spinning" /><p>正在安全读取题库信息，请稍候…</p></div> : share.status === "error" ? <div className="incoming-share-error"><AlertCircle /><div><strong>没有导入任何内容</strong><p>{share.error}</p></div></div> : bank && <><div className="incoming-share-summary"><Database /><div><strong>{bank.questions.length} 道题 · {bank.groupName || "未分组"}</strong><p>{bank.description || "分享者没有填写题库简介。导入后可在“我的题库”中补充。"}</p></div></div><div className="share-copyright-alert"><ShieldCheck /><div><strong>导入不代表获得转载或再分发授权</strong><p>请仅在分享者授权范围内学习和使用。导入后请抽查题干、选项与答案；不要传播含敏感信息或未经授权的内容。</p></div></div>{share.expiresAt && <p className="incoming-share-expiry">此链接有效期至 {new Date(share.expiresAt).toLocaleString("zh-CN")}。</p>}</>}<footer><button className="ghost-action" onClick={onClose} disabled={importing}>{share.status === "error" ? "关闭" : "暂不导入"}</button>{bank && <button className="primary-action" onClick={onImport} disabled={importing}><Import />{importing ? "正在导入…" : "确认并导入我的题库"}</button>}</footer></section></div>;
}

function QuizView(props: {
  current: QuizQuestion; currentIndex: number; total: number; selected: string[]; submitted: boolean; studyMode: StudyMode;
  examScore?: { earned: number; answeredMaximum: number; total: number };
  result?: "correct" | "wrong"; favorite: boolean; note: string; aiMode: AiMode;
  aiTexts: Partial<Record<AiMode, string>>; aiMessages: AiMessage[]; aiLoading: boolean; mobilePanel: boolean;
  nickname: string; account: AccountSession | null; comments: SharedComment[];
  onHome: () => void; onToggleOption: (label: string) => void; onSubmit: () => void;
  onPrevious: () => void; onNext: () => void; onFavorite: () => void; onAnswerSheet: () => void;
  onSettings: () => void; onNote: (value: string) => void; onAi: (mode: AiMode) => void;
  onFollowUp: (text: string) => void; onComment: (text: string) => void;
  onLikeComment: (commentId: string) => void; onReportComment: (commentId: string) => void;
  onDeleteComment: (commentId: string) => void; onRequireLogin: () => void; onMobilePanel: () => void;
  onEditQuestion: (question: QuizQuestion) => Promise<void>;
}) {
  const [editingQuestion, setEditingQuestion] = useState(false);
  const { current, currentIndex, total, selected, submitted, studyMode, result, favorite, note, aiMode, aiTexts, aiMessages, aiLoading, examScore } = props;
  const progress = Math.round(((currentIndex + 1) / total) * 100);
  const answerAvailable = current.answer.length > 0;
  const memorizing = studyMode === "memorize";
  const blind = studyMode === "blind";
  const modeSuffix = blind ? " · 盲刷" : memorizing ? " · 背题" : "";
  const questionKind = `${current.questionType ? `${current.questionType} 型题` : current.multiple ? "多选题" : "单选题"}${answerAvailable ? modeSuffix : " · 测试模式"}`;
  const chooseHint = memorizing
    ? answerAvailable ? "标准答案已直接展开；结合题干与原资料解析快速记忆" : "当前题库没有提供标准答案，暂时只能查看题干与选项"
    : blind
      ? answerAvailable ? "选择后不会立即判题；可继续下一题，想核对时再点“对答案”" : "答案尚未导入：选择会先保留，之后可导入答案统一核对"
      : answerAvailable ? current.multiple ? "本题有多个正确答案，请选择所有符合项" : "请选择一个最符合题意的答案" : "答案尚未导入：先按测试模式作答，之后可在“我的题库”导入答案并一键核对";
  return <div className="quiz-shell">
    <header className="quiz-header"><button className="icon-button" onClick={props.onHome} aria-label="返回首页"><ChevronLeft /></button><Brand compact /><div className="quiz-header-progress"><span>{current.category}{examScore ? ` · 首次得分 ${examScore.earned}/${examScore.total}` : ""}</span><div><i style={{ width: `${progress}%` }} /></div><b>{currentIndex + 1} / {total}</b></div><button className="icon-button" onClick={props.onSettings} aria-label="练习设置"><Settings2 /></button></header>
    <div className="quiz-workspace">
      <section className="question-pane">
        <div className="question-topline"><div><span className={`question-kind ${current.multiple ? "multi" : ""}`}>{questionKind}</span><span>原题号 {current.sourceNumber}{current.points ? ` · ${current.points} 分` : ""}</span>{(current.questionType === "B" || current.questionType === "C") && <span>{current.questionType === "C" ? "两陈述判定" : "共用备选项"}{current.sharedOptionGroup ? ` · ${current.sharedOptionGroup}` : ""}</span>}</div><div className="question-top-actions"><button className="question-edit-trigger" onClick={() => setEditingQuestion(true)}><Pencil size={16} />纠错编辑</button><button className={favorite ? "favorite active" : "favorite"} onClick={props.onFavorite}><Star size={17} fill={favorite ? "currentColor" : "none"} />{favorite ? "已收藏" : "收藏"}</button></div></div>
        <article className="question-body"><h1>{current.stem}</h1><p className="choose-hint">{chooseHint}</p><div className="answer-options">{current.options.map((option) => {
          const picked = selected.includes(option.label);
          const isAnswer = submitted && current.answer.includes(option.label);
          const isWrong = submitted && picked && !current.answer.includes(option.label);
          return <button key={option.label} className={`answer-option ${picked ? "selected" : ""} ${isAnswer ? "correct" : ""} ${isWrong ? "wrong" : ""}`} onClick={() => props.onToggleOption(option.label)}><span>{option.label}</span><p>{option.text}</p>{isAnswer && <Check size={18} />}{isWrong && <X size={18} />}</button>;
        })}</div></article>
        {memorizing && answerAvailable && <div className="result-strip memorize-answer"><span><Eye /></span><div><strong>标准答案已展开</strong><p>题库答案：{current.answer.join("、")} · 背题模式不会计入对错记录</p></div><button onClick={() => props.onAi("summary")}><Sparkles size={16} />生成解析</button></div>}
        {!memorizing && submitted && answerAvailable && <div className={`result-strip ${result}`}><span>{result === "correct" ? <CheckCircle2 /> : <AlertCircle />}</span><div><strong>{result === "correct" ? "答对了，知识点已加深" : "这道题值得加入复盘"}</strong><p>你的答案：{selected.join("、")} · 题库答案：{current.answer.join("、")}</p></div><button onClick={() => props.onAi("summary")}><Sparkles size={16} />生成解析</button></div>}
        {submitted && !answerAvailable && <div className="result-strip pending-answer"><span><Clock3 /></span><div><strong>{memorizing ? "本题暂无标准答案" : "本题选择已锁定，等待答案"}</strong><p>{memorizing ? "导入答案后再使用背题模式，即可直接查看。" : `你的选择：${selected.join("、")} · 导入答案后会自动核对`}</p></div></div>}
        {submitted && current.explanation && <section className="source-explanation"><header><span><FileText size={17} /></span><div><strong>原资料解析</strong><small>随导入资料提取 · 可能存在版本时效差异</small></div></header><MarkdownNotePreview value={current.explanation} /><footer>解析来源：{current.answerSource || "导入文件中的答案或解析部分"}</footer></section>}
        {!memorizing && !submitted && <div className={`mobile-submit-bar ${blind ? "blind" : ""}`}><button onClick={props.onSubmit} disabled={!selected.length}>{blind ? <Eye size={18} /> : <CheckCircle2 size={18} />}{blind && answerAvailable ? "对答案" : answerAvailable ? "确认答案" : "锁定作答"}</button><small>{selected.length ? `已选择 ${selected.join("、")}` : blind ? "可先选答案并继续做题" : "选择答案后再确认"}</small></div>}
        <div className={`quiz-actions ${blind && !submitted ? "blind-actions" : ""}`}>{blind && !submitted ? <button className="blind-check-action" onClick={props.onSubmit} disabled={!selected.length}><Eye size={17} />{answerAvailable ? "对答案" : "锁定作答"}</button> : <button className="subtle-button" onClick={props.onPrevious}><ChevronLeft size={17} />上一题</button>}{submitted || memorizing || blind ? <button className="primary-action" onClick={props.onNext}>下一题<ChevronRight size={17} /></button> : <button className="primary-action" onClick={props.onSubmit} disabled={!selected.length}>{answerAvailable ? "提交答案" : "锁定作答"}<ArrowRight size={17} /></button>}</div>
      </section>
      <LearningPanel current={current} submitted={submitted && answerAvailable} note={note} aiMode={aiMode} aiTexts={aiTexts} aiMessages={aiMessages} aiLoading={aiLoading} nickname={props.nickname} account={props.account} comments={props.comments} onNote={props.onNote} onAi={props.onAi} onFollowUp={props.onFollowUp} onComment={props.onComment} onLikeComment={props.onLikeComment} onReportComment={props.onReportComment} onDeleteComment={props.onDeleteComment} onRequireLogin={props.onRequireLogin} />
    </div>
    <nav className="quiz-bottom"><button onClick={props.onPrevious}><ChevronLeft /><span>上一题</span></button><button onClick={props.onAnswerSheet}><ListChecks /><span>答题卡</span></button><button className={favorite ? "active" : ""} onClick={props.onFavorite}><Star fill={favorite ? "currentColor" : "none"} /><span>收藏</span></button><button onClick={props.onMobilePanel}><MessageCircle /><span>学习区</span></button><button onClick={props.onSettings}><Settings2 /><span>设置</span></button><button className="mobile-next" onClick={props.onNext}><ChevronRight /><span>下一题</span></button></nav>
      {props.mobilePanel && <div className="mobile-learning"><button className="drawer-close" aria-label="关闭学习区" onClick={props.onMobilePanel}><X /></button><LearningPanel current={current} submitted={submitted && answerAvailable} note={note} aiMode={aiMode} aiTexts={aiTexts} aiMessages={aiMessages} aiLoading={aiLoading} nickname={props.nickname} account={props.account} comments={props.comments} onNote={props.onNote} onAi={props.onAi} onFollowUp={props.onFollowUp} onComment={props.onComment} onLikeComment={props.onLikeComment} onReportComment={props.onReportComment} onDeleteComment={props.onDeleteComment} onRequireLogin={props.onRequireLogin} /></div>}
      {editingQuestion && <QuestionCorrectionModal question={current} onSave={props.onEditQuestion} onClose={() => setEditingQuestion(false)} />}
  </div>;
}

function QuestionCorrectionModal({ question, onSave, onClose }: {
  question: QuizQuestion;
  onSave: (question: QuizQuestion) => Promise<void>;
  onClose: () => void;
}) {
  const [stem, setStem] = useState(question.stem);
  const [options, setOptions] = useState(question.options.map((option) => ({ ...option })));
  const [answer, setAnswer] = useState([...question.answer]);
  const [allowMultiple, setAllowMultiple] = useState(question.questionType === "X" || question.multiple);
  const [answerVisible, setAnswerVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fixedExamType = Boolean(question.questionType);
  const normalizedOriginalAnswer = [...question.answer].sort().join("");
  const answerChanged = [...answer].sort().join("") !== normalizedOriginalAnswer
    || allowMultiple !== (question.questionType === "X" || question.multiple);
  const valid = Boolean(
    stem.trim()
    && options.length >= 2
    && options.every((option) => option.text.trim())
    && (answer.length || (!question.answer.length && !answerVisible))
    && answer.every((label) => options.some((option) => option.label === label)),
  );

  const toggleAnswer = (label: string) => {
    if (allowMultiple) {
      setAnswer((current) => current.includes(label) ? current.filter((item) => item !== label) : [...current, label]);
    } else {
      setAnswer([label]);
    }
  };

  const changeAnswerMode = (multiple: boolean) => {
    if (fixedExamType) return;
    setAllowMultiple(multiple);
    if (!multiple) setAnswer((current) => current.slice(0, 1));
  };

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      await onSave({
        ...question,
        stem: stem.trim(),
        options: options.map((option) => ({ ...option, text: option.text.trim() })),
        answer: [...answer].sort(),
        answerPending: answer.length === 0,
        multiple: allowMultiple || answer.length > 1,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "暂时无法保存修订，请稍后重试");
      setBusy(false);
    }
  };

  return <div className="modal-layer question-edit-layer" onMouseDown={() => !busy && onClose()}>
    <section className="question-edit-modal" role="dialog" aria-modal="true" aria-labelledby="question-edit-title" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span>QUESTION CORRECTION</span><h2 id="question-edit-title">修订题目与标准答案</h2><p>发现识别错字时可直接修正；保存后，题库同步与分享文件都会采用新版本。</p></div><button onClick={onClose} disabled={busy} aria-label="关闭纠错编辑"><X /></button></header>
      <div className="question-edit-scroll">
        <label className="question-edit-field"><span>题干</span><textarea value={stem} rows={4} onChange={(event) => setStem(event.target.value)} /></label>
        <section className="option-edit-section"><div><strong>选项文字</strong><span>选项编号保持不变，避免影响已有作答记录</span></div>{options.map((option, index) => <label key={option.label}><b>{option.label}</b><textarea rows={2} value={option.text} onChange={(event) => setOptions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item))} /></label>)}</section>
        <section className={`answer-edit-section ${answerVisible ? "revealed" : "concealed"}`}><header><div><strong>标准答案</strong><span>{answerVisible ? allowMultiple ? "可选择多个正确选项" : "仅选择一个正确选项" : "默认隐藏，避免只改文字时提前看到答案"}</span></div>{answerVisible && !fixedExamType && <div className="answer-type-switch"><button className={!allowMultiple ? "active" : ""} onClick={() => changeAnswerMode(false)}>单选</button><button className={allowMultiple ? "active" : ""} onClick={() => changeAnswerMode(true)}>多选</button></div>}</header>{answerVisible ? <div className="answer-edit-choices">{options.map((option) => <button key={option.label} className={answer.includes(option.label) ? "active" : ""} onClick={() => toggleAnswer(option.label)} aria-pressed={answer.includes(option.label)}><i>{answer.includes(option.label) && <Check size={15} />}</i><b>{option.label}</b><span>{option.text}</span></button>)}</div> : <div className="answer-edit-mask"><div className="answer-blur-preview" aria-hidden="true">{options.slice(0, 4).map((option) => <span key={option.label}><i /><b>{option.label}</b><em>{option.text}</em></span>)}</div><div className="answer-reveal-panel"><EyeOff /><div><strong>标准答案已模糊保护</strong><p>只修题干或选项时无需查看答案；确认需要纠正答案后再主动展开。</p></div><button onClick={() => setAnswerVisible(true)}><Eye size={17} />显示并修订答案</button></div></div>}</section>
        {answerChanged && <div className="answer-revision-warning"><AlertCircle /><div><strong>改标准答案前，请再核对一次 ⚠️🩺</strong><p>原文件答案可能受教材版本、指南更新或识别误差影响；但手动修订也可能出错。请对照教材、官方答案或可靠解析再次核验后再保存哦 🔎✅</p></div></div>}
        <div className="question-edit-impact"><ShieldCheck /><p>保存后，当前题库、多端同步和后续分享均使用修订版；已有首次评分记录会保留，当前掌握状态会按新答案重新核对。</p></div>
        {error && <p className="question-edit-error"><AlertCircle size={17} />{error}</p>}
      </div>
      <footer><button className="ghost-action" onClick={onClose} disabled={busy}>取消</button><button className="primary-action" onClick={() => void save()} disabled={!valid || busy}><CheckCircle2 />{busy ? "正在保存…" : "保存修订"}</button></footer>
    </section>
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
  const [tagDraft, setTagDraft] = useState("");
  const [notePreview, setNotePreview] = useState(false);
  const [noteMessage, setNoteMessage] = useState("");
  const modes: Array<{ id: AiMode; label: string; icon: React.ReactNode }> = [
    { id: "summary", label: "大神总结", icon: <BrainCircuit size={16} /> },
    { id: "pitfall", label: "易错提示", icon: <Lightbulb size={16} /> },
    { id: "companion", label: "知微", icon: <Bot size={16} /> },
  ];
  const sendFollowUp = () => { if (!followUp.trim()) return; onFollowUp(followUp); setFollowUp(""); };
  const sendComment = () => { if (!comment.trim()) return; onComment(comment); setComment(""); };
  const activeModeLabel = modes.find((mode) => mode.id === aiMode)?.label ?? "AI 整理";
  const latestAssistant = [...aiMessages].reverse().find((message) => message.role === "assistant")?.text;
  const writableAiText = aiTexts[aiMode] || (aiMode === "companion" ? latestAssistant : undefined);
  const writeAiNote = () => {
    if (!writableAiText) return;
    const next = appendAiToNote(note, current, activeModeLabel, writableAiText);
    onNote(next);
    setNoteMessage(next === note ? "这段内容已经在笔记里了" : "AI 内容已写入 Markdown 笔记 ✨");
    window.setTimeout(() => setNoteMessage(""), 1_600);
  };
  const addTag = () => {
    const next = appendTagToNote(note, tagDraft, current);
    if (next !== note) onNote(next);
    setTagDraft("");
  };
  return <aside className="learning-panel"><div className="learning-heading"><div><span>AI 学习讨论区</span><h2>把这道题真正弄懂</h2></div><span className="beta">BETA</span></div><div className="learning-tabs">{modes.map((mode) => <button key={mode.id} className={aiMode === mode.id ? "active" : ""} onClick={() => onAi(mode.id)}>{mode.icon}{mode.label}</button>)}</div>
    <div className="discussion-card"><div className="comment-author"><span className={`comment-avatar ${aiMode}`}><Sparkles size={16} /></span><div><strong>{activeModeLabel}</strong><small>AI 学习助理 · 针对当前题目</small></div></div>{!submitted ? <div className="discussion-placeholder"><CircleHelp size={24} /><p>提交答案后开放讨论，避免提前泄露答案。</p></div> : <>{aiTexts[aiMode] && <p className="ai-copy">{aiTexts[aiMode]}</p>}{aiMode === "companion" && aiMessages.length > 0 && <div className="chat-thread">{aiMessages.map((message, index) => <p key={`${message.role}-${index}`} className={message.role}>{message.text}</p>)}</div>}{writableAiText && <button className="write-note-button" onClick={writeAiNote}><NotebookPen size={15} />写入我的笔记</button>}{aiLoading ? <div className="thinking"><i /><i /><i /><span>正在组织更易懂的解释</span></div> : !aiTexts[aiMode] && !(aiMode === "companion" && aiMessages.length) && <><p className="discussion-intro">{aiMode === "summary" ? `围绕题库答案 ${current.answer.join("、")} 提炼核心考点，并解释其他选项。` : aiMode === "pitfall" ? "识别题干里的否定词、相似概念和最容易混淆的选项。" : "没听懂也没关系，我会换一种方式继续讲，直到你能复述。"}</p><button className="generate-button" onClick={() => onAi(aiMode)}><Sparkles size={16} />生成这一条</button></>}{aiMode === "companion" && <div className="followup-form"><input value={followUp} onChange={(event) => setFollowUp(event.target.value)} onKeyDown={(event) => event.key === "Enter" && sendFollowUp()} placeholder="继续追问，例如：能换个例子吗？" /><button onClick={sendFollowUp} disabled={!followUp.trim() || aiLoading} aria-label="发送追问"><Send size={15} /></button></div>}</>}<div className="comment-actions"><button><ThumbsUp size={15} />有帮助</button><span>内容仅用于学习辅助</span></div></div>
    <div className="note-card"><div className="note-card-heading"><NotebookPen size={17} /><strong>我的笔记</strong><span>{account ? "自动参与多端同步" : "当前保存在本机"}</span></div><div className="note-source-line"><FileText size={13} />来源：{noteSource(current)}</div><div className="note-mode-tabs"><button className={!notePreview ? "active" : ""} onClick={() => setNotePreview(false)}>Markdown 编辑</button><button className={notePreview ? "active" : ""} onClick={() => setNotePreview(true)}>预览</button></div>{notePreview ? <MarkdownNotePreview value={note} /> : <textarea value={note} onChange={(event) => onNote(event.target.value)} placeholder={"# 题目笔记\n\n- 判断依据\n- 易错提醒\n\n> 标签：#待复盘"} />}{parseNoteTags(note).length > 0 && <div className="note-tag-list">{parseNoteTags(note).map((tag) => <span key={tag}>#{tag}</span>)}</div>}<div className="note-tag-entry"><input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addTag()} placeholder="添加标签，如：心血管" /><button onClick={addTag} disabled={!tagDraft.trim()}>添加</button></div><div className="note-save-state"><span>{noteMessage}</span><small><Send size={14} />已自动保存</small></div></div>
    <div className="community-card"><div className="community-title"><MessageCircle size={17} /><strong>同学讨论</strong><span>云端共享 · 有审核</span></div>{account ? <div className="comment-identity"><ShieldCheck size={15} /><span>{nickname} · 已保护身份</span></div> : <button className="comment-login" onClick={onRequireLogin}><UserRound size={16} />登录后参与讨论</button>}<div className="comment-form"><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="写下你的判断方法或易错提醒…" /><button onClick={sendComment} disabled={!comment.trim()}><Send size={15} />发布</button></div>{comments.length ? <div className="local-comments">{comments.slice(0, 20).map((item) => <article key={item.id}><div><b>{item.nickname}</b><time>{item.status === "pending" ? "审核中" : new Date(item.createdAt).toLocaleDateString("zh-CN")}</time></div><p>{item.text}</p><div className="comment-tools"><button onClick={() => onLikeComment(item.id)}><ThumbsUp size={13} />{item.likes || "赞"}</button>{item.own ? <button onClick={() => onDeleteComment(item.id)}><Trash2 size={13} />删除</button> : <button onClick={() => onReportComment(item.id)}><Flag size={13} />举报</button>}</div></article>)}</div> : <p className="empty-comments">还没有公开讨论，成为第一个留下学习线索的人。</p>}</div>
  </aside>;
}

function SettingsModal({ settings, counts, typeCounts, onChange, onClose, onStart }: { settings: Settings; counts: Record<Scope, number>; typeCounts: { single: number; multiple: number; all: number }; onChange: (settings: Settings) => void; onClose: () => void; onStart: () => void }) {
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => onChange({ ...settings, [key]: value });
  return <div className="modal-layer" onMouseDown={onClose}><section className="settings-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><span>开始之前</span><h2>设置你的练习方式</h2></div><button onClick={onClose}><X /></button></header><div className="setting-section study-mode-section"><label>刷题模式</label><div className="study-mode-grid"><button className={settings.studyMode === "standard" ? "active" : ""} onClick={() => update("studyMode", "standard")}><Target size={19} /><strong>标准练习</strong><span>提交后立即判题并记录对错</span></button><button className={settings.studyMode === "blind" ? "active" : ""} onClick={() => update("studyMode", "blind")}><EyeOff size={19} /><strong>盲刷</strong><span>先连续作答，需要时再对答案</span></button><button className={settings.studyMode === "memorize" ? "active" : ""} onClick={() => update("studyMode", "memorize")}><Eye size={19} /><strong>背题</strong><span>进入后直接展开标准答案</span></button></div>{settings.studyMode !== "standard" && <p className="study-mode-note">{settings.studyMode === "blind" ? "盲刷会保留每题选择，但在点击“对答案”前不判分、不显示正误。" : "背题只用于快速记忆，不会把浏览行为计入做题数、正确率或首次得分。"}</p>}</div><div className="setting-section"><label>题目范围</label><div className="choice-grid">{([
    ["all", "全部题目", Library], ["unanswered", "未练题目", Zap], ["wrong", "错题复盘", RotateCcw], ["favorite", "收藏题目", Star],
  ] as Array<[Scope, string, typeof Library]>).map(([value, label, Icon]) => <button key={value} className={settings.scope === value ? "active" : ""} onClick={() => update("scope", value)}><Icon size={18} /><span>{label}</span><em>{counts[value]}</em></button>)}</div></div><div className="setting-section"><label>题型范围</label><div className="segmented type-segmented"><button className={settings.questionTypes === "single" ? "active" : ""} onClick={() => update("questionTypes", "single")}><CheckCircle2 size={17} /><span>仅做单选</span><em>{typeCounts.single} 道</em></button><button className={settings.questionTypes === "all" ? "active" : ""} onClick={() => update("questionTypes", "all")}><ListChecks size={17} /><span>单选＋多选</span><em>{typeCounts.single}＋{typeCounts.multiple} 道</em></button></div></div><div className="setting-section"><label>题目顺序</label><div className="segmented"><button className={settings.questionOrder === "sequential" ? "active" : ""} onClick={() => update("questionOrder", "sequential")}><BookOpen size={17} />顺序练习</button><button className={settings.questionOrder === "random" ? "active" : ""} onClick={() => update("questionOrder", "random")}><Shuffle size={17} />随机练习</button></div></div><div className="setting-section"><label>界面主题</label><div className="segmented theme-segmented"><button className={settings.themeMode === "system" ? "active" : ""} onClick={() => onChange({ ...settings, themeMode: "system", darkMode: false })}><Settings2 size={17} />跟随设备</button><button className={settings.themeMode === "light" ? "active" : ""} onClick={() => onChange({ ...settings, themeMode: "light", darkMode: false })}><Sun size={17} />日间</button><button className={settings.themeMode === "dark" ? "active" : ""} onClick={() => onChange({ ...settings, themeMode: "dark", darkMode: true })}><Moon size={17} />夜间</button></div></div><div className="switch-list"><SwitchRow label="选项随机" detail="减少位置记忆干扰" value={settings.shuffleOptions} onChange={(value) => update("shuffleOptions", value)} /><SwitchRow label="答对自动下一题" detail="答对后 0.7 秒进入下一题；答错时停留复盘" value={settings.autoNext} onChange={(value) => update("autoNext", value)} /><SwitchRow label="返回上一题时显示答案" detail="回看已作答题目时，直接恢复判题结果与答案" value={settings.showAnswerOnReturn} onChange={(value) => update("showAnswerOnReturn", value)} /><SwitchRow label="错题自动收藏" detail="自动进入复盘清单" value={settings.autoFavoriteWrong} onChange={(value) => update("autoFavoriteWrong", value)} /></div><button className="start-button" onClick={onStart} disabled={!counts[settings.scope]}><Play size={17} fill="currentColor" />{counts[settings.scope] ? "开始练习" : "当前筛选没有题目"} <span>{counts[settings.scope]} 道</span></button></section></div>;
}

function SwitchRow({ label, detail, value, onChange }: { label: string; detail: string; value: boolean; onChange: (value: boolean) => void }) {
  return <button className="switch-row" onClick={() => onChange(!value)}><div><strong>{label}</strong><span>{detail}</span></div><i className={value ? "on" : ""}><b /></i></button>;
}

function AnswerSheet({ questions, progress, answerSelections, currentIndex, onJump, onClose }: { questions: QuizQuestion[]; progress: Progress; answerSelections: Record<string, string[]>; currentIndex: number; onJump: (index: number) => void; onClose: () => void }) {
  return <div className="modal-layer answer-layer" onMouseDown={onClose}><section className="answer-sheet" onMouseDown={(event) => event.stopPropagation()}><header><div><span>练习进度</span><h2>答题卡</h2></div><button onClick={onClose}><X /></button></header><div className="answer-legend"><span><i className="done" />已答</span><span><i className="wrong" />错题</span><span><i className="current" />当前</span><span><i />未答</span></div><div className="number-grid">{questions.map((question, index) => <button key={`${question.id}-${index}`} className={`${progress[question.id] ?? (answerSelections[question.id]?.length ? "done" : "")} ${index === currentIndex ? "current" : ""}`} onClick={() => onJump(index)}>{index + 1}</button>)}</div></section></div>;
}

function ImportModal({ state, busy, error, dragActive, reports, fileRef, onClose, onFiles, onCancel, onDrag, on306 }: { state: ImportUpdate; busy: boolean; error: string; dragActive: boolean; reports: ImportReport[]; fileRef: React.RefObject<HTMLInputElement | null>; onClose: () => void; onFiles: (files: File[]) => void; onCancel: () => void; onDrag: (value: boolean) => void; on306: () => void }) {
  const importStage = state.progress >= 90 ? 4 : state.progress >= 58 ? 3 : state.progress > 0 ? 2 : 1;
  const stages = ["文件准备", "本地提取", "结构识别", "审校保存"];
  return <div className="modal-layer" onMouseDown={() => !busy && onClose()}><section className="import-modal spatial-import-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><span>IMPORT WORKBENCH · 文件默认在本机处理</span><h2>把资料整理成可练习的题库</h2><p>一次导入多份文件；系统会先提取文字，再识别题型、答案与章节结构。</p></div><button onClick={onClose} disabled={busy} aria-label="关闭导入工作台"><X /></button></header>
    <ol className="import-stage-strip" aria-label="导入流程">{stages.map((label, index) => { const number = index + 1; return <li className={number < importStage ? "done" : number === importStage ? "active" : ""} key={label}><i>{number < importStage ? <Check size={14} /> : number}</i><span>{label}</span></li>; })}</ol>
    <div className="import-workbench-grid">
      <div className={`drop-zone ${dragActive ? "drag" : ""}`} onDragOver={(event) => { event.preventDefault(); onDrag(true); }} onDragLeave={() => onDrag(false)} onDrop={(event) => { event.preventDefault(); onDrag(false); const files = Array.from(event.dataTransfer.files); if (files.length) onFiles(files); }}><span className="upload-art"><Upload /></span><strong>拖入一个或多个文件</strong><p>支持旧版 .doc、.docx、文字/扫描 PDF 与红豆题库 .json</p><button onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? "正在逐个处理…" : "选择多个文件"}</button><input ref={fileRef} type="file" multiple accept=".doc,.docx,.pdf,.json,application/msword,application/json" hidden onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) onFiles(files); event.currentTarget.value = ""; }} /></div>
      <aside className="import-capability-panel"><span className="overline">SPECIALIZED FLOW</span><button type="button" className="western306-entry" onClick={on306} disabled={busy}><Target /><span><strong>西综 306 标准化工作台</strong><small>165 题新卷、含 C 型题旧卷、答案配套与缺题检查</small></span><ArrowRight /></button><div className="format-row"><div><FileText /><span><b>Word / 分享文件</b><small>题干末尾答案、章节答案表与历年回忆题</small></span></div><div><ScanText /><span><b>PDF + OCR</b><small>单选、多选与判断；自动跳过填空和问答</small></span></div></div></aside>
    </div>
    {(busy || state.progress > 0) && <div className="import-progress"><div><span>{state.phase}</span><b>{state.progress}%</b></div><i><b style={{ width: `${state.progress}%` }} /></i><p>{state.detail}</p>{busy && <button type="button" className="import-cancel" onClick={onCancel}><X />取消当前导入</button>}</div>}{reports.length > 0 && <div className="import-report-list">{reports.map((report) => <div className={report.status} key={report.id}>{report.status === "success" ? <CheckCircle2 /> : report.status === "failed" ? <AlertCircle /> : report.status === "cancelled" ? <X /> : report.status === "ai-ready" ? <BrainCircuit /> : <Clock3 />}<span><strong>{report.name}</strong><small>{report.detail}</small></span></div>)}</div>}{error && <div className="import-error"><AlertCircle />{error}</div>}<p className="privacy-note">.docx 与 PDF 默认在浏览器本地处理；由于旧版 .doc 是二进制格式，选择后会临时发送到你部署的本站服务器内存提取文字，不落盘、不保留原文件。普通识别失败时仍会先征求同意，再决定是否交给 AI 整理。</p></section></div>;
}

function Western306Workbench({ onClose, onSave }: {
  onClose: () => void;
  onSave: (name: string, questions: QuizQuestion[], report: Western306ImportReport) => Promise<void>;
}) {
  const sourceRef = useRef<HTMLInputElement>(null);
  const answerRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [answerFile, setAnswerFile] = useState<File | null>(null);
  const [state, setState] = useState<ImportUpdate>({ phase: "等待原卷", progress: 0, detail: "建议优先使用 OCR 后的 DOCX；扫描 PDF 会在本机先做 OCR" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [report, setReport] = useState<Western306ImportReport | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function standardize() {
    if (!sourceFile || busy) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    setError("");
    setQuestions([]);
    setReport(null);
    try {
      const source = await extractQuestionFileText(sourceFile, (update) => setState({ ...update, detail: `原卷 · ${update.detail}` }), controller.signal);
      let answerText = "";
      if (answerFile) {
        const answer = await extractQuestionFileText(answerFile, (update) => setState({ ...update, detail: `答案 · ${update.detail}` }), controller.signal);
        answerText = answer.text;
      }
      setState({ phase: "本地结构校验", progress: 68, detail: "正在检查原题号、选项与题后明确答案；标准卷无需重复交给 AI" });
      const locallyParsed = parseQuestionText(
        source.text.replace(/^\[\[PAGE\s+\d+\]\]\s*$/gim, ""),
        sourceFile.name.replace(/\.(doc|docx|pdf)$/i, ""),
      );
      const localStandardization = standardizeParsedWestern306Questions(sourceFile.name, source.text, locallyParsed);
      if (localStandardization.usable && !answerFile) {
        setQuestions(localStandardization.questions);
        setReport(localStandardization.report);
        setState({
          phase: "标准化完成",
          progress: 100,
          detail: `本地确定性识别 ${localStandardization.questions.length}${localStandardization.report.expectedQuestionCount ? ` / ${localStandardization.report.expectedQuestionCount}` : ""} 题 · 已有答案 ${localStandardization.report.answeredCount} 题`,
        });
        return;
      }
      setState({ phase: "AI 分区与校对", progress: 76, detail: "正在按年份、A/B/C/X 分区和原题号逐段整理；不会凭医学知识猜答案" });
      const response = await fetch("/api/import-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          fileName: sourceFile.name,
          text: source.text.slice(0, 480_000),
          answerText: answerText.slice(0, 240_000),
          personalAi: readPersonalAiConfig() ?? undefined,
        }),
      });
      const result = await readImportApiPayload<{ questions?: QuizQuestion[]; report?: Western306ImportReport; error?: string }>(response);
      if (!response.ok || !result.questions?.length || !result.report) throw new Error(result.error || "没有生成可保存的 306 标准题库");
      setQuestions(result.questions);
      setReport(result.report);
      setState({
        phase: "标准化完成",
        progress: 100,
        detail: `识别 ${result.questions.length}${result.report.expectedQuestionCount ? ` / ${result.report.expectedQuestionCount}` : ""} 题 · 已有答案 ${result.report.answeredCount ?? 0} 题`,
      });
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") setError("本次标准化已取消，未保存半成品。");
      else setError(caught instanceof Error ? caught.message : "306 标准化失败，请检查文件后重试。");
    } finally {
      controllerRef.current = null;
      setBusy(false);
    }
  }

  function exportStandardFile() {
    if (!questions.length || !report) return;
    const payload = {
      format: "avecove-western-306",
      version: 1,
      generatedAt: new Date().toISOString(),
      source: sourceFile?.name,
      report,
      bank: {
        name: sourceFile?.name.replace(/\.(doc|docx|pdf)$/i, "") || "西医综合 306",
        description: `西医综合 306 标准化题库；识别 ${questions.length}${report.expectedQuestionCount ? `/${report.expectedQuestionCount}` : ""} 题。`,
        questions,
      },
    };
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    link.download = `${sourceFile?.name.replace(/\.(doc|docx|pdf)$/i, "") || "western-306"}-standard.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const counts = report?.typeCounts ?? {};
  const missing = report?.missingSourceNumbers ?? [];
  return <div className="modal-layer western306-layer" onMouseDown={() => !busy && onClose()}><section className="western306-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><span>WESTERN MEDICINE 306 · STANDARDIZER</span><h2>西综 306 标准化工作台</h2><p>识别现代 165 题 / 300 分结构，也兼容旧卷 A、B、C、X 型题。</p></div><button onClick={onClose} disabled={busy}><X /></button></header><div className="western306-file-grid"><button onClick={() => sourceRef.current?.click()} className={sourceFile ? "selected" : ""} disabled={busy}><FileText /><span><strong>{sourceFile?.name || "选择题目原卷（必选）"}</strong><small>PDF / DOCX / DOC；扫描 PDF 会先 OCR</small></span><input ref={sourceRef} hidden type="file" accept=".doc,.docx,.pdf,application/msword" onChange={(event) => { setSourceFile(event.target.files?.[0] ?? null); setQuestions([]); setReport(null); }} /></button><button onClick={() => answerRef.current?.click()} className={answerFile ? "selected" : ""} disabled={busy}><ListChecks /><span><strong>{answerFile?.name || "选择答案或解析（可选）"}</strong><small>空白卷可先测试；答案卷可一起做题号关联</small></span><input ref={answerRef} hidden type="file" accept=".doc,.docx,.pdf,application/msword" onChange={(event) => { setAnswerFile(event.target.files?.[0] ?? null); setQuestions([]); setReport(null); }} /></button></div><div className="western306-rules"><ShieldCheck /><div><strong>跨页接缝 + 双层校验</strong><p>优先在本地按题号、选项与原文答案确定性整理；只有不满足标准结构时才进入 AI 分区。AI 只做结构化，答案仍只能来自文件原文。</p></div></div>{(busy || state.progress > 0) && <div className="import-progress"><div><span>{state.phase}</span><b>{state.progress}%</b></div><i><b style={{ width: `${state.progress}%` }} /></i><p>{state.detail}</p>{busy && <button type="button" className="import-cancel" onClick={() => controllerRef.current?.abort()}><X />取消本次标准化</button>}</div>}{report && <div className="western306-report"><div className="western306-report-head"><span><strong>{report.examYear || "年份待核对"}</strong><small>{report.examFormat === "legacy-c-type" ? "旧卷 C 型结构" : "现代 165 题结构"}</small></span><span><strong>{questions.length}{report.expectedQuestionCount ? ` / ${report.expectedQuestionCount}` : ""}</strong><small>有效题目</small></span><span><strong>{report.totalPoints ? `${report.totalPoints} 分` : "依原卷"}</strong><small>总分规则</small></span></div><div className="western306-type-counts">{["A", "B", "C", "X"].map((type) => <span key={type}><b>{type}</b>{counts[type] ?? 0} 题</span>)}</div>{report.recognitionMode === "deterministic" && <p className="complete">题干、选项与题后答案已在本机一一核对，本次未调用 AI，也不会因网关超时中断。</p>}<p className={missing.length ? "warning" : "complete"}>{missing.length ? `原文件缺少 ${missing.length} 个完整原题号：${missing.slice(0, 30).join("、")}${missing.length > 30 ? "…" : ""}。系统不会凭空补题。` : "题号连续性检查通过，可以开始抽查题干与答案。"}</p>{report.oneToOneVerified && <p className="complete">原题与答案已完成一一对应校验；即使原卷少于标准题数 10 题以内，也会按普通模式保存。</p>}{(report.reconciledAnswerCount ?? 0) > 0 && <p className="complete">已从原卷明确答案中二次补回 {report.reconciledAnswerCount} 题。</p>}{(report.warnings?.length ?? 0) > 0 && <p className="warning">{report.warnings?.length} 个片段未完成，已保留其他有效题，建议补传缺题页。</p>}</div>}{error && <div className="import-error"><AlertCircle />{error}</div>}<footer><button className="ghost-action" onClick={questions.length ? exportStandardFile : onClose} disabled={busy}>{questions.length ? <><Download />导出标准 JSON</> : "取消"}</button>{questions.length && report ? <button className="primary-action" onClick={() => void onSave(sourceFile?.name.replace(/\.(doc|docx|pdf)$/i, "") || "西医综合 306", questions, report)}><CheckCircle2 />保存为我的题库</button> : <button className="primary-action" onClick={() => void standardize()} disabled={!sourceFile || busy}><Sparkles />{busy ? "正在标准化…" : "开始标准化"}</button>}</footer></section></div>;
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

function AnswerImportModal({ bank, onMerge, onClose }: {
  bank: SavedQuestionBank;
  onMerge: (bank: SavedQuestionBank, file: File, onUpdate: (update: ImportUpdate) => void) => Promise<{ matched: number; checkedDrafts: number; remaining: number }>;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<ImportUpdate>({ phase: "等待答案文件", progress: 0, detail: "支持 .doc、.docx、文字 PDF 与扫描 PDF" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const pendingCount = bank.questions.filter((question) => !question.answer.length).length;
  const draftCount = bank.questions.filter((question) => question.draftAnswer?.length).length;

  async function begin() {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await onMerge(bank, file, setState);
      setComplete(true);
      setState({
        phase: "答案关联完成",
        progress: 100,
        detail: `匹配 ${result.matched} 题${result.checkedDrafts ? ` · 自动核对 ${result.checkedDrafts} 份作答` : ""} · 仍待答案 ${result.remaining} 题`,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "答案文件关联失败，请检查文件后重试。");
    } finally {
      setBusy(false);
    }
  }

  return <div className="modal-layer answer-import-layer" onMouseDown={() => !busy && onClose()}><section className="answer-import-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><span>ANSWER PAIRING · TEST MODE</span><h2>{complete ? "答案已经合入题库" : "是否继续导入答案？"}</h2></div><button onClick={onClose} disabled={busy}><X /></button></header><div className="answer-import-summary"><ListChecks /><div><strong>{bank.name}</strong><p>共 {bank.questions.length} 题 · 待答案 {pendingCount} 题{draftCount ? ` · 已有 ${draftCount} 份测试作答待核对` : ""}</p></div></div><div className="answer-import-note"><ShieldCheck /><p>答案文件只用于按原题号匹配答案与原文解析。AI 不得凭医学常识补答案；匹配后仍建议抽查 A/B/C/X 分区、B 型共用选项与 C 型两陈述判定。</p></div>{!complete && <button className={`answer-file-picker ${file ? "selected" : ""}`} onClick={() => inputRef.current?.click()} disabled={busy}><Upload /><span><strong>{file?.name || "选择配套答案或解析文件"}</strong><small>{file ? `${Math.max(1, Math.round(file.size / 1024))} KB · 点击可更换` : "支持 Word / PDF；扫描件会先 OCR"}</small></span><input ref={inputRef} type="file" accept=".doc,.docx,.pdf,application/msword" hidden onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(""); }} /></button>}{(busy || state.progress > 0) && <div className="import-progress answer-import-progress"><div><span>{state.phase}</span><b>{state.progress}%</b></div><i><b style={{ width: `${state.progress}%` }} /></i><p>{state.detail}</p></div>}{error && <div className="import-error"><AlertCircle />{error}</div>}<footer><button className="ghost-action" onClick={onClose} disabled={busy}>{complete ? "完成并关闭" : "稍后再导入"}</button>{!complete && <button className="primary-action" onClick={() => void begin()} disabled={!file || busy}><Sparkles />{busy ? "正在关联答案…" : "AI 关联并一键对答案"}</button>}</footer></section></div>;
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

  return <div className="modal-layer account-layer" onMouseDown={onClose}><section className="account-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><span>轻量身份 · 多端同步</span><h2>{account ? "管理同步身份" : "把学习进度稳稳接上"}</h2></div><button onClick={onClose} aria-label="关闭同步窗口"><X /></button></header>{account ? <div className="account-signed"><div className="account-badge"><span>{account.nickname.slice(0, 1)}</span><div><strong>{account.nickname}</strong><p>{account.email ?? "未绑定邮箱"}</p></div><ShieldCheck /></div><div className="sync-state"><Cloud /><div><strong>多端同步已开启</strong><p>{syncStatus}</p></div></div><div className="sync-coverage"><span><Database />已导入中文题库</span><span><BookOpen />英文 Test Library</span><span><CheckCircle2 />答题记录与写作草稿</span><span><NotebookPen />收藏、错题与笔记</span></div><p className="sync-privacy-copy">原始 Word、PDF 与图片不会上传；同步的是浏览器解析后的题库内容和学习记录。请只同步你有权使用的资料。</p><div className="record-actions"><button onClick={onSync}><RefreshCw />立即同步</button><button onClick={onExport}><Download />导出学习记录</button><button onClick={() => importRef.current?.click()}><Upload />导入学习记录</button><input ref={importRef} hidden type="file" accept="application/json,.json" onChange={(event) => event.target.files?.[0] && onImport(event.target.files[0])} /></div><div className="account-danger"><button onClick={onLogout}>退出当前设备</button><button onClick={onDelete}><Trash2 />注销云端身份</button></div></div> : <form className="account-form" onSubmit={login}><div className="privacy-banner"><span className="privacy-icon"><ShieldCheck /></span><div><strong>放心同步 <span aria-hidden="true">🔐☁️</span></strong><p>学号只生成不可逆的同步标识，服务器不保存原始学号。登录后可同步解析后的中英文题库与学习记录；原始文件仍只留在你的设备。</p><div className="privacy-tags"><span>🔒 不存原始学号</span><span>📚 同步题库与记录</span><span>📮 邮箱按需使用</span></div></div></div><label><span>学号 <em>同步主键</em></span><input value={studentId} onChange={(event) => setStudentId(event.target.value)} placeholder="首次使用请填写学号" autoComplete="username" /></label><label><span>昵称 <em>评论区显示</em></span><input value={nickname} onChange={(event) => setNickname(event.target.value.slice(0, 20))} placeholder="例如：红豆同学" /></label><label><span>邮箱 <em>可选 · 登录与身份保护</em></span><div className="code-field"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="绑定时需验证码" autoComplete="email" /><button type="button" onClick={sendCode} disabled={busy || !email.trim()}>发送验证码</button></div></label>{email && <label><span>邮箱验证码</span><input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="6 位验证码" /></label>}<p className="email-login-hint">已有绑定邮箱？学号留空，填写邮箱与验证码即可登录 📮</p>{message && <p className="account-message">{message}</p>}<button className="account-submit" disabled={busy || (!studentId.trim() && !email.trim())}><Cloud />{busy ? "正在连接…" : "开启安全同步"}</button></form>}</section></div>;
}

function SearchModal({ banks, onOpen, onClose }: { banks: SavedQuestionBank[]; onOpen: (bank: SavedQuestionBank, id: string) => Promise<void> | void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => query.trim() ? searchQuestionBanks(banks, query, 60) : [], [banks, query]);
  return <div className="modal-layer" onMouseDown={onClose}><section className="search-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><span>跨题库检索 · 按相关度排序</span><h2>搜索全部题库</h2></div><button onClick={onClose}><X /></button></header><label className="search-field"><Search size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="题库名、疾病、症状或知识点；多个词用空格分隔" /><kbd>{results.length}</kbd></label><div className="search-results">{query.trim() ? results.length ? results.map(({ bank, question, matchedFields, matchedOption }) => <button key={`${bank.id}-${question.id}`} onClick={() => void onOpen(bank, question.id)}><span>{question.multiple ? "多选" : "单选"}</span><div><strong><HighlightMatches text={question.stem} query={query} /></strong><small className="search-result-location"><Database size={13} />题库：<b><HighlightMatches text={bank.name} query={query} /></b> · {question.category} · 原题号 {question.sourceNumber}</small>{matchedOption && <p className="search-match-snippet">命中选项：<HighlightMatches text={matchedOption} query={query} /></p>}<em className="search-match-fields">命中 {matchedFields.join("、")}</em></div><ChevronRight size={17} /></button>) : <div className="search-empty"><CircleHelp /><p>没有找到同时匹配这些关键词的题目。可减少一个词，或改用疾病、症状及题库名称。</p></div> : <div className="search-empty search-guide"><Search /><p>输入关键词后，会同时检索所有题库，并优先显示题库名、分类和题干中的精准命中。</p></div>}</div></section></div>;
}

function NotesModal({ questions, notes, onOpen, onClose }: { questions: QuizQuestion[]; notes: Record<string, string>; onOpen: (id: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const allEntries = useMemo(() => questions.filter((question) => notes[question.id]?.trim()), [questions, notes]);
  const tags = useMemo(() => [...new Set(allEntries.flatMap((question) => parseNoteTags(notes[question.id] ?? "")))].sort(), [allEntries, notes]);
  const entries = useMemo(() => {
    const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return allEntries.filter((question) => {
      const markdown = notes[question.id] ?? "";
      if (activeTag && !parseNoteTags(markdown).includes(activeTag)) return false;
      const searchable = `${question.stem} ${parseNoteSource(markdown, question)} ${markdown}`.toLocaleLowerCase();
      return terms.every((term) => searchable.includes(term));
    });
  }, [activeTag, allEntries, notes, query]);
  return <div className="modal-layer" onMouseDown={onClose}><section className="search-modal notes-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><span>Markdown 知识库 · 个人复盘</span><h2>我的笔记</h2></div><button onClick={onClose}><X /></button></header><label className="search-field note-search-field"><Search size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索题目、来源、笔记正文或标签" /><kbd>{entries.length}</kbd></label>{tags.length > 0 && <div className="notes-tag-filter"><button className={!activeTag ? "active" : ""} onClick={() => setActiveTag("")}>全部</button>{tags.map((tag) => <button key={tag} className={activeTag === tag ? "active" : ""} onClick={() => setActiveTag(tag)}>#{tag}</button>)}</div>}<div className="notes-list">{entries.length ? entries.map((question) => { const markdown = notes[question.id] ?? ""; return <button key={question.id} onClick={() => onOpen(question.id)}><NotebookPen size={17} /><div><strong>{question.stem}</strong><small><FileText size={12} />{parseNoteSource(markdown, question)}</small>{parseNoteTags(markdown).length > 0 && <div className="notes-entry-tags">{parseNoteTags(markdown).map((tag) => <span key={tag}>#{tag}</span>)}</div>}<p>{markdownSummary(markdown)}</p></div><ChevronRight size={17} /></button>; }) : <div className="search-empty"><NotebookPen /><p>{allEntries.length ? "没有找到匹配的笔记，请更换关键词或标签。" : "还没有笔记。答题时写下判断依据，或把 AI 整理快速写入，会自动汇总到这里。"}</p></div>}</div></section></div>;
}

function SuccessToast({ message, onClose }: { message: string; onClose: () => void }) {
  const imported = message.startsWith("题库已就位");
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const timer = window.setTimeout(() => closeRef.current(), 1_000);
    return () => window.clearTimeout(timer);
  }, [message]);
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
        <footer><span>© 2026 红豆生南国 · 保留相关权利</span><span><a href="https://avecrouge.top/" target="_blank" rel="noreferrer">avecrouge.top · 作者博客</a> · AveCove Elapse v1.0.1</span></footer>
      </main>
    </div>
  );
}

function EmptySession({ onHome }: { onHome: () => void }) {
  return <div className="empty-session"><span><Check /></span><h1>这一组暂时没有题目</h1><p>可以调整练习范围，或者返回首页导入新的题库。</p><button className="primary-action" onClick={onHome}>返回首页</button></div>;
}
