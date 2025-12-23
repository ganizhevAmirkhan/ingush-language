// build_dictionary_v3.js
// Node.js >= 18

import fs from "fs";

const SOURCE = "./dictionary_v2.json";

const src = JSON.parse(fs.readFileSync(SOURCE, "utf8"));

const publicWords = [];
const adminWords = [];

for (const w of src.words) {
  // --- чистим senses ---
  const cleanSenses = (w.senses || []).map(s => {
    const examples = (s.examples || [])
      .filter(e => e.ing || e.ru) // убираем пустые заглушки
      .map(e => ({
        id: e.id || null,
        ing: e.ing,
        ru: e.ru,
        audio: Boolean(e.audio)
      }));

    return {
      ing: s.ing,
      ...(examples.length ? { examples } : {})
    };
  });

  // --- PUBLIC ---
  publicWords.push({
    id: w.id,
    ru: w.ru,
    ...(w.pos ? { pos: w.pos } : {}),
    senses: cleanSenses,
    audio: Boolean(w.audio?.word)
  });

  // --- ADMIN ---
  adminWords.push({
    id: w.id,
    ru: w.ru,
    ...(w.pos ? { pos: w.pos } : {}),
    senses: cleanSenses,
    audio: { word: Boolean(w.audio?.word) },
    ...(w.source ? { source: w.source } : {})
  });
}

fs.mkdirSync("../public", { recursive: true });
fs.mkdirSync("../admin", { recursive: true });

fs.writeFileSync(
  "../public/dictionary.json",
  JSON.stringify({ version: "3.0", words: publicWords }, null, 2)
);

fs.writeFileSync(
  "../admin/dictionary.admin.json",
  JSON.stringify({ version: "3.0", words: adminWords }, null, 2)
);

console.log("✅ Готово:");
console.log("public/dictionary.json");
console.log("admin/dictionary.admin.json");
