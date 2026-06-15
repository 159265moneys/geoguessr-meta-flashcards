/* GeoGuessr メタ暗記フラッシュカード — 出題エンジン（純ロジック）
 * データは window.GEOQUIZ_DATA から読む。出題方向は「画像 → 国名」の再認のみ。
 * SRS は Leitner 方式（5箱）。進捗は localStorage に保存。
 */
(function () {
  'use strict';

  const DATA = window.GEOQUIZ_DATA || {};
  const CATEGORY_LABELS = {
    flag: '国旗',
    bollard: 'ボラード',
    plate: 'ナンバープレート',
    roadline: '車線ライン',
    script: '文字',
  };
  const CATEGORY_ORDER = ['flag', 'bollard', 'plate', 'roadline', 'script'];

  const PROGRESS_KEY = 'geoquiz_progress_v1';
  const SETTINGS_KEY = 'geoquiz_settings_v1';
  const MAX_BOX = 5;

  // ---- データ平坦化 ----
  const allCards = [];
  CATEGORY_ORDER.forEach((cat) => {
    const arr = Array.isArray(DATA[cat]) ? DATA[cat] : [];
    arr.forEach((r) => { if (r && r.id) allCards.push(r); });
  });

  // マスター国リスト（選択肢のダミー生成用）
  const masterCountries = (function () {
    const map = new Map();
    allCards.forEach((c) => {
      if (!c.answer_country) return;
      if (!map.has(c.answer_country)) {
        map.set(c.answer_country, {
          en: c.answer_country,
          ja: c.answer_country_ja || c.answer_country,
          region: c.region || '',
        });
      }
    });
    return Array.from(map.values());
  })();

  // ---- localStorage ----
  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key)) || null; } catch (e) { return null; }
  }
  let progress = readJSON(PROGRESS_KEY) || {};
  let settings = Object.assign(
    { category: 'all', region: 'all', weakMode: false },
    readJSON(SETTINGS_KEY) || {}
  );
  function saveProgress() { try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch (e) {} }
  function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {} }

  // ---- 出題プール ----
  // 出題可能 = 視覚情報（画像 or サンプル文字）があるカードのみ。
  // 画像もサンプルも無いカードは監査用にデータには残るが、クイズには出さない。
  function isQuizzable(c) { return !!(c.image_url || c.image_local || c.sample_text); }

  function activePool() {
    let pool = allCards.filter(isQuizzable);
    if (settings.category !== 'all') pool = pool.filter((c) => c.category === settings.category);
    if (settings.region !== 'all') pool = pool.filter((c) => (c.region || '') === settings.region);
    if (settings.weakMode) {
      pool = pool.filter((c) => {
        const s = progress[c.id];
        if (!s || s.seen < 2) return false;
        return s.correct / s.seen < 0.6;
      });
    }
    return pool;
  }

  function cardWeight(c) {
    const s = progress[c.id];
    if (!s || !s.seen) return MAX_BOX + 1; // 未出題を最優先
    return Math.max(1, MAX_BOX + 1 - (s.box || 1));
  }

  let lastCardId = null;
  function pickCard(pool) {
    if (!pool.length) return null;
    let cand = pool.length > 1 ? pool.filter((c) => c.id !== lastCardId) : pool;
    if (!cand.length) cand = pool;
    let total = 0;
    const weights = cand.map((c) => { const w = cardWeight(c); total += w; return w; });
    let r = Math.random() * total;
    for (let i = 0; i < cand.length; i++) { r -= weights[i]; if (r <= 0) return cand[i]; }
    return cand[cand.length - 1];
  }

  function shuffle(a) {
    const arr = a.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function buildChoices(card) {
    const correctEn = card.answer_country;
    const same = masterCountries.filter((m) => m.en !== correctEn && m.region && m.region === card.region);
    const rest = masterCountries.filter((m) => m.en !== correctEn && (!m.region || m.region !== card.region));
    let distractors = shuffle(same).slice(0, 3);
    if (distractors.length < 3) distractors = distractors.concat(shuffle(rest).slice(0, 3 - distractors.length));
    const correct = { en: correctEn, ja: card.answer_country_ja || correctEn, correct: true };
    return shuffle(distractors.map((d) => ({ en: d.en, ja: d.ja, correct: false })).concat([correct]));
  }

  // ---- DOM ----
  const $ = (id) => document.getElementById(id);
  const els = {
    catFilter: $('cat-filter'),
    regionFilter: $('region-filter'),
    weakToggle: $('weak-toggle'),
    quiz: $('quiz'),
    empty: $('empty-msg'),
    qCat: $('q-cat'),
    statSession: $('stat-session'),
    imageWrap: $('q-image-wrap'),
    image: $('q-image'),
    sample: $('q-sample'),
    choices: $('choices'),
    feedback: $('feedback'),
    fbResult: $('fb-result'),
    fbMeta: $('fb-meta'),
    fbChips: $('fb-chips'),
    fbSource: $('fb-source'),
    nextBtn: $('next-btn'),
    menuBtn: $('menu-btn'),
    menu: $('menu'),
    menuCounts: $('menu-counts'),
    resetBtn: $('reset-btn'),
    closeMenu: $('close-menu'),
  };

  let session = { correct: 0, total: 0 };
  let current = null;
  let answered = false;

  function populateFilters() {
    // カテゴリ（データが存在するものだけ）
    const cats = CATEGORY_ORDER.filter((c) => allCards.some((x) => x.category === c && isQuizzable(x)));
    let html = '<option value="all">全カテゴリ</option>';
    cats.forEach((c) => {
      const n = allCards.filter((x) => x.category === c && isQuizzable(x)).length;
      html += `<option value="${c}">${CATEGORY_LABELS[c]}（${n}）</option>`;
    });
    els.catFilter.innerHTML = html;
    els.catFilter.value = settings.category;

    // 地域
    const regions = Array.from(new Set(allCards.map((c) => c.region).filter(Boolean))).sort();
    let rhtml = '<option value="all">全地域</option>';
    regions.forEach((r) => { rhtml += `<option value="${r}">${r}</option>`; });
    els.regionFilter.innerHTML = rhtml;
    els.regionFilter.value = regions.includes(settings.region) ? settings.region : 'all';
    settings.region = els.regionFilter.value;

    els.weakToggle.checked = !!settings.weakMode;
  }

  function updateStats() {
    els.statSession.textContent = `正解 ${session.correct} / ${session.total}`;
  }

  function renderEmpty() {
    els.quiz.hidden = true;
    els.empty.hidden = false;
  }

  function renderCard(card) {
    current = card;
    answered = false;
    els.quiz.hidden = false;
    els.empty.hidden = true;
    els.feedback.hidden = true;

    els.qCat.textContent = CATEGORY_LABELS[card.category] || card.category;

    els.imageWrap.classList.remove('broken');
    const imgSrc = card.image_local || card.image_url || '';
    if (imgSrc) {
      // 画像カード
      els.sample.hidden = true;
      els.image.style.display = '';
      els.image.src = imgSrc;
      els.image.alt = '出題画像';
      els.image.onerror = () => { els.imageWrap.classList.add('broken'); els.image.style.display = 'none'; };
    } else if (card.sample_text) {
      // テキストサンプルカード（文字カテゴリなど）
      els.image.style.display = 'none';
      els.image.removeAttribute('src');
      els.sample.hidden = false;
      els.sample.textContent = card.sample_text;
    } else {
      els.image.style.display = 'none';
      els.sample.hidden = true;
      els.imageWrap.classList.add('broken');
    }

    const choices = buildChoices(card);
    els.choices.innerHTML = '';
    choices.forEach((ch) => {
      const btn = document.createElement('button');
      btn.className = 'choice';
      btn.innerHTML = `${ch.ja}<span class="en">${ch.en}</span>`;
      btn.addEventListener('click', () => onChoose(ch, btn));
      els.choices.appendChild(btn);
    });
  }

  function onChoose(choice, btn) {
    if (answered) return;
    answered = true;

    const s = progress[current.id] || { box: 1, seen: 0, correct: 0, wrong: 0 };
    s.seen += 1;
    if (choice.correct) { s.correct += 1; s.box = Math.min(MAX_BOX, (s.box || 1) + 1); }
    else { s.wrong += 1; s.box = 1; }
    progress[current.id] = s;
    saveProgress();

    session.total += 1;
    if (choice.correct) session.correct += 1;
    updateStats();

    // 全選択肢を無効化＆色付け
    Array.from(els.choices.children).forEach((b) => {
      b.disabled = true;
      const en = b.querySelector('.en').textContent;
      if (en === current.answer_country) b.classList.add('correct');
      else if (b === btn && !choice.correct) b.classList.add('wrong');
    });

    showFeedback(choice.correct);
  }

  function showFeedback(ok) {
    els.fbResult.className = 'fb-result ' + (ok ? 'ok' : 'ng');
    els.fbResult.textContent = ok
      ? '✓ 正解'
      : `✗ 不正解 — 正解: ${current.answer_country_ja || current.answer_country}`;

    if (current.meta_text && current.meta_text.trim()) {
      els.fbMeta.className = 'fb-meta';
      els.fbMeta.textContent = current.meta_text.trim();
    } else {
      els.fbMeta.className = 'fb-meta empty';
      els.fbMeta.textContent = '（解説は未登録。監査ビューで後から追記できます）';
    }

    const chips = [];
    if (current.answer_country) chips.push(`${current.answer_country_ja || current.answer_country}（${current.answer_country}）`);
    if (current.region) chips.push(current.region);
    els.fbChips.innerHTML = chips.map((c) => `<span class="chip">${c}</span>`).join('');

    if (current.source_url) {
      els.fbSource.hidden = false;
      els.fbSource.href = current.source_url;
      els.fbSource.textContent = '出典を開く ↗ ' + current.source_url;
    } else {
      els.fbSource.hidden = true;
    }

    els.feedback.hidden = false;
    els.nextBtn.focus();
  }

  function next() {
    const pool = activePool();
    if (!pool.length) { renderEmpty(); return; }
    lastCardId = current ? current.id : null;
    renderCard(pickCard(pool));
  }

  // ---- メニュー ----
  function openMenu() {
    const lines = [];
    CATEGORY_ORDER.forEach((c) => {
      const n = allCards.filter((x) => x.category === c).length;
      if (n) lines.push(`${CATEGORY_LABELS[c]}: ${n} 枚`);
    });
    const seen = Object.keys(progress).length;
    lines.push(`総カード: ${allCards.length} 枚 / 出題済み: ${seen} 枚`);
    els.menuCounts.innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
    if (typeof els.menu.showModal === 'function') els.menu.showModal();
  }

  function resetProgress() {
    if (!confirm('進捗（習熟度・正答率）を完全に消去します。よろしいですか？')) return;
    progress = {};
    saveProgress();
    session = { correct: 0, total: 0 };
    updateStats();
    els.menu.close();
    next();
  }

  // ---- イベント ----
  els.catFilter.addEventListener('change', () => { settings.category = els.catFilter.value; saveSettings(); next(); });
  els.regionFilter.addEventListener('change', () => { settings.region = els.regionFilter.value; saveSettings(); next(); });
  els.weakToggle.addEventListener('change', () => { settings.weakMode = els.weakToggle.checked; saveSettings(); next(); });
  els.nextBtn.addEventListener('click', next);
  els.menuBtn.addEventListener('click', openMenu);
  els.closeMenu.addEventListener('click', () => els.menu.close());
  els.resetBtn.addEventListener('click', resetProgress);

  document.addEventListener('keydown', (e) => {
    if (els.menu.open) return;
    if (!answered && /^[1-4]$/.test(e.key)) {
      const idx = Number(e.key) - 1;
      const btn = els.choices.children[idx];
      if (btn) btn.click();
    } else if (answered && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      next();
    }
  });

  // ---- 起動 ----
  if (!allCards.length) {
    renderEmpty();
    els.empty.querySelector('p').textContent = 'データがまだありません（data/ に投入してください）。';
  } else {
    populateFilters();
    updateStats();
    next();
  }
})();
