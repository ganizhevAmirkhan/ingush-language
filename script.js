/* ================= CONFIG ================= */
const OWNER  = "ganizhevAmirkhan";
const REPO   = "ingush-language";
const BRANCH = "main";

const PUBLIC_PATH = "public/dictionary.json";
const ADMIN_PATH  = "admin/dictionary.admin.json";

/* ================= STATE ================= */
let dict = { version: "3.0", words: [] };
let words = [];
let filterQ = "";
let adminMode = false;
let githubToken = localStorage.getItem("githubToken") || "";
let editingWord = null;

/* ================= HELPERS ================= */
const $ = (id) => document.getElementById(id);

const escapeHtml = (s="") =>
  s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");

const base64EncodeUtf8 = (str) =>
  btoa(unescape(encodeURIComponent(str)));

const base64FromArrayBuffer = (buf) => {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

const authedHeaders = () => ({
  Authorization: "Bearer " + githubToken,
  Accept: "application/vnd.github+json"
});

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded", () => {
  adminMode = !!githubToken;
  setAdminUI(adminMode);

  $("search")?.addEventListener("input", e => {
    filterQ = e.target.value.toLowerCase().trim();
    render();
  });

  wireAudioButtons();
  loadDictionary();
});

/* ================= ADMIN UI ================= */
function setAdminUI(on) {
  $("admin-status").textContent = on ? "✓ Админ" : "";
  $("admin-logout").classList.toggle("hidden", !on);
  $("add-word-btn").classList.toggle("hidden", !on);
  $("publish-btn").classList.toggle("hidden", !on);
}

function adminLogin() {
  const t = $("gh-token").value.trim();
  if (!t) return alert("Введите GitHub Token");
  githubToken = t;
  localStorage.setItem("githubToken", t);
  adminMode = true;
  setAdminUI(true);
  loadDictionary();
}

function adminLogout() {
  localStorage.removeItem("githubToken");
  githubToken = "";
  adminMode = false;
  stopRecordingHard();
  setAdminUI(false);
  loadDictionary();
}

/* ================= LOAD ================= */
async function loadDictionary() {
  const path = adminMode ? ADMIN_PATH : PUBLIC_PATH;
  const res = await fetch(path + "?v=" + Date.now());
  if (!res.ok) return alert("Ошибка загрузки словаря");
  dict = await res.json();
  words = dict.words || [];
  render();
}

/* ================= RENDER ================= */
function render() {
  const list = $("list");
  const filtered = words.filter(w =>
    !filterQ ||
    (w.ru||"").toLowerCase().includes(filterQ) ||
    (w.pos||"").toLowerCase().includes(filterQ) ||
    (w.senses||[]).some(s => (s.ing||"").toLowerCase().includes(filterQ))
  );

  $("stats").textContent = `Слов: ${words.length} · Показано: ${filtered.length}`;
  list.innerHTML = "";
  filtered.forEach(w => list.insertAdjacentHTML("beforeend", renderCard(w)));
}

function renderCard(w) {
  const senses = (w.senses||[]).map(s=>`• ${escapeHtml(s.ing)}`).join("<br>");
  return `
  <div class="card">
    <div class="cardTop">
      <div>
        <div class="wordRu">${escapeHtml(w.ru)}</div>
        <div class="pos">${escapeHtml(w.pos||"")}</div>
      </div>
      <div class="row">
        ${w.audio?.word ? `<button class="pill" onclick="playWord('${w.id}')">▶</button>` :
        `<button class="pill disabled">—</button>`}
        ${adminMode ? `<button class="pill" onclick="openEditWord('${w.id}')">✏</button>` : ""}
      </div>
    </div>
    <div class="ingLine">${senses}</div>
  </div>`;
}

/* ================= MODAL ================= */
function openModal(){ $("modal").classList.remove("hidden"); }
function closeModal(){
  $("modal").classList.add("hidden");
  stopRecordingHard();
  resetRecordedPreview();
}

function openCreateWord(){
  editingWord = null;
  $("modal-title").textContent = "Добавить слово";
  $("m-ru").value = "";
  $("m-pos").value = "";
  $("m-senses").innerHTML = "";
  addSense("");
  openModal();
}

function openEditWord(id){
  editingWord = words.find(w=>w.id===id);
  if (!editingWord) return;
  $("modal-title").textContent = "Редактирование";
  $("m-ru").value = editingWord.ru||"";
  $("m-pos").value = editingWord.pos||"";
  $("m-senses").innerHTML = "";
  editingWord.senses.forEach(s=>addSense(s.ing));
  resetRecordedPreview();
  openModal();
}

