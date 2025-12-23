/* ================= CONFIG ================= */
const OWNER  = "ganizhevAmirkhan";
const REPO   = "ingush-language";
const BRANCH = "main";

// Админский словарь (v3)
const DATA_PATH = "admin/dictionary.admin.json";

/* ================= STATE ================= */
let adminMode = false;
let githubToken = localStorage.getItem("githubToken") || null;

let dict = null;          // весь JSON v2
let words = [];           // dict.words
let filterQ = "";

// modal editing
let editingId = null;

/* ================= INIT ================= */
window.onload = async () => {
  // admin restore
  if (githubToken) {
    adminMode = true;
    setAdminUI(true);
  }

  // search handler (КЛЮЧЕВОЕ — чтобы поиск не пропадал)
  const s = document.getElementById("search");
  if (s) {
    s.oninput = () => {
      filterQ = (s.value || "").trim().toLowerCase();
      render();
    };
  }

  // ai restore
  const aiKey = localStorage.getItem("openaiKey");
  if (aiKey) document.getElementById("ai-status").textContent = "✓";

  // PWA
  registerSW();

  await loadDictionary();
};

/* ================= UI HELPERS ================= */
function setAdminUI(on){
  document.getElementById("admin-status").textContent = on ? "✓ Админ" : "";
  document.getElementById("admin-logout").classList.toggle("hidden", !on);
  document.getElementById("add-word-btn").classList.toggle("hidden", !on);
}

function toast(msg){
  alert(msg);
}

/* ================= LOAD DICT ================= */
async function loadDictionary(){
  // читаем с GitHub Pages (обычный fetch)
  const res = await fetch(DATA_PATH + "?v=" + Date.now());
  if(!res.ok){
    document.getElementById("list").innerHTML =
      `<div class="card"><b>Не удалось загрузить:</b> ${DATA_PATH}<br>Проверь путь и что файл существует.</div>`;
    return;
  }
  dict = await res.json();
  words = Array.isArray(dict.words) ? dict.words : [];
  render();
}

/* ================= RENDER ================= */
function matchWord(w, q){
  if(!q) return true;
  const ru = (w.ru || "").toLowerCase();
  const pos = (w.pos || "").toLowerCase();
  const ing = (w.senses || []).map(s => (s.ing || "")).join(" ").toLowerCase();
  return ru.includes(q) || ing.includes(q) || pos.includes(q);
}

function render(){
  const list = document.getElementById("list");
  if(!list) return;

  const q = filterQ;
  const filtered = words.filter(w => matchWord(w, q));

  document.getElementById("stats").textContent =
    `Слов: ${words.length} · Показано: ${filtered.length}`;

  list.innerHTML = "";
  filtered.slice(0, 500).forEach(w => {
    list.insertAdjacentHTML("beforeend", renderCard(w));
  });
}

function renderCard(w){
  const senses = (w.senses || []).map(s => `• ${escapeHtml(s.ing || "")}`).join("<br>");
  const pos = escapeHtml(w.pos || "");

  const examplesCount = countExamples(w);
  const missingExamples = hasMissingExamples(w);

  return `
  <div class="card" id="w-${w.id}">
    <div class="cardTop">
      <div>
        <div class="wordRu">${escapeHtml(w.ru || "")}</div>
        <div class="pos">${pos ? pos : ""}</div>
      </div>
      <div class="row">
        <div class="pill" onclick="playWord('${w.id}')">▶</div>
        ${adminMode ? `<div class="pill" onclick="openEditWord('${w.id}')">✏</div>` : ``}
      </div>
    </div>

    <div class="ingLine">${senses || `<span class="muted">Нет переводов</span>`}</div>

    <div class="examples">
      <div class="muted">
        Примеры: ${examplesCount}
        ${missingExamples ? ` · <b style="color:#d11">нужны примеры!</b>` : ``}
      </div>
      ${(w.senses||[]).flatMap(s => (s.examples||[])).slice(0,3).map(ex => `
        <div class="exItem">
          <div>${escapeHtml(ex.ing || "")}</div>
          <div class="exSub">${escapeHtml(ex.ru || "")}</div>
        </div>
      `).join("")}
    </div>
  </div>`;
}

