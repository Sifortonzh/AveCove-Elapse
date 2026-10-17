import type { QuizQuestion } from "./question-parser";

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Largest-remainder allocation keeps chapter quotas within one question of their share. */
export function sampleExamByChapter(questions: readonly QuizQuestion[], limit = 100, random: () => number = Math.random): QuizQuestion[] {
  const unique = [...new Map(questions.map(question => [question.id, question])).values()];
  const target = Math.min(unique.length, Math.max(0, Math.floor(limit)));
  if (!target) return [];
  const groups = new Map<string, QuizQuestion[]>();
  for (const question of unique) {
    const chapter = question.category.trim() || "未分章";
    const group = groups.get(chapter) ?? [];
    group.push(question);
    groups.set(chapter, group);
  }
  const quotas = [...groups.values()].map(group => {
    const exact = target * group.length / unique.length;
    return { group, count: Math.floor(exact), remainder: exact - Math.floor(exact), tie: random() };
  });
  let remaining = target - quotas.reduce((sum, quota) => sum + quota.count, 0);
  for (const quota of [...quotas].sort((a, b) => b.remainder - a.remainder || a.tie - b.tie)) {
    if (remaining-- <= 0) break;
    quota.count++;
  }
  return shuffled(quotas.flatMap(({ group, count }) => shuffled(group, random).slice(0, count)), random);
}
