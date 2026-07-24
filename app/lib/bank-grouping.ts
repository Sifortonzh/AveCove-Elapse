import type { QuizQuestion } from "./question-parser";

type GroupRule = { name: string; pattern: RegExp };

const GROUP_RULES: GroupRule[] = [
  { name: "考研西综306", pattern: /(?:西医综合|西综|临床医学综合能力\s*[（(]?西医[）)]?|(?:^|\D)306(?:\D|$))/i },
  { name: "儿科学", pattern: /儿科|新生儿|小儿/i },
  { name: "妇产科学", pattern: /妇产|产科|妇科|妊娠|分娩/i },
  { name: "耳鼻咽喉科学", pattern: /耳鼻咽喉|耳科|鼻科|咽喉/i },
  { name: "医学影像学", pattern: /影像|放射|CT|MRI|超声/i },
  { name: "全科医学", pattern: /全科|社区医学|家庭医学/i },
];

export function suggestQuestionBankGroup(name: string, questions: QuizQuestion[] = []) {
  const keywords = `${name}\n${questions.slice(0, 24).map((question) => `${question.category} ${question.stem}`).join("\n")}`;
  return GROUP_RULES.find((rule) => rule.pattern.test(keywords))?.name ?? "";
}

export function normalizeQuestionBankGroup(groupName: string | undefined) {
  return (groupName ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
}
