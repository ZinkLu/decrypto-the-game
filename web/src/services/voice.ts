import { create } from "zustand";
import { listenVoice, useGameStore } from "@/store/gameStore";
import { isEditingTarget } from "@/console/shortcuts";
import {
  apart, audible, speakingTo, voiceTurn,
  type IntercomDeck, type IntercomPosition, type VoiceChannel, type VoiceMode, type VoiceView,
} from "@/console/voice";
import { cloudflareLink } from "./cloudflareVoice";

/** The microphone, once for each channel: the one not spoken on carries silence. */
export interface Outgoing {
  table: MediaStreamTrack;
  team: MediaStreamTrack;
}

/** What a voice service's page side reports back. */
export interface VoiceHost {
  /** A signal for the server's voice service. */
  send(signal: unknown): void;
  /** A track this page may hear, under an id of the link's own. */
  hear(id: string, speaker: string, channel: VoiceChannel, track: MediaStreamTrack): void;
  drop(id: string): void;
  connected(): void;
  failed(reason: string): void;
}

/** The page side of a voice service. It starts as soon as it is made. */
export interface VoiceLink {
  /** A signal of the server's voice service. */
  receive(signal: unknown): void;
  close(): void;
}

/** Page code for each voice service the server may name. */
const links: Record<string, (out: Outgoing, host: VoiceHost) => VoiceLink> = { cloudflare: cloudflareLink };

/** Key held or pressed to talk: the physical key left of 1. */
export const talkKey = "Backquote";

export interface VoiceState {
  /** "off" until joined, "starting" until first connected, "reconnecting" after a loss. */
  status: "off" | "starting" | "on" | "reconnecting";
  /** Why this page only listens, when it does. */
  listenOnly: string;
  micOn: boolean;
  holding: boolean;
  whisper: boolean;
  mode: VoiceMode;
  volume: number;
  /** Players heard on any channel, and those of them, or this player, speaking now. */
  heard: string[];
  speaking: string[];
  /** Said for a few seconds when the table splits or comes back together. */
  notice: string;
  /** The console carries the intercom: without power or its network cable it neither speaks nor hears. */
  machine: boolean;
}

function readPreferences(): Pick<VoiceState, "mode" | "volume"> {
  try {
    const saved = JSON.parse(localStorage.getItem("decrypto-voice") ?? "{}") as Partial<VoiceState>;
    return {
      mode: saved.mode === "hold" ? "hold" : "toggle",
      volume: typeof saved.volume === "number" && saved.volume >= 0 && saved.volume <= 1 ? saved.volume : 0.9,
    };
  } catch {
    return { mode: "toggle", volume: 0.9 };
  }
}

function savePreferences() {
  const { mode, volume } = useVoice.getState();
  try {
    localStorage.setItem("decrypto-voice", JSON.stringify({ mode, volume }));
  } catch {
    /* Kept for this visit only. */
  }
}

export const useVoice = create<VoiceState>(() => ({
  status: "off",
  listenOnly: "",
  micOn: true,
  holding: false,
  whisper: false,
  ...readPreferences(),
  heard: [],
  speaking: [],
  notice: "",
  machine: true,
}));

interface Remote {
  speaker: string;
  channel: VoiceChannel;
  track: MediaStreamTrack;
  element: HTMLAudioElement;
  source: MediaStreamAudioSourceNode;
  gate: GainNode;
  level: AnalyserNode;
}

let audio: AudioContext | null = null;
let master: GainNode | null = null;
let microphone: MediaStream | null = null;
let out: Outgoing | null = null;
let mine: AnalyserNode | null = null;
let link: VoiceLink | null = null;
let generation = 0;
let attempts = 0;
let retry: ReturnType<typeof setTimeout> | undefined;
let meter: ReturnType<typeof setInterval> | undefined;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
let lastView: VoiceView | null = null;
const remotes = new Map<string, Remote>();

/** The game as the voice rules see it. */
export function currentView(): VoiceView {
  const g = useGameStore.getState();
  const team = g.teamA.some((p) => p.id === g.myPlayerID) ? "A" : g.teamB.some((p) => p.id === g.myPlayerID) ? "B" : "";
  return { phase: g.phase, role: g.myRole, team, encryptor: g.encryptorID };
}

