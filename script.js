/* ================= CONFIG ================= */
const OWNER  = "ganizhevAmirkhan";
const REPO   = "ingush-language";
const BRANCH = "main";

const DATA_DIR   = "dictionary-v2";
const INDEX_PATH = `${DATA_DIR}/index.json`;
const WORDS_DIR  = `${DATA_DIR}/words`;

/* ================= STATE ================= */
let adminMode = false;
let githubToken = localStorage.getItem("githubToken") || null;

let indexData = null;           // index.json
let indexList = [];             // indexData.words (или indexData.index)
let filterQ = "";

const wordCache = new Map();    // id -> full word json
const loadingIds = new Set();   // ids currently loading

let editingId = null;

/* ================= INIT ================= */
window.onload = async () => {
  // restore admin
  if (githubToken) {
    adminMode = true;
    setAdminUI(true);
  }

  // search input
  const s = document.getElementById("search");
  if (s) {
    s.oninput = () => {
      filterQ = (s.value || "").trim().toLowerCase();
      render();
    };
  }

  // search button
  const sb = document.getElementById("search-btn");
  if (sb) sb.onclick = () => render();

  // enter key triggers render
  if (s) {
    s.addEventListener("keydown", (e) => {
      if (e.key === "Enter") render();
    });
  }

  // restore OpenAI key UI
  const aiKey = localStorage.getItem("openaiKey");
  if (aiKey) {
    const st = document.getElementById("ai-status");
    if (st) st.textContent = "✓";
  }

  registerSW();
  await loadIndex();
};

/* ================= UI HELPERS ================= */
function toast(msg){ alert(msg); }

function setAdminUI(on){
  const st = document.getElementById("admin-status");
  if (st) st.textContent = on ? "✓ Админ" : "";

  const lo = document.getElementById("admin-logout");
  if (lo) lo.classList.toggle("hidden", !on);

  const addBtn = document.getElementById("add-word-btn");
  if (addBtn) addBtn.classList.toggle("hidden", !on);
}

/* ================= LOAD INDEX ================= */
async function loadIndex(){
  const res = await fetch(`${INDEX_PATH}?v=${Date.now()}`);
  if(!res.ok){
    const list = document.getElementById("list");
    if (list) list.innerHTML =
      `<div class="card"><b>Не удалось загрузить:</b> ${INDEX_PATH}<br>Проверь путь и что файл существует.</div>`;
    return;
  }

  indexData = await res.json();

  // поддерживаем оба формата: {words:[...]} или {index:[...]}
  indexList = Array.isArray(indexData.words) ? indexData.words
            : Array.isArray(indexData.index) ? indexData.index
            : [];

  render();
}

/* ================= SEARCH MATCH ================= */
function matchIndexItem(it, q){
  if(!q) return true;
  const ru  = (it.ru  || "").toLowerCase();
  const pos = (it.pos || "").toLowerCase();

  // если в index.json есть ingPreview — ищем и по нему
  const ingPreview = (it.ingPreview || it.ing || "").toLowerCase();

  return ru.includes(q) || pos.includes(q) || ingPreview.includes(q);
}

/* ================= RENDER LIST ================= */
function render(){
  const list = document.getElementById("list");
  if(!list) return;

  const q = filterQ;
  const filtered = indexList.filter(it => matchIndexItem(it, q));

  const stats = document.getElementById("stats");
  if (stats) stats.textContent = `Слов: ${indexList.length} · Показано: ${filtered.length}`;

  list.innerHTML = "";

  // показываем первые 200 (чтобы не убить браузер)
  const page = filtered.slice(0, 200);

  for (const it of page){
    list.insertAdjacentHTML("beforeend", renderCardFromIndex(it));
    // лениво подгружаем слово, чтобы появился перевод и примеры
    ensureWordLoaded(it.id).then(() => {
      // обновим карточку, когда данные пришли
      updateCard(it.id);
    });
  }
}

