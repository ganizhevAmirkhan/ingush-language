/* ================= CONFIG ================= */
const OWNER  = "ganizhevAmirkhan";
const REPO   = "ingush-language";
const BRANCH = "main";

/* ================= DATA ================= */
const DATA_PATH = "admin/dictionary.admin.json";

/* ================= STATE ================= */
let githubToken = localStorage.getItem("githubToken") || null;
let adminMode = !!githubToken;

let dict = { words: [] };
let words = [];
let filterQ = "";
let editingId = null;

/* ================= INIT ================= */
window.onload = async () => {
  setAdminUI(adminMode);

  const search = document.getElementById("search");
  if (search) {
    search.oninput = () => {
      filterQ = search.value.toLowerCase().trim();
      render();
    };
  }

  await loadDictionary();
};

/* ================= UI ================= */
function setAdminUI(on){
  document.getElementById("admin-status").textContent = on ? "✓ Админ" : "";
  document.getElementById("admin-logout").classList.toggle("hidden", !on);
  document.getElementById("add-word-btn").classList.toggle("hidden", !on);
}

function toast(msg){ alert(msg); }

/* ================= LOAD ================= */
async function loadDictionary(){
  try{
    const res = await fetch(DATA_PATH + "?v=" + Date.now());
    if(!res.ok) throw new Error("fetch failed");
    dict = await res.json();
    words = Array.isArray(dict.words) ? dict.words : [];
    render();
  }catch(e){
    console.error(e);
    document.getElementById("list").innerHTML =
      `<div class="card">Ошибка загрузки словаря</div>`;
  }
}

/* ================= SEARCH + RENDER ================= */
function matchWord(w, q){
  if(!q) return true;
  const ru = (w.ru||"").toLowerCase();
  const pos = (w.pos||"").toLowerCase();
  const ing = (w.senses||[]).map(s=>s.ing||"").join(" ").toLowerCase();
  return ru.includes(q) || ing.includes(q) || pos.includes(q);
}

function render(){
  const list = document.getElementById("list");
  if(!list) return;

  const filtered = words.filter(w => matchWord(w, filterQ));

  document.getElementById("stats").textContent =
    `Слов: ${words.length} · Показано: ${filtered.length}`;

  list.innerHTML = "";
  filtered.slice(0,500).forEach(w=>{
    list.insertAdjacentHTML("beforeend", renderCard(w));
  });
}

function renderCard(w){
  const senses = (w.senses||[]).map(s=>`• ${esc(s.ing)}`).join("<br>");
  const examples = (w.senses||[]).flatMap(s=>s.examples||[]).slice(0,3);

  return `
  <div class="card">
    <div class="cardTop">
      <div>
        <div class="wordRu">${esc(w.ru)}</div>
        <div class="pos">${esc(w.pos)}</div>
      </div>
      <div class="row">
        <div class="pill" onclick="playWord('${w.id}')">▶</div>
        ${adminMode ? `<div class="pill" onclick="openEditWord('${w.id}')">✏</div>` : ``}
      </div>
    </div>

    <div class="ingLine">${senses || `<span class="muted">нет перевода</span>`}</div>

    <div class="examples">
      ${examples.map(ex=>`
        <div class="exItem">
          <div>${esc(ex.ing)}</div>
          <div class="exSub">${esc(ex.ru)}</div>
        </div>`).join("")}
    </div>
  </div>`;
}

function esc(s){
  return (s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
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

/* ================= GITHUB API ================= */
function b64u(str){ return btoa(unescape(encodeURIComponent(str))); }
function ub64(str){ return decodeURIComponent(escape(atob(str))); }

async function ghGet(){
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${DATA_PATH}`;
  const r = await fetch(url,{headers:{Authorization:`token ${githubToken}`}});
  const j = await r.json();
  return { sha:j.sha, data:JSON.parse(ub64(j.content.replace(/\n/g,""))) };
}

async function ghPut(data, sha){
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${DATA_PATH}`;
  await fetch(url,{
    method:"PUT",
    headers:{Authorization:`token ${githubToken}`,"Content-Type":"application/json"},
    body:JSON.stringify({
      message:"Update dictionary",
      content:b64u(JSON.stringify(data,null,2)),
      sha
    })
  });
}

/* ================= CRUD ================= */
function genId(p="id"){ return `${p}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`; }

function openCreateWord(){
  const w = {
    id: genId("w"),
    ru:"",
    pos:"",
    senses:[{ ing:"", examples:[{id:genId("ex"),ing:"",ru:"",audio:null}] }],
    audio:{word:null},
    source:"manual"
  };
  words.unshift(w);
  openEditWord(w.id,true);
}

/* === модалка (сокращено, логика та же) === */
/* твой modal / recorder.js ОСТАЁТСЯ БЕЗ ИЗМЕНЕНИЙ */

/* ================= AUDIO ================= */
function playWord(id){
  new Audio(`audio/words/${id}.mp3?v=${Date.now()}`).play().catch(()=>toast("Нет аудио"));
}
function playExample(id){
  new Audio(`audio/examples/${id}.mp3?v=${Date.now()}`).play().catch(()=>toast("Нет аудио"));
}
