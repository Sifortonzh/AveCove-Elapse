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

  assert.match(layout, /红豆生南国｜医学知识训练与复盘/);
  assert.match(page, /题库已就位 🎉 此刻就是新起点，题海有岸，胜利正在装进口袋/);
  assert.match(page, /function SearchModal/);
  assert.match(page, /版权与使用说明/);
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

test("ships shared data, moderation, branding, and deployment material", async () => {
  const requiredFiles = [
    "public/hongdou-logo.png",
    "public/hongdou-share.png",
    "Dockerfile",
    "docker-compose.yml",
    "Caddyfile",
    ".env.example",
    "COPYRIGHT.md",
    "QUESTION_SOURCES.md",
    "SECURITY.md",
    "db/init.sql",
    "app/api/sync/route.ts",
    "app/api/comments/route.ts",
    "app/api/admin/comments/route.ts",
    "app/api/admin/ai-config/route.ts",
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
  ];

  await Promise.all(requiredFiles.map((path) => access(new URL(path, root))));

  const [compose, caddy, exampleEnv, guide, schema] = await Promise.all([
    text("docker-compose.yml"),
    text("Caddyfile"),
    text(".env.example"),
    text("docs/部署与上线指南.md"),
    text("db/init.sql"),
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
  assert.match(schema, /CREATE TABLE IF NOT EXISTS learning_states/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS comment_reports/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS app_settings/);
});
