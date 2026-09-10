type PdfTextItem = {
  str: string;
  width?: number;
  height?: number;
  transform?: number[];
  hasEOL?: boolean;
};

type PdfOperatorList = {
  fnArray: ArrayLike<number>;
  argsArray: ArrayLike<unknown>;
};

type PdfOperatorIds = {
  setFillRGBColor: number;
  constructPath: number;
};

type Rectangle = { x0: number; y0: number; x1: number; y1: number };

function isYellowFill(value: unknown) {
  const direct = Array.isArray(value) ? value[0] : value;
  if (typeof direct === "string") {
    return ["#ffff00", "#fff000", "#ffeb00", "#ffd700"].includes(direct.toLowerCase());
  }
  if (ArrayBuffer.isView(direct)) {
    const channels = Array.from(direct as unknown as ArrayLike<number>);
    const scale = Math.max(...channels.slice(0, 3)) <= 1 ? 1 : 255;
    return (channels[0] ?? 0) / scale > 0.86
      && (channels[1] ?? 0) / scale > 0.78
      && (channels[2] ?? 1) / scale < 0.3;
  }
  return false;
}

function answerHighlightRectangles(operatorList: PdfOperatorList, ops: PdfOperatorIds) {
  const rectangles: Rectangle[] = [];
  let yellow = false;
  for (let index = 0; index < operatorList.fnArray.length; index += 1) {
    const operation = operatorList.fnArray[index];
    const args = operatorList.argsArray[index] as unknown[] | undefined;
    if (operation === ops.setFillRGBColor) {
      yellow = isYellowFill(args);
      continue;
    }
    if (!yellow || operation !== ops.constructPath) continue;
    const bounds = args?.[2];
    if (!bounds || (!Array.isArray(bounds) && !ArrayBuffer.isView(bounds))) continue;
    const values = Array.from(bounds as ArrayLike<number>);
    if (values.length < 4 || values.some((value) => !Number.isFinite(value))) continue;
    const [left, bottom, right, top] = values;
    rectangles.push({
      x0: Math.min(left, right),
      y0: Math.min(bottom, top),
      x1: Math.max(left, right),
      y1: Math.max(bottom, top),
    });
  }
  return rectangles;
}

function overlaps(left: Rectangle, right: Rectangle) {
  return left.x0 < right.x1 && left.x1 > right.x0 && left.y0 < right.y1 && left.y1 > right.y0;
}

function textBox(item: PdfTextItem): Rectangle | null {
  const transform = item.transform;
  if (!transform || transform.length < 6) return null;
  const height = Math.max(Math.abs(item.height ?? 0), Math.abs(transform[3] ?? 0), 1);
  const width = Math.max(Math.abs(item.width ?? 0), 1);
  return { x0: transform[4], y0: transform[5], x1: transform[4] + width, y1: transform[5] + height };
}

/** Converts a highlighted option into an explicit source-answer marker. */
export function pdfPageTextWithHighlightedAnswers(
  items: Array<PdfTextItem | Record<string, unknown>>,
  operatorList: PdfOperatorList,
  ops: PdfOperatorIds,
) {
  const highlights = answerHighlightRectangles(operatorList, ops);
  const lines: Array<{ parts: string[]; highlighted: boolean; y: number | null }> = [];
  let current: { parts: string[]; highlighted: boolean; y: number | null } | null = null;

  const flush = () => {
    if (current?.parts.some(Boolean)) lines.push(current);
    current = null;
  };

  for (const candidate of items) {
    if (!("str" in candidate) || typeof candidate.str !== "string") continue;
    const item = candidate as PdfTextItem;
    const box = textBox(item);
    const y = box?.y0 ?? null;
    if (item.str && current && y !== null && current.y !== null && Math.abs(y - current.y) > 2.2) flush();
    if (!current) current = { parts: [], highlighted: false, y };
    if (item.str) {
      current.parts.push(item.str);
      if (box && highlights.some((highlight) => overlaps(box, highlight))) current.highlighted = true;
    }
    if (item.hasEOL) flush();
  }
  flush();

  return lines.map((line) => {
    const text = line.parts.join("").replace(/[ \t]+/g, " ").trim();
    const option = text.match(/^([A-GＡ-Ｇ])\s*[.．、)）]/i);
    if (!line.highlighted || !option || /(?:正确)?答案\s*[:：]/.test(text)) return text;
    return `${text} 答案：${option[1].toUpperCase()}`;
  }).filter(Boolean).join("\n");
}

