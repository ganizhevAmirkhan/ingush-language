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

const escapeHtml = (s = "") =>
  String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");

const base64EncodeUtf8 = (str) =>
  btoa(unescape(encodeURIComponent(str)));

const base64FromArrayBuffer = (buf) => {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

const authedHeaders = () => ({
  Authorization: "Bearer " + githubToken,
  Accept: "application/vnd.github+json"
});

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded", () => {
  adminMode = !!githubToken;
  setAdminUI(adminMode);

  $("search")?.addEventListener("input", e => {
    filterQ = e.target.value.toLowerCase().trim();
    render();
  });

  wireAudioButtons();
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
  const t = ($("gh-token")?.value || "").trim();
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

  stopRecordingHard();
  resetRecordedPreview();

  setAdminUI(false);
  loadDictionary();
}

/* ================= LOAD ================= */
async function loadDictionary() {
  const path = adminMode ? ADMIN_PATH : PUBLIC_PATH;

  try {
    const res = await fetch(path + "?v=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("Ошибка загрузки словаря: " + res.status);

    dict = await res.json();
    dict.version = dict.version || "3.0";
    dict.words = Array.isArray(dict.words) ? dict.words : [];

    words = dict.words;
    render();
  } catch (e) {
    console.error(e);
    alert("Ошибка загрузки словаря");
  }
}

/* ================= RENDER ================= */
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
  filtered.slice(0, 500).forEach(w => list.insertAdjacentHTML("beforeend", renderCard(w)));
}

function render() {
  const list = $("list");
  if (!list) return; // 🔴 ВАЖНО

  const filtered = words.filter(w =>
    !filterQ ||
    (w.ru||"").toLowerCase().includes(filterQ) ||
    (w.pos||"").toLowerCase().includes(filterQ) ||
    (w.senses||[]).some(s => (s.ing||"").toLowerCase().includes(filterQ))
  );

  const stats = $("stats");
  if (stats) {
    stats.textContent = `Слов: ${words.length} · Показано: ${filtered.length}`;
  }

  list.innerHTML = "";
  filtered.forEach(w => list.insertAdjacentHTML("beforeend", renderCard(w)));
}


/* ================= MODAL ================= */
function openModal(){ $("modal")?.classList.remove("hidden"); }

function closeModal(){
  $("modal")?.classList.add("hidden");

  // важно: не оставлять микрофон/запись
  stopRecordingHard();
  resetRecordedPreview();
}

function openCreateWord(){
  if (!adminMode) return alert("Нет админ-доступа");

  editingWord = null;
  $("modal-title").textContent = "Добавить слово";
  $("m-ru").value = "";
  $("m-pos").value = "";
  $("m-senses").innerHTML = "";
  addSense("");

  resetRecordedPreview();
  openModal();
}

function openEditWord(id){
  if (!adminMode) return alert("Нет админ-доступа");

  editingWord = words.find(w=>w.id===id);
  if (!editingWord) return;

  $("modal-title").textContent = "Редактирование";
  $("m-ru").value = editingWord.ru||"";
  $("m-pos").value = editingWord.pos||"";
  $("m-senses").innerHTML = "";
  (editingWord.senses||[]).forEach(s=>addSense(s.ing));
  if (!(editingWord.senses||[]).length) addSense("");

  resetRecordedPreview();
  openModal();
}

function addSense(val=""){
  const wrap = $("m-senses");
  if (!wrap) return;

  const d = document.createElement("div");
  d.innerHTML = `<input class="input" value="${escapeHtml(val)}">`;
  wrap.appendChild(d);
}

