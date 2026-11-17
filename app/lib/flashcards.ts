import type { QuizQuestion } from "./question-parser";
import type { QuestionBankInput } from "./local-bank";

export const isFlashcardBank = (bank: { questions: QuizQuestion[] }) => bank.questions.length > 0 && bank.questions.every(q => typeof q.flashcardAnswer === "string");
export const FLASHCARD_PROMPT = '请将资料整理为红豆闪卡 JSON。只输出 JSON，不猜测缺失信息。格式：{"format":"hongdou-flashcards","version":1,"bank":{"name":"名称","groupName":"科目","description":"说明","cards":[{"id":"1","front":"问题或概念","back":"答案，支持 Markdown 表格","category":"章节"}]}}。每张卡正反面必须非空，保持原章节顺序。不要包含个人隐私或未获授权内容。';
export const FLASHCARD_LEARNING_PROMPT = `${FLASHCARD_PROMPT} 制卡规则：先理解后拆分；每张卡只考一个可独立回忆的要点，问题明确、保留必要上下文；长列表拆成多卡；答案简洁，解释和来源放反面，禁止在正面泄露答案；医学剂量、单位及结论严格保留原文，不擅自推断。id 必须唯一。`;
export const FLASHCARD_EXAMPLE = { format: "hongdou-flashcards", version: 1, bank: { name: "闪卡示例", groupName: "学习方法", cards: [{ id: "recall-1", front: "主动回忆的关键步骤是什么？", back: "先尝试回忆，再揭示答案并核对。", category: "主动回忆" }] } };

export function parseFlashcards(value: unknown): QuestionBankInput {
  const input = value as { format?: string; version?: number; bank?: { name?: string; groupName?: string; description?: string; cards?: Array<{id?:string;front?:string;back?:string;category?:string}> } };
  if (input?.format !== "hongdou-flashcards" || input.version !== 1 || !Array.isArray(input.bank?.cards) || !input.bank.cards.length || input.bank.cards.length > 20000) throw new Error("请选择 version 1 的红豆闪卡 JSON，cards 至少一张，最多 20000 张。");
  const bank = input.bank;
  const ids = new Set<string>();
  const questions = bank.cards!.map((card, i): QuizQuestion => {
    if (!card || typeof card !== "object") throw new Error(`第 ${i + 1} 张闪卡格式无效。`);
    const id = typeof card.id === "string" && card.id.trim() ? card.id.trim() : String(i + 1);
    if (ids.has(id)) throw new Error(`闪卡 id 重复：${id}，请使用唯一 id。`);
    ids.add(id);
    if (typeof card.front !== "string" || typeof card.back !== "string" || !card.front.trim() || !card.back.trim() || card.front.length + card.back.length > 100000) throw new Error(`第 ${i+1} 张闪卡正反面无效。`);
    return {id,sourceNumber:String(i+1),category:typeof card.category === "string" ? card.category.slice(0,200) || "未分类" : "未分类",stem:card.front.trim(),flashcardAnswer:card.back.trim(),options:[{label:"A",text:card.back.trim()}],answer:["A"],multiple:false};
  });
  return {name:bank.name?.slice(0,160) || "闪卡",description:bank.description?.slice(0,4000),groupName:bank.groupName,questions,importedAt:new Date().toISOString()};
}

export function questionFlashcard(q: QuizQuestion, back?: string): QuizQuestion {
  if (back === undefined && (!q.answer.length || q.answerPending)) throw new Error("题目暂无确定答案，请补录后制卡，或从笔记制作闪卡。");
  const answer = back ?? [q.answer.map(label => { const option=q.options.find(o=>o.label===label); return option ? `${label}. ${option.text}` : label; }).join("\n"),q.explanation].filter(Boolean).join("\n\n");
  if (!answer.trim()) throw new Error("题目暂无答案，请先补录答案或从笔记制作闪卡。");
  return {...q,id:`flash-${q.id}`,flashcardSourceId:q.id,stem:[q.sharedStem,q.stem].filter(Boolean).join("\n"),sharedStem:undefined,sharedStemGroup:undefined,sharedOptionGroup:undefined,flashcardAnswer:answer,options:[{label:"A",text:answer}],answer:["A"],answerPending:false,multiple:false,questionType:"A",medicalQuestionType:"A1"};
}
