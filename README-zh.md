# AveCove Elapse · 红豆生南国

<p align="center">
  <img src="public/hongdou-logo.png" width="112" alt="AveCove Elapse 蛇形医学标识" />
</p>

<p align="center">
  一款重视隐私、可自行部署，面向医学题库导入、刷题复盘与可选 AI 辅学的学习工作台。
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="docs/1.0.0功能介绍与视频演示提纲.md">1.0 视频演示提纲</a> ·
  <a href="docs/部署与上线指南.md">部署指南</a> ·
  <a href="SECURITY.md">安全说明</a> ·
  <a href="COPYRIGHT.md">版权说明</a>
</p>

<p align="center">
  <img alt="版本 1.2.0" src="https://img.shields.io/badge/version-1.2.0-b43d35" />
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-111111?logo=nextdotjs" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-087ea4?logo=react&logoColor=white" />
  <img alt="PostgreSQL 16" src="https://img.shields.io/badge/PostgreSQL-16-4169e1?logo=postgresql&logoColor=white" />
  <img alt="Docker 可部署" src="https://img.shields.io/badge/Docker-ready-2496ed?logo=docker&logoColor=white" />
</p>

<p align="center">
  <img src="public/hongdou-share.png" width="920" alt="AveCove Elapse 页面预览" />
</p>

## 项目简介

AveCove Elapse 是“红豆生南国”的可自行部署版本，目前首先面向个人医学题库训练。它可以把使用者有权使用的 Word、PDF 等资料整理成持续可用的题库书架，并提供客观题练习、错题复盘、收藏、笔记、可选 AI 解析和轻量多端同步。

`1.1.0` 采用克制的 Spatial Bento 信息架构，重点重构首页、我的题库与导入工作台：常用入口更集中、学习进度更直观、导入阶段更清晰，并补齐键盘焦点、减少动态效果与多尺寸响应式体验。既有刷题、同步和西综 306 流程保持兼容。

`1.1.1` 为首页“我的笔记”增加非空笔记实时计数，多端同步恢复的笔记也会纳入统计。

`1.2.0` 新增仅在练习设置中选择的“盲刷”和“背题”模式：盲刷可连续作答并保留选项，按需再对答案；背题会直接展开原文件标准答案，浏览过程不计入做题数、正确率或首次得分。

项目不含广告，不要求手机号或微信登录。学号只用于生成不可逆的同步标识，原始学号不会写入数据库；邮箱仅在使用者主动开启验证码登录或身份保护时使用。

`1.0.0` 是适合公开仓库、自行部署和录制演示的首个正式版本。项目只内置少量演示题，不附带任何完整商业题库、课程题库或其他受版权保护内容。

`1.0.1` 更新浏览器标题，并增加作者博客入口。

## 核心功能

### 导入并管理自己的题库

- 批量导入 `.doc`、`.docx`、文字 PDF、扫描 PDF 和 AveCove 便携 JSON。
- 每份成功导入的题库自动保存在浏览器本地题库书架。
- 支持重命名、简介、全局搜索、分享、删除和谨慎重置学习记录。
- 搜索范围包含题库名、简介、分组、题干、选项、分类与原题号，并高亮匹配词。
- 支持手动分组与安全关键词建议；历年西综试卷可统一归入“考研西综306”。
- 支持拖动或上下按钮自定义分组顺序，并可随多端同步保存。
- 在同组任一题库中练习时，可以调出整个分组的错题。
- 无答案的客观题可先以测试模式练习，之后再导入答案文件一键核对。
- 可把当前修订后的题库导出为分享文件，或生成 7 天有效的随机导入链接。

### 医学刷题与复盘

