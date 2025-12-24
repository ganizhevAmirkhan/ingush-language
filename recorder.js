/* ================= AUDIO RECORD (WORD) ================= */

let recStream = null;
let mediaRecorder = null;
let recChunks = [];
let recBlob = null;
let recBlobUrl = null;

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded", () => {
  const recBtn  = document.getElementById("rec-word-btn");
  const stopBtn = document.getElementById("stop-rec-btn");
  const playBtn = document.getElementById("play-rec-btn");
  const saveBtn = document.getElementById("save-rec-btn");

  if (!recBtn || !stopBtn || !playBtn || !saveBtn) {
    console.warn("Аудио-кнопки не найдены");
    return;
  }

  recBtn.addEventListener("click", startRecording);
  stopBtn.addEventListener("click", stopRecording);
  playBtn.addEventListener("click", playRecorded);
  saveBtn.addEventListener("click", saveRecorded);

  setButtons("idle");
});

/* ================= UI STATE ================= */
function setButtons(state) {
  const recBtn  = document.getElementById("rec-word-btn");
  const stopBtn = document.getElementById("stop-rec-btn");
  const playBtn = document.getElementById("play-rec-btn");
  const saveBtn = document.getElementById("save-rec-btn");

  if (state === "recording") {
    recBtn.disabled = true;
    stopBtn.disabled = false;
    playBtn.disabled = true;
    saveBtn.disabled = true;
  }

  if (state === "recorded") {
    recBtn.disabled = false;
    stopBtn.disabled = true;
    playBtn.disabled = false;
    saveBtn.disabled = false;
  }

  if (state === "idle") {
    recBtn.disabled = false;
    stopBtn.disabled = true;
    playBtn.disabled = true;
    saveBtn.disabled = true;
  }
}

/* ================= RECORD ================= */
async function startRecording() {
  if (!window.adminMode || !window.editingWord) {
    alert("Открой слово в админ-режиме");
    return;
  }

  try {
    recChunks = [];
    recBlob = null;

    recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(recStream);

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) recChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      recBlob = new Blob(recChunks, { type: mediaRecorder.mimeType });
      recBlobUrl = URL.createObjectURL(recBlob);

      stopTracks();
      setButtons("recorded");
    };

    mediaRecorder.start();
    setButtons("recording");

  } catch (e) {
    alert("Ошибка микрофона: " + e.message);
    stopTracks();
    setButtons("idle");
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  }
}

/* ================= PLAY ================= */
function playRecorded() {
  if (!recBlobUrl) {
    alert("Нет записи");
    return;
  }
  new Audio(recBlobUrl).play();
}

/* ================= SAVE ================= */
async function saveRecorded() {
  if (!recBlob || !window.editingWord) {
    alert("Нет записи или слова");
    return;
  }

  try {
    const buf = await recBlob.arrayBuffer();
    const base64 = btoa(
      String.fromCharCode(...new Uint8Array(buf))
    );

    const path = `audio/words/${editingWord.id}.mp3`;
    await window.putFile(path, base64, `add audio ${editingWord.id}`);

    editingWord.audio = editingWord.audio || {};
    editingWord.audio.word = true;

    await window.saveAdminDictionaryToGitHub(window.dict);
    window.render();

    alert("🎧 Аудио сохранено");
    setButtons("idle");

  } catch (e) {
    alert("Ошибка сохранения: " + e.message);
  }
}

/* ================= CLEANUP ================= */
function stopTracks() {
  if (recStream) {
    recStream.getTracks().forEach(t => t.stop());
    recStream = null;
  }
}