/* ================= SAVE WORD ================= */
async function saveModal(){
  try {
    if (!adminMode || !githubToken) return alert("Нет админ-доступа / токена");

    const ru = ($("m-ru")?.value || "").trim();
    if (!ru) return alert("RU обязательно");

    const senses = [...document.querySelectorAll("#m-senses input")]
      .map(i=>i.value.trim())
      .filter(Boolean)
      .map(ing=>({ing}));

    if (!senses.length) return alert("Нужен ING");

    if (!editingWord){
      editingWord = { id:"w_"+Math.random().toString(36).slice(2,9), audio:{word:false} };
      dict.words.push(editingWord);
    }

    editingWord.ru = ru;
    editingWord.pos = ($("m-pos")?.value || "").trim();
    editingWord.senses = senses;

    await saveAdminDictionary();

    closeModal();
    render();
    alert("✅ Сохранено");
  } catch (e) {
    console.error(e);
    alert("Ошибка сохранения: " + (e?.message || e));
  }
}

/* ================= GITHUB ================= */
async function saveAdminDictionary(){
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${ADMIN_PATH}`;

  const metaRes = await fetch(url, { headers: authedHeaders() });
  if (metaRes.status === 401) {
    throw new Error("401 Unauthorized — токен не принят GitHub (проверь scopes/срок/правильность)");
  }
  const meta = await metaRes.json();
  if (!meta?.sha) throw new Error("Не получил sha admin словаря");

  const putRes = await fetch(url, {
    method:"PUT",
    headers:{...authedHeaders(), "Content-Type":"application/json"},
    body: JSON.stringify({
      message:"update admin dictionary",
      sha: meta.sha,
      branch: BRANCH,
      content: base64EncodeUtf8(JSON.stringify(dict,null,2))
    })
  });

  if (!putRes.ok) {
    const t = await putRes.text();
    throw new Error("GitHub PUT error:\n" + t);
  }
}

async function publishToPublic(){
  if (!adminMode || !githubToken) {
    alert("Нет админ-доступа / токена");
    return;
  }

  if (!confirm("Опубликовать?")) return;

  try {
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PUBLIC_PATH}`;

    // 1️⃣ получаем sha публичного файла
    let sha = null;
    const metaRes = await fetch(url + `?ref=${encodeURIComponent(BRANCH)}`, {
      headers: authedHeaders()
    });

    if (metaRes.status !== 404) {
      const meta = await metaRes.json();
      sha = meta.sha;
    }

    // 2️⃣ PUT с sha
    const body = {
      message: "publish dictionary",
      branch: BRANCH,
      content: base64EncodeUtf8(JSON.stringify(dict, null, 2))
    };
    if (sha) body.sha = sha;

    const putRes = await fetch(url, {
      method: "PUT",
      headers: {
        ...authedHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!putRes.ok) {
      const t = await putRes.text();
      throw new Error(t);
    }

    alert("🚀 Публичный словарь опубликован");

    // ❗ ВАЖНО: НЕ вызываем render после logout
    adminLogout();
    location.reload();

  } catch (e) {
    console.error(e);
    alert("Ошибка публикации:\n" + e.message);
  }
}

/* ================= AUDIO: PLAY LIVE ================= */
function playWord(id){
  new Audio(`https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/audio/words/${id}.mp3?v=${Date.now()}`).play()
    .catch(()=>alert("Нет аудио"));
}

/* ================= AUDIO: RECORD SYSTEM (ЕДИНСТВЕННЫЙ) ================= */
/* ---- recording state ---- */
let recStream = null;
let mediaRecorder = null;
let recChunks = [];
let recBlob = null;
let recBlobUrl = null;

function wireAudioButtons(){
  $("rec-word-btn")?.addEventListener("click", startRecording);
  $("stop-rec-btn")?.addEventListener("click", stopRecording);
  $("play-rec-btn")?.addEventListener("click", playRecorded);
  $("save-rec-btn")?.addEventListener("click", saveRecordedAudioToGitHub);

  setAudioUI("idle");
}

function setAudioUI(state){
  const rec  = $("rec-word-btn");
  const stop = $("stop-rec-btn");
  const play = $("play-rec-btn");
  const save = $("save-rec-btn");

  if (!rec || !stop || !play || !save) return;

  if (state === "idle") {
    rec.disabled = !adminMode;
    stop.disabled = true;
    play.disabled = true;
    save.disabled = true;
  }

  if (state === "recording") {
    rec.disabled = true;
    stop.disabled = false;
    play.disabled = true;
    save.disabled = true;
  }

  if (state === "recorded") {
    rec.disabled = !adminMode;
    stop.disabled = true;
    play.disabled = false;
    save.disabled = false;
  }
}

function resetRecordedPreview(){
  recChunks = [];
  recBlob = null;

  if (recBlobUrl) {
    try { URL.revokeObjectURL(recBlobUrl); } catch {}
    recBlobUrl = null;
  }

  setAudioUI("idle");
}

async function startRecording(){
  try {
    if (!adminMode || !githubToken) return alert("Нужен админ и токен");
    if (!editingWord?.id) return alert("Сначала открой слово");

    resetRecordedPreview();

    recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(recStream);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      try {
        recBlob = new Blob(recChunks, { type: mediaRecorder.mimeType || "audio/webm" });
        recBlobUrl = URL.createObjectURL(recBlob);
      } finally {
        // ОБЯЗАТЕЛЬНО гасим микрофон
        stopStreamTracks();
        mediaRecorder = null;
        setAudioUI("recorded");
      }
    };

    mediaRecorder.start();
    setAudioUI("recording");
  } catch (e) {
    console.error(e);
    stopRecordingHard();
    resetRecordedPreview();
    alert("Ошибка записи: " + (e?.message || e));
  }
}

