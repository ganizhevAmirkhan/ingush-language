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

async function publishToPublic() {
  if (!adminMode || !githubToken) {
    alert("Нет прав администратора");
    return;
  }

  if (!confirm("Опубликовать публичный словарь?")) return;

  try {
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PUBLIC_PATH}`;

    // получаем sha (если файл уже есть)
    const metaRes = await fetch(url, { headers: ghHeaders() });
    const meta = metaRes.ok ? await metaRes.json() : null;

    // публикуем
    const putRes = await fetch(url, {
      method: "PUT",
      headers: ghHeaders(),
      body: JSON.stringify({
        message: "publish dictionary",
        branch: BRANCH,
        sha: meta?.sha,
        content: b64(JSON.stringify(dict, null, 2))
      })
    });

    if (!putRes.ok) {
      const t = await putRes.text();
      throw new Error(t);
    }

    alert("🚀 Публичный словарь опубликован");

    /* ✅ ВАЖНО: БЕЗ reload */
    adminMode = false;
    localStorage.removeItem("githubToken");
    githubToken = "";

    setAdminUI(false);

    // загружаем ПУБЛИЧНЫЙ словарь
    const pubRes = await fetch(PUBLIC_PATH + "?v=" + Date.now());
    dict = await pubRes.json();
    words = dict.words || [];

    render();

  } catch (e) {
    console.error(e);
    alert("❌ Ошибка публикации:\n" + e.message);
  }
}

/* ================= AUDIO ================= */
function playWord(id){
  new Audio(`https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/audio/words/${id}.mp3`).play();
}
/* ================= SMART OFFLINE UPDATE ================= */

async function refreshDictionary() {
  try {
    const url = adminMode ? ADMIN_PATH : PUBLIC_PATH;

    // 1) тянем свежий словарь с сервера
    const res = await fetch(url + "?v=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("Не удалось загрузить словарь");

    const fresh = await res.json();

    // 2) сохраняем в Cache Storage (для офлайна)
    if ("caches" in window) {
      const cache = await caches.open("ingush-dictionary-v1");
      await cache.put(url, new Response(JSON.stringify(fresh)));
    }

    // 3) применяем в интерфейсе
    dict = fresh;
    words = dict.words || [];
    render();

    alert("✅ Словарь обновлён");

  } catch (e) {
    console.error(e);
    alert("❌ Ошибка обновления. Возможно, вы офлайн.");
  }
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
/* ================= AUDIO RECORD SYSTEM ================= */

// состояние записи
let recStream = null;
let mediaRecorder = null;
let recChunks = [];
let recBlob = null;
let recBlobUrl = null;

/* === кнопки === */
document.addEventListener("DOMContentLoaded", () => {
  const recBtn  = document.getElementById("rec-word-btn");
  const stopBtn = document.getElementById("stop-rec-btn");
  const playBtn = document.getElementById("play-rec-btn");
  const saveBtn = document.getElementById("save-rec-btn");

  if (!recBtn) return; // если модалка не на странице

  recBtn.onclick  = startRecording;
  stopBtn.onclick = stopRecording;
  playBtn.onclick = playRecorded;
  saveBtn.onclick = saveRecorded;
});

function setRecUI(state) {
  const recBtn  = document.getElementById("rec-word-btn");
  const stopBtn = document.getElementById("stop-rec-btn");
  const playBtn = document.getElementById("play-rec-btn");
  const saveBtn = document.getElementById("save-rec-btn");

  if (!recBtn) return;

  recBtn.disabled  = state !== "idle";
  stopBtn.disabled = state !== "recording";
  playBtn.disabled = !recBlob;
  saveBtn.disabled = !recBlob;
}

/* 🎤 старт */
async function startRecording() {
  if (!editingWord) return alert("Сначала открой слово");
  if (!githubToken) return alert("Нужен GitHub Token");

  try {
    recChunks = [];
    recBlob = null;
    recBlobUrl = null;

    recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(recStream);

    mediaRecorder.ondataavailable = e => {
      if (e.data.size) recChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      recBlob = new Blob(recChunks, { type: mediaRecorder.mimeType });
      recBlobUrl = URL.createObjectURL(recBlob);

      // 🔥 ОБЯЗАТЕЛЬНО выключаем микрофон
      recStream.getTracks().forEach(t => t.stop());
      recStream = null;

      setRecUI("idle");
    };

    mediaRecorder.start();
    setRecUI("recording");

  } catch (e) {
    alert("Ошибка микрофона: " + e.message);
    stopRecordingHard();
  }
}

/* ⏹ стоп */
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  }
}

/* ▶ прослушать */
function playRecorded() {
  if (!recBlobUrl) return alert("Нет записи");
  new Audio(recBlobUrl).play();
}

/* 💾 сохранить в GitHub */
async function saveRecorded() {
  if (!recBlob) return alert("Нет записи");
  if (!editingWord?.id) return alert("Нет слова");

  try {
    const buf = await recBlob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let b of bytes) bin += String.fromCharCode(b);
    const base64 = btoa(bin);

    const path = `audio/words/${editingWord.id}.mp3`;
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;

    let sha = null;
    const metaRes = await fetch(url, { headers: ghHeaders() });
    if (metaRes.ok) {
      const meta = await metaRes.json();
      sha = meta.sha;
    }

    const putRes = await fetch(url, {
      method: "PUT",
      headers: ghHeaders(),
      body: JSON.stringify({
        message: "add word audio",
        branch: BRANCH,
        sha,
        content: base64
      })
    });

    if (!putRes.ok) {
      const t = await putRes.text();
      throw new Error(t);
    }

    editingWord.audio = { word: true };
    await saveAdminDictionary();

    alert("🎧 Аудио сохранено в GitHub");
    setRecUI("idle");
    render();

  } catch (e) {
    console.error(e);
    alert("Ошибка сохранения аудио: " + e.message);
  }
}
