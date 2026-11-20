'use strict';

const KEY = 'asistencia.v1';
const STATUSES = [
  { k: 'asistio', l: 'Asistió' },
  { k: 'falto', l: 'Faltó' },
  { k: 'descanso', l: 'Descanso' },
  { k: 'dobleteo', l: 'Dobleteo' },
  { k: 'tardanza', l: 'Tardanza' },
  { k: 'permiso', l: 'Permiso' },
  { k: 'vacaciones', l: 'Vacaciones' },
];
const LABEL = Object.fromEntries(STATUSES.map(s => [s.k, s.l]));
const DOW_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DOW_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/* ---------- datos ---------- */
let db = load();
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Array.isArray(d.workers) && d.records && typeof d.records === 'object') return d;
  } catch (e) { /* datos vacíos o dañados */ }
  return { v: 1, workers: [], records: {} };
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { toast('No se pudo guardar: almacenamiento lleno o bloqueado'); }
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

/* ---------- fechas ---------- */
const pad = n => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
function todayStr() { const t = new Date(); return ymd(t.getFullYear(), t.getMonth(), t.getDate()); }
function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return null;
  const y = +m[1], mo = +m[2] - 1, d = +m[3];
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
  return dt;
}
const fmt = dt => ymd(dt.getFullYear(), dt.getMonth(), dt.getDate());
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
function addDays(s, n) { const d = parseDate(s); return fmt(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); }
function weekStart(s) { const d = parseDate(s); return addDays(s, -((d.getDay() + 6) % 7)); } // semana inicia en lunes
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- lógica de estados ---------- */
function rec(date, wid) { return (db.records[date] || {})[wid] || null; }
// Estado efectivo: el marcado, o "descanso" sugerido si coincide con el día fijo.
function effective(w, date) {
  const r = rec(date, w.id);
  if (r && r.s) return r.s;
  if (w.active && w.restDay != null && date >= w.since) {
    const dt = parseDate(date);
    if (dt && dt.getDay() === w.restDay) return 'descanso';
  }
  return null;
}
function setRecord(date, wid, patch) {
  const day = db.records[date] || (db.records[date] = {});
  const r = Object.assign({ s: null, n: '' }, day[wid], patch);
  if (!r.s && !r.n) delete day[wid]; else day[wid] = r;
  if (!Object.keys(day).length) delete db.records[date];
  save();
}
function activeWorkers() { return db.workers.filter(w => w.active); }
// Pendientes: solo hoy y días futuros. Días pasados no muestran indicador (null).
function pendingOn(date) {
  if (date < todayStr()) return null;
  const ws = activeWorkers().filter(w => date >= w.since);
  if (!ws.length) return null;
  return ws.filter(w => !effective(w, date)).length;
}
function badgeFor(date) {
  const n = pendingOn(date);
  if (n === null) return '';
  return n > 0 ? `<span class="badge warn">${n}</span>` : '<span class="badge ok">✓</span>';
}

/* ---------- avatar ---------- */
function avatar(w, cls) {
  if (w.photo) return `<img class="av ${cls}" src="${esc(w.photo)}" alt="">`;
  if (w.icon) return `<span class="av ico ${cls}">${esc(w.icon)}</span>`;
  const name = (w.name || '').trim();
  const hue = ([...name].reduce((a, c) => a + c.charCodeAt(0), 0) * 47) % 360;
  return `<span class="av ${cls}" style="background:hsl(${hue} 45% 45%)">${esc((name[0] || '?').toUpperCase())}</span>`;
}
function resizePhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const S = 192, c = document.createElement('canvas');
      c.width = c.height = S;
      const m = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, S, S);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagen')); };
    img.src = url;
  });
}

/* ---------- UI base ---------- */
const view = document.getElementById('view');
const state = {
  tab: 'calendario', view: 'dia', cur: todayStr(), back: null, sel: null,
  editing: null, draft: null, report: null,
};
{
  const t = new Date();
  state.report = { from: ymd(t.getFullYear(), t.getMonth(), 1), to: ymd(t.getFullYear(), t.getMonth(), daysInMonth(t.getFullYear(), t.getMonth())), worker: '' };
}
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
}
function setTitle(t) { document.getElementById('title').textContent = t; }

