

## Plan: Replace feedback prompt with new modular blocks

This is doable. The new prompt is structurally similar to the existing one — same JSON output shape, just rewritten guidance — so it slots into the existing assembly without UI changes. The key differences:

1. New 6th domain (**Pacing & Time Management**) — renders automatically since `categories` is iterated.
2. New honesty/restraint framing throughout.
3. Tighter structural rules (audio gaps, vocabulary checks, timer checks, praise repetition counts).
4. ITTECF restructured into "Demonstrated" vs "Absent but expected" — maps cleanly onto existing `status: demonstrated | not_yet_evidenced`.

### Files to change

**`supabase/functions/analyze-session/index.ts`** — single file, no UI changes needed.

### What I'll replace

| Existing constant | Replacement |
|---|---|
| `LESSON_STRUCTURE` | New BLOCK 2 wording (snapshot framing, no Closing) |
| `DOMAIN_DEFINITIONS` | New BLOCK 3 — **six** domains with honesty checks (wait time, vocab, praise repetition, participation gaps, timer check) |
| `TRAINEE_PROGRESSION_CRITERIA` | New BLOCK 5 — Developing / Establishing / Embedding rewritten honestly, "Do not default to Establishing" |
| `STANDARD_ENGLISH_SECTION` | New BLOCK 6 — explicit listening list, praise count guidance, 1–5 wording |
| `ITTECF_LEARN_HOW_TO` | Keep the full Standards 1–8 list (BLOCK 7 references "the full ITT/ECF" — list is needed), but prepend new BLOCK 7 instructions: max 6 demonstrated, 2–3 absent but expected, patterns required |
| `FEEDBACK_STRUCTURE` | New BLOCK 4 — adds "Transcript Examples" and "Missed Opportunities" sections explicitly |
| `ANALYSIS_RULES` | New BLOCK 9 — adds audio gap honesty, no inferred credit, timer/vocab/praise mandates |
| (new) `ROLE_AND_PRINCIPLE` | New BLOCK 1 — mentor framing, audio-gap honesty |

### What stays the same

- `RATING_CRITERIA` (staff star ratings) — untouched, only the trainee path is being reworked per the new blocks. Confirming below.
- `OFSTED_RUBRIC` — untouched.
- JSON schema shape for trainee — adding a 6th category will work because the schema is `categories: [...]` open-ended. No schema change needed.
- Edge function plumbing, model (`google/gemini-2.5-flash`), `max_tokens: 8192`.
- All UI components (`FeedbackReport.tsx` already iterates categories and renders `missedOpportunities`).

### One thing I need to confirm

The new prompt is written for "trainee teacher / micro-teach" framing throughout (mentor, progression stages, ITTECF). Should this replace **only the trainee prompt**, or also the **staff prompt**? The blocks reference progression stages (Developing/Establishing/Embedding) which are the trainee scale, not the staff 1–4 star scale.

I'll proceed with: **apply new blocks to the trainee path; leave staff path (stars + Ofsted) using existing `RATING_CRITERIA` and `OFSTED_RUBRIC` but adopt the shared improvements** — new `LESSON_STRUCTURE`, new `DOMAIN_DEFINITIONS` (6 domains incl. Pacing), new `FEEDBACK_STRUCTURE`, new `ANALYSIS_RULES`, and the new BLOCK 1 role framing. This keeps both paths consistent on the parts the new prompt rewrites, while preserving the staff-specific rating/Ofsted scales.

If you'd rather apply the new blocks **only to trainee** and leave staff fully untouched, say so and I'll narrow the scope.

### Implementation steps

1. Rewrite the seven prompt constants in `analyze-session/index.ts` per the new blocks (keep the ITTECF Standards 1–8 catalogue, prepend new selection rules).
2. Add the new `ROLE_AND_PRINCIPLE` constant and prepend it to both `systemPrompt` builds.
3. Update the trainee JSON schema comment to allow 6 categories (no structural change, just reflect Pacing).
4. Keep `max_tokens: 8192` (already in place — safe for the larger prompt).
5. Deploy `analyze-session` edge function.

No UI changes required. No DB changes. No new dependencies.

