/* ================= CONFIG ================= */
const OWNER  = "ganizhevAmirkhan";
const REPO   = "ingush-language";
const BRANCH = "main";
const ADMIN_PATH = "admin/dictionary.admin.json";

/* ================= STATE ================= */
let dict = { version: "3.0", words: [] };
let adminMode = false;
let githubToken = localStorage.getItem("githubToken");
let editingWord = null;

/* ================= UTILS ================= */
function b64Encode(str){
  return btoa(unescape(encodeURIComponent(str)));
}
function b64Decode(b64){
  return decodeURIComponent(escape(atob(b64)));
}
function genId(){
  return "w_" + Math.random().toString(36).slice(2,10);
}

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded", async () => {
  if (githubToken) {
    adminMode = true;
    document.getElementById("admin-status").textContent = "✓ Админ";
  }
  await loadDictionary();
});

/* ================= LOAD ================= */
async function loadDictionary(){
  const res = await fetch(ADMIN_PATH + "?v=" + Date.now());
  dict = await res.json();
  render();
}

/* ================= RENDER ================= */
function render(){
  const list = document.getElementById("list");
  list.innerHTML = "";
  dict.words.forEach(w=>{
    list.insertAdjacentHTML("beforeend", `
      <div class="card">
        <b>${w.ru}</b>
        <div>${(w.senses||[]).map(s=>s.ing).join("<br>")}</div>
        ${adminMode ? `<button onclick="openEditWord('${w.id}')">✏</button>` : ""}
      </div>
    `);
  });
}

/* ================= ADMIN ================= */
function adminLogin(){
  const t = document.getElementById("gh-token").value.trim();
  if(!t) return alert("Введите GitHub Token");
  githubToken = t;
  localStorage.setItem("githubToken", t);
  adminMode = true;
  document.getElementById("admin-status").textContent = "✓ Админ";
  render();
}

/* ================= MODAL ================= */
function openEditWord(id){
  editingWord = dict.words.find(w=>w.id===id);
  document.getElementById("m-ru").value = editingWord.ru || "";
  document.getElementById("m-pos").value = editingWord.pos || "";
  document.getElementById("m-senses").innerHTML =
    (editingWord.senses||[]).map(s=>`
      <input class="input sense" value="${s.ing}">
    `).join("");
  document.getElementById("modal").classList.remove("hidden");
}

function closeModal(){
  document.getElementById("modal").classList.add("hidden");
}

/* ================= SAVE ================= */
async function saveModal(){
  if(!githubToken) return alert("Нет GitHub Token");

  editingWord.ru  = document.getElementById("m-ru").value.trim();
  editingWord.pos = document.getElementById("m-pos").value.trim();
  editingWord.senses = [...document.querySelectorAll(".sense")]
    .map(i=>({ ing:i.value.trim() }))
    .filter(s=>s.ing);

  const api = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${ADMIN_PATH}`;

  const metaRes = await fetch(api,{
    headers:{ Authorization:`token ${githubToken}` }
  });
  if(!metaRes.ok) return alert("GitHub: нет доступа");
  const meta = await metaRes.json();

  const body = {
    message: "Update dictionary.admin.json",
    content: b64Encode(JSON.stringify(dict,null,2)),
    sha: meta.sha,
    branch: BRANCH
  };

  const put = await fetch(api,{
    method:"PUT",
    headers:{
      Authorization:`token ${githubToken}`,
      "Content-Type":"application/json"
    },
    body: JSON.stringify(body)
  });

  if(!put.ok){
    const t = await put.text();
    alert("Ошибка GitHub:\n"+t);
    return;
  }

  alert("Сохранено в GitHub ✓");
  closeModal();
  render();
}
