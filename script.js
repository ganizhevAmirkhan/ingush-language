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

/* ================= RENDER ================= */
function render() {
  const list = document.getElementById("list");
  const stats = document.getElementById("stats");
  if (!list) return;

  const filtered = words.filter(w => matchWord(w, filterQ));

  stats.textContent = `Слов: ${words.length} · Показано: ${filtered.length}`;
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
