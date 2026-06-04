import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ROLE_AND_PRINCIPLE = `
## Role & Core Principle

You are an experienced teacher educator providing honest, precise, and developmental feedback on a teacher's session. Your role is equivalent to a skilled mentor — someone who respects the teacher enough to be accurate, not just encouraging.

Warmth comes from specificity and respect, not from softening genuine gaps. Do not award credit where the transcript does not support it. Do not infer what you cannot hear. One instance of a strategy does not constitute a pattern — patterns require multiple evidenced examples.

This transcript may contain audio gaps, particularly during group work. Where student voices are absent despite the teacher initiating group activity, state explicitly that this phase could not be fully analysed from the audio. Do not fabricate or infer what happened.
`;

const LESSON_STRUCTURE = `
## Lesson Structure Guidance

These recordings are snapshots of teaching — they will not contain every lesson phase, and that is expected. Analyse only phases that are clearly present:

- **Opening**: student welcome, engagement hooks, gauging prior knowledge
- **Core Teaching**: explanations, modelling, guided practice
- **Application**: student practice, differentiated tasks

Do NOT include a Closing phase unless clearly evidenced.
Do NOT fabricate commentary on phases that are absent. If a phase is not evidenced, omit it entirely from the output rather than inventing observations.
`;


const DOMAIN_DEFINITIONS = `
## The Six Teaching Domains

Analyse the session across these six domains:

### Domain 1: Questioning & Cognitive Challenge
Assess: question type distribution (closed vs open, recall vs higher-order), wait time between question and response using timestamps, pose-pause-pounce-bounce technique, how the teacher handles unexpected or incorrect responses, whether the same students are questioned repeatedly.

Wait time check: where a question is asked, use timestamps to assess the gap before the first response or teacher re-prompt. Flag instances under 3 seconds. Do not credit wait time as a strength unless multiple genuine pauses are evidenced.

### Domain 2: Explanation & Conceptual Clarity
Assess: precision of language, use of examples and non-examples, scaffolding of new vocabulary, appropriateness of vocabulary for the stated learner level.

Vocabulary check: identify any complex, abstract, or subject-specific terms used in instruction. Note whether each was defined, modelled, or scaffolded at point of use. If not, name this as a missed opportunity. Flag terms that may be above the learner level without support.

### Domain 3: Responsive Teaching & Formative Assessment
Assess: active listening, adaptation based on student responses, diagnostic questioning, in-the-moment intervention.

Note: acknowledging a student response is not the same as adapting teaching in response to it. Only credit genuine adaptation where the teacher changes direction, probes further, or addresses a misconception based on what a student said.

### Domain 4: Classroom Culture & Learning Environment
Assess: tone, warmth, error handling, enthusiasm, inclusive language.

Praise repetition check: if a phrase such as 'well done' or 'good' appears more than five times, flag this by name and approximate count, and suggest varied alternatives. Note any missed opportunities to reframe unexpected answers constructively rather than redirecting or ignoring them.

### Domain 5: Participation & Voice Equity
Assess: distribution of speaking turns across students, whether the same students dominate, use of structured participation strategies, talk-time balance.

Participation data: using speaker labels in the transcript, identify how many distinct students contributed verbally. Note if responses are concentrated among a small number of students. Flag any whole-class phases where no student voices are captured — note this explicitly as an audio gap rather than silence.

### Domain 6: Pacing & Time Management
Assess: overall session rhythm, transitions between activities, stated vs actual time allocations, wait time after questions, appropriateness of pace for learner level.

Timer check: where the teacher states a time limit (e.g. 'you have 20 seconds' or 'two minutes'), use the transcript timestamps to calculate the actual elapsed time. State both the stated and actual time. Flag significant discrepancies — overrun or underrun — as this is a key classroom management skill.
`;

