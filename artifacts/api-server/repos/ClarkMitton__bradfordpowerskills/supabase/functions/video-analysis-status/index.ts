import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TWELVELABS_API_BASE = "https://api.twelvelabs.io/v1.3";

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

async function analyzeVideo(apiKey: string, videoId: string, selectedPhases?: string[], selectedCategories?: string[]) {
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
      stream: false, // Disable streaming to get a single JSON response
    }),
  }, apiKey);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("TwelveLabs analyze API error:", response.status, errorText);
    throw new Error(`TwelveLabs API returned ${response.status}: ${errorText}`);
  }
  
  return await response.json();
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

    const { taskId, selectedPhases, selectedCategories } = await req.json();

    if (!taskId) {
      return new Response(
        JSON.stringify({ error: "Task ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Checking status for task:", taskId);

    // Check task status
    const statusResponse = await makeRequest(`/tasks/${taskId}`, { method: "GET" }, apiKey);
    const statusData = await statusResponse.json();

    console.log("Task status:", statusData.status);

    if (statusData.status === "pending" || statusData.status === "indexing") {
      return new Response(
        JSON.stringify({ 
          status: "processing",
          taskStatus: statusData.status,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (statusData.status === "failed") {
      return new Response(
        JSON.stringify({ 
          status: "failed",
          error: statusData.error_message || "Video processing failed",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (statusData.status === "ready") {
      const videoId = statusData.video_id;
      console.log("Video ready, analyzing:", videoId);

      // Run analysis
      const analysis = await analyzeVideo(apiKey, videoId, selectedPhases, selectedCategories);
      console.log("Analysis complete");

      // Parse the response
      let feedback;
      try {
        const analysisText = analysis.data || analysis.text || analysis;
        if (typeof analysisText === "string") {
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

      feedback.isVideoAnalysis = true;
      feedback.videoId = videoId;

      return new Response(
        JSON.stringify({ 
          status: "complete",
          feedback: feedback,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Unknown status
    return new Response(
      JSON.stringify({ 
        status: "processing",
        taskStatus: statusData.status,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Video analysis status error:", error);
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Failed to check video analysis status",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