/** Joins the voice of the room. Called from a click, which lets the page play sound. */
export async function startVoice() {
  const make = links[useGameStore.getState().voice];
  if (useVoice.getState().status !== "off" || !make) return;
  useVoice.setState({ status: "starting", listenOnly: "", micOn: true, holding: false });
  audio = new AudioContext();
  void audio.resume();
  master = audio.createGain();
  master.gain.value = useVoice.getState().volume;
  master.connect(audio.destination);
  let listenOnly = "";
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("no media devices");
    microphone = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (error) {
    listenOnly = (error as Error).name === "NotAllowedError" ? "麦克风未获授权，只能收听" : "没有可用的麦克风，只能收听";
  }
  if (useVoice.getState().status !== "starting" || !audio) {
    microphone?.getTracks().forEach((t) => t.stop());
    microphone = null;
    return; // left while the browser asked for the microphone
  }
  let source: MediaStreamTrack;
  if (microphone) {
    source = microphone.getAudioTracks()[0];
    mine = audio.createAnalyser();
    mine.fftSize = 512;
    audio.createMediaStreamSource(microphone).connect(mine);
  } else {
    // Without a microphone the page publishes silence, and still hears the room.
    source = audio.createMediaStreamDestination().stream.getAudioTracks()[0];
  }
  out = { table: source, team: source.clone() };
  useVoice.setState({ listenOnly });
  window.addEventListener("keydown", keyDown);
  window.addEventListener("keyup", keyUp);
  window.addEventListener("blur", release);
  meter = setInterval(measure, 120);
  lastView = currentView();
  apply();
  connect();
}

export function stopVoice() {
  clearTimeout(retry);
  clearInterval(meter);
  clearTimeout(noticeTimer);
  // The link says goodbye before it is cut off.
  link?.close();
  link = null;
  generation++;
  for (const id of [...remotes.keys()]) remove(id);
  out?.table.stop();
  out?.team.stop();
  microphone?.getTracks().forEach((t) => t.stop());
  out = microphone = mine = null;
  void audio?.close();
  audio = master = null;
  lastView = null;
  window.removeEventListener("keydown", keyDown);
  window.removeEventListener("keyup", keyUp);
  window.removeEventListener("blur", release);
  useVoice.setState({ status: "off", listenOnly: "", holding: false, whisper: false, heard: [], speaking: [], notice: "" });
}

export function setMic(on: boolean) {
  useVoice.setState({ micOn: on });
  apply();
}

/** Talk while held, in the "hold" mode. */
export function hold(down: boolean) {
  if (useVoice.getState().holding === down) return;
  useVoice.setState({ holding: down });
  apply();
}

export function setWhisper(on: boolean) {
  useVoice.setState({ whisper: on });
  apply();
}

/** Chooses table or team for a joined line; guessing keeps the team's forced channel. */
export function toggleVoiceChannel(): boolean {
  const s = useVoice.getState();
  const view = currentView();
  if (s.status !== "on" || !s.machine || s.listenOnly || !view.team || apart(view)) return false;
  clearTimeout(noticeTimer);
  useVoice.setState({ whisper: !s.whisper, notice: "" });
  apply();
  return true;
}

export function setMode(mode: VoiceMode) {
  useVoice.setState({ mode, holding: false });
  savePreferences();
  apply();
}

/** Powers the intercom down with the console, or up again; the line itself stays. */
export function setMachine(ready: boolean) {
  if (useVoice.getState().machine === ready) return;
  useVoice.setState(ready ? { machine: true } : { machine: false, holding: false });
  apply();
}

/** Turns the console's selector: OFF leaves the line, ALL and TEAM join it and choose whom to talk to. */
export function turnIntercom(position: IntercomPosition) {
  if (position === "off") {
    stopVoice();
    return;
  }
  setWhisper(position === "team");
  // Joining asks for the microphone, which this click allows.
  if (useVoice.getState().status === "off") void startVoice();
}

/** The TALK key: a click latches or releases it in toggle mode; in hold mode it talks while held down. */
export function talk(event: "click" | "down" | "up") {
  const s = useVoice.getState();
  if (s.mode === "toggle") {
    if (event === "click") setMic(!s.micOn);
  } else if (event !== "click") hold(event === "down");
}

