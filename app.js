'use strict';

/* =========================================================
   Checkliste Fallbeispiele – Checklisten-App
   Inhalte kommen aus faelle.json, Fortschritt liegt im
   Browser-Speicher (localStorage) des jeweiligen Geräts.
   ========================================================= */

const STORE_KEY = 'rd-checkliste:v1';
const app = document.getElementById('app');

let DATA = null;
let state = loadState();
let tickTimer = null;
let wakeLock = null;
const openPhases = {}; // pro Fall: welche Phasen aufgeklappt sind

/* ---------- Speicher ---------- */
function loadState() {
  const empty = { modus: 'uebung', faelle: {} };
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && typeof s === 'object') return Object.assign(empty, s);
  } catch (e) { /* Speicher nicht verfügbar */ }
  return empty;
}
function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignorieren */ }
}
function caseState(id) {
  if (!state.faelle[id]) {
    state.faelle[id] = { checked: {}, notizen: '', timer: { running: false, startedAt: 0, acc: 0 } };
  }
  return state.faelle[id];
}

/* ---------- Hilfsfunktionen ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmt(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
function clockTime(iso) {
  return new Date(iso).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function elapsed(cs) {
  const t = cs.timer;
  return t.acc + (t.running ? Date.now() - t.startedAt : 0);
}
function phasesFor(fall) {
  return DATA.phasen.map((p) => {
    const extra = (fall.zusatzpunkte && fall.zusatzpunkte[p.id]) || [];
    const withKey = (x, fallspezifisch) => {
      const key = `${p.id}:${x.id}`;
      const unter = (x.unterpunkte || []).map((u) => {
        const sub = typeof u === 'string' ? { id: u, text: u } : u;
        return { ...sub, key: `${key}/${sub.id}`, parent: key };
      });
      return { ...x, key, unterpunkte: unter, fallspezifisch: !!fallspezifisch };
    };
    return {
      ...p,
      punkte: [...p.punkte.map((x) => withKey(x)), ...extra.map((x) => withKey(x, true))]
    };
  });
}
// Alle abhakbaren Punkte einer Phase (Hauptpunkte und Unterpunkte)
function flatItems(p) {
  return p.punkte.flatMap((it) => [it, ...it.unterpunkte]);
}
function counts(fall, cs) {
  let total = 0, done = 0, critMissed = 0;
  for (const p of phasesFor(fall)) {
    for (const it of flatItems(p)) {
      total++;
      if (cs.checked[it.key]) done++;
      else if (it.kritisch) critMissed++;
    }
  }
  return { total, done, critMissed };
}
const icon = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="4" width="4.5" height="16" rx="1.2"/><rect x="14" y="4" width="4.5" height="16" rx="1.2"/></svg>',
  reset: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a8 8 0 1 1-7.75 10h2.08A6 6 0 1 0 12 6v3L7.5 5 12 1v3z"/></svg>'
};

/* ---------- Modus ---------- */
function modeDesc() {
  return state.modus === 'pruefung'
    ? 'Prüfung: Hinweise, Markierungen und Instruktor-Infos sind ausgeblendet.'
    : 'Übung: Hinweise («?»), kritische Punkte und Instruktor-Infos sind sichtbar.';
}
function modeSwitch() {
  return `<div class="seg" role="group" aria-label="Modus">
    <button type="button" data-mode="uebung" aria-pressed="${state.modus === 'uebung'}">Übung</button>
    <button type="button" data-mode="pruefung" aria-pressed="${state.modus === 'pruefung'}">Prüfung</button>
  </div>`;
}
function applyMode() {
  document.body.classList.toggle('pruefung', state.modus === 'pruefung');
  document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === state.modus)));
  const d = document.getElementById('mode-desc');
  if (d) d.textContent = modeDesc();
}

