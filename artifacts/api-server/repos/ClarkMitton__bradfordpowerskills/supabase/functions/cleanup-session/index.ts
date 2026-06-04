import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // This endpoint receives cleanup requests via sendBeacon
    // sendBeacon sends as text/plain, so we need to handle that
    let storagePath: string | null = null;

    const contentType = req.headers.get("content-type") || "";
    
    if (contentType.includes("application/json")) {
      const body = await req.json();
      storagePath = body.storagePath;
    } else {
      // sendBeacon sends as text/plain
      const text = await req.text();
      try {
        const parsed = JSON.parse(text);
        storagePath = parsed.storagePath;
      } catch {
        storagePath = text;
      }
    }

    if (!storagePath) {
      return new Response(
        JSON.stringify({ success: true, message: "No path to clean up" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[Cleanup] Attempting to delete:", storagePath);

    // Create Supabase client with service role for storage access
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Delete the video file
    const { error } = await supabase.storage
      .from("teaching-videos")
      .remove([storagePath]);

    if (error) {
      console.error("[Cleanup] Delete error:", error);
      // Don't throw - we want to return success even if file doesn't exist
    } else {
      console.log("[Cleanup] Successfully deleted:", storagePath);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Cleanup] Error:", error);
    // Always return success to not block page unload
    return new Response(
      JSON.stringify({ success: true, error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
