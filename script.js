/* ================= CONFIG ================= */
const OWNER  = "ganizhevAmirkhan";     // 👈 ПРОВЕРЬ
const REPO   = "ingush-language";      // 👈 ПРОВЕРЬ
const BRANCH = "main";

const INDEX_PATH = "dictionary-v2/index.json";
const WORDS_DIR  = "dictionary-v2/words";

/* ================= STATE ================= */
let adminMode = false;
let githubToken = localStorage.getItem("githubToken");

let indexData = null;      // index.json
let wordsIndex = [];       // [{id, ru, pos}]
let openedWord = null;     // текущий word.json
let filterQ = "";
let editingId = null;

/* ================= INIT ================= */
window.onload = async () => {
  if (githubToken) {
    adminMode = true;
    setAdminUI(true);
  }

  document.getElementById("search").oninput = (e) => {
    filterQ = e.target.value.toLowerCase().trim();
    renderList();
  };

  document.getElementById("search-btn").onclick = () => renderList();

  await loadIndex();
};

/* ================= LOAD ================= */
async function loadIndex(){
  const r = await fetch(INDEX_PATH + "?v=" + Date.now());
  if(!r.ok){
    alert("Не найден index.json");
    return;
  }
  indexData = await r.json();
  wordsIndex = indexData.words || [];
  renderList();
}

async function loadWord(id){
  const r = await fetch(`${WORDS_DIR}/${id}.json?v=` + Date.now());
  if(!r.ok) throw new Error("word.json не найден");
  return await r.json();
}

/* ================= RENDER LIST ================= */
function renderList(){
  const list = document.getElementById("list");
  list.innerHTML = "";

  const filtered = wordsIndex.filter(w =>
    !filterQ ||
    (w.ru||"").toLowerCase().includes(filterQ) ||
    (w.pos||"").toLowerCase().includes(filterQ)
  );

  document.getElementById("stats").textContent =
    `Слов: ${wordsIndex.length} · Показано: ${filtered.length}`;

  filtered.slice(0,300).forEach(w=>{
    list.insertAdjacentHTML("beforeend", `
      <div class="card">
        <div class="cardTop">
          <div>
            <div class="wordRu">${escapeHtml(w.ru)}</div>
            <div class="pos">${escapeHtml(w.pos||"")}</div>
          </div>
          <div class="row">
            <button class="pill" onclick="playWord('${w.id}')">▶</button>
            ${adminMode ? `<button class="pill" onclick="openEditWord('${w.id}')">✏</button>` : ""}
          </div>
        </div>
      </div>
    `);
  });
}

/* ================= ADMIN ================= */
function adminLogin(){
  const t = document.getElementById("gh-token").value.trim();
  if(!t) return alert("Введите GitHub Token");
  githubToken = t;
  adminMode = true;
  localStorage.setItem("githubToken", t);
  setAdminUI(true);
}

function adminLogout(){
  localStorage.removeItem("githubToken");
  location.reload();
}

function setAdminUI(on){
  document.getElementById("admin-status").textContent = on ? "✓ Админ" : "";
  document.getElementById("admin-logout").classList.toggle("hidden", !on);
  document.getElementById("add-word-btn").classList.toggle("hidden", !on);
}

/* ================= EDITOR ================= */
async function openEditWord(id){
  editingId = id;
  openedWord = await loadWord(id);

  document.getElementById("m-ru").value = openedWord.ru || "";
  document.getElementById("m-pos").value = openedWord.pos || "";

  renderSenses();
  renderExamples();

  document.getElementById("modal").classList.remove("hidden");
}

function closeModal(){
  document.getElementById("modal").classList.add("hidden");
  openedWord = null;
  editingId = null;
}

function renderSenses(){
  const box = document.getElementById("m-senses");
  box.innerHTML = "";
  openedWord.senses.forEach((s,i)=>{
    box.insertAdjacentHTML("beforeend", `
      <div class="row">
        <input class="input" value="${escapeHtml(s.ing||"")}"
          oninput="openedWord.senses[${i}].ing=this.value">
      </div>
    `);
  });
}

function renderExamples(){
  const box = document.getElementById("m-examples");
  box.innerHTML = "";
  openedWord.senses.forEach((s,si)=>{
    (s.examples||[]).forEach((e,ei)=>{
      box.insertAdjacentHTML("beforeend", `
        <div class="block">
          <textarea class="input"
            oninput="openedWord.senses[${si}].examples[${ei}].ing=this.value"
          >${escapeHtml(e.ing||"")}</textarea>
          <textarea class="input"
            oninput="openedWord.senses[${si}].examples[${ei}].ru=this.value"
          >${escapeHtml(e.ru||"")}</textarea>
        </div>
      `);
    });
  });
}

/* ================= SAVE ================= */
async function saveModal(){
  if(!adminMode) return alert("Нужен админ");

  openedWord.ru  = document.getElementById("m-ru").value.trim();
  openedWord.pos = document.getElementById("m-pos").value.trim();

  const path = `${WORDS_DIR}/${openedWord.id}.json`;

  const {sha} = await ghGet(path);
  await ghPut(path, openedWord, sha);

  closeModal();
  await loadIndex();
  alert("Сохранено ✓");
}

/* ================= GITHUB API ================= */
async function ghGet(path){
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`;
  const r = await fetch(url,{headers:{Authorization:`token ${githubToken}`}});
  const j = await r.json();
  return { sha: j.sha };
}

async function ghPut(path,data,sha){
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;
  const body = {
    message:`Update ${path}`,
    content: btoa(unescape(encodeURIComponent(JSON.stringify(data,null,2)))),
    sha
  };
  const r = await fetch(url,{
    method:"PUT",
    headers:{
      Authorization:`token ${githubToken}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify(body)
  });
  if(!r.ok) throw new Error("GitHub PUT error");
}

/* ================= AUDIO ================= */
function playWord(id){
  new Audio(`audio/words/${id}.mp3`).play().catch(()=>{});
}

/* ================= UTILS ================= */
function escapeHtml(s){
  return (s||"").replaceAll("&","&amp;").replaceAll("<","&lt;");
}