/* ---------- Timer ---------- */
function startTimer(cs) {
  if (cs.timer.running) return;
  cs.timer.running = true;
  cs.timer.startedAt = Date.now();
  requestWakeLock();
}
function pauseTimer(cs) {
  if (!cs.timer.running) return;
  cs.timer.acc += Date.now() - cs.timer.startedAt;
  cs.timer.running = false;
  releaseWakeLock();
}
function renderTimer(cs) {
  const el = document.getElementById('timer');
  if (!el) return;
  el.classList.toggle('running', cs.timer.running);
  document.getElementById('timer-time').textContent = fmt(elapsed(cs));
  const btn = document.getElementById('timer-toggle');
  btn.innerHTML = cs.timer.running ? icon.pause : icon.play;
  btn.classList.toggle('play', !cs.timer.running);
  btn.setAttribute('aria-label', cs.timer.running ? 'Timer pausieren' : 'Timer starten');
}
function startTick(cs) {
  stopTick();
  tickTimer = setInterval(() => {
    const t = document.getElementById('timer-time');
    if (t) t.textContent = fmt(elapsed(cs));
  }, 500);
}
function stopTick() { if (tickTimer) clearInterval(tickTimer); tickTimer = null; }

// Bildschirm bleibt an, solange der Timer läuft (wo unterstützt)
async function requestWakeLock() {
  try { if ('wakeLock' in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { wakeLock = null; }
}
function releaseWakeLock() {
  try { if (wakeLock) wakeLock.release(); } catch (e) { /* ignorieren */ }
  wakeLock = null;
}

/* ---------- Routing ---------- */
function route() {
  stopTick();
  releaseWakeLock();
  const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  if (parts[0] === 'fall' && parts[1]) {
    const fall = DATA.faelle.find((f) => f.id === parts[1]);
    if (fall) {
      if (parts[2] === 'zusammenfassung' || parts[2] === 'auswertung') renderSummary(fall);
      else renderCase(fall);
      window.scrollTo(0, 0);
      return;
    }
  }
  renderHome();
  window.scrollTo(0, 0);
}

/* ---------- Startseite ---------- */
function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function isStandalone() {
  return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

function renderHome() {
  document.title = 'Checkliste Fallbeispiele';
  const tip = isIOS() && !isStandalone()
    ? `<section class="card install-tip"><strong>Als App installieren</strong>In Safari auf «Teilen» tippen und «Zum Home-Bildschirm» wählen.</section>`
    : '';
  app.innerHTML = `
    <header class="topbar"><div class="topbar-inner">
      <div class="brand">
        <img src="icons/icon-192.png" alt="" class="brand-icon">
        <div><h1>Checkliste Fallbeispiele</h1><p class="sub">Rettungsdienst · Übungen</p></div>
      </div>
    </div></header>
    <div class="content">
      ${tip}
      <section class="card mode-card">
        <div><span class="h3">Modus</span><p class="muted small" id="mode-desc">${esc(modeDesc())}</p></div>
        ${modeSwitch()}
      </section>
      ${DATA.faelle.some((f) => f.neutral) ? `<h2 class="section-title">Freie Übung</h2>
      <ul class="case-list">${DATA.faelle.filter((f) => f.neutral).map(caseCard).join('')}</ul>` : ''}
      ${groupByCategory(DATA.faelle.filter((f) => !f.neutral)).map(([kat, list]) => `
      <h2 class="section-title">${esc(kat)}</h2>
      <ul class="case-list">${list.map(caseCard).join('')}</ul>`).join('')}
      <p class="muted small footnote">${esc(DATA.hinweis || '')}</p>
    </div>`;
  applyMode();
}

// Fälle nach Kategorie gruppieren (Reihenfolge wie in faelle.json)
function groupByCategory(list) {
  const groups = new Map();
  for (const f of list) {
    const k = f.kategorie || 'Weitere Fallbeispiele';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  }
  return [...groups.entries()];
}

function caseCard(f) {
  const cs = state.faelle[f.id];
  let status = '';
  if (cs) {
    const c = counts(f, cs);
    if (c.done > 0 || elapsed(cs) > 0) status = `<span class="status">In Bearbeitung · ${fmt(elapsed(cs))}</span>`;
  }
  return `<li><a class="case-card" href="#/fall/${encodeURIComponent(f.id)}">
    <div class="case-head">
      ${f.neutral && f.kategorie ? `<span class="tag">${esc(f.kategorie)}</span>` : ''}
      ${f.dringlichkeit ? `<span class="tag tag-prio">${esc(f.dringlichkeit)}</span>` : ''}
      ${status}
    </div>
    <h3>${esc(f.titel)}</h3>
    <p class="muted">${esc(f.meldung?.alarm || f.beschreibung || '')}</p>
    <span class="chev" aria-hidden="true">›</span>
  </a></li>`;
}

/* ---------- Fall / Checkliste ---------- */
function renderCase(fall) {
  const cs = caseState(fall.id);
  document.title = `${fall.titel} · Checkliste Fallbeispiele`;
  const phases = phasesFor(fall);
  const open = openPhases[fall.id] || (openPhases[fall.id] = new Set(phases.map((p) => p.id)));
  const m = fall.meldung || {};
  const ins = fall.instruktor;

  app.innerHTML = `
    <header class="topbar">
      <div class="topbar-inner">
        <a class="icon-btn" href="#/" aria-label="Zurück zur Übersicht">‹</a>
        <div class="topbar-title"><h1>${esc(fall.titel)}</h1><p class="sub">${esc([fall.kategorie, fall.dringlichkeit].filter(Boolean).join(' · '))}</p></div>
        <div class="timer" id="timer">
          <span class="timer-time" id="timer-time" aria-label="Einsatzzeit">00:00</span>
          <button type="button" class="timer-btn" id="timer-toggle"></button>
          <button type="button" class="timer-btn" id="timer-reset" aria-label="Timer zurücksetzen">${icon.reset}</button>
        </div>
      </div>
      <div class="progress" role="progressbar" aria-label="Gesamtfortschritt"><div class="progress-bar" id="total-bar"></div></div>
    </header>
    <div class="content">
      <div class="row-between">
        <span class="muted small">Modus</span>
        ${modeSwitch()}
      </div>

      ${fall.neutral ? `<section class="card">
        <label for="stichwort" class="h3">Einsatz / Stichwort</label>
        <input id="stichwort" class="text-input" type="text" autocomplete="off" placeholder="z. B. Sturz Seniorin, Hypoglykämie …" value="${esc(cs.stichwort || '')}">
        ${fall.beschreibung ? `<p class="muted small" style="margin:8px 0 0">${esc(fall.beschreibung)}</p>` : ''}
      </section>` : (m.alarm || m.ort || m.situation) ? `<section class="card meldung">
        <h2 class="h3">Einsatzmeldung</h2>
        <dl>
          ${m.alarm ? `<dt>Alarm</dt><dd>${esc(m.alarm)}</dd>` : ''}
          ${m.ort ? `<dt>Ort</dt><dd>${esc(m.ort)}</dd>` : ''}
          ${m.situation ? `<dt>Situation</dt><dd>${esc(m.situation)}</dd>` : ''}
        </dl>
      </section>` : ''}

      ${ins ? `<details class="card instruktor only-uebung">
        <summary>Instruktor-Infos</summary>
        ${ins.vitalwerte?.length ? `<div class="vitals">${ins.vitalwerte.map(([k, v]) => `<div class="vital"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}</div>` : ''}
        ${ins.befunde ? `<h4>Befunde</h4><p>${esc(ins.befunde)}</p>` : ''}
        ${ins.verlauf?.length ? `<h4>Verlauf / Szenario-Entwicklung</h4><ul>${ins.verlauf.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>` : ''}
      </details>` : ''}

      <div class="phases">${phases.map((p, i) => phaseHtml(p, i, cs, open.has(p.id))).join('')}</div>

      <section class="card">
        <label for="notes" class="h3">Notizen / Feedback</label>
        <textarea id="notes" rows="5" placeholder="Beobachtungen, Feedback der Instruktorin / des Instruktors …">${esc(cs.notizen)}</textarea>
      </section>

      <div class="actions">
        <a class="btn btn-primary" href="#/fall/${encodeURIComponent(fall.id)}/zusammenfassung">Zusammenfassung anzeigen</a>
        <button type="button" class="btn btn-danger" id="case-reset">Fall zurücksetzen</button>
      </div>
    </div>`;

  applyMode();
  renderTimer(cs);
  updateProgress(fall, cs);
  startTick(cs);
  if (cs.timer.running) requestWakeLock();

  // Ereignisse
  app.querySelectorAll('.phase').forEach((d) => {
    d.addEventListener('toggle', () => { d.open ? open.add(d.dataset.phase) : open.delete(d.dataset.phase); });
  });
  app.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => toggleItem(fall, cs, b.dataset.toggle)));
  app.querySelectorAll('[data-info]').forEach((b) => b.addEventListener('click', () => {
    const box = document.getElementById(b.getAttribute('aria-controls'));
    const show = box.hidden;
    box.hidden = !show;
    b.setAttribute('aria-expanded', String(show));
  }));
  document.getElementById('timer-toggle').addEventListener('click', () => {
    cs.timer.running ? pauseTimer(cs) : startTimer(cs);
    saveState(); renderTimer(cs);
  });
  document.getElementById('timer-reset').addEventListener('click', () => {
    if (!confirm('Timer auf 00:00 zurücksetzen?\nBereits erfasste Zeitstempel bleiben erhalten.')) return;
    cs.timer = { running: false, startedAt: 0, acc: 0 };
    releaseWakeLock(); saveState(); renderTimer(cs);
  });
  document.getElementById('notes').addEventListener('input', (e) => { cs.notizen = e.target.value; saveState(); });
  const sw = document.getElementById('stichwort');
  if (sw) sw.addEventListener('input', (e) => { cs.stichwort = e.target.value; saveState(); });
  document.getElementById('case-reset').addEventListener('click', () => {
    if (!confirm(`Fall «${fall.titel}» zurücksetzen?\nAlle Häkchen, Zeiten und Notizen dieses Falls werden gelöscht.`)) return;
    delete state.faelle[fall.id];
    delete openPhases[fall.id];
    saveState();
    releaseWakeLock();
    renderCase(fall);
    window.scrollTo(0, 0);
  });
}

function phaseHtml(p, i, cs, isOpen) {
  const all = flatItems(p);
  const done = all.filter((it) => cs.checked[it.key]).length;
  return `<details class="phase" data-phase="${esc(p.id)}" ${isOpen ? 'open' : ''}>
    <summary>
      <span class="phase-num">${i + 1}</span>
      <span class="phase-title">${esc(p.titel)}</span>
    </summary>
    <div class="phase-bar"><div data-bar="${esc(p.id)}"></div></div>
    <ul class="items">${p.punkte.map((it) => itemHtml(it, cs)).join('')}</ul>
  </details>`;
}

function itemHtml(it, cs, isSub) {
  const c = cs.checked[it.key];
  const infoId = 'info-' + it.key.replace(/[^a-z0-9_-]/gi, '_');
  const subs = it.unterpunkte && it.unterpunkte.length
    ? `<ul class="subitems">${it.unterpunkte.map((u) => itemHtml(u, cs, true)).join('')}</ul>` : '';
  return `<li class="item${isSub ? ' sub' : ''}${subs ? ' has-subs' : ''}${c ? ' done' : ''}${it.kritisch ? ' crit' : ''}" data-key="${esc(it.key)}">
    <button type="button" class="check" role="checkbox" aria-checked="${!!c}" data-toggle="${esc(it.key)}">
      <span class="box" aria-hidden="true"></span>
      <span class="item-text">${esc(it.text)}${it.kritisch ? '<span class="crit-tag only-uebung">kritisch</span>' : ''}${it.fallspezifisch ? '<span class="case-tag">Fall</span>' : ''}</span>
      <span class="stamp">${c ? stampText(c) : ''}</span>
    </button>
    ${it.info ? `<button type="button" class="info-btn only-uebung" data-info aria-controls="${infoId}" aria-expanded="false" aria-label="Worauf achten?">?</button>
    <div class="info only-uebung" id="${infoId}" hidden>${esc(it.info)}</div>` : ''}
    ${subs}
  </li>`;
}
function stampText(c) { return `+${fmt(c.t)}`; }

function findItem(fall, key) {
  for (const p of phasesFor(fall)) for (const it of flatItems(p)) if (it.key === key) return { item: it, phase: p };
  return null;
}

function toggleItem(fall, cs, key) {
  const found = findItem(fall, key);
  if (cs.checked[key]) {
    delete cs.checked[key];
  } else {
    // Timer startet automatisch beim ersten Häkchen
    if (!cs.timer.running && elapsed(cs) === 0) { startTimer(cs); renderTimer(cs); }
    cs.checked[key] = { t: elapsed(cs), at: new Date().toISOString() };
  }

  // Hauptpunkt automatisch abhaken, wenn alle Unterpunkte erledigt sind
  const parentKey = found && found.item.parent;
  if (parentKey) {
    const parent = found.phase.punkte.find((it) => it.key === parentKey);
    const allDone = parent.unterpunkte.every((u) => cs.checked[u.key]);
    if (allDone && !cs.checked[parentKey]) {
      cs.checked[parentKey] = { t: elapsed(cs), at: new Date().toISOString(), auto: true };
    } else if (!allDone && cs.checked[parentKey] && cs.checked[parentKey].auto) {
      delete cs.checked[parentKey];
    }
    renderItemState(cs, parentKey);
  }
  saveState();
  renderItemState(cs, key);
  updateProgress(fall, cs);
}

function renderItemState(cs, key) {
  const li = app.querySelector(`.item[data-key="${CSS.escape(key)}"]`);
  if (!li) return;
  const c = cs.checked[key];
  li.classList.toggle('done', !!c);
  const btn = li.querySelector(':scope > .check');
  btn.setAttribute('aria-checked', String(!!c));
  const st = btn.querySelector('.stamp');
  st.textContent = c ? stampText(c) : '';
  st.title = c ? `Uhrzeit ${clockTime(c.at)}` : '';
}

function updateProgress(fall, cs) {
  let total = 0, done = 0;
  for (const p of phasesFor(fall)) {
    const all = flatItems(p);
    const d = all.filter((it) => cs.checked[it.key]).length;
    total += all.length; done += d;
    const bar = app.querySelector(`[data-bar="${CSS.escape(p.id)}"]`);
    if (bar) bar.style.width = `${(d / all.length) * 100}%`;
    const det = app.querySelector(`.phase[data-phase="${CSS.escape(p.id)}"]`);
    if (det) det.classList.toggle('complete', d === all.length);
  }
  const pct = total ? Math.round((done / total) * 100) : 0;
  const bar = document.getElementById('total-bar');
  if (bar) bar.style.width = pct + '%';
}

/* ---------- Zusammenfassung ---------- */
function sumItemHtml(it, cs, isSub) {
  const ch = cs.checked[it.key];
  const cls = ch ? 'ok' : (it.kritisch ? 'miss miss-crit' : 'miss');
  const when = ch ? `+${fmt(ch.t)} · ${clockTime(ch.at)}` : 'nicht erledigt';
  const subs = (it.unterpunkte || []).map((u) => sumItemHtml(u, cs, true)).join('');
  return `<li class="${cls}${isSub ? ' sub' : ''}"><span class="mark">${ch ? '✓' : '–'}</span><span>${esc(it.text)}</span><span class="when">${when}</span></li>${subs}`;
}

function renderSummary(fall) {
  const cs = caseState(fall.id);
  document.title = `Zusammenfassung ${fall.titel} · Checkliste Fallbeispiele`;
  const phases = phasesFor(fall);
  const critOpen = phases.flatMap((p) => flatItems(p).filter((it) => it.kritisch && !cs.checked[it.key]).map((it) => ({ ...it, phase: p.titel })));
  const today = new Date().toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });

  app.innerHTML = `
    <header class="topbar no-print"><div class="topbar-inner">
      <a class="icon-btn" href="#/fall/${encodeURIComponent(fall.id)}" aria-label="Zurück zur Checkliste">‹</a>
      <div class="topbar-title"><h1>Zusammenfassung</h1><p class="sub">${esc(fall.titel)}</p></div>
    </div></header>
    <div class="content summary">
      <div class="print-head"><h1>Zusammenfassung: ${esc(fall.titel)}</h1><p>Checkliste Fallbeispiele · ${today}</p></div>

      <section class="card sum-meta">
        <div><span class="muted small">${fall.neutral ? 'Einsatz / Stichwort' : 'Fallbeispiel'}</span><strong>${esc(fall.neutral ? (cs.stichwort || '–') : fall.titel)}</strong></div>
        <div><span class="muted small">Datum</span><strong>${today}</strong></div>
        <div><span class="muted small">Einsatzzeit</span><strong>${fmt(elapsed(cs))}</strong></div>
      </section>

      ${critOpen.length ? `<section class="card crit-card">
        <h2 class="h3">Nicht erledigte kritische Punkte</h2>
        <ul>${critOpen.map((it) => `<li>${esc(it.text)} <span class="muted small">(${esc(it.phase)})</span></li>`).join('')}</ul>
      </section>` : ''}

      ${phases.map((p, i) => `<section class="card">
          <h2 class="h3">${i + 1}. ${esc(p.titel)}</h2>
          <ul class="sum-list">${p.punkte.map((it) => sumItemHtml(it, cs)).join('')}</ul>
        </section>`).join('')}

      <section class="card">
        <h2 class="h3">Notizen / Feedback</h2>
        <p class="notes-out">${cs.notizen ? esc(cs.notizen) : '<span class="muted">Keine Notizen erfasst.</span>'}</p>
      </section>

      <div class="actions no-print">
        <button type="button" class="btn btn-primary" id="copy">Als Text kopieren</button>
        <button type="button" class="btn" id="print">Drucken / als PDF sichern</button>
        <a class="btn btn-ghost" href="#/fall/${encodeURIComponent(fall.id)}">Zurück zur Checkliste</a>
      </div>
      <p id="copy-status" class="muted small no-print" role="status" style="text-align:center"></p>
    </div>`;

  document.getElementById('print').addEventListener('click', () => window.print());
  document.getElementById('copy').addEventListener('click', async () => {
    const ok = await copyText(summaryText(fall, cs));
    document.getElementById('copy-status').textContent = ok ? 'Zusammenfassung in die Zwischenablage kopiert.' : 'Kopieren nicht möglich – bitte «Drucken / als PDF» verwenden.';
  });
}

function summaryText(fall, cs) {
  const lines = [
    `ZUSAMMENFASSUNG – ${fall.titel}`,
    ...(fall.neutral ? [`Einsatz / Stichwort: ${cs.stichwort || '–'}`] : []),
    `Datum: ${new Date().toLocaleDateString('de-CH')}`,
    `Einsatzzeit: ${fmt(elapsed(cs))}`,
    ''
  ];
  const line = (it, indent) => {
    const ch = cs.checked[it.key];
    lines.push(ch ? `${indent}[x] ${it.text}  (+${fmt(ch.t)})` : `${indent}[ ] ${it.text}${it.kritisch ? '  – KRITISCH' : ''}`);
    (it.unterpunkte || []).forEach((u) => line(u, indent + '    '));
  };
  phasesFor(fall).forEach((p, i) => {
    lines.push(`${i + 1}. ${p.titel}`);
    p.punkte.forEach((it) => line(it, '  '));
    lines.push('');
  });
  lines.push('Notizen / Feedback:', cs.notizen || '–');
  return lines.join('\n');
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch (e) { /* Fallback unten */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) { return false; }
}

/* ---------- Start ---------- */
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]');
  if (!b) return;
  state.modus = b.dataset.mode;
  saveState();
  applyMode();
});

// Timer läuft korrekt weiter, auch wenn die App im Hintergrund war
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    const cs = parts[0] === 'fall' && state.faelle[decodeURIComponent(parts[1] || '')];
    if (cs && cs.timer.running) { renderTimer(cs); wakeLock = null; requestWakeLock(); }
  }
});

function showError(msg) {
  app.innerHTML = `<div class="error"><h2>Fallbeispiele konnten nicht geladen werden</h2><p>${esc(msg)}</p></div>`;
}

async function init() {
  try {
    const res = await fetch('faelle.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Datei faelle.json nicht gefunden (Status ${res.status}).`);
    DATA = await res.json();
    if (!Array.isArray(DATA.phasen) || !Array.isArray(DATA.faelle)) throw new Error('faelle.json braucht die Bereiche «phasen» und «faelle».');
  } catch (e) {
    const local = location.protocol === 'file:' ? ' Die App muss über eine Webadresse geöffnet werden (z. B. Netlify), nicht direkt als Datei.' : '';
    showError((e instanceof SyntaxError ? 'faelle.json enthält einen Formatfehler (z. B. fehlendes Komma oder Anführungszeichen).' : e.message) + local);
    return;
  }
  window.addEventListener('hashchange', route);
  route();
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // Wenn eine neue Version aktiv wird, die Seite einmal neu laden
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then((reg) => reg.update())
      .catch(() => {});
  });
  // Beim Zurückkehren in die App nach Updates suchen
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {});
    }
  });
}

init();