function stopRecording(){
  try {
    if (mediaRecorder?.state === "recording") {
      mediaRecorder.stop();
    }
  } catch (e) {
    console.error(e);
    stopRecordingHard();
    resetRecordedPreview();
    alert("Ошибка остановки: " + (e?.message || e));
  }
}

function playRecorded(){
  if (!recBlobUrl) return alert("Нет записи");
  new Audio(recBlobUrl).play().catch(()=>alert("Не удалось проиграть"));
}

function stopStreamTracks(){
  if (!recStream) return;
  recStream.getTracks().forEach(t => {
    try { t.stop(); } catch {}
  });
  recStream = null;
}

function stopRecordingHard(){
  try {
    if (mediaRecorder?.state === "recording") mediaRecorder.stop();
  } catch {}
  mediaRecorder = null;
  stopStreamTracks();
}

async function saveRecordedAudioToGitHub(){
  try {
    if (!adminMode || !githubToken) return alert("Нужен админ и токен");
    if (!editingWord?.id) return alert("Сначала открой слово");
    if (!recBlob) return alert("Сначала запиши аудио");

    const buf = await recBlob.arrayBuffer();
    const content = base64FromArrayBuffer(buf);

    const path = `audio/words/${editingWord.id}.mp3`;
    const url  = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;

    // sha если файл уже есть
    let sha = null;
    const metaRes = await fetch(url + `?ref=${encodeURIComponent(BRANCH)}`, { headers: authedHeaders() });
    if (metaRes.status !== 404) {
      const meta = await metaRes.json();
      sha = meta?.sha || null;
    }

    const body = {
      message: `add/update audio for ${editingWord.id}`,
      branch: BRANCH,
      content
    };
    if (sha) body.sha = sha;

    const putRes = await fetch(url, {
      method: "PUT",
      headers: { ...authedHeaders(), "Content-Type":"application/json" },
      body: JSON.stringify(body)
    });

    if (!putRes.ok) {
      const t = await putRes.text();
      throw new Error(t);
    }

    // отметим в JSON и сохраним admin словарь
    editingWord.audio = editingWord.audio || {};
    editingWord.audio.word = true;

    await saveAdminDictionary();

    alert("🎧 Аудио сохранено в GitHub");
    render();
    // после сохранения можно оставить запись доступной, но это ок:
    setAudioUI("recorded");
  } catch (e) {
    console.error(e);
    alert("Ошибка сохранения аудио:\n" + (e?.message || e));
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
