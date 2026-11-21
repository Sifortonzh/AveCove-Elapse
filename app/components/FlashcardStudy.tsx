"use client";
import {useEffect, useRef, useState, type ReactNode} from "react";
import type {SavedQuestionBank} from "../lib/local-bank";
import {createSharedQuestionBankPackage} from "../lib/local-bank";
import {AiDialogue, ChapterDirectory} from "./PracticeExtras";
import NotePreviewDialog from "./NotePreviewDialog";
import FlashcardKnowledgeTree from "./FlashcardKnowledgeTree";
import {ArrowLeft, ChevronLeft, ChevronRight, Layers, Star, NotebookPen, Eye, EyeOff, Pencil, Shuffle, Download, Printer} from "lucide-react";
import "./FlashcardStudy.css";
import {QuestionImages} from "./QuestionImages";
import type {QuizQuestion} from "../lib/question-parser";
import FlashcardGuide from "./FlashcardGuide";
import {parseFlashcards} from "../lib/flashcards";
import {printNotePdf} from "../lib/note-pdf-export";

export function FlashcardImport({onSave,onClose}:{onSave:(bank:ReturnType<typeof parseFlashcards>)=>Promise<void>;onClose:()=>void}){
 const [error,setError]=useState("");const [busy,setBusy]=useState(false);
 return <div className="modal-layer"><section className="settings-modal"><header><h2>⚡ 红豆闪卡导入</h2><button onClick={onClose}>关闭</button></header><input type="file" accept=".json,application/json" disabled={busy} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;setBusy(true);setError("");try{if(f.size>24000000)throw Error("请选择小于 24 MB 的 JSON");await onSave(parseFlashcards(JSON.parse(await f.text())));onClose();}catch(err){setError(err instanceof Error?err.message:"导入失败");}finally{setBusy(false);}}}/><FlashcardGuide />{error&&<p role="alert">{error}</p>}</section></div>;
}

// Study layout follows the ordinary practice shell.
type FlashcardStudyProps = {
 bank: SavedQuestionBank; notes: Record<string,string>; favorites: string[]; accountId?: string; defaultQuick?: boolean;
 onNote: (id:string,text:string)=>void; onStar:(id:string)=>void; onSave:(bank:SavedQuestionBank)=>Promise<void>;
 onBack:()=>void; renderMarkdown:(value:string)=>ReactNode;
};

