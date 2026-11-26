/** Rough language guess for short robot replies (Swedish vs English); null when no clear signal. */
const SV = new Set(["det", "är", "och", "jag", "blir", "inte", "du", "vad", "som", "på", "med", "för", "har", "klockan", "klart", "ja", "nej", "hej", "tre", "sex", "en", "ett", "att", "kan", "vill"]);
const EN = new Set(["it", "it's", "its", "is", "the", "and", "you", "i", "what", "that", "with", "for", "have", "yes", "no", "hello", "three", "six", "a", "an", "to", "can", "will", "equals", "makes", "answer"]);

export function guessReplyLanguage(text: string): "sv" | "en" | null {
  const lower = text.toLowerCase();
  let sv = /[åäö]/.test(lower) ? 2 : 0, en = 0;
  for (const w of lower.split(/[^a-zåäö']+/).filter(Boolean)) { if (SV.has(w)) sv++; if (EN.has(w)) en++; }
  if (sv === en) return null;
  return sv > en ? "sv" : "en";
}