type TsvWord = {
  block: string;
  paragraph: string;
  line: string;
  left: number;
  top: number;
  width: number;
  height: number;
  text: string;
};

/** Reads answer letters printed in green inside a visible `ABCD` key. */
export function greenAnswerTableFromTsv(tsv: string, pixels: Uint8ClampedArray, imageWidth: number, imageHeight: number) {
  const words = tsv.split(/\r?\n/).slice(1).flatMap<TsvWord>((row) => {
    const columns = row.split("\t");
    if (columns.length < 12 || columns[0] !== "5") return [];
    const [left, top, width, height] = columns.slice(6, 10).map((value) => Number.parseInt(value, 10));
    if (![left, top, width, height].every(Number.isFinite)) return [];
    return [{ block: columns[2], paragraph: columns[3], line: columns[4], left, top, width, height, text: columns.slice(11).join("\t").trim() }];
  });
  const answers: Array<{ number: number; answer: string }> = [];

  const greenPixels = (word: TsvWord) => {
    const croppedHeight = Math.min(word.height, Math.max(12, Math.round(word.width * 0.38)));
    const counts = [0, 0, 0, 0];
    for (let y = Math.max(0, word.top); y < Math.min(imageHeight, word.top + croppedHeight); y += 1) {
      for (let x = Math.max(0, word.left); x < Math.min(imageWidth, word.left + word.width); x += 1) {
        const offset = (y * imageWidth + x) * 4;
        const red = pixels[offset];
        const green = pixels[offset + 1];
        const blue = pixels[offset + 2];
        if (green < 48 || green - red < 12 || green <= red * 1.16 || green <= blue * 1.08) continue;
        const quarter = Math.min(3, Math.floor(((x - word.left) / Math.max(1, word.width)) * 4));
        counts[quarter] += 1;
      }
    }
    const maximum = Math.max(...counts);
    if (maximum < 8) return "";
    return "ABCD"[counts.indexOf(maximum)];
  };

  words.forEach((word, index) => {
    const compact = word.text.toUpperCase().replace(/[^A-D]/g, "");
    if (compact !== "ABCD") return;
    const sameLine = (candidate: TsvWord) => candidate.block === word.block
      && candidate.paragraph === word.paragraph && candidate.line === word.line;
    const previous = words.slice(Math.max(0, index - 4), index).reverse().find((candidate) => sameLine(candidate) && /^\d{1,3}[.．、:]?$/.test(candidate.text));
    const combinedNumber = word.text.match(/^(\d{1,3})[.．、:]?\s*A\s*B\s*C\s*D$/i)?.[1];
    const number = Number.parseInt(previous?.text.match(/\d+/)?.[0] ?? combinedNumber ?? "", 10);
    const answer = greenPixels(word);
    if (Number.isFinite(number) && number >= 1 && number <= 300 && answer) answers.push({ number, answer });
  });

  return [...new Map(answers.map((entry) => [entry.number, entry.answer])).entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([number, answer]) => `${number}.${answer}`)
    .join(" ");
}

type PdfViewportLike = { transform: number[] };

function isGreenPixel(pixels: Uint8ClampedArray, offset: number) {
  const red = pixels[offset];
  const green = pixels[offset + 1];
  const blue = pixels[offset + 2];
  return green >= 48 && green - red >= 10 && green > red * 1.12 && green > blue * 1.05;
}

