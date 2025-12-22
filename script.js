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
let indexWords = [];      // [{id, ru, pos}]
let filterQ = "";

let editingWord = null;   // полный word JSON

/* ================= INIT ================= */
window.onload = async () => {
  if (githubToken) {
    adminMode = true;
    setAdminUI(true);
  }

  const s = document.getElementById("search");
  if (s) {
    s.oninput = () => {
      filterQ = s.value.trim().toLowerCase();
      render();
    };
  }

  await loadIndex();
};

/* ================= UI ================= */
function setAdminUI(on){
  document.getElementById("admin-status").textContent = on ? "✓ Админ" : "";
  document.getElementById("add-word-btn")?.classList.toggle("hidden", !on);
}

/* ================= LOAD INDEX ================= */
async function loadIndex(){
  const res = await fetch(INDEX_PATH + "?v=" + Date.now());
  if(!res.ok){
    alert("Не найден index.json");
    return;
  }
  indexData = await res.json();
  indexWords = indexData.words || [];
  render();
}

/* ================= RENDER LIST ================= */
function render(){
  const list = document.getElementById("list");
  if(!list) return;

  const q = filterQ;
  const filtered = indexWords.filter(w => {
    if(!q) return true;
    return (
      (w.ru || "").toLowerCase().includes(q) ||
      (w.pos || "").toLowerCase().includes(q)
    );
  });

  list.innerHTML = "";
  document.getElementById("stats").textContent =
    `Слов: ${indexWords.length} · Показано: ${filtered.length}`;

  filtered.slice(0, 500).forEach(w => {
    list.insertAdjacentHTML("beforeend", `
      <div class="card">
        <div class="cardTop">
          <div>
            <div class="wordRu">${escapeHtml(w.ru)}</div>
            <div class="pos">${escapeHtml(w.pos || "")}</div>
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

/* ================= LOAD ONE WORD ================= */
async function loadWord(id){
  const res = await fetch(`${WORDS_DIR}/${id}.json?v=${Date.now()}`);
  if(!res.ok) throw new Error("word json not found");
  return await res.json();
}

/* ================= OPEN EDIT ================= */
async function openEdit(id){
  try{
    editingWord = await loadWord(id);
    fillModal(editingWord);
    openModal();
  }catch(e){
    alert("Не удалось загрузить слово");
  }
}

/* ================= SAVE WORD ================= */
async function saveWord(){
  if(!adminMode) return alert("Нужен админ режим");

  try{
    const path = `${WORDS_DIR}/${editingWord.id}.json`;
    const { sha } = await ghGetJson(path);
    await ghPutJson(path, editingWord, sha);
    alert("Сохранено ✓");
    closeModal();
  }catch(e){
    alert("Ошибка сохранения: " + e.message);
  }
}

/* ================= PLAY AUDIO ================= */
function playWord(id){
  const a = new Audio(`audio/words/${id}.mp3?v=${Date.now()}`);
  a.play().catch(()=>alert("Нет аудио"));
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

/* ================= GITHUB API ================= */
function b64EncodeUnicode(str){
  return btoa(unescape(encodeURIComponent(str)));
}
function b64DecodeUnicode(b64){
  return decodeURIComponent(escape(atob(b64)));
}

async function ghGetJson(path){
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`;
  const res = await fetch(url,{headers:{Authorization:`token ${githubToken}`}});
  if(!res.ok) throw new Error("GitHub GET error");
  const j = await res.json();
  return {
    sha: j.sha,
    data: JSON.parse(b64DecodeUnicode(j.content.replace(/\n/g,"")))
  };
}

async function ghPutJson(path, data, sha){
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;
  const body = {
    message:`Update ${path}`,
    content:b64EncodeUnicode(JSON.stringify(data,null,2)),
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

/* ================= UTILS ================= */
function escapeHtml(s){
  return (s||"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}
