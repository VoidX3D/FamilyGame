/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
const AUDIO_KEY = "fg:audio:v1";
let context = null;
let master = null;
let ambient = null;
let enabled = readPreference();

function readPreference() {
  try {
    return localStorage.getItem(AUDIO_KEY) !== "off";
  } catch {
    return true;
  }
}

function savePreference() {
  try {
    localStorage.setItem(AUDIO_KEY, enabled ? "on" : "off");
  } catch {
    // Audio still works for this tab when storage is blocked.
  }
}

function getContext() {
  if (context) return context;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  context = new AudioContext();
  master = context.createGain();
  master.gain.value = 0.14;
  master.connect(context.destination);
  return context;
}

async function resume() {
  const audio = getContext();
  if (!audio) return null;
  if (audio.state === "suspended") await audio.resume();
  return audio;
}

export function audioIsEnabled() {
  return enabled;
}

export async function primeAudio() {
  if (!enabled) return;
  const audio = await resume();
  if (audio) startAmbient(audio);
}

function startAmbient(audio = context) {
  if (!enabled || ambient || !audio || audio.state === "closed") return;

  const output = audio.createGain();
  output.gain.value = 0.018;
  output.connect(master);

  const low = audio.createOscillator();
  const high = audio.createOscillator();
  low.type = "sine";
  high.type = "triangle";
  low.frequency.value = 110;
  high.frequency.value = 165;
  low.connect(output);
  high.connect(output);
  low.start();
  high.start();
  ambient = { output, low, high };
}

function stopAmbient() {
  if (!ambient || !context) return;
  const now = context.currentTime;
  ambient.output.gain.cancelScheduledValues(now);
  ambient.output.gain.setTargetAtTime(0, now, 0.08);
  ambient.low.stop(now + 0.35);
  ambient.high.stop(now + 0.35);
  ambient = null;
}

export async function setAudioEnabled(next) {
  enabled = Boolean(next);
  savePreference();
  if (!enabled) {
    stopAmbient();
    return enabled;
  }
  await primeAudio();
  playSound("confirm");
  return enabled;
}

export async function toggleAudio() {
  return setAudioEnabled(!enabled);
}

export async function playSound(kind = "tap") {
  if (!enabled) return;
  const audio = await resume();
  if (!audio || !master) return;

  const notes = {
    tap: [440, 0.045, "sine"],
    confirm: [660, 0.08, "triangle"],
    success: [880, 0.1, "sine"],
    error: [180, 0.12, "sawtooth"],
    join: [523.25, 0.1, "triangle"],
  };
  const [frequency, duration, type] = notes[kind] || notes.tap;
  const now = audio.currentTime;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  if (kind === "success") oscillator.frequency.exponentialRampToValueAtTime(1320, now + duration);
  if (kind === "error") oscillator.frequency.exponentialRampToValueAtTime(120, now + duration);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(kind === "tap" ? 0.12 : 0.2, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain);
  gain.connect(master);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.03);
}
