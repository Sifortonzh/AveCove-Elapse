"use client";

import Image from "next/image";
import Link from "next/link";
import { type Dispatch, type PointerEvent as ReactPointerEvent, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, ArrowLeft, BookMarked, BookOpen, Bot, Check, ChevronLeft, ChevronRight,
  CirclePlay, Database, Eraser, FileSearch, FileText, Headphones,
  Highlighter, Import, Languages, LibraryBig, ListOrdered, MousePointer2, PanelLeftClose, PanelLeftOpen, PenLine, Play,
  Pencil, QrCode, RotateCcw, ScanSearch, Share2, ShieldCheck, Sparkles, Trash2, Undo2, Upload, X,
} from "lucide-react";
import {
  deleteEnglishTest, englishSectionLabel, extractEnglishSourceFile, extractEnglishTestFile, listEnglishTests,
  renameEnglishTest, replaceEnglishTestContent, sanitizeEnglishPassage, saveEnglishTest, type EnglishStage, type EnglishTestQuestion, type EnglishTestSection,
  type SavedEnglishTest,
} from "@/app/lib/english-test";
import { readPersonalAiConfig } from "@/app/lib/personal-ai";
import {
  clearEnglishPractice, hasEnglishPractice, readEnglishPractice, saveEnglishPractice,
  type ImportedResponse,
} from "@/app/lib/english-practice";

type Stage = EnglishStage;
type PracticeTask = "cloze" | "reading" | "matching" | "listening" | "translation" | "writing";
type EnglishTask = "overview" | "library" | PracticeTask;
type HighlightRange = { start: number; end: number };
type ReadingTool = "lookup" | "highlight" | "pen" | "marker" | "eraser";
type InkPoint = { x: number; y: number };
type InkStroke = { id: string; tool: "pen" | "marker"; points: InkPoint[] };
type VocabularyEntry = { word: string; meaning: string; context: string; source?: string; addedAt: string };
type PendingCompanionImport = {
  test: SavedEnglishTest;
  sourceFileName: string;
  sourceText: string;
  usedOcr: boolean;
};
type EnglishAiImportReport = {
  sections: number;
  totalQuestions: number;
  answeredQuestions: number;
  answerCoverage: number;
  warnings: string[];
};

const vocabularyStorageKey = "avecove-english-vocabulary-v1";

function looksLikeAnswerOrAnalysisFile(file: File) {
  return /答案|解析|详解|answer|analysis|solution|explanation|key/i.test(file.name);
}

async function requestEnglishAiImport(
  input: {
    sourceFileName: string;
    sourceText: string;
    answerFileName?: string;
    answerText?: string;
    usedOcr: boolean;
  },
  signal: AbortSignal,
) {
  const response = await fetch("/api/import-english-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ ...input, personalAi: readPersonalAiConfig() ?? undefined }),
  });
  const result = await response.json().catch(() => ({})) as {
    test?: Omit<SavedEnglishTest, "id" | "importedAt" | "updatedAt">;
    report?: EnglishAiImportReport;
    error?: string;
  };
  if (!response.ok || !result.test || !result.report) throw new Error(result.error || "AI did not return a usable English test.");
  return { test: result.test, report: result.report };
}

const stages: Array<{ id: Stage; label: string; detail: string; tasks: PracticeTask[] }> = [
  { id: "cet", label: "CET", detail: "CET-4 / CET-6", tasks: ["listening", "reading", "translation", "writing"] },
  { id: "postgraduate", label: "Postgraduate", detail: "National entrance exam", tasks: ["cloze", "reading", "matching", "translation", "writing"] },
  { id: "ielts", label: "IELTS", detail: "Academic training", tasks: ["reading", "listening", "writing"] },
  { id: "toefl", label: "TOEFL", detail: "Integrated practice", tasks: ["reading", "listening", "writing"] },
];

const taskMeta: Record<PracticeTask, { title: string; short: string; icon: typeof BookOpen }> = {
  cloze: { title: "Cloze Lab", short: "Context and vocabulary", icon: Languages },
  reading: { title: "Reading Studio", short: "Highlight while you read", icon: BookOpen },
  matching: { title: "Paragraph Matching", short: "Build the answer order", icon: ListOrdered },
  listening: { title: "Listening Room", short: "QR and audio resources", icon: Headphones },
  translation: { title: "Translation Desk", short: "Translate with precision", icon: Languages },
  writing: { title: "Writing Desk", short: "Draft, count and review", icon: PenLine },
};

const passage = `For years, researchers assumed that memory worked like a fixed archive. New evidence suggests a more active process: each time we recall an event, the brain briefly makes that memory flexible again. This flexibility allows useful details to be strengthened, but it also means that later information can subtly reshape what we remember. The finding does not make memory unreliable; instead, it shows why careful review and repeated retrieval are essential parts of durable learning.`;

const wordDictionary: Record<string, string> = {
  researchers: "研究人员", assumed: "曾认为；假定", memory: "记忆", fixed: "固定不变的",
  archive: "档案；档案库", evidence: "证据；研究依据", suggests: "表明；暗示", active: "主动的；活跃的",
  process: "过程；进程", recall: "回忆；提取记忆", event: "事件；经历", brain: "大脑",
  briefly: "短暂地", flexible: "可改变的；灵活的", flexibility: "灵活性；可塑性", useful: "有用的",
  details: "细节", strengthened: "被强化", information: "信息", subtly: "细微地；不易察觉地",
  reshape: "重塑；改变形态", remember: "记得；记住", finding: "研究发现", unreliable: "不可靠的",
  careful: "仔细的；审慎的", review: "复习；回顾", repeated: "反复的", retrieval: "提取；回忆",
  essential: "必不可少的", durable: "持久的；耐久的", learning: "学习",
};

function mergeHighlights(items: HighlightRange[]) {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  return sorted.reduce<HighlightRange[]>((result, item) => {
    const last = result.at(-1);
    if (!last || item.start > last.end) result.push({ ...item });
    else last.end = Math.max(last.end, item.end);
    return result;
  }, []);
}

function strokePath(points: InkPoint[]) {
  return points.map((point, index) => `${index ? "L" : "M"} ${Math.round(point.x * 1000)} ${Math.round(point.y * 1000)}`).join(" ");
}

