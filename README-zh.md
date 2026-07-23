# AveCove Elapse · 红豆生南国

<p align="center">
  <img src="public/hongdou-logo.png" width="108" alt="红豆生南国蛇形医学标识" />
</p>

<p align="center">
  一款现代、无广告、可自行部署的题库训练、复盘与 AI 辅学工作台。
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="docs/部署与上线指南.md">部署指南</a> ·
  <a href="docs/上线检查清单.md">上线检查清单</a> ·
  <a href="SECURITY.md">安全说明</a> ·
  <a href="COPYRIGHT.md">版权说明</a>
</p>

<p align="center">
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-111111?logo=nextdotjs" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-087ea4?logo=react&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white" />
  <img alt="PostgreSQL 16" src="https://img.shields.io/badge/PostgreSQL-16-4169e1?logo=postgresql&logoColor=white" />
  <img alt="Docker" src="https://img.shields.io/badge/Docker-ready-2496ed?logo=docker&logoColor=white" />
</p>

<p align="center">
  <img src="public/hongdou-share.png" width="900" alt="红豆生南国项目预览" />
</p>

## 项目简介

AveCove Elapse 是“红豆生南国”刷题网页的独立、可自行部署版本，目前首先面向医学学习场景。

它可以把个人 Word、PDF 等学习资料整理成可持续使用的题库书架，并提供单选与多选练习、错题复盘、收藏、笔记、可选 AI 解析、轻量多端学习状态同步和带审核机制的讨论区。

项目不依赖广告变现，不要求手机号或微信登录。学号只用于生成不可逆的同步标识，原始学号不会写入数据库；邮箱仅在用户主动绑定时用于验证码登录和评论身份保护。

> 当前版本线：`0.8.x` 预览版。项目只内置 8 道演示题，不包含完整儿科学课程题库或其他受版权保护的商业题库。

## 为什么做这个项目

- **题库属于使用者。** 可以导入自己的 `.doc`、`.docx`、PDF、扫描 PDF 或 `.hongdou.json` 分享题库。
- **本地优先。** `.docx` 与 PDF 默认在浏览器内解析；旧版 `.doc` 仅在自托管服务器内存中提取文字，原文件不落盘。
- **真正的题库书架。** 每次导入都会保留，可切换、重命名、全局搜索、分享、删除和单独重置学习记录。
- **AI 边界透明。** AI 不是强制功能；普通识别失败时，只有得到用户明确同意，才会把已提取文字发送给所配置的 AI 厂商。
- **适合医学学习。** AI 内容与公开讨论均明确标注为学习辅助，不替代教材、指南、执业判断或临床诊疗。
- **适合自己部署。** 已准备 PostgreSQL、Docker Compose、Caddy HTTPS、健康检查、备份恢复脚本和 GitHub Actions。
- **不绑定单一 AI 厂商。** 同时支持国内外厂商及自定义兼容接口。
- **身份信息更克制。** 不要求手机号，也不依赖微信等社交平台账户。

## 功能总览

### 我的题库

- 一次选择或拖入多个文件，逐个导入。
- 支持旧版 `.doc`、新版 `.docx`、文字型 PDF、扫描 PDF 浏览器 OCR，以及红豆题库分享文件。
- 每个文件分别显示等待、处理中、成功、待 AI、失败和超时状态。
- 成功导入后自动保存在浏览器 IndexedDB 中。
- 在多份题库之间切换，不清除其他题库的学习记录。
- 支持编辑题库名称和最多 4000 字的多行简介，可填写范围、章节目录、来源与使用说明；长简介在“我的题库”中默认折叠。
- 支持删除已导入题库。
- 跨全部本地题库搜索题干、选项、分类、原题号和题库名称，按相关度排序并高亮关键词。
- 分享前显示版权与隐私确认，可将题库简介一并写入便携的 `.hongdou.json` 文件。
- 支持单独重置某一题库的已答记录、错题状态、收藏和笔记；重置前显示影响数量与不可撤销提示，题库本身不会删除。

### 刷题与复盘

