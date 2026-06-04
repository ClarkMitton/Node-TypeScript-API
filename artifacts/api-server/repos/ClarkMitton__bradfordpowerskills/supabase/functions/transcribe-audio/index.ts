import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File;

    if (!audioFile) {
      return new Response(
        JSON.stringify({ error: "No audio file provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) {
      console.error("ELEVENLABS_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Transcription service unavailable" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Transcribing audio file: ${audioFile.name}, size: ${audioFile.size} bytes`);

    // Prepare the request to ElevenLabs
    const apiFormData = new FormData();
    apiFormData.append("file", audioFile);
    apiFormData.append("model_id", "scribe_v1");
    apiFormData.append("tag_audio_events", "true");
    apiFormData.append("diarize", "true");
    apiFormData.append("language_code", "eng");

    const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
      },
      body: apiFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs API error:", response.status, errorText);

      // Try to surface provider error details to the client (without leaking secrets)
      let providerMessage: string | undefined;
      try {
        const parsed = JSON.parse(errorText);
        providerMessage =
          parsed?.detail?.message ||
          parsed?.detail?.error ||
          parsed?.message ||
          parsed?.error;
      } catch {
        // ignore
      }

      if (response.status === 429) {
        return new Response(
          JSON.stringify({
            error: "Transcription rate limit exceeded. Please try again later.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // ElevenLabs can return 401 when a key is valid but usage is blocked (e.g. unusual activity / free tier disabled)
      if (response.status === 401 || response.status === 403) {
        return new Response(
          JSON.stringify({
            error:
              providerMessage ||
              "Transcription provider rejected the request. Please verify your account/plan and try again.",
          }),
          {
            status: response.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      return new Response(
        JSON.stringify({
          error: providerMessage || "Transcription failed. Please try again.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const transcription = await response.json();
    console.log(`Transcription complete: ${transcription.text?.length || 0} characters`);

    // Return the full transcription data
    return new Response(
      JSON.stringify({
        text: transcription.text,
        words: transcription.words || [],
        audioEvents: transcription.audio_events || [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Transcription error:", error);
    return new Response(
      JSON.stringify({ error: "Unable to transcribe audio. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