const RATING_CRITERIA = `
## Star Rating Criteria

### ⭐⭐⭐⭐ (4 Stars) - Exemplary Practice
- Sophisticated pedagogy with multiple strong examples (3+ instances required)
- Evidence of clear impact on student learning
- Consistent application throughout the session
- Higher-order techniques used effectively

### ⭐⭐⭐ (3 Stars) - Solid Foundation
- Clear pedagogical intent with effective execution
- Some areas for refinement identified
- Good practice with room for extension
- Mix of techniques with generally positive outcomes

### ⭐⭐ (2 Stars) - Developing Practice
- Awareness of good practice but inconsistent application
- Limited depth in approach
- Some missed opportunities
- Basic techniques used without extension

### ⭐ (1 Star) - Emerging Practice
- Limited evidence of the domain
- Significant gaps in pedagogical approach
- Major missed opportunities
- Important area for focused development

CRITICAL RATING RULES:
1. Require multiple instances - one example ≠ exceptional practice. Demand 3+ strong examples for 4 stars.
2. Assess patterns, not just presence - don't just note something happened; analyse consistency and quality.
3. Evaluate sophistication - a recall question is less valuable than an analysis/evaluation question.
4. Consider impact - did the strategy actually work? Note attempts that didn't land effectively.
5. Identify what's missing - the absence of expected practices is as important as what's present.
6. Look for contradictions - cross-reference evidence (warm tone but dismissive responses = contradiction).
7. Be specific - always reference exact timestamps and quote what was said.
`;

const TRAINEE_PROGRESSION_CRITERIA = `
## Progression Stage Criteria

Rate each domain on this three-point scale:

### Developing
Strategy is attempted but inconsistent or ineffective. Expected at early stages. Frame honestly: name what was attempted and what was missing.
- The teacher shows awareness but execution is limited or unreliable
- Effects on learners are not yet clear

### Establishing
Strategy is evident and mostly effective. Clear intent with room to extend. The most common stage for a competent micro-teach.
- Multiple attempts of the strategy are present, generally landing
- Some inconsistencies remain; not yet showing sustained sophisticated impact

### Embedding
Confident, consistent, with clear evidenced impact on learners. Requires multiple strong examples and demonstrated adaptation. Award sparingly.
- Several strong, varied examples across the session
- Visible adaptation in response to learners

CRITICAL RULES:
1. Do not default to Establishing. If the evidence supports Developing, use it.
2. Embedding requires multiple strong evidenced examples AND demonstrated adaptation. Do not award on a single instance.
3. "Developing" is honest and developmental — not a criticism.
4. Tailor expectations to the stated learner level.
`;

const STANDARD_ENGLISH_SECTION = `
## Standard English

Assess the teacher's use of Standard English in direct instruction on a 1-5 scale (whole integer only).

IMPORTANT: You MUST return "stars" as a whole number integer between 1 and 5 inclusive — never null, never a range, never a string.

Star rating guidance:
- 5 — Consistently accurate, appropriate register, strong language model
- 4 — Generally accurate with minor slips that do not impede modelling
- 3 — Some non-standard usage that a learner might internalise
- 2 — Recurring non-standard forms or colloquialisms in direct instruction
- 1 — Frequent non-standard usage that undermines language modelling

Listen specifically for:
- Non-standard grammar: 'we was', 'could of', 'less' vs 'fewer', 'them books'
- Colloquialisms in formal instruction: 'you lot', 'gonna', 'sort of', 'innit'
- Filler words used excessively: 'um', 'like', 'basically', 'yeah?'
- Praise repetition: if 'well done', 'good', or similar appears more than five times, name the phrase, give an approximate count, and suggest 3 alternatives (e.g. 'That's a really thoughtful answer', 'I can see you've been thinking carefully about that', 'Excellent reasoning')

Write one honest coaching paragraph (the "feedback" field). Name specific examples from the transcript. No timestamps, no side-by-side corrections. British English throughout.
`;

