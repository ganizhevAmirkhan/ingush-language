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


/* ================= AUDIO ================= */
function playWord(id) {
  const a = new Audio(`audio/words/${id}.mp3?v=${Date.now()}`);
  a.play().catch(() => alert("Нет аудио"));
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
  document.getElementById("m-examples").innerHTML = "";

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
  (w.senses || []).forEach(s => {
    addSense(s.ing);
  });

  document.getElementById("m-examples").innerHTML = "";
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
  try {
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
    setAdminUI(true);
    render();
    alert("Сохранено в GitHub");
  } catch (e) {
    alert("Ошибка сохранения: " + e.message);
  }
}

/* ================= GITHUB SAVE ================= */
async function saveToGitHub() {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${ADMIN_PATH}`;

  const res = await fetch(url, {
    headers: { Authorization: "token " + githubToken }
  });
  if (!res.ok) throw new Error("GitHub auth error");

  const file = await res.json();
  const sha = file.sha;

  const content = btoa(unescape(encodeURIComponent(
    JSON.stringify(dict, null, 2)
  )));

  const put = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: "token " + githubToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: "Update dictionary via admin UI",
      content,
      sha,
      branch: BRANCH
    })
  });

  if (!put.ok) {
    const t = await put.text();
    throw new Error(t);
  }
}
/* ================= PUBLISH ================= */

async function publishToPublic() {
  if (!adminMode || !githubToken) {
    alert("Нет прав администратора");
    return;
  }

  if (!confirm("Опубликовать изменения в публичный словарь?")) return;

  const headers = {
    Authorization: "Bearer " + githubToken,
    "Content-Type": "application/json",
    Accept: "application/vnd.github+json",
  };

  try {
    // 0) проверка токена (чтобы сразу видеть проблему)
    const me = await fetch("https://api.github.com/user", { headers });
    if (!me.ok) {
      const t = await me.text();
      throw new Error("Токен невалидный / нет доступа: " + t);
    }

    // 1) Загружаем admin-словарь
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

    // 3) Пытаемся получить SHA public/dictionary.json (может не существовать!)
    const metaUrl =
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PUBLIC_PATH}?ref=${encodeURIComponent(BRANCH)}`;

    let sha = null;
    const metaRes = await fetch(metaUrl, { headers });

    if (metaRes.status === 404) {
      // файла нет — будем создавать новый
      sha = null;
    } else if (!metaRes.ok) {
      const t = await metaRes.text();
      throw new Error("Не удалось получить SHA public словаря: " + t);
    } else {
      const meta = await metaRes.json();
      sha = meta.sha;
    }

    // 4) PUT (обновить или создать)
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

    if (!putRes.ok) {
      const t = await putRes.text();
      throw new Error("GitHub PUT error: " + t);
    }

    alert("✅ Публичный словарь опубликован!");

    // чтобы сразу увидеть эффект в публичном режиме
    adminLogout();
    location.reload();

  } catch (e) {
    console.error(e);
    alert("❌ Ошибка публикации:\n\n" + (e?.message || e));
  }
}
window.playWordAudio = function (btn) {
  const url = btn.dataset.audioBlob;
  if (!url) {
    alert("Аудио не записано");
    return;
  }

  const audio = new Audio(url);
  audio.play();
};
