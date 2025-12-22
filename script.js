/* ================= CONFIG ================= */
const OWNER  = "ganizhevAmirkhan";
const REPO   = "ingush-language";
const BRANCH = "main";

const INDEX_PATH = "dictionary-v2/index.json";
const WORDS_DIR  = "dictionary-v2/words";

/* ================= STATE ================= */
let adminMode = false;
let githubToken = localStorage.getItem("githubToken") || null;

let indexData = null;     // index.json
let wordsIndex = [];     // [{id,ru,pos}]
let filterQ = "";

let editingWord = null;  // полный word.json

/* ================= INIT ================= */
window.onload = async () => {
  if (githubToken) {
    adminMode = true;
    setAdminUI(true);
  }

  const s = document.getElementById("search");
  if (s) {
    s.oninput = () => {
      filterQ = (s.value || "").toLowerCase();
      renderList();
    };
  }

  await loadIndex();
};

/* ================= UI ================= */
function setAdminUI(on){
  document.getElementById("admin-status").textContent = on ? "✓ Админ" : "";
  document.getElementById("admin-logout").classList.toggle("hidden", !on);
  document.getElementById("add-word-btn").classList.toggle("hidden", !on);
}

function toast(msg){ alert(msg); }

/* ================= LOAD INDEX ================= */
async function loadIndex(){
  const res = await fetch(INDEX_PATH + "?v=" + Date.now());
  if(!res.ok){
    document.getElementById("list").innerHTML =
      "<b>Ошибка загрузки index.json</b>";
    return;
  }

  indexData = await res.json();
  wordsIndex = indexData.words || [];
  renderList();
}

/* ================= RENDER LIST ================= */
function match(w){
  if(!filterQ) return true;
  return (
    (w.ru||"").toLowerCase().includes(filterQ) ||
    (w.pos||"").toLowerCase().includes(filterQ)
  );
}

function renderList(){
  const list = document.getElementById("list");
  list.innerHTML = "";

  const filtered = wordsIndex.filter(match);

  document.getElementById("stats").textContent =
    `Слов: ${wordsIndex.length} · Показано: ${filtered.length}`;

  filtered.slice(0,500).forEach(w=>{
    list.insertAdjacentHTML("beforeend", `
      <div class="card">
        <div class="cardTop">
          <div>
            <div class="wordRu">${escapeHtml(w.ru)}</div>
            <div class="pos">${escapeHtml(w.pos||"")}</div>
          </div>
          <div class="row">
            <div class="pill" onclick="playWord('${w.id}')">▶</div>
            ${adminMode ? `<div class="pill" onclick="openEdit('${w.id}')">✏</div>` : ``}
          </div>
        </div>
      </div>
    `);
  });
}

function escapeHtml(s){
  return (s||"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}

/* ================= ADMIN ================= */
function adminLogin(){
  const t = document.getElementById("gh-token").value.trim();
  if(!t) return toast("Введите GitHub Token");

  githubToken = t;
  adminMode = true;
  localStorage.setItem("githubToken", t);

  setAdminUI(true);
  renderList();
}

function adminLogout(){
  localStorage.removeItem("githubToken");
  location.reload();
}

/* ================= LOAD WORD ================= */
async function loadWord(id){
  const res = await fetch(`${WORDS_DIR}/${id}.json?v=${Date.now()}`);
  if(!res.ok) throw new Error("Не удалось загрузить word.json");
  return await res.json();
}

/* ================= EDITOR ================= */
async function openEdit(id){
  try{
    editingWord = await loadWord(id);
  }catch(e){
    toast(e.message);
    return;
  }

  document.getElementById("modal-title").textContent = "Редактировать слово";
  document.getElementById("m-ru").value  = editingWord.ru || "";
  document.getElementById("m-pos").value = editingWord.pos || "";

  renderModalSenses();
  renderModalExamples();

  document.getElementById("modal").classList.remove("hidden");
}

function closeModal(){
  editingWord = null;
  document.getElementById("modal").classList.add("hidden");
}

/* ================= SENSES ================= */
function renderModalSenses(){
  const box = document.getElementById("m-senses");
  box.innerHTML = "";

  editingWord.senses.forEach((s, i)=>{
    box.insertAdjacentHTML("beforeend", `
      <div class="row">
        <input class="input" value="${escapeHtml(s.ing||"")}"
          oninput="editingWord.senses[${i}].ing=this.value">
        <button class="btn small" onclick="removeSense(${i})">🗑</button>
      </div>
    `);
  });
}

function addSense(){
  editingWord.senses.push({
    ing:"",
    examples:[{id:genId("ex"), ing:"", ru:"", audio:null}]
  });
  renderModalSenses();
  renderModalExamples();
}

function removeSense(i){
  if(editingWord.senses.length<=1) return toast("Нужен минимум 1 ING");
  editingWord.senses.splice(i,1);
  renderModalSenses();
  renderModalExamples();
}

/* ================= EXAMPLES ================= */
function renderModalExamples(){
  const box = document.getElementById("m-examples");
  box.innerHTML = "";

  editingWord.senses.forEach((s, si)=>{
    s.examples.forEach((ex, ei)=>{
      box.insertAdjacentHTML("beforeend", `
        <div class="block">
          <b>Пример</b>
          <textarea class="input"
            oninput="editingWord.senses[${si}].examples[${ei}].ing=this.value"
          >${escapeHtml(ex.ing||"")}</textarea>

          <textarea class="input"
            oninput="editingWord.senses[${si}].examples[${ei}].ru=this.value"
          >${escapeHtml(ex.ru||"")}</textarea>
        </div>
      `);
    });
  });
}

function addExample(){
  editingWord.senses[0].examples.push({
    id:genId("ex"), ing:"", ru:"", audio:null
  });
  renderModalExamples();
}

/* ================= SAVE ================= */
async function saveModal(){
  if(!adminMode) return toast("Нет админ-доступа");

  editingWord.ru  = document.getElementById("m-ru").value.trim();
  editingWord.pos = document.getElementById("m-pos").value.trim();

  if(!editingWord.ru) return toast("RU обязателен");

  try{
    await ghSaveWord(editingWord);
    closeModal();
    toast("✓ Сохранено");
  }catch(e){
    console.error(e);
    toast("Ошибка сохранения");
  }
}

/* ================= GITHUB API ================= */
function b64EncodeUnicode(str){
  return btoa(unescape(encodeURIComponent(str)));
}

async function ghSaveWord(word){
  const path = `${WORDS_DIR}/${word.id}.json`;
  const url  = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;

  let sha = null;
  const check = await fetch(url,{
    headers:{Authorization:`token ${githubToken}`}
  });
  if(check.ok){
    sha = (await check.json()).sha;
  }

  const body = {
    message:`Update word ${word.id}`,
    content: b64EncodeUnicode(JSON.stringify(word,null,2)),
    sha
  };

  const res = await fetch(url,{
    method:"PUT",
    headers:{
      Authorization:`token ${githubToken}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify(body)
  });

  if(!res.ok) throw new Error("GitHub PUT error");
}

/* ================= AUDIO ================= */
function playWord(id){
  const a = new Audio(`audio/words/${id}.mp3?v=${Date.now()}`);
  a.play().catch(()=>toast("Нет аудио"));
}

/* ================= UTILS ================= */
function genId(p){
  return `${p}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
}