/** What the console's intercom shows. */
export function intercomDeck(): IntercomDeck {
  const g = useGameStore.getState();
  const s = useVoice.getState();
  const line = s.status === "off" ? "off" : s.status === "on" ? "on" : "connecting";
  return {
    available: !!links[g.voice] && !!g.roomCode,
    line,
    selector: s.status === "off" ? "off" : s.whisper ? "team" : "all",
    route: line === "on" && s.machine ? speakingTo(currentView(), s.whisper) : null,
    open: !s.listenOnly && (s.mode === "toggle" ? s.micOn : s.holding),
    mode: s.mode,
    listenOnly: !!s.listenOnly,
  };
}

/** How loud what this seat hears is now, from 0 to 1: the RX lamp follows it. */
export function hearing() {
  let level = 0;
  for (const r of remotes.values()) level = Math.max(level, rms(r.level));
  return Math.min(1, level * 6);
}

export function setVolume(volume: number) {
  useVoice.setState({ volume });
  savePreferences();
  if (audio && master) master.gain.setTargetAtTime(volume, audio.currentTime, 0.05);
}

function keyDown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 ||
      event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || isEditingTarget(event.target)) return;
  if (event.key.toLowerCase() === "v") {
    if (toggleVoiceChannel()) event.preventDefault();
    return;
  }
  if (event.code !== talkKey) return;
  const s = useVoice.getState();
  if (!s.machine || s.status === "off" || s.listenOnly) return;
  event.preventDefault();
  if (s.mode === "hold") hold(true);
  else setMic(!s.micOn);
}

function keyUp(event: KeyboardEvent) {
  // Focus, composition or machine state may have changed since the press.
  if (event.code === talkKey) hold(false);
}

function release() {
  hold(false);
}

/** Opens a line when the game connection is up, and waits for it otherwise. */
function connect() {
  const g = useGameStore.getState();
  const make = links[g.voice];
  clearTimeout(retry);
  if (!out || link) return;
  if (!make || !g.connected || g.recovering || !g.roomCode) {
    useVoice.setState({ status: useVoice.getState().status === "starting" ? "starting" : "reconnecting" });
    return;
  }
  const line = ++generation;
  const current = () => line === generation;
  link = make(out, {
    send: (signal) => {
      if (current()) useGameStore.getState().wsService?.send("voice_signal", signal);
    },
    hear: (id, speaker, channel, track) => {
      if (current()) hear(id, speaker, channel, track);
    },
    drop: (id) => {
      if (current()) remove(id);
    },
    connected: () => {
      if (!current()) return;
      attempts = 0;
      useVoice.setState({ status: "on" });
    },
    failed: () => {
      if (!current()) return;
      lose();
      // Joining again too soon is refused by the server.
      retry = setTimeout(connect, Math.min(15_000, 2_500 * 2 ** attempts++));
    },
  });
}

/** Forgets the line and what it carried; the page joins again later. */
function lose() {
  link?.close();
  link = null;
  generation++;
  for (const id of [...remotes.keys()]) remove(id);
  useVoice.setState({ status: "reconnecting" });
}

function hear(id: string, speaker: string, channel: VoiceChannel, track: MediaStreamTrack) {
  if (!audio || !master) return;
  const known = remotes.get(id);
  if (known && known.track === track && known.speaker === speaker && known.channel === channel) return;
  if (known) remove(id);
  const stream = new MediaStream([track]);
  // Chrome sends a remote stream to Web Audio only while a media element plays it.
  const element = new Audio();
  element.muted = true;
  element.srcObject = stream;
  void element.play().catch(() => undefined);
  const source = audio.createMediaStreamSource(stream);
  const gate = audio.createGain();
  gate.gain.value = useVoice.getState().machine && audible(currentView(), channel, speaker) ? 1 : 0;
  const level = audio.createAnalyser();
  level.fftSize = 512;
  source.connect(gate).connect(master);
  gate.connect(level);
  remotes.set(id, { speaker, channel, track, element, source, gate, level });
  listHeard();
}

function remove(id: string) {
  const r = remotes.get(id);
  if (!r) return;
  remotes.delete(id);
  r.source.disconnect();
  r.gate.disconnect();
  r.element.srcObject = null;
  listHeard();
}