function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === state.tab));
  const scroll = view.scrollTop;
  if (state.tab === 'calendario') renderCalendar();
  else if (state.tab === 'trabajadores') renderWorkers();
  else if (state.tab === 'reporte') renderReport();
  else renderBackup();
  view.scrollTop = scroll;
}

/* ---------- calendario ---------- */
const VIEWS = [['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes'], ['anio', 'Año']];

function periodTitle() {
  const d = parseDate(state.cur);
  if (state.view === 'semana') {
    const a = parseDate(weekStart(state.cur)), b = parseDate(addDays(weekStart(state.cur), 6));
    return `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]} – ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]} ${b.getFullYear()}`;
  }
  if (state.view === 'mes') return `${cap(MONTHS[d.getMonth()])} ${d.getFullYear()}`;
  if (state.view === 'anio') return String(d.getFullYear());
  return `${cap(DOW_NAMES[d.getDay()])} ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}
function shift(dir) {
  const d = parseDate(state.cur);
  if (state.view === 'semana') state.cur = addDays(state.cur, 7 * dir);
  else if (state.view === 'dia') state.cur = addDays(state.cur, dir);
  else if (state.view === 'mes') state.cur = fmt(new Date(d.getFullYear(), d.getMonth() + dir, 1));
  else state.cur = fmt(new Date(d.getFullYear() + dir, d.getMonth(), 1));
}
function headerHtml() {
  return `<div class="seg">${VIEWS.map(([k, l]) => `<button class="${state.view === k ? 'on' : ''}" data-act="setView" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="monthnav">
      <button data-act="prev" aria-label="Anterior">‹</button>
      <div class="name">${periodTitle()}</div>
      <button data-act="next" aria-label="Siguiente">›</button>
    </div>`;
}

function renderCalendar() {
  if (state.sel) return renderWorkerDay();
  setTitle('Calendario');
  const v = state.view;
  let body = '';
  if (v === 'semana') body = weekHtml();
  else if (v === 'dia') body = dayHtml();
  else if (v === 'mes') body = monthHtml();
  else body = yearHtml();
  const noWorkers = activeWorkers().length ? '' : '<p class="card muted" style="margin-top:12px">Primero agrega trabajadores en la pestaña «Personal».</p>';
  view.innerHTML = headerHtml() + body + noWorkers;
}

function weekHtml() {
  const start = weekStart(state.cur), today = todayStr();
  let rows = '';
  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i), dt = parseDate(date);
    // Una bolita por trabajador: borde de color = estado marcado; punteado gris = sin marcar.
    const dots = db.workers.filter(w => (w.active && date >= w.since) || (rec(date, w.id) && rec(date, w.id).s)).map(w => {
      const s = effective(w, date);
      return `<span class="wav${s ? ' s-' + s : ' none'}" title="${esc(w.name)}: ${s ? LABEL[s] : 'Sin marcar'}">${avatar(w, 'xs')}</span>`;
    }).join('');
    rows += `<button class="weekrow${date === today ? ' today' : ''}" data-act="openDay" data-date="${date}">
      <span class="wd"><b>${cap(DOW_NAMES[dt.getDay()])}</b><small>${dt.getDate()} ${MONTHS_SHORT[dt.getMonth()]}</small></span>
      <span class="dots">${dots}</span>${badgeFor(date)}</button>`;
  }
  return rows;
}

function monthHtml() {
  const d = parseDate(state.cur), y = d.getFullYear(), m = d.getMonth();
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  const today = todayStr();
  let cells = '';
  for (let i = 0; i < offset; i++) cells += '<div class="cell empty"></div>';
  for (let n = 1; n <= daysInMonth(y, m); n++) {
    const date = ymd(y, m, n);
    cells += `<button class="cell${date === today ? ' today' : ''}" data-act="openDay" data-date="${date}"><span class="n">${n}</span><span class="slot">${badgeFor(date)}</span></button>`;
  }
  return `<div class="grid">${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(x => `<div class="dow">${x}</div>`).join('')}${cells}</div>`;
}