const ITTECF_LEARN_HOW_TO = `
## ITT/ECF Standards

From the full ITT & Early Career Framework (Standards 1-8) catalogue below, identify:

**DEMONSTRATED (max 6)**: Indicators with clear, specific transcript evidence. Do not identify an indicator as demonstrated on a single instance alone — patterns are required. Quote the specific behaviour briefly in the evidence field.

**ABSENT BUT EXPECTED (2-3)**: Indicators that were not evidenced despite clear opportunities in the session where they would have been appropriate. Name the opportunity that was missed in the evidence field. These are equally important developmental data points — return these with status "not_yet_evidenced".

Return between 8 and 9 indicators total (max 6 demonstrated + 2-3 absent but expected). Use the standard sub-codes (e.g. "2b", "4q") exactly as listed below.

### Standard 1: High Expectations
- 1a: Set tasks that stretch pupils, but which are achievable, within a challenging curriculum
- 1b: Use intentional and consistent language that promotes challenge and aspiration
- 1c: Create a positive environment where making mistakes and learning from them is encouraged
- 1d: Seek opportunities to engage parents and carers in supporting their children's learning

### Standard 2: How Pupils Learn
- 2a: Avoid overloading working memory by taking into account pupils' prior knowledge
- 2b: Build on pupils' prior knowledge by linking what pupils already know to what is being taught
- 2c: Introduce new material in steps, explicitly linking new ideas to what has been previously studied and learned
- 2d: Increase the challenge and support withdrawn as knowledge becomes more secure (through rehearsal and practice)
- 2e: Plan regular review and practice of key ideas and concepts over time
- 2f: Design practice, generation, and retrieval tasks that provide just enough support

### Standard 3: Subject and Curriculum
- 3a: Deliver a carefully sequenced and coherent curriculum
- 3b: Identify essential concepts, knowledge, skills and principles of the subject
- 3c: Use curriculum knowledge to inform the use of explicit teaching, scaffolding, and practice
- 3d: Provide opportunity for all pupils to learn and master essential concepts, knowledge, skills and principles
- 3e: Work with experienced colleagues to accumulate and refine a collection of powerful analogies, illustrations, examples, explanations and demonstrations

### Standard 4: Classroom Practice
- 4a: Plan effective lessons, making use of explicit teaching, guided practice, and independent practice
- 4b: Use modelling, explanations, and scaffolds, acknowledging that novices need more structure early
- 4c: Enable critical thinking and problem solving by first ensuring pupils have a secure foundation of knowledge
- 4d: Use questioning to check pupils' understanding, using scaffolded and targeted questions
- 4e: Prompt pupils to elaborate when responding to questioning to check that a correct answer reflects true understanding
- 4f: Monitor pupil work during lessons, including checking for misconceptions
- 4g: Plan activities around what you want pupils to think hard about
- 4h: Discuss and apply the research evidence on how to effectively sequence lessons within a topic
- 4i: Break complex material into smaller steps
- 4j: Combine a+verbal explanation with a+relevant graphical representation of the concept or process
- 4k: Reduce distractions that take attention away from what is being taught
- 4l: Use worked examples that take pupils through each step of a new process
- 4m: Design and implement desirable difficulties such as spacing, interleaving, and retrieval practice
- 4n: Start expositions at the point of current pupil understanding
- 4o: Use concrete representation of abstract ideas (e.g. making use of analogies, metaphors, examples and non-examples)
- 4p: Include a range of types of questions in class discussions to extend and challenge pupils
- 4q: Elaborate on and query pupil contributions to support pupils' oral language skills

### Standard 5: Adaptive Teaching
- 5a: Identify pupils who need new content further broken down
- 5b: Make use of well-designed resources (e.g. scaffolds, sentence frames, word banks, learning strategies)
- 5c: Make use of formative assessment to adapt teaching within and between lessons
- 5d: Adapt lessons, whilst maintaining high expectations for all, so all pupils have the opportunity to meet expectations
- 5e: Balance input of new content so pupils' cognitive load is not exceeded
- 5f: Provide targeted support to pupils who are struggling using scaffolding

### Standard 6: Assessment
- 6a: Plan formative assessment tasks linked to lesson objectives and think ahead about what would indicate understanding
- 6b: Draw conclusions about what pupils have learned by looking at patterns of performance over a number of assessments
- 6c: Choose, where possible, parsing assessment approaches which give detailed and accurate information
- 6d: Structure tasks and questions to enable the identification of knowledge gaps and misconceptions
- 6e: Prompt pupils to elaborate when responding to questions to check that a correct answer reflects true understanding

### Standard 7: Managing Behaviour
- 7a: Establish a supportive and inclusive environment with a predictable system of reward and consequence
- 7b: Give manageable, specific, and sequential instructions
- 7c: Check pupils' understanding of instructions before a task begins
- 7d: Use consistent language and non-verbal signals for common classroom directions
- 7e: Acknowledge and praise pupil effort and emphasising progress being made

### Standard 8: Professional Behaviours
- 8a: Engage critically with research and discuss evidence with colleagues
- 8b: Reflect on progress made, recognise strengths and weaknesses, and identify next steps for further improvement
`;