function escapeHtml(s){
  return (s ?? "").toString()
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function countExamples(w){
  let n = 0;
  (w.senses||[]).forEach(s => n += (s.examples||[]).length);
  return n;
}

function hasMissingExamples(w){
  // обязательны примеры: считаем что хотя бы 1 пример с заполненными ing+ru
  const ex = (w.senses||[]).flatMap(s => s.examples||[]);
  if(ex.length === 0) return true;
  // если все пустые — тоже плохо
  const anyFilled = ex.some(e => (e.ing||"").trim() && (e.ru||"").trim());
  return !anyFilled;
}

/* ================= ADMIN ================= */
function adminLogin(){
  const t = document.getElementById("gh-token").value.trim();
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
function b64EncodeUnicode(str){
  return btoa(unescape(encodeURIComponent(str)));
}
function b64DecodeUnicode(b64){
  return decodeURIComponent(escape(atob(b64)));
}

async function ghGetJson(path){
  if(!githubToken) throw new Error("Нет GitHub Token");
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`;
  const res = await fetch(url, { headers: { Authorization:`token ${githubToken}` }});
  if(!res.ok){
    const txt = await res.text().catch(()=>"(no details)");
    throw new Error("GitHub GET JSON error: " + txt);
  }
  const j = await res.json();
  return {
    sha: j.sha,
    data: JSON.parse(b64DecodeUnicode((j.content||"").replace(/\n/g,"")))
  };
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

async function ghPutBinary(path, uint8array){
  if(!githubToken) throw new Error("Нет GitHub Token");
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;

  // sha if exists
  let sha = null;
  const check = await fetch(url, { headers:{Authorization:`token ${githubToken}`}}).catch(()=>null);
  if(check && check.ok){
    const j = await check.json();
    sha = j.sha;
  }

  // binary -> base64
  let binary = "";
  const chunkSize = 0x8000;
  for(let i=0;i<uint8array.length;i+=chunkSize){
    const chunk = uint8array.subarray(i, i+chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  const b64 = btoa(binary);

  const body = {
    message: `Upload ${path}`,
    content: b64,
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
    throw new Error("GitHub PUT binary error: " + txt);
  }
  return await res.json();
}

/* ================= CRUD WORDS ================= */
function genId(prefix="w"){
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
}

function openCreateWord(){
  const id = genId("w");
  const w = {
    id,
    ru: "",
    pos: "",
    senses: [
      { ing:"", definition:null, examples:[ { id: genId("ex"), ing:"", ru:"", audio:null } ] }
    ],
    audio: { word: null },
    source: "manual"
  };
  // добавим в память и откроем модалку
  words.unshift(w);
  dict.words = words;
  openEditWord(id, true);
}

async function openEditWord(id, isNew=false){
  editingId = id;
  const w = words.find(x => x.id === id);
  if(!w) return toast("Слово не найдено");

  // title
  document.getElementById("modal-title").textContent = isNew ? "Добавить слово" : "Редактировать слово";

  // fill
  document.getElementById("m-ru").value = w.ru || "";
  document.getElementById("m-pos").value = w.pos || "";

  renderModalSenses(w);
  renderModalExamples(w);

  // show
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
      <div class="row" data-sense="${idx}">
        <input class="input" style="flex:1" value="${escapeHtml(s.ing||"")}"
          oninput="onSenseInput(${idx}, this.value)" placeholder="Перевод ING" />
        <button class="btn small" onclick="removeSense(${idx})">🗑</button>
      </div>
    `);
  });
}

function onSenseInput(idx, val){
  const w = words.find(x => x.id === editingId);
  if(!w) return;
  w.senses[idx].ing = val;
}

function addSense(){
  const w = words.find(x => x.id === editingId);
  if(!w) return;
  w.senses = w.senses || [];
  w.senses.push({ ing:"", definition:null, examples:[ { id: genId("ex"), ing:"", ru:"", audio:null } ] });
  renderModalSenses(w);
  renderModalExamples(w);
}

