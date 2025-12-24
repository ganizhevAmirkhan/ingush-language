let mediaRecorder;
let audioChunks = [];

async function recordWord() {
  if (!navigator.mediaDevices) {
    alert("Браузер не поддерживает запись");
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  audioChunks = [];

  mediaRecorder.ondataavailable = e => audioChunks.push(e.data);

  mediaRecorder.onstop = async () => {
    const blob = new Blob(audioChunks, { type: "audio/mp3" });
    await uploadWordAudio(blob);
  };

  mediaRecorder.start();
  alert("Запись началась. Нажми ОК чтобы остановить.");

  setTimeout(() => mediaRecorder.stop(), 3000);
}