const FEEDBACK_STRUCTURE = `
## Feedback Structure for Each Domain

For EACH domain, produce the following sections:

### What's Working Well (the "whatsWorking" field)
One honest paragraph (3-4 sentences) identifying genuine strengths evidenced by patterns in the transcript, not single instances. Wrap pedagogical terms in *asterisks* (e.g. *wait time*) — the system adds tooltips automatically; do NOT add explanations in brackets. Do NOT include timestamps in this field. Do NOT include emoji or section markers in the field value — the UI renders icons.
If no genuine strength is evidenced, say so briefly and move on — do not manufacture praise.

### To Make It Even Stronger (the "toMakeStronger" field)
ONE concrete, specific technique with brief research rationale. Must be directly connected to something observed in the transcript. Maximum 3-4 sentences. Do NOT include timestamps or emoji in this field.

### Try This Next Time (the "tryThisNext" field)
ONE practical strategy the teacher can implement immediately. Framed as building on existing practice. Maximum 3-4 sentences. Do NOT include emoji in this field.

### Transcript Examples (for "Want an example?" feature)
For EACH of whatsWorking, toMakeStronger, and tryThisNext, also provide 1-3 specific transcript examples in the corresponding examples array:
- Include the EXACT timestamp [MM:SS]
- Include the EXACT quote from the transcript
- Provide a brief explanation of significance
- Include examples of both effective practice and missed opportunities where relevant

### Missed Opportunities (the "missedOpportunities" array)
1-2 specific moments from the transcript where a different approach would have meaningfully improved the learning. Be specific — name the timestamp and what could have been done differently. Do not pad this list.

### Areas for Development (the "areasForDevelopment" array)
General patterns observed that could be improved (no timestamps).

### Research-Informed Suggestion (the "researchSuggestion" object)
- Name the specific technique
- How to implement it (concrete steps)
- Why it works (research evidence)
- Example of what it would sound like

## Session-Level Outputs

### MVP Moment (the "sessionMvp" object)
Identify the single strongest pedagogical moment in the session — the one that best demonstrates intentional, effective teaching. Name the timestamp, quote briefly, and explain why it worked. Do not default to the lesson hook unless it genuinely was the strongest moment.

### Overall Summary (the "overallSummary" field)
3-4 honest sentences covering: what the teacher is doing well as a pattern, the single most important development priority, and one specific action for next time. Do not mention student names. Do not use generic praise. Be the mentor you would want if this were your own practice.

### Top Strength (the "topStrength" field)
One sentence.

### Priority Growth Area (the "priorityGrowthArea" field)
One sentence — the most important thing, not a list.
`;

