import type { QuizQuestion } from "./question-parser";

type GroupRule = { name: string; pattern: RegExp };

const GROUP_RULES: GroupRule[] = [
  { name: "考研西综306", pattern: /(?:西医综合|西综|临床医学综合能力\s*[（(]?西医[）)]?|(?:^|\D)306(?:\D|$))/i },
  { name: "儿科学", pattern: /儿科|新生儿|小儿/i },
  { name: "妇产科学", pattern: /妇产|产科|妇科|妊娠|分娩/i },
  { name: "耳鼻咽喉科学", pattern: /耳鼻咽喉|耳科|鼻科|咽喉/i },
  { name: "医学影像学", pattern: /影像|放射|CT|MRI|超声/i },
  { name: "全科医学", pattern: /全科|社区医学|家庭医学/i },
  { name: "眼科学", pattern: /眼科学?|眼科主治|眼底|青光眼|白内障/ },
  { name: "皮肤性病学", pattern: /皮肤|性病/ },
  { name: "传染病学", pattern: /传染病|感染病学/ },
  { name: "急诊医学", pattern: /急诊|急救医学|灾难医学/ },
  { name: "口腔科学", pattern: /口腔/ },
  { name: "康复医学", pattern: /康复/ },
  { name: "神经精神病学", pattern: /神经病|精神病|神经精神/ },
  { name: "内科学", pattern: /内科学|内科主治/ },
  { name: "外科学", pattern: /外科学|外科主治/ },
];

export function suggestQuestionBankGroup(name: string, questions: QuizQuestion[] = []) {
  const keywords = `${name}\n${questions.slice(0, 24).map((question) => `${question.category} ${question.stem}`).join("\n")}`;
  return GROUP_RULES.find((rule) => rule.pattern.test(keywords))?.name ?? "";
}

export function normalizeQuestionBankGroup(groupName: string | undefined) {
  return (groupName ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
}

export function pavilionSubject(name: string, groupName?: string, sourceTitle = "") {
  const group = normalizeQuestionBankGroup(groupName);
  if (group && !/^(?:大[一二三四五](?:[上下])?|考研|执医|主治|副高|其他|未分组)$/.test(group)) {
    return group;
  }
  return suggestQuestionBankGroup(`${name}\n${sourceTitle}`) || "未分组";
}
