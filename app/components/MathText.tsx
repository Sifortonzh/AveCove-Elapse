import katex from "katex";

type MathTextProps = {
  text: string;
  className?: string;
};

const DELIMITED_MATH = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\])/g;
const COMPLETE_MATH = /^(?:\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\])$/;

function formulaSource(part: string) {
  if (part.startsWith("$$") && part.endsWith("$$")) return { value: part.slice(2, -2), display: true };
  if (part.startsWith("\\[") && part.endsWith("\\]")) return { value: part.slice(2, -2), display: true };
  if (part.startsWith("\\(") && part.endsWith("\\)")) return { value: part.slice(2, -2), display: false };
  return { value: part.slice(1, -1), display: false };
}

export function MathText({ text, className }: MathTextProps) {
  const parts = text.split(DELIMITED_MATH).filter(Boolean);
  return <span className={className}>{parts.map((part, index) => {
    if (!COMPLETE_MATH.test(part)) return <span key={index}>{part}</span>;
    const formula = formulaSource(part);
    const html = katex.renderToString(formula.value, {
      displayMode: formula.display,
      output: "htmlAndMathml",
      strict: "ignore",
      throwOnError: false,
      trust: false,
    });
    return <span
      className={formula.display ? "elapse-math elapse-math-display" : "elapse-math"}
      dangerouslySetInnerHTML={{ __html: html }}
      key={index}
    />;
  })}</span>;
}