function addSense(val=""){
  const d = document.createElement("div");
  d.innerHTML = `<input class="input" value="${escapeHtml(val)}">`;
  $("m-senses").appendChild(d);
}

/* ================= SAVE WORD ================= */
async function saveModal(){
  if (!adminMode) return alert("Нет админ-доступа");

  const ru = $("m-ru").value.trim();
  if (!ru) return alert("RU обязательно");

  const senses = [...document.querySelectorAll("#m-senses input")]
    .map(i=>i.value.trim()).filter(Boolean).map(ing=>({ing}));

  if (!senses.length) return alert("Нужен ING");

  if (!editingWord){
    editingWord = { id:"w_"+Math.random().toString(36).slice(2,9), audio:{word:false} };
    dict.words.push(editingWord);
  }

  editingWord.ru = ru;
  editingWord.pos = $("m-pos").value.trim();
  editingWord.senses = senses;

  await saveAdminDictionary();
  closeModal();
  render();
  alert("✅ Сохранено");
}

/* ================= GITHUB ================= */
async function saveAdminDictionary(){
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${ADMIN_PATH}`;
  const meta = await fetch(url,{headers:authedHeaders()}).then(r=>r.json());

  await fetch(url,{
    method:"PUT",
    headers:{...authedHeaders(),"Content-Type":"application/json"},
    body:JSON.stringify({
      message:"update admin dictionary",
      sha:meta.sha,
      branch:BRANCH,
      content:base64EncodeUtf8(JSON.stringify(dict,null,2))
    })
  });
}

async function publishToPublic(){
  if (!confirm("Опубликовать?")) return;
  await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${PUBLIC_PATH}`,{
    method:"PUT",
    headers:{...authedHeaders(),"Content-Type":"application/json"},
    body:JSON.stringify({
      message:"publish dictionary",
      branch:BRANCH,
      content:base64EncodeUtf8(JSON.stringify(dict,null,2))
    })
  });
  alert("🚀 Опубликовано");
  adminLogout();
  location.reload();
}

/* ================= AUDIO ================= */
function playWord(id){
  new Audio(`https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/audio/words/${id}.mp3`).play();
}

/* ==== RECORD SYSTEM (ЕДИНСТВЕННЫЙ) ==== */
let recStream=null, mediaRecorder=null, recChunks=[], recBlob=null, recBlobUrl=null;

function wireAudioButtons(){
  $("rec-word-btn")?.addEventListener("click",()=>mediaRecorder?.state==="recording"?stopRecording():startRecording());
  $("play-rec-btn")?.addEventListener("click",()=>recBlobUrl&&new Audio(recBlobUrl).play());
  $("save-rec-btn")?.addEventListener("click",saveRecordedAudioToGitHub);
}

function resetRecordedPreview(){
  recChunks=[]; recBlob=null;
  if (recBlobUrl) URL.revokeObjectURL(recBlobUrl);
  recBlobUrl=null;
}

async function startRecording(){
  if (!editingWord) return alert("Открой слово");
  recStream=await navigator.mediaDevices.getUserMedia({audio:true});
  mediaRecorder=new MediaRecorder(recStream);
  mediaRecorder.ondataavailable=e=>recChunks.push(e.data);
  mediaRecorder.onstop=()=>{
    recBlob=new Blob(recChunks,{type:"audio/webm"});
    recBlobUrl=URL.createObjectURL(recBlob);
    recStream.getTracks().forEach(t=>t.stop());
  };
  mediaRecorder.start();
}

function stopRecording(){ mediaRecorder?.stop(); }

async function saveRecordedAudioToGitHub(){
  const buf=await recBlob.arrayBuffer();
  const base64=base64FromArrayBuffer(buf);
  await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/audio/words/${editingWord.id}.mp3`,{
    method:"PUT",
    headers:{...authedHeaders(),"Content-Type":"application/json"},
    body:JSON.stringify({
      message:"add audio",
      branch:BRANCH,
      content:base64
    })
  });
  editingWord.audio={word:true};
  await saveAdminDictionary();
  alert("🎧 Аудио сохранено");
}

function stopRecordingHard(){
  try{ mediaRecorder?.stop(); }catch{}
  recStream?.getTracks().forEach(t=>t.stop());
}

/* ================= EXPOSE ================= */
window.adminLogin=adminLogin;
window.adminLogout=adminLogout;
window.openCreateWord=openCreateWord;
window.openEditWord=openEditWord;
window.closeModal=closeModal;
window.saveModal=saveModal;
window.publishToPublic=publishToPublic;
