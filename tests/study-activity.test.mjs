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

test("monthly arena excludes previous months, sorts fairly and never returns account identifiers", async () => {
  const raw=await readFile(new URL("../app/lib/leaderboard.ts",import.meta.url),"utf8");
  const dependency=ts.transpileModule(await readFile(new URL("../app/lib/record-sync.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
  const source=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replace('"./record-sync"',JSON.stringify(`data:text/javascript;base64,${Buffer.from(dependency).toString("base64")}`));
  const {monthlyRanks}=await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const row=(id,seconds,answers)=>({user_id:id,nickname:id,activity:{[`2026-11-06|3|${id}`]:{seconds,answers,graded:answers,correct:0,start:1,end:seconds*1000+1}}});
  const rows=[row("slow",600,10),row("fast",200,20),row("few",100,1)];
  assert.deepEqual(monthlyRanks(rows,"2026-11","fast","time").map(x=>x.nickname),["slow","fast","few"]);
  assert.deepEqual(monthlyRanks(rows,"2026-11","fast","average").map(x=>x.nickname),["fast","slow"]);
  assert.equal(monthlyRanks(rows,"2026-10","fast","time").length,0);
  assert.equal(monthlyRanks(Array.from({length:15},(_,i)=>row(`p${i}`,i+1,10)),"2026-11","none","time").length,10);
  assert.equal(monthlyRanks(rows,"2026-11","fast","time")[1].own,true);
  assert.ok(!JSON.stringify(monthlyRanks(rows,"2026-11","fast","time")).includes("user_id"));
});
test("bulk slash removal keeps source evidence and refuses an empty bank", async()=>{
  const {removeMarkedQuestions}=await moduleAt("question-edit");
  const items=[{id:"a",sourceNumber:"11"},{id:"b",sourceNumber:"12"},{id:"c",sourceNumber:"13"}];
  assert.deepEqual(removeMarkedQuestions(items,["b","missing"]).questions,[items[0],items[2]]);
  assert.equal(items.length,3); assert.throws(()=>removeMarkedQuestions(items,["a","b","c"]),/至少保留/);
  const page=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
  assert.ok(page.indexOf('<details className="note-card collapsible-note-card"')<page.indexOf('<details className="community-card"'));
  assert.match(page,/await exportLearningRecord\(\);\s*const saved = await saveQuestionBank/);
});

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
