const OPTION_TEXT_PREFIX = "> 选项 ";

export type OptionAnnotation = {
  text: string;
  images: string[];
};

function textMarker(label: string) {
  return `${OPTION_TEXT_PREFIX}${label.toUpperCase()} 批注：`;
}

function imagePattern(label: string) {
  return new RegExp(`!\\[选项 ${label.toUpperCase()} 批注图片\\]\\((data:image\\/jpeg;base64,[A-Za-z0-9+/=]+)\\)`, "g");
}

export function readOptionAnnotation(note: string, label: string): OptionAnnotation {
  const marker = textMarker(label);
  const text = note.split("\n").find((line) => line.startsWith(marker))?.slice(marker.length).trim() ?? "";
  const images = [...note.matchAll(imagePattern(label))].map((match) => match[1]);
  return { text, images };
}

export function updateOptionAnnotationText(note: string, label: string, text: string) {
  const marker = textMarker(label);
  const lines = note.split("\n").filter((line) => !line.startsWith(marker));
  const clean = text.replace(/\s*\n\s*/g, " ").trim();
  return [...lines, ...(clean ? [`${marker}${clean}`] : [])].join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function appendOptionAnnotationImage(note: string, label: string, dataUrl: string) {
  const marker = `![选项 ${label.toUpperCase()} 批注图片](${dataUrl})`;
  if (note.includes(marker)) return note;
  return `${note.trimEnd()}\n\n${marker}\n`.trimStart();
}

export function removeOptionAnnotationImage(note: string, label: string, index: number) {
  let current = -1;
  return note.replace(imagePattern(label), (match) => {
    current += 1;
    return current === index ? "" : match;
  }).replace(/\n{3,}/g, "\n\n").trim();
}

export function hasOptionAnnotation(note: string) {
  return /^> 选项 [A-G] 批注：\s*\S/m.test(note)
    || /!\[选项 [A-G] 批注图片\]\(data:image\/jpeg;base64,/m.test(note);
}

export function noteImageMarkdown(note: string) {
  return [...note.matchAll(/!\[[^\]]*\]\((data:image\/jpeg;base64,[A-Za-z0-9+/=]+)\)/g)]
    .map((match) => match[0]);
}
