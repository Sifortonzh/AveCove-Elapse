# Elapse Forge 第一阶段交付报告

日期：2026-09-07。范围：基础架构与最小可运行骨架，不是完整 OCR 产品上线。Elapse 主版本仍为 1.3.7，Forge 模块版本 0.1.0。

## 1. 检查了哪些现有代码

审查 `package.json`、`app/lib/question-parser.ts`、`app/lib/local-bank.ts`、`app/lib/file-import.ts`、`app/lib/server/db.ts`、`app/lib/server/admin.ts`、`app/api/import-ai/route.ts` 及相关医学/306解析、`db/init.sql`、`next.config.ts`、Dockerfile、Compose、既有测试和双语 README。结论见 [架构审查表](FORGE_ARCHITECTURE.md)。未改动原刷题、同步、评分、306 导入或英语业务实现。

## 2. Elapse 真实 Schema

沿用 `hongdou-question-bank` version 1 和现有 `QuizQuestion`。题目包含 id/sourceNumber/category/stem/options/answer/multiple，兼容 explanation/answerSource/sharedOptionGroup；306 特有字段不随意套用。Forge 标准课程路径转为 category，备注明确列出原题号→章节名。完整字段和导入限制见 [数据模型](FORGE_DATA_MODEL.md)。

## 3. 最终架构

Next 可选工作台 → FastAPI → 持久后台任务 → OCRProvider → Document → Parser/Registries → Reconciler → 标准课程映射 → 校验/复核 → Elapse adapter。SQL 队列避免为第一阶段另加 Redis。服务器可接 PostgreSQL，本地单 worker 使用 SQLite；本轮未做生产 PostgreSQL 并发验收。

## 4. MinerU 如何接入

已实现真实进程调用代码、超时中止、原始输出保留和格式归一化；支持 native CLI、自己管理的远程 API、指定 Docker 镜像配置。它不是“返回固定假结果”的实现。**但代码接入不等于引擎实测通过**，运行条件见第 13 项。[OCR说明](FORGE_OCR.md)

## 5. Provider 抽象

业务只调用 OCRProvider 的单页读取接口；MinerU 私有字段限于 ocr.py。PaddleOCR 明确抛出“尚未实现”，不冒充可用 fallback。

## 6. Document Model

保留原文件哈希、PDF 页码、显示尺寸/旋转、block 类型/原文/阅读顺序/bbox、实际置信度和全部原始产物位置。缺少置信度不补造数值，并进入人工复核。没有做会破坏原始坐标的自动裁剪。

## 7. Question Model

支持用户要求的医学题型和主客观题内部表达；问题、答案和解析来源分开保存。第一阶段只导出已确认且结构完整的选择/判断题，不把不支持题型伪装成选择题。原始解析和人工修订均可追溯。

## 8. Curriculum Model

两份指定标准目录已完整读取并生成任意层级课程树：传染病学 141 节点、皮肤性病学 160 节点，带文件哈希/目录页/内容页/编号。习题书自己的目录没有冒充标准目录。版本号不臆测教材版次。[课程设计](FORGE_CURRICULUM.md)

## 9. Job Pipeline

上传立即排队，独立 worker 后台执行。逐页检查点、任务租约、版本冲突保护、明确失败状态；重试生成子任务并记录审计，已成功 OCR 页可复用。API 与工作台不会同步等待整本书识别。[流程](FORGE_PIPELINE.md)

## 10. 跨页关联方案

文档 ID + 原书章节 scope + 题型 + 原题号关联独立注册表。测试覆盖 p10 题干、p11 选项、p80 答案、p90 解析。重复题号、跨章节同号、答案冲突不猜测、不强行绑定。

## 11. 新建和修改文件

- `forge/src/elapse_forge/`：16 个模块文件，含模型、OCR、解析、关联、课程、校验、导出、存储、队列、API、worker、AI、benchmark。
- `forge/tools/`：参考文件检查、标准目录生成、运行预检、真实小样本 MinerU 运行工具。
- `forge/curriculums/`：两份可重建的标准树；`forge/benchmarks/`：实际样本预检与三份 JSON Schema。
- `forge/tests/`：Python 回归测试及调用生产 TypeScript 导入器的桥接测试。
- `app/forge/`、`app/api/forge/[...path]/`：独立工作台和固定上游 relay。
- `forge/Dockerfile`、环境变量示例、可选 `docker-compose.forge.yml`、双语运行说明。
- 根 `AGENTS.md`、六份设计文档、交接清单、本报告；根双语 README 增加模块说明。
- `.gitignore`/`.dockerignore` 排除私有输入/运行数据；原 product 测试唯一修改是把过时 1.3.6 断言更新到原仓库实际 1.3.7。

## 12. 实际测试结果

| 检查 | 结果 |
| --- | --- |
| Forge pytest（包含真实 Elapse 导入函数契约测试） | 18 passed |
| Python Ruff | passed |
| Python mypy，检查未标注函数体 | 16 source files passed |
| Next ESLint | passed |
| Next production build + TypeScript | passed |
| 原有 Elapse product tests | 29/29 passed |
| 本地 FastAPI 健康检查 | HTTP 200 |
| 本地 Next relay → FastAPI | HTTP 200 |
| 浏览器打开 /forge、连接、读取两门课程 | 已验证 |
| 缺少 MinerU 时的页面反馈 | 明确显示 executable not found |

合计 47 个测试用例通过，不代表 OCR 准确率。Python 依赖存在 PyMuPDF/Starlette deprecation warnings；无断言失败。浏览器检查使用临时本地测试令牌，不读取生产凭据；测试服务已停止。完整 iPad 复核工作流、真实 PostgreSQL/Docker 与生产部署未验收。

## 13. 是否真实运行过 MinerU

**没有。** 当前本机找不到 `mineru`，也没有配置可用远程 OCR 服务。未擅自下载大型模型或把样本发往第三方。`forge/benchmarks/preflight.json` 明确记录 `mineru_executed: false`、真实 normalized result 为 null、accuracy 为 null。工具和复现命令已准备好，后续需在合适机器运行并检查真实坐标/阅读顺序。

## 14. 当前完成什么

完成第一阶段架构、兼容适配层、课程树、后台基础流程、复核骨架、测试和开发交接。工作台/API 可以本地启动；人工确认的兼容题目能够经现有导入器读取。没有替换旧 Elapse。

## 15. 当前不能做什么

不能承诺两本样本自动完整识别。复杂多栏答案表、A3/A4/B1 共享上下文自动重建、全书 AI 分块、语义课程映射、富文本复核、Paddle fallback、训练以及生产 OCR 都未完成。可选 AI parser 暂限最多 3 页输入，repair 最多 2 次；没有写成吞整本书的同步接口。

## 16. 已知技术风险

真实 MinerU 版本/输出方言/旋转 bbox 待验收；低/缺失置信度通常需要人工确认；规则解析不能代替布局语义。队列是至少一次执行，可能重算但禁止陈旧提交覆盖。模型升级需显式失效检查点。单令牌仅适合可信操作员，不是公开多租户服务。需同时备份 DB 与产物，不能只保存数据库。导出 category 是扁平路径且备注有长度上限，浏览器重建 ID 需保留来源 sidecar。

## 17. 下一阶段任务

已拆成适合 **GPT-5.6 Sol High** 的小任务，见 [FORGE_HANDOFF.md](FORGE_HANDOFF.md)。最先做真实 MinerU 小样本验收，其次标注 benchmark，然后才扩展布局/语义解析和 Review 界面。

本轮是本地基础阶段交付，未推送生产发布、未更新公网，也未在小服务器上运行重型 OCR。