- 单选题、多选题和判断题。
- 顺序练习、20 题随机挑战和 100 题模拟考试。
- 错题复盘、收藏、答题卡、笔记和分题库学习进度。
- 可选返回上一题时显示答案、选项随机、错题自动收藏、答对自动下一题。
- 练习设置提供标准练习、延迟判定的盲刷和不计分的背题三种模式。
- 第一题与最后一题继续越界操作时显示友好提示。
- 文件自带解析与 AI 解析彼此独立，答题后都可保留显示。
- AI 学习区内容可快速写入 Markdown 笔记，并记录题目来源、教材参考提示、标签和搜索信息。

### 西医综合 306 工作台

- 支持现代 165 题、300 分的 A/B/X 型结构，也兼容旧题中的 C 型题。
- 可同时导入原卷和答案/解析卷。
- 页面感知切分、跨页题干与选项拼接、答案表确定性回填以及 AI 结构化。
- 检查预期题数、A/B/C/X 分布、重复题号、缺失题号和答案覆盖率。
- 缺少答案少于 10 题时，只有在原文能证明题目与答案安全一一对应的情况下，才按普通模式保留；否则继续使用测试模式。
- 首次作答计分，重复作答不会继续增加考试分数。
- 可导出标准 JSON，方便保存已经人工 OCR 或校正过的试卷。

### AI 自由配置

- 大神总结、易错提示、知微追问三类学习视角。
- 个人 AI 无需管理员批准，可直接在浏览器保存自己的兼容接口、模型和 Key。
- 站点管理员也可配置公共 AI，并设置每日调用额度。
- 支持国内外 OpenAI 兼容接口，不锁定单一厂商。
- AI 导入发送的是浏览器提取后的文字，不是原始文件。
- AI 只用于辅助学习，不能代替教材、现行指南、专业判断或临床诊疗。

### 多端同步与隐私

- 可选使用学号生成匿名同步主键。
- 同步解析后的中英文题库、答案、错题、收藏、笔记、写作草稿和设置。
- 原始 Word、PDF 与图片不写入同步数据库。
- PostgreSQL 仅位于 Docker 内部网络，不对公网暴露端口。
- 会话 Cookie 使用 HttpOnly，生产环境仅通过 HTTPS 发送。
- 邮箱验证码 10 分钟过期，并带请求频率限制。

### English Lab 预览

1.0.0 之后暂缓继续开发完整英语导入模式，优先完善医学题库导入。当前 English Lab 作为交互预览保留：

- 完形、阅读、听力、段落匹配、翻译和写作演示。
- 完形可在正文空格中选词、回填并统一判分。
- 阅读支持点词翻译、生词本、划线、钢笔、荧光笔、橡皮和答案解析。
- 听力、段落匹配与翻译演示均可实际选择、提交或查看参考版本。
- 页面会记住上次英语学习阶段和所在位置；切回中文后再次进入，已导入 Test Library 记录仍能找到。
- 已有英语导入仍采用本地优先保存，但在恢复完整开发与审计前，不建议用于高风险考试判断。

## 本地启动

需要：

- Node.js `22.13+`
- npm

```bash
git clone git@github.com:Sifortonzh/AveCove-Elapse.git
cd AveCove-Elapse
cp .env.example .env
npm ci
npm run dev
```

打开 `http://localhost:3000`。

质量检查：

```bash
npm run lint
npm run test
```

`npm run test` 会先执行正式构建，再运行产品测试。

## Docker 与 Caddy 公网部署

1. 将域名解析到服务器。
2. 把 `.env.example` 复制为 `.env`。
3. 替换全部占位密码和密钥。
4. 启动 PostgreSQL 与网页：

```bash
docker compose up -d --build
```

应用默认只监听 `127.0.0.1:3011`，可使用 Caddy、Nginx 或宝塔反向代理到该端口。也可以启用 Compose 自带的 Caddy：

```bash
docker compose --profile caddy up -d --build
```

健康检查：

```bash
curl http://127.0.0.1:3011/api/health
```

详细说明见[部署与上线指南](docs/部署与上线指南.md)和[上线检查清单](docs/上线检查清单.md)。

## SMTP 邮箱验证码

QQ 邮箱或 Foxmail：