function removeSense(idx){
  const w = words.find(x => x.id === editingId);
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
    const exList = s.examples || [];
    box.insertAdjacentHTML("beforeend", `<div class="muted"><b>Sense ${sIdx+1}</b></div>`);
    exList.forEach((ex, exIdx) => {
      const exId = ex.id || (ex.id = genId("ex"));
      box.insertAdjacentHTML("beforeend", `
        <div class="block" style="margin:0">
          <div class="row" style="justify-content:space-between; align-items:center">
            <div class="muted">exampleId: <code>${exId}</code></div>
            <div class="row">
              <button class="btn small" onclick="playExample('${exId}')">▶</button>
              ${adminMode ? `<button class="btn small" onclick="recordExample('${exId}')">🎤</button>` : ``}
              <button class="btn small" onclick="removeExample(${sIdx}, ${exIdx})">🗑</button>
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
  const w = words.find(x => x.id === editingId);
  if(!w) return;
  // добавим пример в первый sense по умолчанию
  w.senses[0].examples = w.senses[0].examples || [];
  w.senses[0].examples.push({ id: genId("ex"), ing:"", ru:"", audio:null });
  renderModalExamples(w);
}

function removeExample(sIdx, exIdx){
  const w = words.find(x => x.id === editingId);
  if(!w) return;
  w.senses[sIdx].examples.splice(exIdx,1);
  // обязательность: должен остаться хотя бы 1 пример
  const total = (w.senses||[]).flatMap(s => s.examples||[]).length;
  if(total === 0){
    w.senses[0].examples = [ { id: genId("ex"), ing:"", ru:"", audio:null } ];
  }
  renderModalExamples(w);
}

function onExampleIng(sIdx, exIdx, val){
  const w = words.find(x => x.id === editingId);
  if(!w) return;
  w.senses[sIdx].examples[exIdx].ing = val;
}
function onExampleRu(sIdx, exIdx, val){
  const w = words.find(x => x.id === editingId);
  if(!w) return;
  w.senses[sIdx].examples[exIdx].ru = val;
}

async function saveModal(){
  if(!adminMode) return toast("Нужен админ-режим (GitHub Token).");
  const w = words.find(x => x.id === editingId);
  if(!w) return;

  // take inputs
  w.ru = document.getElementById("m-ru").value.trim();
  w.pos = document.getElementById("m-pos").value.trim();

  // validate обязательные примеры
  if(!w.ru) return toast("RU обязателен");
  const allEx = (w.senses||[]).flatMap(s => s.examples||[]);
  const ok = allEx.some(e => (e.ing||"").trim() && (e.ru||"").trim());
  if(!ok) return toast("Нужен хотя бы 1 пример с заполненными ING и RU");

  // save JSON via GitHub API (как в разговорнике)
  try{
    const { sha, data } = await ghGetJson(DATA_PATH);
    data.words = words;
    await ghPutJson(DATA_PATH, data, sha);

    // обновим локально и перерисуем
    dict = data;
    words = data.words || [];
    closeModal();
    render();
    toast("Сохранено ✓");
  }catch(e){
    console.error(e);
    toast("Ошибка сохранения: " + e.message);
  }
}

/* ================= AUDIO PLAY ================= */
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

function playWordAudio(){
  if(!editingId) return;
  playWord(editingId);
}

/* ================= RECORD (recorder.js) ================= */
function recordWord(){
  if(!adminMode) return toast("Нужен админ-режим");
  if(typeof startRecordingWord !== "function") return toast("recorder.js не загружен");
  startRecordingWord(editingId);
}

function recordExample(exampleId){
  if(!adminMode) return toast("Нужен админ-режим");
  if(typeof startRecordingExample !== "function") return toast("recorder.js не загружен");
  startRecordingExample(exampleId);
}

/* recorder.js вызывает эти хуки после готовности mp3 */
window.onWordAudioReady = async (id, mp3Bytes) => {
  try{
    await ghPutBinary(`audio/words/${id}.mp3`, mp3Bytes);
    toast("Аудио слова загружено ✓");
  }catch(e){
    console.error(e);
    toast("Ошибка загрузки mp3: " + e.message);
  }
};

window.onExampleAudioReady = async (exampleId, mp3Bytes) => {
  try{
    await ghPutBinary(`audio/examples/${exampleId}.mp3`, mp3Bytes);
    toast("Аудио примера загружено ✓");
  }catch(e){
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
  if(!key){
    toast("Нет OpenAI API key");
    return "";
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions",{
    method:"POST",
    headers:{
      "Authorization":"Bearer " + key,
      "Content-Type":"application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages:[
        { role:"system", content:"Ты помощник для ингушско-русского словаря. Пиши кратко, без лишнего текста." },
        { role:"user", content: prompt }
      ]
    })
  });

  const json = await res.json().catch(()=>null);
  return json?.choices?.[0]?.message?.content?.trim() || "";
}

async function aiImproveRu(){
  const ru = document.getElementById("m-ru").value.trim();
  if(!ru) return toast("Сначала заполни RU");
  const out = await callAI("Исправь орфографию и стиль RU, не меняя смысл:\n" + ru);
  if(out) document.getElementById("m-ru").value = out;
}

async function aiTranslateIng(){
  const ru = document.getElementById("m-ru").value.trim();
  if(!ru) return toast("Сначала заполни RU");
  const out = await callAI("Переведи на ингушский язык. Дай 1-3 варианта, каждый с новой строки, без нумерации:\n" + ru);
  if(!out) return;

  const w = words.find(x => x.id === editingId);
  if(!w) return;

  const lines = out.split("\n").map(x => x.trim()).filter(Boolean).slice(0,3);
  if(lines.length){
    w.senses = lines.map(line => ({ ing: line, definition:null, examples:[ { id: genId("ex"), ing:"", ru:"", audio:null } ] }));
    renderModalSenses(w);
    renderModalExamples(w);
  }
}

async function aiGenerateExample(){
  const w = words.find(x => x.id === editingId);
  if(!w) return;
  const ru = document.getElementById("m-ru").value.trim();
  const ing = (w.senses?.[0]?.ing || "").trim();

  if(!ru || !ing) return toast("Нужны RU и хотя бы один ING");

  const out = await callAI(
    "Сделай 1 короткий пример употребления.\n" +
    "Формат строго:\n" +
    "ING: ...\nRU: ...\n" +
    `Слово RU: ${ru}\nПеревод ING: ${ing}`
  );

  const mIng = out.match(/ING:\s*(.*)/i);
  const mRu  = out.match(/RU:\s*(.*)/i);
  if(!mIng || !mRu) return toast("ИИ вернул неожиданный формат");

  // добавим в первый sense
  w.senses[0].examples = w.senses[0].examples || [];
  w.senses[0].examples.push({
    id: genId("ex"),
    ing: (mIng[1]||"").trim(),
    ru: (mRu[1]||"").trim(),
    audio: null
  });
  renderModalExamples(w);
}

/* ================= PWA ================= */
async function registerSW(){
  if(!("serviceWorker" in navigator)) return;
  try{
    await navigator.serviceWorker.register("./sw.js");
  }catch(e){
    console.warn("SW register failed", e);
  }
}