function yearHtml() {
  const d = parseDate(state.cur), y = d.getFullYear(), today = todayStr();
  let html = '<div class="year">';
  for (let m = 0; m < 12; m++) {
    const offset = (new Date(y, m, 1).getDay() + 6) % 7;
    let days = '<span></span>'.repeat(offset);
    for (let n = 1; n <= daysInMonth(y, m); n++) days += `<span${ymd(y, m, n) === today ? ' class="t"' : ''}>${n}</span>`;
    html += `<button class="mini${m === d.getMonth() ? ' cur' : ''}" data-act="goMonth" data-m="${m}"><span class="mname">${MONTHS[m]}</span><span class="mgrid">${days}</span></button>`;
  }
  return html + '</div>';
}

function dayHtml() {
  const date = state.cur;
  const list = db.workers.filter(w => w.active || (rec(date, w.id) && rec(date, w.id).s));
  let html = '<div class="stack">';
  if (state.back) html += '<button class="btn sec" data-act="backCal">← Volver al calendario</button>';
  if (list.length) html += '<button class="btn" data-act="markAll">✔ Marcar a todos como asistió</button>';
  html += '</div>';
  if (!list.length) return html + '<p class="card muted" style="margin-top:10px">No hay trabajadores activos.</p>';
  html += '<div class="people">';
  for (const w of list) {
    const r = rec(date, w.id);
    const eff = effective(w, date);
    const sugg = !(r && r.s) && eff;
    html += `<button class="person s-${eff || 'none'}" data-act="openWorker" data-w="${w.id}">
      ${avatar(w, 'lg')}
      <span class="pn">${esc(w.name)}${w.active ? '' : ' (inactivo)'}</span>
      <span class="ps${eff ? '' : ' none'}${sugg ? ' sugg' : ''}">${eff ? LABEL[eff] + (sugg ? ' (sugerido)' : '') : 'Sin marcar'}</span>
      <span class="pr">Descanso fijo: ${w.restDay == null ? 'ninguno' : DOW_NAMES[w.restDay]}</span>
    </button>`;
  }
  return html + '</div>';
}

function renderWorkerDay() {
  const w = db.workers.find(x => x.id === state.sel);
  if (!w) { state.sel = null; return renderCalendar(); }
  const date = state.cur, dt = parseDate(date);
  const r = rec(date, w.id), eff = effective(w, date), sugg = !(r && r.s) && eff;
  setTitle(w.name);
  view.innerHTML = `<div class="sticky"><button class="btn sec" data-act="backList">← Volver a la lista</button></div>
    <div class="card profile">${avatar(w, 'xl')}<div>
      <b>${esc(w.name)}</b>
      <div class="muted">${cap(DOW_NAMES[dt.getDay()])} ${dt.getDate()} de ${MONTHS[dt.getMonth()]}</div>
      <div class="muted">Descanso fijo: ${w.restDay == null ? 'ninguno' : DOW_NAMES[w.restDay]}</div>
    </div></div>
    <div class="statuslist">${STATUSES.map(s =>
      `<button class="status s-${s.k}${eff === s.k ? ' on' : ''}${sugg && eff === s.k ? ' sugg' : ''}" data-act="setStatus" data-w="${w.id}" data-s="${s.k}">${s.l}${sugg && eff === s.k ? ' · sugerido' : ''}</button>`).join('')}</div>
    <div class="card" style="margin-top:12px"><label for="nNote">Nota (opcional)</label>
      <input type="text" id="nNote" maxlength="120" placeholder="Escribe una nota" value="${esc(r ? r.n : '')}" data-act="note" data-w="${w.id}"></div>`;
}

