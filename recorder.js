/* ================= AUDIO RECORD (WORD) ================= */

let mediaRecorder = null;
let mediaStream = null;
let audioChunks = [];
let recordedBlob = null;

/* 🎤 НАЧАТЬ / ОСТАНОВИТЬ ЗАПИСЬ */
async function toggleRecordWord() {
  const recBtn  = document.getElementById("rec-word-btn");
  const playBtn = document.getElementById("play-rec-btn");
  const saveBtn = document.getElementById("save-rec-btn");

  try {
    /* ⏹ ОСТАНОВКА */
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      recBtn.textContent = "🎤 Записать";
      return;
    }

    /* 🎙 ЗАПУСК */
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    mediaRecorder = new MediaRecorder(mediaStream);
    audioChunks = [];
    recordedBlob = null;

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      recordedBlob = new Blob(audioChunks, { type: "audio/webm" });

      playBtn.disabled = false;
      saveBtn.disabled = false;

      // 🔥 освобождаем микрофон
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
      mediaRecorder = null;
    };

    mediaRecorder.start();
    recBtn.textContent = "⏹ Стоп";

  } catch (e) {
    alert("Ошибка микрофона: " + e.message);
  }
}

/* ▶ ПРОСЛУШАТЬ */
function playRecordedWord() {
  if (!recordedBlob) {
    alert("Нет записи");
    return;
  }

  const url = URL.createObjectURL(recordedBlob);
  new Audio(url).play();
}

/* 💾 СОХРАНИТЬ В GITHUB */
async function saveRecordedWord() {
  if (!recordedBlob || !editingWord) {
    alert("Нет записи или слова");
    return;
  }

  const buffer = await recordedBlob.arrayBuffer();
  const base64 = btoa(
    String.fromCharCode(...new Uint8Array(buffer))
  );

  await uploadWordAudioToGitHub(base64, editingWord.id);

  editingWord.audio = { word: true };
  await saveToGitHub();
  render();

  alert("🎧 Аудио сохранено в GitHub");
}

/* ================= INIT BUTTONS ================= */
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("rec-word-btn").onclick  = toggleRecordWord;
  document.getElementById("play-rec-btn").onclick = playRecordedWord;
  document.getElementById("save-rec-btn").onclick = saveRecordedWord;
});