- 根据答案数据自动识别单选题与多选题。
- 西医综合 306 专项识别 A、B、X 型题：保留 B 型共用备选项，并按 1–40 题每题 1.5 分、41–115 题每题 2 分、116–135 题每题 1.5 分、136–165 题每题 2 分计分，总分 300 分。
- 可选择“仅做单选”或“单选＋多选”。
- 顺序练习、从当前题库抽取 20 题的随机挑战，以及抽取 100 题的模拟考试。
- 在第一题继续点击“上一题”或最后一题点击“下一题”时显示友好提示。
- 可选选项随机，减少位置记忆。
- 可选“答对自动下一题”；答错时停留在当前题目进行复盘。
- 支持未练题目、错题和收藏题目范围。
- 答题卡、题号跳转、当前题库搜索、收藏和个人笔记。
- 本机保存学习进度，并支持学习记录 JSON 导出与导入。
- 支持浅色和夜间模式。

### English Learning 测试版

- 独立的 **AveCove Elapse · English Lab** 工作区，不改变原有医学刷题流程。
- 支持 CET、考研英语、IELTS 与 TOEFL 学习阶段切换。
- 侧栏按当前考试显示真实题型；切换学习阶段后，Test Library 只列出对应类别的试卷。
- 桌面与 iPad 支持折叠英文侧栏，为阅读、查词和实时书写留出更宽的工作区。
- 新增浏览器本地 **Test Library**，收集已导入的 Word、旧 `.doc`、PDF 和图片试卷。
- 普通英语试卷经浏览器提取/OCR 后必须由 AI 结构化；英文题库分享 JSON 仍可直接导入。
- 可一次选择“空白卷＋答案/解析卷”，按题号合并为同一份练习；只导入空白卷时会主动询问是否补充解析卷，并原位升级，不生成重复题库。
- 由 AI 判断学习阶段，并拆分完形、选词填空、阅读、段落匹配、翻译、听力资源和写作章节。
- 已专门适配当前考研英语一结构：完形 1–20、阅读 Part A 四篇 21–40、Part B 段落匹配 41–45、翻译 46–50、写作 51–52。
- 考研 Part B 使用紧凑的答案排序工作区；OCR 版面错乱时不再强行展示不可读原文。
- 已按真实六级卷面适配 CET-6：写作；听力长对话、篇章与讲座/讲话 1–25；阅读 Section A 选词填空 26–35、Section B 长篇匹配 36–45、Section C 仔细阅读 46–55；以及汉译英。
- PDF 采用混合提取：保留可信文字层，只对扫描页执行中英双语 OCR，适合“前几页有文字、后续为扫描解析页”的资料。
- 题目会关联文件中的答案与现有解析；未识别到答案时不会自行猜测。
- Directions 独立放入可折叠的说明栏，不再混入正文；完形和选词填空统一使用 `[[题号]]` 空格标记，避免把年份或正文数字误判为空格。
- 选词填空中的词库选项按题组限制为一次使用，切换题目与章节时会保留本次练习答案。
- 无需导入文件也可继续使用完形、阅读、听力资源和写作交互演示。
- 阅读中点词显示中文释义，并可一键加入浏览器本地生词本。
- 支持选中文本划线，以及覆盖题面的实时钢笔、荧光笔、橡皮、撤销和清空工具。
- 提交答案后显示正确选项、原文证据和干扰项排除思路。
- 已适配桌面、平板和 iPhone 宽度布局。

### AI 辅助学习

- **大神总结：** 提炼核心判断，解释正确答案与关键鉴别点。
- **易错提示：** 定位陷阱词、相似干扰项和常见错误原因。
- **知微：** 保留上下文继续追问，用更通俗的方式解释。
- 普通规则无法识别时，可选择 AI 识别 `1-A`、`1.A`、章节末尾答案表等非标准答案格式。
- 长篇医学资料采用分段识别和逐题独立 JSON 校验；单题响应损坏不会再导致整份文件全部失败，并会跨片段合并题号、答案表与解析依据。
- AI 兜底被明确要求只使用文件中已经给出的答案，不自行猜测缺失答案。
- 支持每日请求额度和厂商费用控制。
- API Key 始终留在服务器端，可使用 AES-256-GCM 加密后保存到 PostgreSQL。

目前内置厂商预设：

| 区域 | 厂商 |
| --- | --- |
| 国内 | DeepSeek、通义千问、Kimi、豆包、智谱 GLM |
| 海外 | OpenAI、Google Gemini、Anthropic Claude |
| 自定义 | OpenAI 兼容私有网关或其他第三方接口 |

由于厂商模型和接口可能调整，基础地址与模型名称均可修改，正式使用时应以厂商控制台最新文档为准。

### 身份、同步与讨论区

