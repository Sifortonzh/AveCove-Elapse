<div align="center">
  <img src="public/hongdou-logo.png" width="108" alt="AveCove Elapse 标识" />
  <h1>AveCove Elapse · 红豆生南国</h1>
  <p><strong>把有权使用的资料，整理成真正能够长期刷、持续改、随时复盘的题库。</strong></p>
  <p>一个重视隐私、可自行部署，面向医学题库导入、专注练习、复盘笔记与可选 AI 辅学的工作台。</p>

  <p>
    <a href="https://allo.avecrouge.top/"><strong>打开在线版本</strong></a>
    · <a href="README.md">English</a>
    · <a href="docs/部署与上线指南.md">部署指南</a>
    · <a href="forge/README-zh.md">Elapse Forge</a>
    · <a href="https://avecrouge.top/">作者博客</a>
  </p>

  <p>
    <a href="https://github.com/Sifortonzh/AveCove-Elapse/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Sifortonzh/AveCove-Elapse/actions/workflows/ci.yml/badge.svg" /></a>
    <img alt="版本 1.4.10" src="https://img.shields.io/badge/version-1.4.10-b43d35" />
    <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-111111?logo=nextdotjs" />
    <img alt="React 19" src="https://img.shields.io/badge/React-19-087ea4?logo=react&logoColor=white" />
    <img alt="PostgreSQL 16" src="https://img.shields.io/badge/PostgreSQL-16-4169e1?logo=postgresql&logoColor=white" />
    <img alt="Docker 可部署" src="https://img.shields.io/badge/Docker-ready-2496ed?logo=docker&logoColor=white" />
  </p>
</div>

<p align="center">
  <img src="public/hongdou-share.png" width="960" alt="AveCove Elapse 产品界面预览" />
</p>

> [!IMPORTANT]
> **当前版本：v1.4.10。** 医学刷题、题库管理、可选多端同步和西医综合 306 已构成稳定主线；刷题纠错现已支持无答案题补录、医学题型修订、选项增删，以及在现有题目之间插入完整新题并自动顺延题号。English Lab 仍是预览功能，OCR 与 AI 自动整理仍须对照原文件抽查。

## 产品地图

| 模块 | 当前能力 | 阶段 |
| --- | --- | :---: |
| **我的题库** | 多题库保存、两行折叠简介、来源与版权信息、搜索、分组、自定义排序、精选试卷、便携文件、7 天导入链接及本机“藏经阁”Demo | 稳定 |
| **刷题与复盘** | 标准、盲刷、背题；答题卡、错题复盘、斩题、纠错、笔记与原题解析 | 稳定 |
| **医学题型** | 单选、多选、判断，以及带共用题干或备选项的 A1/A2/A3/A4/B1/C/X | 重点推进 |
| **西医综合 306** | 现代 165 题 / 300 分审校、旧卷 C 型、首次评分和五科单独练习 | 重点推进 |
| **AI 辅学** | 个人或全站 OpenAI 兼容接口、导入整理、解析追问与写入笔记 | 可选 |
| **多端同步** | 题库、进度、错题、精选、笔记、设置、分组及删除标记 | 可选 |
| **English Lab** | 完形、阅读、听力、匹配、翻译与写作交互演示 | 预览 |
| **Elapse Forge** | 独立扫描题库工作台：接入 MinerU 结果、标准化、审校及导出 Elapse | 基础版 0.2 |

## 为什么做 Elapse

- **自己的题库，自己掌握。** 结构化题库与学习记录默认保存在本机；同步可以不开，也可以部署在自己的服务器。
- **原始资料优先于 AI 推测。** 原文件答案、原题解析和 AI 内容分开保存；缺失答案会明确标记为待核对。
- **识别不完美，仍可继续修。** 刷题过程中可以纠正题干、选项和答案；之后导出、同步与分享均使用修订版。
- **围绕真实医学资料设计。** 跨页拼接、共用题干、全书末尾答案表、西综 306 评分和章节题号范围不是附加功能，而是主流程。
- **适配真正用来学习的设备。** 手机、iPad、Mac 和 PC 自动调整布局；平板长题滚动时仍保留固定操作，正文采用接近试卷的中英文字体。

## 从资料到可持续刷题

```mermaid
flowchart LR
  A[有权使用的 PDF / Word / MinerU 结果] --> B[提取与标准化]
  B --> C[核对题号、选项与答案]
  C --> D[人工抽查与纠错]
  D --> E[刷题、笔记与复盘]
  E --> F[可选私有同步或便携分享]
```

### 导入与题库管理

- 支持 `.doc`、`.docx`、文字 PDF、扫描 PDF、AveCove 便携 JSON 与官方 MinerU Hybrid JSON；耳鼻喉军医题号前答案和皮肤病人卫分章答案已使用专用确定性规则。
- Word 中只要题干与至少两个选项结构完整，即使没有识别出答案也会保留为“待核对”，可在刷题纠错中后补。
- 可填写题库简介和“章节—题号范围”，并把历年卷或同一学科题库放进同一分组。
- 搜索题库名、简介、分组、题干、选项、分类和原题号，并高亮结果。
- 支持重命名、删除、仅清除学习记录、设为精选，以及按自定义顺序、导入时间或名称排序。
- 在同组任一题库内，可以统一调出该组全部错题。
- 没有答案的题库可先按测试模式练习，之后导入答案文件再一键核对。
- 分享时导出当前修订后的题库；可下载便携文件，也可创建 7 天有效的随机导入链接。

