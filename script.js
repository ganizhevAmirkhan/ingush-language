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

/* ---- recording state ---- */
let recStream = null;
let mediaRecorder = null;
let recChunks = [];
let recBlob = null;     // recorded blob (for preview + upload)
let recBlobUrl = null;  // object URL for preview

/* ================= HELPERS ================= */
const $ = (id) => document.getElementById(id);

function safeText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}
function safeToggleClass(id, cls, on) {
  const el = $(id);
  if (el) el.classList.toggle(cls, on);
}
function safeShow(id, show) {
  const el = $(id);
  if (!el) return;
  el.classList.toggle("hidden", !show);
}

function escapeHtml(s) {
  return (s || "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}

function base64EncodeUtf8(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function base64FromArrayBuffer(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function ghJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const txt = await res.text();
  let data = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { /* ignore */ }
  return { res, txt, data };
}

function authedHeaders() {
  if (!githubToken) return {};
  // GitHub API нормально принимает и token, и Bearer. Оставим Bearer.
  return {
    Authorization: "Bearer " + githubToken,
    Accept: "application/vnd.github+json"
  };
}

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded", () => {
  // admin mode if token exists
  if (githubToken) {
    adminMode = true;
    setAdminUI(true);
  } else {
    setAdminUI(false);
  }

  const search = $("search");
  if (search) {
    search.addEventListener("input", () => {
      filterQ = search.value.toLowerCase().trim();
      render();
    });
  }

  // если есть кнопки записи/прослушки/сейва — подготовим
  wireAudioButtons();

  loadDictionary();
});

/* ================= UI: ADMIN ================= */
function setAdminUI(on) {
  safeText("admin-status", on ? "✓ Админ" : "");
  safeShow("admin-logout", on);
  safeShow("add-word-btn", on);
  safeShow("publish-btn", on);
}

function adminLogin() {
  const inp = $("gh-token");
  const t = (inp ? inp.value : "").trim();
  if (!t) return alert("Введите GitHub Token");

  githubToken = t;
  localStorage.setItem("githubToken", t);
  adminMode = true;

  setAdminUI(true);
  loadDictionary();
}

function adminLogout() {
  adminMode = false;
  githubToken = "";
  localStorage.removeItem("githubToken");

  // на всякий — остановим запись, если была
  stopRecordingHard();

  setAdminUI(false);
  loadDictionary();
}

/* ================= LOAD ================= */
async function loadDictionary() {
  const path = adminMode ? ADMIN_PATH : PUBLIC_PATH;

  try {
    const res = await fetch(path + "?v=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);

    dict = await res.json();
    dict.version = dict.version || "3.0";
    dict.words = Array.isArray(dict.words) ? dict.words : [];

    words = dict.words;
    render();
  } catch (e) {
    console.error(e);
    const list = $("list");
    if (list) list.innerHTML = "<b>Ошибка загрузки словаря</b>";
  }
}

/* ================= RENDER ================= */
function matchWord(w, q) {
  if (!q) return true;
  const ru  = (w.ru || "").toLowerCase();
  const pos = (w.pos || "").toLowerCase();
  const ing = (w.senses || []).map(s => s.ing).join(" ").toLowerCase();
  return ru.includes(q) || ing.includes(q) || pos.includes(q);
}

function render() {
  const list = $("list");
  const stats = $("stats");
  if (!list) return;

  const filtered = words.filter(w => matchWord(w, filterQ));

  if (stats) stats.textContent = `Слов: ${words.length} · Показано: ${filtered.length}`;
  list.innerHTML = "";

  filtered.slice(0, 500).forEach(w => {
    list.insertAdjacentHTML("beforeend", renderCard(w));
  });
}

function renderCard(w) {
  const senses = (w.senses || [])
    .map(s => `• ${escapeHtml(s.ing)}`)
    .join("<br>");

  const hasAudio = !!(w.audio && w.audio.word);

  return `
  <div class="card">
    <div class="cardTop">
      <div>
        <div class="wordRu">${escapeHtml(w.ru)}</div>
        <div class="pos">${escapeHtml(w.pos || "")}</div>
      </div>
      <div class="row">
        ${
          hasAudio
            ? `<button class="pill" onclick="playWord('${w.id}')">▶</button>`
            : `<button class="pill disabled" disabled>—</button>`
        }
        ${adminMode ? `<button class="pill" onclick="openEditWord('${w.id}')">✏</button>` : ""}
      </div>
    </div>
    <div class="ingLine">${senses || "<span class='muted'>Нет перевода</span>"}</div>
  </div>`;
}

/* ================= MODAL ================= */
function openModal() {
  const m = $("modal");
  if (m) m.classList.remove("hidden");
}

function closeModal() {
  const m = $("modal");
  if (m) m.classList.add("hidden");

  // при закрытии — не оставляем активную запись
  stopRecordingHard();

  // сбрасываем временную запись
  resetRecordedPreview();
}

function openCreateWord() {
  if (!adminMode) return alert("Нужен админ режим");
  editingWord = null;

  const t = $("modal-title"); if (t) t.textContent = "Добавить слово";
  const ru = $("m-ru"); if (ru) ru.value = "";
  const pos = $("m-pos"); if (pos) pos.value = "";

  const senses = $("m-senses"); if (senses) senses.innerHTML = "";
  addSense("");

  resetRecordedPreview();
  openModal();
}

function openEditWord(id) {
  if (!adminMode) return alert("Нужен админ режим");

  const w = words.find(x => x.id === id);
  if (!w) return;

  editingWord = w;

  const t = $("modal-title"); if (t) t.textContent = "Редактирование";
  const ru = $("m-ru"); if (ru) ru.value = w.ru || "";
  const pos = $("m-pos"); if (pos) pos.value = w.pos || "";

  const sensesBox = $("m-senses");
  if (sensesBox) {
    sensesBox.innerHTML = "";
    (w.senses || []).forEach(s => addSense(s.ing));
    if (!(w.senses || []).length) addSense("");
  }

  // подготовка live play кнопки (если уже есть аудио)
  syncLivePlayButton();

  resetRecordedPreview();
  openModal();
}

function addSense(val = "") {
  const box = $("m-senses");
  if (!box) return;

  const div = document.createElement("div");
  div.innerHTML = `<input class="input" value="${escapeHtml(val)}">`;
  box.appendChild(div);
}

/* ================= SAVE WORD (JSON) ================= */
async function saveModal() {
  try {
    if (!adminMode || !githubToken) {
      alert("Нет токена / не админ режим");
      return;
    }

    const ru = ($("m-ru")?.value || "").trim();
    if (!ru) return alert("RU обязательно");

    const pos = ($("m-pos")?.value || "").trim();

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

    // если перед этим записали и УЖЕ сохранили аудио — audio.word будет true
    if (!editingWord.audio) editingWord.audio = { word: false };

    await saveAdminDictionaryToGitHub(dict);

    render();
    closeModal();
    alert("✅ Сохранено в GitHub (admin словарь)");
  } catch (e) {
    console.error(e);
    alert("❌ Ошибка сохранения: " + (e?.message || e));
  }
}

async function getFileSha(path) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${encodeURIComponent(BRANCH)}`;
  const { res, txt, data } = await ghJson(url, { headers: authedHeaders() });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Не удалось получить SHA для ${path}:\n${txt}`);
  return data?.sha || null;
}

