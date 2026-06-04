import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * This function cleans up orphaned video files from storage.
 * Videos are considered orphaned if they are older than the specified age.
 * 
 * This should be called periodically (e.g., via a cron job) to clean up
 * files from abandoned sessions where the user closed the browser before
 * processing completed.
 * 
 * Video filenames include a timestamp prefix: {timestamp}_{filename}
 */
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    
    // Maximum age in hours (default: 24 hours)
    const maxAgeHours = body.maxAgeHours || 24;
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    const cutoffTime = Date.now() - maxAgeMs;

    console.log(`[Cleanup] Looking for videos older than ${maxAgeHours} hours`);
    console.log(`[Cleanup] Cutoff timestamp: ${cutoffTime} (${new Date(cutoffTime).toISOString()})`);

    // Create Supabase client with service role for storage access
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // List all files in the teaching-videos bucket
    const { data: files, error: listError } = await supabase.storage
      .from("teaching-videos")
      .list("", { limit: 1000 });

    if (listError) {
      throw new Error(`Failed to list files: ${listError.message}`);
    }

    if (!files || files.length === 0) {
      console.log("[Cleanup] No files found in bucket");
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "No files to clean up",
          deleted: 0 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Cleanup] Found ${files.length} files in bucket`);

    // Find files to delete based on timestamp prefix
    const filesToDelete: string[] = [];

    for (const file of files) {
      // Extract timestamp from filename (format: {timestamp}_{filename})
      const timestampMatch = file.name.match(/^(\d+)_/);
      
      if (timestampMatch) {
        const fileTimestamp = parseInt(timestampMatch[1], 10);
        
        if (fileTimestamp < cutoffTime) {
          console.log(`[Cleanup] Marking for deletion: ${file.name} (created: ${new Date(fileTimestamp).toISOString()})`);
          filesToDelete.push(file.name);
        }
      } else {
        // Files without timestamp prefix - check created_at if available
        if (file.created_at) {
          const fileTime = new Date(file.created_at).getTime();
          if (fileTime < cutoffTime) {
            console.log(`[Cleanup] Marking for deletion (no prefix): ${file.name}`);
            filesToDelete.push(file.name);
          }
        }
      }
    }

    if (filesToDelete.length === 0) {
      console.log("[Cleanup] No orphaned files found");
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "No orphaned files found",
          checked: files.length,
          deleted: 0 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Cleanup] Deleting ${filesToDelete.length} orphaned files`);

    // Delete the files in batches
    const batchSize = 100;
    let deletedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < filesToDelete.length; i += batchSize) {
      const batch = filesToDelete.slice(i, i + batchSize);
      
      const { error: deleteError } = await supabase.storage
        .from("teaching-videos")
        .remove(batch);

      if (deleteError) {
        console.error(`[Cleanup] Batch delete error:`, deleteError);
        errors.push(deleteError.message);
      } else {
        deletedCount += batch.length;
        console.log(`[Cleanup] Deleted batch of ${batch.length} files`);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        checked: files.length,
        deleted: deletedCount,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Cleanup] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
