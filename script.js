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

let currentWord = null;

/* ================= UTF-8 BASE64 FIX ================= */
function b64ToUtf8(b64) {
  return decodeURIComponent(
    Array.prototype.map.call(atob(b64), c =>
      "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)
    ).join("")
  );
}

function utf8ToB64(str) {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
      (_, p1) => String.fromCharCode("0x" + p1)
    )
  );
}

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
        <div class="pill" onclick="playWord('${w.id}')">▶</div>
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
}

/* ================= AUDIO ================= */
function playWord(id) {
  const a = new Audio(`audio/words/${id}.mp3?v=${Date.now()}`);
  a.play().catch(() => alert("Нет аудио"));
}

/* ================= MODAL ================= */
function openEditWord(id) {
  currentWord = words.find(w => w.id === id);
  if (!currentWord) return;

  document.getElementById("modal-title").textContent = "Редактирование";

  document.getElementById("m-ru").value  = currentWord.ru || "";
  document.getElementById("m-pos").value = currentWord.pos || "";

  const sensesBox = document.getElementById("m-senses");
  sensesBox.innerHTML = "";
  (currentWord.senses || []).forEach(s => {
    addSense(s.ing);
  });

  openModal();
}

function addSense(val = "") {
  const box = document.getElementById("m-senses");
  const d = document.createElement("div");
  d.innerHTML = `<input class="input" value="${escapeHtml(val)}">`;
  box.appendChild(d);
}

function openModal() {
  document.getElementById("modal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal").classList.add("hidden");
  currentWord = null;
}

/* ================= SAVE ================= */
async function saveModal() {
  if (!currentWord) return;

  currentWord.ru  = document.getElementById("m-ru").value.trim();
  currentWord.pos = document.getElementById("m-pos").value.trim();

  const senses = [];
  document.querySelectorAll("#m-senses input").forEach(i => {
    if (i.value.trim()) senses.push({ ing: i.value.trim() });
  });
  currentWord.senses = senses;

  try {
    const file = await ghGetFile(ADMIN_PATH);
    file.data.words = words;

    await ghPutFile(ADMIN_PATH, file.data, file.sha);

    alert("Сохранено в GitHub");
    closeModal();
    loadDictionary();
  } catch (e) {
    console.error(e);
    alert("Ошибка сохранения: " + e.message);
  }
}

/* ================= GITHUB API ================= */
async function ghGetFile(path) {
  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`,
    {
      headers: {
        Authorization: "token " + githubToken,
        Accept: "application/vnd.github+json"
      }
    }
  );

  if (!res.ok) throw new Error("GitHub GET error");

  const j = await res.json();
  const json = JSON.parse(b64ToUtf8(j.content.replace(/\n/g, "")));

  return { sha: j.sha, data: json };
}

async function ghPutFile(path, data, sha) {
  const body = {
    message: "Update dictionary",
    content: utf8ToB64(JSON.stringify(data, null, 2)),
    sha
  };

  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`,
    {
      method: "PUT",
      headers: {
        Authorization: "token " + githubToken,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );

  if (!res.ok) {
    const t = await res.text();
    throw new Error(t);
  }
}