/** Reads green A-D keys from the PDF OCR text layer, including several keys on one line. */
export function greenAnswerTableFromPdfItems(
  candidates: Array<PdfTextItem | Record<string, unknown>>,
  pixels: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  viewport: PdfViewportLike,
) {
  type Character = { value: string; x0: number; x1: number; y0: number; y1: number };
  const lines = new Map<number, Character[]>();
  const transformPoint = (x: number, y: number) => ({
    x: viewport.transform[0] * x + viewport.transform[2] * y + viewport.transform[4],
    y: viewport.transform[1] * x + viewport.transform[3] * y + viewport.transform[5],
  });
  const characterWeight = (value: string) => {
    if (/\s/.test(value)) return 0.28;
    if (/[.,．、:：]/.test(value)) return 0.3;
    if (/[A-Za-z]/.test(value)) return 0.72;
    if (/\d/.test(value)) return 0.56;
    return 1;
  };

  for (const candidate of candidates) {
    if (!("str" in candidate) || typeof candidate.str !== "string" || !candidate.str || !("transform" in candidate)) continue;
    const item = candidate as PdfTextItem;
    if (!item.transform || item.transform.length < 6) continue;
    const left = transformPoint(item.transform[4], item.transform[5]);
    const right = transformPoint(item.transform[4] + Math.max(0, item.width ?? 0), item.transform[5]);
    const scale = Math.hypot(viewport.transform[0], viewport.transform[1]);
    const height = Math.max(4, Math.abs(item.height ?? item.transform[3]) * scale);
    const baseline = Math.round(left.y / Math.max(2, height * 0.35));
    const weights = [...item.str].map(characterWeight);
    const total = weights.reduce((sum, value) => sum + value, 0) || 1;
    let cursor = Math.min(left.x, right.x);
    const span = Math.abs(right.x - left.x);
    const characters = lines.get(baseline) ?? [];
    [...item.str].forEach((value, index) => {
      const width = span * weights[index] / total;
      characters.push({ value, x0: cursor, x1: cursor + width, y0: left.y - height * 1.08, y1: left.y + height * 0.18 });
      cursor += width;
    });
    lines.set(baseline, characters);
  }

  const answers = new Map<number, string>();
  for (const unordered of lines.values()) {
    const characters = unordered.sort((left, right) => left.x0 - right.x0);
    const lineText = characters.map((character) => character.value).join("");
    for (const match of lineText.matchAll(/(\d{1,3})\s*[.．、:]\s*(A)\s*(B)\s*(C)\s*(D)/gi)) {
      const number = Number.parseInt(match[1], 10);
      if (number < 1 || number > 300 || match.index === undefined) continue;
      const letters: Array<{ letter: string; character: Character }> = [];
      const matched = match[0];
      for (const letter of "ABCD") {
        const localIndex = matched.toUpperCase().indexOf(letter, letters.at(-1) ? matched.toUpperCase().indexOf(letters.at(-1)!.letter) + 1 : 0);
        const character = characters[match.index + localIndex];
        if (character) letters.push({ letter, character });
      }
      const counts = letters.map(({ character }) => {
        let count = 0;
        for (let y = Math.max(0, Math.floor(character.y0) - 2); y < Math.min(imageHeight, Math.ceil(character.y1) + 2); y += 1) {
          for (let x = Math.max(0, Math.floor(character.x0) - 2); x < Math.min(imageWidth, Math.ceil(character.x1) + 2); x += 1) {
            if (isGreenPixel(pixels, (y * imageWidth + x) * 4)) count += 1;
          }
        }
        return count;
      });
      const maximum = Math.max(...counts);
      if (maximum >= 3) answers.set(number, "ABCD"[counts.indexOf(maximum)]);
    }
  }
  return [...answers.entries()].sort((left, right) => left[0] - right[0]).map(([number, answer]) => `${number}.${answer}`).join(" ");
}

export function mergeAnswerTables(...tables: string[]) {
  const answers = new Map<number, string>();
  tables.forEach((table) => {
    for (const match of table.matchAll(/(?:^|\s)(\d{1,3})\.([A-D])(?=\s|$)/g)) answers.set(Number(match[1]), match[2]);
  });
  return [...answers.entries()].sort((left, right) => left[0] - right[0]).map(([number, answer]) => `${number}.${answer}`).join(" ");
}
