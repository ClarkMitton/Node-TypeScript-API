import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COMPARISON_PROMPT = `You are an expert teaching coach writing a "Your Teaching Journey" development summary for a teacher who has shared two PowerED session feedback reports as PDFs.

PDF A is their EARLIER session. PDF B is their LATER session. Read both reports carefully.

Your tone must be coaching, developmental, and encouraging throughout. You are helping them see their professional growth, not evaluating them.

Generate the following comparison sections. Return ONLY the sections where you have real, clear evidence from the reports — never fabricate or force patterns. If a section has insufficient evidence, return null for that field.

**Embedding** — ITTECF indicators or skills demonstrated in BOTH sessions. Frame as practice becoming part of their consistent repertoire. Example: "Standard 2 2b appeared in both sessions, suggesting that building on prior knowledge is becoming a consistent habit in your teaching."

**Growth** — ITTECF indicators present in Session B but NOT in Session A, or domain areas where Session B shows notably different or improved practice. Frame as genuine new development. Example: "In your more recent session you demonstrated Standard 4 4e for the first time, showing growth in how you prompt pupils to elaborate."

**Resolved** — Themes from Session A's "To Make It Even Stronger" areas that do NOT appear as growth areas in Session B. Frame carefully and positively as patterns that may have been addressed, without overclaiming. Use phrases like "appears to have shifted" or "is no longer a prominent area."

**Persistent** — Themes appearing in BOTH sessions' "To Make It Even Stronger" areas. Name honestly as areas worth continued deliberate focus. Never frame as failure — frame as a development priority worth consistent attention.

**Standard English Trajectory** — The direction of change between the two Standard English sections. Note improvement, consistency, or continued area for focus. Do NOT compare scores or numbers — focus on the qualitative direction. If no Standard English data is available, return null.

**Focus for Next Session** — A single, specific, actionable sentence the teacher can take into their next lesson. Rules: must start with "Next session:"; must name a concrete strategy or classroom action (not a vague theme); derive from the most prominent persistent pattern across both sessions; if no persistent pattern exists, derive from the strongest growth area in Session B instead. This field must NEVER be null or empty.

**ITTECF Evidence Table** — Extract ALL unique ITTECF standard references (e.g. "2 2b", "4 4e") mentioned in either report. For each, provide the standard reference, the indicator title/description, and whether it appeared in Session A, Session B, or both. Return as an array sorted by standard reference number. If no ITTECF standards are referenced in either report, return an empty array.

CRITICAL RULES:
- Read the full content of both PDF reports carefully
- Do not fabricate comparisons or force patterns where the data does not clearly support them
- If sessions are too different in context to draw meaningful comparisons, skip that section (return null)
- Each section should be 2-4 sentences of fluent, coaching prose — not bullet points
- Use British English spelling throughout
- Reference specific indicators or domain names where relevant to make it concrete
- If there are no ITTECF indicators in either report, return null for embedding and growth

Respond with valid JSON matching this exact structure. For any section where you do not have sufficient evidence, use null.

{
  "sessionA": {
    "mvpMoment": "Brief description of Session A's MVP moment from the PDF"
  },
  "sessionB": {
    "mvpMoment": "Brief description of Session B's MVP moment from the PDF"
  },
  "embedding": "2-4 sentence paragraph OR null",
  "growth": "2-4 sentence paragraph OR null",
  "resolved": "2-4 sentence paragraph OR null",
  "persistent": "2-4 sentence paragraph OR null",
  "standardEnglishTrajectory": "1-3 sentence paragraph OR null",
  "focusForNextSession": "A single concrete actionable sentence starting with 'Next session:' — NEVER null",
  "ittecfEvidence": [
    { "standard": "e.g. 2 2b", "title": "Build on pupils' prior knowledge...", "sessionA": true, "sessionB": false }
  ]
}

CRITICAL: Return ONLY valid JSON. No text before or after. No markdown code blocks. Start directly with { and end with }.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Service temporarily unavailable" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build the request based on what we received
    // Supports: both PDFs, both text, or one of each (mixed)
    const hasPdfA = !!body.pdfA;
    const hasPdfB = !!body.pdfB;
    const hasTextA = !!body.reportAText;
    const hasTextB = !!body.reportBText;

    if (!(hasPdfA || hasTextA) || !(hasPdfB || hasTextB)) {
      return new Response(
        JSON.stringify({ error: "Two reports are required for comparison" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let messages: Array<{ role: string; content: any }>;

    if (hasPdfA && hasPdfB) {
      // Both PDFs — vision flow
      messages = [
        {
          role: "user",
          content: [
            { type: "text", text: COMPARISON_PROMPT },
            { type: "text", text: "\n\nHere is PDF A (the EARLIER session report):" },
            { type: "image_url", image_url: { url: `data:application/pdf;base64,${body.pdfA}` } },
            { type: "text", text: "\n\nHere is PDF B (the LATER session report):" },
            { type: "image_url", image_url: { url: `data:application/pdf;base64,${body.pdfB}` } },
            { type: "text", text: "\n\nPlease read both reports and generate the comparison JSON." },
          ],
        },
      ];
    } else if (hasTextA && hasTextB) {
      // Both text
      messages = [
        { role: "system", content: COMPARISON_PROMPT },
        {
          role: "user",
          content: `Here are the two teaching session reports to compare:\n\n### Session A (Earlier)\n${body.reportAText}\n\n---\n\n### Session B (Later)\n${body.reportBText}\n\n---\n\nPlease generate the comparison JSON.`,
        },
      ];
    } else {
      // Mixed: one PDF + one text
      const contentParts: any[] = [{ type: "text", text: COMPARISON_PROMPT }];

      if (hasPdfA) {
        contentParts.push({ type: "text", text: "\n\nHere is PDF A (the EARLIER session report):" });
        contentParts.push({ type: "image_url", image_url: { url: `data:application/pdf;base64,${body.pdfA}` } });
      } else {
        contentParts.push({ type: "text", text: `\n\nHere is Session A (the EARLIER session report) as text:\n\n${body.reportAText}` });
      }

      if (hasPdfB) {
        contentParts.push({ type: "text", text: "\n\nHere is PDF B (the LATER session report):" });
        contentParts.push({ type: "image_url", image_url: { url: `data:application/pdf;base64,${body.pdfB}` } });
      } else {
        contentParts.push({ type: "text", text: `\n\nHere is Session B (the LATER session report) as text:\n\n${body.reportBText}` });
      }

      contentParts.push({ type: "text", text: "\n\nPlease read both reports and generate the comparison JSON." });

      messages = [{ role: "user", content: contentParts }];
    }

    console.log("Sending comparison request to AI gateway...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        temperature: 0.3,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded. Please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add funds to your workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const responseText = await response.text();
    let aiResponse;
    try {
      aiResponse = JSON.parse(responseText);
    } catch {
      console.error("Failed to parse AI gateway response:", responseText?.slice(0, 500));
      return new Response(JSON.stringify({ error: "Invalid response from AI. Please try again." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const content = aiResponse.choices?.[0]?.message?.content;
    if (!content) {
      console.error("No content in AI response:", JSON.stringify(aiResponse).slice(0, 500));
      return new Response(JSON.stringify({ error: "AI returned an empty response. Please try again." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let comparison;
    try {
      let jsonStr = content.trim();
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      } else {
        const firstBrace = content.indexOf("{");
        const lastBrace = content.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          jsonStr = content.slice(firstBrace, lastBrace + 1);
        }
      }
      comparison = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI comparison JSON:", content?.slice(0, 500));
      return new Response(JSON.stringify({ error: "Failed to parse AI response. Please try again." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Comparison generated successfully");
    return new Response(JSON.stringify(comparison), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