function listHeard() {
  const heard = [...new Set([...remotes.values()].map((r) => r.speaker))].sort();
  if (heard.join() !== useVoice.getState().heard.join()) useVoice.setState({ heard });
}

/** Opens and closes the channels as the game and the controls say. */
function apply() {
  if (!out || !audio) return;
  const view = currentView();
  const s = useVoice.getState();
  const to = speakingTo(view, s.whisper);
  const open = s.machine && !s.listenOnly && (s.mode === "toggle" ? s.micOn : s.holding);
  out.table.enabled = open && to === "table";
  out.team.enabled = open && to === "team";
  const turn = lastView ? voiceTurn(lastView, view) : null;
  lastView = view;
  const now = audio.currentTime;
  for (const r of remotes.values()) {
    const gain = r.gate.gain;
    const target = s.machine && audible(view, r.channel, r.speaker) ? 1 : 0;
    const value = gain.value;
    // Clears a break-up still running too.
    gain.cancelScheduledValues(0);
    if (turn && target === 0 && value > 0) {
      // The line breaks up before it goes quiet.
      gain.setValueCurveAtTime(new Float32Array([value, 0.2, 0.75, 0.1, 0.45, 0]), now, 0.2);
    } else {
      gain.setValueAtTime(value, now);
      gain.setTargetAtTime(target, now, 0.03);
    }
  }
  if (turn) {
    squelch(apart(view));
    useVoice.setState({ notice: turn });
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => useVoice.setState({ notice: "" }), 4_000);
  }
}

/**
 * A radio's squelch: the burst of band-limited noise heard as a carrier drops
 * out or comes in. Closing falls from bright to dull; opening rises.
 */
function squelch(closing: boolean) {
  if (!audio) return;
  const now = audio.currentTime;
  const length = closing ? 0.22 : 0.16;
  const noise = audio.createBuffer(1, Math.ceil(audio.sampleRate * length), audio.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  const source = audio.createBufferSource();
  source.buffer = noise;
  const band = audio.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 1.4;
  band.frequency.setValueAtTime(closing ? 2600 : 800, now);
  band.frequency.exponentialRampToValueAtTime(closing ? 600 : 2400, now + length);
  const level = audio.createGain();
  level.gain.setValueAtTime(0.0001, now);
  level.gain.exponentialRampToValueAtTime(closing ? 0.2 : 0.12, now + 0.01);
  level.gain.exponentialRampToValueAtTime(0.0001, now + length);
  source.connect(band).connect(level).connect(audio.destination);
  source.start(now);
  source.stop(now + length);
}

const samples = new Float32Array(512);
function rms(analyser: AnalyserNode) {
  analyser.getFloatTimeDomainData(samples);
  let sum = 0;
  for (const v of samples) sum += v * v;
  return Math.sqrt(sum / samples.length);
}
const loud = (analyser: AnalyserNode) => rms(analyser) > 0.015;

/** Who is speaking, for the lights beside their names. */
function measure() {
  const speaking = new Set<string>();
  for (const r of remotes.values()) if (loud(r.level)) speaking.add(r.speaker);
  if (mine && out && (out.table.enabled || out.team.enabled) && loud(mine)) speaking.add(useGameStore.getState().myPlayerID);
  const list = [...speaking].sort();
  if (list.join() !== useVoice.getState().speaking.join()) useVoice.setState({ speaking: list });
}

listenVoice((signal) => link?.receive(signal));

useGameStore.subscribe((g, before) => {
  if (useVoice.getState().status === "off") return;
  if (!g.roomCode || !links[g.voice]) {
    stopVoice();
    return;
  }
  // The server ends the line with the game connection; it is joined again once the seat is back.
  const up = g.connected && !g.recovering;
  const wasUp = before.connected && !before.recovering;
  if (wasUp && !up) {
    clearTimeout(retry);
    lose();
  } else if (up && !wasUp && !link) {
    attempts = 0;
    connect();
  }
  if (g.phase !== before.phase || g.myRole !== before.myRole || g.encryptorID !== before.encryptorID ||
      g.teamA !== before.teamA || g.teamB !== before.teamB || g.myPlayerID !== before.myPlayerID) apply();
});
