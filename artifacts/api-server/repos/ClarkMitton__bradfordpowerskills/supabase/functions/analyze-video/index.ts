import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TWELVELABS_API_BASE = "https://api.twelvelabs.io/v1.3";
const INDEX_NAME = "teaching-analysis";

interface AnalyzeVideoRequest {
  videoBase64: string;
  fileName: string;
  selectedPhases?: string[];
  selectedCategories?: string[];
}

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
  // List existing indexes
  const listResponse = await makeRequest("/indexes", { method: "GET" }, apiKey);
  const listData = await listResponse.json();
  
  // Check if our index exists
  const existingIndex = listData.data?.find((idx: any) => idx.index_name === INDEX_NAME);
  if (existingIndex) {
    console.log("Found existing index:", existingIndex._id);
    return existingIndex._id;
  }
  
  // Create new index with Pegasus model
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

async function uploadVideo(apiKey: string, indexId: string, videoBase64: string, fileName: string): Promise<string> {
  // Convert base64 to blob
  const binaryString = atob(videoBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  // Create form data
  const formData = new FormData();
  formData.append("index_id", indexId);
  formData.append("video_file", new Blob([bytes], { type: "video/mp4" }), fileName);
  
  const response = await makeRequest("/tasks", {
    method: "POST",
    body: formData,
  }, apiKey);
  
  const data = await response.json();
  console.log("Upload task created:", data._id);
  return data._id;
}

async function waitForTask(apiKey: string, taskId: string, maxWaitSeconds = 300): Promise<string> {
  const startTime = Date.now();
  const pollInterval = 5000; // 5 seconds
  
  while ((Date.now() - startTime) / 1000 < maxWaitSeconds) {
    const response = await makeRequest(`/tasks/${taskId}`, { method: "GET" }, apiKey);
    const data = await response.json();
    
    console.log("Task status:", data.status);
    
    if (data.status === "ready") {
      return data.video_id;
    } else if (data.status === "failed") {
      throw new Error(`Video processing failed: ${data.error_message || "Unknown error"}`);
    }
    
    // Wait before polling again
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  throw new Error("Video processing timed out");
}

async function analyzeVideo(apiKey: string, videoId: string, selectedPhases?: string[], selectedCategories?: string[]): Promise<any> {
  const phaseContext = selectedPhases?.length 
    ? `Focus on these lesson phases: ${selectedPhases.join(", ")}.` 
    : "";
  
  const categoryContext = selectedCategories?.length 
    ? `Pay special attention to: ${selectedCategories.join(", ")}.` 
    : "";

  const prompt = `You are an expert educational coach analyzing a teaching video. Analyze both the visual and audio elements of this teaching session.

${phaseContext}
${categoryContext}

Provide a comprehensive analysis including:

1. **Session MVP**: Identify the single best teaching moment. Describe what the teacher did pedagogically and why it was effective. Name the specific technique used.

2. **Visual Pedagogy**:
   - Classroom Presence: How does the teacher use movement, positioning, and physical space?
   - Body Language: What non-verbal communication supports or detracts from learning?
   - Visual Communication: How are gestures, demonstrations, and visual aids used?
   - Student Engagement Signals: What visible cues indicate student attention, confusion, or engagement?

3. **Teaching Categories** (rate each 1-10 with specific evidence):
   - Questioning: Quality, variety, and timing of questions
   - Feedback: How the teacher responds to student contributions
   - Explanation: Clarity and effectiveness of explanations
   - Engagement: Strategies to involve all students
   - Pace & Flow: Timing and transitions

4. **Growth Opportunities**: What specific improvements would have the biggest impact?

Respond in this JSON structure:
{
  "sessionMvp": {
    "moment": "Description of the best teaching moment with pedagogical reasoning",
    "pedagogyHighlight": "Name of the specific technique"
  },
  "visualPedagogy": {
    "classroomPresence": "Analysis of teacher movement and positioning",
    "bodyLanguage": "Analysis of non-verbal communication",
    "visualCommunication": "Analysis of gestures and visual aids",
    "studentEngagement": "Observable engagement signals"
  },
  "categories": [
    {
      "name": "Category Name",
      "score": 8,
      "strengths": ["strength 1", "strength 2"],
      "improvements": ["improvement 1"]
    }
  ],
  "overallScore": 7.5,
  "topPriority": "The single most impactful improvement to focus on"
}`;

  const response = await makeRequest("/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      video_id: videoId,
      prompt: prompt,
    }),
  }, apiKey);
  
  const data = await response.json();
  return data;
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

    const { videoBase64, fileName, selectedPhases, selectedCategories }: AnalyzeVideoRequest = await req.json();

    if (!videoBase64 || !fileName) {
      return new Response(
        JSON.stringify({ error: "Video data and filename are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Starting video analysis for:", fileName);

    // Step 1: Find or create index
    const indexId = await findOrCreateIndex(apiKey);
    console.log("Using index:", indexId);

    // Step 2: Upload video
    const taskId = await uploadVideo(apiKey, indexId, videoBase64, fileName);
    console.log("Upload task started:", taskId);

    // Step 3: Wait for processing
    const videoId = await waitForTask(apiKey, taskId);
    console.log("Video processed:", videoId);

    // Step 4: Analyze
    const analysis = await analyzeVideo(apiKey, videoId, selectedPhases, selectedCategories);
    console.log("Analysis complete");

    // Parse the response
    let feedback;
    try {
      // TwelveLabs returns the analysis in a data field
      const analysisText = analysis.data || analysis.text || analysis;
      if (typeof analysisText === "string") {
        // Try to extract JSON from the response
        const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          feedback = JSON.parse(jsonMatch[0]);
        } else {
          feedback = { rawAnalysis: analysisText };
        }
      } else {
        feedback = analysisText;
      }
    } catch (parseError) {
      console.error("Parse error:", parseError);
      feedback = { rawAnalysis: analysis };
    }

    // Add metadata
    feedback.isVideoAnalysis = true;
    feedback.videoId = videoId;

    return new Response(
      JSON.stringify(feedback),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Video analysis error:", error);
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Video analysis failed",
        details: error instanceof Error ? error.stack : undefined
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
