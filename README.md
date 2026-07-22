# AveCove Elapse

“红豆生南国”医学刷题网页的独立、可自建服务器版本。

## 已完成

- 8 道“演示题库”，不内置完整儿科学题库
- Word 与文字型 PDF 导入，原始题库文件默认在浏览器内解析
- 顺序、随机、错题、收藏、答题卡、搜索与笔记
- “大神总结”“易错提示”“知微”及连续追问
- OpenAI、DeepSeek、通义千问、Kimi、豆包、智谱、Gemini、Claude 与自定义兼容接口
- 学号匿名化同步：数据库不保存原始学号
- 可选邮箱验证码登录，不使用手机号或微信
- 进度、收藏、笔记和设置多端同步
- 学习记录 JSON 导出与导入
- 共享评论、点赞、举报、个人删除、敏感词预审、禁言和审核台
- AI 每日额度、健康检查、日志轮转和数据库备份
- PostgreSQL、Docker Compose、Caddy HTTPS 与 GitHub Actions 部署

## 本地开发

需要 Node.js 22 和 PostgreSQL 16。最省事的方式是先启动数据库：

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npm run dev
```

访问 `http://localhost:3000`，首页左下角的“自定义AI”进入独立配置页（`/custom-ai`），评论审核页位于 `/admin`。

## 验证

```bash
npm run lint
npm test
```

## 部署

请先阅读：

- [部署与上线指南](./docs/部署与上线指南.md)
- [上线检查清单](./docs/上线检查清单.md)
- [数据与隐私说明](./docs/数据与隐私说明.md)

## 重要边界

本项目用于医学学习辅助。题库答案、AI 解析和讨论内容不能替代现行教材、指南、执业判断或对患者的诊疗建议。
