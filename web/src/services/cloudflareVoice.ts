import type { VoiceChannel } from "@/console/voice";
import type { Outgoing, VoiceHost, VoiceLink } from "./voice";

interface Signal {
  op?: string;
  line?: number;
  sdp?: string;
  ice_servers?: RTCIceServer[];
  tracks?: { mid: string; speaker: string; channel: VoiceChannel }[];
  mids?: string[];
}

/**
 * Asks this browser to send next to nothing while a track is silent (Opus
 * DTX), so the channel not spoken on costs almost no traffic. The sender
 * follows the wish of the SFU's latest description, its answer and every
 * later offer alike.
 */
export function withDtx(sdp: string): string {
  const opus = new Set([...sdp.matchAll(/^a=rtpmap:(\d+) opus\/48000/gim)].map((m) => m[1]));
  return sdp.replace(/^(a=fmtp:(\d+) )([^\r\n]*)/gm, (line, head: string, type: string, params: string) =>
    opus.has(type) && !/usedtx=/.test(params) ? `${head}${params};usedtx=1` : line,
  );
}

/**
 * The page side of the Cloudflare Realtime SFU, signalled through this
 * server (see server/internal/voice/cloudflare). One RTCPeerConnection
 * publishes both outgoing tracks once, then answers each offer of the SFU
 * that adds what this player may hear.
 */
export function cloudflareLink(out: Outgoing, host: VoiceHost): VoiceLink {
  let line = 0;
  let peer: RTCPeerConnection | null = null;
  let closed = false;
  let up = false;
  let lost: ReturnType<typeof setTimeout> | undefined;
  // Session descriptions are applied in the order their signals came.
  let work = Promise.resolve();
  const heard = new Map<string, { speaker: string; channel: VoiceChannel }>();
  const send = (op: string, fields: Record<string, unknown> = {}) => host.send({ op, line, ...fields });
  const run = (step: (pc: RTCPeerConnection) => Promise<void>) => {
    work = work.then(() => (closed || !peer ? undefined : step(peer))).catch((error) => fail(String(error)));
  };
  // A line that is not up in time is given up, and may be joined again.
  const deadline = setTimeout(() => fail("timeout"), 20_000);

  function fail(reason: string) {
    if (closed) return;
    close();
    host.failed(reason);
  }

  async function publish(iceServers: RTCIceServer[]) {
    const pc = (peer = new RTCPeerConnection({ iceServers, bundlePolicy: "max-bundle" }));
    pc.addEventListener("connectionstatechange", () => {
      if (closed || peer !== pc) return;
      const state = pc.connectionState;
      if (state === "connected") {
        clearTimeout(lost);
        lost = undefined;
        if (!up) {
          up = true;
          clearTimeout(deadline);
          send("connected");
          host.connected();
        }
      } else if (state === "failed") fail("connection failed");
      else if (state === "disconnected" && lost === undefined) lost = setTimeout(() => fail("connection lost"), 5_000);
    });
    const table = pc.addTransceiver(out.table, { direction: "sendonly" });
    const team = pc.addTransceiver(out.team, { direction: "sendonly" });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send("publish", { sdp: offer.sdp, table: table.mid, team: team.mid });
  }

  // Every transceiver the offer named carries its speaker, whether or not the
  // browser fires a track event for a reused one.
  function attach(pc: RTCPeerConnection, named: Set<string>) {
    for (const transceiver of pc.getTransceivers()) {
      const mid = transceiver.mid;
      const who = mid && named.has(mid) ? heard.get(mid) : undefined;
      if (mid && who) host.hear(mid, who.speaker, who.channel, transceiver.receiver.track);
    }
  }

  function receive(signal: unknown) {
    const m = (signal ?? {}) as Signal;
    if (closed) return;
    if (m.op === "ice" && !line && m.line) {
      line = m.line;
      const servers = m.ice_servers ?? [];
      work = work.then(() => (closed ? undefined : publish(servers))).catch((error) => fail(String(error)));
      return;
    }
    // A refused join names no line, like this one before its "ice".
    if ((m.line ?? 0) !== line) return;
    switch (m.op) {
      case "published":
        run((pc) => pc.setRemoteDescription({ type: "answer", sdp: withDtx(m.sdp ?? "") }));
        break;
      case "offer":
        run(async (pc) => {
          const named = new Set<string>();
          for (const t of m.tracks ?? []) {
            heard.set(t.mid, { speaker: t.speaker, channel: t.channel });
            named.add(t.mid);
          }
          await pc.setRemoteDescription({ type: "offer", sdp: withDtx(m.sdp ?? "") });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send("answer", { sdp: answer.sdp });
          attach(pc, named);
        });
        break;
      case "drop":
        for (const mid of m.mids ?? []) {
          heard.delete(mid);
          host.drop(mid);
        }
        break;
      case "failed":
        fail("ended by the server");
        break;
    }
  }

  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(deadline);
    clearTimeout(lost);
    if (line) send("leave");
    peer?.close();
    peer = null;
  }

  host.send({ op: "join" });
  return { receive, close };
}