/* ---------- trabajadores ---------- */
const EMOJIS = ['🌸', '🌺', '🌻', '🌷', '🌹', '🌼', '💐', '🍀', '🌵', '🌴', '⭐', '🔥', '⚡', '🦋', '🐶', '🐱', '🐼', '🦁', '🐢', '🍎', '🚀', '⚽', '🎸'];
function restOptions(sel) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  return `<option value="">Ninguno</option>` + order.map(d => `<option value="${d}"${sel === d ? ' selected' : ''}>${DOW_NAMES[d][0].toUpperCase() + DOW_NAMES[d].slice(1)}</option>`).join('');
}
function renderWorkers() {
  setTitle('Personal');
  let form = '';
  if (state.editing) {
    const d = state.draft;
    form = `<div class="card stack" style="margin-bottom:12px">
      <h2>${state.editing === 'new' ? 'Nuevo trabajador' : 'Editar trabajador'}</h2>
      <div class="photorow">${avatar({ name: d.name, photo: d.photo, icon: d.icon }, 'xl')}
        <div class="stack">
          <button class="btn sec small" data-act="pickPhoto">📷 ${d.photo ? 'Cambiar foto' : 'Agregar foto'}</button>
          ${d.photo ? '<button class="btn sec small" data-act="removePhoto">Quitar foto</button>' : ''}
        </div></div>
      <div><label>O elige un icono (en lugar de la foto)</label>
        <div class="emojis"><button class="emo${!d.icon && !d.photo ? ' on' : ''}" data-act="pickIcon" data-i="">Aa</button>${EMOJIS.map(e => `<button class="emo${d.icon === e && !d.photo ? ' on' : ''}" data-act="pickIcon" data-i="${e}">${e}</button>`).join('')}</div></div>
      <div><label for="wName">Nombre</label><input type="text" id="wName" maxlength="60" value="${esc(d.name)}"></div>
      <div><label for="wRest">Día de descanso semanal</label><select id="wRest">${restOptions(d.restDay)}</select></div>
      <div class="row"><button class="btn sec" data-act="cancelEdit">Cancelar</button><button class="btn" data-act="saveWorker">Guardar</button></div>
    </div>`;
  } else {
    form = '<button class="btn" data-act="newWorker" style="margin-bottom:12px">＋ Agregar trabajador</button>';
  }
  const items = db.workers.map(w => `<div class="card worker">
      <div class="top">${avatar(w, 'md')}<div class="info"><b>${esc(w.name)} ${w.active ? '' : '<span class="tag">inactivo</span>'}</b>
        <span class="muted">Descanso: ${w.restDay == null ? 'ninguno' : DOW_NAMES[w.restDay]}</span></div></div>
      <div class="acts">
        <button class="btn sec small" data-act="editWorker" data-w="${w.id}">Editar</button>
        <button class="btn sec small" data-act="toggleWorker" data-w="${w.id}">${w.active ? 'Desactivar' : 'Activar'}</button>
        <button class="btn danger small" data-act="delWorker" data-w="${w.id}">Eliminar</button>
      </div></div>`).join('<div style="height:8px"></div>');
  view.innerHTML = form + (items || '<p class="muted">Aún no hay trabajadores.</p>');
}

