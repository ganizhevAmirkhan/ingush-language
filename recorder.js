let mediaRecorder = null;
let recordedChunks = [];

window.recordWord = async function (btn) {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Браузер не поддерживает запись звука");
      return;
    }

    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      btn.textContent = "🎙";
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: "audio/webm" });
      const url = URL.createObjectURL(blob);

      btn.dataset.audioBlob = url;
      btn.textContent = "▶";

      stream.getTracks().forEach(t => t.stop());
    };

    mediaRecorder.start();
    btn.textContent = "⏺";

  } catch (err) {
    console.error("Ошибка записи:", err);
    alert("Ошибка записи звука");
  }
};
