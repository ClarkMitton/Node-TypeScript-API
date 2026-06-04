// Web Audio API tones — generated programmatically. No external sound files.
// Volume is global and persisted in localStorage.

let ctx: AudioContext | null = null;
function getCtx() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

export function getVolume(): number {
  if (typeof window === "undefined") return 0.4;
  const v = localStorage.getItem("il_volume");
  return v ? parseFloat(v) : 0.4;
}
export function setVolume(v: number) {
  localStorage.setItem("il_volume", String(v));
}

function tone(freq: number, durationMs: number, type: OscillatorType = "sine", gainMul = 1) {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  const v = getVolume() * gainMul;
  g.gain.setValueAtTime(0, c.currentTime);
  g.gain.linearRampToValueAtTime(v, c.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + durationMs / 1000);
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + durationMs / 1000 + 0.05);
}

export const sounds = {
  slotAdvance: () => { tone(523, 90, "sine", 0.6); setTimeout(() => tone(784, 140, "sine", 0.6), 80); },
  questionReveal: () => { tone(660, 80, "triangle", 0.7); setTimeout(() => tone(880, 120, "triangle", 0.7), 70); setTimeout(() => tone(1100, 180, "triangle", 0.7), 160); },
  countdownTick: () => { tone(440, 60, "square", 0.3); },
  countdownEnd: () => { tone(220, 200, "sawtooth", 0.6); setTimeout(() => tone(165, 320, "sawtooth", 0.6), 180); },
  connect: () => { tone(880, 80, "sine", 0.5); setTimeout(() => tone(1320, 120, "sine", 0.5), 60); },
  launch: () => { tone(330, 80, "triangle", 0.7); setTimeout(() => tone(523, 90, "triangle", 0.7), 70); setTimeout(() => tone(784, 110, "triangle", 0.7), 150); setTimeout(() => tone(1046, 240, "triangle", 0.8), 240); },
};