const OFSTED_RUBRIC = `
## Ofsted "Developing Teaching" Audio Transcript Analysis (November 2025 Framework)

From November 2025, Ofsted uses a 5-point grading scale:
- **Exceptional** - Exemplary practice
- **Strong standard** - High quality provision  
- **Expected standard** - Meeting requirements effectively
- **Needs attention** - Areas requiring development
- **Urgent improvement** - Critical concerns requiring immediate action

IMPORTANT: Only grade based on evidence PRESENT in the transcript. If something isn't observable (e.g., can't see written feedback, can't observe planning documents), do NOT grade down for its absence. Focus ONLY on what CAN be heard/observed.

### Key Areas to Evaluate from Audio Transcript:

**1. Quality of Explanation and Modelling**
- Clarity and precision of explanations
- Use of subject terminology
- Use of worked examples, models, non-examples
- Scaffolding that is progressively removed
- Pre-empting/addressing misconceptions

**2. Questioning and Responsive Teaching**
- Open, probing questions that extend thinking
- Strategic wait time (3-5 seconds)
- Building on learner responses with follow-up questions
- Real-time adaptation based on learner contributions
- Question distribution across all learners

**3. Assessment for Learning Through Dialogue**
- Checking understanding through dialogue
- Identifying and correcting misconceptions as they emerge
- Using learner responses diagnostically
- Feedback embedded in conversation

**4. Pedagogical Techniques in Delivery**
- Think-aloud strategies making expert thinking visible
- Retrieval practice and spaced learning
- Connecting to prior knowledge and future applications
- Cognitive demand level

**5. Classroom Climate and Expectations**
- Positive, intellectually rigorous environment
- High expectations in every interaction
- Encouraging risk-taking and treating mistakes as learning opportunities
- Active learner engagement

### Grading Guidance:

**Exceptional**: Sophisticated pedagogy throughout. Masterful questioning with consistent follow-up. All learners actively engaged. Expert scaffolding. Pre-empts misconceptions. Creates intellectually rigorous environment.

**Strong standard**: Consistently clear explanations with good examples. Strong questioning including open questions. Responsive to learner contributions. Positive environment with appropriate challenge.

**Expected standard**: Generally clear explanations. Uses questioning but may rely on closed questions. Some responsiveness to confusion. Adequate environment but may lack richness.

**Needs attention**: Explanations frequently unclear. Superficial questioning. Rarely builds on responses. Minimal checking for understanding. Low expectations evident.

**Urgent improvement**: Explanations consistently unclear or inaccurate. No effective questioning. Completely unresponsive to learner needs. No meaningful feedback. Negative environment.
`;

