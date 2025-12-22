let adminMode = false;
let githubToken = localStorage.getItem("githubToken") || null;

let dictionary = [];
let currentEditId = null;

/* ===== INIT ===== */
window.onload = async () => {
  if (githubToken) {
    adminMode = true;
    document.getElementById("admin-status").textContent = "✓ Админ";
  }

  document.getElementById("search").oninput = render;

  await loadDictionary();
};

/* ===== ADMIN ===== */
function adminLogin(){
  const t = document.getElementById("gh-token").value.trim();
  if(!t) return alert("Введите GitHub Token");

  githubToken = t;
  adminMode = true;
  localStorage.setItem("githubToken", t);

  document.getElementById("admin-status").textContent = "✓ Админ";
  render();
}

/* ===== LOAD DATA ===== */
async function loadDictionary(){
  const r = await fetch("dictionary-v2/dictionary_v2.json");
  const j = await r.json();
  dictionary = j.words;
  render();
}

/* ===== RENDER ===== */
function render(){
  const q = document.getElementById("search").value.toLowerCase();
  const list = document.getElementById("list");
  list.innerHTML = "";

  dictionary
    .filter(w =>
      w.ru.toLowerCase().includes(q) ||
      w.senses.some(s => s.ing.toLowerCase().includes(q))
    )
    .forEach(w=>{
      const d = document.createElement("div");
      d.className = "word";

      d.innerHTML = `
        <b>${w.ru}</b> <i>${w.pos || ""}</i><br>
        ${w.senses.map(s=>s.ing).join(", ")}
        ${adminMode ? `<div><button class="edit-btn" onclick="openEdit('${w.id}')">✏ Редактировать</button></div>` : ""}
      `;

      list.appendChild(d);
    });
}

/* ===== EDIT ===== */
function openEdit(id){
  const w = dictionary.find(x=>x.id===id);
  if(!w) return;

  currentEditId = id;

  document.getElementById("edit-ru").value = w.ru;
  document.getElementById("edit-pos").value = w.pos || "";
  document.getElementById("edit-ing").value = w.senses.map(s=>s.ing).join(", ");

  const ex = w.senses[0].examples[0];
  document.getElementById("edit-ex-ing").value = ex.ing || "";
  document.getElementById("edit-ex-ru").value = ex.ru || "";

  document.getElementById("edit-modal").classList.remove("hidden");
}

function closeEdit(){
  document.getElementById("edit-modal").classList.add("hidden");
  currentEditId = null;
}

function saveEdit(){
  const w = dictionary.find(x=>x.id===currentEditId);
  if(!w) return;

  w.ru = document.getElementById("edit-ru").value.trim();
  w.pos = document.getElementById("edit-pos").value.trim();

  const ings = document.getElementById("edit-ing").value
    .split(",")
    .map(x=>x.trim())
    .filter(Boolean);

  w.senses = ings.map(i=>({
    ing:i,
    definition:null,
    examples:[{
      ing: document.getElementById("edit-ex-ing").value.trim(),
      ru: document.getElementById("edit-ex-ru").value.trim(),
      audio:null
    }]
  }));

  closeEdit();
  render();

  alert("⚠ Изменения пока в памяти.\nДальше подключим GitHub API сохранение.");
}
