#!/usr/bin/env node
/* ジオゲッサ/ストリートビュー「カバー範囲」の絶対基準を出典から生成する。
 * 出典: Wikipedia「Google Street View coverage」§ Official coverage by country or territory > Current coverage
 *   表の凡例: 「Bold with an asterisk (*) indicates countries with public street view available」
 *   → アスタリスク付き = 公開ストリートビューあり = ジオゲッサで実際に走れる国。これを in_coverage とする。
 *   アスタリスクなし（数棟のみ/フォトスフィアのみ等の限定）は in_coverage=false 扱い。
 * 推測による加筆はしない。表の記載のみを機械抽出する。
 * 実行: node scripts/build_coverage.mjs   （--write で data/coverage.json を生成）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGE = 'Google Street View coverage';
const SECTION_ANCHOR = 'Current_coverage';
const SOURCE_URL = 'https://en.wikipedia.org/wiki/Google_Street_View_coverage#Current_coverage';
const FETCHED_AT = '2026-06-16';
const UA = { headers: { 'User-Agent': 'geoguessr-flashcards/1.0 (personal study; t.yamada)' } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function jx(u) { await sleep(700); const r = await fetch(u, UA); return r.json(); }

// 「Current coverage」セクションの index を取得
const s = await jx(`https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=sections&page=${encodeURIComponent(PAGE)}`);
const target = s.parse.sections.find((x) => x.anchor === SECTION_ANCHOR || /^Current coverage$/i.test(x.line));
if (!target) { console.error('Current coverage セクションが見つからない'); process.exit(1); }
const sw = await jx(`https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=wikitext&section=${target.index}&page=${encodeURIComponent(PAGE)}`);
const wt = sw.parse.wikitext['*'];

function cleanName(raw) {
  let n = raw.replace(/<ref[^>]*>.*?<\/ref>/gis, '').replace(/<ref[^>]*\/>/gi, '');
  const pipe = n.match(/\[\[([^\]|]+)\|([^\]]+)\]\]/);
  if (pipe) n = pipe[2]; else n = n.replace(/\[\[([^\]]+)\]\]/, '$1');
  return n.replace(/[\[\]]/g, '').trim();
}

const rows = wt.split(/\n\|-/).slice(1);
const pub = [], lim = [];
for (const row of rows) {
  const m = row.match(/'''(.+?)'''(\*?)/s);
  if (!m) continue;
  let raw = m[1];
  // アスタリスクは ''' の外側('''Name'''*) にも内側('''Name*''') にも現れる → 両方検出
  const star = m[2] === '*' || /\*\s*$/.test(raw);
  raw = raw.replace(/\*+\s*$/, '');
  const name = cleanName(raw);
  if (!name) continue;
  const cont = (row.match(/\|\s*(Africa|Asia|Europe|North America|South America|Oceania|Antarctica)\b/) || [])[1] || '';
  (star ? pub : lim).push({ name, continent: cont });
}

console.log(`公開SV(アスタリスク=in_coverage): ${pub.length} 件`);
console.log(pub.map((x) => x.name).join(', '));
console.log(`\n限定/部分のみ(アスタリスクなし): ${lim.length} 件`);
console.log(lim.map((x) => x.name).join(', '));

if (process.argv.includes('--write')) {
  const out = {
    source_url: SOURCE_URL,
    source_note: "表の凡例『Bold with an asterisk (*) indicates countries with public street view available』に基づき、アスタリスク付き＝公開ストリートビューありを in_coverage=true とした。",
    fetched_at: FETCHED_AT,
    in_coverage: pub.map((x) => x.name).sort(),
    limited_only: lim.map((x) => x.name).sort(),
  };
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'coverage.json'), JSON.stringify(out, null, 2) + '\n');
  console.log('\n✅ data/coverage.json を生成');
}
