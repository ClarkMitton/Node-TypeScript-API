// WebRTC host webcam broadcast.
// Broadcaster captures camera with getUserMedia and creates one
// RTCPeerConnection per viewer. Signalling rides a Supabase Realtime broadcast
// channel keyed by session id. STUN-only (Google public).
//
// Usage:
//   const { stream, error, viewers } = useWebcamBroadcaster(sessionId, enabled, { audio });
//   const { stream, waiting } = useWebcamViewer(sessionId, enabled);

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

const ICE: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const channelName = (sessionId: string) => `webcam:${sessionId}`;

type SignalPayload =
  | { kind: "viewer_join"; viewerId: string }
  | { kind: "viewer_leave"; viewerId: string }
  | { kind: "broadcaster_here" }
  | { kind: "broadcaster_stop" }
  | { kind: "offer"; viewerId: string; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; viewerId: string; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; viewerId: string; from: "broadcaster" | "viewer"; candidate: RTCIceCandidateInit };

function send(ch: RealtimeChannel, payload: SignalPayload) {
  return ch.send({ type: "broadcast", event: "sig", payload });
}

// ─── BROADCASTER ────────────────────────────────────────────────

export function useWebcamBroadcaster(
  sessionId: string | undefined,
  enabled: boolean,
  opts: { audio?: boolean } = {},
) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const streamRef = useRef<MediaStream | null>(null);
  const chRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!enabled || !sessionId) return;
    let cancelled = false;
    const peers = peersRef.current;

    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: opts.audio ?? false,
        });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = s;
        setStream(s);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Camera access denied");
        return;
      }

      const ch = supabase.channel(channelName(sessionId), {
        config: { broadcast: { self: false } },
      });
      chRef.current = ch;

      const makePeer = async (viewerId: string) => {
        // Close any existing peer for this viewer (re-join)
        peers.get(viewerId)?.close();
        const pc = new RTCPeerConnection(ICE);
        peers.set(viewerId, pc);
        setViewerCount(peers.size);

        streamRef.current?.getTracks().forEach((track) => {
          pc.addTrack(track, streamRef.current!);
        });

        pc.onicecandidate = (ev) => {
          if (ev.candidate) {
            send(ch, {
              kind: "ice",
              viewerId,
              from: "broadcaster",
              candidate: ev.candidate.toJSON(),
            });
          }
        };
        pc.onconnectionstatechange = () => {
          if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
            pc.close();
            peers.delete(viewerId);
            setViewerCount(peers.size);
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        send(ch, { kind: "offer", viewerId, sdp: offer });
      };

      ch.on("broadcast", { event: "sig" }, async ({ payload }: { payload: SignalPayload }) => {
        if (payload.kind === "viewer_join") {
          await makePeer(payload.viewerId);
        } else if (payload.kind === "answer") {
          const pc = peers.get(payload.viewerId);
          if (pc && !pc.currentRemoteDescription) {
            await pc.setRemoteDescription(payload.sdp);
          }
        } else if (payload.kind === "ice" && payload.from === "viewer") {
          const pc = peers.get(payload.viewerId);
          if (pc) {
            try {
              await pc.addIceCandidate(payload.candidate);
            } catch {
              /* ignore */
            }
          }
        } else if (payload.kind === "viewer_leave") {
          peers.get(payload.viewerId)?.close();
          peers.delete(payload.viewerId);
          setViewerCount(peers.size);
        }
      });

      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Announce presence so already-connected viewers can re-join.
          send(ch, { kind: "broadcaster_here" });
        }
      });
    })();

    return () => {
      cancelled = true;
      const ch = chRef.current;
      if (ch) {
        send(ch, { kind: "broadcaster_stop" });
        supabase.removeChannel(ch);
        chRef.current = null;
      }
      peers.forEach((p) => p.close());
      peers.clear();
      setViewerCount(0);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setStream(null);
      setError(null);
    };
  }, [sessionId, enabled, opts.audio]);

  return { stream, error, viewerCount };
}

// ─── VIEWER ─────────────────────────────────────────────────────

export function useWebcamViewer(sessionId: string | undefined, enabled: boolean) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [waiting, setWaiting] = useState(true);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const chRef = useRef<RealtimeChannel | null>(null);
  const viewerIdRef = useRef<string>("");

  useEffect(() => {
    if (!enabled || !sessionId) return;

    const viewerId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    viewerIdRef.current = viewerId;

    setWaiting(true);
    setStream(null);

    const ch = supabase.channel(channelName(sessionId), {
      config: { broadcast: { self: false } },
    });
    chRef.current = ch;

    const closePeer = () => {
      pcRef.current?.close();
      pcRef.current = null;
    };

    const joinAsViewer = () => {
      closePeer();
      const pc = new RTCPeerConnection(ICE);
      pcRef.current = pc;

      pc.ontrack = (ev) => {
        setStream(ev.streams[0]);
        setWaiting(false);
      };
      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          send(ch, {
            kind: "ice",
            viewerId,
            from: "viewer",
            candidate: ev.candidate.toJSON(),
          });
        }
      };
      pc.onconnectionstatechange = () => {
        if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
          setStream(null);
          setWaiting(true);
        }
      };

      send(ch, { kind: "viewer_join", viewerId });
    };

    ch.on("broadcast", { event: "sig" }, async ({ payload }: { payload: SignalPayload }) => {
      if (payload.kind === "broadcaster_here") {
        joinAsViewer();
      } else if (payload.kind === "broadcaster_stop") {
        closePeer();
        setStream(null);
        setWaiting(true);
      } else if (payload.kind === "offer" && payload.viewerId === viewerId) {
        const pc = pcRef.current;
        if (!pc) return;
        await pc.setRemoteDescription(payload.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send(ch, { kind: "answer", viewerId, sdp: answer });
      } else if (
        payload.kind === "ice" &&
        payload.from === "broadcaster" &&
        payload.viewerId === viewerId
      ) {
        const pc = pcRef.current;
        if (pc) {
          try {
            await pc.addIceCandidate(payload.candidate);
          } catch {
            /* ignore */
          }
        }
      }
    });

    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        // Announce join; broadcaster (if present) will respond with offer.
        joinAsViewer();
      }
    });

    return () => {
      send(ch, { kind: "viewer_leave", viewerId });
      closePeer();
      supabase.removeChannel(ch);
      chRef.current = null;
      setStream(null);
      setWaiting(true);
    };
  }, [sessionId, enabled]);

  return { stream, waiting };
}
