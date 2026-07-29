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

async function loadEnglishAiImport() {
  const source = (await text("app/lib/english-ai-import.ts")).replace(/^import type \{[\s\S]*?\} from "\.\/english-test";\n/, "");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

async function loadRecordSync() {
  const source = await text("app/lib/record-sync.ts");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

async function loadMedicalAiImport() {
  const source = (await text("app/lib/medical-ai-import.ts"))
    .replace(/^import type \{[\s\S]*?\} from "\.\/question-parser";\n/, "");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

async function loadBankGrouping() {
  const source = (await text("app/lib/bank-grouping.ts")).replace(/^import type .*?;\n/, "");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

async function loadQuestionParser() {
  const source = await text("app/lib/question-parser.ts");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

test("recovers medical questions from partially malformed AI JSON and applies 306 scoring", async () => {
  const {
    detectMedicalExamProfile,
    parseMedicalAiResponse,
    western306Metadata,
    western306Score,
  } = await loadMedicalAiImport();
  const malformed = `{"questions":[
    {"sourceNumber":"1","stem":"完整 A 型题","options":[{"label":"A","text":"甲"},{"label":"B","text":"乙"}],"answer":["A"]},
    {"sourceNumber":"2","stem":"损坏题","options":[{"label":"A","text":"甲"} "answer":["A"]},
    {"sourceNumber":"116","stem":"完整 B 型题","options":[{"label":"A","text":"甲"},{"label":"B","text":"乙"}],"answer":["B"],"sharedOptionGroup":"116-117"}
  ]}`;
  const profile = detectMedicalExamProfile("2025西综306考研真题+参考答案.pdf");
  const parsed = parseMedicalAiResponse(malformed, "西医综合", profile);

  assert.equal(profile, "western-medicine-306");
  assert.equal(parsed.questions.length, 2);
  assert.deepEqual(parsed.questions.map((question) => question.questionType), ["A", "B"]);
  assert.deepEqual(western306Metadata("136"), { questionType: "X", points: 2, multiple: true });
  const score = western306Score(parsed.questions, {
    [parsed.questions[0].id]: "correct",
    [parsed.questions[1].id]: "wrong",
  });
  assert.equal(score.earned, 1.5);
  assert.equal(score.total, 3);
  const lockedScore = western306Score(
    parsed.questions,
    { [parsed.questions[0].id]: "correct" },
    { [parsed.questions[0].id]: "wrong" },
  );
  assert.equal(lockedScore.earned, 0);
  assert.equal(lockedScore.answeredMaximum, 1.5);
  const fullPaper = Array.from({ length: 165 }, (_, index) => {
    const sourceNumber = String(index + 1);
    const metadata = western306Metadata(sourceNumber);
    return { id: sourceNumber, sourceNumber, answer: ["A"], options: [], stem: "", category: "", ...metadata };
  });
  assert.equal(western306Score(fullPaper, {}).total, 300);
});

test("understands modern and legacy 306 layouts without swallowing the 2024 stem", async () => {
  const { parseQuestionText } = await loadQuestionParser();
  const { detectWestern306Blueprint, parseMedicalAiResponse, western306Metadata } = await loadMedicalAiImport();
  const parsed = parseQuestionText(`2024N1A.在人体的自动控制系统中，由受控部分发出，到达控制部分的信息是
A.偏差信息
B.前馈信息
C.反馈信息
D.干扰信息
答案：C`, "2024年西医综合");
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].sourceNumber, "1");
  assert.equal(parsed[0].stem, "在人体的自动控制系统中，由受控部分发出，到达控制部分的信息是");
  assert.equal(parsed[0].options.length, 4);
  assert.equal(parsed[0].options[0].text, "偏差信息");
  assert.equal(parsed[0].questionType, "A");
  assert.equal(parsed[0].examYear, 2024);
  assert.equal(parsed[0].points, 1.5);

  const legacy = detectWestern306Blueprint("1994年考研西医综合真题_OCR.docx", "A型题 1-92\nB型题 93-118\nC型题 119-138\nX型题 139-160");
  assert.equal(legacy.format, "legacy-c-type");
  assert.equal(legacy.expectedQuestionCount, 160);
  assert.deepEqual(western306Metadata("120", legacy), { questionType: "C", points: undefined, multiple: false });
  const cType = parseMedicalAiResponse(
    `{"type":"question","sourceNumber":"120","questionType":"C","stem":"A.陈述甲；B.陈述乙","options":[{"label":"A","text":"仅A正确"},{"label":"B","text":"仅B正确"},{"label":"C","text":"两者均正确"},{"label":"D","text":"两者均不正确"}],"answer":["C"]}`,
    "1994西综",
    "western-medicine-306",
    { blueprint: legacy },
  );
  assert.equal(cType.questions[0].questionType, "C");
  assert.equal(cType.questions[0].multiple, false);
  assert.equal(cType.questions[0].examFormat, "legacy-c-type");
});

test("joins cross-page 306 seams, reconciles explicit source answers, and suggests bank groups", async () => {
  const { reconcileMedicalQuestionsWithSourceAnswers, splitWestern306SourceText } = await loadMedicalAiImport();
  const { suggestQuestionBankGroup } = await loadBankGrouping();
  const filler = "其他页内内容\n".repeat(1_200);
  const source = `[[PAGE 1]]
${filler}
137.属于生理性抗凝物质的有
[[PAGE 2]]
A.蛋白质C
B.组织因子途径抑制物
C.纤溶酶原激活物抑制物-1
D.肝素
【答案】ABD
138.下一题
A.甲
B.乙
【答案】A`;
  const chunks = splitWestern306SourceText(source, 7_200, 20);
  const seam = chunks.find((chunk) => chunk.includes("CROSS_PAGE_SEAM"));
  assert.ok(seam);
  assert.match(seam, /137\.属于生理性抗凝物质/);
  assert.match(seam, /【答案】ABD/);

  const question = {
    id: "q137",
    sourceNumber: "137",
    category: "2023西综306",
    stem: "属于生理性抗凝物质的有",
    options: ["A", "B", "C", "D"].map((label) => ({ label, text: label })),
    answer: [],
    multiple: true,
    questionType: "X",
  };
  const reconciled = reconcileMedicalQuestionsWithSourceAnswers([question], source);
  assert.deepEqual(reconciled.questions[0].answer, ["A", "B", "D"]);
  assert.equal(reconciled.reconciledCount, 1);
  assert.equal(suggestQuestionBankGroup("2025西综306考研真题", [question]), "考研西综306");
});

test("standardizes a nearly complete inline-answer 306 paper locally without AI", async () => {
  const { standardizeParsedWestern306Questions } = await loadMedicalAiImport();
  const missing = new Set([80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 163, 164, 165]);
  const parsed = Array.from({ length: 165 }, (_, index) => index + 1)
    .filter((number) => !missing.has(number))
    .map((number) => ({
      id: `q-${number}`,
      sourceNumber: String(number),
      category: "2025年306真题",
      stem: `第 ${number} 题`,
      options: ["A", "B", "C", "D"].map((label) => ({ label, text: `${label} 选项` })),
      answer: number >= 136 ? ["A", "C"] : ["B"],
      multiple: number >= 136,
    }));
  const result = standardizeParsedWestern306Questions(
    "2025年306真题.pdf",
    "2025年研究生考试（306西医综合）\nA型题 1-115\nB型题 116-135\nX型题 136-165",
    parsed,
  );

  assert.equal(result.usable, true);
  assert.equal(result.questions.length, 152);
  assert.equal(result.report.answeredCount, 152);
  assert.deepEqual(result.report.missingSourceNumbers, [...missing].map(String));
  assert.deepEqual(result.report.typeCounts, { A: 105, B: 20, C: 0, X: 27 });
  assert.equal(result.questions.find((question) => question.sourceNumber === "136")?.multiple, true);
});

test("imports inline-answer Word banks and chapter-scoped medical answer tables", async () => {
  const { parseQuestionText } = await loadQuestionParser();
  const inlineWord = parseQuestionText(`一、单选题
1．全科医学学科是：A
A 自二十世纪起源的临床专业
B 各专科的简单相加
C 仅提供住院服务
D 仅提供急诊服务
E 仅提供公共卫生服务
2．全科医疗的基本特征不包括：E
A 连续性服务
B 以人为中心
C 以社区为基础
D 以家庭为单位
E 仅提供家庭病床
判断题：
1．连续性照顾贯穿健康与疾病全过程。√
四、填空题
1．请填写概念____
六、问答题
1．请论述全科服务。`, "全科期末");
  assert.equal(inlineWord.length, 3);
  assert.deepEqual(inlineWord.map((question) => question.answer), [["A"], ["E"], ["A"]]);
  assert.deepEqual(inlineWord[2].options.map((option) => option.text), ["正确", "错误"]);

  const chapterBank = parseQuestionText(`第一章 总论
一、单选题（每题仅一个最佳答案）
1、正常范围是（ ）
A、0、2～0、4cm
B、0、5～0、8cm
C、1、0～1、5cm
D、1、6～2、0cm
2、首选检查是（ ）
A、CT
B、MRI
C、DR
D、DSA
二、多选题
1、属于数字影像的是（ ）
A、CT
B、MRI
C、DSA
D、CR
三、判断题
1、MRI使用电离辐射。（ ）
四、填空题
1、检查参数是____
六、问答题
1、简述检查原则。
总论 答案
一、单选题
1、A 2、B
二、多选题
1、ABCD
三、判断题
1、×`, "影像精品");
  assert.equal(chapterBank.length, 4);
  assert.deepEqual(chapterBank.map((question) => question.answer), [["A"], ["B"], ["A", "B", "C", "D"], ["B"]]);
  assert.equal(chapterBank[2].multiple, true);
  assert.equal(chapterBank[3].stem, "MRI使用电离辐射。");
  assert.ok(chapterBank.every((question) => question.answerSource?.includes("总论")));
});

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

  assert.match(layout, /title: "红豆生南国——练你所念，思你所想",/);
  assert.match(layout, /export const dynamic = "force-dynamic"/);
  assert.match(layout, /export const revalidate = 0/);
  assert.match(page, /题库已就位 🎉 此刻就是新起点，题海有岸，胜利正在装进口袋/);
  assert.match(page, /function SearchModal/);
  assert.match(page, /noteCount=\{Object\.values\(notes\)\.filter\(\(note\) => note\.trim\(\)\.length > 0\)\.length\}/);
  assert.match(page, /我的笔记\{noteCount > 0 && <em>\{noteCount\}<\/em>\}/);
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
  const [page, english, englishStore, fileImport, docRoute, search, aiImportRoute, medicalAiImport, emailRoute, styles] = await Promise.all([
    text("app/page.tsx"),
    text("app/components/EnglishLearningView.tsx"),
    text("app/lib/english-test.ts"),
    text("app/lib/file-import.ts"),
    text("app/api/extract-doc/route.ts"),
    text("app/lib/question-search.ts"),
    text("app/api/import-ai/route.ts"),
    text("app/lib/medical-ai-import.ts"),
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
  assert.match(medicalAiImport, /不得根据医学常识猜答案、改答案或补题/);
  assert.match(medicalAiImport, /答案表/);
  assert.match(medicalAiImport, /splitWestern306SourceText/);
  assert.match(medicalAiImport, /C 型题的 A\/B 是两条来源陈述/);
  assert.match(page, /西综 306 标准化工作台/);
  assert.match(page, /本地确定性识别/);
  assert.match(page, /AI 标准化超过了网页网关的等待时间/);
  assert.match(page, /现代 165 题 \/ 300 分结构/);
  assert.match(aiImportRoute, /Promise\.allSettled/);
  assert.match(aiImportRoute, /480_000/);
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
  const [localBank, page, shareRoute, styles, schema] = await Promise.all([
    text("app/lib/local-bank.ts"),
    text("app/page.tsx"),
    text("app/api/share-bank/route.ts"),
    text("app/globals.css"),
    text("db/init.sql"),
  ]);

  assert.match(localBank, /export async function listQuestionBanks/);
  assert.match(localBank, /export async function activateQuestionBank/);
  assert.match(localBank, /export async function renameQuestionBank/);
  assert.match(localBank, /export async function updateQuestionBankDetails/);
  assert.match(localBank, /export async function deleteQuestionBank/);
  assert.match(localBank, /description: typeof input\.description/);
  assert.match(localBank, /storedGroupName = normalizeQuestionBankGroup/);
  assert.match(localBank, /input\.groupName === undefined \? suggestQuestionBankGroup/);
  assert.match(localBank, /bank: \{ name: bank\.name, description: bank\.description, groupName: bank\.groupName, questions: bank\.questions \}/);
  assert.match(localBank, /hongdou-question-bank/);
  assert.match(localBank, /avecove-western-306/);
  assert.match(localBank, /multiple: question\.questionType === "X" \|\| answer\.length > 1/);
  assert.match(localBank, /Transparently migrate the single-bank format/);
  assert.match(localBank, /export async function loadQuestionBankGroupOrder/);
  assert.match(localBank, /export async function saveQuestionBankGroupOrder/);
  assert.match(localBank, /groupOrder: await loadQuestionBankGroupOrder\(\)/);
  assert.match(localBank, /Array\.isArray\(bundle\.groupOrder\)/);
  assert.match(page, /reconcileQuestionBankGroupOrder/);
  assert.match(page, /draggable onDragStart/);
  assert.match(page, /上移分组/);
  assert.match(page, /生成导入链接/);
  assert.match(page, /importBank/);
  assert.match(page, /function IncomingBankShareModal/);
  assert.match(shareRoute, /randomBytes\(24\)/);
  assert.match(shareRoute, /7 \* 24 \* 60 \* 60_000/);
  assert.match(shareRoute, /parseSharedQuestionBankPackage/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS shared_question_banks/);
  assert.match(styles, /\.bank-group-order/);
  assert.match(styles, /\.share-link-result/);
  assert.match(styles, /\.incoming-share-modal/);
});

test("persists in-practice question corrections into sync and shared banks", async () => {
  const [page, localBank, styles] = await Promise.all([
    text("app/page.tsx"),
    text("app/lib/local-bank.ts"),
    text("app/globals.css"),
  ]);

  assert.match(page, /function QuestionCorrectionModal/);
  assert.match(page, /修订题目与标准答案/);
  assert.match(page, /标准答案已模糊保护/);
  assert.match(page, /显示并修订答案/);
  assert.match(page, /const \[answerVisible, setAnswerVisible\] = useState\(false\)/);
  assert.match(page, /原文件答案可能受教材版本、指南更新或识别误差影响/);
  assert.match(page, /当前题库、多端同步与后续分享都会使用这个版本/);
  assert.match(page, /questions: replaceQuestion\(bank\.questions\)/);
  assert.match(page, /stampLearningRecord\(recordLedger, revisedQuestion\.id, \{ progress: revisedResult \}\)/);
  assert.match(localBank, /questions: bank\.questions/);
  assert.match(styles, /\.question-edit-modal/);
  assert.match(styles, /\.answer-edit-mask/);
  assert.match(styles, /filter:blur\(7px\)/);
  assert.match(styles, /\.answer-revision-warning/);
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
  assert.match(english, /function MatchingExercise/);
  assert.match(english, /function TranslationExercise/);
  assert.match(english, /Submit listening answer/);
  assert.match(english, /All three answers are correct/);
  assert.match(english, /Compare reference/);
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
  assert.match(english, /avecove-english-workspace-v1/);
  assert.match(english, /Your imported papers are still saved/);
  assert.match(english, /setStage\(storedStage \|\| items\[0\]\?\.stage \|\| "cet"\)/);
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

test("uses AI to pair English source and answer papers with exam-aware structure", async () => {
  const [english, englishStore, route, styles] = await Promise.all([
    text("app/components/EnglishLearningView.tsx"),
    text("app/lib/english-test.ts"),
    text("app/api/import-english-ai/route.ts"),
    text("app/globals.css"),
  ]);
  const { buildEnglishImportPrompt, parseEnglishAiResponse } = await loadEnglishAiImport();
  const input = {
    sourceFileName: "2025.06六级真题第1套.pdf",
    sourceText: "Part III Reading Comprehension\\nSection A\\nCampus volunteers were 26 by an environmental project.",
    answerFileName: "2025.06英语六级解析第1套.pdf",
    answerText: "26. J) intrigued\\n语法判断：此处需要形容词。\\n语义判断：intrigued 符合语境。",
    usedOcr: true,
  };
  const prompt = buildEnglishImportPrompt(input);

  assert.match(prompt, /canonical token \[\[questionNumber\]\]/);
  assert.match(prompt, /Section A is kind=word-bank, questions 26-35/);
  assert.match(prompt, /Preserve paragraphs A-N/);
  assert.match(prompt, /Part III as 'Part ID'/);
  assert.match(prompt, /Never infer or guess an answer/);
  assert.match(prompt, /section\.directions field/);
  assert.match(prompt, /companion answer\/analysis file/);

  const parsed = parseEnglishAiResponse(JSON.stringify({
    name: "2025.06 CET-6",
    stage: "cet",
    examVariant: "CET-6",
    warnings: [],
    sections: [{
      kind: "word-bank",
      title: "Reading Section A",
      part: "Part III · Section A",
      directions: "Read the passage and select one word for each blank.",
      passage: "Campus volunteers were [[26]] by an environmental project.",
      questions: [{
        number: "26",
        stem: "Blank 26",
        options: [{ label: "J", text: "intrigued" }, { label: "K", text: "isolated" }],
        answer: "J",
        explanation: "The analysis explicitly identifies intrigued.",
      }],
    }],
  }), input);

  assert.equal(parsed.aiImported, true);
  assert.equal(parsed.answerSourceName, input.answerFileName);
  assert.equal(parsed.sections[0].directions, "Read the passage and select one word for each blank.");
  assert.equal(parsed.sections[0].passage, "Campus volunteers were [[26]] by an environmental project.");
  assert.equal(parsed.sections[0].questions[0].answer, "J");
  assert.match(route, /buildEnglishImportPrompt/);
  assert.match(route, /English imports require AI/);
  assert.match(route, /personalAi/);
  assert.match(english, /Add the answer or analysis file\?/);
  assert.match(english, /No duplicate test/);
  assert.match(english, /replaceEnglishTestContent/);
  assert.match(english, /section\.kind === "cloze" \|\| section\.kind === "word-bank"/);
  assert.match(english, /hasCanonicalBlanks/);
  assert.match(english, /function DirectionsPanel/);
  assert.match(englishStore, /export async function extractEnglishSourceFile/);
  assert.match(englishStore, /export async function replaceEnglishTestContent/);
  assert.match(styles, /\.english-directions/);
  assert.match(styles, /\.english-answer-companion/);
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

test("keeps sync quiet and gives iPhone separate answer confirmation, next navigation, and drawer closing", async () => {
  const [page, localBank, englishStore, styles] = await Promise.all([
    text("app/page.tsx"),
    text("app/lib/local-bank.ts"),
    text("app/lib/english-test.ts"),
    text("app/globals.css"),
  ]);

  assert.match(page, /syncInFlightRef/);
  assert.match(page, /if \(showMessage\) \{\s*setManualSyncing\(true\)/);
  assert.match(page, /aria-label="立即手动同步"/);
  assert.match(page, /className="mobile-submit-bar"/);
  assert.match(page, /确认答案/);
  assert.match(page, /className="mobile-next"/);
  assert.doesNotMatch(page, /submitted \? <button className="mobile-next"/);
  assert.match(page, /aria-label="关闭学习区"/);
  assert.match(localBank, /current\.updatedAt >= candidate\.updatedAt/);
  assert.match(localBank, /activeBankId !== localActiveBankId/);
  assert.match(englishStore, /current\.updatedAt >= test\.updatedAt/);
  assert.match(styles, /\.sync-caption-row/);
  assert.match(styles, /\.mobile-submit-bar/);
  assert.match(styles, /\.quiz-bottom \.mobile-next/);
  assert.match(styles, /\.drawer-close\{position:fixed/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /touch-action:manipulation/);
});

test("keeps imported explanations separate and upgrades AI-assisted notes to searchable Markdown", async () => {
  const [page, explainRoute, medicalImport, styles] = await Promise.all([
    text("app/page.tsx"),
    text("app/api/explain/route.ts"),
    text("app/lib/medical-ai-import.ts"),
    text("app/globals.css"),
  ]);

  assert.match(page, /className="source-explanation"/);
  assert.match(page, /原资料解析/);
  assert.match(page, /current\.answerSource/);
  assert.match(page, /写入我的笔记/);
  assert.match(page, /Markdown 编辑/);
  assert.match(page, /function MarkdownNotePreview/);
  assert.match(page, /parseNoteTags/);
  assert.match(page, /搜索题目、来源、笔记正文或标签/);
  assert.match(page, /参考框架：第十版 人卫教材/);
  assert.match(explainRoute, /人民卫生出版社第十版医学教材/);
  assert.match(explainRoute, /不得伪造教材引文、页码、章节/);
  assert.match(explainRoute, /原资料解析/);
  assert.match(medicalImport, /必须忠实提取并整理该题对应的原文解析/);
  assert.match(styles, /\.source-explanation/);
  assert.match(styles, /\.markdown-note-preview/);
  assert.match(styles, /\.notes-tag-filter/);
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

test("locks the earliest 306 result while allowing current mastery to improve", async () => {
  const { mergeLearningRecords, normalizeLearningRecords, stampLearningRecord } = await loadRecordSync();
  const firstAttempt = stampLearningRecord({}, "q-306", { progress: "wrong", firstProgress: "wrong" }, 100);
  const reviewed = stampLearningRecord(firstAttempt, "q-306", { progress: "correct", firstProgress: "correct" }, 200);
  const local = normalizeLearningRecords({ ledger: reviewed });

  assert.equal(local.progress["q-306"], "correct");
  assert.equal(local.firstProgress["q-306"], "wrong");

  const otherDevice = stampLearningRecord({}, "q-306", { progress: "correct", firstProgress: "correct" }, 150);
  const merged = mergeLearningRecords(local, { ledger: otherDevice });
  assert.equal(merged.progress["q-306"], "correct");
  assert.equal(merged.firstProgress["q-306"], "wrong");
});

test("ships bounded random sessions, boundary reminders, and one-second toast dismissal", async () => {
  const [page, syncRoute, db] = await Promise.all([
    text("app/page.tsx"),
    text("app/api/sync/route.ts"),
    text("app/lib/server/db.ts"),
  ]);

  assert.match(page, /千里之行，始于足下/);
  assert.match(page, /完结撒花/);
  assert.match(page, /返回上一题时显示答案/);
  assert.match(page, /首次作答得分/);
  assert.match(page, /questionOrder: "random" \}, 20/);
  assert.match(page, /shuffleOptions: true \}, 100/);
  assert.match(page, /window\.setTimeout\(\(\) => closeRef\.current\(\), 1_000\)/);
  assert.doesNotMatch(page, /setTimeout\(\(\) => setToast\(""\)/);
  assert.match(syncRoute, /pg_advisory_xact_lock/);
  assert.match(syncRoute, /mergeLearningRecords/);
  assert.match(syncRoute, /recordLedger/);
  assert.match(db, /export async function withTransaction/);
});

test("ships the v1.1 restrained Spatial Bento interface without changing study flows", async () => {
  const [page, styles, packageJson, readme, readmeZh] = await Promise.all([
    text("app/page.tsx"),
    text("app/globals.css"),
    text("package.json"),
    text("README.md"),
    text("README-zh.md"),
  ]);

  assert.match(packageJson, /"version": "1\.1\.1"/);
  assert.match(readme, /Version `1\.1\.1`/);
  assert.match(readmeZh, /`1\.1\.0` 采用克制的 Spatial Bento/);
  assert.match(page, /className="home-bento"/);
  assert.match(page, /className="hero-card bento-hero"/);
  assert.match(page, /className="bento-progress-card"/);
  assert.match(page, /className="bento-library-card"/);
  assert.match(page, /className="bank-card-progress"/);
  assert.match(page, /className="import-stage-strip"/);
  assert.match(page, /className="import-workbench-grid"/);
  assert.match(page, /onClick=\{on306\}/);
  assert.match(styles, /\.home-bento\{[^}]*grid-template-columns:repeat\(12/);
  assert.match(styles, /\.bank-card-progress/);
  assert.match(styles, /\.spatial-import-modal/);
  assert.match(styles, /font-variant-numeric:tabular-nums lining-nums/);
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(packageJson, /framer-motion|tailwind/);
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
    "app/api/import-english-ai/route.ts",
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
  assert.match(exampleEnv, /SMTP_HOST=smtp\.qq\.com/);
  assert.match(exampleEnv, /SMTP_PASS=replace-with-qq-mail-smtp-authorization-code/);
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
