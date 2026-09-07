// Contract bridge invokes the production importer, without browser persistence.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import ts from 'typescript';
const compile = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64');
const grouping = compile(await readFile('app/lib/bank-grouping.ts', 'utf8'));
const source = (await readFile('app/lib/local-bank.ts', 'utf8')).replace(/from "\.\/bank-grouping"/g, `from "${grouping}"`);
const { parseSharedQuestionBankPackage } = await import(compile(source));
let input = '';
for await (const chunk of process.stdin) input += chunk;
const parsed = parseSharedQuestionBankPackage(JSON.parse(input));
assert.ok(parsed);
assert.equal(parsed.questions.length, 1);
assert.deepEqual(parsed.questions[0].answer, ['B']);
assert.ok(parsed.questions[0].category.includes('总论'));
console.log('contract passed');