### 刷题、复盘与笔记

- 顺序练习、20 题随机挑战和 100 题模拟考试。
- **标准模式：** 每题确认后立即判定。
- **盲刷模式：** 连续保留选择，不立即显示对错，需要时再统一对答案。
- **背题模式：** 直接展开原文件答案，不改变刷题统计。
- 单击选项选择或取消，双击排除干扰项。
- 刷题时搜索全部题库，关闭搜索后回到原题并保留已选答案。
- 支持答题卡、组内错题、精选题、标签、Markdown 笔记、图片笔记和选项批注。
- 可斩当前题或输入 `1-31` 等原题号范围批量斩题；答题卡以 `/` 标记，且不计入正确率和 306 得分。
- iPad 长题滚动时，“上一题”和“下一题／确认答案”保持可用。

### 医学题型与西医综合 306

- 保留 A1、A2、A3、A4、B1、C、X 型身份，不把所有医学题都压平为普通单选或多选。
- A3/A4 连续显示共用病例题干与同组小题；B1 复用同组备选答案。
- 支持全书题目之后统一出现的答案表，并让原资料解析与 AI 解析独立共存。
- 306 工作台检查预期题数、A/B/C/X 分布、原题号、重复题和答案覆盖率。
- 现代 165 题试卷可只练生理学、生物化学、病理学、内科学或外科学。
- 首次作答即锁定考试得分，后来重新做对不会抬高原始成绩。
- 缺题、缺答案会明确列出；导入器不会用医学常识猜测原书答案。

### AI 与学习笔记

- 可在浏览器设置个人 AI，也可由管理员在服务器配置全站 AI。
- 通过 Base URL、模型名和 API Key 接入兼容 OpenAI 协议的服务商。
- 按需生成简要总结、易错点、同类考点或继续追问，不必每题强制调用。
- 有价值的 AI 内容可快速写入 Markdown 笔记，同时保留题目来源并复用已有标签。
- 原文件自带解析在答题后独立显示，不会被 AI 内容覆盖。
- 个人解析与追问没有站内每日额度限制；仍受所选 AI 服务商余额、频率与计费规则约束。

## 本地启动

需要 Node.js `22.13+` 与 npm。

```bash
git clone git@github.com:Sifortonzh/AveCove-Elapse.git
cd AveCove-Elapse
cp .env.example .env
npm ci
npm run dev
```

打开 `http://localhost:3000`。发布前执行：

```bash
npm run lint
npm test
```

`npm test` 会先完成正式构建，再运行产品测试。

## Docker 与 Caddy 公网部署

```bash
cp .env.example .env
docker compose up -d --build
curl http://127.0.0.1:3011/api/health
```

应用默认监听 `127.0.0.1:3011`，请在前面配置 Caddy、Nginx 或其他 HTTPS 反向代理。也可启用仓库内置的 Caddy 配置：

```bash
docker compose --profile caddy up -d --build
```

本仓库的正式发布会先在 GitHub Actions 构建完整 Docker 镜像，小内存服务器只负责加载成品并重启。详见[部署与上线指南](docs/部署与上线指南.md)和[上线检查清单](docs/上线检查清单.md)。

<details>
<summary><strong>QQ 邮箱 / Foxmail 验证码配置</strong></summary>

```env
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=你的账号@foxmail.com
SMTP_PASS=QQ邮箱生成的16位SMTP授权码
SMTP_FROM="AveCove Elapse <你的账号@foxmail.com>"
```

必须先在邮箱设置中开启 SMTP，并填写生成的授权码，不能使用网页登录密码。修改 `.env` 后重新创建应用容器：

```bash
docker compose up -d --force-recreate app
```
</details>

<details>
<summary><strong>个人 AI 与全站 AI</strong></summary>

- `/custom-ai`：个人配置保存在使用者浏览器，不需要管理员批准。
- `/admin/ai`：部署者使用 `ADMIN_KEY` 管理可选的全站 AI。

请分别生成互不相同的随机密钥：

```env
SYNC_SECRET=至少32位随机字符
CONFIG_ENCRYPTION_KEY=另一份独立随机字符
ADMIN_KEY=管理员专用长随机密钥
```
</details>

> [!CAUTION]
> 不要把 `.env`、SMTP 授权码、AI Key、正式数据库地址或真实学号提交到 GitHub。

## 数据保存与隐私边界

| 数据 | 默认保存位置 |
| --- | --- |
| 导入并结构化的题库 | 浏览器 IndexedDB |
| 本机答案、笔记与设置 | 浏览器本地存储 |
| 可选同步的题库结构与学习记录 | 自行部署的 PostgreSQL |
| 原始 Word/PDF/图片 | 使用者设备，不由同步服务保存 |
| 个人 AI Key | 使用者浏览器 |
| 全站 AI Key | 服务器配置或加密数据库 |

