import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), "utf8");
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
  assert.match(page, /function QuestionBankPage/);
  assert.match(page, /function ResetBankProgressModal/);
  assert.match(page, /请谨慎操作：清空后无法撤销/);
  assert.match(page, /题库本身仍然保留/);
  assert.match(page, /全局搜索：题库名、疾病、症状或知识点/);
  assert.match(page, /分享之前，请先确认版权与隐私边界/);
  assert.match(page, /仅做单选/);
  assert.match(page, /单选＋多选/);
  assert.match(page, /active\.questionTypes === "single" && question\.multiple/);
  assert.match(page, /multiple accept="\.docx,\.pdf,\.json,application\/json"/);
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

test("supports batch imports, timeouts, and opt-in AI answer recognition", async () => {
  const [fileImport, aiImportRoute, emailRoute] = await Promise.all([
    text("app/lib/file-import.ts"),
    text("app/api/import-ai/route.ts"),
    text("app/api/auth/email-code/route.ts"),
  ]);

  assert.match(fileImport, /class QuestionRecognitionError/);
  assert.match(fileImport, /extractedText/);
  assert.match(aiImportRoute, /只能采用文件明确提供的答案，不得自行推测/);
  assert.match(aiImportRoute, /答案表/);
  assert.match(emailRoute, /垃圾邮件 \/ Spam 文件夹/);
});

test("keeps multiple imported banks and portable share files", async () => {
  const localBank = await text("app/lib/local-bank.ts");

  assert.match(localBank, /export async function listQuestionBanks/);
  assert.match(localBank, /export async function activateQuestionBank/);
  assert.match(localBank, /export async function renameQuestionBank/);
  assert.match(localBank, /export async function deleteQuestionBank/);
  assert.match(localBank, /hongdou-question-bank/);
  assert.match(localBank, /multiple: answer\.length > 1/);
  assert.match(localBank, /Transparently migrate the single-bank format/);
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
