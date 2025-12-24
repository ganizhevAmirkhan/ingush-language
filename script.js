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
    if (!res.ok) throw new Error("Не удалось загрузить " + path);

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
  const ing = (w.senses || []).map(s => s.ing || "").join(" ").toLowerCase();
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
  editingId = id;
  const w = words.find(x => x.id === id);
  if (!w) return alert("Слово не найдено");

  document.getElementById("modal-title").textContent = "Редактирование";
  document.getElementById("m-ru").value = w.ru || "";
  document.getElementById("m-pos").value = w.pos || "";

  renderModalSenses(w);
  renderModalExamples(w);

  document.getElementById("modal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal").classList.add("hidden");
  editingId = null;
}

function renderModalSenses(w) {
  const box = document.getElementById("m-senses");
  box.innerHTML = "";

  (w.senses || []).forEach((s, i) => {
    box.insertAdjacentHTML("beforeend", `
      <div class="row">
        <input class="input" value="${escapeHtml(s.ing)}"
          oninput="onSenseInput(${i}, this.value)" />
      </div>
    `);
  });
}

function onSenseInput(i, val) {
  const w = words.find(x => x.id === editingId);
  if (w) w.senses[i].ing = val;
}

/* ================= EXAMPLES ================= */
function renderModalExamples(w) {
  const box = document.getElementById("m-examples");
  box.innerHTML = "";

  (w.senses || []).forEach((s, si) => {
    (s.examples || []).forEach((ex, ei) => {
      box.insertAdjacentHTML("beforeend", `
        <div class="block">
          <textarea class="input"
            oninput="onExampleIng(${si},${ei},this.value)">${escapeHtml(ex.ing)}</textarea>
          <textarea class="input"
            oninput="onExampleRu(${si},${ei},this.value)">${escapeHtml(ex.ru)}</textarea>
        </div>
      `);
    });
  });
}

function addExample() {
  const w = words.find(x => x.id === editingId);
  if (!w) return;
  w.senses[0].examples.push({ ing:"", ru:"" });
  renderModalExamples(w);
}

function onExampleIng(si, ei, v) {
  words.find(x => x.id === editingId).senses[si].examples[ei].ing = v;
}
function onExampleRu(si, ei, v) {
  words.find(x => x.id === editingId).senses[si].examples[ei].ru = v;
}

/* ================= SAVE ================= */
async function saveModal() {
  if (!adminMode) return alert("Нет админ-доступа");

  const w = words.find(x => x.id === editingId);
  if (!w) return;

  w.ru  = document.getElementById("m-ru").value.trim();
  w.pos = document.getElementById("m-pos").value.trim();

  try {
    const get = await ghGetFile(ADMIN_PATH);
    get.data.words = words;
    await ghPutFile(ADMIN_PATH, get.data, get.sha);

    closeModal();
    alert("Сохранено ✓");
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
  return {
    sha: j.sha,
    data: JSON.parse(atob(j.content.replace(/\n/g, "")))
  };
}

async function ghPutFile(path, data, sha) {
  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`,
    {
      method: "PUT",
      headers: {
        Authorization: "token " + githubToken,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: "Update dictionary",
        content: btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2)))),
        sha
      })
    }
  );

  if (!res.ok) throw new Error("GitHub PUT error");
}
