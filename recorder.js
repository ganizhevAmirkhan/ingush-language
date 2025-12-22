async function recordWord(){
  startRecording("words", current.id);
}

async function recordExample(){
  const id = "ex_" + Date.now();
  current.senses[0].examples[0].audio = id+".mp3";
  startRecording("examples", id);
}

