// Supabase Realtime helper for the Immersive Learning platform.
// All three screens (Host, Touch Screen 1, Touch Screen 2) subscribe to the
// same channel keyed by session id, plus listen to row changes on `sessions`
// and `slots` so any screen can drive the others.

import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type BroadcastEvent =
  | { type: "wheel_spin"; payload: { items: string[]; result: string } }
  | { type: "reveal_results"; payload: { slotId: string } }
  | { type: "session_dismiss"; payload: { ts: number } }
  | { type: "force_sync"; payload: { from: string } }
  | { type: "ping"; payload: { from: string; ts: number } };

export function sessionChannel(sessionId: string): RealtimeChannel {
  return supabase.channel(`session:${sessionId}`, {
    config: { broadcast: { self: false } },
  });
}

export function broadcast(channel: RealtimeChannel, event: BroadcastEvent) {
  return channel.send({ type: "broadcast", event: event.type, payload: event.payload });
}