/* ---------- reporte ---------- */
function buildReport() {
  const { from, to, worker } = state.report;
  const a = parseDate(from), b = parseDate(to);
  if (!a || !b) { toast('Fechas no válidas'); return null; }
  if (a > b) { toast('La fecha de inicio es posterior a la de fin'); return null; }
  if ((b - a) / 86400000 > 3660) { toast('El rango máximo es de 10 años'); return null; }
  const workers = db.workers.filter(w => !worker || w.id === worker);
  if (!workers.length) { toast('No hay trabajadores para el reporte'); return null; }
  const today = todayStr();
  const summary = [], detail = [];
  const keys = ['asistio', 'falto', 'descanso', 'dobleteo', 'tardanza', 'permiso', 'vacaciones'];
  for (const w of workers) {
    const c = Object.fromEntries(keys.map(k => [k, 0]));
    let un = 0;
    for (let dt = new Date(a); dt <= b; dt = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + 1)) {
      const date = fmt(dt);
      const s = effective(w, date);
      const r = rec(date, w.id);
      if (s) c[s]++;
      else if (date <= today && w.active && date >= w.since) un++;
      const estado = s ? LABEL[s] : (date <= today ? 'Sin marcar' : '');
      // Se omiten días previos al alta o posteriores a hoy sin dato, y trabajadores inactivos sin marca.
      if (!s && !(date <= today && w.active && date >= w.since)) continue;
      detail.push([date, DOW_NAMES[dt.getDay()][0].toUpperCase() + DOW_NAMES[dt.getDay()].slice(1), w.name, estado, r ? r.n : '']);
    }
    summary.push([w.name, c.asistio, c.falto, c.descanso, c.dobleteo, c.tardanza, c.permiso, c.vacaciones, un]);
  }
  return { summary, detail, name: `Asistencia_${from}_a_${to}.xlsx` };
}
function makeWorkbook(rep) {
  const bold = { font: { bold: true } };
  const sheet = (head, rows, widths) => {
    const ws = XLSX.utils.aoa_to_sheet([head, ...rows]);
    head.forEach((_, i) => { const ref = XLSX.utils.encode_cell({ r: 0, c: i }); ws[ref].s = bold; });
    ws['!cols'] = widths.map((w, i) => ({ wch: Math.min(60, Math.max(w, ...[head, ...rows].map(r => String(r[i] == null ? '' : r[i]).length)) + 2) }));
    return ws;
  };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet(['Nombre', 'Asistencias', 'Faltas', 'Descansos', 'Dobleteos', 'Tardanzas', 'Permisos', 'Vacaciones', 'Días sin marcar'], rep.summary, [10, 11, 7, 10, 10, 10, 9, 11, 14]), 'Resumen');
  XLSX.utils.book_append_sheet(wb, sheet(['Fecha', 'Día de la semana', 'Trabajador', 'Estado', 'Nota'], rep.detail, [10, 16, 12, 11, 10]), 'Detalle');
  return new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: XLSX_MIME });
}
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function renderReport() {
  setTitle('Reporte');
  const r = state.report;
  view.innerHTML = `<div class="card stack">
    <div><label for="rFrom">Desde</label><input type="date" id="rFrom" value="${r.from}"></div>
    <div><label for="rTo">Hasta</label><input type="date" id="rTo" value="${r.to}"></div>
    <div><label for="rWorker">Trabajador</label><select id="rWorker"><option value="">Todos</option>${db.workers.map(w => `<option value="${w.id}"${r.worker === w.id ? ' selected' : ''}>${esc(w.name)}</option>`).join('')}</select></div>
    <button class="btn" data-act="reportShare">📤 Compartir Excel</button>
    <button class="btn sec" data-act="reportDownload">⬇ Descargar Excel</button>
  </div>`;
}

/* ---------- respaldo ---------- */
function renderBackup() {
  setTitle('Respaldo');
  view.innerHTML = `<div class="card stack">
    <p class="muted" style="margin:0">Guarda una copia de todos tus datos en un archivo para no perderlos o para cambiar de teléfono.</p>
    <button class="btn" data-act="exportBackup">⬇ Exportar respaldo</button>
    <button class="btn sec" data-act="importBackup">⬆ Importar respaldo</button>
  </div>`;
}
function validBackup(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.workers) || !d.records || typeof d.records !== 'object') return false;
  const ids = new Set();
  for (const w of d.workers) {
    if (!w || typeof w.id !== 'string' || typeof w.name !== 'string' || typeof w.active !== 'boolean') return false;
    if (!(w.restDay === null || (Number.isInteger(w.restDay) && w.restDay >= 0 && w.restDay <= 6))) return false;
    if (!parseDate(w.since)) return false;
    if (w.photo != null && (typeof w.photo !== 'string' || !w.photo.startsWith('data:image/'))) return false;
    if (w.icon != null && (typeof w.icon !== 'string' || w.icon.length > 8)) return false;
    if (ids.has(w.id)) return false;
    ids.add(w.id);
  }
  for (const [date, day] of Object.entries(d.records)) {
    if (!parseDate(date) || !day || typeof day !== 'object') return false;
    for (const [wid, r] of Object.entries(day)) {
      if (!ids.has(wid) || !r || typeof r !== 'object') return false;
      if (r.s != null && !LABEL[r.s]) return false;
      if (r.n != null && typeof r.n !== 'string') return false;
    }
  }
  return true;
}