学号只用于生成不可逆的同步标识，原始学号不会写入数据库；邮箱为可选项，仅用于验证码登录或身份保护。公开运营前请阅读[数据与隐私说明](docs/数据与隐私说明.md)、[安全说明](SECURITY.md)、[使用条款](TERMS.md)和[版权说明](COPYRIGHT.md)。这些文档包含项目的免责声明与使用协议。

## Elapse Forge

Forge 是位于 `/forge` 的独立导入工作台。它可同时接收原文件、MinerU 已完成的官方 Hybrid JSON 和可选 Markdown，保留页码、坐标、表格与图片证据，不必再次消耗 OCR。

Forge 与稳定刷题主程序相互隔离。基础版 `0.2.0` 已加强分章节题号、跨段选项、跨页接缝与答案表关联，但它**不是零错误 OCR 产品**。必须保存原文件用于可视核对，并在学习前抽查生成题库。

从 [Forge 中文说明](forge/README-zh.md)、[架构](docs/FORGE_ARCHITECTURE.md)、[OCR 模式](docs/FORGE_OCR.md)和[后续交接](docs/FORGE_HANDOFF.md)开始了解。

## 项目进度

| 状态 | 内容 |
| --- | --- |
| **目前可用** | 稳定医学刷题、多题库管理、纠错、笔记、可选同步、便携分享、306 审校与评分、Docker 部署 |
| **当前重点** | 章节型医学练习册、跨页题目和全书末尾答案表的确定性识别与 AI 融合 |
| **下一阶段** | 更强的导入后审校、更快的大文件处理，以及更多学科适配配置 |
| **暂缓预览** | 完整英语试卷导入；现有 English Lab 交互演示继续保留 |

已知限制：

- OCR 效果仍受扫描清晰度、页面结构、水印密度和跨页排版影响。
- 大文件 AI 整理可能耗时或不完整，导入后必须核对题数和答案。
- 英语导入仍为实验流程，暂不建议用于高风险考试答案判断。
- 本仓库目前没有声明开源许可证。公开查看源代码不等于获得复制、修改、分发、商用或品牌使用授权。

<details>
<summary><strong>版本记录</strong></summary>

- **v1.4.10** — 支持无答案题手动补录、医学题型纠正、选项增删、完整新题插入与连续题号顺延，并精简刷题学习区。
- **v1.4.9** — 支持直接导入耳鼻喉军医与皮肤病人卫版式的 MinerU Hybrid JSON，并让 Word 无答案客观题先完整入库、后续纠错。
- **v1.4.8** — 精简题库页面，补充来源与版权信息，并加入仅存本机的“藏经阁”Demo。
- **v1.4.7** — 为服务器繁忙或刚重启的场景增加自动部署等待与重试。
- **v1.4.6** — 重构中英双语 README 与 GitHub 项目首页信息层级。
- **v1.4.5** — 修复 iPad 长题滚动时“上一题”按钮不可持续使用的问题。
- **v1.4.4** — 增加耳鼻咽喉头颈外科 MinerU 全书转换支持。
- **v1.4.3** — 支持拼接多份 MinerU Hybrid JSON，并保留结构完整的全部客观题。
- **v1.4.2** — 改进军医答案表与旧版 Word 题库导入。
- **v1.4.1** — 将正式构建移至 GitHub Actions，降低服务器内存压力。
- **v1.4.0** — 增加 A1/A2/A3/A4/B1/C/X 组题显示与“斩”题。
- **v1.3.x** — 接入现成识别结果，增加刷题纠错、批注、iPad 操作、试卷字体和学习区优化。
- **v1.2.0–v1.2.4** — 增加盲刷、背题、精选试卷、306 分科练习与题库同步冲突处理。
- **v1.1.x** — 采用克制的 Spatial Bento 首页并加入笔记计数。
- **v1.0.x** — 建立公开自行部署版本、双语文档、品牌入口和英语交互预览。
</details>

## 文档导航

| 主题 | 文档 |
| --- | --- |
| English overview | [README.md](README.md) |
| 功能与录制演示 | [1.0.0 功能介绍与视频演示提纲](docs/1.0.0功能介绍与视频演示提纲.md) |
| 西医综合 306 | [导入与计分说明](docs/西医综合306导入与计分.md) |
| Forge | [运行说明](forge/README-zh.md) · [架构](docs/FORGE_ARCHITECTURE.md) · [处理流程](docs/FORGE_PIPELINE.md) |
| 运维 | [部署指南](docs/部署与上线指南.md) · [上线检查清单](docs/上线检查清单.md) |
| 规则 | [题库来源](QUESTION_SOURCES.md) · [使用条款](TERMS.md) · [版权说明](COPYRIGHT.md) · [安全说明](SECURITY.md) |

## 权利与责任

© 2026 AveCove Elapse / 红豆生南国。保留相关权利。

仓库只内置少量演示题。使用者应确保导入、同步或分享的资料已经获得授权；不得上传患者信息、保密试题、非法复制的出版物或个人密钥。AI 与评论区内容不得代替教材、现行指南、执业判断或临床诊疗。
