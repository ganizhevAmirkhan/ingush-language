/* ================= CONFIG ================= */
const INDEX_PATH = "dictionary-v2/index.json";
const WORDS_PATH = "dictionary-v2/words";

/* ================= STATE ================= */
let indexData = [];
let loadedWords = new Map(); // id -> word json
let searchQuery = "";

/* ================= INIT ================= */
window.onload = async () => {
  const searchInput = document.getElementById("search");
  const searchBtn = document.getElementById("search-btn");

  searchInput.oninput = () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    renderSearch();
  };

  if (searchBtn) {
    searchBtn.onclick = () => {
      searchQuery = searchInput.value.trim().toLowerCase();
      renderSearch();
    };
  }

  await loadIndex();
};

/* ================= LOAD INDEX ================= */
async function loadIndex() {
  try {
    const res = await fetch(INDEX_PATH + "?v=" + Date.now());
    if (!res.ok) throw new Error("index.json не найден");

    const json = await res.json();
    indexData = json.words || [];

    document.getElementById("stats").textContent =
      `Слов: ${indexData.length}`;

    renderSearch();
  } catch (e) {
    alert("Ошибка загрузки index.json");
    console.error(e);
  }
}

/* ================= SEARCH ================= */
function renderSearch() {
  const list = document.getElementById("list");
  list.innerHTML = "";

  const q = searchQuery;

  const filtered = indexData.filter(w => {
    if (!q) return true;
    return (
      (w.ru || "").toLowerCase().includes(q) ||
      (w.pos || "").toLowerCase().includes(q)
    );
  }).slice(0, 50); // ограничение как в разговорнике

  document.getElementById("stats").textContent =
    `Найдено: ${filtered.length}`;

  filtered.forEach(w => renderWordStub(w));
}

/* ================= WORD STUB ================= */
function renderWordStub(w) {
  const list = document.getElementById("list");

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="cardTop">
      <div>
        <div class="wordRu">${w.ru}</div>
        <div class="pos">${w.pos || ""}</div>
      </div>
      <div class="row">
        <button class="pill" onclick="loadWord('${w.id}')">▶</button>
      </div>
    </div>
    <div id="word-${w.id}" class="muted">Загрузка…</div>
  `;

  list.appendChild(card);
}

/* ================= LOAD FULL WORD ================= */
async function loadWord(id) {
  if (loadedWords.has(id)) return;

  const container = document.getElementById(`word-${id}`);
  if (!container) return;

  try {
    const res = await fetch(`${WORDS_PATH}/${id}.json?v=${Date.now()}`);
    if (!res.ok) throw new Error("word json не найден");

    const word = await res.json();
    loadedWords.set(id, word);

    renderFullWord(container, word);
  } catch (e) {
    container.textContent = "Ошибка загрузки перевода";
    console.error(e);
  }
}

/* ================= RENDER FULL WORD ================= */
function renderFullWord(container, word) {
  const senses = (word.senses || []).map(s =>
    `<div class="ingLine">• ${s.ing}</div>`
  ).join("");

  const examples = (word.senses || [])
    .flatMap(s => s.examples || [])
    .slice(0, 3)
    .map(ex => `
      <div class="exItem">
        <div>${ex.ing}</div>
        <div class="exSub">${ex.ru}</div>
      </div>
    `).join("");

  container.innerHTML = `
    ${senses || "<div class='muted'>Нет перевода</div>"}
    <div class="examples">
      ${examples || "<div class='muted'>Нет примеров</div>"}
    </div>
  `;
}
