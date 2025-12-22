/* ================== STATE ================== */
let adminMode = false;
let githubToken = localStorage.getItem("githubToken") || null;
let dictionary = [];
let currentEditId = null;

/* ================== INIT ================== */
window.onload = async () => {
  if (githubToken) {
    adminMode = true;
    document.getElementById("admin-status").textContent = "✓ Админ";
  }

  await loadDictionary();

  document.getElementById("search").oninput = render;
};

/* ================== LOAD ================== */
async function loadDictionary(){
  const r = await fetch("dictionary-v2/1"); // твой файл
  const json = await r.json();
  dictionary = json.words;
  render();
}

/* ================== RENDER ================== */
function render(){
  const q = document.getElementById("search").value.toLowerCase();
  const box = document.getElementById("list");
  box.innerHTML = "";

  dictionary
    .filter(w =>
      w.ru.toLowerCase().includes(q) ||
      w.senses.some(s => s.ing.toLowerCase().includes(q))
    )
    .forEach(w=>{
      const div = document.createElement("div");
      div.className = "word";

      div.innerHTML = `
        <b>${w.ru}</b> <i>${w.pos || ""}</i><br>
        ${w.senses.map(s=>`<div>${s.ing}</div>`).join("")}
        ${adminMode ? `<button onclick="openEdit('${w.id}')">✏</button>` : ""}
      `;
      box.appendChild(div);
    });
}

/* ================== ADMIN ================== */
function adminLogin(){
  const t = document.getElementById("gh-token").value.trim();
  if(!t) return alert("Введите GitHub Token");

  githubToken = t;
  adminMode = true;
  localStorage.setItem("githubToken", t);
  document.getElementById("admin-status").textContent = "✓ Админ";
  render();
}

/* ================== EDIT ================== */
function openEdit(id){
  currentEditId = id;
  const w = dictionary.find(x=>x.id===id);

  document.getElementById("edit-ru").value = w.ru;
  document.getElementById("edit-pos").value = w.pos || "";
  document.getElementById("edit-ing").value =
    w.senses.map(s=>s.ing).join(", ");

  document.getElementById("edit-ex-ing").value =
    w.senses[0]?.examples[0]?.ing || "";

  document.getElementById("edit-ex-ru").value =
    w.senses[0]?.examples[0]?.ru || "";

  document.getElementById("edit-modal").classList.remove("hidden");
}

function closeEdit(){
  currentEditId = null;
  document.getElementById("edit-modal").classList.add("hidden");
}

async function saveEdit(){
  const w = dictionary.find(x=>x.id===currentEditId);
  if(!w) return;

  w.ru = document.getElementById("edit-ru").value.trim();
  w.pos = document.getElementById("edit-pos").value.trim();

  const ingList = document.getElementById("edit-ing").value
    .split(",")
    .map(x=>x.trim())
    .filter(Boolean);

  w.senses = ingList.map(ing=>({
    ing,
    examples:[{
      ing: document.getElementById("edit-ex-ing").value.trim(),
      ru: document.getElementById("edit-ex-ru").value.trim(),
      audio:null
    }]
  }));

  await saveToGitHub();
  closeEdit();
  render();
}

/* ================== SAVE GITHUB ================== */
async function saveToGitHub(){
  const url = "https://api.github.com/repos/ganizhevAmirkhan/ingush-language/contents/dictionary-v2/1";

  const res = await fetch(url,{
    headers:{ Authorization:`token ${githubToken}` }
  });
  const json = await res.json();

  await fetch(url,{
    method:"PUT",
    headers:{
      Authorization:`token ${githubToken}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      message:"Update dictionary v2",
      sha: json.sha,
      content: btoa(unescape(encodeURIComponent(
        JSON.stringify({ words: dictionary },null,2)
      )))
    })
  });
}

/* ================== AI ================== */
async function callAI(prompt){
  const key = document.getElementById("ai-key").value.trim();
  if(!key) return alert("Нет OpenAI API Key");

  const r = await fetch("https://api.openai.com/v1/chat/completions",{
    method:"POST",
    headers:{
      Authorization:`Bearer ${key}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      model:"gpt-4o-mini",
      messages:[
        {role:"system",content:"Ты помощник для ингушского словаря"},
        {role:"user",content:prompt}
      ]
    })
  });

  const j = await r.json();
  return j.choices[0].message.content;
}

async function aiFixRu(){
  const out = await callAI("Исправь русский текст:\n"+edit_ru.value);
  edit_ru.value = out;
}

async function aiTranslateIng(){
  const out = await callAI("Переведи на ингушский:\n"+edit_ru.value);
  edit_ing.value = out;
}

async function aiGenerateExample(){
  const out = await callAI("Дай пример предложения на ингушском со словом:\n"+edit_ing.value);
  edit_ex_ing.value = out;
}