- 学号经过 HMAC 转换为不可逆同步标识，原始学号不进入 PostgreSQL。
- 可选邮箱验证码，用于登录恢复与评论身份保护。
- 不使用手机号或微信登录。
- 解析后的中英文题库、学习进度、英文答题记录与写作草稿、收藏、笔记、设置和昵称具备云端同步能力。
- 中文刷题记录采用逐题时间戳合并：iPad、Mac 等设备产生的已答、错题、收藏和笔记不会再被另一台设备的旧状态整包覆盖；重置操作也会同步为明确的删除记录。
- 支持学习记录 JSON 导出和重新导入。
- 共享评论支持点赞、举报、本人删除、敏感词预审、禁言和管理员审核台。
- 用户注销后删除相关云端学习状态、评论、点赞和举报，本机题库与本机数据仍可保留。

题库仍以本机存储为主，原始 Word、PDF 与图片不参与多端同步；开启同步后，云端会保存浏览器已经解析出的结构化题库和学习状态，让其他设备恢复题库与进度。用户应只同步自己拥有合法使用权的资料，并妥善保护导出的完整学习记录。

## 导入流程与隐私边界

```mermaid
flowchart LR
    A[".docx / PDF / 分享 JSON"] --> B["浏览器提取文字"]
    C["旧版 .doc"] --> D["自托管服务器内存提取"]
    B --> E{"普通规则是否识别成功"}
    D --> E
    E -->|成功| F["保存到 IndexedDB"]
    E -->|失败| G{"用户是否同意 AI 兜底"}
    G -->|不同意| H["停止，不向 AI 发送文字"]
    G -->|同意| I["发送提取文字到已配置 AI 厂商"]
    I --> J["校验题目结构与明确答案"]
    J --> F
```

系统不会向 AI 厂商发送原始文档，只发送浏览器已经提取/OCR 的文字。英语试卷因为章节和答案配对仅靠规则不可靠，普通文件导入必须配置个人 AI 或站点公共 AI；医学题库的 AI 兜底仍保持用户主动选择。使用前应确认文件中不含患者资料、个人隐私或其他敏感信息。AI 识别仍可能出错，导入后应抽查题目与答案。详见[英语试卷 AI 导入 Prompt 与配对协议](docs/英语AI导入Prompt.md)。

## 技术架构

```mermaid
flowchart TB
    U["电脑 / 手机浏览器"] --> N["Next.js 应用"]
    U --> I["IndexedDB：本地题库"]
    U --> L["localStorage：本机学习状态"]
    N --> P["PostgreSQL 16"]
    N --> M["SMTP 域名邮箱"]
    N --> A["所选 AI 厂商"]
    C["Caddy HTTPS"] --> N
    G["GitHub Actions"] --> S["自有服务器"]
    S --> C
```

| 层级 | 技术 | 作用 |
| --- | --- | --- |
| Web 应用 | Next.js 16、React 19、TypeScript | 界面、刷题流程和 API 路由 |
| 本机数据 | IndexedDB、localStorage | 导入题库与本机优先的学习记录 |
| 服务端数据 | PostgreSQL 16 | 匿名身份、同步状态、评论、审核、AI 配置与用量 |
| 文档识别 | Mammoth、PDF.js、Tesseract.js | Word 提取、PDF 文字提取和浏览器 OCR |
| 邮件 | Nodemailer 与自选 SMTP 服务商 | 登录验证码 |
| 公网入口 | Caddy | HTTPS 证书与反向代理 |
| 运维 | Docker Compose、脚本、GitHub Actions | 部署、健康检查、备份、恢复与自动更新 |

## 项目目录

```text
app/
├── api/                 登录、同步、评论、AI、健康检查等服务端接口
├── admin/               评论审核与 AI 管理页面
├── custom-ai/           用户可见的 AI 厂商配置页
├── lib/                 文件导入、题目解析、本地题库、身份与厂商逻辑
├── page.tsx             主产品页面
└── questions.json       8 道演示题
db/init.sql              PostgreSQL 数据库结构
docs/                    部署、上线检查与隐私文档
scripts/                 迁移、备份、恢复和服务器维护脚本
.github/workflows/       持续集成与服务器部署流程
Dockerfile               生产应用镜像
docker-compose.yml       应用、PostgreSQL 与 Caddy
Caddyfile                 HTTPS 反向代理配置
```

## 环境要求

### 本地开发

