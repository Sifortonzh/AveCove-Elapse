export type TagAction = "add" | "rename" | "delete";

export function cleanNoteTag(value: string): string {
  return value.trim().replace(/^#+/, "").replace(/[^\p{L}\p{N}_-]/gu, "").slice(0, 24);
}

export function noteTagCatalog(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((tag): tag is string => typeof tag === "string").map(cleanNoteTag).filter(Boolean))].slice(0, 1000);
}

export function changeNoteTags(notes: Record<string, string>, catalog: string[], action: TagAction, original: string, replacement = "") {
  const tag = cleanNoteTag(original);
  const next = action === "rename" ? cleanNoteTag(replacement) : tag;
  if (!tag || !next) throw new Error("请输入标签名称，支持中文、英文、数字、_ 和 - 🏷️");
  const allTags = new Set([...catalog, ...Object.values(notes).flatMap(note => [...note.matchAll(/#([\p{L}\p{N}_-]{1,24})/gu)].map(match => match[1]))]);
  if (action !== "add" && !allTags.has(tag)) throw new Error("这个标签已不存在，请刷新后重试。");
  if (action === "add") allTags.add(tag);
  else { allTags.delete(tag); if (action === "rename") allTags.add(next); }
  const changedIds: string[] = [];
  const result = Object.fromEntries(Object.entries(notes).map(([id, markdown]) => {
    const rewritten = action === "add" ? markdown : markdown.replace(/#([\p{L}\p{N}_-]{1,24})/gu,
      (match, found: string) => found === tag ? action === "rename" ? `#${next}` : "" : match);
    if (rewritten !== markdown) changedIds.push(id);
    return [id, rewritten];
  }));
  return { notes: result, catalog: noteTagCatalog([...allTags]).sort((a,b) => a.localeCompare(b,"zh-CN")), changedIds };
}
