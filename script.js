/* ================= CONFIG ================= */
const OWNER  = "ganizhevAmirkhan";
const REPO   = "ingush-language";
const BRANCH = "main";

const INDEX_PATH = "dictionary-v2/index.json";
const WORDS_DIR  = "dictionary-v2/words";

/* ================= STATE ================= */
let adminMode = false;
let githubToken = localStorage.getItem("githubToken") || null;

let indexData = [];     // index.json
let currentWord = null; // открытое слово
let filterQ = "";

/* ================= INIT ================= */
window.onload = async () => {
  if (githubToken) enableAdmin();

  document.getElementById("search").oninput = e => {
    filterQ = e.target.value.toLowerCase();
    renderList();
  };

  document.getElementById("search-btn").onclick = () => renderList();

  await loadIndex();
};

/* ================= ADMIN ================= */
function enableAdmin(){
  adminMode = true;
  document.getElementById("admin-status").textContent = "✓ Админ";
  document.getElementById("add-word-btn").classList.remove("hidden");
}

function adminLogin(){
  const t = document.getElementById("gh-token").value.trim();
  if(!t) return alert("Введите GitHub Token");
  githubToken = t;
  localStorage.setItem("githubToken", t);
  enableAdmin();
}

function adminLogout(){
  localStorage.removeItem("githubToken");
  location.reload();
}

/* ================= LOAD INDEX ================= */
async function loadIndex(){
  const res = await fetch(INDEX_PATH + "?v=" + Date.now());
  indexData = await res.json();
  renderList();
}

/* ================= RENDER ================= */
function renderList(){
  const list = document.getElementById("list");
  list.innerHTML = "";

  const filtered = indexData.filter(w =>
    w.ru.toLowerCase().includes(filterQ)
  );

  document.getElementById("stats").textContent =
    `Слов: ${indexData.length} · Показано: ${filtered.length}`;

  filtered.slice(0,300).forEach(w => {
    list.insertAdjacentHTML("beforeend", `
      <div class="card">
        <div class="wordRu">${w.ru}</div>
        <div class="pos">${w.pos || ""}</div>
        <div class="row">
          <button class="pill" onclick="playWord('${w.id}')">▶</button>
          ${adminMode ? `<button class="pill" onclick="openEditor('${w.id}')">✏</button>` : ""}
        </div>
      </div>
    `);
  });
}

/* ================= OPEN EDITOR ================= */
async function openEditor(id){
  const res = await fetch(`${WORDS_DIR}/${id}.json?v=${Date.now()}`);
  currentWord = await res.json();

  document.getElementById("m-ru").value = currentWord.ru || "";
  document.getElementById("m-pos").value = currentWord.pos || "";

  renderSenses();
  renderExamples();

  document.getElementById("modal").classList.remove("hidden");
}

function closeModal(){
  document.getElementById("modal").classList.add("hidden");
  currentWord = null;
}

/* ================= SENSES ================= */
function renderSenses(){
  const box = document.getElementById("m-senses");
  box.innerHTML = "";
  currentWord.senses.forEach((s,i)=>{
    box.insertAdjacentHTML("beforeend",`
      <input class="input" value="${s.ing}"
        oninput="currentWord.senses[${i}].ing=this.value">
    `);
  });
}

function addSense(){
  currentWord.senses.push({ing:"",examples:[]});
  renderSenses();
}

/* ================= EXAMPLES ================= */
function renderExamples(){
  const box = document.getElementById("m-examples");
  box.innerHTML = "";
  currentWord.senses.forEach(s=>{
    s.examples.forEach(ex=>{
      box.insertAdjacentHTML("beforeend",`
        <textarea class="input"
          oninput="ex.ing=this.value">${ex.ing||""}</textarea>
        <textarea class="input"
          oninput="ex.ru=this.value">${ex.ru||""}</textarea>
      `);
    });
  });
}

function addExample(){
  currentWord.senses[0].examples.push({
    id:"ex_"+Date.now(),
    ing:"",
    ru:"",
    audio:null
  });
  renderExamples();
}

/* ================= SAVE ================= */
async function saveModal(){
  if(!adminMode) return alert("Нет админ-режима");

  currentWord.ru  = document.getElementById("m-ru").value.trim();
  currentWord.pos = document.getElementById("m-pos").value.trim();

  await ghPut(
    `${WORDS_DIR}/${currentWord.id}.json`,
    JSON.stringify(currentWord,null,2)
  );

  alert("Сохранено");
  closeModal();
}

/* ================= ADD WORD ================= */
async function openCreateWord(){
  const id = "w_" + Date.now();
  const word = {
    id,
    ru:"",
    pos:"",
    senses:[{ing:"",examples:[]}],
    audio:{word:null}
  };

  indexData.unshift({id,ru:"",pos:""});
  await ghPut(INDEX_PATH, JSON.stringify(indexData,null,2));
  await ghPut(`${WORDS_DIR}/${id}.json`, JSON.stringify(word,null,2));

  openEditor(id);
}

/* ================= AUDIO ================= */
function playWord(id){
  new Audio(`audio/words/${id}.mp3`).play();
}

function playWordAudio(){
  playWord(currentWord.id);
}

function recordWord(){
  startRecordingWord(currentWord.id);
}

/* ================= GITHUB ================= */
async function ghPut(path, content){
  const api = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;
  let sha=null;

  const r = await fetch(api,{headers:{Authorization:`token ${githubToken}`}});
  if(r.ok) sha=(await r.json()).sha;

  await fetch(api,{
    method:"PUT",
    headers:{
      Authorization:`token ${githubToken}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      message:"update "+path,
      content:btoa(unescape(encodeURIComponent(content))),
      sha
    })
  });
}
