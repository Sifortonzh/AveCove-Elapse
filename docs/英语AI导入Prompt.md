# 英语试卷 AI 导入 Prompt 与配对协议

本文记录 AveCove Elapse 英语试卷导入器的结构化原则。实际运行 Prompt 以
`app/lib/english-ai-import.ts` 为准。

## 为什么英语试卷必须走 AI

英语试卷并不是简单的“题目 + 答案”列表。同一份 CET-6 资料通常同时包含：

- 写作题目；
- 听力题、听力原文与解析；
- Section A 选词填空的连续文章、26–35 空和共享 A–O 词库；
- Section B 长篇匹配的 A–N 段落与 36–45 题；
- Section C 两篇独立文章及 46–55 题；
- 汉译英原文、参考译文；
- Directions、答题卡说明、页眉页脚、二维码和 OCR 噪声。

仅使用正则表达式很容易把 Directions 当作文章，把跨页段落截断，或把解析卷
中的中文译文误当成题干。因此，浏览器只负责文字层提取和必要 OCR，章节映射、
题号对齐、空格重建和答案溯源统一交给 AI 完成。

## 空白卷与解析卷的职责

| 文件 | 权威内容 |
| --- | --- |
| 空白卷 | 原题文字、文章、题号、选项、章节边界 |
| 答案/解析卷 | 答案标签、听力原文、参考译文、逐题解析 |

合并时以题号为主键。答案卷不得覆盖空白卷的原题文字；空白卷没有明确答案时，
系统也不得自行猜测。一次同时选择两份文件时会直接配对；只选择空白卷时，导入
完成后会询问是否补充答案/解析文件，并在原题库记录上升级，不新建重复记录。

## 经典 Prompt 的核心约束

```text
You are a senior English-exam archivist and assessment-data engineer.
Return one valid JSON object only.

Accuracy:
1. Preserve question numbers, passages, stems, option labels and wording.
2. Never infer an answer. Set answer only when the answer material explicitly says so.
3. Explanations must be grounded in the supplied analysis.
4. Put Directions only in section.directions; never in passage or stem.
5. Remove page headers, footers, watermarks, QR marketing copy and duplicate OCR lines.
6. Preserve continuous paragraphs across page breaks.
7. Represent every cloze/word-bank blank as [[questionNumber]].

CET-6:
- Writing is one open-response prompt.
- Listening is 1-25 and must pair transcripts/analysis by question number.
- Reading Section A is word-bank 26-35 with one continuous passage and shared A-O options.
- Reading Section B is long-reading 36-45 with paragraphs A-N; paragraph labels may repeat.
- Reading Section C is two independent passages: 46-50 and 51-55.
- Translation preserves the Chinese source; reference translation is answer material.

Before returning JSON, verify section boundaries, number ranges, blank markers,
option labels, answer provenance, and that Directions did not leak into passage.
```

## 结构化结果

每个章节单独保存 `directions`、`passage` 和 `questions`。选词填空与完形文章
使用 `[[26]]`、`[[27]]` 这类稳定标记，避免把年份或正文中的普通数字误识别为
空格。答案缺失时保留可练习的原文与题目，但显示“未评分”，并提示补充解析卷。

## 使用与隐私

发送给 AI 厂商的是浏览器提取/OCR 后的文字，不是原始 PDF 文件。用户仍需确认
资料的版权授权，并确保文件不含个人隐私、患者信息或其他敏感数据。AI 结构化
结果必须在高风险使用前抽查。