/* ---------- eventos ---------- */
document.getElementById('tabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  state.tab = b.dataset.tab; state.sel = null; state.editing = null; state.draft = null;
  render();
});

const actions = {
  setView(el) { state.view = el.dataset.v; state.back = null; state.sel = null; view.scrollTop = 0; },
  prev() { shift(-1); },
  next() { shift(1); },
  openDay(el) { state.back = state.view; state.cur = el.dataset.date; state.view = 'dia'; view.scrollTop = 0; },
  goMonth(el) { const y = parseDate(state.cur).getFullYear(); state.cur = ymd(y, +el.dataset.m, 1); state.view = 'mes'; },
  backCal() { state.view = state.back || 'dia'; state.back = null; state.sel = null; view.scrollTop = 0; },
  openWorker(el) { state.sel = el.dataset.w; view.scrollTop = 0; },
  backList() { state.sel = null; view.scrollTop = 0; },
  markAll() {
    let n = 0;
    for (const w of activeWorkers()) {
      if (!effective(w, state.cur)) { setRecord(state.cur, w.id, { s: 'asistio' }); n++; }
    }
    toast(n ? `${n} marcado(s) como asistió` : 'No había trabajadores sin marcar');
  },
  setStatus(el) {
    const w = db.workers.find(x => x.id === el.dataset.w);
    const s = el.dataset.s;
    const r = rec(state.cur, w.id);
    // Tocar el estado ya marcado lo quita (vuelve a sin marcar / descanso sugerido).
    const quitar = r && r.s === s;
    setRecord(state.cur, w.id, { s: quitar ? null : s });
    state.sel = null; view.scrollTop = 0;
    toast(quitar ? `${w.name}: estado quitado` : `${w.name}: ${LABEL[s]}`);
  },
  newWorker() { state.editing = 'new'; state.draft = { name: '', restDay: null, photo: '', icon: '' }; },
  editWorker(el) {
    const w = db.workers.find(x => x.id === el.dataset.w);
    state.editing = w.id; state.draft = { name: w.name, restDay: w.restDay, photo: w.photo || '', icon: w.icon || '' };
  },
  pickIcon(el) { state.draft.icon = el.dataset.i; state.draft.photo = ''; },
  cancelEdit() { state.editing = null; state.draft = null; },
  pickPhoto() { document.getElementById('photoFile').click(); return false; },
  removePhoto() { state.draft.photo = ''; },
  saveWorker() {
    const name = document.getElementById('wName').value.trim().replace(/\s+/g, ' ');
    const rv = document.getElementById('wRest').value;
    if (!name) { toast('Escribe un nombre'); return false; }
    const restDay = rv === '' ? null : +rv;
    const photo = state.draft.photo || '';
    const icon = photo ? '' : (state.draft.icon || '');
    if (db.workers.some(w => w.id !== state.editing && w.name.toLowerCase() === name.toLowerCase())) { toast('Ya existe un trabajador con ese nombre'); return false; }
    if (state.editing === 'new') {
      const w = { id: uid(), name, restDay, active: true, since: todayStr() };
      if (photo) w.photo = photo;
      if (icon) w.icon = icon;
      db.workers.push(w);
    } else {
      const w = db.workers.find(x => x.id === state.editing);
      w.name = name; w.restDay = restDay;
      if (photo) w.photo = photo; else delete w.photo;
      if (icon) w.icon = icon; else delete w.icon;
    }
    save(); state.editing = null; state.draft = null;
  },
  toggleWorker(el) { const w = db.workers.find(x => x.id === el.dataset.w); w.active = !w.active; save(); },
  delWorker(el) {
    const w = db.workers.find(x => x.id === el.dataset.w);
    if (!confirm(`¿Eliminar a "${w.name}" y todos sus registros de asistencia? Esto no se puede deshacer.`)) return false;
    db.workers = db.workers.filter(x => x.id !== w.id);
    for (const date of Object.keys(db.records)) {
      delete db.records[date][w.id];
      if (!Object.keys(db.records[date]).length) delete db.records[date];
    }
    if (state.report.worker === w.id) state.report.worker = '';
    save();
  },
  reportDownload() {
    const rep = buildReport(); if (!rep) return false;
    download(makeWorkbook(rep), rep.name);
    return false;
  },
  async reportShare() {
    const rep = buildReport(); if (!rep) return false;
    const blob = makeWorkbook(rep);
    const file = new File([blob], rep.name, { type: XLSX_MIME });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: rep.name }); }
      catch (err) {
        if (err.name !== 'AbortError') { download(blob, rep.name); toast('No se pudo abrir «Compartir» (' + err.name + '): se descargó el archivo'); }
      }
    } else {
      download(blob, rep.name);
      toast('Este navegador no permite compartir archivos: se descargó el Excel');
    }
    return false;
  },
  exportBackup() {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    download(blob, `respaldo_asistencia_${todayStr()}.json`);
    return false;
  },
  importBackup() { document.getElementById('importFile').click(); return false; },
};

