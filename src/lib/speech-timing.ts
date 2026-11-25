// Pure parser for the robot's USB log during an automated speech test.
// Firmware v30 prints "[TID] ..." lines with robot-measured milliseconds since the request.
export type SpeechRun = {
  prompt: string;
  firstTextMs?: number;    // app clock: first [ROBOT] transcript line
  firstAudioMs?: number;   // robot clock: first reply audio
  turnDoneMs?: number;     // robot clock: Gemini said the turn is complete
  playbackDoneMs?: number; // robot clock: speaker finished
  tools: string[];
  reply: string;
  error?: string;
  done: boolean;
};

export const SPEECH_TEST_TIMEOUT_MS = 45000;

export function newRun(prompt: string): SpeechRun { return { prompt, tools: [], reply: "", done: false }; }

const num = (line: string, key: string) => { const m = new RegExp(`${key}=(\\d+)`).exec(line); return m?.[1] ? Number(m[1]) : undefined; };

/** Apply one log line (elapsedMs = app time since the command was sent). Returns a new run. */
export function applyLine(run: SpeechRun, line: string, elapsedMs: number): SpeechRun {
  if (run.done) return run;
  const r: SpeechRun = { ...run, tools: [...run.tools] };
  if (line.startsWith("[ROBOT]")) {
    if (r.firstTextMs === undefined) r.firstTextMs = elapsedMs;
    r.reply = (r.reply + " " + line.slice(7).trim()).trim().slice(0, 400);
  } else if (line.startsWith("[VERKTYG]")) {
    const name = line.slice(9).trim().split(/\s/)[0];
    if (name) r.tools.push(name);
  } else if (line.startsWith("[TID]")) {
    const audio = num(line, "forsta_ljud_ms");
    if (audio !== undefined) r.firstAudioMs = audio;
    const turn = num(line, "tur_klar_ms");
    if (turn !== undefined) r.turnDoneMs = turn;
    const play = num(line, "uppspelning_klar_ms");
    if (play !== undefined) { r.playbackDoneMs = play; r.done = true; }
    if (line.includes("timeout_ms")) { r.error = "Inget svar inom 30 s"; r.done = true; }
  } else if (line.includes("GeminiLive: touch interrupted")) {
    r.error = "Avbruten: någon tryckte på robotens skärm"; r.done = true;
  } else if (/CMD say: rejected/.test(line)) {
    r.error = "Roboten tog inte emot frågan"; r.done = true;
  } else if (/GeminiLive: .*(error=\S|failed|timeout|\berror\b(?!=))/i.test(line) && !/mic level|ok=true/.test(line)) {
    r.error = line.slice(0, 160); r.done = true;
  }
  if (!r.done && elapsedMs >= SPEECH_TEST_TIMEOUT_MS) { r.error = "Testet tog för lång tid (45 s)"; r.done = true; }
  return r;
}

export const PRESETS = [
  { label: "Kort svar", prompt: "Svara bara med ordet hej." },
  { label: "Längre svar", prompt: "Förklara kort i tre meningar hur en regnbåge uppstår." },
  { label: "Engelska", prompt: "Answer in English in one sentence: what is the capital of Norway?" },
  { label: "Webbsökning", prompt: "Sök på nätet: vad blir vädret i Stockholm i morgon? Svara kort." },
  { label: "Rörelse", prompt: "Nicka en gång och säg sedan klart." },
  { label: "Att göra: lägg till", prompt: "Lägg till köpa kaffe på min att-göra-lista." },
  { label: "Att göra: läs upp", prompt: "Vad har jag på min att-göra-lista?" },
];
