const OWNER = "ganizhevAmirkhan";
const REPO  = "ingush-language";
const FILE  = "dictionary-v2/dictionary_v2.json";

let token = null;
let data = null;
let current = null;

async function adminLogin(){
  token = document.getElementById("gh-token").value;
  loadData();
}

async function loadData(){
  const r = await fetch(FILE);
  data = await r.json();
  render();
}

function render(){
  const list = document.getElementById("list");
  list.innerHTML = "";
  data.words.forEach(w=>{
    const d = document.createElement("div");
    d.className="card";
    d.innerHTML = `
      <b>${w.ru}</b><br>
      ${w.senses[0].ing}<br>
      <button onclick="edit('${w.id}')">✏</button>
    `;
    list.appendChild(d);
  });
}

function edit(id){
  current = data.words.find(w=>w.id===id);
  ru.value = current.ru;
  pos.value = current.pos||"";
  ing.value = current.senses.map(s=>s.ing).join("\n");
  ex_ing.value = current.senses[0].examples[0].ing;
  ex_ru.value  = current.senses[0].examples[0].ru;
  modal.classList.remove("hidden");
}

function closeModal(){
  modal.classList.add("hidden");
}

async function saveWord(){
  current.ru = ru.value;
  current.pos = pos.value;
  current.senses[0].ing = ing.value;
  current.senses[0].examples[0].ing = ex_ing.value;
  current.senses[0].examples[0].ru = ex_ru.value;

  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE}`;
  const get = await fetch(url,{headers:{Authorization:`token ${token}`}});
  const sha = (await get.json()).sha;

  await fetch(url,{
    method:"PUT",
    headers:{
      Authorization:`token ${token}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      message:"update word",
      sha,
      content:btoa(unescape(encodeURIComponent(JSON.stringify(data,null,2))))
    })
  });

  closeModal();
  render();
}

/* ===== AI ===== */

function saveAiKey(){
  localStorage.setItem("aiKey", ai-key.value);
}

async function callAI(prompt){
  const key = localStorage.getItem("aiKey");
  const r = await fetch("https://api.openai.com/v1/chat/completions",{
    method:"POST",
    headers:{
      Authorization:"Bearer "+key,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      model:"gpt-4o-mini",
      messages:[{role:"user",content:prompt}]
    })
  });
  const j = await r.json();
  return j.choices[0].message.content;
}

async function aiFixRu(){
  ru.value = await callAI("Исправь русский:\n"+ru.value);
}
async function aiTranslateIng(){
  ing.value = await callAI("Переведи на ингушский:\n"+ru.value);
}
async function aiMakeExample(){
  const t = await callAI("Сделай пример ING + RU для слова:\n"+ru.value);
  ex_ing.value = t.split("\n")[0]||"";
  ex_ru.value  = t.split("\n")[1]||"";
}

loadData();

