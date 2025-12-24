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

let currentEditWord = null;

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
  const w = words.find(x => x.id === id);
  if (!w) return alert("Слово не найдено");

  currentEditWord = w;

  document.getElementById("m-ru").value  = w.ru || "";
  document.getElementById("m-pos").value = w.pos || "";

  const sensesBox = document.getElementById("m-senses");
  sensesBox.innerHTML = "";
  (w.senses || []).forEach(s => {
    const i = document.createElement("input");
    i.className = "input";
    i.value = s.ing || "";
    sensesBox.appendChild(i);
  });

  document.getElementById("modal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal").classList.add("hidden");
  currentEditWord = null;
}

/* ================= SAVE ================= */
async function saveModal() {
  if (!currentEditWord) return;

  currentEditWord.ru  = document.getElementById("m-ru").value.trim();
  currentEditWord.pos = document.getElementById("m-pos").value.trim();

  const senses = [...document.querySelectorAll("#m-senses input")]
    .map(i => i.value.trim())
    .filter(Boolean)
    .map(v => ({ ing: v }));

  currentEditWord.senses = senses;

  try {
    const { sha, data } = await ghGetFile(ADMIN_PATH);
    const idx = data.words.findIndex(w => w.id === currentEditWord.id);
    if (idx !== -1) data.words[idx] = currentEditWord;

    await ghPutFile(ADMIN_PATH, data, sha);

    alert("Сохранено в GitHub");
    closeModal();
    loadDictionary();
  } catch (e) {
    alert("Ошибка сохранения:\n" + e.message);
  }
}

/* ================= GITHUB API ================= */
async function ghGetFile(path) {
  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`,
    {
      headers: {
        "Authorization": "Bearer " + githubToken,
        "Accept": "application/vnd.github+json",
        "User-Agent": "ingush-dictionary-editor"
      }
    }
  );

  if (!res.ok) {
    const t = await res.text();
    throw new Error(res.status + " " + t);
  }

  const j = await res.json();
  const json = JSON.parse(decodeURIComponent(escape(atob(j.content.replace(/\n/g, "")))));

  return { sha: j.sha, data: json };
}

async function ghPutFile(path, data, sha) {
  const body = {
    message: "Update dictionary.admin.json",
    content: btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2)))),
    sha
  };

  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`,
    {
      method: "PUT",
      headers: {
        "Authorization": "Bearer " + githubToken,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "ingush-dictionary-editor"
      },
      body: JSON.stringify(body)
    }
  );

  if (!res.ok) {
    const t = await res.text();
    throw new Error(res.status + " " + t);
  }
}
