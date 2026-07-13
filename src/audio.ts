// Web Audio node graph and playback (spec/03-reference.md §6.4, §9.1-§9.3; lifecycle in
// spec/01-architecture.md §9, behavior in spec/02-game-design.md §12). Non-reactive module
// singleton — never a Signal (spec/01-architecture.md §3.1).
import { equalPowerGains } from "./gameLogic";

const MASTER_GAIN = 0.25; // overall volume, fixed — no volume slider
const MUTE_RAMP_SECONDS = 0.05; // setTargetAtTime time constant for mute toggling
const CROSSFADE_RAMP_SECONDS = 0.3; // setTargetAtTime time constant for biome crossfade
const CROSSFADE_EPSILON = 0.01; // skip re-applying the crossfade below this delta

const COLLECT_CHIME_FREQUENCIES = [660, 880, 990];
const CAVE_DRIP_MIN_DELAY_SECONDS = 7;
const CAVE_DRIP_MAX_DELAY_SECONDS = 15;

interface AudioGraph {
  ctx: AudioContext;
  masterGain: GainNode;
  forestBedGain: GainNode; // crossfade gain for the Forest ambient bed
  caveBedGain: GainNode; // crossfade gain for the Cave ambient bed
}

let graph: AudioGraph | undefined;
let lastBlend: number | undefined;

function createNoiseBuffer(
  context: AudioContext,
  seconds: number,
): AudioBuffer {
  const buffer = context.createBuffer(
    1,
    context.sampleRate * seconds,
    context.sampleRate,
  );
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

// Oscillator + gain, already connected to destination — the plumbing shared by every
// tone this module plays. Callers shape the envelope and choose start/stop times.
function createTone(
  context: AudioContext,
  destination: AudioNode,
  type: OscillatorType,
  frequency: number,
): { osc: OscillatorNode; gain: GainNode } {
  const osc = context.createOscillator();
  osc.type = type;
  osc.frequency.value = frequency;
  const gain = context.createGain();
  osc.connect(gain).connect(destination);
  return { osc, gain };
}

// Forest ambient bed: warm low drone + filtered noise leaf-rustle (spec/03-reference.md §9.2).
function createForestBed(context: AudioContext, destination: AudioNode): void {
  const droneGain = context.createGain();
  droneGain.gain.value = 0.1;
  droneGain.connect(destination);

  const drone = context.createOscillator();
  drone.type = "sawtooth";
  drone.frequency.value = 55;
  const droneFilter = context.createBiquadFilter();
  droneFilter.type = "lowpass";
  droneFilter.frequency.value = 220;
  drone.connect(droneFilter).connect(droneGain);

  // Slow wavering LFO on the drone gain, depth +-20%.
  const lfo = context.createOscillator();
  lfo.frequency.value = 0.05;
  const lfoGain = context.createGain();
  lfoGain.gain.value = droneGain.gain.value * 0.2;
  lfo.connect(lfoGain).connect(droneGain.gain);

  const rustleGain = context.createGain();
  rustleGain.gain.value = 0.04;
  rustleGain.connect(destination);

  const noise = context.createBufferSource();
  noise.buffer = createNoiseBuffer(context, 2);
  noise.loop = true;
  const noiseFilter = context.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.value = 800;
  noiseFilter.Q.value = 0.8;
  noise.connect(noiseFilter).connect(rustleGain);

  drone.start();
  lfo.start();
  noise.start();
}

// Cave ambient bed: deep two-tone drone + occasional pitched drips (spec/03-reference.md §9.2).
function createCaveBed(context: AudioContext, destination: AudioNode): void {
  const droneGain = context.createGain();
  droneGain.gain.value = 0.12;
  droneGain.connect(destination);

  const drone1 = context.createOscillator();
  drone1.type = "sine";
  drone1.frequency.value = 41;
  drone1.connect(droneGain);

  const drone2 = context.createOscillator();
  drone2.type = "sine";
  drone2.frequency.value = 61.5;
  drone2.connect(droneGain);

  drone1.start();
  drone2.start();

  scheduleCaveDrip(context, destination);
}

function scheduleCaveDrip(context: AudioContext, destination: AudioNode) {
  const delaySeconds =
    CAVE_DRIP_MIN_DELAY_SECONDS +
    Math.random() * (CAVE_DRIP_MAX_DELAY_SECONDS - CAVE_DRIP_MIN_DELAY_SECONDS);
  setTimeout(() => {
    playCaveDrip(context, destination);
    scheduleCaveDrip(context, destination);
  }, delaySeconds * 1000);
}

function playCaveDrip(context: AudioContext, destination: AudioNode) {
  const now = context.currentTime;
  const { osc, gain } = createTone(context, destination, "sine", 880);
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.exponentialRampToValueAtTime(440, now + 0.3);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.08, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
  osc.start(now);
  osc.stop(now + 0.3);
}

function playTone(
  frequency: number,
  type: OscillatorType,
  attackSeconds: number,
  releaseSeconds: number,
  peakGain: number,
) {
  if (!graph) return;
  const now = graph.ctx.currentTime;
  const { osc, gain } = createTone(
    graph.ctx,
    graph.masterGain,
    type,
    frequency,
  );
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peakGain, now + attackSeconds);
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    now + attackSeconds + releaseSeconds,
  );
  osc.start(now);
  osc.stop(now + attackSeconds + releaseSeconds);
}

