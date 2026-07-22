"use client";

import Image from "next/image";
import { type Dispatch, type PointerEvent as ReactPointerEvent, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, ArrowLeft, BookMarked, BookOpen, Check, ChevronLeft, ChevronRight,
  CirclePlay, Database, Eraser, FileSearch, FileText, Headphones,
  Highlighter, Import, Languages, LibraryBig, MousePointer2, PenLine, Play,
  QrCode, RotateCcw, ScanSearch, Sparkles, Trash2, Undo2, Upload, X,
} from "lucide-react";
import {
  deleteEnglishTest, englishSectionLabel, extractEnglishTestFile, listEnglishTests,
  sanitizeEnglishPassage, saveEnglishTest, type EnglishStage, type EnglishTestQuestion, type EnglishTestSection,
  type SavedEnglishTest,
} from "@/app/lib/english-test";

type Stage = EnglishStage;
type PracticeTask = "cloze" | "reading" | "listening" | "writing";
type EnglishTask = "overview" | "library" | PracticeTask;
type HighlightRange = { start: number; end: number };
type ReadingTool = "lookup" | "highlight" | "pen" | "marker" | "eraser";
type InkPoint = { x: number; y: number };
type InkStroke = { id: string; tool: "pen" | "marker"; points: InkPoint[] };
type VocabularyEntry = { word: string; meaning: string; context: string; source?: string; addedAt: string };

const vocabularyStorageKey = "avecove-english-vocabulary-v1";

const stages: Array<{ id: Stage; label: string; detail: string; tasks: PracticeTask[] }> = [
  { id: "cet", label: "CET", detail: "CET-4 / CET-6", tasks: ["cloze", "reading", "listening", "writing"] },
  { id: "postgraduate", label: "Postgraduate", detail: "National entrance exam", tasks: ["cloze", "reading", "writing"] },
  { id: "ielts", label: "IELTS", detail: "Academic training", tasks: ["reading", "listening", "writing"] },
  { id: "toefl", label: "TOEFL", detail: "Integrated practice", tasks: ["reading", "listening", "writing"] },
];

