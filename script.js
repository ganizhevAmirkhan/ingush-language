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

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded", () => {
  if (githubToken) {
    adminMode = true;
    setAdminUI(true);
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
    if (!res.ok) throw new Error("fetch failed");

    dict = await res.json();
    dict.words = Array.isArray(dict.words) ? dict.words : [];
    words = dict.words;

    render();
  } catch (e) {
    console.error(e);
    document.getElementById("list").innerHTML =
      "<b>Ошибка загрузки словаря</b>";
  }
}

/* ================= AUDIO RECORD ================= */
let mediaRecorder = null;
let mediaStream = null;
let audioChunks = [];

/* ▶ запись / стоп */
async function recordWord() {
  if (!editingWord) {
    alert("Сначала сохраните слово");
    return;
  }

  try {
    // если уже пишем — стоп
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      return;
    }

    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(mediaStream);
    audioChunks = [];

    mediaRecorder.ondataavailable = e => {
      if (e.data.size) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      try {
        const blob = new Blob(audioChunks, { type: "audio/webm" });
        const buffer = await blob.arrayBuffer();
        const base64 = btoa(
          String.fromCharCode(...new Uint8Array(buffer))
        );

        await uploadWordAudioToGitHub(base64, editingWord.id);
        alert("🎧 Аудио сохранено");
      } catch (e) {
        alert("Ошибка аудио: " + e.message);
      } finally {
        // 🔥 ОБЯЗАТЕЛЬНО выключаем микрофон
        if (mediaStream) {
          mediaStream.getTracks().forEach(t => t.stop());
        }
        mediaRecorder = null;
        mediaStream = null;
        audioChunks = [];
      }
    };

    mediaRecorder.start();
    alert("🎤 Запись идёт. Нажмите ещё раз, чтобы остановить");

  } catch (e) {
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
    }
    mediaRecorder = null;
    mediaStream = null;
    alert("Ошибка микрофона: " + e.message);
  }
}

/* ================= UPLOAD AUDIO TO GITHUB ================= */
async function uploadWordAudioToGitHub(base64Audio, id) {
  const path = `audio/words/${id}.mp3`;
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;

  const headers = {
    Authorization: "Bearer " + githubToken,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json"
  };

  // 1️⃣ проверяем, существует ли файл
  let sha = null;
  const check = await fetch(url, { headers });

  if (check.ok) {
    const meta = await check.json();
    sha = meta.sha;
  } else if (check.status !== 404) {
    throw new Error("Ошибка проверки файла аудио");
  }

  // 2️⃣ PUT create / update
  const body = {
    message: sha ? "update word audio" : "add word audio",
    content: base64Audio,
    branch: BRANCH
  };
  if (sha) body.sha = sha;

  const put = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify(body)
  });

  if (!put.ok) {
    const t = await put.text();
    throw new Error(t);
  }

  // 3️⃣ отмечаем в словаре
  editingWord.audio = { word: true };
  await saveToGitHub();
  render();
}


/* ================= ADMIN ================= */
function adminLogin() {
  const t = document.getElementById("gh-token").value.trim();
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

function setAdminUI(on) {
  document.getElementById("admin-status").textContent = on ? "✓ Админ" : "";
  document.getElementById("admin-logout").classList.toggle("hidden", !on);
  document.getElementById("add-word-btn").classList.toggle("hidden", !on);
  document.getElementById("publish-btn").classList.toggle("hidden", !on);
}

/* ================= AUDIO PLAY ================= */
function playWord(id) {
  const a = new Audio(
    `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/audio/words/${id}.mp3`
  );
  a.play().catch(() => alert("Нет аудио"));
}

/* ================= AUDIO RECORD ================= */
let mediaRecorder;
let audioChunks = [];

async function recordWord() {
  if (!editingWord) {
    alert("Сначала сохраните слово");
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  audioChunks = [];

  mediaRecorder.ondataavailable = e => audioChunks.push(e.data);

  mediaRecorder.onstop = async () => {
    const blob = new Blob(audioChunks, { type: "audio/mp3" });
    await uploadWordAudioToGitHub(blob, editingWord.id);
  };

  mediaRecorder.start();
  alert("Запись идёт… нажмите OK чтобы остановить");

  setTimeout(() => mediaRecorder.stop(), 3000);
}

async function uploadWordAudioToGitHub(blob, id) {
  const buffer = await blob.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(buffer).reduce(
      (data, byte) => data + String.fromCharCode(byte), ""
    )
  );

  const path = `audio/words/${id}.mp3`;
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: "token " + githubToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: `add audio for ${id}`,
      content: base64,
      branch: BRANCH
    })
  });

  if (!res.ok) {
    const t = await res.text();
    alert("Ошибка сохранения аудио:\n" + t);
    return;
  }

  editingWord.audio = { word: true };
  await saveToGitHub();
  render();
  alert("🎧 Аудио сохранено в GitHub");
}

/* ================= MODAL ================= */
function openModal() {
  document.getElementById("modal").classList.remove("hidden");
}
function closeModal() {
  document.getElementById("modal").classList.add("hidden");
}

/* ================= CREATE / EDIT ================= */
function openCreateWord() {
  editingWord = null;
  document.getElementById("modal-title").textContent = "Добавить слово";
  document.getElementById("m-ru").value = "";
  document.getElementById("m-pos").value = "";
  document.getElementById("m-senses").innerHTML = "";
  openModal();
}

function openEditWord(id) {
  const w = words.find(x => x.id === id);
  if (!w) return;

  editingWord = w;
  document.getElementById("modal-title").textContent = "Редактирование";
  document.getElementById("m-ru").value = w.ru || "";
  document.getElementById("m-pos").value = w.pos || "";

  const sensesBox = document.getElementById("m-senses");
  sensesBox.innerHTML = "";
  (w.senses || []).forEach(s => addSense(s.ing));

  openModal();
}

/* ================= SENSES ================= */
function addSense(val = "") {
  const box = document.getElementById("m-senses");
  const div = document.createElement("div");
  div.innerHTML = `<input class="input" value="${escapeHtml(val)}">`;
  box.appendChild(div);
}

/* ================= SAVE ================= */
async function saveModal() {
  const ru = document.getElementById("m-ru").value.trim();
  if (!ru) return alert("RU обязательно");

  const pos = document.getElementById("m-pos").value.trim();
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
  closeModal();
  render();
  alert("Сохранено");
}

/* ================= GITHUB SAVE ================= */
async function saveToGitHub() {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${ADMIN_PATH}`;
  const meta = await fetch(url, {
    headers: { Authorization: "token " + githubToken }
  }).then(r => r.json());

  const content = btoa(unescape(encodeURIComponent(
    JSON.stringify(dict, null, 2)
  )));

  await fetch(url, {
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
}
