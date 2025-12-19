/* Organizador Financeiro - app.js (v2 com abas)
   Abas:
   - Capa (dashboard)
   - Base de dados (tabela completa + importar/adicionar)
   - Pessoas (resumo por pessoa + total ao lado)
*/

const STORAGE_KEY = "finance_tx_v4";
const META_KEY = "finance_card_meta_v4";
const EXTRAS_KEY = "finance_extras_v4";
const SETTINGS_KEY = "finance_settings_v4";

const PEOPLE_DEFAULT = ["Pai", "Mae", "Irmao", "Eu"];
const STATUS = { OPEN: "OPEN", PAID: "PAID" };

const $ = (sel) => document.querySelector(sel);

let chartPeople = null;
let chartCards = null;

function uid(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function brl(n){
  const v = Number(n || 0);
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function toISODate(d){
  if(!d) return "";
  const dt = (d instanceof Date) ? d : new Date(d);
  if(Number.isNaN(dt.getTime())) return "";
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth()+1).padStart(2,"0");
  const dd = String(dt.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseBRDate(value){
  if(!value) return null;
  if(value instanceof Date && !Number.isNaN(value.getTime())) return value;

  if(typeof value === "number"){
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const ms = value * 24 * 60 * 60 * 1000;
    const dt = new Date(excelEpoch.getTime() + ms);
    if(!Number.isNaN(dt.getTime())) return dt;
  }

  const s = String(value).trim();
  if(!s) return null;

  if(/^\d{4}-\d{2}-\d{2}$/.test(s)){
    const dt = new Date(s + "T00:00:00");
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(m){
    const [_, dd, mm, yyyy] = m;
    const dt = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function monthKeyFromDate(dt){
  if(!dt) return "";
  const d = (dt instanceof Date) ? dt : new Date(dt);
  if(Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  return `${yyyy}-${mm}`;
}

function getSettings(){
  try{
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
  }catch{ return {}; }
}
function setSettings(patch){
  const current = getSettings();
  const next = { ...current, ...patch };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

function loadTx(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return [];
    const arr = JSON.parse(raw);
    if(!Array.isArray(arr)) return [];
    return arr;
  }catch(e){
    console.error(e);
    return [];
  }
}

function saveTx(arr){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
}


function loadMeta(){
  try{
    const raw = localStorage.getItem(META_KEY);
    if(!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  }catch{ return []; }
}
function saveMeta(arr){
  localStorage.setItem(META_KEY, JSON.stringify(arr));
}
function loadExtras(){
  try{
    const raw = localStorage.getItem(EXTRAS_KEY);
    if(!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  }catch{ return []; }
}
function saveExtras(arr){
  localStorage.setItem(EXTRAS_KEY, JSON.stringify(arr));
}

function upsertByKey(arr, item, keys){
  const idx = arr.findIndex(x => keys.every(k => String(x[k]||"") === String(item[k]||"")));
  if(idx >= 0){
    arr[idx] = { ...arr[idx], ...item };
  }else{
    arr.push(item);
  }
  return arr;
}

function normalizePerson(p){
  if(!p) return "Eu";
  const s = String(p).trim();
  if(/^m(a|ã)e$/i.test(s)) return "Mae";
  if(/^pai$/i.test(s)) return "Pai";
  if(/irm(a|ã)o/i.test(s)) return "Irmao";
  if(/^eu$/i.test(s)) return "Eu";
  return s;
}

function normalizePersonNullable(p){
  if(p === null || p === undefined) return "";
  const s = String(p).trim();
  if(!s) return "";
  return normalizePerson(s);
}



function parseSharedPeople(raw){
  const s = String(raw || "").trim();
  if(!s) return [];
  // Accept separators: x, X, ×, /
  const parts = s.split(/[\sxX×\/]+\s*/).filter(Boolean);
  if(parts.length !== 2) return [];
  const a = normalizePerson(parts[0]);
  const b = normalizePerson(parts[1]);
  if(!a || !b) return [];
  // avoid duplicates
  if(a === b) return [a];
  return [a,b];
}

function splitAmountTwo(amount){
  const v = Number(amount || 0);
  // round to cents
  const half = Math.round((v/2)*100)/100;
  const other = Math.round((v - half)*100)/100;
  return [half, other];
}

function computeDerived(tx){
  const amount = Number(tx.amount || 0);
  return {
    ...tx,
    amount,
    person: normalizePerson(tx.person),
    dividedWith: normalizePersonNullable(tx.dividedWith),
    card: String(tx.card ?? "").trim(),
    desc: String(tx.desc ?? "").trim(),
    installment: String(tx.installment ?? "").trim(),
    notes: String(tx.notes ?? "").trim(),
    status: tx.status === STATUS.PAID ? STATUS.PAID : STATUS.OPEN,
    month: String(tx.month ?? "").trim(),
    date: String(tx.date ?? "").trim(),
    due: String(tx.due ?? "").trim(),
  };
}

function seedIfEmpty(){
  const existing = loadTx();
  if(existing.length) return;

  const now = new Date();
  const mk = monthKeyFromDate(now);
  const sample = [
    { id: uid(), month: mk, card: "8458", person: "Pai", date: toISODate(now), desc: "Exemplo: Mercado", installment:"", due:"", amount: 120.50, status: STATUS.OPEN, notes:"" },
    { id: uid(), month: mk, card: "9305", person: "Eu", date: toISODate(now), desc: "Exemplo: Streaming", installment:"", due:"", amount: 19.90, status: STATUS.PAID, notes:"" },
  ].map(computeDerived);

  saveTx(sample);
}

function getState(){
  const txAll = loadTx().map(computeDerived);
  const settings = getSettings();

  const months = Array.from(new Set(txAll.map(t => t.month).filter(Boolean))).sort();
  let selectedMonth = settings.selectedMonth || monthKeyFromDate(new Date());
  if(!months.includes(selectedMonth) && months.length){
    selectedMonth = months[months.length - 1];
  }

  const selectedPerson = settings.selectedPerson || "ALL";
  const selectedCard = settings.selectedCard || "ALL";
  const query = settings.query || "";
  const view = settings.view || "home";
  const baseAllMonths = !!settings.baseAllMonths;
  const peopleMonth = settings.peopleMonth || selectedMonth;
  const peoplePerson = settings.peoplePerson || "ALL";

  return { txAll, months, selectedMonth, selectedPerson, selectedCard, query, view, baseAllMonths, peopleMonth, peoplePerson };
}

function applyFilters(txAll, st){
  const q = (st.query || "").toLowerCase().trim();
  return txAll.filter(t => {
    if(st.selectedMonth && t.month !== st.selectedMonth) return false;
    if(st.selectedPerson !== "ALL" && t.person !== st.selectedPerson) return false;
    if(st.selectedCard !== "ALL" && t.card !== st.selectedCard) return false;
    if(q){
      const hay = `${t.desc} ${t.notes} ${t.installment}`.toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  }).sort((a,b) => (a.date || "").localeCompare(b.date || ""));
}

/* ---------- UI helpers ---------- */
function fillSelectOptions(selectEl, options, includeAll=false){
  const current = selectEl.value;
  selectEl.innerHTML = "";
  if(includeAll){
    const opt = document.createElement("option");
    opt.value = "ALL"; opt.textContent = "Todos";
    selectEl.appendChild(opt);
  }
  for(const v of options){
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    selectEl.appendChild(opt);
  }
  if(options.includes(current) || (includeAll && current==="ALL")){
    selectEl.value = current;
  }
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function sumBy(rows, key){
  const map = new Map();
  for(const r of rows){
    const k = r[key] || "—";
    map.set(k, (map.get(k) || 0) + Number(r.amount || 0));
  }
  return Array.from(map.entries()).sort((a,b)=>b[1]-a[1]);
}

/* ---------- Views / Tabs ---------- */
function setView(view){
  const allowed = ["home","base","people"];
  const v = allowed.includes(view) ? view : "home";
  setSettings({ view: v });

  $("#view-home").style.display = (v==="home") ? "" : "none";
  $("#view-base").style.display = (v==="base") ? "" : "none";
  $("#view-people").style.display = (v==="people") ? "" : "none";

  // tab active
  for(const el of document.querySelectorAll(".tab")){
    el.classList.toggle("active", el.dataset.view === v);
  }

  // render bits that depend on view
  render();
}

function bindTabs(){
  for(const el of document.querySelectorAll(".tab")){
    el.addEventListener("click", ()=> setView(el.dataset.view));
  }
}

/* ---------- Home render ---------- */
function statusBadge(status){
  if(status === STATUS.PAID) return `<span class="badge ok">✅ Pago</span>`;
  return `<span class="badge open">⏳ Aberto</span>`;
}

function renderHome(st){
  const filtered = applyFilters(st.txAll, st);

  // month select (home)
  const monthSet = new Set(st.months);
  monthSet.add(monthKeyFromDate(new Date()));
  const months = Array.from(monthSet).sort();
  fillSelectOptions($("#monthSelect"), months, false);
  $("#monthSelect").value = st.selectedMonth;

  const people = Array.from(new Set([...PEOPLE_DEFAULT, ...st.txAll.map(t => t.person).filter(Boolean)])).sort();
  const cards = Array.from(new Set(st.txAll.map(t => t.card).filter(Boolean))).sort();

  fillSelectOptions($("#personFilter"), people, true);
  fillSelectOptions($("#cardFilter"), cards, true);

  $("#personFilter").value = st.selectedPerson;
  $("#cardFilter").value = st.selectedCard;
  $("#searchInput").value = st.query || "";

  const total = filtered.reduce((a,t)=>a+t.amount,0);
  const paid = filtered.filter(t=>t.status===STATUS.PAID).reduce((a,t)=>a+t.amount,0);
  const open = total - paid;

  $("#pillCount").textContent = `${filtered.length} lançamentos`;
  $("#pillSum").textContent = brl(total);
  $("#pillOpen").textContent = `Abertos: ${brl(open)}`;
  $("#pillPaid").textContent = `Pagos: ${brl(paid)}`;

  $("#kpiTotal").textContent = brl(total);
  $("#kpiOpen").textContent = brl(open);
  $("#kpiPaid").textContent = brl(paid);

  const top = [...filtered].sort((a,b)=>b.amount-a.amount)[0];
  $("#kpiTop").textContent = top ? `${top.desc} • ${brl(top.amount)}` : "—";

  const closing = getSettings().closingDates || {};
  const closeTxt = closing[st.selectedMonth] ? `Fechamento: ${closing[st.selectedMonth]}` : "—";
  $("#closingInfo").textContent = closeTxt;

  renderTableHome(filtered);
  renderChartsHome(filtered);
  renderCardMeta(st.txAll, st.selectedMonth);
}

function renderTableHome(rows){
  const tbody = $("#txTable tbody");
  tbody.innerHTML = "";

  for(const t of rows){
    const tr = document.createElement("tr");
    tr.dataset.id = t.id;

    const d = t.date ? new Date(t.date+"T00:00:00") : null;
    const dt = d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("pt-BR") : (t.date || "");

    tr.innerHTML = `
      <td>${escapeHtml(dt)}</td>
      <td title="${escapeHtml(t.notes || "")}">${escapeHtml(t.desc)}</td>
      <td>${escapeHtml(t.person)}</td>
      <td>${escapeHtml(t.dividedWith ? displayPerson(t.dividedWith) : "—")}</td>
      <td>${escapeHtml(t.card || "—")}</td>
      <td>${escapeHtml(t.installment || "—")}</td>
      <td class="right">${brl(t.amount)}</td>
      <td>${statusBadge(t.status)}</td>
      <td class="right"><button class="icon-btn" data-action="delete" title="Excluir">🗑️</button></td>
    `;

    tr.addEventListener("click", (ev)=>{
      const action = ev.target?.dataset?.action;
      if(action === "delete"){
        ev.stopPropagation();
        removeTx(t.id);
        return;
      }

      if(ev.shiftKey){
        togglePaid(t.id);
        return;
      }
      openModalEdit(t.id);
    });

    tbody.appendChild(tr);
  }
}

function renderChartsHome(rows){
  const byPeople = sumBy(rows, "person");
  const byCards  = sumBy(rows, "card");

  const pplLabels = byPeople.map(x=>x[0]);
  const pplData   = byPeople.map(x=>x[1]);

  const cardLabels = byCards.map(x=>x[0] || "—");
  const cardData   = byCards.map(x=>x[1]);

  const ctxP = $("#chartPeople").getContext("2d");
  if(chartPeople) chartPeople.destroy();
  chartPeople = new Chart(ctxP, {
    type: "bar",
    data: { labels: pplLabels, datasets: [{ label: "Total (R$)", data: pplData }] },
    options: {
      responsive:true,
      plugins: { legend: { display:false } },
      scales: { y: { ticks: { callback: (v)=> brl(v).replace("R$","").trim() } } }
    }
  });

  const ctxC = $("#chartCards").getContext("2d");
  if(chartCards) chartCards.destroy();
  chartCards = new Chart(ctxC, {
    type: "doughnut",
    data: { labels: cardLabels, datasets: [{ data: cardData }] },
    options: { responsive:true, plugins: { legend: { position: "bottom" } } }
  });
}


function renderCardMeta(txAll, month){
  const tbody = $("#cardMetaTable tbody");
  if(!tbody) return;

  const rows = txAll.filter(t => t.month === month);
  const cards = Array.from(new Set(rows.map(r => r.card).filter(Boolean))).sort();

  const metaAll = loadMeta();

  tbody.innerHTML = "";

  for(const card of cards){
    const total = rows.filter(r => r.card === card).reduce((a,r)=>a+r.amount,0);
    const meta = metaAll.find(m => m.month === month && m.card === card) || {
      id: "",
      month, card,
      paid: "NO",
      paidDate: "",
      overdraft: 0,
      notes: ""
    };

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(card)}</td>
      <td class="right">${brl(total)}</td>
      <td>${meta.paid === "YES" ? '<span class="badge ok">✅ Sim</span>' : '<span class="badge open">⏳ Não</span>'}</td>
      <td class="right">${brl(Number(meta.overdraft||0))}</td>
      <td>${escapeHtml(meta.notes || "—")}</td>
      <td class="right"><button class="icon-btn small" data-action="edit" title="Editar">✏️</button></td>
    `;
    tr.querySelector('[data-action="edit"]').addEventListener("click", (ev)=>{
      ev.stopPropagation();
      openMetaModal(meta);
    });
    tbody.appendChild(tr);
  }

  if(cards.length === 0){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="6" class="muted">Nenhum cartão encontrado para este mês.</td>`;
    tbody.appendChild(tr);
  }
}

/* ---------- Base render ---------- */
function renderBase(st){
  $("#chkAllMonths").checked = st.baseAllMonths;

  const rows = st.txAll
    .filter(t => st.baseAllMonths ? true : (t.month === st.selectedMonth))
    .sort((a,b)=> (a.month || "").localeCompare(b.month || "") || (a.date || "").localeCompare(b.date || ""));

  const tbody = $("#baseTable tbody");
  tbody.innerHTML = "";

  for(const t of rows){
    const tr = document.createElement("tr");
    tr.dataset.id = t.id;

    const d = t.date ? new Date(t.date+"T00:00:00") : null;
    const dt = d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("pt-BR") : (t.date || "");

    tr.innerHTML = `
      <td>${escapeHtml(t.month || "—")}</td>
      <td>${escapeHtml(dt)}</td>
      <td title="${escapeHtml(t.notes || "")}">${escapeHtml(t.desc)}</td>
      <td>${escapeHtml(t.person)}</td>
      <td>${escapeHtml(t.dividedWith ? displayPerson(t.dividedWith) : "—")}</td>
      <td>${escapeHtml(t.card || "—")}</td>
      <td>${escapeHtml(t.installment || "—")}</td>
      <td class="right">${brl(t.amount)}</td>
      <td>${statusBadge(t.status)}</td>
      <td class="right"><button class="icon-btn" data-action="delete" title="Excluir">🗑️</button></td>
    `;

    tr.addEventListener("click", (ev)=>{
      const action = ev.target?.dataset?.action;
      if(action === "delete"){
        ev.stopPropagation();
        removeTx(t.id);
        return;
      }
      if(ev.shiftKey){
        togglePaid(t.id);
        return;
      }
      openModalEdit(t.id);
    });

    tbody.appendChild(tr);
  }
}

/* ---------- People render ---------- */
function totalsForPersonMonth(txAll, person, month){
  const rows = txAll.filter(t => t.person === person && t.month === month);
  const total = rows.reduce((a,t)=>a+t.amount,0);
  const paid = rows.filter(t=>t.status===STATUS.PAID).reduce((a,t)=>a+t.amount,0);
  const open = total - paid;
  return { total, paid, open, count: rows.length };
}

function renderPeople(st){
  // month select (people)
  const monthSet = new Set(st.months);
  monthSet.add(monthKeyFromDate(new Date()));
  const months = Array.from(monthSet).sort();
  fillSelectOptions($("#peopleMonthSelect"), months, false);
  $("#peopleMonthSelect").value = st.peopleMonth || st.selectedMonth;

  const month = $("#peopleMonthSelect").value;

  const people = Array.from(new Set([...PEOPLE_DEFAULT, ...st.txAll.map(t => t.person).filter(Boolean)])).sort();
  const grid = $("#peopleGrid");
  grid.innerHTML = "";

  const grand = { total:0, paid:0, open:0, count:0 };

  // Se a pessoa selecionada não existir no mês, volta pra ALL
  let selected = st.peoplePerson || "ALL";
  if(selected !== "ALL" && !people.includes(selected)) selected = "ALL";

  for(const p of people){
    const t = totalsForPersonMonth(st.txAll, p, month);
    grand.total += t.total; grand.paid += t.paid; grand.open += t.open; grand.count += t.count;

    const card = document.createElement("div");
    card.className = "person-card";
    if(selected === p) card.classList.add("selected");

    card.innerHTML = `
      <div class="person-top">
        <div>
          <div class="person-name">${escapeHtml(displayPerson(p))}</div>
          <div class="muted">${t.count} lançamentos</div>
        </div>
        <div class="person-total">${brl(t.total)}</div>
      </div>

      <div class="person-sub">
        <div class="mini">
          <div class="lab">Abertos</div>
          <div class="val">${brl(t.open)}</div>
        </div>
        <div class="mini">
          <div class="lab">Pagos</div>
          <div class="val">${brl(t.paid)}</div>
        </div>
        <div class="mini">
          <div class="lab">Total</div>
          <div class="val">${brl(t.total)}</div>
        </div>
      </div>

      <div class="person-actions">
        <button class="btn btn-secondary" data-action="details">Detalhar</button>
        <button class="btn btn-ghost" data-action="add">+ Add</button>
      </div>
    `;

    // Clique no card = detalhar
    card.addEventListener("click", (ev)=>{
      const action = ev.target?.dataset?.action;
      if(action === "add" || action === "details") return; // handled below
      setSettings({ peoplePerson: p });
      render();
    });

    card.querySelector('[data-action="details"]').addEventListener("click", (ev)=>{
      ev.stopPropagation();
      setSettings({ peoplePerson: p });
      render();
      // scroll suave até os detalhes
      setTimeout(()=> $("#peopleDetailsCard")?.scrollIntoView({ behavior:"smooth", block:"start" }), 50);
    });

    card.querySelector('[data-action="add"]').addEventListener("click", (ev)=>{
      ev.stopPropagation();
      setSettings({ selectedMonth: month });
      openModalNewWithPerson(p, month);
    });

    grid.appendChild(card);
  }

  $("#peopleHint").textContent = `Total do mês ${month}: ${brl(grand.total)} • Abertos: ${brl(grand.open)} • Pagos: ${brl(grand.paid)}`;

  // Render detalhes (se tiver pessoa selecionada)
  renderPeopleDetails(st.txAll, month, selected);
  renderExtras(month, selected);
}

function renderPeopleDetails(txAll, month, person){
  const card = $("#peopleDetailsCard");
  const tbody = $("#peopleTable tbody");

  if(!card || !tbody) return;

  if(!person || person === "ALL"){
    card.style.display = "none";
    tbody.innerHTML = "";
    return;
  }

  const rows = txAll
    .filter(t => t.month === month && t.person === person)
    .sort((a,b)=> (a.date || "").localeCompare(b.date || ""));

  const total = rows.reduce((a,t)=>a+t.amount,0);
  const paid = rows.filter(t=>t.status===STATUS.PAID).reduce((a,t)=>a+t.amount,0);
  const open = total - paid;

  $("#peopleDetailsTitle").textContent = `Detalhes • ${displayPerson(person)}`;
  $("#peopleDetailsMeta").textContent = `${rows.length} lançamentos • Total: ${brl(total)} • Abertos: ${brl(open)} • Pagos: ${brl(paid)}`;

  tbody.innerHTML = "";
  card.style.display = "";

  for(const t of rows){
    const tr = document.createElement("tr");
    tr.dataset.id = t.id;

    const d = t.date ? new Date(t.date+"T00:00:00") : null;
    const dt = d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("pt-BR") : (t.date || "");

    tr.innerHTML = `
      <td>${escapeHtml(dt)}</td>
      <td title="${escapeHtml(t.notes || "")}">${escapeHtml(t.desc)}</td>
      <td>${escapeHtml(t.card || "—")}</td>
      <td>${escapeHtml(t.installment || "—")}</td>
      <td class="right">${brl(t.amount)}</td>
      <td>${statusBadge(t.status)}</td>
      <td class="right"><button class="icon-btn" data-action="delete" title="Excluir">🗑️</button></td>
    `;

    tr.addEventListener("click", (ev)=>{
      const action = ev.target?.dataset?.action;
      if(action === "delete"){
        ev.stopPropagation();
        removeTx(t.id);
        return;
      }
      if(ev.shiftKey){
        togglePaid(t.id);
        return;
      }
      openModalEdit(t.id);
    });

    tbody.appendChild(tr);
  }
}


function renderExtras(month, person){
  const card = $("#peopleDetailsCard");
  const tbody = $("#extrasTable tbody");
  const pill = $("#pillExtrasTotal");
  const btnAdd = $("#btnAddExtra");

  if(!card || !tbody || !pill || !btnAdd) return;

  // Se não tem pessoa selecionada, esconde extras também
  if(!person || person === "ALL"){
    tbody.innerHTML = "";
    pill.textContent = `Extras: ${brl(0)}`;
    btnAdd.onclick = null;
    return;
  }

  const all = loadExtras().map(x => ({
    ...x,
    amount: Number(x.amount || 0)
  }));

  const rows = all
    .filter(x => x.month === month && normalizePerson(x.person) === person)
    .sort((a,b)=> (a.date || "").localeCompare(b.date || ""));

  const total = rows.reduce((a,x)=>a+x.amount,0);
  pill.textContent = `Extras: ${brl(total)}`;

  tbody.innerHTML = "";
  for(const e of rows){
    const d = e.date ? new Date(e.date+"T00:00:00") : null;
    const dt = d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("pt-BR") : (e.date || "");
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(dt)}</td>
      <td>${escapeHtml(e.type || "—")}</td>
      <td>${escapeHtml(e.desc || "")}</td>
      <td class="right">${brl(e.amount)}</td>
      <td class="right">
        <button class="icon-btn small" data-action="edit" title="Editar">✏️</button>
        <button class="icon-btn small" data-action="del" title="Excluir">🗑️</button>
      </td>
    `;
    tr.querySelector('[data-action="edit"]').addEventListener("click", ()=> openExtraModal(e));
    tr.querySelector('[data-action="del"]').addEventListener("click", ()=> deleteExtra(e.id));
    tbody.appendChild(tr);
  }
  if(rows.length === 0){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" class="muted">Sem extras para ${displayPerson(person)} neste mês.</td>`;
    tbody.appendChild(tr);
  }

  btnAdd.onclick = ()=> openExtraModal({
    id:"",
    month,
    person,
    date: toISODate(new Date()),
    type:"Emprestimo",
    desc:"",
    amount: 0
  });
}

function displayPerson(p){
  if(p === "Mae") return "Mãe";
  if(p === "Irmao") return "Irmão";
  return p;
}

/* ---------- CRUD ---------- */
function upsertTx(tx){
  const all = loadTx();
  const idx = all.findIndex(x => x.id === tx.id);
  if(idx >= 0) all[idx] = tx;
  else all.push(tx);
  saveTx(all);
  render();
}

function removeTx(id){
  const all = loadTx().filter(t => t.id !== id);
  saveTx(all);
  closeModal();
  render();
}

function togglePaid(id){
  const all = loadTx().map(computeDerived);
  const tx = all.find(t => t.id === id);
  if(!tx) return;
  tx.status = (tx.status === STATUS.PAID) ? STATUS.OPEN : STATUS.PAID;
  saveTx(all);
  render();
}

/* ---------- Modal ---------- */
function openModal(){
  $("#modalBackdrop").style.display = "flex";
  $("#modalBackdrop").setAttribute("aria-hidden", "false");
}
function closeModal(){
  $("#modalBackdrop").style.display = "none";
  $("#modalBackdrop").setAttribute("aria-hidden", "true");
}
function setModalTitle(t){ $("#modalTitle").textContent = t; }

function fillPersonSelect(){
  const people = Array.from(new Set([...PEOPLE_DEFAULT, ...loadTx().map(t=>computeDerived(t).person)])).sort();
  const sel = $("#txPerson");
  sel.innerHTML = "";
  for(const p of people){
    const opt = document.createElement("option");
    opt.value = p; opt.textContent = displayPerson(p);
    sel.appendChild(opt);
  }
}

function fillDividedWithSelect(excludePerson){
  const people = Array.from(new Set([...PEOPLE_DEFAULT, ...loadTx().map(t=>computeDerived(t).person)])).filter(Boolean).sort();
  const sel = $("#txDividedWith");
  if(!sel) return;
  const current = sel.value || "";
  sel.innerHTML = '<option value="">—</option>';
  for(const p of people){
    if(excludePerson && p === excludePerson) continue;
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = displayPerson(p);
    sel.appendChild(opt);
  }
  // restore value if still valid
  if(current && Array.from(sel.options).some(o=>o.value===current)){
    sel.value = current;
  }else{
    sel.value = "";
  }
}


function resetForm(){
  $("#txId").value = "";
  $("#txMonth").value = monthKeyFromDate(new Date());
  $("#txCard").value = "";
  $("#txPerson").value = "Eu";
  if($("#txDividedWith")) $("#txDividedWith").value = "";
  $("#txDate").value = toISODate(new Date());
  $("#txDesc").value = "";
  $("#txInstallment").value = "";
  $("#txDue").value = "";
  $("#txAmount").value = "";
  $("#txStatus").value = STATUS.OPEN;
  $("#txNotes").value = "";
  $("#btnDelete").style.display = "none";
}

function openModalNew(){
  fillPersonSelect();
  fillDividedWithSelect("Eu");
  resetForm();
  setModalTitle("Novo lançamento");
  openModal();
}

function openModalNewWithPerson(person, month){
  fillPersonSelect();
  fillDividedWithSelect(person || "Eu");
  resetForm();
  $("#txMonth").value = month || monthKeyFromDate(new Date());
  $("#txPerson").value = person || "Eu";
  setModalTitle(`Novo lançamento • ${displayPerson(person || "Eu")}`);
  openModal();
}

function openModalEdit(id){
  const tx = loadTx().map(computeDerived).find(t => t.id === id);
  if(!tx) return;

  fillPersonSelect();
  fillDividedWithSelect(tx.person || "Eu");

  $("#txId").value = tx.id;
  $("#txMonth").value = tx.month || monthKeyFromDate(new Date());
  $("#txCard").value = tx.card || "";
  $("#txPerson").value = tx.person || "Eu";
  $("#txDate").value = tx.date || "";
  $("#txDesc").value = tx.desc || "";
  $("#txInstallment").value = tx.installment || "";
  $("#txDue").value = tx.due || "";
  $("#txAmount").value = Number(tx.amount || 0);
  $("#txStatus").value = tx.status || STATUS.OPEN;
  $("#txNotes").value = tx.notes || "";
  if($("#txDividedWith")) $("#txDividedWith").value = tx.dividedWith || "";

  $("#btnDelete").style.display = "inline-flex";
  $("#btnDelete").onclick = () => removeTx(id);

  setModalTitle("Editar lançamento");
  openModal();
}

function readForm(){
  const tx = {
    id: $("#txId").value || uid(),
    month: $("#txMonth").value,
    card: $("#txCard").value,
    person: $("#txPerson").value,
    dividedWith: ($("#txDividedWith") ? $("#txDividedWith").value : ""),
    date: $("#txDate").value,
    desc: $("#txDesc").value,
    installment: $("#txInstallment").value,
    due: $("#txDue").value,
    amount: Number($("#txAmount").value || 0),
    status: $("#txStatus").value,
    notes: $("#txNotes").value,
  };
  return computeDerived(tx);
}


/* ---------- Modal: Card Meta ---------- */
function openMetaModal(meta){
  $("#metaId").value = meta.id || "";
  $("#metaMonth").value = meta.month || monthKeyFromDate(new Date());
  $("#metaCard").value = meta.card || "";
  $("#metaPaid").value = meta.paid === "YES" ? "YES" : "NO";
  $("#metaPaidDate").value = meta.paidDate || "";
  $("#metaOverdraft").value = Number(meta.overdraft || 0);
  $("#metaNotes").value = meta.notes || "";

  $("#btnDeleteMeta").style.display = (meta.id ? "inline-flex" : "none");
  $("#btnDeleteMeta").onclick = ()=> deleteMeta(meta);

  $("#metaBackdrop").style.display = "flex";
  $("#metaBackdrop").setAttribute("aria-hidden","false");
}
function closeMetaModal(){
  $("#metaBackdrop").style.display = "none";
  $("#metaBackdrop").setAttribute("aria-hidden","true");
}
function saveMetaFromForm(){
  const month = $("#metaMonth").value;
  const card = $("#metaCard").value.trim();
  if(!month || !card){ alert("Preencha mês e cartão."); return; }

  const id = $("#metaId").value || uid();
  const item = {
    id,
    month,
    card,
    paid: $("#metaPaid").value === "YES" ? "YES" : "NO",
    paidDate: $("#metaPaidDate").value || "",
    overdraft: Number($("#metaOverdraft").value || 0),
    notes: $("#metaNotes").value || ""
  };

  const all = loadMeta();
  // upsert by month+card
  const merged = upsertByKey(all, item, ["month","card"]);
  saveMeta(merged);

  closeMetaModal();
  render();
}
function deleteMeta(meta){
  const all = loadMeta().filter(x => !(x.month === meta.month && x.card === meta.card));
  saveMeta(all);
  closeMetaModal();
  render();
}

/* ---------- Modal: Extras ---------- */
function fillExtraPersonSelect(){
  const people = Array.from(new Set([...PEOPLE_DEFAULT, ...loadTx().map(t=>computeDerived(t).person)])).sort();
  const sel = $("#extraPerson");
  sel.innerHTML = "";
  for(const p of people){
    const opt = document.createElement("option");
    opt.value = p; opt.textContent = displayPerson(p);
    sel.appendChild(opt);
  }
}

function openExtraModal(extra){
  fillExtraPersonSelect();

  $("#extraId").value = extra.id || "";
  $("#extraMonth").value = extra.month || monthKeyFromDate(new Date());
  $("#extraPerson").value = normalizePerson(extra.person || "Eu");
  $("#extraDate").value = extra.date || toISODate(new Date());
  $("#extraType").value = extra.type || "Emprestimo";
  $("#extraDesc").value = extra.desc || "";
  $("#extraAmount").value = Number(extra.amount || 0);

  $("#btnDeleteExtra").style.display = (extra.id ? "inline-flex" : "none");
  $("#btnDeleteExtra").onclick = ()=> deleteExtra(extra.id);

  $("#extraTitle").textContent = extra.id ? "Editar extra" : "Novo extra";

  $("#extraBackdrop").style.display = "flex";
  $("#extraBackdrop").setAttribute("aria-hidden","false");
}
function closeExtraModal(){
  $("#extraBackdrop").style.display = "none";
  $("#extraBackdrop").setAttribute("aria-hidden","true");
}
function saveExtraFromForm(){
  const id = $("#extraId").value || uid();
  const month = $("#extraMonth").value;
  const person = normalizePerson($("#extraPerson").value);
  const date = $("#extraDate").value;
  const type = $("#extraType").value;
  const desc = $("#extraDesc").value.trim();
  const amount = Number($("#extraAmount").value || 0);

  if(!month || !person || !date || !desc){ alert("Preencha mês, pessoa, data e descrição."); return; }

  const item = { id, month, person, date, type, desc, amount };

  const all = loadExtras();
  const idx = all.findIndex(x => x.id === id);
  if(idx >= 0) all[idx] = item; else all.push(item);
  saveExtras(all);

  closeExtraModal();
  render();
}
function deleteExtra(id){
  const all = loadExtras().filter(x => x.id !== id);
  saveExtras(all);
  render();
}

/* ---------- Import/Export ---------- */
function exportXlsx(){
  const tx = loadTx().map(computeDerived);
  const rows = tx.map(t => ({
    month: t.month,
    Cartao: t.card,
    data: t.date,
    compra: t.desc,
    parcelas: t.installment,
    due: t.due,
    valor: t.amount,
    quem: displayPerson(t.person),
    dividido: (t.dividedWith ? displayPerson(t.dividedWith) : ""),
    status: (t.status === STATUS.PAID ? "Pago" : "Aberto"),
    obs: t.notes
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "LANCAMENTOS");

  const settings = getSettings();
  const closing = settings.closingDates || {};
  const closingRows = Object.entries(closing).map(([month, closeDate]) => ({ month, fechamento: closeDate }));
  const ws2 = XLSX.utils.json_to_sheet(closingRows);
  XLSX.utils.book_append_sheet(wb, ws2, "FECHAMENTOS");

  // Card meta
  const metaRows = loadMeta().map(m => ({ month: m.month, card: m.card, pago: m.paid, pagoData: m.paidDate, chequeEspecialCredito: m.overdraft, obs: m.notes }));
  const ws3 = XLSX.utils.json_to_sheet(metaRows);
  XLSX.utils.book_append_sheet(wb, ws3, "CARTOES_STATUS");

  // Extras
  const extraRows = loadExtras().map(e => ({ month: e.month, pessoa: displayPerson(normalizePerson(e.person)), data: e.date, tipo: e.type, descricao: e.desc, valor: e.amount }));
  const ws4 = XLSX.utils.json_to_sheet(extraRows);
  XLSX.utils.book_append_sheet(wb, ws4, "EXTRAS");

  XLSX.writeFile(wb, `Organizador_Financeiro_${new Date().toISOString().slice(0,10)}.xlsx`);
}

function importFile(file){
  const name = (file?.name || "").toLowerCase();
  if(name.endsWith(".csv")){
    const reader = new FileReader();
    reader.onload = () => importCsv(String(reader.result || ""));
    reader.readAsText(file);
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const data = new Uint8Array(e.target.result);
    const wb = XLSX.read(data, { type: "array" });

    const preferred = ["LANCAMENTOS","BASE","PAI","MAE","EU"];
    let sheetName = wb.SheetNames.find(n => preferred.includes(n.toUpperCase())) || wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    const json = XLSX.utils.sheet_to_json(ws, { defval: "" });

    const imported = mapImportedRows(json);
    const merged = mergeImported(imported);

    saveTx(merged);
    render();

    alert(`Importação concluída! ${imported.length} linhas lidas da aba "${sheetName}".`);
  };
  reader.readAsArrayBuffer(file);
}

function importCsv(text){
  const sep = text.includes(";") ? ";" : ",";
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if(lines.length < 2){
    alert("CSV vazio.");
    return;
  }
  const headers = lines[0].split(sep).map(h => h.trim());
  const rows = lines.slice(1).map(line=>{
    const cols = line.split(sep);
    const obj = {};
    headers.forEach((h,i)=> obj[h] = (cols[i] ?? "").trim());
    return obj;
  });

  const imported = mapImportedRows(rows);
  const merged = mergeImported(imported);
  saveTx(merged);
  render();
  alert(`Importação concluída! ${imported.length} linhas lidas do CSV.`);
}

function pick(obj, keys){
  for(const k of keys){
    if(obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== "") return obj[k];
  }
  return "";
}

function mapImportedRows(rows){
  const out = [];
  for(const r of rows){
    const hasFech = ("fechamento" in r) || ("FECHAMENTO" in r) || ("Fechamento" in r);
    const maybeMonth = pick(r, ["month","Month","MONTH","Mês","mes","Mes","MÊS"]);
    if(hasFech && maybeMonth){
      const closeDate = pick(r, ["fechamento","Fechamento","FECHAMENTO"]);
      const settings = getSettings();
      const closing = settings.closingDates || {};
      closing[String(maybeMonth)] = String(closeDate);
      setSettings({ closingDates: closing });
      continue;
    }

    // Import: status dos cartões (CARTOES_STATUS)
    const hasCardStatus = ("chequeEspecialCredito" in r) || ("CHEQUEESPECIALCREDITO" in r) || (String(Object.keys(r)).toLowerCase().includes("cheque especial"));
    const hasPago = ("pago" in r) || ("Pago" in r) || ("PAGO" in r);
    const maybeCard = pick(r, ["card","Cartao","Cartão","CARTAO","cartao"]);
    if(hasPago && (hasCardStatus || ("chequeEspecialCredito" in r) || ("pagoData" in r) || ("obs" in r)) && maybeMonth && maybeCard){
      const paid = String(pick(r, ["pago","Pago","PAGO"])).toUpperCase().includes("S") || String(pick(r, ["pago","Pago","PAGO"])).toUpperCase().includes("YES") ? "YES" : "NO";
      const paidDate = String(pick(r, ["pagoData","PagoData","PAGODATA","dataPagamento","DataPagamento"])) || "";
      const overdraft = parseMoney(pick(r, ["chequeEspecialCredito","ChequeEspecialCredito","CHEQUEESPECIALCREDITO","overdraft","Overdraft"]));
      const notes = String(pick(r, ["obs","Obs","OBS","observacao","Observação"])) || "";
      const all = loadMeta();
      upsertByKey(all, { id: uid(), month: String(maybeMonth), card: String(maybeCard), paid, paidDate, overdraft, notes }, ["month","card"]);
      saveMeta(all);
      continue;
    }

    // Import: extras (EXTRAS)
    const hasExtra = ("tipo" in r) && (("descricao" in r) || ("Descrição" in r) || ("descricao" in r)) && (("pessoa" in r) || ("Pessoa" in r) || ("pessoa" in r) || ("quem" in r));
    if(hasExtra && maybeMonth){
      const person = normalizePerson(pick(r, ["pessoa","Pessoa","PESSOA","quem","Quem","QUEM"]));
      const date = toISODate(parseBRDate(pick(r, ["data","Data","DATA","date","Date"]))) || "";
      const type = String(pick(r, ["tipo","Tipo","TIPO"])) || "Outros";
      const desc2 = String(pick(r, ["descricao","Descrição","DESCRICAO","descrição","Descricao"])) || "";
      const amount2 = parseMoney(pick(r, ["valor","Valor","VALOR","amount","Amount"]));
      if(desc2){
        const allE = loadExtras();
        allE.push({ id: uid(), month: String(maybeMonth), person, date: date || "", type, desc: desc2, amount: amount2 });
        saveExtras(allE);
      }
      continue;
    }

    let who  = pick(r, ["quem","Quem","QUEM","pessoa","Pessoa","PESSOA"]);
    const sharedPeople = parseSharedPeople(who);

    const amountRaw = pick(r, ["valor","Valor","VALOR","amount","Amount"]);
    const desc = pick(r, ["compra","Compra","COMPRA","descricao","Descrição","DESCRIÇÃO","desc"]);
    const dateRaw = pick(r, ["data","Data","DATA","date","Date"]);
    const dueRaw  = pick(r, ["due","vencimento","Vencimento","VENCIMENTO"]);
    const instRaw = pick(r, ["parcelas","Parcelas","PARCELAS","parcela","Parcela","installment","Installment"]);

    const card = pick(r, ["card","Cartao","Cartão","CARTAO","cartao"]);
    const divcol = pick(r, ["dividido","Dividido","DIVIDIDO","dividir","Dividir","DIVIDIR"]);

    let month = String(maybeMonth || "").trim();
    const dt = parseBRDate(dateRaw);
    const due = parseBRDate(dueRaw);
    if(!month){
      month = monthKeyFromDate(due) || monthKeyFromDate(dt) || monthKeyFromDate(new Date());
    }

    const amount = parseMoney(amountRaw);
    let installment = String(instRaw || "").trim();
    if(installment && /^\d{4}-\d{2}-\d{2}$/.test(installment)) installment = "";

    // Se "quem" vier como "Eu x Mãe" (ou "Mãe x Eu"), dividimos o valor em 2 lançamentos (metade para cada).
    const divPerson = normalizePersonNullable(divcol);
    const whoNorm = normalizePerson(who);

    if(sharedPeople.length === 2 || (divPerson && whoNorm && divPerson !== whoNorm)){
      const sp = (sharedPeople.length === 2) ? sharedPeople : [whoNorm, divPerson];
      const [a,b] = sp;
      const [v1,v2] = splitAmountTwo(amount);
      const base = {
        month,
        card: String(card || "").trim(),
        date: toISODate(dt) || "",
        desc: String(desc || "").trim(),
        installment,
        due: toISODate(due) || "",
        status: STATUS.OPEN,
      };

      const tx1 = computeDerived({ id: uid(), ...base, person: a, dividedWith: b, amount: v1, notes: `Dividido com ${displayPerson(b)} (1/2)` });
      const tx2 = computeDerived({ id: uid(), ...base, person: b, dividedWith: a, amount: v2, notes: `Dividido com ${displayPerson(a)} (1/2)` });

      if(tx1.desc || tx1.amount) out.push(tx1);
      if(tx2.desc || tx2.amount) out.push(tx2);
      continue;
    }

    const tx = computeDerived({
      id: uid(),
      month,
      card: String(card || "").trim(),
      person: normalizePerson(who),
      date: toISODate(dt) || "",
      desc: String(desc || "").trim(),
      installment,
      due: toISODate(due) || "",
      amount,
      status: STATUS.OPEN,
      notes: ""
    });

    if(!tx.desc && !tx.amount) continue;
    out.push(tx);
  }
  return out;
}

function parseMoney(v){
  if(v === null || v === undefined) return 0;
  if(typeof v === "number") return v;
  let s = String(v).trim();
  if(!s) return 0;
  s = s.replace(/[R$\s]/g,"");
  if(s.includes(",") && s.includes(".")){
    s = s.replace(/\./g,"").replace(",",".");
  } else if(s.includes(",") && !s.includes(".")){
    s = s.replace(",",".");
  }
  const n = Number(s);
  return Number.isNaN(n) ? 0 : n;
}

function mergeImported(imported){
  const existing = loadTx().map(computeDerived);
  return [...existing, ...imported];
}

/* ---------- Events ---------- */
function bindEvents(){
  // Home filters
  $("#monthSelect").addEventListener("change", (e)=>{
    setSettings({ selectedMonth: e.target.value });
    render();
  });
  $("#personFilter").addEventListener("change", (e)=>{
    setSettings({ selectedPerson: e.target.value });
    render();
  });
  $("#cardFilter").addEventListener("change", (e)=>{
    setSettings({ selectedCard: e.target.value });
    render();
  });
  $("#searchInput").addEventListener("input", (e)=>{
    setSettings({ query: e.target.value });
    render();
  });

  $("#btnAdd").addEventListener("click", openModalNew);

  // Base actions
  $("#btnAddBase").addEventListener("click", openModalNew);
  $("#btnImportBase").addEventListener("click", ()=> $("#fileInput").click() );
  $("#btnExportBase").addEventListener("click", exportXlsx);
  $("#chkAllMonths").addEventListener("change", (e)=>{
    setSettings({ baseAllMonths: e.target.checked });
    render();
  });

  // People month
  $("#peopleMonthSelect").addEventListener("change", (e)=>{
    setSettings({ peopleMonth: e.target.value });
    render();
  });

  // Global import/export buttons
  $("#btnExport").addEventListener("click", exportXlsx);
  $("#btnImport").addEventListener("click", ()=> $("#fileInput").click() );
  $("#fileInput").addEventListener("change", (e)=>{
    const f = e.target.files?.[0];
    if(!f) return;
    importFile(f);
    e.target.value = "";
  });

  // Modal controls
  $("#btnCloseModal").addEventListener("click", closeModal);
  $("#btnCancel").addEventListener("click", closeModal);
  $("#modalBackdrop").addEventListener("click", (e)=>{
    if(e.target.id === "modalBackdrop") closeModal();
  });

  $("#txForm").addEventListener("submit", (e)=>{
    e.preventDefault();
    const tx = readForm();
    if(!tx.month){ alert("Escolha o mês da fatura."); return; }
    if(!tx.desc || !tx.amount){ alert("Preencha descrição e valor."); return; }

    const me = normalizePerson(tx.person);
    const other = normalizePersonNullable(tx.dividedWith);

    // Se tiver "Dividido com", cria 2 lançamentos metade/metade
    if(other && other !== me){
      const [v1,v2] = splitAmountTwo(tx.amount);
      const base = { ...tx };
      // Vamos salvar como dois itens e remover o id original
      const id1 = uid();
      const id2 = uid();

      const tx1 = computeDerived({
        ...base,
        id: id1,
        person: me,
        dividedWith: other,
        amount: v1,
        notes: `${base.notes ? base.notes + " • " : ""}Dividido com ${displayPerson(other)} (1/2)`
      });

      const tx2 = computeDerived({
        ...base,
        id: id2,
        person: other,
        dividedWith: me,
        amount: v2,
        notes: `${base.notes ? base.notes + " • " : ""}Dividido com ${displayPerson(me)} (1/2)`
      });

      upsertTx(tx1);
      upsertTx(tx2);
      closeModal();
      return;
    }

    upsertTx(tx);
    closeModal();
  });

  // Card meta modal
  $("#btnCloseMeta").addEventListener("click", closeMetaModal);
  $("#btnCancelMeta").addEventListener("click", closeMetaModal);
  $("#metaBackdrop").addEventListener("click", (e)=>{
    if(e.target.id === "metaBackdrop") closeMetaModal();
  });
  $("#metaForm").addEventListener("submit", (e)=>{
    e.preventDefault();
    saveMetaFromForm();
  });

  // Extras modal
  $("#btnCloseExtra").addEventListener("click", closeExtraModal);
  $("#btnCancelExtra").addEventListener("click", closeExtraModal);
  $("#extraBackdrop").addEventListener("click", (e)=>{
    if(e.target.id === "extraBackdrop") closeExtraModal();
  });
  $("#extraForm").addEventListener("submit", (e)=>{
    e.preventDefault();
    saveExtraFromForm();
  });

  // Theme
  $("#btnTheme").addEventListener("click", ()=>{
    const settings = getSettings();
    const next = settings.theme === "light" ? "dark" : "light";
    setSettings({ theme: next });
    applyTheme(next);
  });

  // keyboard
  window.addEventListener("keydown", (e)=>{
    if(e.key === "Escape") closeModal();
    if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k"){
      e.preventDefault();
      const view = getSettings().view || "home";
      if(view === "home") $("#searchInput").focus();
    }
  });
}

function applyTheme(theme){
  const root = document.documentElement;
  if(theme === "light"){
    root.setAttribute("data-theme","light");
    $("#btnTheme").textContent = "☀️";
  }else{
    root.removeAttribute("data-theme");
    $("#btnTheme").textContent = "🌙";
  }
}

/* ---------- Main render ---------- */
function render(){
  const st = getState();

  // keep view visible states consistent (in case render is called before setView)
  $("#view-home").style.display = (st.view==="home") ? "" : "none";
  $("#view-base").style.display = (st.view==="base") ? "" : "none";
  $("#view-people").style.display = (st.view==="people") ? "" : "none";
  for(const el of document.querySelectorAll(".tab")){
    el.classList.toggle("active", el.dataset.view === st.view);
  }

  if(st.view === "home") renderHome(st);
  if(st.view === "base") renderBase(st);
  if(st.view === "people") renderPeople(st);
}

function init(){
  seedIfEmpty();
  bindTabs();
  bindEvents();

  const settings = getSettings();
  applyTheme(settings.theme || "dark");

  // initialize view from settings
  const st = getState();
  setView(st.view || "home");
}

document.addEventListener("DOMContentLoaded", init);
