// recorder.js
// Требует: lamejs подключен в index.html

let mediaRecorder = null;
let chunks = [];
let currentMode = null; // "word" | "example"
let currentId = null;

function startRecordingWord(wordId){
  currentMode = "word";
  currentId = wordId;
  startMic();
}

function startRecordingExample(exampleId){
  currentMode = "example";
  currentId = exampleId;
  startMic();
}

async function startMic(){
  chunks = [];

  const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
  mediaRecorder = new MediaRecorder(stream);

  mediaRecorder.ondataavailable = (e) => {
    if(e.data && e.data.size > 0) chunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    try{
      const blob = new Blob(chunks, { type: "audio/webm" });
      const arrayBuffer = await blob.arrayBuffer();

      // decode webm/opus -> raw PCM через AudioContext
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      const mp3Bytes = encodeMp3(audioBuffer);

      // хуки в script.js
      if(currentMode === "word" && typeof window.onWordAudioReady === "function"){
        window.onWordAudioReady(currentId, mp3Bytes);
      }
      if(currentMode === "example" && typeof window.onExampleAudioReady === "function"){
        window.onExampleAudioReady(currentId, mp3Bytes);
      }
    }catch(err){
      console.error(err);
      alert("Не удалось обработать запись (mp3).");
    }
  };

  mediaRecorder.start();

  const stop = confirm("Запись началась. Нажми OK чтобы остановить.");
  if(stop){
    mediaRecorder.stop();
    stream.getTracks().forEach(t => t.stop());
  }
}

function encodeMp3(audioBuffer){
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;

  const mp3Encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, 128);
  const samplesL = audioBuffer.getChannelData(0);
  const samplesR = numChannels > 1 ? audioBuffer.getChannelData(1) : null;

  const blockSize = 1152;
  let mp3Data = [];

  for(let i=0; i<samplesL.length; i+=blockSize){
    const chunkL = floatTo16BitPCM(samplesL.subarray(i, i+blockSize));
    let mp3buf;
    if(numChannels > 1){
      const chunkR = floatTo16BitPCM(samplesR.subarray(i, i+blockSize));
      mp3buf = mp3Encoder.encodeBuffer(chunkL, chunkR);
    }else{
      mp3buf = mp3Encoder.encodeBuffer(chunkL);
    }
    if(mp3buf.length) mp3Data.push(new Uint8Array(mp3buf));
  }

  const end = mp3Encoder.flush();
  if(end.length) mp3Data.push(new Uint8Array(end));

  // concat
  let total = 0;
  mp3Data.forEach(a => total += a.length);
  const out = new Uint8Array(total);
  let offset = 0;
  mp3Data.forEach(a => { out.set(a, offset); offset += a.length; });

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
