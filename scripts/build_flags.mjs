#!/usr/bin/env node
/* 国旗カテゴリのデータ生成（再現可能・出典明示）
 * 出典:
 *   - 国名(英/日)・地域・ISOコード: mledoze/countries（restcountries の元データ）
 *       https://raw.githubusercontent.com/mledoze/countries/master/countries.json
 *   - 旗画像: flagcdn.com（パブリックドメイン相当 / 例 https://flagcdn.com/w320/jp.png）
 *   - 日本語名フォールバック: https://flagcdn.com/ja/codes.json
 * 対象: independent === true（主権国）のみ。推測による加筆は一切しない。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'data', 'flags.json');
const COUNTRIES_URL = 'https://raw.githubusercontent.com/mledoze/countries/master/countries.json';
const FLAGCDN_JA_URL = 'https://flagcdn.com/ja/codes.json';
const FETCHED_AT = '2026-06-16';

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

const countries = await getJSON(COUNTRIES_URL);
const jaCodes = await getJSON(FLAGCDN_JA_URL).catch(() => ({}));

const records = [];
for (const c of countries) {
  if (c.independent !== true) continue;            // 主権国のみ
  const code = (c.cca2 || '').toLowerCase();
  if (!code) continue;
  // 日本語名は mledoze の通称(jpn.common)を基本にする（中国/韓国/タイ等、クイズ向きの自然な通称）。
  // ただし略称や不統一が混じる一部だけ flagcdn(ja) の正式表記で補正する。
  const JA_OVERRIDE = { ae: 'アラブ首長国連邦', us: 'アメリカ合衆国' };
  const ja = JA_OVERRIDE[code]
    || (c.translations && c.translations.jpn && c.translations.jpn.common)
    || jaCodes[code] || c.name.common;
  records.push({
    id: `flag_${code}`,
    category: 'flag',
    answer_country: c.name.common,
    answer_country_ja: ja,
    region: c.region || '',
    image_url: `https://flagcdn.com/w320/${code}.png`,
    image_local: '',
    meta_text: '',                                  // 旗は解説不要（空欄）
    source_url: COUNTRIES_URL,                       // 国名・地域の出典（データ原典）
    fetched_at: FETCHED_AT,
  });
}

records.sort((a, b) => (a.region + a.answer_country).localeCompare(b.region + b.answer_country));
fs.writeFileSync(OUT, JSON.stringify(records, null, 2) + '\n');
console.log(`✅ data/flags.json を生成: ${records.length} か国（independent=true）`);
const byRegion = {};
records.forEach((r) => { byRegion[r.region] = (byRegion[r.region] || 0) + 1; });
console.log('   地域別:', JSON.stringify(byRegion));
