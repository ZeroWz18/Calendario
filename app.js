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
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
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
// Cuenta de días sin marcar: solo trabajadores activos, desde que se crearon, hasta hoy.
function unmarkedOn(date) {
  if (date > todayStr()) return 0;
  return activeWorkers().filter(w => date >= w.since && !effective(w, date)).length;
}

/* ---------- UI base ---------- */
const view = document.getElementById('view');
const state = { tab: 'calendario', y: new Date().getFullYear(), m: new Date().getMonth(), day: null, editing: null, report: null };
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
  if (state.tab === 'calendario') state.day ? renderDay() : renderCalendar();
  else if (state.tab === 'trabajadores') renderWorkers();
  else if (state.tab === 'reporte') renderReport();
  else renderBackup();
  view.scrollTop = scroll;
}

/* ---------- calendario ---------- */
function renderCalendar() {
  setTitle('Calendario');
  const { y, m } = state;
  const first = new Date(y, m, 1).getDay();
  const offset = (first + 6) % 7; // semana inicia en lunes
  const today = todayStr();
  let cells = '';
  for (let i = 0; i < offset; i++) cells += '<div class="cell empty"></div>';
  for (let d = 1; d <= daysInMonth(y, m); d++) {
    const date = ymd(y, m, d);
    const un = unmarkedOn(date);
    let badge = '';
    if (un > 0) badge = `<span class="badge warn">${un}</span>`;
    else if (date <= today && activeWorkers().length) badge = '<span class="badge ok">✓</span>';
    cells += `<button class="cell${date === today ? ' today' : ''}" data-act="openDay" data-date="${date}"><span class="n">${d}</span>${badge}</button>`;
  }
  view.innerHTML = `
    <div class="monthnav">
      <button data-act="prevMonth" aria-label="Mes anterior">‹</button>
      <div class="name">${MONTHS[m]} ${y}</div>
      <button data-act="nextMonth" aria-label="Mes siguiente">›</button>
    </div>
    <div class="grid">${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(x => `<div class="dow">${x}</div>`).join('')}${cells}</div>
    <p class="legend"><span class="badge warn">3</span> = trabajadores sin marcar &nbsp; <span class="badge ok">✓</span> = todos marcados</p>
    ${activeWorkers().length ? '' : '<p class="card muted">Primero agrega trabajadores en la pestaña «Personal».</p>'}`;
}

function renderDay() {
  const date = state.day;
  const dt = parseDate(date);
  setTitle(`${DOW_NAMES[dt.getDay()]} ${dt.getDate()} de ${MONTHS[dt.getMonth()]}`);
  const dayRecs = db.records[date] || {};
  const list = db.workers.filter(w => w.active || (dayRecs[w.id] && dayRecs[w.id].s));
  let html = `<div class="stack"><button class="btn sec" data-act="backCal">← Volver al calendario</button>
    <button class="btn" data-act="markAll">✔ Marcar a todos como asistió</button></div>`;
  if (!list.length) html += '<p class="card muted" style="margin-top:10px">No hay trabajadores activos.</p>';
  for (const w of list) {
    const r = dayRecs[w.id];
    const explicit = r && r.s;
    const eff = effective(w, date);
    const sugg = !explicit && eff;
    html += `<div class="card workerbox" data-w="${w.id}">
      <div class="nm"><span>${esc(w.name)}${w.active ? '' : ' <span class="tag">inactivo</span>'}</span>
        <span class="sug">${sugg ? 'descanso sugerido' : ''}</span></div>
      <div class="chips">${STATUSES.map(s =>
        `<button class="chip s-${s.k}${eff === s.k ? ' on' : ''}${sugg && eff === s.k ? ' sugg' : ''}" data-act="setStatus" data-w="${w.id}" data-s="${s.k}">${s.l}</button>`).join('')}</div>
      <div class="note"><input type="text" maxlength="120" placeholder="Nota (opcional)" value="${esc(r ? r.n : '')}" data-act="note" data-w="${w.id}"></div>
    </div>`;
  }
  view.innerHTML = html;
}

