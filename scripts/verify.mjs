#!/usr/bin/env node
/* データ検証スクリプト（鉄則4）
 * data/*.json を検査し、以下を検出して落とす：
 *   - source_url 欠落／URL形式でない
 *   - id 重複
 *   - 必須フィールド欠落（id, category, answer_country, answer_country_ja, region, source_url, fetched_at）
 *   - 画像参照(image_url|image_local)が両方欠落
 *   - category が規定外
 * オプション:
 *   --images   image_url の到達性を HEAD で確認（ネットワーク必要・時間がかかる）
 *   --csv      audit/<category>.csv を出力（人間の目視監査用）
 * いずれかのエラーがあれば exit code 1 で終了する。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const AUDIT_DIR = path.join(__dirname, '..', 'audit');

const CATEGORIES = ['flag', 'bollard', 'plate', 'roadline', 'script', 'pole'];
const FILES = {
  flag: 'flags.json', bollard: 'bollards.json', plate: 'plates.json',
  roadline: 'roadlines.json', script: 'scripts.json', pole: 'poles.json',
};
const REQUIRED = ['id', 'category', 'answer_country', 'answer_country_ja', 'region', 'source_url', 'fetched_at'];

const args = process.argv.slice(2);
const checkImages = args.includes('--images');
const writeCsv = args.includes('--csv');

const errors = [];
const warnings = [];
const seenIds = new Map();
const all = {};
let totalRecords = 0;

function isUrl(s) { return typeof s === 'string' && /^https?:\/\/.+/i.test(s.trim()); }

for (const cat of CATEGORIES) {
  const file = path.join(DATA_DIR, FILES[cat]);
  if (!fs.existsSync(file)) { warnings.push(`[${cat}] ファイルが存在しません: ${FILES[cat]}（空として扱う）`); all[cat] = []; continue; }
  let arr;
  try { arr = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { errors.push(`[${cat}] JSON パース失敗: ${e.message}`); all[cat] = []; continue; }
  if (!Array.isArray(arr)) { errors.push(`[${cat}] 配列ではありません`); all[cat] = []; continue; }
  all[cat] = arr;
  totalRecords += arr.length;

  arr.forEach((r, i) => {
    const tag = `[${cat}#${i} ${r && r.id ? r.id : '??'}]`;
    if (!r || typeof r !== 'object') { errors.push(`${tag} レコードがオブジェクトでない`); return; }

    REQUIRED.forEach((f) => {
      if (r[f] == null || String(r[f]).trim() === '') errors.push(`${tag} 必須フィールド欠落: ${f}`);
    });
    if (r.category && r.category !== cat) errors.push(`${tag} category 不一致: "${r.category}" (ファイルは ${cat})`);
    if (!CATEGORIES.includes(r.category)) errors.push(`${tag} category が規定外: "${r.category}"`);
    if (r.source_url && !isUrl(r.source_url)) errors.push(`${tag} source_url が URL 形式でない: "${r.source_url}"`);
    if (!r.image_url && !r.image_local && !r.sample_text && !r.line_spec) warnings.push(`${tag} 視覚情報なし（画像/サンプル欠落 → 出題対象外・監査用。後で画像追加可）`);
    if (r.image_url && !isUrl(r.image_url)) errors.push(`${tag} image_url が URL 形式でない: "${r.image_url}"`);

    if (r && r.id) {
      if (seenIds.has(r.id)) errors.push(`${tag} id 重複: "${r.id}"（${seenIds.get(r.id)} と衝突）`);
      else seenIds.set(r.id, tag);
    }
    if (!r.meta_text || !String(r.meta_text).trim()) warnings.push(`${tag} meta_text 空（出題可・監査で後埋め）`);
  });
}

// 画像到達性チェック（任意）
async function checkImageReachability() {
  const targets = [];
  for (const cat of CATEGORIES) for (const r of all[cat] || []) if (r.image_url) targets.push(r);
  console.log(`\n画像到達性チェック: ${targets.length} 件を HEAD で確認中...`);
  let broken = 0;
  for (const r of targets) {
    try {
      const res = await fetch(r.image_url, { method: 'HEAD' });
      if (!res.ok) { errors.push(`[${r.category} ${r.id}] 画像リンク切れ HTTP ${res.status}: ${r.image_url}`); broken++; }
    } catch (e) {
      errors.push(`[${r.category} ${r.id}] 画像取得失敗: ${r.image_url} (${e.message})`); broken++;
    }
  }
  console.log(`  → リンク切れ ${broken} 件`);
}

function toCsv(rows) {
  const cols = ['id', 'category', 'answer_country', 'answer_country_ja', 'region', 'meta_text', 'image_url', 'image_local', 'source_url', 'fetched_at'];
  const esc = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [cols.join(',')].concat(rows.map((r) => cols.map((c) => esc(r[c])).join(','))).join('\n');
}

async function main() {
  if (checkImages) await checkImageReachability();

  if (writeCsv) {
    if (!fs.existsSync(AUDIT_DIR)) fs.mkdirSync(AUDIT_DIR, { recursive: true });
    for (const cat of CATEGORIES) {
      if ((all[cat] || []).length) fs.writeFileSync(path.join(AUDIT_DIR, `${cat}.csv`), toCsv(all[cat]));
    }
    console.log(`監査用CSVを ${path.relative(process.cwd(), AUDIT_DIR)}/ に出力しました。`);
  }

  console.log('\n========== 検証結果 ==========');
  console.log(`総レコード: ${totalRecords} 件`);
  for (const cat of CATEGORIES) console.log(`  ${cat}: ${(all[cat] || []).length} 件`);
  console.log(`警告: ${warnings.length} 件 / エラー: ${errors.length} 件`);

  if (warnings.length && args.includes('--verbose')) {
    console.log('\n--- 警告 ---');
    warnings.forEach((w) => console.log('  ⚠ ' + w));
  } else if (warnings.length) {
    console.log(`（警告の詳細は --verbose で表示。多くは meta_text 空欄です）`);
  }

  if (errors.length) {
    console.log('\n--- エラー（要修正）---');
    errors.forEach((e) => console.log('  ✗ ' + e));
    console.log('\n❌ 検証失敗。上記を修正してください。');
    process.exit(1);
  } else {
    console.log('\n✅ 検証OK（エラー0）。');
  }
}

main();