const taskMeta: Record<PracticeTask, { title: string; short: string; icon: typeof BookOpen }> = {
  cloze: { title: "Cloze Lab", short: "Context and vocabulary", icon: Languages },
  reading: { title: "Reading Studio", short: "Highlight while you read", icon: BookOpen },
  listening: { title: "Listening Room", short: "QR and audio resources", icon: Headphones },
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

  const toolHint = tool === "lookup" ? "Click any English word for an instant meaning." : tool === "highlight" ? "Select a phrase to keep a reading highlight." : tool === "eraser" ? "Drag across a stroke to erase it." : "Write directly over the passage with a mouse, stylus or finger.";
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
    <article className="english-exercise-card reading-copy"><header><div><span>READING · PASSAGE 01</span><h2>Memory is a living process</h2></div><FileText /></header><InteractivePassage /></article>
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

function TestLibrary({ tests, onOpen, onDelete, onImport }: { tests: SavedEnglishTest[]; onOpen: (test: SavedEnglishTest) => void; onDelete: (id: string) => void; onImport: () => void }) {
  return <section className="test-library">
    <header><div><span>MY IMPORTED PAPERS</span><h1>Test Library</h1><p>Imported exam files are classified into practice sections and kept on this device.</p></div><button className="english-primary" onClick={onImport}><Import />Import a test</button></header>
    {tests.length ? <div className="test-library-grid">{tests.map((test) => {
      const questionCount = test.sections.reduce((total, section) => total + section.questions.length, 0);
      return <article key={test.id}><header><span><FileText /></span><em>{test.examVariant || (test.stage === "postgraduate" ? "POSTGRADUATE" : test.stage.toUpperCase())}</em></header><h2>{test.name}</h2><p>{test.sections.length} detected section{test.sections.length === 1 ? "" : "s"} · {questionCount} practice item{questionCount === 1 ? "" : "s"}</p><div className="test-section-tags">{test.sections.map((section) => <span key={section.id}>{section.kind === "reading" ? section.title.replace("Reading Part A · ", "") : englishSectionLabel(section.kind)} <b>{section.questions.length || "Text"}</b></span>)}</div><footer><button className="test-open" onClick={() => onOpen(test)}><Play />Practice now</button><button aria-label={`Delete ${test.name}`} onClick={() => onDelete(test.id)}><Trash2 /></button></footer></article>;
    })}</div> : <div className="test-library-empty"><LibraryBig /><h2>Your Test Library is ready</h2><p>Import a `.doc`, `.docx`, PDF or image. AveCove Elapse will identify its stage and separate cloze, listening, word-bank, long-reading, close-reading, translation and writing sections.</p><button className="english-primary" onClick={onImport}><Upload />Choose a file</button></div>}
  </section>;
}

type ImportedResponse = { choice: string; submitted: boolean };

function ImportedClozePractice({ section, responses, setResponses }: { section: EnglishTestSection; responses: Record<string, ImportedResponse>; setResponses: Dispatch<SetStateAction<Record<string, ImportedResponse>>> }) {
  const [openBlank, setOpenBlank] = useState<string | null>(null);
  const questions = new Map(section.questions.map((question) => [question.number, question]));
  const numbers = [...questions.keys()].sort((left, right) => Number(right) - Number(left));
  const pattern = numbers.length ? new RegExp(`\\b(${numbers.join("|")})\\b`, "g") : /$^/g;
  const passage = sanitizeEnglishPassage(section.passage);
  const segments = passage.split(pattern);
  const answered = section.questions.filter((question) => responses[question.id]?.choice).length;
  const allAnswered = answered === section.questions.length && section.questions.length > 0;

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
    <header><div><span>CLOZE · IMPORTED</span><h2>{section.title}</h2></div><em>{answered} / {section.questions.length} answered</em></header>
    <p className="exercise-instruction">Tap a blank to choose in context. The selected word is written back into the passage; check all answers when you finish.</p>
    <article className="cloze-copy imported-cloze-copy">{segments.map((segment, index) => {
      const question = questions.get(segment);
      if (!question) return <span key={`${index}-${segment.slice(0, 12)}`}>{segment}</span>;
      const response = responses[question.id];
      const selected = question.options.find((option) => option.label === response?.choice);
      const state = response?.submitted ? response.choice === question.answer ? "correct" : question.answer ? "wrong" : "unscored" : "";
      return <span key={question.id} className={`cloze-blank imported-cloze-blank ${selected ? "answered" : ""} ${openBlank === question.id ? "open" : ""} ${state}`}>
        <button aria-expanded={openBlank === question.id} title={response?.submitted && question.answer ? `Correct answer: ${question.answer}` : undefined} onClick={() => setOpenBlank((value) => value === question.id ? null : question.id)}>{selected?.text || `Blank ${question.number}`}</button>
        <span className="cloze-popover imported-cloze-popover">{question.options.map((option) => <button key={option.label} onClick={() => choose(question, option.label)}><b>{option.label}</b>{option.text}</button>)}</span>
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

function ImportedTranslationPractice({ section }: { section: EnglishTestSection }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  return <div className="translation-segment-list">{section.questions.map((question) => <article key={question.id}><header><span>SEGMENT {question.number}</span><b>{drafts[question.id]?.length || 0} characters</b></header><p>{question.stem}</p><textarea value={drafts[question.id] || ""} onChange={(event) => setDrafts((value) => ({ ...value, [question.id]: event.target.value }))} placeholder={`Translate segment ${question.number} into Chinese…`} /></article>)}</div>;
}

function ImportedTestPractice({ test, onBack }: { test: SavedEnglishTest; onBack: () => void }) {
  const [sectionIndex, setSectionIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [responses, setResponses] = useState<Record<string, ImportedResponse>>({});
  const section = test.sections[sectionIndex];
  const question = section.questions[questionIndex];
  const writingLike = section.kind === "writing" || section.kind === "translation";
  const words = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  const usedWordBankLabels = section.kind === "word-bank" ? new Set(Object.entries(responses).filter(([id, response]) => id.startsWith(`${section.id}:`) && id !== question?.id && response.choice).map(([, response]) => response.choice)) : new Set<string>();
  const displayPassage = section.kind === "writing" ? section.passage : sanitizeEnglishPassage(section.passage);

  function chooseSection(index: number) {
    setSectionIndex(index);
    setQuestionIndex(0);
    setDraft("");
  }

  return <section className="imported-test-practice"><header><button onClick={onBack}><ChevronLeft />Test Library</button><div><span>{test.examVariant || (test.stage === "postgraduate" ? "POSTGRADUATE" : test.stage.toUpperCase())} · AUTO-CLASSIFIED</span><h1>{test.name}</h1></div><em>{sectionIndex + 1} / {test.sections.length}</em></header><nav>{test.sections.map((item, index) => <button key={item.id} className={sectionIndex === index ? "active" : ""} onClick={() => chooseSection(index)}><span>{item.kind === "reading" ? item.title.replace("Reading Part A · ", "") : englishSectionLabel(item.kind)}</span><b>{item.questions.length || "Text"}</b></button>)}</nav>
    {section.kind === "cloze" ? <ImportedClozePractice key={section.id} section={{ ...section, passage: displayPassage }} responses={responses} setResponses={setResponses} /> : section.kind === "translation" && section.questions.length ? <ImportedTranslationPractice key={section.id} section={section} /> : writingLike ? <div className="imported-writing-practice"><article><span>{englishSectionLabel(section.kind).toUpperCase()} PROMPT</span><h2>{section.title}</h2><p>{displayPassage || "The source file did not provide a separate prompt. Review the original document before writing."}</p></article><article className="writing-editor"><header><strong>Your response</strong><span>{words} words</span></header><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={section.kind === "translation" ? "Translate the Chinese passage into English…" : "Start writing here…"} /><footer><span>Saved in this practice session</span></footer></article></div> : <div className={`imported-practice-grid ${displayPassage ? "with-passage" : ""}`}>
      {displayPassage && <article className="english-exercise-card imported-passage"><header><div><span>{englishSectionLabel(section.kind).toUpperCase()} · IMPORTED</span><h2>{section.title}</h2></div><FileText /></header><InteractivePassage key={section.id} content={displayPassage} sourceTitle={`${test.name} · ${section.title}`} /></article>}
      {question ? <aside><ImportedQuestion question={question} response={responses[question.id]} disabledLabels={usedWordBankLabels} onResponse={(response) => setResponses((value) => ({ ...value, [question.id]: response }))} /><footer><button disabled={questionIndex === 0} onClick={() => setQuestionIndex((value) => Math.max(0, value - 1))}><ChevronLeft />Previous</button><span>{questionIndex + 1} / {section.questions.length}</span><button disabled={questionIndex + 1 >= section.questions.length} onClick={() => setQuestionIndex((value) => Math.min(section.questions.length - 1, value + 1))}>Next<ChevronRight /></button></footer></aside> : <div className="imported-no-questions"><AlertCircle /><h2>Reading workspace ready</h2><p>This section was identified, but no complete answer block was found. You can still look up words, highlight and write on the passage.</p></div>}
    </div>}
  </section>;
}

function EnglishOverview({ stage, onTask }: { stage: Stage; onTask: (task: EnglishTask) => void }) {
  const currentStage = stages.find((item) => item.id === stage)!;
  return <><section className="english-hero"><div><span><Sparkles size={14} />ENGLISH LEARNING</span><h1>Read actively. Think clearly.<br />Use English with confidence.</h1><p>A focused workspace for {currentStage.label} practice — designed around real exam tasks, annotations and AI-assisted imports.</p><button className="english-primary" onClick={() => onTask(currentStage.tasks[0])}>Start a demo session <ChevronRight size={17} /></button></div><div className="english-hero-stat"><strong>4</strong><span>interactive task formats</span><i /><strong>1</strong><span>smart import workspace</span></div></section><div className="english-section-title"><div><span>YOUR PRACTICE MAP</span><h2>Choose a skill to train</h2></div><p>{currentStage.detail}</p></div><section className="english-task-grid">{currentStage.tasks.map((task) => { const meta = taskMeta[task]; const Icon = meta.icon; return <button key={task} onClick={() => onTask(task)}><span><Icon size={22} /></span><div><strong>{meta.title}</strong><p>{meta.short}</p></div><ChevronRight /></button>; })}</section></>;
}

export default function EnglishLearningView({ onExit }: { onExit: () => void }) {
  const [stage, setStage] = useState<Stage>("cet");
  const [task, setTask] = useState<EnglishTask>("overview");
  const [importing, setImporting] = useState(false);
  const [tests, setTests] = useState<SavedEnglishTest[]>([]);
  const [activeTest, setActiveTest] = useState<SavedEnglishTest | null>(null);
  const [importStatus, setImportStatus] = useState<{ phase: string; detail: string; progress: number; error?: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const currentStage = stages.find((item) => item.id === stage)!;

  useEffect(() => {
    let cancelled = false;
    listEnglishTests().then((items) => { if (!cancelled) setTests(items); }).catch(() => { if (!cancelled) setImportStatus({ phase: "Library unavailable", detail: "This browser could not open local English test storage.", progress: 0, error: true }); });
    return () => { cancelled = true; };
  }, []);

  function chooseStage(next: Stage) {
    setStage(next);
    setTask("overview");
    setActiveTest(null);
  }

  async function handleImport(files: FileList | null) {
    if (!files?.length) return;
    setImporting(true);
    const selected = Array.from(files);
    const saved: SavedEnglishTest[] = [];
    const failed: string[] = [];
    for (let index = 0; index < selected.length; index += 1) {
      const file = selected[index];
      try {
        const parsed = await extractEnglishTestFile(file, (update) => setImportStatus({ ...update, phase: `${index + 1}/${selected.length} · ${update.phase}` }));
        saved.push(await saveEnglishTest(parsed));
      } catch (error) {
        failed.push(`${file.name}: ${error instanceof Error ? error.message : "Import failed"}`);
      }
    }
    setImporting(false);
    if (fileRef.current) fileRef.current.value = "";
    if (saved.length) {
      setTests(await listEnglishTests());
      setStage(saved[0].stage);
      setActiveTest(saved[0]);
      setTask("library");
      setImportStatus({ phase: `${saved.length} test${saved.length === 1 ? "" : "s"} ready`, detail: failed.length ? `${failed.length} file(s) could not be imported: ${failed.join(" ")}` : "The paper was classified and added to your Test Library.", progress: 100, error: Boolean(failed.length) });
    } else {
      setImportStatus({ phase: "Import failed", detail: failed.join(" ") || "No readable exam content was found.", progress: 0, error: true });
    }
  }

  async function removeTest(id: string) {
    if (!window.confirm("Delete this imported test and its local practice copy? This cannot be undone.")) return;
    await deleteEnglishTest(id);
    setTests(await listEnglishTests());
    if (activeTest?.id === id) setActiveTest(null);
  }

  return <div className="english-shell">
    <aside className="english-sidebar"><div className="english-brand"><span className="english-logo"><Image src="/hongdou-logo.png" alt="AveCove Elapse medical serpent logo" width={43} height={43} /></span><div><strong>AveCove Elapse</strong><small>English Lab</small></div></div><button className="english-back" onClick={onExit}><ArrowLeft size={17} />Chinese Practice</button><nav><button className={task === "overview" ? "active" : ""} onClick={() => { setTask("overview"); setActiveTest(null); }}><Sparkles />Overview</button><button className={task === "library" ? "active" : ""} onClick={() => { setTask("library"); setActiveTest(null); }}><Database />Test Library <b>{tests.length}</b></button>{currentStage.tasks.map((item) => { const meta = taskMeta[item]; const Icon = meta.icon; return <button key={item} className={task === item ? "active" : ""} onClick={() => { setTask(item); setActiveTest(null); }}><Icon />{meta.title}</button>; })}</nav><div className="english-import"><input ref={fileRef} type="file" multiple accept=".doc,.docx,.pdf,image/*" onChange={(event) => { void handleImport(event.target.files); }} /><button onClick={() => fileRef.current?.click()}><Import size={17} />Import exam file</button><p>Word, PDF and image files<br />Automatic section mapping</p></div></aside>
    <main className="english-main"><header className="english-topbar"><div><span>STUDY STAGE</span><div className="stage-switch">{stages.map((item) => <button key={item.id} className={stage === item.id ? "active" : ""} onClick={() => chooseStage(item.id)}>{item.label}</button>)}</div></div><button className="english-upload" onClick={() => fileRef.current?.click()}><Upload size={17} />Import</button></header>
      {importing && <div className="english-import-status scanning"><FileSearch /><div><strong>{importStatus?.phase || "Mapping the exam structure…"}</strong><span>{importStatus?.detail || "Finding cloze, reading, matching, translation and writing sections."}</span></div><b>{importStatus?.progress || 0}%</b></div>}
      {!importing && importStatus && <div className={`english-import-status ${importStatus.error ? "failed" : "ready"}`}>{importStatus.error ? <AlertCircle /> : <Check />}<div><strong>{importStatus.phase}</strong><span>{importStatus.detail}</span></div><button onClick={() => setImportStatus(null)} aria-label="Dismiss import status"><X /></button></div>}
      {task === "overview" && <EnglishOverview stage={stage} onTask={setTask} />}
      {task === "library" && (activeTest ? <ImportedTestPractice test={activeTest} onBack={() => setActiveTest(null)} /> : <TestLibrary tests={tests} onOpen={(test) => { setStage(test.stage); setActiveTest(test); }} onDelete={(id) => { void removeTest(id); }} onImport={() => fileRef.current?.click()} />)}
      {task === "cloze" && <ClozeExercise />}
      {task === "reading" && <ReadingExercise />}
      {task === "listening" && <ListeningExercise stage={stage} />}
      {task === "writing" && <WritingExercise stage={stage} />}
    </main>
  </div>;
}
