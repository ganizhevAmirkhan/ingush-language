/* ================= CONFIG ================= */
const OWNER  = "ganizhevAmirkhan";
const REPO   = "ingush-language";
const BRANCH = "main";

const INDEX_PATH = "dictionary-v2/index.json";
const WORDS_DIR  = "dictionary-v2/words"; // words/{id}.json

/* ================= STATE ================= */
let adminMode = false;
let githubToken = localStorage.getItem("githubToken") || null;

let indexData = null;     // { meta, words:[{id,ru,pos,ing1,ing2,examplesCount}] }
let indexList = [];       // indexData.words
let filterQ = "";

let editingId = null;
let editingWord = null;   // копия для редактирования
let originalWord = null;  // оригинал (для отмены)
const wordCache = new Map(); // id -> word json (полный)

/* ================= INIT ================= */
window.onload = async () => {
  if (githubToken) {
    adminMode = true;
    setAdminUI(true);
  } else {
    setAdminUI(false);
  }

  // Поиск
  const s = document.getElementById("search");
  if (s) {
    s.oninput = () => {
      filterQ = (s.value || "").trim().toLowerCase();
      render();
    };
    s.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        filterQ = (s.value || "").trim().toLowerCase();
        render();
      }
    });
  }
  const sb = document.getElementById("search-btn");
  if (sb) {
    sb.onclick = () => {
      const s2 = document.getElementById("search");
      filterQ = (s2?.value || "").trim().toLowerCase();
      render();
    };
  }

  // AI key status
  const aiKey = localStorage.getItem("openaiKey");
  if (aiKey) document.getElementById("ai-status").textContent = "✓";

  registerSW();
  await loadIndex();
};

/* ================= UI HELPERS ================= */
function setAdminUI(on) {
  document.getElementById("admin-status").textContent = on ? "✓ Админ" : "";
  document.getElementById("admin-logout").classList.toggle("hidden", !on);
  document.getElementById("add-word-btn").classList.toggle("hidden", !on);
}

function toast(msg) { alert(msg); }

