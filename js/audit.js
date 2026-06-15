/* 監査ビュー — 全レコードを目視チェックするための一覧。
 * source_url / 画像 / 必須フィールドの欠落を赤で表示する。
 */
(function () {
  'use strict';
  const DATA = window.GEOQUIZ_DATA || {};
  const CATEGORY_LABELS = { flag: '国旗', bollard: 'ボラード', plate: 'ナンバープレート', roadline: '車線ライン', script: '文字' };
  const ORDER = ['flag', 'bollard', 'plate', 'roadline', 'script'];
  const REQUIRED = ['id', 'category', 'answer_country', 'source_url'];

  // カバー範囲（ジオゲッサ/SV）
  const COVERAGE = window.GEOQUIZ_COVERAGE || null;
  const COV_ALIAS = { 'Türkiye': 'Turkey', 'Czechia': 'Czech Republic' };
  const covNorm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const covSet = COVERAGE && COVERAGE.in_coverage ? new Set(COVERAGE.in_coverage.map(covNorm)) : null;
  const inCov = (c) => (covSet ? covSet.has(covNorm(COV_ALIAS[c] || c)) : null);

  const catSel = document.getElementById('cat-sel');
  const onlyIssues = document.getElementById('only-issues');
  const sampleInput = document.getElementById('sample');
  const summaryEl = document.getElementById('summary');
  const tablesEl = document.getElementById('tables');

  const present = ORDER.filter((c) => Array.isArray(DATA[c]) && DATA[c].length);
  catSel.innerHTML = '<option value="all">全カテゴリ</option>' +
    present.map((c) => `<option value="${c}">${CATEGORY_LABELS[c]}</option>`).join('');

  function hasIssue(r) {
    for (const f of REQUIRED) if (!r[f] || String(r[f]).trim() === '') return true;
    if (!r.image_url && !r.image_local && !r.sample_text) return true;
    return false;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])); }
  function cell(val) {
    if (val == null || String(val).trim() === '') return '<td class="miss">— 欠落</td>';
    return '<td>' + esc(val) + '</td>';
  }

  function sampleArray(arr, n) {
    if (!n || n >= arr.length) return arr;
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a.slice(0, n);
  }

  function render() {
    const cat = catSel.value;
    const issuesOnly = onlyIssues.checked;
    const n = parseInt(sampleInput.value, 10) || 0;
    const cats = cat === 'all' ? present : [cat];

    let totalRecords = 0, totalIssues = 0, totalNoMeta = 0;
    let html = '';

    cats.forEach((c) => {
      let rows = (DATA[c] || []).slice();
      totalRecords += rows.length;
      rows.forEach((r) => { if (hasIssue(r)) totalIssues++; if (!r.meta_text || !r.meta_text.trim()) totalNoMeta++; });
      if (issuesOnly) rows = rows.filter(hasIssue);
      rows = sampleArray(rows, n);
      if (!rows.length) return;

      html += `<div class="cat-section"><h2>${CATEGORY_LABELS[c]}（${(DATA[c] || []).length} 件）</h2>`;
      html += '<table><thead><tr><th>画像</th><th>id</th><th>正解(EN/JA)</th><th>地域</th><th>meta_text</th><th>source_url</th><th>取得日</th></tr></thead><tbody>';
      rows.forEach((r) => {
        const img = (r.image_local || r.image_url)
          ? `<td><img loading="lazy" src="${esc(r.image_local || r.image_url)}" alt=""></td>`
          : (r.sample_text
            ? `<td><span style="font-size:28px">${esc(r.sample_text)}</span></td>`
            : '<td class="miss">— 欠落</td>');
        const src = r.source_url
          ? `<td><a href="${esc(r.source_url)}" target="_blank" rel="noopener">${esc(r.source_url)}</a></td>`
          : '<td class="miss">— 欠落</td>';
        const quote = (r.source_quote && r.source_quote.trim())
          ? `<div style="color:var(--muted);font-size:11px;margin-top:4px">“${esc(r.source_quote)}”</div>` : '';
        const meta = (r.meta_text && r.meta_text.trim())
          ? '<td>' + esc(r.meta_text) + quote + '</td>'
          : '<td class="miss">（空）' + quote + '</td>';
        const covBadge = covSet
          ? (inCov(r.answer_country) ? ' <span style="color:#2ea043;font-size:11px">●圏内</span>' : ' <span style="color:#e5534b;font-size:11px">●圏外</span>')
          : '';
        html += '<tr>' + img + cell(r.id) +
          `<td>${esc(r.answer_country)}${covBadge}<br><span style="color:var(--muted)">${esc(r.answer_country_ja || '')}</span></td>` +
          cell(r.region) + meta + src + cell(r.fetched_at) + '</tr>';
      });
      html += '</tbody></table></div>';
    });

    summaryEl.innerHTML =
      `総レコード: <b>${totalRecords}</b> 件 ／ ` +
      `必須欠落: <b class="${totalIssues ? 'miss' : ''}">${totalIssues}</b> 件 ／ ` +
      `解説文(meta_text)空: <b>${totalNoMeta}</b> 件`;
    tablesEl.innerHTML = html || '<p style="color:var(--muted)">該当レコードなし。</p>';
  }

  catSel.addEventListener('change', render);
  onlyIssues.addEventListener('change', render);
  sampleInput.addEventListener('input', render);
  render();
})();