// Create AudioContext + beds; call ONLY from a user-gesture handler (spec/01-architecture.md §9).
export function init(): void {
  if (graph) return;
  const ctx = new AudioContext();
  ctx.resume();

  const masterGain = ctx.createGain();
  masterGain.gain.value = MASTER_GAIN;
  masterGain.connect(ctx.destination);

  const forestBedGain = ctx.createGain();
  forestBedGain.gain.value = 1; // equalPowerGains(0) = { a: 1, b: 0 }
  forestBedGain.connect(masterGain);
  createForestBed(ctx, forestBedGain);

  const caveBedGain = ctx.createGain();
  caveBedGain.gain.value = 0;
  caveBedGain.connect(masterGain);
  createCaveBed(ctx, caveBedGain);

  graph = { ctx, masterGain, forestBedGain, caveBedGain };
}

// t matches biomeBlendAt's coefficient exactly (spec/02-game-design.md §12). Callers may
// invoke this every frame — the crossfade throttle lives inside this module.
export function setBiomeBlend(t: number): void {
  if (!graph) return;
  const clamped = Math.min(1, Math.max(0, t));
  if (
    lastBlend !== undefined &&
    Math.abs(clamped - lastBlend) < CROSSFADE_EPSILON
  ) {
    return;
  }
  lastBlend = clamped;
  const { a, b } = equalPowerGains(clamped);
  const now = graph.ctx.currentTime;
  graph.forestBedGain.gain.setTargetAtTime(a, now, CROSSFADE_RAMP_SECONDS);
  graph.caveBedGain.gain.setTargetAtTime(b, now, CROSSFADE_RAMP_SECONDS);
}

export function setMuted(muted: boolean): void {
  if (!graph) return;
  const now = graph.ctx.currentTime;
  graph.masterGain.gain.setTargetAtTime(
    muted ? 0 : MASTER_GAIN,
    now,
    MUTE_RAMP_SECONDS,
  );
}

export function playCollectChime(): void {
  const frequency =
    COLLECT_CHIME_FREQUENCIES[
      Math.floor(Math.random() * COLLECT_CHIME_FREQUENCIES.length)
    ];
  playTone(frequency, "sine", 0.005, 0.6, 0.15);
}

export function playBrazierSwell(): void {
  if (!graph) return;
  const now = graph.ctx.currentTime;
  const { osc, gain } = createTone(graph.ctx, graph.masterGain, "sine", 110);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.2, now + 0.6);
  gain.gain.linearRampToValueAtTime(0.0001, now + 1.2);
  osc.start(now);
  osc.stop(now + 1.2);
}

export function playInscriptionBell(): void {
  playTone(528, "triangle", 0.005, 2, 0.12);
}