function escapeHtml(s) {
  return (s ?? "").toString()
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* ================= LOAD INDEX ================= */
async function loadIndex() {
  const res = await fetch(`${INDEX_PATH}?v=${Date.now()}`);
  if (!res.ok) {
    document.getElementById("list").innerHTML =
      `<div class="card"><b>Не удалось загрузить:</b> ${INDEX_PATH}</div>`;
    return;
  }
  indexData = await res.json();
  indexList = Array.isArray(indexData.words) ? indexData.words : [];
  render();
}

/* ================= SEARCH + RENDER ================= */
function matchRow(row, q) {
  if (!q) return true;
  const ru  = (row.ru  || "").toLowerCase();
  const pos = (row.pos || "").toLowerCase();
  const i1  = (row.ing1 || "").toLowerCase();
  const i2  = (row.ing2 || "").toLowerCase();
  return ru.includes(q) || pos.includes(q) || i1.includes(q) || i2.includes(q);
}

function render() {
  const list = document.getElementById("list");
  if (!list) return;

  const q = filterQ;
  const filtered = indexList.filter(r => matchRow(r, q));

  document.getElementById("stats").textContent =
    `Слов: ${indexList.length} · Показано: ${filtered.length}`;

  list.innerHTML = "";
  filtered.slice(0, 500).forEach(r => {
    list.insertAdjacentHTML("beforeend", renderCard(r));
  });
}

function renderCard(r) {
  const ingLine = [r.ing1, r.ing2].filter(Boolean).join(" • ");
  return `
    <div class="card" id="w-${escapeHtml(r.id)}">
      <div class="cardTop">
        <div>
          <div class="wordRu">${escapeHtml(r.ru || "")}</div>
          <div class="pos">${escapeHtml(r.pos || "")}</div>
        </div>
        <div class="row">
          <div class="pill" onclick="playWord('${escapeJs(r.id)}')">▶</div>
          ${adminMode ? `<div class="pill" onclick="openEditWord('${escapeJs(r.id)}')">✏</div>` : ``}
        </div>
      </div>

      <div class="ingLine">
        ${ingLine ? escapeHtml(ingLine) : `<span class="muted">Нет переводов</span>`}
      </div>

      <div class="examples">
        <div class="muted">Примеры: ${Number(r.examplesCount || 0)}</div>
      </div>
    </div>
  `;
}

// безопасная вставка в onclick('..')
function escapeJs(s){
  return (s ?? "").toString().replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

/* ================= ADMIN ================= */
function adminLogin() {
  const t = document.getElementById("gh-token").value.trim();
  if (!t) return toast("Введите GitHub Token");

  githubToken = t;
  adminMode = true;
  localStorage.setItem("githubToken", t);

  setAdminUI(true);
  render();
}

function adminLogout() {
  localStorage.removeItem("githubToken");
  location.reload();
}

/* ================= GITHUB HELPERS ================= */
function b64EncodeUnicode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function b64DecodeUnicode(b64) {
  return decodeURIComponent(escape(atob(b64)));
}

async function ghGetFile(path) {
  if (!githubToken) throw new Error("Нет GitHub Token");

  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`;
  const res = await fetch(url, { headers: { Authorization: `token ${githubToken}` } });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`GitHub GET error: ${txt}`);
  }
  return await res.json();
}

async function ghGetJson(path) {
  const meta = await ghGetFile(path);

  // Иногда GitHub не отдаёт content для больших файлов — берём download_url
  if (meta.content) {
    const raw = b64DecodeUnicode((meta.content || "").replace(/\n/g, ""));
    return { sha: meta.sha, data: JSON.parse(raw) };
  }

  if (meta.download_url) {
    const res = await fetch(meta.download_url, {
      headers: { Authorization: `token ${githubToken}` } // на всякий
    });
    if (!res.ok) throw new Error("Не удалось скачать файл по download_url");
    const data = await res.json();
    return { sha: meta.sha, data };
  }

  throw new Error("GitHub не вернул content и download_url");
}

async function ghPutJson(path, data, sha) {
  if (!githubToken) throw new Error("Нет GitHub Token");

  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;
  const body = {
    message: `Update ${path}`,
    content: b64EncodeUnicode(JSON.stringify(data, null, 2)),
    sha
  };

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `token ${githubToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`GitHub PUT JSON error: ${txt}`);
  }
  return await res.json();
}

async function ghPutBinary(path, uint8array) {
  if (!githubToken) throw new Error("Нет GitHub Token");

  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;

  // sha если существует
  let sha = null;
  const check = await fetch(url, { headers: { Authorization: `token ${githubToken}` } }).catch(() => null);
  if (check && check.ok) {
    const j = await check.json();
    sha = j.sha;
  }

  // Uint8Array -> base64
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < uint8array.length; i += chunkSize) {
    const chunk = uint8array.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  const b64 = btoa(binary);

  const body = { message: `Upload ${path}`, content: b64, sha };

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `token ${githubToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`GitHub PUT binary error: ${txt}`);
  }
  return await res.json();
}

/* ================= WORD LOAD ================= */
async function fetchWord(id) {
  if (wordCache.has(id)) return wordCache.get(id);

  const url = `${WORDS_DIR}/${id}.json?v=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не найден файл слова: ${url}`);

  const w = await res.json();
  wordCache.set(id, w);
  return w;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/* ================= CRUD ================= */
function genId(prefix="w"){
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
}

async function openCreateWord() {
  if (!adminMode) return toast("Нужен админ-режим");

  const id = genId("w");
  const w = {
    id,
    ru: "",
    pos: "",
    senses: [
      { ing: "", definition: null, examples: [ { id: genId("ex"), ing: "", ru: "", audio: null } ] }
    ],
    audio: { word: null },
    source: "manual"
  };

  // сразу открыть редактор
  wordCache.set(id, w);

  // добавить в индекс локально (пока без сохранения)
  indexList.unshift({
    id,
    ru: "",
    pos: "",
    ing1: "",
    ing2: "",
    examplesCount: 1
  });
  render();
  await openEditWord(id, true);
}

async function openEditWord(id, isNew=false) {
  editingId = id;
  let w = null;
  try {
    w = await fetchWord(id);
  } catch (e) {
    console.error(e);
    toast(e.message);
    return;
  }

  originalWord = deepClone(w);
  editingWord = deepClone(w);

  document.getElementById("modal-title").textContent = isNew ? "Добавить слово" : "Редактирование";
  document.getElementById("m-ru").value = editingWord.ru || "";
  document.getElementById("m-pos").value = editingWord.pos || "";

  renderModalSenses();
  renderModalExamples();

  document.getElementById("modal").classList.remove("hidden");
}

function closeModal() {
  // отмена — просто выкидываем изменения
  editingId = null;
  editingWord = null;
  originalWord = null;
  document.getElementById("modal").classList.add("hidden");
}

/* ================= MODAL RENDER ================= */
function renderModalSenses(){
  const box = document.getElementById("m-senses");
  box.innerHTML = "";
  (editingWord.senses || []).forEach((s, idx) => {
    box.insertAdjacentHTML("beforeend", `
      <div class="row" data-sense="${idx}">
        <input class="input" style="flex:1" value="${escapeHtml(s.ing||"")}"
          oninput="onSenseInput(${idx}, this.value)" placeholder="Перевод ING" />
        <button class="btn small" type="button" onclick="removeSense(${idx})">🗑</button>
      </div>
    `);
  });
}

function onSenseInput(idx, val){
  editingWord.senses[idx].ing = val;
}

function addSense(){
  editingWord.senses = editingWord.senses || [];
  editingWord.senses.push({
    ing:"",
    definition:null,
    examples:[{ id: genId("ex"), ing:"", ru:"", audio:null }]
  });
  renderModalSenses();
  renderModalExamples();
}

function removeSense(idx){
  if ((editingWord.senses || []).length <= 1) return toast("Нужен хотя бы один ING");
  editingWord.senses.splice(idx,1);
  renderModalSenses();
  renderModalExamples();
}

function renderModalExamples(){
  const box = document.getElementById("m-examples");
  box.innerHTML = "";

  (editingWord.senses || []).forEach((s, sIdx) => {
    const exList = s.examples || [];
    box.insertAdjacentHTML("beforeend", `<div class="muted"><b>Sense ${sIdx+1}</b></div>`);

    exList.forEach((ex, exIdx) => {
      if (!ex.id) ex.id = genId("ex");
      const exId = ex.id;

      box.insertAdjacentHTML("beforeend", `
        <div class="block" style="margin:0">
          <div class="row" style="justify-content:space-between; align-items:center">
            <div class="muted">exampleId: <code>${escapeHtml(exId)}</code></div>
            <div class="row">
              <button class="btn small" type="button" onclick="playExample('${escapeJs(exId)}')">▶</button>
              <button class="btn small" type="button" onclick="recordExample('${escapeJs(exId)}')">🎤</button>
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
  // добавим в первый sense
  editingWord.senses[0].examples = editingWord.senses[0].examples || [];
  editingWord.senses[0].examples.push({ id: genId("ex"), ing:"", ru:"", audio:null });
  renderModalExamples();
}

function removeExample(sIdx, exIdx){
  editingWord.senses[sIdx].examples.splice(exIdx,1);
  const total = (editingWord.senses||[]).flatMap(s => s.examples||[]).length;
  if (total === 0) {
    editingWord.senses[0].examples = [{ id: genId("ex"), ing:"", ru:"", audio:null }];
  }
  renderModalExamples();
}

function onExampleIng(sIdx, exIdx, val){
  editingWord.senses[sIdx].examples[exIdx].ing = val;
}
function onExampleRu(sIdx, exIdx, val){
  editingWord.senses[sIdx].examples[exIdx].ru = val;
}

/* ================= SAVE WORD ================= */
function countExamples(w){
  let n = 0;
  (w.senses||[]).forEach(s => n += (s.examples||[]).length);
  return n;
}

function indexPreviewFromWord(w){
  const s = w.senses || [];
  const ing1 = (s[0]?.ing || "").trim();
  const ing2 = (s[1]?.ing || "").trim();
  return {
    id: w.id,
    ru: (w.ru || "").trim(),
    pos: (w.pos || "").trim(),
    ing1,
    ing2,
    examplesCount: countExamples(w)
  };
}

async function saveModal(){
  if (!adminMode) return toast("Нужен админ-режим (GitHub Token).");

  // применяем поля из UI в editingWord
  editingWord.ru = document.getElementById("m-ru").value.trim();
  editingWord.pos = document.getElementById("m-pos").value.trim();

  // валидация
  if (!editingWord.ru) return toast("RU обязателен");

  const allEx = (editingWord.senses||[]).flatMap(s => s.examples||[]);
  const okExample = allEx.some(e => (e.ing||"").trim() && (e.ru||"").trim());
  if (!okExample) return toast("Нужен хотя бы 1 пример с заполненными ING и RU");

  // Путь word json
  const WORD_PATH = `${WORDS_DIR}/${editingWord.id}.json`;

  try {
    // 1) обновляем word json
    let wordSha = null;
    try {
      const meta = await ghGetFile(WORD_PATH);
      wordSha = meta.sha;
    } catch {
      wordSha = null; // новый файл
    }

    // PUT word json
    await ghPutJson(WORD_PATH, editingWord, wordSha);

    // 2) обновляем index.json
    const { sha: indexSha, data: idx } = await ghGetJson(INDEX_PATH);
    idx.words = Array.isArray(idx.words) ? idx.words : [];

    const row = indexPreviewFromWord(editingWord);
    const pos = idx.words.findIndex(x => x.id === row.id);
    if (pos >= 0) idx.words[pos] = row;
    else idx.words.unshift(row);

    await ghPutJson(INDEX_PATH, idx, indexSha);

    // локально обновим кэш/список
    wordCache.set(editingWord.id, deepClone(editingWord));
    indexData = idx;
    indexList = idx.words;
    render();

    closeModal();
    toast("Сохранено ✓");
  } catch (e) {
    console.error(e);
    toast("Ошибка сохранения: " + e.message);
  }
}

/* ================= AUDIO ================= */
function playWord(id){
  const url = `audio/words/${id}.mp3?v=${Date.now()}`;
  const a = new Audio(url);
  a.play().catch(() => toast("Нет аудио слова"));
}
function playExample(exampleId){
  const url = `audio/examples/${exampleId}.mp3?v=${Date.now()}`;
  const a = new Audio(url);
  a.play().catch(() => toast("Нет аудио примера"));
}
function playWordAudio(){
  if (!editingId) return;
  playWord(editingId);
}

function recordWord(){
  if (!adminMode) return toast("Нужен админ-режим");
  if (typeof startRecordingWord !== "function") return toast("recorder.js не загружен");
  startRecordingWord(editingId);
}
function recordExample(exampleId){
  if (!adminMode) return toast("Нужен админ-режим");
  if (typeof startRecordingExample !== "function") return toast("recorder.js не загружен");
  startRecordingExample(exampleId);
}

// хуки из recorder.js
window.onWordAudioReady = async (id, mp3Bytes) => {
  try {
    await ghPutBinary(`audio/words/${id}.mp3`, mp3Bytes);
    toast("Аудио слова загружено ✓");
  } catch (e) {
    console.error(e);
    toast("Ошибка загрузки mp3: " + e.message);
  }
};

window.onExampleAudioReady = async (exampleId, mp3Bytes) => {
  try {
    await ghPutBinary(`audio/examples/${exampleId}.mp3`, mp3Bytes);
    toast("Аудио примера загружено ✓");
  } catch (e) {
    console.error(e);
    toast("Ошибка загрузки mp3: " + e.message);
  }
};

/* ================= OPENAI ================= */
function saveAiKey(){
  const key = document.getElementById("ai-key").value.trim();
  if(!key) return toast("Введите OpenAI API key");
  localStorage.setItem("openaiKey", key);
  document.getElementById("ai-status").textContent = "✓";
}

async function callAI(prompt){
  const key = localStorage.getItem("openaiKey");
  if(!key){ toast("Нет OpenAI API key"); return ""; }

  const res = await fetch("https://api.openai.com/v1/chat/completions",{
    method:"POST",
    headers:{ "Authorization":"Bearer " + key, "Content-Type":"application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages:[
        { role:"system", content:"Ты помощник для ингушско-русского словаря. Пиши кратко." },
        { role:"user", content: prompt }
      ]
    })
  });

  const json = await res.json().catch(()=>null);
  return json?.choices?.[0]?.message?.content?.trim() || "";
}

