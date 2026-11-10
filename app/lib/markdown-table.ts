export function readMarkdownTable(lines: string[], start: number) {
  const cells = (line: string | undefined) => {
    const source = line?.trim() ?? "";
    if (!/(?<!\\)\|/.test(source)) return [];
    return source.replace(/^\||(?<!\\)\|$/g, "").split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, "|"));
  };
  const headers = cells(lines[start]);
  const divider = cells(lines[start + 1]);
  if (headers.length < 2 || headers.length !== divider.length || !divider.every(cell => /^:?-{3,}:?$/.test(cell))) return null;
  let next = start + 2;
  const rows: string[][] = [];
  while (next < lines.length) {
    const row = cells(lines[next]);
    if (row.length !== headers.length) break;
    rows.push(row);
    next++;
  }
  return { headers, rows, next };
}

type InlineToken = { kind: "text" | "code" | "strong" | "italic" | "strongItalic" | "strike" | "underline" | "break"; text: string };

// Interpret only the supported formatting markers. Everything else stays
// as text; AI output never becomes executable HTML.
export function markdownInlineTokens(input: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const patterns = /(`[^`\n]+`)|(<br\s*\/?>|&lt;br\s*\/?&gt;|\\<br\s*\\?\/?>)|(\*\*\*[^*\n]+\*\*\*|___[^_\n]+___)|(\*\*[^*\n]+\*\*|__[^_\n]+__)|(\*[^*\n]+\*|(?<![\p{L}\p{N}])_[^_\n]+_(?![\p{L}\p{N}]))|(~~[^~\n]+~~|<s>[^<\n]+<\/s>|<del>[^<\n]+<\/del>)|(<u>[^<\n]+<\/u>)/giu;
  let offset = 0;
  for (const match of input.matchAll(patterns)) {
    const index = match.index;
    if (index > offset) tokens.push({ kind: "text", text: input.slice(offset, index) });
    const [, code, lineBreak, strongItalic, strong, italic, strike, underline] = match;
    if (code) tokens.push({ kind: "code", text: code.slice(1, -1) });
    else if (lineBreak) tokens.push({ kind: "break", text: "" });
    else if (strongItalic) tokens.push({ kind: "strongItalic", text: strongItalic.slice(3, -3) });
    else if (strong) tokens.push({ kind: "strong", text: strong.slice(2, -2) });
    else if (italic) tokens.push({ kind: "italic", text: italic.slice(1, -1) });
    else if (strike) tokens.push({ kind: "strike", text: strike.startsWith("~~") ? strike.slice(2, -2) : strike.replace(/<\/?(?:s|del)>/gi, "") });
    else if (underline) tokens.push({ kind: "underline", text: underline.slice(3, -4) });
    offset = index + match[0].length;
  }
  if (offset < input.length) tokens.push({ kind: "text", text: input.slice(offset) });
  return tokens;
}
