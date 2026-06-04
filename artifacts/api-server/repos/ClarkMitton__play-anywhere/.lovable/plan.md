## Goal

Add a "Host Webcam" slot type. When active, the host's laptop camera (and optional mic) is streamed live to **all three displays** (host, screen 1, screen 2) — even if the host is only physically standing by one of them. This way it doesn't matter which screens the room has; everyone sees the host.

## How it will work (plain English)

1. Host opens the **remote control page** on their phone, or the host display itself — that device becomes the **broadcaster** (it owns the camera).
2. Each of the 3 displays subscribes as a **viewer** and receives the live video.
3. Streaming uses **WebRTC** (browser-native, peer-to-peer, low latency, no media server needed). Supabase Realtime is used only for the tiny handshake messages (offer / answer / ICE candidates) — no video goes through the database.
4. A new slot type `host_webcam` is added in the designer. When the slot is active, viewer screens automatically connect; when the host advances past it, viewers tear the connection down and the camera light turns off on the broadcaster.

## Where the broadcaster runs

Best UX: add a **"Start camera"** button on the **host remote control page** (`/remote/$sessionId`). The host taps it once per session, grants camera permission on their phone or laptop, and from then on any time a `host_webcam` slot is active the stream is sent automatically. This keeps the camera tied to the person physically holding the remote, which is exactly the host.

Fallback: if the host prefers to broadcast from the main host display instead, the host page itself also exposes the same "Start camera" button.

## UI additions

- **Designer (`/admin/designer/$lessonId`)** — new slot content type `host_webcam` in the picker, with a tiny preview tile ("Host Webcam"). No config needed beyond placement (which screens show it — usually all three).
- **Remote (`/remote/$sessionId`)** — persistent "Camera: Off / On" toggle at the top. When on, a small self-preview thumbnail confirms the camera is live.
- **SlotRenderer** — new `case "host_webcam"` that renders a full-screen `<video>` element. Shows a "Waiting for host camera…" placeholder if the broadcaster hasn't started yet.

## Technical details

**New slot content variant** in `src/components/SlotRenderer.tsx`:
```ts
| { type: "host_webcam"; with_audio?: boolean }
```

**Signaling** — reuse the existing `sessionChannel(sessionId)` Supabase Realtime channel. Add new broadcast event names:
- `webcam:offer` (broadcaster → specific viewer)
- `webcam:answer` (viewer → broadcaster)
- `webcam:ice` (both directions)
- `webcam:viewer_join` (viewer announces itself; broadcaster responds with an offer)
- `webcam:broadcaster_stop` (broadcaster ending stream)

Each viewer generates a random `viewerId` so the broadcaster can manage one `RTCPeerConnection` per viewer (up to 3).

**New hook** `src/hooks/use-webcam-broadcast.ts`:
- `useWebcamBroadcaster(sessionId, enabled)` — calls `getUserMedia`, listens for viewer joins, creates one RTCPeerConnection per viewer, sends offer, handles ICE.
- `useWebcamViewer(sessionId, enabled)` — sends `viewer_join`, accepts the offer, returns a `MediaStream` to attach to the `<video>` element.

**ICE servers** — use Google's free public STUN (`stun:stun.l.google.com:19302`). No TURN needed for typical same-network classroom use; can add later if NAT traversal fails.

**Designer + DB** — no schema migration required. `slots.host_content` / `screen1_content` / `screen2_content` are already `jsonb`, so the new `{ type: "host_webcam" }` shape drops straight in.

**Permissions** — `getUserMedia` requires HTTPS (both preview and published URLs are HTTPS, so fine). The browser shows its native camera-permission prompt once per origin.

**Cleanup** — when the active slot changes away from `host_webcam`, both broadcaster and viewer effects tear down their `RTCPeerConnection`s and stop media tracks (turns the camera light off).

## Out of scope (deliberately)

- Recording / saving the stream.
- Mixing the webcam as a picture-in-picture overlay on top of other slides (could be a follow-up — same underlying hook would be reused).
- Multi-presenter (multiple cameras at once).
- TURN server for cross-network scenarios — only needed if classroom Wi-Fi blocks peer connections; add only if it actually fails in testing.

## Files to add / change

- `src/components/SlotRenderer.tsx` — add `host_webcam` type + renderer case.
- `src/hooks/use-webcam-broadcast.ts` — new file with both hooks.
- `src/routes/remote.$sessionId.tsx` — add "Start/Stop camera" toggle + self-preview.
- `src/routes/host.tsx` — also expose the toggle (fallback broadcaster).
- `src/routes/admin.designer.$lessonId.tsx` — add `host_webcam` to the content type picker.

No database migration. No new dependencies.
