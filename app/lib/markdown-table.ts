export function readMarkdownTable(lines: string[], start: number) {
  const cells = (line: string | undefined) => {
    const source = line?.trim() ?? "";
    if (!source.startsWith("|") || !source.endsWith("|")) return [];
    return source.slice(1, -1).split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, "|"));
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
