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

/* Waking the audio context is the one call the browser can refuse, and a
 * refusal must never reach the page as an unhandled rejection. The sound
 * is a nicety; a game that throws because of it is a broken game. */
async function resume() {
  const audio = getContext();
  if (!audio) return null;
  if (audio.state === "suspended") {
    try {
      await audio.resume();
    } catch {
      return null;
    }
  }
  if (audio.state === "closed") return null;
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

/* The background drone.
 *
 * It waits for a real gesture, because a browser will not let audio start
 * without one, and it stops when the page is hidden, because a phone in
 * a pocket should not be humming all evening. */
let gestureWatched = false;

export function watchForGesture() {
  if (gestureWatched) return;
  gestureWatched = true;

  const start = () => {
    if (!enabled) return;
    void primeAudio();
  };

  for (const name of ["pointerdown", "keydown", "touchstart"]) {
    window.addEventListener(name, start, { once: false, passive: true });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopAmbient();
      return;
    }
    if (enabled) void primeAudio();
  });
}

export async function setAudioEnabled(next) {
  enabled = Boolean(next);
  savePreference();
  if (!enabled) {
    stopAmbient();
    return enabled;
  }
  await primeAudio();
  await playSound("confirm");
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
  try {
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
  } catch {
    // The context went away between the check and the call. Nothing to do.
  }
}