function InteractivePassage({ content = passage, sourceTitle = "Memory is a living process" }: { content?: string; sourceTitle?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [highlights, setHighlights] = useState<HighlightRange[]>([]);
  const [tool, setTool] = useState<ReadingTool>("lookup");
  const [lookupWord, setLookupWord] = useState("");
  const [strokes, setStrokes] = useState<InkStroke[]>([]);
  const [vocabulary, setVocabulary] = useState<VocabularyEntry[]>([]);
  const [showVocabulary, setShowVocabulary] = useState(false);
  const drawingId = useRef<string | null>(null);
  const erasing = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(vocabularyStorageKey);
        if (stored) setVocabulary(JSON.parse(stored) as VocabularyEntry[]);
      } catch {
        window.localStorage.removeItem(vocabularyStorageKey);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const segments = useMemo(() => {
    const output: Array<{ text: string; highlighted: boolean }> = [];
    let cursor = 0;
    highlights.forEach((range) => {
      if (range.start > cursor) output.push({ text: content.slice(cursor, range.start), highlighted: false });
      output.push({ text: content.slice(range.start, range.end), highlighted: true });
      cursor = range.end;
    });
    if (cursor < content.length) output.push({ text: content.slice(cursor), highlighted: false });
    return output;
  }, [content, highlights]);

  function captureSelection() {
    if (tool !== "highlight") return;
    const selection = window.getSelection();
    const container = ref.current;
    if (!selection || selection.isCollapsed || !selection.rangeCount || !container) return;
    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;
    const before = range.cloneRange();
    before.selectNodeContents(container);
    before.setEnd(range.startContainer, range.startOffset);
    const start = before.toString().length;
    const end = start + range.toString().length;
    if (end > start) setHighlights((value) => mergeHighlights([...value, { start, end }]));
    selection.removeAllRanges();
  }

  function readPoint(event: ReactPointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      point: { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height },
      rect,
    };
  }

  function eraseAt(point: InkPoint, rect: DOMRect) {
    setStrokes((value) => {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        const hit = value[index].points.some((candidate) => Math.hypot((candidate.x - point.x) * rect.width, (candidate.y - point.y) * rect.height) < 22);
        if (hit) return value.filter((_, strokeIndex) => strokeIndex !== index);
      }
      return value;
    });
  }

  function beginInk(event: ReactPointerEvent<SVGSVGElement>) {
    // On iPad, a finger should keep scrolling the paper while Apple Pencil draws.
    // Safari exposes Pencil as pointerType="pen" and touch as pointerType="touch".
    if (event.pointerType === "touch") return;
    event.preventDefault();
    const { point, rect } = readPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === "eraser") {
      erasing.current = true;
      eraseAt(point, rect);
      return;
    }
    if (tool !== "pen" && tool !== "marker") return;
    const id = `${Date.now()}-${Math.random()}`;
    drawingId.current = id;
    setStrokes((value) => [...value, { id, tool, points: [point] }]);
  }

  function continueInk(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.pointerType === "touch") return;
    if (!drawingId.current && !erasing.current) return;
    event.preventDefault();
    const { point, rect } = readPoint(event);
    if (tool === "eraser" && erasing.current) {
      eraseAt(point, rect);
      return;
    }
    if (!drawingId.current) return;
    setStrokes((value) => value.map((stroke) => stroke.id === drawingId.current ? { ...stroke, points: [...stroke.points, point] } : stroke));
  }

  function endInk() {
    drawingId.current = null;
    erasing.current = false;
  }

  function renderWords(text: string, segmentIndex: number) {
    return text.split(/([A-Za-z]+(?:['’-][A-Za-z]+)?)/g).map((part, index) => /^[A-Za-z]/.test(part)
      ? <span className="lookup-word" role="button" tabIndex={tool === "lookup" ? 0 : -1} key={`${segmentIndex}-${index}`} onClick={() => tool === "lookup" && setLookupWord(part)} onKeyDown={(event) => { if (tool === "lookup" && (event.key === "Enter" || event.key === " ")) setLookupWord(part); }}>{part}</span>
      : <span key={`${segmentIndex}-${index}`}>{part}</span>);
  }

  function saveVocabulary(next: VocabularyEntry[]) {
    setVocabulary(next);
    window.localStorage.setItem(vocabularyStorageKey, JSON.stringify(next));
  }

  function addLookupWord() {
    if (!lookupWord) return;
    const word = lookupWord.toLocaleLowerCase();
    if (vocabulary.some((entry) => entry.word === word)) return;
    saveVocabulary([{ word, meaning: wordDictionary[word] ?? "待使用自定义 AI 补全释义", context: content, source: sourceTitle, addedAt: new Date().toISOString() }, ...vocabulary]);
  }

  function removeVocabulary(word: string) {
    saveVocabulary(vocabulary.filter((entry) => entry.word !== word));
  }

  const toolHint = tool === "lookup" ? "Click any English word for an instant meaning." : tool === "highlight" ? "Select a phrase to keep a reading highlight." : tool === "eraser" ? "Use Apple Pencil or a mouse to erase; one-finger touch still scrolls on iPad." : "Use Apple Pencil or a mouse to write. On iPad, one-finger touch scrolls the page without making marks.";
  const normalizedLookup = lookupWord.toLocaleLowerCase();
  const lookupSaved = vocabulary.some((entry) => entry.word === normalizedLookup);

  return <div className="english-passage-wrap">
    <div className="reading-toolbox" aria-label="Reading annotation tools">
      <button className={tool === "lookup" ? "active" : ""} onClick={() => setTool("lookup")}><Languages />Word lookup</button>
      <button className={tool === "highlight" ? "active" : ""} onClick={() => setTool("highlight")}><Highlighter />Highlight</button>
      <button className={tool === "pen" ? "active" : ""} onClick={() => setTool("pen")}><PenLine />Pen</button>
      <button className={tool === "marker" ? "active marker" : ""} onClick={() => setTool("marker")}><MousePointer2 />Marker</button>
      <button className={tool === "eraser" ? "active" : ""} onClick={() => setTool("eraser")}><Eraser />Eraser</button>
      <button className={showVocabulary ? "active" : ""} onClick={() => setShowVocabulary((value) => !value)}><BookMarked />Wordbook <b>{vocabulary.length}</b></button>
      <button aria-label="Undo last stroke" disabled={!strokes.length} onClick={() => setStrokes((value) => value.slice(0, -1))}><Undo2 /></button>
      <button aria-label="Clear annotations" disabled={!strokes.length && !highlights.length} onClick={() => { setStrokes([]); setHighlights([]); }}><RotateCcw /></button>
    </div>
    <div className="reading-tool-hint"><Sparkles size={14} /><span>{toolHint}</span></div>
    {lookupWord && <div className="word-lookup-card"><Languages /><div><small>CLICK-TO-TRANSLATE</small><strong>{lookupWord}</strong><p>{wordDictionary[normalizedLookup] ?? "暂未收录本地释义；后续可交给自定义 AI 结合句子解释。"}</p></div><div className="word-lookup-actions"><button className={lookupSaved ? "saved" : ""} disabled={lookupSaved} onClick={addLookupWord}><BookMarked />{lookupSaved ? "Saved" : "Add to wordbook"}</button><button aria-label="Close word translation" onClick={() => setLookupWord("")}><X /></button></div></div>}
    {showVocabulary && <section className="reading-wordbook"><header><div><small>LOCAL VOCABULARY</small><strong>My wordbook</strong></div><span>{vocabulary.length} saved</span></header>{vocabulary.length ? <div>{vocabulary.map((entry) => <article key={entry.word}><div><strong>{entry.word}</strong><p>{entry.meaning}</p><small>From “{entry.source || "English practice"}”</small></div><button aria-label={`Remove ${entry.word} from wordbook`} onClick={() => removeVocabulary(entry.word)}><Trash2 /></button></article>)}</div> : <p className="empty-wordbook">Click a word in the passage, then choose “Add to wordbook”.</p>}</section>}
    <div className={`interactive-paper tool-${tool}`}>
      <p ref={ref} className="english-passage" onMouseUp={captureSelection} onTouchEnd={captureSelection}>
        {segments.map((segment, index) => segment.highlighted ? <mark key={index}>{renderWords(segment.text, index)}</mark> : <span key={index}>{renderWords(segment.text, index)}</span>)}
      </p>
      <svg className={`annotation-layer ${["pen", "marker", "eraser"].includes(tool) ? "active" : ""}`} viewBox="0 0 1000 1000" preserveAspectRatio="none" onPointerDown={beginInk} onPointerMove={continueInk} onPointerUp={endInk} onPointerCancel={endInk} onPointerLeave={endInk}>
        {strokes.map((stroke) => <path key={stroke.id} d={strokePath(stroke.points)} className={stroke.tool} vectorEffect="non-scaling-stroke" />)}
      </svg>
    </div>
    <small>{highlights.length || strokes.length ? `${highlights.length} highlight${highlights.length === 1 ? "" : "s"} · ${strokes.length} handwritten stroke${strokes.length === 1 ? "" : "s"}` : "Annotations stay inside this practice session."}</small>
  </div>;
}

function ClozeExercise() {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [openBlank, setOpenBlank] = useState<number | null>(null);
  const blanks = [
    { id: 1, choices: ["however", "therefore", "meanwhile", "otherwise"] },
    { id: 2, choices: ["retain", "ignore", "divide", "replace"] },
    { id: 3, choices: ["deliberate", "ordinary", "silent", "temporary"] },
  ];
  const blank = (id: number) => {
    const item = blanks.find((value) => value.id === id)!;
    return <span className={`cloze-blank ${answers[id] ? "answered" : ""} ${openBlank === id ? "open" : ""}`} onMouseEnter={() => { if (!answers[id]) setOpenBlank(id); }} onMouseLeave={() => setOpenBlank((value) => value === id ? null : value)}>
      <button aria-expanded={openBlank === id} onClick={() => setOpenBlank((value) => value === id ? null : id)}>{answers[id] || `Blank ${id}`}</button>
      <span className="cloze-popover">{item.choices.map((choice) => <button key={choice} onClick={() => { setAnswers((value) => ({ ...value, [id]: choice })); setOpenBlank(null); }}>{choice}</button>)}</span>
    </span>;
  };
  return <section className="english-exercise-card">
    <header><div><span>CLOZE · DEMO 01</span><h2>Build meaning from context</h2></div><em>{Object.keys(answers).length} / 3 answered</em></header>
    <p className="exercise-instruction">Hover over or tap a blank to reveal its choices. Your selection is written back into the passage.</p>
    <article className="cloze-copy">Learning a language is rarely a straight line. A learner may understand a rule and {blank(1)} fail to use it in conversation. The solution is not to repeat the rule endlessly, but to {blank(2)} it through meaningful retrieval. With {blank(3)} practice, knowledge becomes available at the moment it is needed.</article>
    <footer><button className="english-secondary" onClick={() => { setAnswers({}); setOpenBlank(null); }}>Reset</button><button className="english-primary" disabled={Object.keys(answers).length < 3}>Check answers <ChevronRight size={16} /></button></footer>
  </section>;
}

function ReadingExercise() {
  const [choice, setChoice] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const correct = "B";
  return <section className="english-reading-grid">
    <article className="english-exercise-card reading-copy"><header><div><span>READING · PASSAGE A</span><h2>Memory is a living process</h2></div><FileText /></header><InteractivePassage /></article>
    <aside className="reading-questions"><span>QUESTION 1 OF 2</span><h3>What is the central idea of the passage?</h3>{[
      ["A", "Memory is a permanent and exact archive."],
      ["B", "Recalling a memory can make it open to change."],
      ["C", "New information always destroys old memories."],
      ["D", "Repeated retrieval makes learning less reliable."],
    ].map(([label, text]) => <button key={label} disabled={submitted} className={`${choice === label ? "selected" : ""} ${submitted && label === correct ? "correct" : ""} ${submitted && choice === label && label !== correct ? "wrong" : ""}`} onClick={() => { setChoice(label); setSubmitted(false); }}><b>{label}</b><span>{text}</span>{(choice === label || submitted && label === correct) && <Check size={16} />}</button>)}
      {!submitted ? <button className="english-primary" disabled={!choice} onClick={() => setSubmitted(true)}>Submit answer</button> : <div className={`reading-answer-analysis ${choice === correct ? "correct" : "wrong"}`}><header><span>{choice === correct ? "Correct" : `Answer: ${correct}`}</span><button onClick={() => { setChoice(""); setSubmitted(false); }}>Try again</button></header><strong>Why B?</strong><p>The passage says recalling a memory makes it “flexible again,” so later information can reshape it. That directly supports B.</p><ul><li>A contradicts the opening contrast.</li><li>C and D use absolute claims the passage does not make.</li></ul></div>}
    </aside>
  </section>;
}

function ListeningExercise({ stage }: { stage: Stage }) {
  const [playing, setPlaying] = useState(false);
  return <section className="english-listening-grid">
    <article className="qr-detection-card"><span className="qr-visual"><QrCode size={78} /></span><div><small>QR RESOURCE DETECTED</small><h2>{stage === "ielts" ? "Academic lecture track" : stage === "toefl" ? "Campus conversation track" : "Practice set audio"}</h2><p>The importer found one QR code and linked it to this listening section.</p><button className="english-secondary"><ScanSearch size={16} />Open detected resource</button></div></article>
    <article className="audio-practice"><span>LISTENING · DEMO 01</span><h3>Listen for the speaker&apos;s purpose</h3><button className={`audio-play ${playing ? "playing" : ""}`} onClick={() => setPlaying((value) => !value)}><CirclePlay size={34} fill="currentColor" /><span>{playing ? "Pause preview" : "Play preview"}</span></button><div className="audio-line"><i style={{ width: playing ? "58%" : "12%" }} /></div><p>In a full import, detected audio links and QR resources will stay attached to their original section.</p></article>
  </section>;
}

function WritingExercise({ stage }: { stage: Stage }) {
  const [draft, setDraft] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const words = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  const prompt = stage === "ielts" ? "Some people believe universities should focus only on practical skills. To what extent do you agree?" : stage === "toefl" ? "Explain which campus policy would most improve student life and why." : "Write an essay about how digital tools have changed the way students learn.";
  return <section className="english-writing-grid">
    <article className="writing-prompt"><span>WRITING PROMPT</span><h2>{prompt}</h2><ul><li>Plan your position before drafting.</li><li>Support each claim with a concrete example.</li><li>Leave two minutes for revision.</li></ul></article>
    <article className="writing-editor"><header><strong>Draft</strong><span>{words} words</span></header><textarea value={draft} onChange={(event) => { setDraft(event.target.value); setReviewed(false); }} placeholder="Start writing here…" /><footer><span>{words < 80 ? "Build your first complete paragraph." : "Good — now check transitions and evidence."}</span><button className="english-primary" disabled={words < 20} onClick={() => setReviewed(true)}><Sparkles size={16} />AI draft review</button></footer>{reviewed && <div className="writing-feedback"><b>Demo feedback</b><p>Your position is clear. Add a more specific example in paragraph two and vary the opening of your sentences.</p></div>}</article>
  </section>;
}

type LibraryActionKind = "rename" | "reset" | "share" | "delete";
type LibraryAction = { kind: LibraryActionKind; test: SavedEnglishTest };

function importedReadingLabel(sections: EnglishTestSection[], index: number) {
  const passageIndex = sections.slice(0, index + 1).filter((section) => section.kind === "reading").length - 1;
  return `Passage ${String.fromCharCode(65 + Math.max(0, passageIndex))}`;
}

function makeEnglishShareFile(test: SavedEnglishTest) {
  const payload = JSON.stringify({ format: "avecove-english-test-v1", exportedAt: new Date().toISOString(), test }, null, 2);
  const safeName = test.name.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || "English-Test";
  return new File([payload], `${safeName}.avecove-english.json`, { type: "application/json" });
}

function downloadEnglishShareFile(file: File) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function shareEnglishTest(test: SavedEnglishTest) {
  const file = makeEnglishShareFile(test);
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    await navigator.share({ title: test.name, text: "AveCove Elapse English Test", files: [file] });
    return;
  }
  downloadEnglishShareFile(file);
}

function TestLibrary({ tests, stageLabel, onOpen, onAction, onImport }: { tests: SavedEnglishTest[]; stageLabel: string; onOpen: (test: SavedEnglishTest) => void; onAction: (action: LibraryAction) => void; onImport: () => void }) {
  return <section className="test-library">
    <header><div><span>{stageLabel.toUpperCase()} · MY IMPORTED PAPERS</span><h1>{stageLabel} Test Library</h1><p>Only {stageLabel} papers are shown here. English exam imports are structured by AI; a blank paper and its answer/analysis file can be paired into one practice record.</p></div><button className="english-primary" onClick={onImport}><Import />Import a test</button></header>
    {tests.length ? <div className="test-library-grid">{tests.map((test) => {
      const questionCount = test.sections.reduce((total, section) => total + section.questions.length, 0);
      return <article key={test.id}><header><span><FileText /></span><em>{test.aiImported ? "AI · " : ""}{test.examVariant || (test.stage === "postgraduate" ? "POSTGRADUATE" : test.stage.toUpperCase())}</em></header><h2>{test.name}</h2><p>{test.sections.length} detected section{test.sections.length === 1 ? "" : "s"} · {questionCount} practice item{questionCount === 1 ? "" : "s"} · {test.answerSourceName ? "Answer file paired" : "Local record enabled"}</p><div className="test-section-tags">{test.sections.map((section, index) => <span key={section.id}>{section.kind === "reading" ? importedReadingLabel(test.sections, index) : englishSectionLabel(section.kind)} <b>{section.questions.length || "Text"}</b></span>)}</div><footer className="test-library-actions"><button className="test-open" onClick={() => onOpen(test)}><Play />Practice now</button><button title="Rename" aria-label={`Rename ${test.name}`} onClick={() => onAction({ kind: "rename", test })}><Pencil /></button><button title="Reset practice record" aria-label={`Reset practice record for ${test.name}`} onClick={() => onAction({ kind: "reset", test })}><RotateCcw /></button><button title="Share" aria-label={`Share ${test.name}`} onClick={() => onAction({ kind: "share", test })}><Share2 /></button><button className="danger" title="Delete file" aria-label={`Delete ${test.name}`} onClick={() => onAction({ kind: "delete", test })}><Trash2 /></button></footer></article>;
    })}</div> : <div className="test-library-empty"><LibraryBig /><h2>No {stageLabel} papers yet</h2><p>Import a `.doc`, `.docx`, PDF, image or AveCove English share file. AI is required for ordinary exam files so that section boundaries, passages, blanks and answer provenance can be checked before practice.</p><button className="english-primary" onClick={onImport}><Upload />Choose a file</button></div>}
  </section>;
}

function EnglishLibraryActionModal({ action, busy, onClose, onConfirm }: { action: LibraryAction; busy: boolean; onClose: () => void; onConfirm: (name?: string) => void }) {
  const [name, setName] = useState(action.test.name);
  const [accepted, setAccepted] = useState(false);
  const hasPractice = hasEnglishPractice(action.test.id);
  const content = {
    rename: { overline: "EDIT TEST", title: `Rename “${action.test.name}”`, description: "Only the name in your local Test Library will change. The source file and questions stay unchanged." },
    reset: { overline: "IRREVERSIBLE ACTION", title: `Reset “${action.test.name}”`, description: hasPractice ? "Answers and writing drafts saved for this test will be permanently removed. The imported test itself will remain." : "This test currently has no saved answers or writing drafts to clear." },
    share: { overline: "SHARE WITH CARE", title: `Share “${action.test.name}”`, description: "The share file contains the imported questions, options and detected answers, but never includes your personal practice record." },
    delete: { overline: "DELETE IMPORTED FILE", title: `Delete “${action.test.name}”`, description: "The imported test and its local practice record will be permanently removed from this browser." },
  }[action.kind];
  const needsAcceptance = action.kind !== "rename";
  const disabled = action.kind === "rename" ? busy || !name.trim() : busy || !accepted || action.kind === "reset" && !hasPractice;
  return <div className="modal-layer english-library-action-layer" onMouseDown={() => !busy && onClose()}><section className={`english-library-action-modal ${action.kind}`} onMouseDown={(event) => event.stopPropagation()}><header><div><span>{content.overline}</span><h2>{content.title}</h2></div><button onClick={onClose} disabled={busy}><X /></button></header><div className="english-library-action-note">{action.kind === "share" ? <ShieldCheck /> : action.kind === "rename" ? <Pencil /> : <AlertCircle />}<div><strong>{action.kind === "share" ? "Respect copyright and protect privacy" : action.kind === "reset" ? "Reset with care" : action.kind === "delete" ? "This cannot be undone" : "Keep the title easy to find"}</strong><p>{content.description}</p></div></div>{action.kind === "rename" && <label className="english-library-name-field"><span>Test name</span><input autoFocus maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>}{needsAcceptance && <button className={`english-library-confirm-check ${accepted ? "checked" : ""}`} role="checkbox" aria-checked={accepted} disabled={action.kind === "reset" && !hasPractice} onClick={() => setAccepted((value) => !value)}><i>{accepted && <Check />}</i><span>{action.kind === "share" ? "I confirm that I have permission to share this material and that it contains no private or patient information." : action.kind === "reset" ? "I understand that this test’s saved answers and drafts will be permanently cleared." : "I understand that the imported test and its local record will be permanently deleted."}</span></button>}<footer><button className="english-secondary" onClick={onClose} disabled={busy}>Cancel</button><button className={action.kind === "delete" || action.kind === "reset" ? "english-danger" : "english-primary"} disabled={disabled} onClick={() => onConfirm(name)}>{action.kind === "rename" ? <Pencil /> : action.kind === "reset" ? <RotateCcw /> : action.kind === "share" ? <Share2 /> : <Trash2 />}{busy ? "Working…" : action.kind === "rename" ? "Save name" : action.kind === "reset" ? "Reset record" : action.kind === "share" ? "Share test" : "Delete file"}</button></footer></section></div>;
}

function DirectionsPanel({ directions }: { directions?: string }) {
  if (!directions) return null;
  return <details className="english-directions">
    <summary><FileText /><span><strong>Directions</strong><small>Instructions are kept separate from the passage</small></span><ChevronRight /></summary>
    <p>{directions}</p>
  </details>;
}

function ImportedClozePractice({ section, responses, setResponses }: { section: EnglishTestSection; responses: Record<string, ImportedResponse>; setResponses: Dispatch<SetStateAction<Record<string, ImportedResponse>>> }) {
  const [openBlank, setOpenBlank] = useState<string | null>(null);
  const questions = new Map(section.questions.map((question) => [question.number, question]));
  const numbers = [...questions.keys()].sort((left, right) => Number(right) - Number(left));
  const escapedNumbers = numbers.map((number) => number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const passage = sanitizeEnglishPassage(section.passage);
  const hasCanonicalBlanks = /\[\[\d{1,3}\]\]/.test(passage);
  const pattern = numbers.length
    ? new RegExp(hasCanonicalBlanks
      ? `(\\[\\[(?:${escapedNumbers.join("|")})\\]\\])`
      : `(\\b(?:${escapedNumbers.join("|")})\\b)`, "g")
    : /$^/g;
  const segments = passage.split(pattern);
  const answered = section.questions.filter((question) => responses[question.id]?.choice).length;
  const allAnswered = answered === section.questions.length && section.questions.length > 0;
  const usedWordBankLabels = section.kind === "word-bank"
    ? new Set(section.questions.map((question) => responses[question.id]?.choice).filter(Boolean))
    : new Set<string>();

  function choose(question: EnglishTestQuestion, choice: string) {
    setResponses((value) => ({ ...value, [question.id]: { choice, submitted: false } }));
    setOpenBlank(null);
  }

  function reset() {
    setResponses((value) => {
      const next = { ...value };
      section.questions.forEach((question) => delete next[question.id]);
      return next;
    });
    setOpenBlank(null);
  }

  function checkAnswers() {
    setResponses((value) => {
      const next = { ...value };
      section.questions.forEach((question) => {
        if (next[question.id]?.choice) next[question.id] = { ...next[question.id], submitted: true };
      });
      return next;
    });
  }

  return <section className="english-exercise-card imported-cloze-card">
    <header><div><span>{section.kind === "word-bank" ? "WORD BANK" : "CLOZE"} · AI IMPORTED</span><h2>{section.title}</h2></div><em>{answered} / {section.questions.length} answered</em></header>
    <p className="exercise-instruction">Tap a blank to choose in context. The selected word is written back into the passage; check all answers when you finish.</p>
    <article className="cloze-copy imported-cloze-copy">{segments.map((segment, index) => {
      const questionNumber = segment.match(/\d{1,3}/)?.[0] ?? "";
      const question = questions.get(questionNumber);
      if (!question) return <span key={`${index}-${segment.slice(0, 12)}`}>{segment}</span>;
      const response = responses[question.id];
      const selected = question.options.find((option) => option.label === response?.choice);
      const state = response?.submitted ? response.choice === question.answer ? "correct" : question.answer ? "wrong" : "unscored" : "";
      return <span key={question.id} className={`cloze-blank imported-cloze-blank ${selected ? "answered" : ""} ${openBlank === question.id ? "open" : ""} ${state}`}>
        <button aria-expanded={openBlank === question.id} title={response?.submitted && question.answer ? `Correct answer: ${question.answer}` : undefined} onClick={() => setOpenBlank((value) => value === question.id ? null : question.id)}>{selected?.text || `Blank ${question.number}`}</button>
        <span className="cloze-popover imported-cloze-popover">{question.options.map((option) => {
          const unavailable = usedWordBankLabels.has(option.label) && response?.choice !== option.label;
          return <button key={option.label} disabled={unavailable} title={unavailable ? "Already used for another blank" : undefined} onClick={() => choose(question, option.label)}><b>{option.label}</b>{option.text}</button>;
        })}</span>
      </span>;
    })}</article>
    <footer><button className="english-secondary" onClick={reset}>Reset</button><button className="english-primary" disabled={!allAnswered} onClick={checkAnswers}>Check answers <ChevronRight size={16} /></button></footer>
  </section>;
}

function ImportedQuestion({ question, response, onResponse, disabledLabels = new Set<string>() }: { question: EnglishTestQuestion; response?: ImportedResponse; onResponse: (response: ImportedResponse) => void; disabledLabels?: Set<string> }) {
  const choice = response?.choice || "";
  const submitted = response?.submitted || false;
  const hasAnswer = Boolean(question.answer);
  return <article className="imported-question-card"><span>QUESTION {question.number}</span><h3>{question.stem}</h3><div>{question.options.map((option) => { const unavailable = disabledLabels.has(option.label) && choice !== option.label; return <button key={option.label} disabled={submitted || unavailable} title={unavailable ? "Already used for another blank" : undefined} className={`${choice === option.label ? "selected" : ""} ${submitted && question.answer === option.label ? "correct" : ""} ${submitted && choice === option.label && question.answer && question.answer !== option.label ? "wrong" : ""}`} onClick={() => onResponse({ choice: option.label, submitted: false })}><b>{option.label}</b><span>{option.text}</span>{choice === option.label && <Check />}</button>; })}</div>{!submitted ? <button className="english-primary" disabled={!choice} onClick={() => onResponse({ choice, submitted: true })}>Submit answer</button> : <div className={`imported-answer-state ${hasAnswer && choice === question.answer ? "correct" : hasAnswer ? "wrong" : "unscored"}`}>{hasAnswer ? <><strong>{choice === question.answer ? "Correct" : `Correct answer: ${question.answer}`}</strong><p>{question.explanation || "The answer was read from the source file. Use the passage and your annotations to review the evidence."}</p></> : <><strong>Response saved · unscored</strong><p>No answer key was detected in the imported file, so AveCove Elapse will not guess the answer.</p></>}<button onClick={() => onResponse({ choice: "", submitted: false })}>Answer again</button></div>}</article>;
}

function ImportedTranslationPractice({ section, drafts, setDrafts }: { section: EnglishTestSection; drafts: Record<string, string>; setDrafts: Dispatch<SetStateAction<Record<string, string>>> }) {
  return <div className="translation-segment-list">{section.questions.map((question) => <article key={question.id}><header><span>SEGMENT {question.number}</span><b>{drafts[question.id]?.length || 0} characters</b></header><p>{question.stem}</p><textarea value={drafts[question.id] || ""} onChange={(event) => setDrafts((value) => ({ ...value, [question.id]: event.target.value }))} placeholder={`Translate segment ${question.number} into Chinese…`} /></article>)}</div>;
}

function ImportedMatchingPractice({ section, responses, setResponses }: { section: EnglishTestSection; responses: Record<string, ImportedResponse>; setResponses: Dispatch<SetStateAction<Record<string, ImportedResponse>>> }) {
  const [submitted, setSubmitted] = useState(false);
  const labels = [...new Set(section.questions.flatMap((question) => question.options.map((option) => option.label)))].filter((label) => /^[A-G]$/.test(label));
  const answered = section.questions.filter((question) => responses[question.id]?.choice).length;
  const used = new Set(section.questions.map((question) => responses[question.id]?.choice).filter(Boolean));

  function choose(question: EnglishTestQuestion, choice: string) {
    setResponses((value) => ({ ...value, [question.id]: { choice, submitted: false } }));
    setSubmitted(false);
  }

  function reset() {
    setResponses((value) => {
      const next = { ...value };
      section.questions.forEach((question) => delete next[question.id]);
      return next;
    });
    setSubmitted(false);
  }

  function check() {
    setResponses((value) => {
      const next = { ...value };
      section.questions.forEach((question) => {
        if (next[question.id]?.choice) next[question.id] = { ...next[question.id], submitted: true };
      });
      return next;
    });
    setSubmitted(true);
  }

  return <section className="imported-matching-practice">
    <header><div><span>POSTGRADUATE · READING PART B</span><h2>Paragraph Matching · Answer Order</h2><p>The malformed OCR passage is hidden. Arrange the detected paragraph labels directly and review the answer order after submission.</p></div><em>{answered} / {section.questions.length} answered</em></header>
    <div className="matching-answer-grid">{section.questions.map((question) => {
      const response = responses[question.id];
      const state = response?.submitted && question.answer ? response.choice === question.answer ? "correct" : "wrong" : "";
      return <article key={question.id} className={state}><strong>{question.number}</strong><div>{labels.map((label) => <button key={label} disabled={used.has(label) && response?.choice !== label || submitted} className={response?.choice === label ? "selected" : ""} onClick={() => choose(question, label)}>{label}</button>)}</div>{response?.submitted && question.answer && <small>{response.choice === question.answer ? "Correct" : `Answer ${question.answer}`}</small>}</article>;
    })}</div>
    {submitted && <div className="matching-order-summary"><span>Detected answer order</span><strong>{section.questions.map((question) => `${question.number}-${question.answer || "?"}`).join(" · ")}</strong></div>}
    <footer><button className="english-secondary" onClick={reset}>Reset</button><button className="english-primary" disabled={answered !== section.questions.length} onClick={check}>Check answer order <ChevronRight /></button></footer>
  </section>;
}

function ImportedTestPractice({ test, onBack }: { test: SavedEnglishTest; onBack: () => void }) {
  const [sectionIndex, setSectionIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>(() => readEnglishPractice(test.id).drafts);
  const [responses, setResponses] = useState<Record<string, ImportedResponse>>(() => readEnglishPractice(test.id).responses);
  const section = test.sections[sectionIndex];
  const question = section.questions[questionIndex];
  const writingLike = section.kind === "writing" || section.kind === "translation";
  const draft = drafts[section.id] || "";
  const words = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  const displayPassage = section.kind === "writing" ? section.passage : sanitizeEnglishPassage(section.passage);
  const readingLabel = section.kind === "reading" ? importedReadingLabel(test.sections, sectionIndex) : "";
  const displayTitle = readingLabel || section.title;
  const displayKind = readingLabel || englishSectionLabel(section.kind);

  useEffect(() => {
    saveEnglishPractice(test.id, { responses, drafts });
  }, [drafts, responses, test.id]);

  function chooseSection(index: number) {
    setSectionIndex(index);
    setQuestionIndex(0);
  }

  return <section className="imported-test-practice"><header><button onClick={onBack}><ChevronLeft />Test Library</button><div><span>{test.examVariant || (test.stage === "postgraduate" ? "POSTGRADUATE" : test.stage.toUpperCase())} · {test.aiImported ? "AI-STRUCTURED" : "AUTO-CLASSIFIED"}</span><h1>{test.name}</h1></div><em>{sectionIndex + 1} / {test.sections.length}</em></header><nav>{test.sections.map((item, index) => <button key={item.id} className={sectionIndex === index ? "active" : ""} onClick={() => chooseSection(index)}><span>{item.kind === "reading" ? importedReadingLabel(test.sections, index) : englishSectionLabel(item.kind)}</span><b>{item.questions.length || "Text"}</b></button>)}</nav>
    {test.aiWarnings?.length ? <div className="english-ai-warnings"><Bot /><div><strong>AI import review</strong><p>{test.aiWarnings.join(" · ")}</p></div></div> : null}
    <DirectionsPanel directions={section.directions} />
    {section.kind === "cloze" || section.kind === "word-bank" ? <ImportedClozePractice key={section.id} section={{ ...section, passage: displayPassage }} responses={responses} setResponses={setResponses} /> : section.kind === "matching" ? <ImportedMatchingPractice key={section.id} section={section} responses={responses} setResponses={setResponses} /> : section.kind === "translation" && section.questions.length ? <ImportedTranslationPractice key={section.id} section={section} drafts={drafts} setDrafts={setDrafts} /> : writingLike ? <div className="imported-writing-practice"><article><span>{displayKind.toUpperCase()} PROMPT</span><h2>{displayTitle}</h2><p>{displayPassage || "The source file did not provide a separate prompt. Review the original document before writing."}</p></article><article className="writing-editor"><header><strong>Your response</strong><span>{words} words</span></header><textarea value={draft} onChange={(event) => setDrafts((value) => ({ ...value, [section.id]: event.target.value }))} placeholder={section.kind === "translation" ? "Translate the Chinese passage into English…" : "Start writing here…"} /><footer><span>Saved locally in this Test Library record</span></footer></article></div> : <div className={`imported-practice-grid ${displayPassage ? "with-passage" : ""}`}>
      {displayPassage && <article className="english-exercise-card imported-passage"><header><div><span>{displayKind.toUpperCase()} · IMPORTED</span><h2>{displayTitle}</h2></div><FileText /></header><InteractivePassage key={section.id} content={displayPassage} sourceTitle={`${test.name} · ${displayTitle}`} /></article>}
      {question ? <aside><ImportedQuestion question={question} response={responses[question.id]} onResponse={(response) => setResponses((value) => ({ ...value, [question.id]: response }))} /><footer><button disabled={questionIndex === 0} onClick={() => setQuestionIndex((value) => Math.max(0, value - 1))}><ChevronLeft />Previous</button><span>{questionIndex + 1} / {section.questions.length}</span><button disabled={questionIndex + 1 >= section.questions.length} onClick={() => setQuestionIndex((value) => Math.min(section.questions.length - 1, value + 1))}>Next<ChevronRight /></button></footer></aside> : <div className="imported-no-questions"><AlertCircle /><h2>Reading workspace ready</h2><p>This section was identified, but no complete answer block was found. You can still look up words, highlight and write on the passage.</p></div>}
    </div>}
  </section>;
}

function EnglishOverview({ stage, onTask }: { stage: Stage; onTask: (task: EnglishTask) => void }) {
  const currentStage = stages.find((item) => item.id === stage)!;
  return <><section className="english-hero"><div><span><Sparkles size={14} />ENGLISH LEARNING</span><h1>Read actively. Think clearly.<br />Use English with confidence.</h1><p>A focused workspace for {currentStage.label} practice — designed around real exam tasks, annotations and AI-structured imports.</p><button className="english-primary" onClick={() => onTask(currentStage.tasks[0])}>Start a demo session <ChevronRight size={17} /></button></div><div className="english-hero-stat"><strong>4</strong><span>interactive task formats</span><i /><strong>AI</strong><span>exam-aware import engine</span></div></section><div className="english-section-title"><div><span>YOUR PRACTICE MAP</span><h2>Choose a skill to train</h2></div><p>{currentStage.detail}</p></div><section className="english-task-grid">{currentStage.tasks.map((task) => { const meta = taskMeta[task]; const Icon = meta.icon; return <button key={task} onClick={() => onTask(task)}><span><Icon size={22} /></span><div><strong>{meta.title}</strong><p>{meta.short}</p></div><ChevronRight /></button>; })}</section></>;
}

function AnswerCompanionModal({ testName, busy, onChoose, onSkip }: { testName: string; busy: boolean; onChoose: () => void; onSkip: () => void }) {
  return <div className="modal-layer english-answer-companion-layer" onMouseDown={() => !busy && onSkip()}>
    <section className="english-answer-companion" onMouseDown={(event) => event.stopPropagation()}>
      <header><span><Bot /></span><div><small>AI ANSWER PAIRING</small><h2>Add the answer or analysis file?</h2></div></header>
      <p>“{testName}” looks like a blank paper. Import its matching answer/analysis PDF now, and AI will combine the question paper, answer key, listening transcript and explanations into the same Test Library entry.</p>
      <div><FileText /><span><strong>No duplicate test</strong><small>The existing paper will be upgraded in place.</small></span></div>
      <div><ShieldCheck /><span><strong>No guessed answers</strong><small>Scoring uses only answers explicitly found in the companion file.</small></span></div>
      <footer><button className="english-secondary" onClick={onSkip} disabled={busy}>Not now</button><button className="english-primary" onClick={onChoose} disabled={busy}><Upload />{busy ? "Pairing with AI…" : "Choose answer / analysis file"}</button></footer>
    </section>
  </div>;
}

export default function EnglishLearningView({ onExit }: { onExit: () => void }) {
  const [stage, setStage] = useState<Stage>("cet");
  const [task, setTask] = useState<EnglishTask>("overview");
  const [importing, setImporting] = useState(false);
  const [tests, setTests] = useState<SavedEnglishTest[]>([]);
  const [activeTest, setActiveTest] = useState<SavedEnglishTest | null>(null);
  const [libraryAction, setLibraryAction] = useState<LibraryAction | null>(null);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [pendingCompanion, setPendingCompanion] = useState<PendingCompanionImport | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [importStatus, setImportStatus] = useState<{ phase: string; detail: string; progress: number; error?: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const companionFileRef = useRef<HTMLInputElement>(null);
  const importControllerRef = useRef<AbortController | null>(null);
  const currentStage = stages.find((item) => item.id === stage)!;
  const stageTests = tests.filter((test) => test.stage === stage);
  const taskTests = stageTests.filter((test) => test.sections.some((section) => task === "reading" ? ["reading", "word-bank", "long-reading"].includes(section.kind) : section.kind === task));

  useEffect(() => {
    let cancelled = false;
    listEnglishTests().then((items) => { if (!cancelled) setTests(items); }).catch(() => { if (!cancelled) setImportStatus({ phase: "Library unavailable", detail: "This browser could not open local English test storage.", progress: 0, error: true }); });
    return () => { cancelled = true; importControllerRef.current?.abort(); };
  }, []);

  function chooseStage(next: Stage) {
    setStage(next);
    setTask("library");
    setActiveTest(null);
  }

  async function handleImport(files: FileList | null) {
    if (!files?.length || importing) return;
    setImporting(true);
    const selected = Array.from(files);
    const pairedAnswer = selected.length === 2 ? selected.find(looksLikeAnswerOrAnalysisFile) : undefined;
    const pairedSource = pairedAnswer ? selected.find((file) => file !== pairedAnswer) : undefined;
    const jobs = pairedAnswer && pairedSource
      ? [{ source: pairedSource, answer: pairedAnswer }]
      : selected.map((file) => ({ source: file, answer: looksLikeAnswerOrAnalysisFile(file) ? file : undefined }));
    const saved: SavedEnglishTest[] = [];
    const failed: string[] = [];
    let companionCandidate: PendingCompanionImport | null = null;
    const batchController = new AbortController();
    importControllerRef.current = batchController;
    let cancelled = false;
    for (let index = 0; index < jobs.length; index += 1) {
      const { source, answer } = jobs[index];
      if (batchController.signal.aborted) {
        cancelled = true;
        break;
      }
      const fileController = new AbortController();
      const cancelCurrentFile = () => fileController.abort();
      batchController.signal.addEventListener("abort", cancelCurrentFile, { once: true });
      let timedOut = false;
      const timer = window.setTimeout(() => {
        timedOut = true;
        fileController.abort();
      }, 270_000);
      try {
        if (source.name.toLocaleLowerCase().endsWith(".json")) {
          const parsed = await extractEnglishTestFile(source, (update) => setImportStatus({ ...update, phase: `${index + 1}/${jobs.length} · ${update.phase}` }), fileController.signal);
          saved.push(await saveEnglishTest(parsed));
          continue;
        }
        const sourceExtracted = await extractEnglishSourceFile(
          source,
          (update) => setImportStatus({ ...update, phase: `${index + 1}/${jobs.length} · Source: ${update.phase}` }),
          fileController.signal,
        );
        const answerExtracted = answer
          ? answer === source
            ? sourceExtracted
            : await extractEnglishSourceFile(
                answer,
                (update) => setImportStatus({ ...update, phase: `${index + 1}/${jobs.length} · Answers: ${update.phase}` }),
                fileController.signal,
              )
          : undefined;
        setImportStatus({
          phase: `${index + 1}/${jobs.length} · AI structuring`,
          detail: answer ? "Pairing the blank paper with its answer/analysis file by question number." : "Mapping sections, passages, blanks and questions with AI.",
          progress: 92,
        });
        const result = await requestEnglishAiImport({
          sourceFileName: source.name,
          sourceText: sourceExtracted.text,
          answerFileName: answer?.name,
          answerText: answerExtracted?.text,
          usedOcr: sourceExtracted.usedOcr || Boolean(answerExtracted?.usedOcr),
        }, fileController.signal);
        if (fileController.signal.aborted) throw new DOMException("Import cancelled", "AbortError");
        const savedTest = await saveEnglishTest(result.test);
        saved.push(savedTest);
        if (!answer && result.report.answerCoverage < 75 && !companionCandidate) {
          companionCandidate = {
            test: savedTest,
            sourceFileName: source.name,
            sourceText: sourceExtracted.text,
            usedOcr: sourceExtracted.usedOcr,
          };
        }
      } catch (error) {
        if (batchController.signal.aborted) {
          cancelled = true;
          break;
        }
        failed.push(`${source.name}: ${timedOut ? "Import timed out after 4.5 minutes and was stopped" : error instanceof Error ? error.message : "Import failed"}`);
      } finally {
        window.clearTimeout(timer);
        batchController.signal.removeEventListener("abort", cancelCurrentFile);
      }
    }
    setImporting(false);
    importControllerRef.current = null;
    if (fileRef.current) fileRef.current.value = "";
    if (saved.length) {
      setTests(await listEnglishTests());
      setStage(saved[0].stage);
      setActiveTest(saved[0]);
      setTask("library");
      if (companionCandidate) setPendingCompanion(companionCandidate);
      setImportStatus(cancelled
        ? { phase: "Import cancelled", detail: `${saved.length} completed test${saved.length === 1 ? " was" : "s were"} kept. Remaining files were not processed.`, progress: 100, error: true }
        : { phase: `${saved.length} AI-structured test${saved.length === 1 ? "" : "s"} ready`, detail: failed.length ? `${failed.length} file(s) could not be imported: ${failed.join(" ")}` : companionCandidate ? "The paper is ready. Add its answer/analysis file now to unlock reliable scoring and explanations." : "The paper and available answers were mapped into your Test Library.", progress: 100, error: Boolean(failed.length) });
    } else {
      setImportStatus(cancelled
        ? { phase: "Import cancelled", detail: "The current OCR/file analysis was stopped and nothing was saved.", progress: 0, error: true }
        : { phase: "Import failed", detail: failed.join(" ") || "No readable exam content was found.", progress: 0, error: true });
    }
  }

  async function handleCompanionImport(files: FileList | null) {
    const answerFile = files?.[0];
    if (!answerFile || !pendingCompanion || importing) return;
    setImporting(true);
    const controller = new AbortController();
    importControllerRef.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 270_000);
    try {
      const answerExtracted = await extractEnglishSourceFile(
        answerFile,
        (update) => setImportStatus({ ...update, phase: `Answer file: ${update.phase}` }),
        controller.signal,
      );
      setImportStatus({ phase: "AI pairing source and answers", detail: "Matching answer keys, transcripts and source-grounded explanations by question number.", progress: 92 });
      const result = await requestEnglishAiImport({
        sourceFileName: pendingCompanion.sourceFileName,
        sourceText: pendingCompanion.sourceText,
        answerFileName: answerFile.name,
        answerText: answerExtracted.text,
        usedOcr: pendingCompanion.usedOcr || answerExtracted.usedOcr,
      }, controller.signal);
      const updated = await replaceEnglishTestContent(pendingCompanion.test.id, result.test);
      setTests(await listEnglishTests());
      setActiveTest(updated);
      setStage(updated.stage);
      setTask("library");
      setPendingCompanion(null);
      setImportStatus({
        phase: "Answer file merged",
        detail: `${result.report.answeredQuestions}/${result.report.totalQuestions} objective questions now have source-backed answers. The original library entry was updated, not duplicated.`,
        progress: 100,
      });
    } catch (error) {
      setImportStatus({
        phase: "Answer pairing failed",
        detail: error instanceof DOMException && error.name === "AbortError" ? "The answer import was cancelled or timed out." : error instanceof Error ? error.message : "Please retry with the matching answer/analysis file.",
        progress: 0,
        error: true,
      });
    } finally {
      window.clearTimeout(timer);
      setImporting(false);
      importControllerRef.current = null;
      if (companionFileRef.current) companionFileRef.current.value = "";
    }
  }

  function cancelImport() {
    if (!importControllerRef.current || importControllerRef.current.signal.aborted) return;
    setImportStatus((status) => ({ phase: "Cancelling import…", detail: "Stopping the current OCR and file analysis safely.", progress: status?.progress ?? 0 }));
    importControllerRef.current.abort();
  }

  async function confirmLibraryAction(name?: string) {
    if (!libraryAction) return;
    setLibraryBusy(true);
    try {
      if (libraryAction.kind === "rename") {
        const updated = await renameEnglishTest(libraryAction.test.id, name || libraryAction.test.name);
        if (activeTest?.id === updated.id) setActiveTest(updated);
        setImportStatus({ phase: "Test renamed", detail: `“${updated.name}” is ready in your Test Library.`, progress: 100 });
      } else if (libraryAction.kind === "reset") {
        clearEnglishPractice(libraryAction.test.id);
        setImportStatus({ phase: "Practice record cleared", detail: `“${libraryAction.test.name}” is ready for a fresh start. The imported test was kept.`, progress: 100 });
      } else if (libraryAction.kind === "share") {
        await shareEnglishTest(libraryAction.test);
        setImportStatus({ phase: "Share file ready", detail: "The portable file excludes your answers and writing drafts. It can be imported into another AveCove Elapse browser.", progress: 100 });
      } else {
        await deleteEnglishTest(libraryAction.test.id);
        clearEnglishPractice(libraryAction.test.id);
        if (activeTest?.id === libraryAction.test.id) setActiveTest(null);
        setImportStatus({ phase: "Imported test deleted", detail: `“${libraryAction.test.name}” and its local practice record were removed.`, progress: 100 });
      }
      setTests(await listEnglishTests());
      setLibraryAction(null);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setImportStatus({ phase: "Action failed", detail: error instanceof Error ? error.message : "Please try again.", progress: 0, error: true });
    } finally {
      setLibraryBusy(false);
    }
  }

  return <div className={`english-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
    <aside className="english-sidebar"><div className="english-brand"><span className="english-logo"><Image src="/hongdou-logo.png" alt="AveCove Elapse medical serpent logo" width={43} height={43} /></span><div><strong>AveCove Elapse</strong><small>English Lab</small></div></div><button className="english-back" onClick={onExit}><ArrowLeft size={17} /><span>Chinese Practice</span></button><nav><button className={task === "overview" ? "active" : ""} onClick={() => { setTask("overview"); setActiveTest(null); }}><Sparkles /><span>Overview</span></button>{currentStage.tasks.map((item) => { const meta = taskMeta[item]; const Icon = meta.icon; return <button key={item} className={task === item ? "active" : ""} onClick={() => { setTask(item); setActiveTest(null); }}><Icon /><span>{meta.title}</span></button>; })}<button className={task === "library" ? "active" : ""} onClick={() => { setTask("library"); setActiveTest(null); }}><Database /><span>Test Library</span><b>{stageTests.length}</b></button></nav><div className="english-import"><input ref={fileRef} type="file" multiple accept=".doc,.docx,.pdf,.json,application/json,image/*" onChange={(event) => { void handleImport(event.target.files); }} /><input ref={companionFileRef} type="file" accept=".doc,.docx,.pdf,image/*" onChange={(event) => { void handleCompanionImport(event.target.files); }} /><Link className="english-ai-link" href="/custom-ai"><Bot size={17} /><span>Custom AI</span></Link><button onClick={() => fileRef.current?.click()} disabled={importing}><Import size={17} /><span>{importing ? "Importing…" : "Import exam file"}</span></button><p>AI structuring is required<br />Blank paper + answer file pairing</p></div></aside>
    <main className="english-main"><header className="english-topbar"><div><span>STUDY STAGE</span><div className="stage-switch">{stages.map((item) => <button key={item.id} className={stage === item.id ? "active" : ""} onClick={() => chooseStage(item.id)}>{item.label}</button>)}</div></div><div className="english-topbar-actions"><button className="english-sidebar-toggle" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>{sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button><button className="english-upload" onClick={() => fileRef.current?.click()} disabled={importing}><Upload size={17} />{importing ? "Importing…" : "Import"}</button></div></header>
      {importing && <div className="english-import-status scanning"><FileSearch /><div><strong>{importStatus?.phase || "Mapping the exam structure…"}</strong><span>{importStatus?.detail || "Finding cloze, reading, matching, translation and writing sections."}</span></div><div className="english-import-control"><b>{importStatus?.progress || 0}%</b><button type="button" onClick={cancelImport}><X />Cancel</button></div></div>}
      {!importing && importStatus && <div className={`english-import-status ${importStatus.error ? "failed" : "ready"}`}>{importStatus.error ? <AlertCircle /> : <Check />}<div><strong>{importStatus.phase}</strong><span>{importStatus.detail}</span></div><button onClick={() => setImportStatus(null)} aria-label="Dismiss import status"><X /></button></div>}
      {task === "overview" && <EnglishOverview stage={stage} onTask={setTask} />}
      {task === "library" && (activeTest ? <ImportedTestPractice key={activeTest.id} test={activeTest} onBack={() => setActiveTest(null)} /> : <TestLibrary tests={stageTests} stageLabel={currentStage.label} onOpen={(test) => { setStage(test.stage); setActiveTest(test); }} onAction={setLibraryAction} onImport={() => fileRef.current?.click()} />)}
      {task === "cloze" && <ClozeExercise />}
      {task === "reading" && <ReadingExercise />}
      {task === "listening" && <ListeningExercise stage={stage} />}
      {(task === "matching" || task === "translation") && (activeTest ? <ImportedTestPractice key={activeTest.id} test={activeTest} onBack={() => setActiveTest(null)} /> : <TestLibrary tests={taskTests} stageLabel={`${currentStage.label} · ${taskMeta[task].title}`} onOpen={setActiveTest} onAction={setLibraryAction} onImport={() => fileRef.current?.click()} />)}
      {task === "writing" && <WritingExercise stage={stage} />}
    </main>
    {libraryAction && <EnglishLibraryActionModal key={`${libraryAction.kind}-${libraryAction.test.id}`} action={libraryAction} busy={libraryBusy} onClose={() => setLibraryAction(null)} onConfirm={(name) => { void confirmLibraryAction(name); }} />}
    {pendingCompanion && <AnswerCompanionModal testName={pendingCompanion.test.name} busy={importing} onChoose={() => companionFileRef.current?.click()} onSkip={() => setPendingCompanion(null)} />}
  </div>;
}