export default function FlashcardStudy({bank,notes,favorites,accountId,defaultQuick=false,onNote,onStar,onSave,onBack,renderMarkdown}:FlashcardStudyProps) {
 const [index,setIndex]=useState(0), [revealed,setRevealed]=useState(false), [quick,setQuick]=useState(defaultQuick);
 const [editing,setEditing]=useState(false), [error,setError]=useState(""), [busy,setBusy]=useState(false);
 const [retry,setRetry]=useState<string[]>([]), [remembered,setRemembered]=useState<string[]>([]);
 const [front,setFront]=useState(""), [back,setBack]=useState("");
 const [chapters,setChapters]=useState(false), [sheet,setSheet]=useState(false), [preview,setPreview]=useState(false), [notesOpen,setNotesOpen]=useState(false);
 const currentButton=useRef<HTMLButtonElement>(null), noteEditor=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>{ if(sheet) currentButton.current?.scrollIntoView({block:"center"}); },[sheet,index]);
 const q=bank.questions[Math.min(index,bank.questions.length-1)];
 if(!q) return null;
 const move=(n:number)=>{setIndex(Math.max(0,Math.min(n,bank.questions.length-1)));setRevealed(false);setEditing(false);setNotesOpen(false);setError("");};
 const open=(id:string)=>{const next=bank.questions.findIndex(q=>q.id===id);if(next>=0)move(next);};
 const next=()=>move(index+1);
 const flip=()=>setRevealed(value=>!value);
 const exportDeck=()=>{
   const payload={format:"hongdou-flashcards",version:1,bank:{name:bank.name,groupName:bank.groupName,description:bank.description,cards:bank.questions.map(q=>({id:q.id,front:q.stem,back:q.flashcardAnswer,category:q.category}))},provenance:createSharedQuestionBankPackage(bank).provenance};
   const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download=`${bank.name}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 const note=notes[q.id]??"";
 return <div className="quiz-shell flashcard-review">
  <header className="quiz-header"><button className="icon-button" onClick={onBack} aria-label="返回闪卡库"><ArrowLeft/></button><strong className="flashcard-brand">唯快不破</strong><div className="quiz-header-progress"><button className="chapter-trigger" onClick={()=>setChapters(true)}>{bank.name} · {q.category} ▾</button><div><i style={{width:`${(index+1)/bank.questions.length*100}%`}}/></div><b>{index+1}/{bank.questions.length} · 本轮记住 {remembered.length}</b></div></header>
  <div className="quiz-workspace flashcard-workspace"><section className="question-pane flashcard-question-pane">
   <div className="question-topline"><span className="question-kind">{index+1} · 闪卡</span><span>{q.sourceNumber}</span></div>
   <article className="question-body"><div className="flashcard-front">{renderMarkdown(q.stem)}</div><QuestionImages images={q.sourceImages} extraImages={q.images}/>
    <div className={`flashcard-face ${revealed?"revealed":"concealed"}`} role="button" tabIndex={0} aria-label={revealed?"遮蔽答案或过卡":"显示闪卡答案"} aria-expanded={revealed} onClick={event=>{if((event.target as HTMLElement).closest("a,button,input,textarea,select"))return;if(revealed&&quick)next();else flip();}} onKeyDown={event=>{if(event.target!==event.currentTarget)return;if(event.key==="Enter"||event.key===" "){event.preventDefault();if(revealed&&quick)next();else flip();}}}>
     {revealed?<div className="flashcard-answer">{renderMarkdown(q.flashcardAnswer??"")}</div>:<><div className="flashcard-shadow-lines" aria-hidden="true"><i/><i/><i/></div><span className="flashcard-cover"><Eye size={22}/>点击显示答案</span></>}
    </div>
   </article>
   <div className="quiz-actions"><button className="subtle-button" disabled={index===0} onClick={()=>move(index-1)}><ChevronLeft/>上一张</button><button className="primary-action" onClick={flip}>{revealed?<EyeOff/>:<Eye/>}{revealed?"遮蔽闪卡":"显示闪卡"}</button><button disabled={index===bank.questions.length-1} onClick={next}>下一张<ChevronRight/></button></div>
   <details className="note-card flashcard-notes" open={notesOpen} onToggle={event=>setNotesOpen(event.currentTarget.open)}><summary><NotebookPen size={20}/><strong>批注与笔记</strong>{note.trim()&&<span>●</span>}<button type="button" disabled={!note.trim()} onClick={event=>{event.preventDefault();setPreview(true);}}>MD 放大查看</button></summary><div className="flashcard-note-body">{note.trim()&&<div className="note-preview-compact">{renderMarkdown(note)}</div>}<textarea ref={noteEditor} aria-label="闪卡笔记" placeholder="支持 Markdown、批注与笔记" value={note} onChange={event=>onNote(q.id,event.target.value)}/></div></details>
   {revealed&&<FlashcardKnowledgeTree key={q.id} card={q} deck={bank.questions} accountId={accountId} renderMarkdown={renderMarkdown} onSave={text=>{onNote(q.id,[notes[q.id],text].filter(Boolean).join("\n\n"));setNotesOpen(true);}}/>}
   {editing&&<form className="flashcard-edit" onSubmit={async event=>{event.preventDefault();setBusy(true);try{await onSave({...bank,questions:bank.questions.map(x=>x.id===q.id?{...x,stem:front.trim(),flashcardAnswer:back.trim(),options:[{label:"A",text:back.trim()}]}:x)});setEditing(false);}catch{setError("保存失败，请重试");}finally{setBusy(false);}}}><label>正面<textarea value={front} onChange={e=>setFront(e.target.value)}/></label><label>反面<textarea value={back} onChange={e=>setBack(e.target.value)}/></label><button disabled={busy||!front.trim()||!back.trim()}>保存</button><button type="button" onClick={()=>setEditing(false)}>取消</button></form>}
   {error&&<p role="alert">{error}</p>}
  </section>
  <aside className="flashcard-tools"><section className="flashcard-tool-card"><h2>闪卡操作</h2><div className="flashcard-tool-grid">
   <button onClick={()=>onStar(q.id)} aria-pressed={favorites.includes(q.id)}><Star fill={favorites.includes(q.id)?"currentColor":"none"}/>{favorites.includes(q.id)?"已精选":"精选"}</button><button onClick={()=>setSheet(true)}><Layers/>答题卡</button>
   <button disabled={index===bank.questions.length-1} onClick={next}><ChevronRight/>Pass</button><button onClick={()=>{setNotesOpen(true);requestAnimationFrame(()=>{noteEditor.current?.scrollIntoView({block:"center",behavior:"smooth"});noteEditor.current?.focus();});}}><NotebookPen/>笔记</button>
   <button onClick={()=>{setFront(q.stem);setBack(q.flashcardAnswer??"");setEditing(true);}}><Pencil/>改</button><button onClick={()=>move(Math.floor(Math.random()*bank.questions.length))}><Shuffle/>随机</button>
   <button onClick={exportDeck}><Download/>JSON</button><button onClick={()=>{try{printNotePdf(bank.name,[{title:"闪卡",questions:bank.questions}],notes);}catch{setError("请允许浏览器打开打印窗口");}}}><Printer/>PDF</button>
  </div><label className="flashcard-quick"><input type="checkbox" checked={quick} onChange={e=>setQuick(e.target.checked)}/>揭示后点击直接过卡</label>
   {revealed&&<div className="flashcard-recall"><button onClick={()=>{setRetry(ids=>ids.includes(q.id)?ids:[...ids,q.id]);setRemembered(ids=>ids.filter(id=>id!==q.id));next();}}>再练</button><button onClick={()=>{setRemembered(ids=>ids.includes(q.id)?ids:[...ids,q.id]);setRetry(ids=>ids.filter(id=>id!==q.id));next();}}>记住了</button></div>}
   <button className="flashcard-retry" disabled={!retry.length} onClick={()=>{open(retry[0]);setRetry(ids=>ids.slice(1));}}>重练 {retry.length}</button>
  </section>{revealed&&<section className="flashcard-tool-card"><AiDialogue key={q.id} question={q as QuizQuestion} accountId={accountId} renderMarkdown={renderMarkdown} onSave={text=>{onNote(q.id,[notes[q.id],text].filter(Boolean).join("\n\n"));setNotesOpen(true);}}/></section>}</aside></div>
  {chapters&&<ChapterDirectory cardMode questions={bank.questions} progress={{}} currentQuestionId={q.id} onOpen={open} onClose={()=>setChapters(false)}/>}
  {sheet&&<div className="modal-layer" onMouseDown={()=>setSheet(false)}><section className="search-modal flashcard-sheet" role="dialog" aria-modal="true" aria-label="闪卡答题卡" onMouseDown={e=>e.stopPropagation()}><header><h2>答题卡 · {bank.questions.length} 张</h2><button onClick={()=>setSheet(false)}>关闭</button></header><div className="number-grid">{bank.questions.map((card,i)=><button ref={card.id===q.id?currentButton:undefined} key={card.id} className={`${card.id===q.id?"current":""} ${remembered.includes(card.id)?"remembered":""}`} aria-current={card.id===q.id?"true":undefined} aria-label={`第 ${i+1} 张${favorites.includes(card.id)?"，精选":""}${notes[card.id]?.trim()?"，有笔记":""}`} onClick={()=>{move(i);setSheet(false);}}>{i+1}{favorites.includes(card.id)&&<Star size={12}/>} {notes[card.id]?.trim()&&<NotebookPen size={12}/>} {retry.includes(card.id)&&<span>↻</span>}</button>)}</div></section></div>}
  {preview&&<NotePreviewDialog onClose={()=>setPreview(false)}>{renderMarkdown(note)}</NotePreviewDialog>}
 </div>;
}
