/* ================= CONFIG ================= */
const OWNER  = "ganizhevAmirkhan";
const REPO   = "ingush-language";
const BRANCH = "main";

const PUBLIC_PATH = "public/dictionary.json";
const ADMIN_PATH  = "admin/dictionary.admin.json";

/* ================= STATE ================= */
let dict = { version: "3.0", words: [] };
let words = [];
let filterQ = "";
let adminMode = false;
let githubToken = localStorage.getItem("githubToken") || "";
let editingWord = null;

/* ================= HELPERS ================= */
const $ = (id) => document.getElementById(id);
const escapeHtml = (s="") =>
  s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
const b64 = (s) => btoa(unescape(encodeURIComponent(s)));

const ghHeaders = () => ({
  Authorization: "Bearer " + githubToken,
  Accept: "application/vnd.github+json",
  "Content-Type": "application/json"
});

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded", () => {
  adminMode = !!githubToken;
  setAdminUI(adminMode);

  $("search")?.addEventListener("input", e => {
    filterQ = e.target.value.toLowerCase().trim();
    render();
  });

  loadDictionary();
});

/* ================= ADMIN UI ================= */
function setAdminUI(on) {
  $("admin-status").textContent = on ? "✓ Админ" : "";
  $("admin-logout").classList.toggle("hidden", !on);
  $("add-word-btn").classList.toggle("hidden", !on);
  $("publish-btn").classList.toggle("hidden", !on);
}

function adminLogin() {
  const t = $("gh-token").value.trim();
  if (!t) return alert("Введите GitHub Token");
  githubToken = t;
  localStorage.setItem("githubToken", t);
  adminMode = true;
  setAdminUI(true);
  loadDictionary();
}

function adminLogout() {
  localStorage.removeItem("githubToken");
  githubToken = "";
  adminMode = false;
  setAdminUI(false);
  loadDictionary();
}

/* ================= LOAD ================= */
async function loadDictionary() {
  const path = adminMode ? ADMIN_PATH : PUBLIC_PATH;
  try {
    const res = await fetch(path + "?v=" + Date.now());
    if (!res.ok) throw new Error("load failed");
    dict = await res.json();
    dict.words = Array.isArray(dict.words) ? dict.words : [];
    words = dict.words;
    render();
  } catch (e) {
    $("list").innerHTML = "<b>Ошибка загрузки словаря</b>";
  }
}

/* ================= RENDER (ЕДИНСТВЕННЫЙ) ================= */
function render() {
  const list = $("list");
  if (!list) return;

  const filtered = words.filter(w =>
    !filterQ ||
    (w.ru||"").toLowerCase().includes(filterQ) ||
    (w.pos||"").toLowerCase().includes(filterQ) ||
    (w.senses||[]).some(s => (s.ing||"").toLowerCase().includes(filterQ))
  );

  $("stats").textContent = `Слов: ${words.length} · Показано: ${filtered.length}`;
  list.innerHTML = "";

  filtered.forEach(w => {
    list.insertAdjacentHTML("beforeend", `
      <div class="card">
        <div class="cardTop">
          <div>
            <div class="wordRu">${escapeHtml(w.ru)}</div>
            <div class="pos">${escapeHtml(w.pos||"")}</div>
          </div>
          <div class="row">
            ${w.audio?.word ? `<button class="pill" onclick="playWord('${w.id}')">▶</button>` :
            `<button class="pill disabled">—</button>`}
            ${adminMode ? `<button class="pill" onclick="openEditWord('${w.id}')">✏</button>` : ""}
          </div>
        </div>
        <div class="ingLine">
          ${(w.senses||[]).map(s=>`• ${escapeHtml(s.ing)}`).join("<br>")}
        </div>
      </div>
    `);
  });
}

/* ================= MODAL ================= */
function openModal(){ $("modal").classList.remove("hidden"); }
function closeModal(){ $("modal").classList.add("hidden"); }

function openCreateWord(){
  editingWord = null;
  $("modal-title").textContent = "Добавить слово";
  $("m-ru").value = "";
  $("m-pos").value = "";
  $("m-senses").innerHTML = "";
  addSense("");
  openModal();
}

function openEditWord(id){
  editingWord = words.find(w=>w.id===id);
  if (!editingWord) return;
  $("modal-title").textContent = "Редактирование";
  $("m-ru").value = editingWord.ru||"";
  $("m-pos").value = editingWord.pos||"";
  $("m-senses").innerHTML = "";
  editingWord.senses.forEach(s=>addSense(s.ing));
  openModal();
}

function addSense(val=""){
  const d = document.createElement("div");
  d.innerHTML = `<input class="input" value="${escapeHtml(val)}">`;
  $("m-senses").appendChild(d);
}

/* ================= SAVE WORD ================= */
async function saveModal(){
  if (!adminMode) return alert("Нет админ-доступа");

  const ru = $("m-ru").value.trim();
  if (!ru) return alert("RU обязательно");

  const senses = [...document.querySelectorAll("#m-senses input")]
    .map(i=>i.value.trim()).filter(Boolean).map(ing=>({ing}));

  if (!senses.length) return alert("Нужен ING");

  if (!editingWord){
    editingWord = { id:"w_"+Math.random().toString(36).slice(2,9), audio:{word:false} };
    dict.words.push(editingWord);
  }

  editingWord.ru = ru;
  editingWord.pos = $("m-pos").value.trim();
  editingWord.senses = senses;

  await saveAdminDictionary();
  closeModal();
  render();
  alert("✅ Сохранено");
}

/* ================= GITHUB ================= */
async function saveAdminDictionary(){
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${ADMIN_PATH}`;
  const meta = await fetch(url,{headers:ghHeaders()}).then(r=>r.json());

  await fetch(url,{
    method:"PUT",
    headers:ghHeaders(),
    body:JSON.stringify({
      message:"update admin dictionary",
      sha:meta.sha,
      branch:BRANCH,
      content:b64(JSON.stringify(dict,null,2))
    })
  });
}

async function publishToPublic(){
  if (!confirm("Опубликовать публичный словарь?")) return;

  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PUBLIC_PATH}`;
  const meta = await fetch(url,{headers:ghHeaders()}).then(r=>r.ok?r.json():null);

  await fetch(url,{
    method:"PUT",
    headers:ghHeaders(),
    body:JSON.stringify({
      message:"publish dictionary",
      sha:meta?.sha,
      branch:BRANCH,
      content:b64(JSON.stringify(dict,null,2))
    })
  });

  alert("🚀 Опубликовано");
  adminLogout();
  location.reload();
}

/* ================= AUDIO ================= */
function playWord(id){
  new Audio(`https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/audio/words/${id}.mp3`).play();
}

/* ================= EXPOSE ================= */
window.adminLogin = adminLogin;
window.adminLogout = adminLogout;
window.openCreateWord = openCreateWord;
window.openEditWord = openEditWord;
window.closeModal = closeModal;
window.saveModal = saveModal;
window.publishToPublic = publishToPublic;
window.playWord = playWord;
