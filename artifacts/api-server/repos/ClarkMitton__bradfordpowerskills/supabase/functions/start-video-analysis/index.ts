import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TWELVELABS_API_BASE = "https://api.twelvelabs.io/v1.3";
const INDEX_NAME = "teaching-analysis";

async function makeRequest(endpoint: string, options: RequestInit, apiKey: string) {
  const response = await fetch(`${TWELVELABS_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      ...options.headers,
      "x-api-key": apiKey,
    },
  });
  return response;
}

async function findOrCreateIndex(apiKey: string): Promise<string> {
  const listResponse = await makeRequest("/indexes", { method: "GET" }, apiKey);
  const listData = await listResponse.json();
  
  const existingIndex = listData.data?.find((idx: any) => idx.index_name === INDEX_NAME);
  if (existingIndex) {
    console.log("Found existing index:", existingIndex._id);
    return existingIndex._id;
  }
  
  const createResponse = await makeRequest("/indexes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      index_name: INDEX_NAME,
      models: [{
        model_name: "pegasus1.2",
        model_options: ["visual", "audio"]
      }]
    }),
  }, apiKey);
  
  const createData = await createResponse.json();
  console.log("Created new index:", createData._id);
  return createData._id;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("TWELVELABS_API_KEY");
    if (!apiKey) {
      throw new Error("TWELVELABS_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase configuration missing");
    }

    const { storagePath, fileName, selectedPhases, selectedCategories } = await req.json();

    if (!storagePath || !fileName) {
      return new Response(
        JSON.stringify({ error: "Storage path and filename are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Starting video analysis for:", fileName, "at path:", storagePath);

    // Create Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate a signed URL for the video (valid for 1 hour)
    const { data: signedUrlData, error: signedUrlError } = await supabase
      .storage
      .from("teaching-videos")
      .createSignedUrl(storagePath, 3600);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error("Failed to generate signed URL:", signedUrlError);
      throw new Error("Failed to access video file");
    }

    console.log("Generated signed URL for video");

    // Find or create index
    const indexId = await findOrCreateIndex(apiKey);
    console.log("Using index:", indexId);

    // Upload video via URL (not base64!)
    const formData = new FormData();
    formData.append("index_id", indexId);
    formData.append("video_url", signedUrlData.signedUrl);

    const uploadResponse = await makeRequest("/tasks", {
      method: "POST",
      body: formData,
    }, apiKey);

    const uploadData = await uploadResponse.json();
    
    if (!uploadData._id) {
      console.error("Upload failed:", uploadData);
      throw new Error(uploadData.message || "Failed to start video upload task");
    }

    console.log("Upload task created:", uploadData._id);

    return new Response(
      JSON.stringify({
        taskId: uploadData._id,
        indexId: indexId,
        storagePath: storagePath,
        selectedPhases: selectedPhases || [],
        selectedCategories: selectedCategories || [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Start video analysis error:", error);
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Failed to start video analysis",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