```env
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=你的账号@foxmail.com
SMTP_PASS=QQ邮箱生成的16位SMTP授权码
SMTP_FROM="AveCove Elapse <你的账号@foxmail.com>"
```

必须先在邮箱设置中开启 SMTP，并使用生成的授权码，不能填写网页登录密码。修改 `.env` 后重新创建应用容器：

```bash
docker compose up -d --force-recreate app
```

不要把 `.env`、SMTP 授权码、AI Key 或真实学号提交到 GitHub。

## AI 配置方式

两种模式彼此独立：

1. `/custom-ai`：个人 AI，仅保存在使用者浏览器内，不需要管理员同意。
2. `/admin/ai`：全站 AI，由部署者通过 `ADMIN_KEY` 管理。

全站部署至少配置三份互相独立的随机密钥：

```env
SYNC_SECRET=至少32位随机字符
CONFIG_ENCRYPTION_KEY=另一份独立随机字符
ADMIN_KEY=管理员专用长随机密钥
AI_DAILY_LIMIT=20
```

## 数据保存边界

| 数据 | 默认保存位置 |
| --- | --- |
| 导入并结构化的题库 | 浏览器 IndexedDB |
| 本机答案、笔记与设置 | 浏览器 localStorage |
| 可选同步的题库结构与学习记录 | 自行部署的 PostgreSQL |
| 原始 Word/PDF/图片 | 使用者设备，不由同步服务保存 |
| 个人 AI Key | 使用者浏览器 |
| 全站 AI Key | 服务器配置或加密数据库 |

公开运营前请阅读[数据与隐私说明](docs/数据与隐私说明.md)、[安全说明](SECURITY.md)、[使用条款](TERMS.md)和[版权说明](COPYRIGHT.md)。
以上文档包含项目的免责声明与使用协议。

## 已知限制

- OCR 效果仍受扫描清晰度、页面结构、水印和跨页排版影响。
- 大文件 AI 整理可能耗时或不完整，导入后必须核对题数和答案。
- 英语导入管线仍属于实验功能，1.0 预览后暂缓继续开发。
- 听力二维码识别属于预览工作流，不是通用资源下载器。
- 本仓库目前没有声明开源许可证。公开查看源代码不等于获得复制、修改、分发、商用或品牌使用授权。

## 1.0.0 完成范围与后续重点

1.0.0 已完成：

- 稳定的医学刷题、错题与复盘流程。
- 多题库书架、分组、组内错题、简介、搜索、分享与记录重置。
- 西医综合 306 导入标准化与计分框架。
- 个人/全站 AI、SMTP 邮箱验证码和匿名多端同步。
- Docker/PostgreSQL 部署、健康检查、备份脚本和双语文档。
- 英语多题型交互演示与持久化导航。

后续重点：

- 继续提升不同医学试卷版式的确定性识别与 AI 融合。
- 降低 OCR 和大文件 AI 处理时间，特别是跨页题。
- 增强导入后的人工审校和修复工具。
- 等医学导入与公开版本稳定后，再恢复完整英语试卷导入。

## 文档

- [English README](README.md)
- [1.0.0 功能介绍与视频演示提纲](docs/1.0.0功能介绍与视频演示提纲.md)
- [西医综合 306 导入与计分](docs/西医综合306导入与计分.md)
- [英语 AI 导入协议](docs/英语AI导入Prompt.md)
- [部署与上线指南](docs/部署与上线指南.md)
- [上线检查清单](docs/上线检查清单.md)
- [题库来源](QUESTION_SOURCES.md)
- [使用条款](TERMS.md)
- [版权说明](COPYRIGHT.md)
- [安全说明](SECURITY.md)

## 权利与责任

© 2026 AveCove Elapse / 红豆生南国。保留相关权利。

使用者应确保导入、同步或分享的资料已经获得授权。不得上传患者信息、保密试题、非法复制的出版物或个人密钥。AI 与评论区内容不得代替教材、现行指南、执业判断或临床诊疗。
