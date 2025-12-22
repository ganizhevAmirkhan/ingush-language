// recorder.js
// Требует: lamejs подключен в index.html

let mediaRecorder = null;
let streamRef = null;
let chunks = [];

let currentMode = null; // "word" | "example"
let currentId = null;

let isRecording = false;
let wordBtnId = null;

function supportsRecording(){
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
}

function resetRecorderUi(){
  isRecording = false;
  currentMode = null;
  currentId = null;
  chunks = [];

  if(wordBtnId){
    const btn = document.getElementById(wordBtnId);
    if(btn) btn.textContent = "🎤 Запись";
  }
}
window.resetRecorderUi = resetRecorderUi;

async function toggleRecordWord(wordId, btnId){
  if(!supportsRecording()){
    alert("Запись недоступна в этом браузере (нужен Chrome/Edge).");
    return;
  }
  wordBtnId = btnId;

  if(!isRecording){
    currentMode = "word";
    currentId = wordId;
    await startMic();
    const btn = document.getElementById(btnId);
    if(btn) btn.textContent = "⏹ Стоп";
  }else{
    stopMic();
    const btn = document.getElementById(btnId);
    if(btn) btn.textContent = "🎤 Запись";
  }
}
window.toggleRecordWord = toggleRecordWord;

async function toggleRecordExample(exampleId){
  if(!supportsRecording()){
    alert("Запись недоступна в этом браузере (нужен Chrome/Edge).");
    return;
  }

  if(!isRecording){
    currentMode = "example";
    currentId = exampleId;
    await startMic();
    alert("Запись началась. Нажми ещё раз 🎤 чтобы остановить.");
  }else{
    stopMic();
  }
}
window.toggleRecordExample = toggleRecordExample;

async function startMic(){
  chunks = [];
  isRecording = true;

  streamRef = await navigator.mediaDevices.getUserMedia({ audio:true });
  mediaRecorder = new MediaRecorder(streamRef);

  mediaRecorder.ondataavailable = (e) => {
    if(e.data && e.data.size > 0) chunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    try{
      const blob = new Blob(chunks, { type: "audio/webm" });
      const arrayBuffer = await blob.arrayBuffer();

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      const mp3Bytes = encodeMp3(audioBuffer);

      if(currentMode === "word" && typeof window.onWordAudioReady === "function"){
        window.onWordAudioReady(currentId, mp3Bytes);
      }else if(currentMode === "example" && typeof window.onExampleAudioReady === "function"){
        window.onExampleAudioReady(currentId, mp3Bytes);
      }

    }catch(err){
      console.error(err);
      alert("Не удалось обработать запись в mp3.");
    }finally{
      cleanup();
    }
  };

  mediaRecorder.start();
}

function stopMic(){
  if(!mediaRecorder) return;
  isRecording = false;
  try{ mediaRecorder.stop(); }catch{}
}

function cleanup(){
  try{
    if(streamRef) streamRef.getTracks().forEach(t => t.stop());
  }catch{}
  streamRef = null;
  mediaRecorder = null;
  chunks = [];
  currentMode = null;
  currentId = null;
  isRecording = false;

  if(wordBtnId){
    const btn = document.getElementById(wordBtnId);
    if(btn) btn.textContent = "🎤 Запись";
  }
}

function encodeMp3(audioBuffer){
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;

  const mp3Encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, 128);
  const samplesL = audioBuffer.getChannelData(0);
  const samplesR = numChannels > 1 ? audioBuffer.getChannelData(1) : null;

  const blockSize = 1152;
  const mp3Chunks = [];

  for(let i=0; i<samplesL.length; i+=blockSize){
    const chunkL = floatTo16BitPCM(samplesL.subarray(i, i+blockSize));
    let mp3buf;
    if(numChannels > 1){
      const chunkR = floatTo16BitPCM(samplesR.subarray(i, i+blockSize));
      mp3buf = mp3Encoder.encodeBuffer(chunkL, chunkR);
    }else{
      mp3buf = mp3Encoder.encodeBuffer(chunkL);
    }
    if(mp3buf.length) mp3Chunks.push(new Uint8Array(mp3buf));
  }

  const end = mp3Encoder.flush();
  if(end.length) mp3Chunks.push(new Uint8Array(end));

  let total = 0;
  mp3Chunks.forEach(a => total += a.length);

  const out = new Uint8Array(total);
  let offset = 0;
  mp3Chunks.forEach(a => { out.set(a, offset); offset += a.length; });

  return out;
}

function floatTo16BitPCM(float32Array){
  const out = new Int16Array(float32Array.length);
  for(let i=0;i<float32Array.length;i++){
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return out;
}
