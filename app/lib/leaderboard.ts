import { mergeStudyActivity } from "./record-sync";

export type RankMetric = "time" | "answers" | "average";
export type RankEntry = { nickname: string; seconds: number; answers: number; average: number; own: boolean };
export function monthlyRanks(rows: { user_id: string; nickname: string; activity: unknown }[], month: string, owner: string, metric: RankMetric): RankEntry[] {
  return rows.map(row => {
    const values = Object.entries(mergeStudyActivity(row.activity)).filter(([key]) => key.startsWith(month + "-"));
    const seconds = values.reduce((sum, [, value]) => sum + value.seconds, 0);
    const answers = values.reduce((sum, [, value]) => sum + value.answers, 0);
    return { nickname: (row.nickname || "红豆同学").slice(0, 20), seconds: Math.round(seconds), answers, average: answers ? Math.round(seconds / answers) : 0, own: row.user_id === owner };
  }).filter(row => metric === "average" ? row.answers >= 10 && row.seconds > 0 : row.answers > 0 || row.seconds > 0)
    .sort((a, b) => (metric === "average" ? a.average - b.average : metric === "answers" ? b.answers - a.answers : b.seconds - a.seconds) || b.answers - a.answers || a.nickname.localeCompare(b.nickname))
    .slice(0, 10);
}