async function aiImproveRu(){
  if (!editingWord) return;
  const ru = document.getElementById("m-ru").value.trim();
  if(!ru) return toast("Сначала заполни RU");
  const out = await callAI("Исправь орфографию и стиль RU, не меняя смысл:\n" + ru);
  if(out) document.getElementById("m-ru").value = out;
}

async function aiTranslateIng(){
  if (!editingWord) return;
  const ru = document.getElementById("m-ru").value.trim();
  if(!ru) return toast("Сначала заполни RU");
  const out = await callAI("Переведи на ингушский язык. Дай 1-3 варианта, каждый с новой строки:\n" + ru);
  if(!out) return;

  const lines = out.split("\n").map(x => x.trim()).filter(Boolean).slice(0,3);
  if(!lines.length) return;

  editingWord.senses = lines.map(line => ({
    ing: line,
    definition: null,
    examples: [{ id: genId("ex"), ing:"", ru:"", audio:null }]
  }));

  renderModalSenses();
  renderModalExamples();
}

async function aiGenerateExample(){
  if (!editingWord) return;
  const ru = document.getElementById("m-ru").value.trim();
  const ing = (editingWord.senses?.[0]?.ing || "").trim();
  if(!ru || !ing) return toast("Нужны RU и хотя бы один ING");

  const out = await callAI(
    "Сделай 1 короткий пример употребления.\n" +
    "Формат строго:\nING: ...\nRU: ...\n" +
    `Слово RU: ${ru}\nПеревод ING: ${ing}`
  );

  const mIng = out.match(/ING:\s*(.*)/i);
  const mRu  = out.match(/RU:\s*(.*)/i);
  if(!mIng || !mRu) return toast("ИИ вернул неожиданный формат");

  editingWord.senses[0].examples = editingWord.senses[0].examples || [];
  editingWord.senses[0].examples.push({
    id: genId("ex"),
    ing: (mIng[1]||"").trim(),
    ru: (mRu[1]||"").trim(),
    audio: null
  });

  renderModalExamples();
}

/* ================= PWA ================= */
async function registerSW(){
  if(!("serviceWorker" in navigator)) return;
  try{ await navigator.serviceWorker.register("./sw.js"); }
  catch(e){ console.warn("SW register failed", e); }
}
