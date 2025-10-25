import * as ToneModule from "tone";

const Tone = ToneModule?.Tone ?? ToneModule?.default ?? globalThis.Tone;

const isToneAvailable =
  !!Tone &&
  typeof Tone.PolySynth === "function" &&
  typeof Tone.start === "function";

if (!isToneAvailable && typeof console !== "undefined") {
  console.warn("Tone.js failed to load; sound effects are disabled.");
}

const UNLOCK_EVENTS = ["pointerdown", "touchstart", "mousedown", "keydown"];

let synth = null;
let reverb = null;
let delay = null;
let filter = null;
let vibrato = null;
let limiter = null;
let volume = null;
let isAudioUnlocked = false;
let unlockListenersAttached = false;
let isInitialized = false;

function ensureAudioGraph() {
  if (!isToneAvailable || synth) {
    return;
  }

  synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: {
      type: "sine"
    },
    envelope: {
      attack: 0.001,
      decay: 0.28,
      sustain: 0.05,
      release: 0.9
    }
  });

  vibrato = new Tone.Vibrato({
    frequency: 5,
    depth: 0.08
  });

  filter = new Tone.Filter({
    type: "lowpass",
    frequency: 3600,
    Q: 0.8
  });

  reverb = new Tone.Reverb({
    decay: 3.2,
    preDelay: 0.02,
    wet: 0.45
  });

  delay = new Tone.PingPongDelay({
    delayTime: "8n",
    feedback: 0.18,
    wet: 0.15
  });

  volume = new Tone.Volume(-10);
  limiter = new Tone.Limiter(-6);

  synth.chain(vibrato, filter, reverb, delay, volume, limiter, Tone.Destination);
}

function removeUnlockListeners() {
  if (typeof document === "undefined") {
    return;
  }

  UNLOCK_EVENTS.forEach((eventName) => {
    document.removeEventListener(eventName, handleUnlock);
  });

  unlockListenersAttached = false;
}

async function unlockAudio() {
  if (!isToneAvailable || isAudioUnlocked) {
    return;
  }

  try {
    await Tone.start();
    isAudioUnlocked = true;
    ensureAudioGraph();
  } catch (error) {
    isAudioUnlocked = false;
    attachUnlockListeners();
  }
}

async function handleUnlock() {
  removeUnlockListeners();
  await unlockAudio();
}

function attachUnlockListeners() {
  if (!isToneAvailable || typeof document === "undefined" || unlockListenersAttached || isAudioUnlocked) {
    return;
  }

  UNLOCK_EVENTS.forEach((eventName) => {
    document.addEventListener(eventName, handleUnlock, { once: true, passive: true });
  });

  unlockListenersAttached = true;
}

export function initializeSoundEffects() {
  if (isInitialized) {
    return;
  }

  isInitialized = true;

  if (!isToneAvailable) {
    return;
  }

  ensureAudioGraph();
  attachUnlockListeners();
}

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

function getScaleForSphereType(type) {
  if (type === "glow") {
    return {
      root: 69, // A4
      intervals: [0, 2, 4, 7, 9]
    };
  }

  return {
    root: 65, // F4
    intervals: [0, 3, 5, 7, 10]
  };
}

function calculateImpactEnergy({ impactStrength = 0, baseSpeed = 0, radius = 1 }) {
  const impactComponent = clamp01(impactStrength / 3.2);
  const speedComponent = clamp01(baseSpeed / 3.2);
  const radiusComponent = clamp01((radius - 0.5) / 1.1);

  const baseEnergy = 0.12;
  const energy = baseEnergy + impactComponent * 0.7 + speedComponent * 0.12 + radiusComponent * 0.1;

  return clamp01(energy);
}

function getNoteSet({ sphereType, radius, hue, energy }) {
  if (!isToneAvailable) {
    return [];
  }

  const { root, intervals } = getScaleForSphereType(sphereType);
  const primaryInterval = intervals[Math.floor(Math.random() * intervals.length)];
  const radiusOffset = Math.round(clamp01((radius - 0.7) / 0.9));
  const hueOffset = typeof hue === "number" ? Math.round(hue * 2) : 0;

  const baseMidi = root + primaryInterval + radiusOffset + hueOffset;
  const harmonicLift = sphereType === "glow" ? 12 : 7;
  const harmonicSpread = sphereType === "glow" ? 5 : 3;
  const harmonyMidi = baseMidi + harmonicLift + Math.floor(Math.random() * harmonicSpread);

  const notes = [Tone.Frequency(baseMidi, "midi").toNote()];

  if (energy > 0.55) {
    notes.push(Tone.Frequency(harmonyMidi, "midi").toNote());
  }

  if (energy > 0.75) {
    const upperHarmonic = harmonyMidi + 7;
    notes.push(Tone.Frequency(upperHarmonic, "midi").toNote());
  }

  return notes;
}

export function playCollisionSound({
  impactStrength = 0,
  baseSpeed = 0,
  radius = 1,
  sphereType = "generic",
  hue = null
} = {}) {
  if (!isToneAvailable) {
    return;
  }

  if (!synth) {
    ensureAudioGraph();
  }

  if (!isAudioUnlocked || !synth) {
    return;
  }

  const energy = calculateImpactEnergy({ impactStrength, baseSpeed, radius });
  const notes = getNoteSet({ sphereType, radius, hue, energy });

  if (notes.length === 0) {
    return;
  }

  const now = Tone.now();
  const duration = 0.18 + energy * 0.28;
  const velocity = 0.2 + energy * 0.65;

  const detuneRange = sphereType === "glow" ? 16 : 10;
  const detuneAmount = (Math.random() - 0.5) * detuneRange;
  synth.set({ detune: detuneAmount });

  if (reverb) {
    const targetWet = 0.32 + energy * 0.28;
    reverb.wet.rampTo(targetWet, 0.08);
  }

  if (delay) {
    const targetWet = 0.12 + energy * 0.22;
    delay.wet.rampTo(targetWet, 0.08);
  }

  if (filter) {
    const baseFrequency = sphereType === "glow" ? 4200 : 3200;
    const hueInfluence = typeof hue === "number" ? hue : Math.random() * 0.5;
    const targetFrequency = baseFrequency + hueInfluence * 1200 + energy * 1200;
    filter.frequency.rampTo(targetFrequency, 0.06);
  }

  synth.triggerAttackRelease(notes, duration, now, velocity);
}
