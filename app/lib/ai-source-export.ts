export const AI_SOURCE_CONVERSION_PROMPT = `请读取我上传的 Elapse「供AI整理.json」中的 extractedText，把其中所有选择题和判断题整理成可直接导入 Elapse 的红豆题库 JSON。
只依据原文：保留原题号、章节、题干、选项、原文答案和解析；跨页断开的题请接续；不要补造题目，也不要凭医学知识猜答案。没有可靠答案时 answer 写 []，不要擅自排除缺答案的题。
最终只输出一个合法 JSON 对象，不要 Markdown 代码块、前言或解释。顶层必须是 {"format":"hongdou-question-bank","version":1,"bank":{"name":"题库名","description":"","questions":[...]}}。
每道题必须有唯一 id、字符串 sourceNumber、category、stem、options（如 [{"label":"A","text":"选项内容"}]）、answer（如 ["B"] 或 []）、multiple（布尔值）；有原文解析时再加 explanation。判断题可用 A=正确、B=错误。共享题干可用 sharedStem 保留。
输出前自行核对题数、原题号顺序、选项是否完整以及 answer 是否只引用现有选项。不要省略后半部分题目；内容过长时分批输出多个完整题库 JSON，并在名称中标明分卷。`;

export function createAiSourcePackage(fileName: string, extractedText: string) {
  return {
    format: "elapse-ai-source" as const,
    version: 1,
    sourceFileName: fileName,
    extractedText,
    instruction: AI_SOURCE_CONVERSION_PROMPT,
    outputTemplate: {
      format: "hongdou-question-bank" as const,
      version: 1,
      bank: {
        name: fileName.replace(/\.(doc|docx|pdf)$/i, ""),
        description: "",
        questions: [{
          id: "q-1",
          sourceNumber: "1",
          category: "未分章",
          stem: "题干",
          options: [{ label: "A", text: "选项" }],
          answer: [] as string[],
          multiple: false,
          explanation: "",
        }],
      },
    },
  };
}

export function downloadAiSourcePackage(fileName: string, extractedText: string) {
  const url = URL.createObjectURL(new Blob([
    JSON.stringify(createAiSourcePackage(fileName, extractedText), null, 2),
  ], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileName.replace(/\.(doc|docx|pdf)$/i, "")}-供AI整理.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