view.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'INPUT') return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  const res = await fn(el);
  if (res !== false) render();
});
view.addEventListener('input', e => {
  if (e.target.id === 'wName' && state.draft) state.draft.name = e.target.value;
});
view.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.act === 'note') { setRecord(state.cur, t.dataset.w, { n: t.value.trim() }); return; }
  if (t.id === 'wRest' && state.draft) state.draft.restDay = t.value === '' ? null : +t.value;
  else if (t.id === 'rFrom') state.report.from = t.value;
  else if (t.id === 'rTo') state.report.to = t.value;
  else if (t.id === 'rWorker') state.report.worker = t.value;
});

document.getElementById('photoFile').addEventListener('change', async e => {
  const input = e.target, file = input.files[0];
  input.value = '';
  if (!file || !state.draft) return;
  try { state.draft.photo = await resizePhoto(file); state.draft.icon = ''; render(); }
  catch (err) { toast('No se pudo leer la imagen'); }
});

document.getElementById('importFile').addEventListener('change', async e => {
  const input = e.target, file = input.files[0];
  input.value = '';
  if (!file) return;
  let data;
  try { data = JSON.parse(await file.text()); } catch (err) { toast('El archivo no es un respaldo válido'); return; }
  if (!validBackup(data)) { toast('El archivo no es un respaldo válido'); return; }
  const n = data.workers.length, d = Object.keys(data.records).length;
  if (!confirm(`Importar respaldo con ${n} trabajador(es) y ${d} día(s) con registros.\n\nSe REEMPLAZARÁN todos los datos actuales. ¿Continuar?`)) return;
  db = { v: 1, workers: data.workers, records: data.records };
  state.report.worker = ''; state.sel = null;
  save(); render();
  toast('Respaldo importado');
});

/* ---------- opciones (tamaño de letra) ---------- */
const UI_KEY = 'asistencia.ui';
const FONT_SIZES = [['Pequeña', 90], ['Normal', 100], ['Grande', 115], ['Muy grande', 130]];
const ui = { fs: 100 };
try {
  const u = JSON.parse(localStorage.getItem(UI_KEY));
  if (u && FONT_SIZES.some(f => f[1] === u.fs)) ui.fs = u.fs;
} catch (e) { /* sin preferencia guardada */ }
function applyUi() { document.documentElement.style.fontSize = ui.fs + '%'; }
function renderOpts() {
  document.getElementById('fsBtns').innerHTML = FONT_SIZES.map(([l, v]) => `<button class="btn sec${ui.fs === v ? ' on' : ''}" data-fs="${v}">${l}</button>`).join('');
}
const opts = document.getElementById('opts');
document.getElementById('optBtn').addEventListener('click', () => { renderOpts(); opts.hidden = false; });
document.getElementById('optsClose').addEventListener('click', () => { opts.hidden = true; });
opts.addEventListener('click', e => {
  if (e.target === opts) { opts.hidden = true; return; }
  const b = e.target.closest('[data-fs]');
  if (!b) return;
  ui.fs = +b.dataset.fs;
  try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (err) { /* sin almacenamiento */ }
  applyUi(); renderOpts(); render();
});
applyUi();

render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