function renderCardFromIndex(it){
  const id  = it.id;
  const ru  = escapeHtml(it.ru || "");
  const pos = escapeHtml(it.pos || "");

  // если уже есть кэш — покажем полноценную карточку
  const w = wordCache.get(id);
  if (w) return renderCardFromWord(w);

  // иначе — быстрый “скелет” из индекса
  const ingPreview = escapeHtml(it.ingPreview || it.ing || "");
  const ingLine = ingPreview ? ingPreview : `<span class="muted">…загружаю перевод</span>`;

  return `
    <div class="card" id="w-${id}">
      <div class="cardTop">
        <div>
          <div class="wordRu">${ru}</div>
          <div class="pos">${pos}</div>
        </div>
        <div class="row">
          <div class="pill" onclick="playWord('${id}')">▶</div>
          ${adminMode ? `<div class="pill" onclick="openEditWord('${id}')">✏</div>` : ``}
        </div>
      </div>

      <div class="ingLine">${ingLine}</div>

      <div class="examples">
        <div class="muted">Примеры: …</div>
      </div>
    </div>
  `;
}

function renderCardFromWord(w){
  const id  = w.id;
  const ru  = escapeHtml(w.ru || "");
  const pos = escapeHtml(w.pos || "");

  const senses = (w.senses || []);
  const ingText = senses.map(s => s?.ing ? `• ${escapeHtml(s.ing)}` : "").filter(Boolean).join("<br>");
  const ingLine = ingText || `<span class="muted">Нет переводов</span>`;

  const examples = senses.flatMap(s => s.examples || []);
  const examplesCount = examples.length;

  const preview = examples.slice(0, 2).map(ex => `
    <div class="exItem">
      <div>${escapeHtml(ex.ing || "")}</div>
      <div class="exSub">${escapeHtml(ex.ru || "")}</div>
    </div>
  `).join("");

  return `
    <div class="card" id="w-${id}">
      <div class="cardTop">
        <div>
          <div class="wordRu">${ru}</div>
          <div class="pos">${pos}</div>
        </div>
        <div class="row">
          <div class="pill" onclick="playWord('${id}')">▶</div>
          ${adminMode ? `<div class="pill" onclick="openEditWord('${id}')">✏</div>` : ``}
        </div>
      </div>

      <div class="ingLine">${ingLine}</div>

      <div class="examples">
        <div class="muted">Примеры: ${examplesCount}</div>
        ${preview}
      </div>
    </div>
  `;
}

function updateCard(id){
  const el = document.getElementById(`w-${id}`);
  if(!el) return;

  const w = wordCache.get(id);
  if(!w) return;

  el.outerHTML = renderCardFromWord(w);
}

/* ================= LOAD WORD FILE ================= */
async function ensureWordLoaded(id){
  if(wordCache.has(id)) return wordCache.get(id);
  if(loadingIds.has(id)) return null;

  loadingIds.add(id);
  try{
    const res = await fetch(`${WORDS_DIR}/${id}.json?v=${Date.now()}`);
    if(!res.ok) return null;
    const w = await res.json();
    wordCache.set(id, w);
    return w;
  }catch{
    return null;
  }finally{
    loadingIds.delete(id);
  }
}

/* ================= ADMIN LOGIN ================= */
function adminLogin(){
  const t = (document.getElementById("gh-token")?.value || "").trim();
  if(!t) return toast("Введите GitHub Token");

  githubToken = t;
  adminMode = true;
  localStorage.setItem("githubToken", t);
  setAdminUI(true);
  render();
}

function adminLogout(){
  localStorage.removeItem("githubToken");
  location.reload();
}

/* ================= GITHUB API HELPERS ================= */
function b64EncodeUnicode(str){ return btoa(unescape(encodeURIComponent(str))); }
function b64DecodeUnicode(b64){ return decodeURIComponent(escape(atob(b64))); }

