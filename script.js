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
let githubToken = localStorage.getItem("githubToken") || null;
let editingId = null;

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded", () => {
  if (githubToken) {
    adminMode = true;
    setAdminUI(true);
  }

  const search = document.getElementById("search");
  search.addEventListener("input", () => {
    filterQ = search.value.toLowerCase().trim();
    render();
  });

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
    document.getElementById("list").innerHTML = "<b>Ошибка загрузки словаря</b>";
  }
}

/* ================= RENDER ================= */
function render() {
  const list = document.getElementById("list");
  const stats = document.getElementById("stats");

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
  const senses = (w.senses || []).map(s => `• ${escapeHtml(s.ing)}`).join("<br>");

  return `
  <div class="card">
    <div class="cardTop">
      <div>
        <div class="wordRu">${escapeHtml(w.ru)}</div>
        <div class="pos">${escapeHtml(w.pos || "")}</div>
      </div>
      <div class="row">
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

/* ================= MODAL ================= */
function openCreateWord() {
  const id = "w_" + Date.now();
  const w = {
    id,
    ru: "",
    pos: "",
    senses: [{ ing: "" }]
  };
  words.unshift(w);
  dict.words = words;
  openEditWord(id);
}

function openEditWord(id) {
  editingId = id;
  const w = words.find(x => x.id === id);
  if (!w) return;

  document.getElementById("m-ru").value = w.ru || "";
  document.getElementById("m-pos").value = w.pos || "";

  const sensesBox = document.getElementById("m-senses");
  sensesBox.innerHTML = "";
  w.senses.forEach((s, i) => {
    sensesBox.insertAdjacentHTML("beforeend", `
      <input class="input" value="${escapeHtml(s.ing)}"
        oninput="onSenseInput(${i}, this.value)" />
    `);
  });

  document.getElementById("modal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal").classList.add("hidden");
  editingId = null;
}

function onSenseInput(i, val) {
  const w = words.find(x => x.id === editingId);
  if (w) w.senses[i].ing = val;
}

function addSense() {
  const w = words.find(x => x.id === editingId);
  if (!w) return;
  w.senses.push({ ing: "" });
  openEditWord(editingId);
}

/* ================= SAVE ================= */
async function saveModal() {
  const w = words.find(x => x.id === editingId);
  if (!w) return;

  w.ru = document.getElementById("m-ru").value.trim();
  w.pos = document.getElementById("m-pos").value.trim();

  if (!w.ru) return alert("RU обязательно");

  try {
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${ADMIN_PATH}`;
    const res = await fetch(url, {
      headers: { Authorization: `token ${githubToken}` }
    });
    const j = await res.json();

    j.content = JSON.parse(atob(j.content));
    j.content.words = words;

    await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `token ${githubToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: "Update dictionary",
        content: btoa(JSON.stringify(j.content, null, 2)),
        sha: j.sha
      })
    });

    closeModal();
    alert("Сохранено ✓");
  } catch (e) {
    console.error(e);
    alert("Ошибка сохранения");
  }
}
