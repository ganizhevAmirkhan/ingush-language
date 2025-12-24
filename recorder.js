let mediaRecorder = null;
let mediaStream = null;
let audioChunks = [];

async function recordWord() {
  try {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      // 🔴 ОСТАНОВКА
      mediaRecorder.stop();
      return;
    }

    // 🎙 Запрос микрофона
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    mediaRecorder = new MediaRecorder(mediaStream);
    audioChunks = [];

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      try {
        const blob = new Blob(audioChunks, { type: "audio/webm" });
        const buffer = await blob.arrayBuffer();
        const base64 = btoa(
          String.fromCharCode(...new Uint8Array(buffer))
        );

        await uploadWordAudio(base64);

        alert("🎧 Аудио сохранено в GitHub");
      } catch (e) {
        alert("Ошибка сохранения аудио: " + e.message);
      } finally {
        // 🔥 САМОЕ ВАЖНОЕ — ОСВОБОЖДАЕМ МИКРОФОН
        if (mediaStream) {
          mediaStream.getTracks().forEach(t => t.stop());
        }
        mediaRecorder = null;
        mediaStream = null;
        audioChunks = [];
      }
    };

    mediaRecorder.start();

  } catch (e) {
    alert("Ошибка микрофона: " + e.message);
  }
}
