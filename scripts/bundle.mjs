#!/usr/bin/env node
/* data/*.json を 1 つの data/bundle.js にまとめる。
 * ブラウザは <script src="data/bundle.js"> で window.GEOQUIZ_DATA を読む。
 * これにより fetch 不要 → file:// で開いても GitHub Pages でも動く（ビルドレス運用）。
 * データを編集したら毎回これを実行する。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const FILES = {
  flag: 'flags.json', bollard: 'bollards.json', plate: 'plates.json',
  roadline: 'roadlines.json', script: 'scripts.json',
};

const out = {};
let total = 0;
for (const [cat, file] of Object.entries(FILES)) {
  const p = path.join(DATA_DIR, file);
  let arr = [];
  if (fs.existsSync(p)) {
    try { arr = JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch (e) { console.error(`✗ ${file} のパース失敗: ${e.message}`); process.exit(1); }
  }
  out[cat] = Array.isArray(arr) ? arr : [];
  total += out[cat].length;
}

// カバー範囲（ジオゲッサ/SV）— あれば同梱
let coverage = null;
const covPath = path.join(DATA_DIR, 'coverage.json');
if (fs.existsSync(covPath)) {
  try { coverage = JSON.parse(fs.readFileSync(covPath, 'utf8')); }
  catch (e) { console.error(`✗ coverage.json のパース失敗: ${e.message}`); process.exit(1); }
}

const banner = `/* 自動生成ファイル — 直接編集しないこと。\n   生成元: data/*.json / 生成: node scripts/bundle.mjs */\n`;
const js = banner +
  'window.GEOQUIZ_DATA = ' + JSON.stringify(out) + ';\n' +
  'window.GEOQUIZ_COVERAGE = ' + JSON.stringify(coverage) + ';\n';
fs.writeFileSync(path.join(DATA_DIR, 'bundle.js'), js);
if (coverage) console.log(`   coverage: in_coverage ${coverage.in_coverage.length} / limited ${coverage.limited_only.length}`);
console.log(`✅ data/bundle.js を生成（${total} 件）`);
for (const cat of Object.keys(FILES)) console.log(`   ${cat}: ${out[cat].length} 件`);
