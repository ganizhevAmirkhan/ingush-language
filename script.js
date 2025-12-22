/* ================= CONFIG ================= */
const OWNER = "ganizhevAmirkhan";
const REPO = "ingush-language";
const BRANCH = "main";

const INDEX_PATH = "dictionary-v2/index.json";
const WORDS_DIR = "dictionary-v2/words";

/* ================= STATE ================= */
let adminMode = false;
let githubToken = localStorage.getItem("githubToken");

let indexData = null;   // index.json
let wordsIndex = [];    // [{id, ru, pos}]
let filterQ = "";

let editingWord = null;

/* ================= INIT ================= */
window.onload = async () => {
  if (githubToken) {
    adminMode = true;
    setAdminUI(true);
  }

  document.getElementById("search").oninput = e => {
    filterQ = e.target.value.toLowerCase();
    render();
  };

  await loadIndex();
};

/* ================= LOAD INDEX ================= */
async function loadIndex() {
  const res = await fetch(INDEX_PATH + "?v=" + Date.now());
  if (!res.ok) {
    alert("Не найден index.json");
    return;
  }
  indexData = await res.json();
  wordsIndex = indexData.words || [];
  render();
}

/* ================= RENDER ================= */
function render() {
  const list = document.getElementById("list");
  list.innerHTML = "";

  const filtered = wordsIndex.filter(w =>
    w.ru.toLowerCase().includes(filterQ)
  );

  document.getElementById("stats").textContent =
    `Слов: ${wordsIndex.length} · Показано: ${filtered.length}`;

  filtered.slice(0, 300).forEach(w => {
    list.insertAdjacentHTML("beforeend", `
      <div class="card">
        <div class="cardTop">
          <div>
            <div class="wordRu">${w.ru}</div>
            <div class="pos">${w.pos || ""}</div>
          </div>
          <div class="row">
            ${adminMode ? `<button class="pill" onclick="openEdit('${w.id}')">✏</button>` : ""}
          </div>
        </div>
      </div>
    `);
  });
}

/* ================= ADMIN ================= */
function setAdminUI(on) {
  document.getElementById("admin-status").textContent = on ? "✓ Админ" : "";
  document.getElementById("add-word-btn").classList.toggle("hidden", !on);
}

function adminLogin() {
  const t = document.getElementById("gh-token").value.trim();
  if (!t) return alert("Введите GitHub Token");
  githubToken = t;
  localStorage.setItem("githubToken", t);
  adminMode = true;
  setAdminUI(true);
}

/* ================= EDITOR ================= */
async function openEdit(id) {
  const res = await fetch(`${WORDS_DIR}/${id}.json?v=${Date.now()}`);
  if (!res.ok) return alert("Файл слова не найден");
  editingWord = await res.json();

  document.getElementById("m-ru").value = editingWord.ru || "";
  document.getElementById("m-pos").value = editingWord.pos || "";

  renderSenses();
  document.getElementById("modal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal").classList.add("hidden");
  editingWord = null;
}

function renderSenses() {
  const box = document.getElementById("m-senses");
  box.innerHTML = "";
  editingWord.senses.forEach((s, i) => {
    box.insertAdjacentHTML("beforeend", `
      <input class="input" value="${s.ing || ""}"
        oninput="editingWord.senses[${i}].ing=this.value">
    `);
  });
}

/* ================= SAVE ================= */
async function saveModal() {
  if (!adminMode) return alert("Нет прав");

  editingWord.ru = document.getElementById("m-ru").value.trim();
  editingWord.pos = document.getElementById("m-pos").value.trim();

  await ghPutJson(
    `${WORDS_DIR}/${editingWord.id}.json`,
    editingWord
  );

  // обновим индекс
  const idx = wordsIndex.find(w => w.id === editingWord.id);
  idx.ru = editingWord.ru;
  idx.pos = editingWord.pos;

  const { sha } = await ghGet(INDEX_PATH);
  await ghPutJson(INDEX_PATH, indexData, sha);

  closeModal();
  render();
  alert("Сохранено ✓");
}

/* ================= GITHUB ================= */
async function ghGet(path) {
  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`,
    { headers: { Authorization: `token ${githubToken}` } }
  );
  return await res.json();
}

async function ghPutJson(path, data, sha = null) {
  const body = {
    message: "update " + path,
    content: btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2)))),
    sha
  };
  await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`,
    {
      method: "PUT",
      headers: {
        Authorization: `token ${githubToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );
}
