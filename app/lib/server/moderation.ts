const blockedTerms = ["代考", "卖答案", "裸聊", "博彩", "赌博", "办证", "刷单", "引流", "加微信"];

export function moderateComment(text: string) {
  const normalized = text.replace(/\s+/g, "").toLowerCase();
  const matched = blockedTerms.find((term) => normalized.includes(term));
  return { status: matched ? "pending" as const : "published" as const, reason: matched ? `命中待审核词：${matched}` : null };
}
