/* ================= CONFIG ================= */
const OWNER  = "ganizhevAmirkhan";
const REPO   = "ingush-language";
const BRANCH = "main";

const PUBLIC_PATH = "public/dictionary.json";
const ADMIN_PATH  = "admin/dictionary.admin.json";

/* ================= STATE ================= */
let dict = { words: [] };
let words = [];
let filterQ = "";
let adminMode = false;
let githubToken = localStorage.getItem("githubToken");
let editingWord = null;

/* ============== AUDIO RECORD STATE ============== */
let recStream = null;
let rec = null;
let recChunks = [];
let recBlob = null;

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded", () => {
  if (githubToken) {
    adminMode = true;
    setAdminUI(true);
  } else {
    setAdminUI(false);
  }

  const search = document.getElementById("search");
  if (search) {
    search.addEventListener("input", () => {
      filterQ = search.value.toLowerCase().trim();
      render();
    });
  }

  loadDictionary();
});

/* ================= LOAD ================= */
async function loadDictionary() {
  const path = adminMode ? ADMIN_PATH : PUBLIC_PATH;

  try {
    const res = await fetch(path + "?v=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("fetch failed: " + res.status);

    dict = await res.json();
    dict.words = Array.isArray(dict.words) ? dict.words : [];
    words = dict.words;

    render();
  } catch (e) {
    console.error(e);
    const list = document.getElementById("list");
    if (list) list.innerHTML = "<b>Ошибка загрузки словаря</b>";
  }
}

/* ================= RENDER ================= */
function render() {
  const list = document.getElementById("list");
  const stats = document.getElementById("stats");
  if (!list) return;

  const filtered = words.filter(w => matchWord(w, filterQ));

  if (stats) stats.textContent = `Слов: ${words.length} · Показано: ${filtered.length}`;
  list.innerHTML = "";

  filtered.slice(0, 500).forEach(w => {
    list.insertAdjacentHTML("beforeend", renderCard(w));
  });
}

function matchWord(w, q) {
  if (!q) return true;
  const ru  = (w.ru || "").toLowerCase();
  const pos = (w.pos || "").toLowerCase();
  const ing = (w.senses || []).map(s => s.ing).join(" ").toLowerCase();
  return ru.includes(q) || ing.includes(q) || pos.includes(q);
}

function renderCard(w) {
  const senses = (w.senses || [])
    .map(s => `• ${escapeHtml(s.ing)}`)
    .join("<br>");

  return `
  <div class="card">
    <div class="cardTop">
      <div>
        <div class="wordRu">${escapeHtml(w.ru)}</div>
        <div class="pos">${escapeHtml(w.pos || "")}</div>
      </div>
      <div class="row">
        ${
          w.audio?.word
            ? `<div class="pill" onclick="playWord('${w.id}')">▶</div>`
            : `<div class="pill disabled">—</div>`
        }
        ${adminMode ? `<div class="pill" onclick="openEditWord('${w.id}')">✏</div>` : ""}
      </div>
    </div>
    <div class="ingLine">${senses || "<span class='muted'>Нет перевода</span>"}</div>
  </div>`;
}

function escapeHtml(s) {
  return (s || "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}

/* ================= ADMIN ================= */
function adminLogin() {
  const inp = document.getElementById("gh-token");
  const t = (inp ? inp.value : "").trim();
  if (!t) return alert("Введите GitHub Token");

  githubToken = t;
  adminMode = true;
  localStorage.setItem("githubToken", t);

  setAdminUI(true);
  loadDictionary();
}

function adminLogout() {
  adminMode = false;
  githubToken = null;
  localStorage.removeItem("githubToken");

  setAdminUI(false);
  loadDictionary();
}

/* важно: НЕ падать если какого-то элемента нет */
function setAdminUI(on) {
  const s = document.getElementById("admin-status");
  const lo = document.getElementById("admin-logout");
  const add = document.getElementById("add-word-btn");
  const pub = document.getElementById("publish-btn");

  if (s) s.textContent = on ? "✓ Админ" : "";
  if (lo) lo.classList.toggle("hidden", !on);
  if (add) add.classList.toggle("hidden", !on);
  if (pub) pub.classList.toggle("hidden", !on);
}

/* ================= AUDIO PLAY (PUBLIC) ================= */
async function playWord(id) {
  // сначала пробуем mp3 (старые записи), потом webm (новые)
  const tryPlay = (url) => new Promise((resolve, reject) => {
    const a = new Audio(url + "?v=" + Date.now());
    a.oncanplay = () => a.play().then(resolve).catch(reject);
    a.onerror = reject;
  });

  const mp3 = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/audio/words/${id}.mp3`;
  const webm = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/audio/words/${id}.webm`;

  try {
    await tryPlay(mp3);
  } catch {
    try {
      await tryPlay(webm);
    } catch {
      alert("Нет аудио");
    }
  }
}

/* ================= MODAL ================= */
function openModal() {
  const m = document.getElementById("modal");
  if (m) m.classList.remove("hidden");
}
function closeModal() {
  stopRecorderSafe();
  const m = document.getElementById("modal");
  if (m) m.classList.add("hidden");
}

/* ================= CREATE / EDIT ================= */
function openCreateWord() {
  editingWord = null;

  const title = document.getElementById("modal-title");
  if (title) title.textContent = "Добавить слово";

  const ru = document.getElementById("m-ru");
  const pos = document.getElementById("m-pos");
  const senses = document.getElementById("m-senses");
  const ex = document.getElementById("m-examples");

  if (ru) ru.value = "";
  if (pos) pos.value = "";
  if (senses) senses.innerHTML = "";
  if (ex) ex.innerHTML = "";

  recBlob = null;
  openModal();
  ensureAudioButtons();
}

function openEditWord(id) {
  const w = words.find(x => x.id === id);
  if (!w) return;

  editingWord = w;

  const title = document.getElementById("modal-title");
  if (title) title.textContent = "Редактирование";

  const ru = document.getElementById("m-ru");
  const pos = document.getElementById("m-pos");
  const sensesBox = document.getElementById("m-senses");
  const ex = document.getElementById("m-examples");

  if (ru) ru.value = w.ru || "";
  if (pos) pos.value = w.pos || "";

  if (sensesBox) {
    sensesBox.innerHTML = "";
    (w.senses || []).forEach(s => addSense(s.ing));
  }

  if (ex) ex.innerHTML = "";

  recBlob = null;
  openModal();
  ensureAudioButtons();
}

/* ================= SENSES ================= */
function addSense(val = "") {
  const box = document.getElementById("m-senses");
  if (!box) return;
  const div = document.createElement("div");
  div.innerHTML = `<input class="input" value="${escapeHtml(val)}">`;
  box.appendChild(div);
}

/* ================= SAVE WORD (TEXT) ================= */
async function saveModal() {
  try {
    const ruEl = document.getElementById("m-ru");
    const posEl = document.getElementById("m-pos");

    const ru = (ruEl ? ruEl.value : "").trim();
    if (!ru) return alert("RU обязательно");

    const pos = (posEl ? posEl.value : "").trim();
    const senses = [...document.querySelectorAll("#m-senses input")]
      .map(i => i.value.trim())
      .filter(Boolean)
      .map(ing => ({ ing }));

    if (!senses.length) return alert("Нужен хотя бы 1 ING");

    if (!editingWord) {
      editingWord = {
        id: "w_" + Math.random().toString(36).slice(2, 10),
        audio: { word: false },
        source: "admin"
      };
      dict.words.push(editingWord);
    }

    editingWord.ru = ru;
    editingWord.pos = pos;
    editingWord.senses = senses;

    await saveToGitHub();
    render();
    alert("Сохранено в GitHub");
  } catch (e) {
    console.error(e);
    alert("Ошибка сохранения: " + (e?.message || e));
  }
}

/* ================= GITHUB SAVE DICTIONARY ================= */
async function saveToGitHub() {
  if (!githubToken) throw new Error("Нет GitHub token");

  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${ADMIN_PATH}`;

  const metaRes = await fetch(url, {
    headers: { Authorization: "token " + githubToken }
  });
  if (!metaRes.ok) throw new Error("GitHub auth / meta error: " + metaRes.status);

  const meta = await metaRes.json();

  const content = btoa(unescape(encodeURIComponent(
    JSON.stringify(dict, null, 2)
  )));

  const putRes = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: "token " + githubToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: "update dictionary",
      content,
      sha: meta.sha,
      branch: BRANCH
    })
  });

  if (!putRes.ok) throw new Error(await putRes.text());
}

/* ================= PUBLISH ================= */
async function publishToPublic() {
  if (!adminMode || !githubToken) {
    alert("Нет прав администратора");
    return;
  }
  if (!confirm("Опубликовать изменения в публичный словарь?")) return;

  const headers = {
    Authorization: "token " + githubToken,
    "Content-Type": "application/json",
    Accept: "application/vnd.github+json",
  };

  try {
    const adminRes = await fetch(ADMIN_PATH + "?v=" + Date.now(), { cache: "no-store" });
    if (!adminRes.ok) throw new Error("Не удалось загрузить admin словарь");

    const adminDict = await adminRes.json();

    const cleanWords = (adminDict.words || []).filter(w =>
      w &&
      (w.ru || "").trim() &&
      Array.isArray(w.senses) &&
      w.senses.some(s => (s.ing || "").trim())
    );

    const publicDict = {
      version: adminDict.version || "3.0",
      words: cleanWords
    };

    const metaUrl =
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PUBLIC_PATH}?ref=${encodeURIComponent(BRANCH)}`;

    let sha = null;
    const metaRes = await fetch(metaUrl, { headers });
    if (metaRes.status === 404) sha = null;
    else if (!metaRes.ok) throw new Error(await metaRes.text());
    else sha = (await metaRes.json()).sha;

    const putUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PUBLIC_PATH}`;

    const body = {
      message: sha ? "publish: update public dictionary" : "publish: create public dictionary",
      branch: BRANCH,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(publicDict, null, 2))))
    };
    if (sha) body.sha = sha;

    const putRes = await fetch(putUrl, {
      method: "PUT",
      headers,
      body: JSON.stringify(body)
    });

    if (!putRes.ok) throw new Error(await putRes.text());

    alert("✅ Публичный словарь опубликован!");
    adminLogout();
    location.reload();
  } catch (e) {
    console.error(e);
    alert("❌ Ошибка публикации:\n\n" + (e?.message || e));
  }
}

/* ================= AUDIO UI (inject buttons) ================= */
function ensureAudioButtons() {
  // ожидаем что на странице есть кнопка записи:
  // <button id="rec-word-btn" onclick="recordWord()">🎤 Записать</button>
  const recBtn = document.getElementById("rec-word-btn");
  if (!recBtn) return; // если разметка другая — не ломаем

  // если уже добавляли — не повторяем
  if (document.getElementById("play-rec-btn") && document.getElementById("save-rec-btn")) return;

  // вставим рядом две кнопки: PLAY и SAVE
  const playBtn = document.createElement("button");
  playBtn.className = recBtn.className;
  playBtn.id = "play-rec-btn";
  playBtn.textContent = "▶ Прослушать";
  playBtn.disabled = true;
  playBtn.onclick = playRecordedLocal;

  const saveBtn = document.createElement("button");
  saveBtn.className = recBtn.className;
  saveBtn.id = "save-rec-btn";
  saveBtn.textContent = "💾 Сохранить";
  saveBtn.disabled = true;
  saveBtn.onclick = saveRecordedToGitHub;

  recBtn.insertAdjacentElement("afterend", saveBtn);
  recBtn.insertAdjacentElement("afterend", playBtn);
}

/* ================= RECORD / PLAY / SAVE ================= */
async function recordWord() {
  if (!editingWord) {
    alert("Сначала сохраните слово (кнопка Сохранить)");
    return;
  }
  if (!githubToken) {
    alert("Нужен GitHub Token (в админке)");
    return;
  }

  // если запись уже идёт — остановим
  if (rec && rec.state === "recording") {
    rec.stop();
    return;
  }

  recBlob = null;
  recChunks = [];

  const playBtn = document.getElementById("play-rec-btn");
  const saveBtn = document.getElementById("save-rec-btn");
  if (playBtn) playBtn.disabled = true;
  if (saveBtn) saveBtn.disabled = true;

  try {
    recStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // webm/opus — то, что реально пишется в браузере стабильно
    rec = new MediaRecorder(recStream, { mimeType: "audio/webm;codecs=opus" });

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recChunks.push(e.data);
    };

    rec.onstop = () => {
      try {
        recBlob = new Blob(recChunks, { type: "audio/webm" });
      } catch {
        recBlob = null;
      }

      stopTracksSafe();

      if (recBlob && recBlob.size > 0) {
        if (playBtn) playBtn.disabled = false;
        if (saveBtn) saveBtn.disabled = false;
      } else {
        alert("Запись пустая (нет данных).");
      }
    };

    rec.start();
    // запись 3 сек, потом сама остановится
    setTimeout(() => {
      if (rec && rec.state === "recording") rec.stop();
    }, 3000);

    alert("🔴 Запись 3 секунды… Нажмите OK");

  } catch (e) {
    console.error(e);
    stopTracksSafe();
    alert("Ошибка записи: " + (e?.message || e));
  }
}

function playRecordedLocal() {
  if (!recBlob) return alert("Нет записи");
  const url = URL.createObjectURL(recBlob);
  const a = new Audio(url);
  a.play().catch(() => alert("Не удалось воспроизвести"));
  a.onended = () => URL.revokeObjectURL(url);
}

async function saveRecordedToGitHub() {
  if (!recBlob) return alert("Нет записи");
  if (!editingWord) return alert("Нет выбранного слова");
  if (!githubToken) return alert("Нет токена GitHub");

  try {
    await uploadAudioFile(recBlob, editingWord.id);

    // помечаем в словаре, что аудио есть
    if (!editingWord.audio) editingWord.audio = {};
    editingWord.audio.word = true;

    await saveToGitHub();
    render();

    // сброс локальной записи, чтобы не путаться
    recBlob = null;
    const playBtn = document.getElementById("play-rec-btn");
    const saveBtn = document.getElementById("save-rec-btn");
    if (playBtn) playBtn.disabled = true;
    if (saveBtn) saveBtn.disabled = true;

    alert("✅ Аудио сохранено в GitHub");
  } catch (e) {
    console.error(e);
    alert("Ошибка сохранения аудио:\n" + (e?.message || e));
  }
}

/* upload with SHA (update or create) */
async function uploadAudioFile(blob, id) {
  const path = `audio/words/${id}.webm`;
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;

  const base64 = await blobToBase64(blob);

  // узнаем sha если файл уже есть
  let sha = null;
  const metaRes = await fetch(url + `?ref=${encodeURIComponent(BRANCH)}`, {
    headers: { Authorization: "token " + githubToken }
  });

  if (metaRes.status === 200) {
    const meta = await metaRes.json();
    sha = meta.sha;
  } else if (metaRes.status === 404) {
    sha = null; // создаём новый
  } else {
    throw new Error(await metaRes.text());
  }

  const body = {
    message: sha ? `update audio ${id}` : `add audio ${id}`,
    content: base64,
    branch: BRANCH
  };
  if (sha) body.sha = sha;

  const putRes = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: "token " + githubToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!putRes.ok) throw new Error(await putRes.text());
}

async function blobToBase64(blob) {
  const buf = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/* ================= SAFE STOP ================= */
function stopTracksSafe() {
  try {
    if (recStream) {
      recStream.getTracks().forEach(t => t.stop());
    }
  } catch {}
  recStream = null;
}

function stopRecorderSafe() {
  try {
    if (rec && rec.state === "recording") rec.stop();
  } catch {}
  stopTracksSafe();
}

/* ================= EXPORT to window (IMPORTANT) ================= */
/* чтобы onclick="..." всегда работал даже если script подключён как module */
window.adminLogin = adminLogin;
window.adminLogout = adminLogout;
window.openCreateWord = openCreateWord;
window.openEditWord = openEditWord;
window.closeModal = closeModal;
window.saveModal = saveModal;
window.addSense = addSense;
window.playWord = playWord;
window.publishToPublic = publishToPublic;

/* аудио */
window.recordWord = recordWord;
window.playRecordedLocal = playRecordedLocal;
window.saveRecordedToGitHub = saveRecordedToGitHub;