async function ghGetJson(path){
  if(!githubToken) throw new Error("Нет GitHub Token");
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`;
  const res = await fetch(url, { headers: { Authorization:`token ${githubToken}` }});

  if(!res.ok){
    const txt = await res.text().catch(()=>"(no details)");
    throw new Error("GitHub GET JSON error: " + txt);
  }

  const j = await res.json();
  const content = (j.content || "").replace(/\n/g,"");
  if(!content) throw new Error("Пустой content у GitHub API (файл слишком большой или ошибка)");

  return { sha: j.sha, data: JSON.parse(b64DecodeUnicode(content)) };
}

async function ghPutJson(path, data, sha){
  if(!githubToken) throw new Error("Нет GitHub Token");
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;

  const body = {
    message: `Update ${path}`,
    content: b64EncodeUnicode(JSON.stringify(data, null, 2)),
    sha
  };

  const res = await fetch(url, {
    method:"PUT",
    headers:{
      Authorization:`token ${githubToken}`,
      "Content-Type":"application/json"
    },
    body: JSON.stringify(body)
  });

  if(!res.ok){
    const txt = await res.text().catch(()=>"(no details)");
    throw new Error("GitHub PUT JSON error: " + txt);
  }
  return await res.json();
}

/* ================= PLAY AUDIO ================= */
function playWord(id){
  const url = `audio/words/${id}.mp3?v=${Date.now()}`;
  const a = new Audio(url);
  a.play().catch(()=>toast("Нет аудио слова"));
}

function playExample(exampleId){
  const url = `audio/examples/${exampleId}.mp3?v=${Date.now()}`;
  const a = new Audio(url);
  a.play().catch(()=>toast("Нет аудио примера"));
}

/* ================= EDITOR (минимально: открыть модалку) ================= */
/* Сейчас для шага “ПОИСК” достаточно, но чтобы не ломалось — оставляю рабочее открытие. */

async function openEditWord(id){
  if(!adminMode) return toast("Нужен админ-режим");
  editingId = id;

  const w = await ensureWordLoaded(id);
  if(!w) return toast("Не удалось загрузить слово: " + id);

  // заполнение полей модалки (если у тебя модалка уже в index.html)
  document.getElementById("modal-title").textContent = "Редактирование";
  document.getElementById("m-ru").value = w.ru || "";
  document.getElementById("m-pos").value = w.pos || "";

  renderModalSenses(w);
  renderModalExamples(w);

  document.getElementById("modal").classList.remove("hidden");
}

function closeModal(){
  document.getElementById("modal").classList.add("hidden");
  editingId = null;
}

function renderModalSenses(w){
  const box = document.getElementById("m-senses");
  box.innerHTML = "";
  (w.senses||[]).forEach((s, idx) => {
    box.insertAdjacentHTML("beforeend", `
      <div class="row">
        <input class="input" style="flex:1" value="${escapeHtml(s.ing||"")}"
          oninput="onSenseInput(${idx}, this.value)" placeholder="Перевод ING" />
        <button class="btn small" type="button" onclick="removeSense(${idx})">🗑</button>
      </div>
    `);
  });
}

function onSenseInput(idx, val){
  const w = wordCache.get(editingId);
  if(!w) return;
  w.senses[idx].ing = val;
}

function addSense(){
  const w = wordCache.get(editingId);
  if(!w) return;
  w.senses = w.senses || [];
  w.senses.push({ ing:"", definition:null, examples:[ { id: genId("ex"), ing:"", ru:"", audio:null } ] });
  renderModalSenses(w);
  renderModalExamples(w);
}

function removeSense(idx){
  const w = wordCache.get(editingId);
  if(!w) return;
  if((w.senses||[]).length <= 1) return toast("Нужен хотя бы один ING");
  w.senses.splice(idx,1);
  renderModalSenses(w);
  renderModalExamples(w);
}

function renderModalExamples(w){
  const box = document.getElementById("m-examples");
  box.innerHTML = "";

  (w.senses||[]).forEach((s, sIdx) => {
    box.insertAdjacentHTML("beforeend", `<div class="muted"><b>Sense ${sIdx+1}</b></div>`);
    (s.examples||[]).forEach((ex, exIdx) => {
      const exId = ex.id || (ex.id = genId("ex"));
      box.insertAdjacentHTML("beforeend", `
        <div class="block" style="margin:0">
          <div class="row" style="justify-content:space-between; align-items:center">
            <div class="muted">exampleId: <code>${exId}</code></div>
            <div class="row">
              <button class="btn small" type="button" onclick="playExample('${exId}')">▶</button>
              <button class="btn small" type="button" onclick="removeExample(${sIdx}, ${exIdx})">🗑</button>
            </div>
          </div>

          <label class="field">
            <div class="fieldLabel">ING пример</div>
            <textarea class="input" oninput="onExampleIng(${sIdx}, ${exIdx}, this.value)">${escapeHtml(ex.ing||"")}</textarea>
          </label>

          <label class="field" style="margin:0">
            <div class="fieldLabel">RU перевод</div>
            <textarea class="input" oninput="onExampleRu(${sIdx}, ${exIdx}, this.value)">${escapeHtml(ex.ru||"")}</textarea>
          </label>
        </div>
      `);
    });
  });
}

function addExample(){
  const w = wordCache.get(editingId);
  if(!w) return;
  w.senses[0].examples = w.senses[0].examples || [];
  w.senses[0].examples.push({ id: genId("ex"), ing:"", ru:"", audio:null });
  renderModalExamples(w);
}

function removeExample(sIdx, exIdx){
  const w = wordCache.get(editingId);
  if(!w) return;
  w.senses[sIdx].examples.splice(exIdx,1);
  renderModalExamples(w);
}

function onExampleIng(sIdx, exIdx, val){
  const w = wordCache.get(editingId);
  if(!w) return;
  w.senses[sIdx].examples[exIdx].ing = val;
}
function onExampleRu(sIdx, exIdx, val){
  const w = wordCache.get(editingId);
  if(!w) return;
  w.senses[sIdx].examples[exIdx].ru = val;
}

/* ================= ADD WORD (чтобы кнопка реагировала) ================= */
function genId(prefix="w"){
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
}

async function openCreateWord(){
  if(!adminMode) return toast("Нужен админ-режим");

  const id = genId("w");
  const w = {
    id,
    ru: "",
    pos: "",
    senses: [{ ing:"", definition:null, examples:[{ id: genId("ex"), ing:"", ru:"", audio:null }] }],
    audio: { word: null },
    source: "manual"
  };

  // кладем в кэш и в индекс
  wordCache.set(id, w);
  indexList.unshift({ id, ru:"", pos:"", ingPreview:"" });

  render();
  await openEditWord(id);
}

/* ================= SAVE WORD -> words/{id}.json + update index.json ================= */
async function saveModal(){
  if(!adminMode) return toast("Нужен админ-режим (GitHub Token).");

  const w = wordCache.get(editingId);
  if(!w) return toast("Нет слова в кэше");

  w.ru  = document.getElementById("m-ru").value.trim();
  w.pos = document.getElementById("m-pos").value.trim();

  if(!w.ru) return toast("RU обязателен");

  // минимум 1 пример заполненный
  const allEx = (w.senses||[]).flatMap(s => s.examples||[]);
  const ok = allEx.some(e => (e.ing||"").trim() && (e.ru||"").trim());
  if(!ok) return toast("Нужен хотя бы 1 пример (ING+RU)");

  const wordPath = `${WORDS_DIR}/${w.id}.json`;

  try{
    // 1) сохранить слово (words/{id}.json)
    const existing = await ghGetJson(wordPath).catch(()=>null);
    const shaWord = existing?.sha || undefined;
    await ghPutJson(wordPath, w, shaWord);

    // 2) обновить index.json
    const { sha: shaIndex, data: idx } = await ghGetJson(INDEX_PATH);

    const arr = Array.isArray(idx.words) ? idx.words
             : Array.isArray(idx.index) ? idx.index
             : (idx.words = []);

    const ingPreview = (w.senses?.[0]?.ing || "").trim();

    const i = arr.findIndex(x => x.id === w.id);
    const entry = { id: w.id, ru: w.ru, pos: w.pos || "", ingPreview };

    if(i >= 0) arr[i] = entry;
    else arr.unshift(entry);

    // сохранить обратно в тот же ключ (words или index)
    if (Array.isArray(idx.words)) idx.words = arr;
    else idx.index = arr;

    await ghPutJson(INDEX_PATH, idx, shaIndex);

    // обновим локальные структуры
    const li = indexList.findIndex(x => x.id === w.id);
    if (li >= 0) indexList[li] = entry;

    closeModal();
    render();
    toast("Сохранено ✓");
  }catch(e){
    console.error(e);
    toast("Ошибка сохранения: " + e.message);
  }
}

/* ================= OPENAI (оставлено, включим на шаге 3) ================= */
function saveAiKey(){
  const key = (document.getElementById("ai-key")?.value || "").trim();
  if(!key) return toast("Введите OpenAI API key");
  localStorage.setItem("openaiKey", key);
  const st = document.getElementById("ai-status");
  if (st) st.textContent = "✓";
}
async function aiImproveRu(){ toast("ИИ включим на шаге 3 (редактор), сейчас фиксируем поиск."); }
async function aiTranslateIng(){ toast("ИИ включим на шаге 3 (редактор), сейчас фиксируем поиск."); }
async function aiGenerateExample(){ toast("ИИ включим на шаге 3 (редактор), сейчас фиксируем поиск."); }

/* ================= PWA ================= */
async function registerSW(){
  if(!("serviceWorker" in navigator)) return;
  try{ await navigator.serviceWorker.register("./sw.js"); }catch{}
}

/* ================= UTILS ================= */
function escapeHtml(s){
  return (s ?? "").toString()
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