/* ---------- trabajadores ---------- */
function restOptions(sel) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  return `<option value="">Ninguno</option>` + order.map(d => `<option value="${d}"${sel === d ? ' selected' : ''}>${DOW_NAMES[d][0].toUpperCase() + DOW_NAMES[d].slice(1)}</option>`).join('');
}
function renderWorkers() {
  setTitle('Personal');
  let form = '';
  if (state.editing) {
    const w = state.editing === 'new' ? { name: '', restDay: null } : db.workers.find(x => x.id === state.editing);
    form = `<div class="card stack" style="margin-bottom:12px">
      <h2>${state.editing === 'new' ? 'Nuevo trabajador' : 'Editar trabajador'}</h2>
      <div><label for="wName">Nombre</label><input type="text" id="wName" maxlength="60" value="${esc(w.name)}"></div>
      <div><label for="wRest">Día de descanso semanal</label><select id="wRest">${restOptions(w.restDay)}</select></div>
      <div class="row"><button class="btn sec" data-act="cancelEdit">Cancelar</button><button class="btn" data-act="saveWorker">Guardar</button></div>
    </div>`;
  } else {
    form = '<button class="btn" data-act="newWorker" style="margin-bottom:12px">＋ Agregar trabajador</button>';
  }
  const items = db.workers.map(w => `<div class="card worker">
      <div class="info"><b>${esc(w.name)} ${w.active ? '' : '<span class="tag">inactivo</span>'}</b>
        <span class="muted">Descanso: ${w.restDay == null ? 'ninguno' : DOW_NAMES[w.restDay]}</span></div>
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
    <button class="btn" data-act="reportDownload">⬇ Descargar Excel</button>
    <button class="btn sec" data-act="reportShare">📤 Compartir</button>
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
  state.tab = b.dataset.tab; state.day = null; state.editing = null;
  render();
});

const actions = {
  prevMonth() { state.m--; if (state.m < 0) { state.m = 11; state.y--; } },
  nextMonth() { state.m++; if (state.m > 11) { state.m = 0; state.y++; } },
  openDay(el) { state.day = el.dataset.date; view.scrollTop = 0; },
  backCal() { state.day = null; },
  markAll() {
    let n = 0;
    for (const w of activeWorkers()) {
      if (!effective(w, state.day)) { setRecord(state.day, w.id, { s: 'asistio' }); n++; }
    }
    toast(n ? `${n} marcado(s) como asistió` : 'No había trabajadores sin marcar');
  },
  setStatus(el) {
    const w = db.workers.find(x => x.id === el.dataset.w);
    const s = el.dataset.s;
    const r = rec(state.day, w.id);
    // Tocar el estado ya marcado lo quita (vuelve a sin marcar / descanso sugerido).
    setRecord(state.day, w.id, { s: r && r.s === s ? null : s });
  },
  newWorker() { state.editing = 'new'; },
  editWorker(el) { state.editing = el.dataset.w; },
  cancelEdit() { state.editing = null; },
  saveWorker() {
    const name = document.getElementById('wName').value.trim().replace(/\s+/g, ' ');
    const rv = document.getElementById('wRest').value;
    if (!name) { toast('Escribe un nombre'); return false; }
    const restDay = rv === '' ? null : +rv;
    if (db.workers.some(w => w.id !== state.editing && w.name.toLowerCase() === name.toLowerCase())) { toast('Ya existe un trabajador con ese nombre'); return false; }
    if (state.editing === 'new') db.workers.push({ id: uid(), name, restDay, active: true, since: todayStr() });
    else { const w = db.workers.find(x => x.id === state.editing); w.name = name; w.restDay = restDay; }
    save(); state.editing = null;
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
    const rep = buildReport(); if (!rep) return;
    const blob = makeWorkbook(rep);
    const file = new File([blob], rep.name, { type: XLSX_MIME });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: rep.name }); }
      catch (err) { if (err.name !== 'AbortError') download(blob, rep.name); }
    } else {
      download(blob, rep.name);
      toast('Compartir no disponible: se descargó el archivo');
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
view.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.act === 'note') { setRecord(state.day, t.dataset.w, { n: t.value.trim() }); return; }
  if (t.id === 'rFrom') state.report.from = t.value;
  else if (t.id === 'rTo') state.report.to = t.value;
  else if (t.id === 'rWorker') state.report.worker = t.value;
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
  state.report.worker = '';
  save(); render();
  toast('Respaldo importado');
});

render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
