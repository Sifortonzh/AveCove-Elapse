import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), "utf8");
}

async function loadEnglishParser() {
  const source = (await text("app/lib/english-test.ts")).replace(/^import .*?;\n/, "");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

async function loadRecordSync() {
  const source = await text("app/lib/record-sync.ts");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

test("ships a small, clearly labelled demo bank", async () => {
  const questions = JSON.parse(await text("app/questions.json"));

  assert.equal(questions.length, 8);
  assert.ok(questions.every((question) => question.category === "演示题库"));
  assert.ok(questions.every((question) => question.id.startsWith("demo-")));
  assert.ok(questions.some((question) => question.multiple === false));
  assert.ok(questions.some((question) => question.multiple === true));
  assert.ok(questions.every((question) => question.answer.length > 0));
});

test("includes the requested product flows and copy", async () => {
  const [page, layout, styles, explainRoute, auth] = await Promise.all([
    text("app/page.tsx"),
    text("app/layout.tsx"),
    text("app/globals.css"),
    text("app/api/explain/route.ts"),
    text("app/lib/server/auth.ts"),
  ]);

  assert.match(layout, /title: "红豆生南国",/);
  assert.match(layout, /export const dynamic = "force-dynamic"/);
  assert.match(layout, /export const revalidate = 0/);
  assert.match(page, /题库已就位 🎉 此刻就是新起点，题海有岸，胜利正在装进口袋/);
  assert.match(page, /function SearchModal/);
  assert.match(page, /版权、免责声明与用户协议/);
  assert.match(page, /重要免责声明与权利义务提示/);
  assert.match(page, /你保证对上传、导入、发布或分享的内容拥有合法权利或充分授权/);
  assert.match(page, /不得导入患者姓名、住院号、身份证号/);
  assert.match(page, /本协议不排除或限制依法不得排除的责任/);
  assert.match(page, /正式上线前，站点运营者必须公布有效的版权与隐私联系邮箱/);
  assert.match(styles, /Copyright, disclaimer, and responsible-use agreement/);
  assert.match(page, /同学讨论/);
  assert.match(page, /云端共享 · 有审核/);
  assert.match(page, /学号只生成不可逆的同步标识/);
  assert.match(page, /邮箱验证码/);
  assert.match(page, /导出学习记录/);
  assert.match(page, /askFollowUp/);
  assert.match(page, /知微/);
  assert.doesNotMatch(page, /红豆伴学/);
  assert.doesNotMatch(page, /AI我在/);
  assert.match(page, /const homeQuotes/);
  assert.match(page, /不存原始学号/);
  assert.match(page, /自定义AI/);
  assert.match(page, /\.docx \/ PDF 本机处理 · 旧 \.doc 仅内存转换/);
  assert.match(page, /function QuestionBankPage/);
  assert.match(page, /function ResetBankProgressModal/);
  assert.match(page, /请谨慎操作：清空后无法撤销/);
  assert.match(page, /题库本身仍然保留/);
  assert.match(page, /编辑题库名称与简介/);
  assert.match(page, /题库简介/);
  assert.match(page, /展开全文/);
  assert.match(page, /全局搜索：题库名、疾病、症状或知识点/);
  assert.match(page, /分享之前，请先确认版权与隐私边界/);
  assert.match(page, /仅做单选/);
  assert.match(page, /单选＋多选/);
  assert.match(page, /active\.questionTypes === "single" && question\.multiple/);
  assert.match(page, /multiple accept="\.doc,\.docx,\.pdf,\.json,application\/msword,application\/json"/);
  assert.match(page, /function AiImportFallbackModal/);
  assert.match(page, /答对后 0\.7 秒进入下一题/);
  assert.match(styles, /Independent desktop scroll regions/);
  assert.match(styles, /\.home-sidebar\{[^}]*overflow-y:auto/);
  assert.match(styles, /\.home-quote\{[^}]*backdrop-filter:blur/);
  assert.match(styles, /--type-serif:serif/);
  assert.match(styles, /--text-base:14pt/);
  assert.match(styles, /font-family:var\(--type-serif\)!important/);
  assert.match(styles, /\.top-actions \.profile\{[^}]*background:var\(--green\)/);
  assert.match(explainRoute, /followUp/);
  assert.match(explainRoute, /history/);
  assert.match(explainRoute, /AI_DAILY_LIMIT/);
  assert.match(auth, /createHmac/);
  assert.doesNotMatch(auth, /studentId.*INSERT/i);
});

test("supports legacy Word, batch imports, timeouts, and opt-in AI answer recognition", async () => {
  const [page, english, englishStore, fileImport, docRoute, search, aiImportRoute, emailRoute, styles] = await Promise.all([
    text("app/page.tsx"),
    text("app/components/EnglishLearningView.tsx"),
    text("app/lib/english-test.ts"),
    text("app/lib/file-import.ts"),
    text("app/api/extract-doc/route.ts"),
    text("app/lib/question-search.ts"),
    text("app/api/import-ai/route.ts"),
    text("app/api/auth/email-code/route.ts"),
    text("app/globals.css"),
  ]);

  assert.match(fileImport, /class QuestionRecognitionError/);
  assert.match(fileImport, /extractedText/);
  assert.match(fileImport, /extension === "doc"/);
  assert.match(fileImport, /fetch\("\/api\/extract-doc"/);
  assert.match(fileImport, /pagesToOcr/);
  assert.match(fileImport, /pdfPageNeedsOcr/);
  assert.match(fileImport, /enhanceOcrCanvas/);
  assert.match(fileImport, /chi_sim", "eng/);
  assert.match(fileImport, /user_defined_dpi: "300"/);
  assert.match(fileImport, /rotateAuto: true/);
  assert.match(fileImport, /signal\?: AbortSignal/);
  assert.match(fileImport, /mergedTexts\[pageNumber - 1\]/);
  assert.match(page, /取消当前导入/);
  assert.match(page, /importAbortRef/);
  assert.match(page, /onTimeout: \(\) => fileController\.abort\(\)/);
  assert.match(page, /status: "cancelled"/);
  assert.match(english, /Cancel/);
  assert.match(english, /importControllerRef/);
  assert.match(english, /timedOut = true/);
  assert.match(englishStore, /extractEnglishTestFile\(file: File, onUpdate: \(update: ImportUpdate\) => void, signal\?: AbortSignal\)/);
  assert.match(docRoute, /OLE_SIGNATURE/);
  assert.match(docRoute, /MAX_DOC_BYTES/);
  assert.match(docRoute, /word-extractor/);
  assert.match(docRoute, /"Cache-Control": "no-store"/);
  assert.match(search, /export function searchQuestionBanks/);
  assert.match(search, /bankName === term \? 220 : 130/);
  assert.match(search, /options\.some/);
  assert.match(styles, /\.search-highlight/);
  assert.match(styles, /\.search-result-location/);
  assert.match(aiImportRoute, /只能采用文件明确提供的答案，不得自行推测/);
  assert.match(aiImportRoute, /答案表/);
  assert.match(emailRoute, /垃圾邮件 \/ Spam 文件夹/);
});

test("tests personal and public AI connections without exposing saved keys", async () => {
  const [personalPage, adminPage, personalRoute, adminRoute, providers, styles] = await Promise.all([
    text("app/custom-ai/page.tsx"),
    text("app/admin/ai/page.tsx"),
    text("app/api/ai-test/route.ts"),
    text("app/api/admin/ai-config/route.ts"),
    text("app/lib/server/ai-providers.ts"),
    text("app/globals.css"),
  ]);

  assert.match(personalPage, /测试连接/);
  assert.match(personalPage, /\/api\/ai-test/);
  assert.match(adminPage, /测试连接/);
  assert.match(adminPage, /method: "POST"/);
  assert.match(personalRoute, /resolvePersonalAiConfig/);
  assert.match(personalRoute, /20_000/);
  assert.match(adminRoute, /export async function POST/);
  assert.match(adminRoute, /当前厂商没有可复用的已保存密钥/);
  assert.match(providers, /signal\?: AbortSignal/);
  assert.match(providers, /signal: options\.signal/);
  assert.match(styles, /\.personal-ai-test/);
  assert.match(styles, /\.dark \.privacy-icon/);
  assert.match(styles, /\.dark \.privacy-tags span/);
});

test("keeps multiple imported banks and portable share files", async () => {
  const localBank = await text("app/lib/local-bank.ts");

  assert.match(localBank, /export async function listQuestionBanks/);
  assert.match(localBank, /export async function activateQuestionBank/);
  assert.match(localBank, /export async function renameQuestionBank/);
  assert.match(localBank, /export async function updateQuestionBankDetails/);
  assert.match(localBank, /export async function deleteQuestionBank/);
  assert.match(localBank, /description: typeof input\.description/);
  assert.match(localBank, /bank: \{ name: bank\.name, description: bank\.description, questions: bank\.questions \}/);
  assert.match(localBank, /hongdou-question-bank/);
  assert.match(localBank, /multiple: answer\.length > 1/);
  assert.match(localBank, /Transparently migrate the single-bank format/);
});

test("ships an isolated, responsive English learning demo", async () => {
  const [page, english, englishStore, englishPractice, styles, layout] = await Promise.all([
    text("app/page.tsx"),
    text("app/components/EnglishLearningView.tsx"),
    text("app/lib/english-test.ts"),
    text("app/lib/english-practice.ts"),
    text("app/globals.css"),
    text("app/layout.tsx"),
  ]);

  assert.match(page, /English Learning/);
  assert.match(page, /learningMode === "english"/);
  assert.match(page, /avecove-learning-mode/);
  assert.match(english, /CET-4 \/ CET-6/);
  assert.match(english, /National entrance exam/);
  assert.match(english, /IELTS/);
  assert.match(english, /TOEFL/);
  assert.match(english, /function ClozeExercise/);
  assert.match(english, /function ImportedClozePractice/);
  assert.match(english, /function ImportedMatchingPractice/);
  assert.match(english, /Paragraph Matching · Answer Order/);
  assert.match(english, /The malformed OCR passage is hidden/);
  assert.match(english, /sanitizeEnglishPassage/);
  assert.match(english, /function ReadingExercise/);
  assert.match(english, /READING · PASSAGE A/);
  assert.doesNotMatch(english, /READING · PASSAGE 01/);
  assert.match(english, /function importedReadingLabel/);
  assert.match(english, /function ListeningExercise/);
  assert.match(english, /function WritingExercise/);
  assert.match(english, /AveCove Elapse/);
  assert.doesNotMatch(english, /<strong>Red Bean<\/strong>/);
  assert.match(english, /Click any English word for an instant meaning/);
  assert.match(english, /function InteractivePassage/);
  assert.match(english, /annotation-layer/);
  assert.match(english, /CLICK-TO-TRANSLATE/);
  assert.match(english, /Add to wordbook/);
  assert.match(english, /avecove-english-vocabulary-v1/);
  assert.match(english, /Why B\?/);
  assert.match(english, /QR RESOURCE DETECTED/);
  assert.match(english, /type="file" multiple/);
  assert.match(english, /Test Library/);
  assert.match(english, /const stageTests = tests\.filter/);
  assert.match(english, /setTask\("library"\)/);
  assert.match(english, /sidebarCollapsed/);
  assert.match(english, /PanelLeftClose/);
  assert.match(english, /href="\/custom-ai"/);
  assert.match(english, /Rename/);
  assert.match(english, /Reset practice record/);
  assert.match(english, /Respect copyright and protect privacy/);
  assert.match(englishPractice, /avecove-english-practice-v1/);
  assert.match(english, /format: "avecove-english-test-v1"/);
  assert.match(english, /extractEnglishTestFile/);
  assert.match(english, /hongdou-logo\.png/);
  assert.match(english, /openBlank === id/);
  assert.match(styles, /\.cloze-blank\.open:not\(\.answered\)/);
  assert.match(styles, /\.imported-cloze-card/);
  assert.match(styles, /\.test-library-grid/);
  assert.match(styles, /\.english-library-action-modal/);
  assert.match(styles, /\.english-shell\.sidebar-collapsed/);
  assert.match(styles, /\.imported-matching-practice/);
  assert.match(styles, /English PC\/Mac and iPad primary layout/);
  assert.match(styles, /iPhone and compact mobile layout/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(layout, /viewportFit: "cover"/);
  assert.match(englishStore, /export async function renameEnglishTest/);
  assert.match(englishStore, /extension === "json"/);
});

test("syncs imported libraries and practice records with system theme and iPad-safe ink", async () => {
  const [page, route, localBank, englishStore, englishPractice, englishView, styles] = await Promise.all([
    text("app/page.tsx"),
    text("app/api/sync/route.ts"),
    text("app/lib/local-bank.ts"),
    text("app/lib/english-test.ts"),
    text("app/lib/english-practice.ts"),
    text("app/components/EnglishLearningView.tsx"),
    text("app/globals.css"),
  ]);

  assert.match(page, /questionBanks: questionBanksBundle/);
  assert.match(page, /englishPractice: exportEnglishPracticeSyncBundle/);
  assert.match(page, /matchMedia\("\(prefers-color-scheme: dark\)"\)/);
  assert.match(page, /themeMode: "system"/);
  assert.match(route, /"questionBanks", "englishTests", "englishPractice"/);
  assert.match(route, /12_000_000/);
  assert.match(localBank, /exportQuestionBankSyncBundle/);
  assert.match(localBank, /mergeQuestionBankSyncBundle/);
  assert.match(englishStore, /exportEnglishTestSyncBundle/);
  assert.match(englishStore, /mergeEnglishTestSyncBundle/);
  assert.match(englishPractice, /exportEnglishPracticeSyncBundle/);
  assert.match(englishPractice, /mergeEnglishPracticeSyncBundle/);
  assert.match(englishView, /event\.pointerType === "touch"/);
  assert.match(styles, /\.annotation-layer\.active\{touch-action:pan-y pinch-zoom/);
  assert.match(styles, /\.top-actions \.profile\{display:grid!important/);
  assert.match(styles, /\.english-product\.dark/);
});

test("merges per-question practice records across devices without stale overwrites", async () => {
  const { learningRecordsEqual, mergeLearningRecords, stampLearningRecord } = await loadRecordSync();
  const ipadLedger = stampLearningRecord({}, "q-ipad", { progress: "wrong", favorite: true, note: "复盘重点" }, 200);
  const macLedger = stampLearningRecord({}, "q-mac", { progress: "correct" }, 300);
  const merged = mergeLearningRecords(
    { progress: { "q-ipad": "wrong" }, favorites: ["q-ipad"], notes: { "q-ipad": "复盘重点" }, ledger: ipadLedger },
    { progress: { "q-mac": "correct" }, favorites: [], notes: {}, ledger: macLedger },
  );

  assert.deepEqual(merged.progress, { "q-ipad": "wrong", "q-mac": "correct" });
  assert.deepEqual(merged.favorites, ["q-ipad"]);
  assert.deepEqual(merged.notes, { "q-ipad": "复盘重点" });
  assert.equal(learningRecordsEqual(merged, { ...merged, favorites: [...merged.favorites].reverse() }), true);

  const resetLedger = stampLearningRecord(merged.ledger, "q-ipad", { progress: null, favorite: false, note: null }, 500);
  const afterReset = mergeLearningRecords(merged, { ledger: resetLedger });
  assert.deepEqual(afterReset.progress, { "q-mac": "correct" });
  assert.deepEqual(afterReset.favorites, []);
  assert.deepEqual(afterReset.notes, {});
  assert.equal(learningRecordsEqual(merged, afterReset), false);
});

test("ships bounded random sessions, boundary reminders, and one-second toast dismissal", async () => {
  const [page, syncRoute, db] = await Promise.all([
    text("app/page.tsx"),
    text("app/api/sync/route.ts"),
    text("app/lib/server/db.ts"),
  ]);

  assert.match(page, /千里之行，始于足下/);
  assert.match(page, /完结撒花/);
  assert.match(page, /questionOrder: "random" \}, 20/);
  assert.match(page, /shuffleOptions: true \}, 100/);
  assert.match(page, /window\.setTimeout\(\(\) => closeRef\.current\(\), 1_000\)/);
  assert.doesNotMatch(page, /setTimeout\(\(\) => setToast\(""\)/);
  assert.match(syncRoute, /pg_advisory_xact_lock/);
  assert.match(syncRoute, /mergeLearningRecords/);
  assert.match(syncRoute, /recordLedger/);
  assert.match(db, /export async function withTransaction/);
});

test("reimports a portable English Test Library share file", async () => {
  const { extractEnglishTestFile } = await loadEnglishParser();
  const shared = {
    format: "avecove-english-test-v1",
    test: {
      name: "Shared CET reading",
      stage: "cet",
      examVariant: "CET-6",
      usedOcr: false,
      sections: [{ id: "reading-a", kind: "reading", title: "Text 1", passage: "A short passage.", questions: [] }],
    },
  };
  const parsed = await extractEnglishTestFile(new File([JSON.stringify(shared)], "shared.avecove-english.json", { type: "application/json" }), () => {});

  assert.equal(parsed.name, "Shared CET reading");
  assert.equal(parsed.examVariant, "CET-6");
  assert.equal(parsed.sourceFormat, "json");
  assert.equal(parsed.sections[0].kind, "reading");
});

test("classifies the current postgraduate English I paper structure", async () => {
  const { parseEnglishTestText, sanitizeEnglishPassage } = await loadEnglishParser();
  const sample = `2025年全国硕士研究生招生考试英语（一）真题
Section I Use of English
Directions: Read the text. The city is 1 to storms and 2 below the sea.
1 [A] alien [B] prone [C] late [D] quiet
2 [A] briefly [B] loudly [C] gradually [D] rarely
Section II Reading Comprehension
Part A
Text 1
The passage explains a research result.
21.What is the main idea?
[A] One [B] Two [C] Three [D] Four
Part B
Directions: For Questions 41-45, choose paragraphs A-G. Paragraph F and G have been placed.
[A] Paragraph alpha.
[B] Paragraph beta.
[C] Paragraph gamma.
[D] Paragraph delta.
[E] Paragraph epsilon.
[F] Paragraph fixed one.
[G] Paragraph fixed two.
Section III Translation
Directions: Translate the underlined segments.
(46) Citizen science creates wider participation.
Section IV Writing
Part A
51. Directions: Reply to your classmate.
Part B
52. Directions: Describe the chart.
2025年英语（一）真题解析
Section I Use of English
1.【答案】B
【解析】The context requires the phrase prone to.
2.【答案】C
【解析】The adverb describes a slow change.
21.【答案】D
【解析】The final option summarizes the passage.
41.【答案】A
42.【答案】B
43.【答案】C
44.【答案】D
45.【答案】E`;
  const parsed = parseEnglishTestText(sample, "2025-postgraduate-english-I.pdf");

  assert.equal(parsed.stage, "postgraduate");
  assert.deepEqual(parsed.sections.map((section) => section.kind), ["cloze", "reading", "matching", "translation", "writing", "writing"]);
  assert.equal(parsed.sections[0].questions.length, 2);
  assert.doesNotMatch(parsed.sections[0].passage, /Directions?:/i);
  assert.match(parsed.sections[0].passage, /The city is 1 to storms/);
  parsed.sections.filter((section) => section.kind !== "writing").forEach((section) => assert.doesNotMatch(section.passage, /Directions?:/i));
  assert.equal(parsed.sections[0].questions[0].answer, "B");
  assert.match(parsed.sections[0].questions[0].explanation, /prone to/);
  assert.equal(parsed.sections[1].questions[0].number, "21");
  assert.equal(parsed.sections[2].questions.length, 5);
  assert.deepEqual(parsed.sections[2].questions[0].options.map((option) => option.label), ["A", "B", "C", "D", "E"]);
  assert.equal(parsed.sections[3].questions[0].number, "46");
  assert.doesNotMatch(parsed.sections.at(-1).passage, /【答案】/);
  assert.equal(sanitizeEnglishPassage("Directions: Read the following text. Choose the best word and mark A, B, C or D on ANSWER SHEET 1. (10 points) Located below the sea."), "Located below the sea.");
});

test("classifies the current CET-6 writing, listening, reading, and translation structure", async () => {
  const { parseEnglishTestText } = await loadEnglishParser();
  const sample = `2025年6月六级真题
Part I Writing
Write an essay about career preparation.
Part II Listening Comprehension
Section A
Conversation One
M: A computer needs repair. [1]
1. What did the woman do?
A) She waited.
B) She left.
C) She called the company.
D) She repaired it.
解析：故选C
Part III Reading Comprehension
Section A
Campus volunteers were [26] by an environmental project.
A) aesthetic B) chronic C) emissions D) intrigued E) outlet
答案详解
26. D) intrigued
Section B
A) Libraries connect neighbours. [36]
B) Libraries provide free courses. [37]
答案详解
36. 题干译文 People build connections in libraries. 答案解析 A.
37. 题干译文 Libraries offer learning opportunities. 答案解析 B.
Section C
Passage One
Attendance reflects wider social problems.
46. What does chronic absence indicate?
A) A minor issue.
B) Wider hardship.
C) Better instruction.
D) More holidays.
解析：故选B
Part IV Translation
请将以下关于中国天宫空间站的段落译成英语。`;
  const parsed = parseEnglishTestText(sample, "2025.06-CET6.pdf");

  assert.equal(parsed.stage, "cet");
  assert.equal(parsed.examVariant, "CET-6");
  assert.deepEqual(parsed.sections.map((section) => section.kind), ["writing", "listening", "word-bank", "long-reading", "reading", "translation"]);
  assert.equal(parsed.sections[1].questions[0].answer, "C");
  assert.equal(parsed.sections[2].questions.length, 10);
  assert.equal(parsed.sections[2].questions[0].number, "26");
  assert.equal(parsed.sections[2].questions[0].answer, "D");
  assert.deepEqual(parsed.sections[2].questions[0].options.map((option) => option.label), ["A", "B", "C", "D", "E"]);
  assert.equal(parsed.sections[3].questions.length, 10);
  assert.equal(parsed.sections[3].questions[0].answer, "A");
  assert.doesNotMatch(parsed.sections[3].questions[0].stem, /^题干译文/);
  assert.equal(parsed.sections[4].questions[0].number, "46");
  assert.equal(parsed.sections[4].questions[0].answer, "B");
  assert.match(parsed.sections[5].title, /Chinese to English/);
});

test("separates personal BYOK AI from administrator-wide AI", async () => {
  const [page, personalPage, personalStore, explainRoute, importRoute, providers, adminPage, testRoute] = await Promise.all([
    text("app/page.tsx"),
    text("app/custom-ai/page.tsx"),
    text("app/lib/personal-ai.ts"),
    text("app/api/explain/route.ts"),
    text("app/api/import-ai/route.ts"),
    text("app/lib/server/ai-providers.ts"),
    text("app/admin/ai/page.tsx"),
    text("app/api/ai-test/route.ts"),
  ]);

  assert.doesNotMatch(personalPage, /adminKey/);
  assert.match(personalPage, /不需要管理员批准/);
  assert.match(personalPage, /配置保存在此浏览器/);
  assert.match(personalPage, /连接成功.*已自动保存/);
  assert.match(personalStore, /localStorage/);
  assert.match(page, /readPersonalAiConfig/);
  assert.match(explainRoute, /personalAi/);
  assert.match(importRoute, /personalAi/);
  assert.match(providers, /resolvePersonalAiConfig/);
  assert.match(providers, /publicAiErrorMessage/);
  assert.match(providers, /readProviderPayload/);
  assert.match(explainRoute, /45_000/);
  assert.match(testRoute, /publicAiErrorMessage/);
  assert.match(providers, /provider\.id === "custom"/);
  assert.match(adminPage, /公共 AI 配置/);
});

test("ships shared data, moderation, branding, and deployment material", async () => {
  const requiredFiles = [
    "public/hongdou-logo.png",
    "public/hongdou-share.png",
    "Dockerfile",
    "docker-compose.yml",
    "Caddyfile",
    ".env.example",
    "COPYRIGHT.md",
    "TERMS.md",
    "QUESTION_SOURCES.md",
    "SECURITY.md",
    "db/init.sql",
    "app/api/sync/route.ts",
    "app/api/comments/route.ts",
    "app/api/admin/comments/route.ts",
    "app/api/admin/ai-config/route.ts",
    "app/api/import-ai/route.ts",
    "app/admin/page.tsx",
    "app/admin/ai/page.tsx",
    "app/custom-ai/page.tsx",
    "app/lib/server/ai-providers.ts",
    "app/lib/ai-catalog.ts",
    "app/lib/server/secrets.ts",
    "scripts/backup.sh",
    "scripts/restore.sh",
    ".github/workflows/ci.yml",
    ".github/workflows/deploy.yml",
    "docs/部署与上线指南.md",
    "docs/上线检查清单.md",
    "docs/数据与隐私说明.md",
    "README-zh.md",
  ];

  await Promise.all(requiredFiles.map((path) => access(new URL(path, root))));

  const [compose, caddy, exampleEnv, guide, schema, readme, readmeZh, terms] = await Promise.all([
    text("docker-compose.yml"),
    text("Caddyfile"),
    text(".env.example"),
    text("docs/部署与上线指南.md"),
    text("db/init.sql"),
    text("README.md"),
    text("README-zh.md"),
    text("TERMS.md"),
  ]);

  assert.match(compose, /env_file:\s*\.env/);
  assert.match(compose, /127\.0\.0\.1:3011:3000/);
  assert.match(compose, /profiles: \["caddy"\]/);
  assert.match(compose, /postgres:16-alpine/);
  assert.match(exampleEnv, /OPENAI_API_KEY/);
  assert.match(exampleEnv, /CONFIG_ENCRYPTION_KEY/);
  assert.match(exampleEnv, /SYNC_SECRET/);
  assert.match(exampleEnv, /SMTP_HOST/);
  assert.match(caddy, /reverse_proxy/);
  assert.match(guide, /Docker/);
  assert.match(guide, /HTTPS/);
  assert.match(guide, /GitHub/);
  assert.match(readme, /href="README-zh\.md">简体中文/);
  assert.match(readme, /## Production deployment with Docker and Caddy/);
  assert.match(readmeZh, /href="README\.md">English/);
  assert.match(readmeZh, /## Docker 与 Caddy 公网部署/);
  assert.match(readme, /disclaimer and responsible-use terms/);
  assert.match(readmeZh, /免责声明与使用协议/);
  assert.match(terms, /内容权利保证与版权保护/);
  assert.match(terms, /不排除或限制依法不得排除的责任/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS learning_states/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS comment_reports/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS app_settings/);
});
