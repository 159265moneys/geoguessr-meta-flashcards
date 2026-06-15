#!/usr/bin/env node
/* source_quote 実在監査（独立検証・ハルシネーション対策の要）
 * 各レコードの source_quote が source_url のページ本文に本当に存在するかを、
 * Wikipedia/Wikimedia の API でこちら側で再取得して逐語照合する。
 * 使い方: node scripts/check_quotes.mjs [data|data/_incoming]   （既定: data）
 *   - en/de/fr/nl/sv 等の各 *.wikipedia.org 記事 → extracts API で本文取得し substring 照合
 *   - commons の File: ページや非Wikipedia URL → 自動照合不可として「手動確認」に分類
 *   - source_quote 空のレコードは対象外（空欄は許容）
 * mismatch があれば exit 1。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dirArg = process.argv[2] || 'data';
const DATA_DIR = path.isAbsolute(dirArg) ? dirArg : path.join(__dirname, '..', dirArg);
const FILES = ['flags.json', 'plates.json', 'bollards.json', 'roadlines.json', 'scripts.json'];

const norm = (s) => (s || '').normalize('NFC').replace(/\s+/g, ' ').trim();
const UA = 'geoquiz-audit/1.0 (personal study tool; contact: local)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// レート制限(429)回避: リクエスト間に間隔を空け、失敗時はバックオフ再試行。
async function politeFetch(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await sleep(attempt === 0 ? 800 : 2500 * attempt);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.status === 429 || res.status >= 500) continue; // 再試行
      return res;
    } catch (e) { /* 再試行 */ }
  }
  return null;
}

const extractCache = new Map();
async function getExtract(host, title, force) {
  const key = host + '|' + title;
  if (!force && extractCache.has(key)) return extractCache.get(key);
  const url = `https://${host}/w/api.php?action=query&format=json&prop=extracts&explaintext=1&redirects=1&titles=${encodeURIComponent(title)}`;
  let text = '';
  const res = await politeFetch(url);
  if (res) {
    try {
      const d = await res.json();
      const pages = d?.query?.pages || {};
      text = Object.values(pages).map((p) => p.extract || '').join('\n');
    } catch (e) { text = ''; }
  }
  extractCache.set(key, text);
  return text;
}

// REST HTML フォールバック（extracts が截断する長い記事用）
const htmlCache = new Map();
async function getHtmlText(host, title, force) {
  const key = host + '|' + title;
  if (!force && htmlCache.has(key)) return htmlCache.get(key);
  const url = `https://${host}/api/rest_v1/page/html/${encodeURIComponent(title)}`;
  let text = '';
  const res = await politeFetch(url);
  if (res) {
    try {
      const html = await res.text();
      text = html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ');
    } catch (e) { text = ''; }
  }
  htmlCache.set(key, text);
  return text;
}

function parseWiki(sourceUrl) {
  try {
    const u = new URL(sourceUrl);
    if (!/\.wikipedia\.org$/.test(u.hostname)) return null;
    const m = u.pathname.match(/^\/wiki\/(.+)$/);
    if (!m) return null;
    return { host: u.hostname, title: decodeURIComponent(m[1]) };
  } catch (e) { return null; }
}

let ok = 0, manual = 0, skipped = 0;
const problems = [];

// 照合対象を収集
const targets = [];
for (const f of FILES) {
  const p = path.join(DATA_DIR, f);
  if (!fs.existsSync(p)) continue;
  const arr = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const r of arr) {
    const q = norm(r.source_quote);
    if (!q) { skipped++; continue; }
    const w = parseWiki(r.source_url);
    if (!w) { manual++; continue; }
    targets.push({ id: r.id, q, w, url: r.source_url });
  }
}

// flag_similar.json のグループも検証対象に含める
const fsimPath = path.join(DATA_DIR, 'flag_similar.json');
if (fs.existsSync(fsimPath)) {
  try {
    const fsd = JSON.parse(fs.readFileSync(fsimPath, 'utf8'));
    for (const g of (fsd.groups || [])) {
      const q = norm(g.source_quote);
      if (!q) { skipped++; continue; }
      const w = parseWiki(g.source_url);
      if (!w) { manual++; continue; }
      targets.push({ id: 'flagsim:' + (g.codes || []).join('-'), q, w, url: g.source_url });
    }
  } catch (e) { /* ignore */ }
}

async function verifyOne(t, force) {
  let body = norm(await getExtract(t.w.host, t.w.title, force));
  if (body.includes(t.q)) return true;
  body = norm(await getHtmlText(t.w.host, t.w.title, force));
  return body.includes(t.q);
}

// パス1
let pending = [];
for (const t of targets) { if (await verifyOne(t, false)) ok++; else pending.push(t); }

// パス2: 未一致はレート制限(429)による偽陰性の可能性が高い。回復を待って強制再取得で再照合（自己修復）。
if (pending.length) {
  console.log(`一次照合で ${pending.length} 件未一致 → レート制限回復を待って再照合（20秒待機）...`);
  await sleep(20000);
  const still = [];
  for (const t of pending) { if (await verifyOne(t, true)) ok++; else still.push(t); }
  pending = still;
}
for (const t of pending) problems.push(`[${t.id}] source_quote が本文に見つからない\n     quote: "${t.q.slice(0, 120)}"\n     url:   ${t.url}`);

console.log('\n===== source_quote 実在監査 =====');
console.log(`照合OK: ${ok} / 不一致: ${problems.length} / 手動確認(非wiki): ${manual} / 対象外(quote空): ${skipped}`);
if (problems.length) {
  console.log('\n--- 不一致（再照合後も未検出・要確認）---');
  problems.forEach((p) => console.log('  ✗ ' + p));
  process.exit(1);
} else {
  console.log('✅ すべての source_quote が出典本文に逐語で実在（自動照合分）。');
}
