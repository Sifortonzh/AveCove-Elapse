# Elapse Forge

[English](README.md) · [架构](../docs/FORGE_ARCHITECTURE.md) · [交接任务](../docs/FORGE_HANDOFF.md)

**0.2.0 仍是基础阶段，不是完整扫描识别产品。** 已能将 MinerU 3.4.4 官方云端产生的 hybrid JSON、可选 Markdown 与原 PDF 一起导入，不重复 OCR；同时保留后台任务、标准目录、人工复核和 Elapse 兼容导出。

## 本地运行

在 Elapse 仓库根目录，按 [English README](README.md#local-start-from-repository-root) 的命令创建独立 Python 环境，复制 `forge/.env.example` 为 `forge/.env`，填写工作台令牌。分别启动 API、worker 和现有 Next 开发服务，三者不要放在同一个阻塞终端中。

打开 `http://localhost:3000/forge`，输入令牌并检查配置，选择标准课程后上传 PDF/图片。记录任务 ID，可手动刷新/恢复任务。API 返回任务不代表 OCR 完成；没有配置 MinerU 时会明确报错，不会伪造识别结果。

如果已经在 MinerU 完成解析，请在“导入现成 MinerU 结果”处同时选择原始 PDF/图片和对应 JSON；Markdown 可选。Forge 会校验页数、私下保留原始产物、按真实页面尺寸转换坐标并直接进入整理队列，不会再次消耗 OCR 额度。原文件仍用于原页复核和来源校验，不能只交 Markdown。

人工复核时，左侧查看原页与来源框，右侧编辑题目结构；保存编辑后再确认。导出 ZIP 中的 **`elapse-bank.json`** 可用原有 Elapse 导入方式读取；`forge-provenance.json` 是来源及修改记录，请私下保留。第一阶段只导出已确认且有答案的选择/判断题，不把填空简答硬改成选择题。

## 运行边界

- 两份指定目录分别生成传染病学 141 节点、皮肤性病学 160 节点；题库备注明确列出原题号对应的课程路径。
- 现成 MinerU 官方云端结果无需本机引擎；需要自动调用时再接官方云 API。自托管模式仍需独立安装或连接自己管理的服务，详见 [OCR说明](../docs/FORGE_OCR.md)。
- SQLite 支持本地单 worker；服务器建议使用现有 PostgreSQL 实例上的独立 Forge 数据库/用户，并与 worker 共享私有文件卷。
- `docker-compose.forge.yml` 只提供可选服务，不会自动把 OCR 部署到现有小服务器。默认镜像不带 MinerU，worker 镜像需另行准备和验证。
- 当前复核界面是结构化 JSON 编辑骨架；跨页题干/选项和普通答案表已进入规则基线。复杂多栏串列、共享题干/选项自动重建、目录选择器等仍需下一阶段和人工复核。
- 原有刷题、同步、306 工作台和英语模块没有被此轮替换。

测试命令和自托管说明见 [English README](README.md)。六份设计文档及适合 GPT-5.6 Sol High 的后续小任务已整理在 [交接清单](../docs/FORGE_HANDOFF.md)。
