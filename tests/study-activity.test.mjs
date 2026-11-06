import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function moduleAt(path) {
  const source = await readFile(new URL(`../app/lib/${path}.ts`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}
const stats = await moduleAt("study-activity"), records = await moduleAt("record-sync");
const at = (day, hour=12, minute=0, second=0) => new Date(2026, 10, day, hour, minute, second).getTime();

test("time splits at four-hour and midnight boundaries without changing input", () => {
  const original = {}, split = stats.addStudyActivity(original, "device-one", at(6,3,59,55),at(6,4,0,5),"correct");
  assert.deepEqual(original, {});
  assert.deepEqual(Object.values(split).map(r=>[r.seconds,r.answers,r.correct]),[[5,0,0],[5,1,1]]);
  const midnight = stats.addStudyActivity({},"device-two",at(6,23,59,55),at(7,0,0,5));
  assert.equal(Object.keys(midnight)[1],"2026-11-07|0|device-two");
  assert.deepEqual(stats.addStudyActivity({},"x",at(6),at(6)+21_000),{});
  assert.deepEqual(stats.addStudyActivity({},"x",at(6),at(6)-1),{});
});
test("answer counts and streaks exclude manufactured history", () => {
  let input = {};
  for (const day of [2,3,4,6]) input=stats.addStudyActivity(input,`s-${day}`,at(day),at(day)+10_000,"correct");
  input=stats.addStudyActivity(input,"pending",at(6),at(6),"pending");
  const summary=stats.activitySummary(input,at(6));
  assert.equal(summary.seconds,40); assert.equal(summary.answers,5);
  assert.equal(summary.longest,3); assert.equal(summary.current,1);
  assert.equal(stats.activitySummary(input,at(7)).current,1);
  assert.equal(stats.activitySummary(input,at(8)).current,0);
  assert.equal(summary.bestSlot,3);
  assert.equal(stats.activitySummary({},at(6)).bestSlot,null);
});
test("replayed sync is idempotent and independent device sessions add together", () => {
  const first=stats.addStudyActivity({},"mac",at(6),at(6)+10_000,"correct");
  const second=stats.addStudyActivity({},"ipad",at(6),at(6)+5_000,"wrong");
  const local=records.normalizeLearningRecords({activity:first});
  const replay=records.mergeLearningRecords(local,local);
  assert.deepEqual(replay,local);
  const merged=records.mergeLearningRecords(local,{activity:second});
  assert.equal(stats.activitySummary(merged.activity,at(6)).seconds,15);
  assert.equal(stats.activitySummary(merged.activity,at(6)).answers,2);
  assert.equal(records.learningRecordsEqual(local,merged),false);
  assert.deepEqual(records.normalizeLearningRecords({activity:{bad:{seconds:100}}}),records.normalizeLearningRecords({}));
});
test("day week month and leap-year series use calendar periods", () => {
  const input=stats.addStudyActivity({},"a",at(6),at(6)+10_000);
  assert.equal(stats.activitySeries(input,"day",at(6)).length,6);
  const week=stats.activitySeries(input,"week",at(6));
  assert.equal(week[0].key,"2026-11-02");assert.equal(week[4].seconds,10);
  assert.equal(stats.activitySeries(input,"month",at(6)).length,30);
  assert.equal(stats.activitySeries(input,"year",at(6)).length,12);
  assert.equal(stats.activitySeries({},"month",new Date(2028,1,1).getTime()).length,29);
});
test("account changes isolate activity and API includes activity in record merging", async () => {
  const page=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
  const route=await readFile(new URL("../app/api/sync/route.ts",import.meta.url),"utf8");
  assert.match(page,/learningOwnerRef.current !== owner/);
  assert.match(page,/activity: restored.activity \?\? \{\}/);
  assert.match(route,/activity: currentPayload.activity/);assert.match(route,/activity: allowed.activity/);
  assert.match(route,/activity: records.activity/);
});
