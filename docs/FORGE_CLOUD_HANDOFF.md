# Elapse Forge · 云端 OCR 交接给 GPT-5.6 Sol

## 当前决定（2026-09-07）

不在现有小服务器部署 MinerU 推理。优先接入 MinerU 官方精准解析 API，把模型计算交给云端；Forge 负责来源保存、题目/答案关联、课程映射、人工复核和 Elapse 导出。先实现可验收的小样本闭环，再扩展整本习题集。

服务器检查：约 1.6 GiB 总内存、249 MiB 可用，磁盘剩余 14 GB；Nginx 配置检查通过，mineru.avecrouge.top 已指向服务器。未部署 MinerU，未改动生产反代。域名本身不是调用云 API 的前提，也不要反代第三方官网冒充自己的服务。

## 已完成与未完成必须分开

- 基础代码提交：`1076695`（本地 main）；18 项 Forge 测试和 29 项 Elapse 测试通过，构建/类型检查通过。
- 基础数据模型、Provider 接口、课程树、队列、复核和导出已存在。
- **官方云 API Provider 尚未实现。Token 已由用户取得但不得写入文档、代码或 Git；用户已自行上传两份样本并提供结果，现成 hybrid JSON 导入已完成真实本地回归。**
- 现有 `FORGE_MINERU_MODE=remote` 是自托管 MinerU CLI/API 模式，不是官方云 API。不能只改一个地址就声称接入成功。

## 用户准备

登录 [MinerU API 管理及文档](https://mineru.net/apiManage/docs)，创建精准解析 API Token。通过本地受保护环境文件或部署密钥配置填写，不放进 README、Git、前端或聊天截图。首次上传前明确提示原始文件将发送给 MinerU 官方云服务，只处理用户有权上传且不含患者等敏感信息的资料。

不急于升级服务器，也不需要先处理 mineru 子域名。服务商额度、收费和文件限制以账户与最新官方文档为准，不保证无限免费。

## Sol 下一步：按顺序做

1. **新建独立云 Provider。** 现成结果入口 `POST /jobs/import-mineru` 已实现并验证，不要重做。下一步按官方文档实现申请上传链接、上传、异步状态查询、下载结果。官方本地文件流程使用 `POST /api/v4/file-urls/batch`，批次结果使用 `GET /api/v4/extract-results/batch/{batch_id}`。精准解析提供 ZIP 中的 Markdown/JSON；免 Token 轻量接口仅返回 Markdown，不满足本项目的完整来源结构要求。不要把轻量接口当作等价降级。
2. **保护任务与密钥。** 单独服务器环境变量（例如待实现的 `FORGE_MINERU_CLOUD_TOKEN`），显式云上传同意开关。持久化服务端 batch/task ID，重启优先恢复轮询而非重复上传。限制并发、上传/下载大小、轮询时长；对 401/429/超时给出明确状态。Bearer Token 只发往官方 API，不能转发给签名上传/下载地址。
3. **安全保留和归一化结果。** ZIP 防目录穿越/压缩炸弹；下载链接限定 HTTPS、阻断私网和不可信重定向，保留原始产物。用真实结果确认输出版本、bbox 坐标、旋转和页码；不要假定云输出与现有单页 CLI legacy content_list 完全相同。继续通过统一 Document 接入，不改 Elapse 原题库结构。
4. **真实小样本验收。** 获得 Token 和上传授权后，先跑人卫样本相邻两页，再跑军医答案表页面。保留原始输出、normalized Document、耗时和失败日志。验收题目→原页定位、跨页选项、答案关联；没有人工 gold truth 就只报可观测统计。
5. **完成生产力闭环。** 下载 OCR 结果不等于题库整理完成。推进语义分块和共享题干/选项解析，当前 AI parser 最多 3 页；改善复核界面的课程选择与字段编辑。最后导出 JSON，用真实 Elapse 导入器及实际页面检查。不得宣称已支持整本书自动无误识别。
6. **上线轻量工作台。** 小服务器只承载轻量 API/任务管理；上传、存储也需资源限额。先离线构建和私有访问验收。若需要 mineru.avecrouge.top，可用它承载自己的受保护 Forge 工作台，而不是公开裸 OCR 接口。按项目规则提交、打 tag、部署后核验公网版本和健康状态。

先阅读：根 `AGENTS.md` → 本文件 → `FORGE_ARCHITECTURE.md` / `FORGE_DATA_MODEL.md` / `FORGE_PIPELINE.md` / `FORGE_OCR.md` → `FORGE_HANDOFF.md`。

验证命令仍以 `forge/README.md` 为准。此交接是下一阶段施工单，不是已上线说明。