async function putFile(path, contentBase64, message) {
  const sha = await getFileSha(path);

  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;
  const body = {
    message,
    content: contentBase64,
    branch: BRANCH
  };
  if (sha) body.sha = sha;

  const { res, txt } = await ghJson(url, {
    method: "PUT",
    headers: {
      ...authedHeaders(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error(`GitHub PUT error (${path}):\n${txt}`);
}

async function saveAdminDictionaryToGitHub(d) {
  // проверка токена, чтобы сразу видеть 401
  const me = await fetch("https://api.github.com/user", { headers: authedHeaders() });
  if (!me.ok) {
    const t = await me.text();
    throw new Error("Токен невалидный / нет доступа:\n" + t);
  }

  const content = base64EncodeUtf8(JSON.stringify(d, null, 2));
  await putFile(ADMIN_PATH, content, "Update admin dictionary via UI");
}

/* ================= PUBLISH ================= */
async function publishToPublic() {
  if (!adminMode || !githubToken) return alert("Нет прав администратора");
  if (!confirm("Опубликовать изменения в публичный словарь?")) return;

  try {
    // 1) загружаем admin словарь с сайта (самый свежий)
    const adminRes = await fetch(ADMIN_PATH + "?v=" + Date.now(), { cache: "no-store" });
    if (!adminRes.ok) throw new Error("Не удалось загрузить admin словарь");
    const adminDict = await adminRes.json();

    // 2) чистим слова
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

    // 3) сохраняем в public/dictionary.json
    const content = base64EncodeUtf8(JSON.stringify(publicDict, null, 2));
    await putFile(PUBLIC_PATH, content, "publish: update public dictionary");

    alert("✅ Публичный словарь опубликован!");

    // выйти из админки и перезагрузить публичный режим
    adminLogout();
    location.reload();
  } catch (e) {
    console.error(e);
    alert("❌ Ошибка публикации:\n\n" + (e?.message || e));
  }
}

/* ================= AUDIO: PLAY (LIVE) ================= */
function playWord(id) {
  // raw github — мгновенно отдаёт файл
  const url = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/audio/words/${id}.mp3?v=${Date.now()}`;
  const a = new Audio(url);
  a.play().catch(() => alert("Нет аудио"));
}

function syncLivePlayButton() {
  const btn = $("play-live-btn");
  if (!btn) return;
  const has = !!(editingWord && editingWord.audio && editingWord.audio.word);
  btn.disabled = !has;
  btn.classList.toggle("disabled", !has);
}

/* ================= AUDIO: RECORD → PREVIEW → SAVE ================= */
function wireAudioButtons() {
  // Кнопки в модалке (если есть)
  const recBtn = $("rec-word-btn");
  const playRecBtn = $("play-rec-btn");
  const saveRecBtn = $("save-rec-btn");

  if (recBtn) {
    recBtn.addEventListener("click", async () => {
      // toggle: start/stop
      if (mediaRecorder && mediaRecorder.state === "recording") {
        await stopRecording();
      } else {
        await startRecording();
      }
    });
  }

  if (playRecBtn) {
    playRecBtn.addEventListener("click", () => {
      if (!recBlobUrl) return alert("Сначала сделайте запись");
      const a = new Audio(recBlobUrl);
      a.play().catch(() => alert("Не удалось проиграть запись"));
    });
  }

  if (saveRecBtn) {
    saveRecBtn.addEventListener("click", async () => {
      await saveRecordedAudioToGitHub();
    });
  }

  // состояние кнопок по умолчанию
  setRecordButtonsState("idle");
}

function setRecordButtonsState(state) {
  const recBtn = $("rec-word-btn");
  const playRecBtn = $("play-rec-btn");
  const saveRecBtn = $("save-rec-btn");

  if (recBtn) {
    if (state === "recording") {
      recBtn.textContent = "⏹ Стоп";
      recBtn.classList.add("danger");
    } else {
      recBtn.textContent = "🎤 Записать";
      recBtn.classList.remove("danger");
    }
    recBtn.disabled = !adminMode; // в публичном режиме запись запрещаем
  }

  if (playRecBtn) {
    playRecBtn.disabled = !(recBlobUrl);
    playRecBtn.classList.toggle("disabled", playRecBtn.disabled);
  }

  if (saveRecBtn) {
    saveRecBtn.disabled = !(recBlob);
    saveRecBtn.classList.toggle("disabled", saveRecBtn.disabled);
  }
}

function resetRecordedPreview() {
  recChunks = [];
  recBlob = null;

  if (recBlobUrl) {
    URL.revokeObjectURL(recBlobUrl);
    recBlobUrl = null;
  }

  setRecordButtonsState("idle");
}

async function startRecording() {
  try {
    if (!adminMode || !githubToken) return alert("Нужен админ режим и токен");
    if (!editingWord) return alert("Сначала откройте слово для редактирования");
    if (!editingWord.id) return alert("Нет id слова");

    resetRecordedPreview();

    recStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // MediaRecorder чаще всего отдаёт webm/opus, но мы сохраняем как .mp3 (как у тебя принято).
    // GitHub хранит байты, а браузер при проигрывании обычно справляется.
    mediaRecorder = new MediaRecorder(recStream);

    recChunks = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      // собираем blob
      recBlob = new Blob(recChunks, { type: mediaRecorder.mimeType || "audio/webm" });
      recBlobUrl = URL.createObjectURL(recBlob);

      // ВАЖНО: выключаем микрофон (иначе индикатор висит)
      stopStreamTracks();

      setRecordButtonsState("idle");
    };

    mediaRecorder.start();
    setRecordButtonsState("recording");
  } catch (e) {
    console.error(e);
    stopRecordingHard();
    alert("❌ Не удалось начать запись: " + (e?.message || e));
  }
}

async function stopRecording() {
  try {
    if (!mediaRecorder) return;
    if (mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      // onstop сам всё доделает и выключит микрофон
    } else {
      stopRecordingHard();
    }
  } catch (e) {
    console.error(e);
    stopRecordingHard();
    alert("❌ Ошибка остановки записи: " + (e?.message || e));
  }
}

function stopStreamTracks() {
  if (recStream) {
    recStream.getTracks().forEach(t => {
      try { t.stop(); } catch {}
    });
    recStream = null;
  }
}

function stopRecordingHard() {
  try {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
  } catch {}
  mediaRecorder = null;
  stopStreamTracks();
  setRecordButtonsState("idle");
}

async function saveRecordedAudioToGitHub() {
  try {
    if (!adminMode || !githubToken) return alert("Нужен админ режим и токен");
    if (!editingWord || !editingWord.id) return alert("Сначала откройте слово");
    if (!recBlob) return alert("Сначала сделайте запись");

    // 1) blob -> base64
    const buf = await recBlob.arrayBuffer();
    const base64 = base64FromArrayBuffer(buf);

    // 2) PUT audio file (с sha, если уже есть)
    const audioPath = `audio/words/${editingWord.id}.mp3`;
    await putFile(audioPath, base64, `add/update audio for ${editingWord.id}`);

    // 3) отмечаем в словаре, что аудио есть + сохраняем admin json
    if (!editingWord.audio) editingWord.audio = {};
    editingWord.audio.word = true;

    await saveAdminDictionaryToGitHub(dict);

    // 4) обновляем UI
    render();
    syncLivePlayButton();
    setRecordButtonsState("idle");

    alert("🎧 Аудио сохранено в GitHub");
  } catch (e) {
    console.error(e);
    alert("❌ Ошибка сохранения аудио:\n\n" + (e?.message || e));
  }
}

/* ================= OPTIONAL: LIVE PLAY BUTTON IN MODAL ================= */
function playWordAudio() {
  if (!editingWord?.id) return alert("Нет слова");
  playWord(editingWord.id);
}

/* ================= TOKEN CLEAR (helper for you) =================
   Можно вызвать в Console: clearGithubToken()
*/
function clearGithubToken() {
  localStorage.removeItem("githubToken");
  alert("Токен удалён из браузера. Обновите страницу (F5).");
}

/* ================= EXPOSE FUNCTIONS FOR HTML onclick ================= */
window.adminLogin = adminLogin;
window.adminLogout = adminLogout;
window.openCreateWord = openCreateWord;
window.openEditWord = openEditWord;
window.closeModal = closeModal;
window.saveModal = saveModal;
window.publishToPublic = publishToPublic;

window.playWord = playWord;
window.playWordAudio = playWordAudio;
window.clearGithubToken = clearGithubToken;
