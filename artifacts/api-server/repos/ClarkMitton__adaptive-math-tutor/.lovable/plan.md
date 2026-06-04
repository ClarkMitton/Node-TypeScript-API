# Plan: demo-ready test flow + readability fixes

## 1. Make `1337` always start fresh (so you can demo end-to-end)

Server-side, in `startOrResumeSession` (`src/lib/scan.functions.ts`): when `studentId === "1337"`, wipe that student's existing `question_attempts`, `sub_topic_results`, and `scan_sessions` rows before the normal lookup/create path. Result: every time someone types `1337`, they land on the intro modal → category select → subtopic select → question, exactly as a first-time student would.

No UI change needed; the rest of the flow already works. Other student codes keep their progress.

## 2. Fix "freeroam not doing anything"

You're currently on `/?freeroam=false`. The admin link points at `/?freeroam=true`; somewhere you've landed on the `false` variant (probably navigating back from a question). Two small fixes:

- In `src/routes/admin.tsx`, keep the freeroam link as-is, but also add it to the landing footer (small text link next to the existing "Admin" link) so it's easy to reach during demos.
- In `src/routes/index.tsx`, treat any truthy `freeroam` value as on, and ignore `freeroam=false` entirely (drop the param from the URL so the back button doesn't strand you in a half-state).

If "not doing anything" means something else (e.g. categories don't respond), tell me and I'll dig further — but from the code, freeroam category + subtopic clicks both wire up correctly.

## 3. Lighten the modal / overlay panels

Right now `intro_modal`, `category_select`, and `subtopic_select` sit on a near-black 60–85% scrim over the background image, with white text floating directly on it. To improve readability without losing the background photo:

- **Intro modal**: wrap the heading/body/button in a panel — `background: rgba(255,255,255,0.92)`, `border-radius: 16`, `padding: 40 48`, `box-shadow: 0 20px 60px rgba(0,0,0,0.4)`. Switch the text colours to dark (`#0E0E10` heading, `#2A2A35` body) and use the existing accent button.
- **Category / subtopic select**: drop the full-screen 62% black scrim down to ~25%, and wrap the heading + tile grid in a similar light panel (`rgba(255,255,255,0.9)`, rounded, padded), centred with `max-width: 1100px`. Tiles stay dark-on-light for contrast.

Background images still show through around the edges; text becomes immediately legible.

## 4. Remove the NumberPad (it looks like a calculator)

Replace `<NumberPad />` in both `question` and `freeroam_question` screens with a single large text input + Submit button:

- Big input: `height: 72`, `font-size: 28`, monospace, autofocus, accepts any characters (numbers, minus, decimals), Enter submits.
- Submit button below: full-width, same style as the current NumberPad submit (accent yellow on freeroam, accent grey on real questions).
- Keep `answer` state and `handleSubmitAnswer` / `handleFreeroamSubmit` unchanged — only the input UI swaps.
- Delete the `NumberPad` import. Leave `src/components/NumberPad.tsx` on disk for now in case you want it back.

## Technical notes

- `1337` reset uses the existing student id `b7c7a7be-0a74-435a-b4e2-582e57638dcf` lookup by `unique_id`; deletes cascade via `session_id` / `sub_topic_result_id` foreign keys (the migration last turn confirmed the relationship).
- All edits are in `src/routes/index.tsx`, `src/lib/scan.functions.ts`, and a tiny addition in `src/routes/admin.tsx`. No schema migration, no new dependencies.
