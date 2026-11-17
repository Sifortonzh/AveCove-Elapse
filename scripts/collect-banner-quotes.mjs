// Fetch the public verse catalogue only, with a bounded, sequential request rate.
// Emits an apply_patch document so updates remain reviewable before publication.
const origin = "https://www.gushiwenku.cn";
const limit = Math.min(500, Math.max(1, Number(process.argv[2] || 100)));
const decode = text => text.replace(/<[^>]*>/g, "").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&nbsp;/g," ").trim();
const get = async url => {
  const response = await fetch(url, { headers: { "User-Agent": "ElapseQuoteCollector/1.0" }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Stopped at ${url}: HTTP ${response.status}`);
  return response.text();
};
const robots = await get(`${origin}/robots.txt`);
if (/Disallow:\s*\/(?:mingju\/)?\s*$/mi.test(robots)) throw new Error("Catalogue is disallowed by robots.txt");
const entries = new Map();
let url = `${origin}/mingju/`;
let pages = 0;
const visited = new Set();
while (url && pages < limit && !visited.has(url)) {
  visited.add(url);
  const html = await get(url);
  for (const match of html.matchAll(/<a\b[^>]*href="(\/mingju\/[a-f0-9]+\/)"[^>]*>\s*<blockquote class="verse-quote-text">([\s\S]*?)<\/blockquote>\s*<footer class="verse-quote-source">[\s\S]*?<cite>([\s\S]*?)<\/cite>/g)) {
    const title = decode(match[2]), source = decode(match[3]);
    const attribution = source.match(/^(.+?)《(.+)》$/);
    if (!title || !attribution) continue;
    const key = `${title}|${source}`;
    if (!entries.has(key)) entries.set(key, { title, source, author: attribution[1], work: attribution[2], url: origin + match[1] });
  }
  pages++;
  const next = html.match(/<a\b[^>]*href="(\/mingju\/list-page-\d+\/)"[^>]*rel="next"/);
  url = next ? origin + next[1] : "";
  if (url && pages < limit) await new Promise(resolve => setTimeout(resolve, 350));
}
const data = { source: `${origin}/mingju/`, fetchedAt: new Date().toISOString(), pages, complete: !url, nextPage: url || null, quotes: [...entries.values()] };
const output = JSON.stringify(data, null, 2);
console.log(`*** Begin Patch\n*** Add File: /Users/zhongyunxing/AveCove/AveCove-Elapse/app/data/banner-quotes.json\n${output.split("\n").map(line => "+" + line).join("\n")}\n*** End Patch`);
console.error(JSON.stringify({ pages, quotes: entries.size, complete: data.complete }));