- Node.js `>= 22.13`
- npm
- PostgreSQL 16：同步、邮箱验证码、评论与服务端 AI 配置需要数据库

即使外部 AI、SMTP 或同步服务尚未配置，本地题库和基础刷题功能仍可使用。

### 公网部署

- 推荐 Ubuntu 22.04 或 24.04
- 建议至少 2 核 CPU、4 GB 内存、20 GB 磁盘
- Docker Engine 与 Docker Compose v2
- 已解析到服务器的域名
- 公网开放 80、443；PostgreSQL 不开放公网端口

## 快速开始

```bash
git clone <你的仓库地址>
cd AveCove-Elapse
cp .env.example .env
npm install
docker compose up -d postgres
npm run dev
```

访问 `http://localhost:3000`。

- 自定义 AI：`http://localhost:3000/custom-ai`
- 评论审核：`http://localhost:3000/admin`
- 健康检查：`http://localhost:3000/api/health`

本地开发环境未配置 SMTP 时，会返回调试验证码而不真正发送邮件；生产环境不能依赖该行为。

## 环境变量

将 `.env.example` 复制为 `.env`。不要将 `.env`、SMTP 密码、AI Key、部署 SSH 私钥或数据库备份提交到 Git。

### 必需的服务端密钥

每个字段应使用独立随机值，不要重复使用同一个密钥：

```bash
openssl rand -base64 36
```

| 变量 | 用途 |
| --- | --- |
| `POSTGRES_PASSWORD` | PostgreSQL 应用密码 |
| `SYNC_SECRET` | 生成不可逆同步标识的 HMAC 密钥 |
| `CONFIG_ENCRYPTION_KEY` | 加密保存的 AI API Key |
| `ADMIN_KEY` | 保护评论审核和 AI 管理入口 |
| `DOMAIN` | Caddy 使用的公网域名 |
| `NEXT_PUBLIC_SITE_URL` | 完整公网 HTTPS 地址 |

### 域名邮箱 SMTP

SMTP 只配置在服务器 `.env`，不放在网页中：

```dotenv
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=你的QQ邮箱或Foxmail邮箱
SMTP_PASS=QQ邮箱生成的SMTP授权码
SMTP_FROM=红豆生南国 <你的QQ邮箱或Foxmail邮箱>
```

- 端口 `465` 通常设置 `SMTP_SECURE=true`。
- 端口 `587` 使用 STARTTLS 时通常设置 `SMTP_SECURE=false`。
- `SMTP_PASS` 应使用邮件服务商提供的 SMTP 密码或应用专用密码，不一定等于网页登录密码。
- QQ 邮箱和 Foxmail 邮箱使用 `smtp.qq.com`；请先在邮箱设置中开启 SMTP 服务，并使用生成的授权码。
- 修改后重建应用容器，发送真实验证码，并检查垃圾邮件 / Spam 文件夹。

### AI 配置

- `/custom-ai` 面向普通用户：不需要管理员权限，可填写自己的 DeepSeek、通义、Kimi、豆包、智谱、OpenAI、Gemini 或 Claude Key。配置只保存在当前浏览器，调用时经 HTTPS 临时转发，不写入站点数据库。
- `/admin/ai` 面向站点管理员：使用 `.env` 中的 `ADMIN_KEY` 登录，为全站配置公共 AI。公共 API Key 经加密后保存到 `app_settings`；`.env` 中的 `OPENAI_API_KEY` 与 `OPENAI_MODEL` 仅作为可选 OpenAI 兜底。

个人配置优先于公共配置；没有个人配置时才使用站点公共 AI。为防止 SSRF，普通用户只能选择预置厂商的官方接口地址，自定义兼容网关由管理员配置。

通过 `AI_DAILY_LIMIT` 控制每个匿名访客或同步身份的每日请求量，并建议在 AI 厂商控制台设置预算与费用告警。

## Docker 与 Caddy 公网部署

1. 将域名 A/AAAA 记录指向服务器。
2. 将项目克隆到 `/opt/avecove-elapse` 等独立目录。
3. 从 `.env.example` 创建 `.env`，替换所有示例值。
4. PostgreSQL 仅在 Docker 内网使用，公网只按需开放 SSH、HTTP 和 HTTPS。
5. 启动：

```bash
docker compose up -d --build
docker compose ps
```