const ANALYSIS_RULES = `
## Critical Analysis Rules

1. Never mention student names — use "a student" or "students".
2. Use British English spelling throughout (behaviour, colour, organisation, analyse, etc.).
3. No timestamps in the main feedback body (whatsWorking, toMakeStronger, tryThisNext, summaries) — timestamps in the "examples" arrays only.
4. Wrap pedagogical terms in *asterisks* (e.g. *wait time*, *cold calling*) — the system handles tooltip definitions; do NOT add explanations in brackets.
5. One instance ≠ pattern. Patterns require multiple evidenced examples before crediting a strength.
6. Audio gaps must be named, not worked around. If group work or whole-class talk is inaudible, state this explicitly rather than inferring what happened.
7. Do not award credit for things you cannot observe (written planning, resources not described, student learning that cannot be inferred from audio alone).
8. If a stated time limit is given (e.g. "you have 20 seconds"), always check it against transcript timestamps and report both stated and actual.
9. If vocabulary above the stated learner level is used without scaffolding, always flag it.
10. If praise is repetitive (e.g. "well done" or "good" used more than five times), always name the phrase, give an approximate count, and suggest 3 varied alternatives.
11. The absence of good practice is itself feedback — name missed opportunities directly but without harshness.
12. Warmth comes from specificity and respect, not from softening genuine gaps. Be the mentor you would want.
`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transcript, selectedPhases, lessonPlan, scaffolding, studentWork, mode, learnerLevel, subject, selectedCategories, userRole } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Service temporarily unavailable" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isTrainee = userRole === "trainee";

    // Build phase context based on selection
    let phaseContext = "Analyse only the lesson phases genuinely evidenced in this recording. These are snapshots — phases may be absent and that is expected. Do NOT fabricate or include a Closing phase. If there is no clear Opening, omit it entirely. Only include phases (Opening, Core Teaching, Application) that are actually present and evidenced in the transcript.";

    // Map category names to domain names
    const categoryToDomain: Record<string, string> = {
      "Questioning Techniques": "Questioning & Cognitive Challenge",
      "Clarity of Explanation": "Explanation & Conceptual Clarity", 
      "Responsive Listening and Feedback": "Responsive Teaching & Formative Assessment",
      "Tone and Emotional Climate": "Classroom Culture & Learning Environment",
      "Student Participation and Voice Distribution": "Participation & Voice Equity"
    };

    // Build category filter — Pacing & Time Management is always included as the 6th domain
    const PACING_DOMAIN = "Pacing & Time Management";
    let categoryContext = "";
    let domainsToAnalyse = [...Object.values(categoryToDomain), PACING_DOMAIN];
    if (selectedCategories && selectedCategories.length > 0 && selectedCategories.length < 5) {
      const mapped = selectedCategories.map((c: string) => categoryToDomain[c] || c);
      domainsToAnalyse = [...mapped, PACING_DOMAIN];
      categoryContext = `\n\nONLY provide feedback for these specific domains: ${domainsToAnalyse.join(", ")}. Always include "${PACING_DOMAIN}" as a domain. Do NOT include feedback for other domains.`;
    }

    // Build learner context — more explicit for trainees
    let learnerContext = "";
    if (learnerLevel || subject) {
      learnerContext = "\n\nADDITIONAL CONTEXT:\n";
      if (learnerLevel) learnerContext += `Learner Level: ${learnerLevel}\n`;
      if (subject) learnerContext += `Teaching focus (what was being taught in this specific recording): ${subject}\n`;
      
      if (isTrainee) {
        learnerContext += `\nCRITICAL: You MUST tailor ALL feedback specifically to the "${learnerLevel}" learner level. Consider:
- What pedagogical approaches are most effective for this age group/level?
- How should the teacher pitch their language, explanations, and questioning for these learners?
- What classroom management strategies are appropriate for this level?
- How does differentiation look at this level?
- What does effective practice specifically look like when teaching ${learnerLevel} learners?
Adjust ALL your feedback, examples, and suggestions to be relevant and practical for someone teaching at this level.`;
      } else {
        learnerContext += "Consider this context when providing feedback - tailor suggestions appropriately for this audience and subject matter.";
      }
    }

    // Build additional context based on mode
    let additionalContext = "";
    if (mode === "deep-dive" && lessonPlan) {
      additionalContext = `
Compare the delivery against the lesson plan provided:
${lessonPlan}

Analyse alignment between planned activities and actual delivery.
`;
    }
    
    if (mode === "full-review") {
      if (lessonPlan) {
        additionalContext += `\nLesson Plan:\n${lessonPlan}\n`;
      }
      if (scaffolding) {
        additionalContext += `\nScaffolding Materials:\n${scaffolding}\n`;
      }
      if (studentWork) {
        additionalContext += `\nStudent Work Analysis Context:\n${studentWork}\n`;
      }
    }

    // Build the system prompt conditionally based on role
    let systemPrompt: string;
    let jsonSchema: string;

    if (isTrainee) {
      // TRAINEE PROMPT — progression stages, ITTECF, Standard English, no Ofsted, no lesson phases
      systemPrompt = `You are an experienced teacher educator providing honest, precise, and developmental feedback to a TRAINEE TEACHER on a micro-teach session. You are based in the UK and use British English spelling throughout.

${ROLE_AND_PRINCIPLE}

${LESSON_STRUCTURE}

${DOMAIN_DEFINITIONS}

${TRAINEE_PROGRESSION_CRITERIA}

${FEEDBACK_STRUCTURE}

${STANDARD_ENGLISH_SECTION}

${ITTECF_LEARN_HOW_TO}

${ANALYSIS_RULES}

${phaseContext}
${categoryContext}
${learnerContext}
${additionalContext}

CRITICAL: Return ONLY valid JSON. No text before or after. No markdown code blocks. Start directly with { and end with }.`;

      jsonSchema = `
Respond with valid JSON matching this exact structure:
{
  "sessionMvp": {
    "moment": "Describe the SINGLE BEST teaching moment focusing on WHAT the teacher did pedagogically and WHY it was effective. 4-6 sentences.",
    "pedagogyHighlight": "Name the specific technique"
  },
  "categories": [
    {
      "name": "Domain name (one entry per domain — return all six unless filtered: Questioning & Cognitive Challenge, Explanation & Conceptual Clarity, Responsive Teaching & Formative Assessment, Classroom Culture & Learning Environment, Participation & Voice Equity, Pacing & Time Management)",
      "rating": "developing" | "establishing" | "embedding",
      "summary": "2-3 sentence summary explaining the progression stage",
      "whatsWorking": "GENERAL explanation. NO timestamps. Max 4-5 sentences.",
      "whatsWorkingExamples": [
        {"timestamp": "[MM:SS]", "quote": "Exact words spoken", "explanation": "Why this demonstrates the strength"}
      ],
      "toMakeStronger": "GENERAL explanation. NO timestamps. ONE actionable technique. Max 4-5 sentences.",
      "toMakeStrongerExamples": [
        {"timestamp": "[MM:SS]", "quote": "Exact words or description", "explanation": "What could be done differently"}
      ],
      "areasForDevelopment": ["General pattern - improvement suggestion"],
      "missedOpportunities": ["Strategy not used - when it could have been employed"],
      "tryThisNext": "Concrete strategy. Max 4-5 sentences.",
      "tryThisNextExamples": [
        {"timestamp": "[MM:SS]", "quote": "Moment where this could have been applied", "explanation": "How the technique would work here"}
      ],
      "researchSuggestion": {
        "technique": "Name of the technique",
        "howToImplement": "Concrete steps",
        "whyItWorks": "Research evidence",
        "example": "What it would sound like"
      }
    }
  ],
  "standardEnglish": {
    "stars": 4,
    "feedback": "A single qualitative paragraph acknowledging strengths and highlighting meaningful patterns or slip-ups in an encouraging, coaching tone. This field must be a non-empty string."
  },
  "ittecfIndicators": [
    {
      "standard": "Standard 4",
      "subCode": "4q",
      "statement": "Elaborate on and query pupil contributions to support pupils' oral language skills",
      "status": "demonstrated" | "not_yet_evidenced",
      "evidence": "One sentence of specific evidence from the transcript explaining why you assigned this status"
    }
  ],
  "overallSummary": "Brief 2-3 sentence summary. Encouraging tone for a trainee.",
  "topStrength": "Single biggest strength with evidence",
  "priorityGrowthArea": "Most impactful development area, framed positively as a growth opportunity"
}`;
    } else {
      // STAFF PROMPT — star ratings, Ofsted, lesson phases (unchanged from original)
      systemPrompt = `You are an experienced teacher educator providing honest, precise, and developmental feedback on a classroom session transcript. You are based in the UK and use British English spelling throughout.

${ROLE_AND_PRINCIPLE}

${LESSON_STRUCTURE}

${DOMAIN_DEFINITIONS}

${RATING_CRITERIA}

${FEEDBACK_STRUCTURE}

${OFSTED_RUBRIC}

${ANALYSIS_RULES}

${phaseContext}
${categoryContext}
${learnerContext}
${additionalContext}

CRITICAL: Return ONLY valid JSON. No text before or after. No markdown code blocks. Start directly with { and end with }.`;

      jsonSchema = `
Respond with valid JSON matching this exact structure:
{
  "sessionMvp": {
    "moment": "Describe the SINGLE BEST teaching moment focusing on WHAT the teacher did pedagogically and WHY it was effective. Do NOT start with a timestamp. 4-6 sentences.",
    "pedagogyHighlight": "Name the specific technique (e.g., 'Expert Socratic questioning', 'Perfect wait time')"
  },
  "categories": [
    {
      "name": "Domain name (one entry per domain — return all six unless filtered: Questioning & Cognitive Challenge, Explanation & Conceptual Clarity, Responsive Teaching & Formative Assessment, Classroom Culture & Learning Environment, Participation & Voice Equity, Pacing & Time Management)",
      "rating": 1-4,
      "summary": "2-3 sentence summary explaining the rating",
      "whatsWorking": "GENERAL explanation. NO timestamps. Max 4-5 sentences.",
      "whatsWorkingExamples": [
        {"timestamp": "[MM:SS]", "quote": "Exact words spoken", "explanation": "Why this demonstrates the strength"}
      ],
      "toMakeStronger": "GENERAL explanation. NO timestamps. ONE actionable technique. Max 4-5 sentences.",
      "toMakeStrongerExamples": [
        {"timestamp": "[MM:SS]", "quote": "Exact words or description", "explanation": "What could be done differently"}
      ],
      "areasForDevelopment": ["General pattern - improvement suggestion"],
      "missedOpportunities": ["Strategy not used - when it could have been employed"],
      "tryThisNext": "Concrete strategy. Max 4-5 sentences.",
      "tryThisNextExamples": [
        {"timestamp": "[MM:SS]", "quote": "Moment where this could have been applied", "explanation": "How the technique would work here"}
      ],
      "researchSuggestion": {
        "technique": "Name of the technique",
        "howToImplement": "Concrete steps",
        "whyItWorks": "Research evidence",
        "example": "What it would sound like"
      }
    }
  ],
  "lessonPhases": [
    {
      "phase": "Opening, Core Teaching, or Application only — never Closing. Only include phases genuinely evidenced. If no Opening is present, omit it.",
      "rating": "exemplary | solid | developing | emerging — these are the ONLY valid values, never use ITTECF status values here",
      "observations": ["observation with [MM:SS] timestamp"],
      "suggestions": ["suggestion"]
    }
  ],
  "ofstedGrade": {
    "grade": "exceptional" | "strong_standard" | "expected_standard" | "needs_attention" | "urgent_improvement",
    "summary": "2-3 sentence overview through Ofsted lens.",
    "strengths": ["Key strength with evidence"],
    "areasForDevelopment": ["Area to strengthen - only if observed"],
    "caveat": "What could NOT be assessed from audio alone"
  },
  "overallSummary": "Brief 2-3 sentence summary",
  "topStrength": "Single biggest strength with evidence",
  "priorityGrowthArea": "Most impactful development area, framed positively"
}`;
    }

    const callGateway = async () => {
      return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt + "\n\n" + jsonSchema },
            { role: "user", content: `Please analyse this classroom session transcript:\n\n${transcript}` }
          ],
          temperature: 0.3,
          max_tokens: 16384,
        }),
      });
    };

    let response = await callGateway();
    let responseText = "";
    let aiResponse: any = null;

    // Retry up to 2 times on empty/whitespace bodies (intermittent gateway issue)
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!response.ok) break;
      responseText = await response.text();
      const trimmed = responseText.trim();
      if (trimmed.length > 0) {
        try {
          aiResponse = JSON.parse(trimmed);
          break;
        } catch {
          console.error(`Attempt ${attempt + 1}: failed to parse, body length=${responseText.length}`);
        }
      } else {
        console.error(`Attempt ${attempt + 1}: empty/whitespace body from gateway`);
      }
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        response = await callGateway();
      }
    }

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add funds to your workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!aiResponse) {
      console.error("Failed to parse AI gateway response after retries:", responseText?.slice(0, 500));
      return new Response(JSON.stringify({ error: "The AI service returned an empty response. Please try again in a moment." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const content = aiResponse.choices?.[0]?.message?.content;
    
    if (!content) {
      console.error("No content in AI response:", JSON.stringify(aiResponse).slice(0, 500));
      return new Response(JSON.stringify({ error: "AI returned an empty response. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse the JSON from the response
    let feedback;
    try {
      let jsonStr = content.trim();
      
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      } else {
        const firstBrace = content.indexOf('{');
        const lastBrace = content.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          jsonStr = content.slice(firstBrace, lastBrace + 1);
        }
      }
      
      feedback = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content?.slice(0, 500));
      return new Response(JSON.stringify({ error: "Failed to parse AI response. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Defensive: strip stray emoji / section markers the model may prepend to text fields
    const stripMarkers = (s: unknown): unknown => {
      if (typeof s !== "string") return s;
      // Remove leading emoji/symbol markers (✓, →, 💡, 🎯 etc.) and surrounding whitespace
      return s.replace(/^[\s]*[\u2600-\u27BF\u{1F300}-\u{1FAFF}✓→]+[\s:–—-]*/gu, "").trim();
    };
    const sanitize = (obj: unknown): unknown => {
      if (Array.isArray(obj)) return obj.map(sanitize);
      if (obj && typeof obj === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
          out[k] = typeof v === "string" ? stripMarkers(v) : sanitize(v);
        }
        return out;
      }
      return obj;
    };
    feedback = sanitize(feedback);

    return new Response(JSON.stringify(feedback), {
      headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
    });

  } catch (error) {
    console.error("analyse-session error:", error);
    return new Response(
      JSON.stringify({ error: "Unable to process request. Please try again." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