6. 访问 `https://你的域名/api/health` 检查服务状态。
7. 对照[上线检查清单](docs/上线检查清单.md)验收后再邀请用户。

DNS 与防火墙正确时，Caddy 会自动申请和续期 HTTPS 证书。

完整部署、备份和回滚流程见 [docs/部署与上线指南.md](docs/部署与上线指南.md)。

## GitHub Actions 自动部署

项目包含：

- `.github/workflows/ci.yml`：自动构建与测试。
- `.github/workflows/deploy.yml`：`main` 更新后部署到自有服务器。

启用部署前，在 GitHub 仓库中配置：

| Secret | 说明 |
| --- | --- |
| `DEPLOY_SSH_KEY` | 仅用于部署的独立 SSH 私钥 |
| `SERVER_HOST` | 服务器 IP 或域名 |
| `SERVER_USER` | 权限受限的部署用户 |
| `SERVER_PATH` | 部署目录，例如 `/opt/avecove-elapse` |

服务器 `.env` 和备份目录应留在服务器上，源代码部署不得覆盖它们。

## 数据库、备份与恢复

需要时执行数据库迁移：

```bash
npm run db:migrate
```

手动备份 PostgreSQL：

```bash
./scripts/backup.sh
```

恢复应在受控维护窗口执行：

```bash
./scripts/restore.sh /备份文件的绝对路径/avecove-elapse-日期.sql.gz
```

安装定期备份与日志维护：

```bash
sudo ./scripts/install-server-maintenance.sh /opt/avecove-elapse
```

只生成备份文件并不代表安全，应定期实际验证能否恢复。

## 构建与测试

```bash
npm run lint
npm test
```

`npm test` 会执行生产构建，并检查演示题库、核心交互、多题库存储、批量导入、AI 兜底、评论审核、安全文案和部署材料。

## 安全与隐私

- 不要导入患者姓名、住院号、联系方式、影像原片或其他临床隐私。
- 不要把密钥写进前端代码、Git 历史、截图、Issue 或聊天消息。
- 会话 Cookie 使用 `HttpOnly`、`SameSite=Lax`，生产环境仅通过 HTTPS 发送。
- 邮箱验证码 10 分钟过期，并有频率限制。
- 评论具备频率限制、敏感词预审、举报、隐藏、禁言和管理员操作记录。
- PostgreSQL 只允许应用内网访问，不应开放公网 5432 端口。
- 报告安全问题时，不要附带真实学号、邮箱、密钥或受版权保护的题库文件。

详见 [SECURITY.md](SECURITY.md) 与 [docs/数据与隐私说明.md](docs/数据与隐私说明.md)。

## 版权与使用边界

产品名称、界面、蛇杖红豆标识和相关视觉资产由项目保留。

用户导入的 Word、PDF、分享 JSON、教材和课程内容版权归原权利人所有。导入者与分享者需要自行确认拥有学习、整理或传播权限。题库分享功能会专门显示版权与隐私提醒。

题目答案、AI 内容和公开讨论仅用于学习辅助，不能替代现行教材、指南、执业判断、诊断或治疗建议。

当前仓库没有声明开源许可证。再次分发代码、视觉资产或公开题库前，请阅读 [版权与权利保护说明](COPYRIGHT.md)、[免责声明与使用协议](TERMS.md) 与 [题库来源登记](QUESTION_SOURCES.md)。

## 下一阶段规划

- 扩展 CET-4、IELTS、TOEFL 与不同出版方的试卷版式，并增加导入后的人工校对界面。
- 听力试卷的二维码、音频链接和原文附件校对。
- AI 生词释义补全、句子翻译与写作反馈。
- 题库级多端身份与冲突处理。
- 更强的导入校对、答案审核与重复题识别。
- 可选间隔复习计划与学习分析。

以上为规划方向，不代表当前版本已经实现。英语试卷导入结果目前保存在浏览器本地 Test Library；高风险考试用途前请人工核对章节和答案。

## 文档索引

- [English README](README.md)
- [部署与上线指南](docs/部署与上线指南.md)
- [上线检查清单](docs/上线检查清单.md)
- [数据与隐私说明](docs/数据与隐私说明.md)
- [安全说明](SECURITY.md)
- [版权与权利保护说明](COPYRIGHT.md)
- [免责声明与使用协议](TERMS.md)
- [题库来源登记](QUESTION_SOURCES.md)

---

为专注学习、认真复盘，以及真正掌握自己的学习材料而构建。
