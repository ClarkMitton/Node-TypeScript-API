import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import {
  checkAnswer,
  getQuestion,
  NUMBER_SUB_TOPICS,
  SUB_TOPIC_MAP,
  type Grade,
} from "./question-bank";

// ── AI helper ────────────────────────────────────────────────────────────────

function getModel() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  return createLovableAiGatewayProvider(key)("google/gemini-3-flash-preview");
}

// ── Admin guard ──────────────────────────────────────────────────────────────

function adminGuard(password: string) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw new Error("Admin not configured");
  if (password !== expected) throw new Error("Invalid admin password");
}

// ── Feedback messages ─────────────────────────────────────────────────────────

const CORRECT_MSGS = ["Nice one.", "Good work.", "That's it."];
const INCORRECT_RETRY_MSGS = ["Have another go.", "Try again."];
const INCORRECT_MOVING_DOWN = "No problem — let's try a slightly different one.";
const MOVING_ON = "On to the next one.";

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── STUDENT: get active categories ───────────────────────────────────────────

export const getCategories = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("category_settings")
    .select("category_key, display_name, is_active, display_order")
    .order("display_order", { ascending: true });
  if (error) throw new Error(error.message);
  return { categories: data };
});

// ── STUDENT: start or resume session ─────────────────────────────────────────

export const startOrResumeSession = createServerFn({ method: "POST" })
  .inputValidator((d: { studentId: string; theme: string }) =>
    z.object({ studentId: z.string().min(1).max(50), theme: z.string() }).parse(d),
  )
  .handler(async ({ data }) => {
    const studentId = data.studentId.trim();

    // Find student
    const { data: student, error: sErr } = await supabaseAdmin
      .from("students")
      .select("id")
      .eq("unique_id", studentId)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!student) return { error: "not_found" as const };

    // Demo/test code: always wipe prior progress so the full flow can be shown
    if (studentId === "1337") {
      const { data: priorSessions } = await supabaseAdmin
        .from("scan_sessions")
        .select("id")
        .eq("student_id", student.id);
      const sessionIds = (priorSessions ?? []).map((s) => s.id);
      if (sessionIds.length > 0) {
        const { data: priorResults } = await supabaseAdmin
          .from("sub_topic_results")
          .select("id")
          .in("session_id", sessionIds);
        const resultIds = (priorResults ?? []).map((r) => r.id);
        if (resultIds.length > 0) {
          await supabaseAdmin.from("question_attempts").delete().in("sub_topic_result_id", resultIds);
        }
        await supabaseAdmin.from("sub_topic_results").delete().in("session_id", sessionIds);
        await supabaseAdmin.from("scan_sessions").delete().in("id", sessionIds);
      }
    }

    // Check for resumable session within 3 hours
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const { data: existingSession } = await supabaseAdmin
      .from("scan_sessions")
      .select("id, theme")
      .eq("student_id", student.id)
      .eq("completed", false)
      .gte("started_at", threeHoursAgo)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSession) {
      // Mark restore time
      await supabaseAdmin
        .from("scan_sessions")
        .update({ restored_at: new Date().toISOString() })
        .eq("id", existingSession.id);

      const resumeData = await getSessionState(existingSession.id);
      return {
        resumed: true as const,
        sessionId: existingSession.id,
        theme: existingSession.theme,
        ...resumeData,
      };
    }

    // Count previous sessions to determine if first session
    const { count } = await supabaseAdmin
      .from("scan_sessions")
      .select("id", { count: "exact", head: true })
      .eq("student_id", student.id);

    const isFirstSession = (count ?? 0) === 0;

    const { data: newSession, error: nsErr } = await supabaseAdmin
      .from("scan_sessions")
      .insert({ student_id: student.id, theme: data.theme })
      .select("id")
      .single();
    if (nsErr) throw new Error(nsErr.message);

    return {
      resumed: false as const,
      sessionId: newSession.id as string,
      theme: data.theme,
      isFirstSession,
      completedSubTopics: [] as string[],
      inProgressSubTopic: null as null,
    };
  });

async function getSessionState(sessionId: string) {
  const { data: results } = await supabaseAdmin
    .from("sub_topic_results")
    .select("id, sub_topic_key, completed, current_grade, g2_attempts, selection_order")
    .eq("session_id", sessionId)
    .order("selection_order", { ascending: true });

  const completedSubTopics = (results ?? [])
    .filter((r: any) => r.completed)
    .map((r: any) => r.sub_topic_key as string);

  const inProgress = (results ?? []).find((r: any) => !r.completed) as any | undefined;

  return {
    completedSubTopics,
    inProgressSubTopic: inProgress
      ? {
          id: inProgress.id as string,
          key: inProgress.sub_topic_key as string,
          currentGrade: inProgress.current_grade as number,
          g2Attempts: inProgress.g2_attempts as number,
          selectionOrder: inProgress.selection_order as number,
        }
      : null,
  };
}

// ── STUDENT: start a sub-topic ────────────────────────────────────────────────

export const startSubTopic = createServerFn({ method: "POST" })
  .inputValidator((d: { sessionId: string; subTopicKey: string; selectionOrder: number }) =>
    z
      .object({
        sessionId: z.string().uuid(),
        subTopicKey: z.string(),
        selectionOrder: z.number().int().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    if (!SUB_TOPIC_MAP[data.subTopicKey]) throw new Error("Unknown sub-topic");

    const { data: result, error } = await supabaseAdmin
      .from("sub_topic_results")
      .insert({
        session_id: data.sessionId,
        sub_topic_key: data.subTopicKey,
        selection_order: data.selectionOrder,
        current_grade: 2,
        g2_attempts: 0,
        g3_attempts: 0,
        g4_attempts: 0,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const question = getQuestion(data.subTopicKey, 2);

    const { data: qMeta } = await supabaseAdmin
      .from("questions")
      .select("image_search_term, custom_image_url")
      .eq("sub_topic_key", data.subTopicKey)
      .eq("grade", 2)
      .maybeSingle();

    return {
      subTopicResultId: result.id as string,
      question: question!.prompt,
      grade: 2,
      attemptNumber: 1,
      imageSearchTerm: (qMeta?.image_search_term as string | null) ?? null,
      customImageUrl: (qMeta?.custom_image_url as string | null) ?? null,
    };
  });

// ── STUDENT: get current question (for resume) ────────────────────────────────

export const getCurrentQuestion = createServerFn({ method: "POST" })
  .inputValidator((d: { subTopicResultId: string }) =>
    z.object({ subTopicResultId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { data: result, error } = await supabaseAdmin
      .from("sub_topic_results")
      .select("sub_topic_key, current_grade, g2_attempts, g3_attempts, g4_attempts")
      .eq("id", data.subTopicResultId)
      .single();
    if (error || !result) throw new Error("Sub-topic result not found");

    const grade = result.current_grade as Grade;
    const question = getQuestion(result.sub_topic_key as string, grade);
    const attemptNumber =
      grade === 2 ? (result.g2_attempts as number) + 1
      : grade === 3 ? (result.g3_attempts as number) + 1
      : grade === 4 ? (result.g4_attempts as number) + 1
      : 1;

    const { data: qMeta } = await supabaseAdmin
      .from("questions")
      .select("image_search_term, custom_image_url")
      .eq("sub_topic_key", result.sub_topic_key as string)
      .eq("grade", grade)
      .maybeSingle();

    return {
      question: question!.prompt,
      grade,
      attemptNumber,
      imageSearchTerm: (qMeta?.image_search_term as string | null) ?? null,
      customImageUrl: (qMeta?.custom_image_url as string | null) ?? null,
    };
  });

// ── STUDENT: submit answer ────────────────────────────────────────────────────

export const submitAnswer = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { sessionId: string; subTopicResultId: string; answer: string; secondsTaken?: number }) =>
      z
        .object({
          sessionId: z.string().uuid(),
          subTopicResultId: z.string().uuid(),
          answer: z.string().max(500),
          secondsTaken: z.number().min(0).max(3600).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data }) => {
    const { data: result, error } = await supabaseAdmin
      .from("sub_topic_results")
      .select("sub_topic_key, current_grade, g2_attempts, g3_attempts, g4_attempts")
      .eq("id", data.subTopicResultId)
      .single();
    if (error || !result) throw new Error("Sub-topic result not found");

    const subTopicKey = result.sub_topic_key as string;
    const grade = result.current_grade as Grade;
    const g2Attempts = result.g2_attempts as number;
    const g3Attempts = result.g3_attempts as number;
    const g4Attempts = result.g4_attempts as number;

    const entry = getQuestion(subTopicKey, grade);
    if (!entry) throw new Error("Question not found in bank");

    const isCorrect = checkAnswer(data.answer, entry);
    const attemptNumber =
      grade === 2 ? g2Attempts + 1
      : grade === 3 ? g3Attempts + 1
      : grade === 4 ? g4Attempts + 1
      : 1;

    // Record the attempt
    await supabaseAdmin.from("question_attempts").insert({
      session_id: data.sessionId,
      sub_topic_result_id: data.subTopicResultId,
      sub_topic_key: subTopicKey,
      grade,
      attempt_number: attemptNumber,
      given_answer: data.answer,
      is_correct: isCorrect,
      seconds_taken: data.secondsTaken ?? null,
    });

    // Grade logic
    type NextAction =
      | { type: "retry"; grade: number; attemptNumber: number }
      | { type: "next_grade"; grade: number }
      | { type: "fallback_g1" }
      | { type: "subtopic_done"; ceiling: number | null };

    let feedback: string = MOVING_ON;
    let nextAction: NextAction = { type: "subtopic_done", ceiling: null };
    let gradeCeiling: number | null = null;
    let subTopicDone = false;
    let neededG2Retry = (result.g2_attempts as number) > 0;

    if (isCorrect) {
      feedback = pickRandom(CORRECT_MSGS);
      if (grade === 2) {
        nextAction = { type: "next_grade", grade: 3 };
        await supabaseAdmin
          .from("sub_topic_results")
          .update({ current_grade: 3, g2_attempts: g2Attempts })
          .eq("id", data.subTopicResultId);
      } else if (grade === 3) {
        nextAction = { type: "next_grade", grade: 4 };
        await supabaseAdmin
          .from("sub_topic_results")
          .update({ current_grade: 4 })
          .eq("id", data.subTopicResultId);
      } else if (grade === 4) {
        // G4 correct → ceiling = 4, done
        gradeCeiling = 4;
        subTopicDone = true;
        nextAction = { type: "subtopic_done", ceiling: 4 };
        await supabaseAdmin
          .from("sub_topic_results")
          .update({ grade_ceiling: 4, completed: true })
          .eq("id", data.subTopicResultId);
      } else if (grade === 1) {
        // G1 correct (fallback) → ceiling = 1, done
        gradeCeiling = 1;
        subTopicDone = true;
        nextAction = { type: "subtopic_done", ceiling: 1 };
        await supabaseAdmin
          .from("sub_topic_results")
          .update({ grade_ceiling: 1, completed: true, needed_g2_retry: neededG2Retry })
          .eq("id", data.subTopicResultId);
      }
    } else {
      if (grade === 2 && g2Attempts === 0) {
        // First G2 attempt failed → retry G2
        feedback = pickRandom(INCORRECT_RETRY_MSGS);
        nextAction = { type: "retry", grade: 2, attemptNumber: 2 };
        await supabaseAdmin
          .from("sub_topic_results")
          .update({ g2_attempts: 1, needed_g2_retry: true })
          .eq("id", data.subTopicResultId);
      } else if (grade === 2 && g2Attempts >= 1) {
        // Both G2 attempts failed → fallback to G1
        feedback = INCORRECT_MOVING_DOWN;
        nextAction = { type: "fallback_g1" };
        await supabaseAdmin
          .from("sub_topic_results")
          .update({ current_grade: 1, needed_g2_retry: true })
          .eq("id", data.subTopicResultId);
      } else if (grade === 1) {
        // G1 failed → no ceiling
        feedback = MOVING_ON;
        gradeCeiling = null;
        subTopicDone = true;
        nextAction = { type: "subtopic_done", ceiling: null };
        await supabaseAdmin
          .from("sub_topic_results")
          .update({ grade_ceiling: null, completed: true, needed_g2_retry: neededG2Retry })
          .eq("id", data.subTopicResultId);
      } else if (grade === 3 && g3Attempts === 0) {
        // G3 first fail → retry G3
        feedback = pickRandom(INCORRECT_RETRY_MSGS);
        nextAction = { type: "retry", grade: 3, attemptNumber: 2 };
        await supabaseAdmin
          .from("sub_topic_results")
          .update({ g3_attempts: 1 })
          .eq("id", data.subTopicResultId);
      } else if (grade === 3 && g3Attempts >= 1) {
        // G3 second fail → ceiling = 2
        feedback = MOVING_ON;
        gradeCeiling = 2;
        subTopicDone = true;
        nextAction = { type: "subtopic_done", ceiling: 2 };
        await supabaseAdmin
          .from("sub_topic_results")
          .update({ grade_ceiling: 2, completed: true })
          .eq("id", data.subTopicResultId);
      } else if (grade === 4 && g4Attempts === 0) {
        // G4 first fail → retry G4
        feedback = pickRandom(INCORRECT_RETRY_MSGS);
        nextAction = { type: "retry", grade: 4, attemptNumber: 2 };
        await supabaseAdmin
          .from("sub_topic_results")
          .update({ g4_attempts: 1 })
          .eq("id", data.subTopicResultId);
      } else {
        // G4 second fail → ceiling = 3
        feedback = MOVING_ON;
        gradeCeiling = 3;
        subTopicDone = true;
        nextAction = { type: "subtopic_done", ceiling: 3 };
        await supabaseAdmin
          .from("sub_topic_results")
          .update({ grade_ceiling: 3, completed: true })
          .eq("id", data.subTopicResultId);
      }
    }

    // Check if all sub-topics complete
    let sessionComplete = false;
    if (subTopicDone) {
      const { data: allResults } = await supabaseAdmin
        .from("sub_topic_results")
        .select("completed")
        .eq("session_id", data.sessionId);
      const totalSubTopics = NUMBER_SUB_TOPICS.length;
      const completedCount = (allResults ?? []).filter((r: any) => r.completed).length;
      if (completedCount >= totalSubTopics) {
        sessionComplete = true;
        await supabaseAdmin
          .from("scan_sessions")
          .update({ completed: true, completed_at: new Date().toISOString() })
          .eq("id", data.sessionId);
      }
    }

    // Build next question if needed
    let nextQuestion: string | null = null;
    if (nextAction.type === "next_grade") {
      const q = getQuestion(subTopicKey, nextAction.grade as Grade);
      nextQuestion = q?.prompt ?? null;
    } else if (nextAction.type === "fallback_g1") {
      const q = getQuestion(subTopicKey, 1);
      nextQuestion = q?.prompt ?? null;
    } else if (nextAction.type === "retry") {
      const q = getQuestion(subTopicKey, nextAction.grade as Grade);
      nextQuestion = q?.prompt ?? null;
    }

    return {
      isCorrect,
      feedback,
      nextAction,
      nextQuestion,
      gradeCeiling,
      subTopicDone,
      sessionComplete,
    };
  });

// ── STUDENT: update session meta (music/accessibility) ───────────────────────

export const updateSessionMeta = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { sessionId: string; musicUsed?: boolean; musicTrack?: string; accessibilitySettings?: object }) =>
      z
        .object({
          sessionId: z.string().uuid(),
          musicUsed: z.boolean().optional(),
          musicTrack: z.string().optional(),
          accessibilitySettings: z.record(z.string(), z.unknown()).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data }) => {
    const update: Record<string, unknown> = {};
    if (data.musicUsed !== undefined) update.music_used = data.musicUsed;
    if (data.musicTrack !== undefined) update.music_track = data.musicTrack;
    if (data.accessibilitySettings !== undefined)
      update.accessibility_settings = data.accessibilitySettings;
    await supabaseAdmin.from("scan_sessions").update(update as never).eq("id", data.sessionId);
    return { ok: true };
  });

// ── ADMIN ─────────────────────────────────────────────────────────────────────

export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string }) => z.object({ password: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    adminGuard(data.password);
    return { ok: true };
  });

// ── ADMIN: upload students from CSV ──────────────────────────────────────────

export const adminUploadStudents = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string; csvData: string }) =>
    z.object({ password: z.string().min(1), csvData: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    adminGuard(data.password);

    const lines = data.csvData.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row");

    // Skip header
    const rows = lines.slice(1).map((line) => {
      const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      return { uniqueId: cols[0], name: cols[1], group: cols[2] };
    });

    const errors: string[] = [];
    const seen = new Set<string>();
    const valid = rows.filter((r, i) => {
      if (!r.uniqueId) { errors.push(`Row ${i + 2}: missing Unique ID`); return false; }
      if (!r.name) { errors.push(`Row ${i + 2}: missing Student Name`); return false; }
      if (!r.group) { errors.push(`Row ${i + 2}: missing Group`); return false; }
      if (seen.has(r.uniqueId)) { errors.push(`Row ${i + 2}: duplicate ID ${r.uniqueId}`); return false; }
      seen.add(r.uniqueId);
      return true;
    });

    if (valid.length === 0) throw new Error("No valid rows: " + errors.join("; "));

    // Upsert groups
    const groupNames = [...new Set(valid.map((r) => r.group))];
    for (const name of groupNames) {
      await supabaseAdmin
        .from("groups")
        .upsert({ name }, { onConflict: "name", ignoreDuplicates: true });
    }

    // Get group IDs
    const { data: groupRows } = await supabaseAdmin
      .from("groups")
      .select("id, name")
      .in("name", groupNames);
    const groupMap = Object.fromEntries((groupRows ?? []).map((g: any) => [g.name, g.id]));

    // Upsert students
    const studentRows = valid.map((r) => ({
      unique_id: r.uniqueId,
      name: r.name,
      group_id: groupMap[r.group] ?? null,
    }));

    const { error: insertErr } = await supabaseAdmin
      .from("students")
      .upsert(studentRows, { onConflict: "unique_id" });
    if (insertErr) throw new Error(insertErr.message);

    return { inserted: valid.length, errors };
  });

// ── ADMIN: list groups ────────────────────────────────────────────────────────

export const adminGetGroups = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string }) => z.object({ password: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    adminGuard(data.password);
    const { data: groups, error } = await supabaseAdmin
      .from("groups")
      .select("id, name, created_at")
      .order("name");
    if (error) throw new Error(error.message);

    // For each group, get student count and completion stats
    const enriched = await Promise.all(
      (groups ?? []).map(async (g: any) => {
        const { data: students } = await supabaseAdmin
          .from("students")
          .select("id")
          .eq("group_id", g.id);
        const studentIds = (students ?? []).map((s: any) => s.id);

        let completedCount = 0;
        let startedCount = 0;
        if (studentIds.length > 0) {
          const { data: sessions } = await supabaseAdmin
            .from("scan_sessions")
            .select("completed, student_id")
            .in("student_id", studentIds);
          const latestByStudent = new Map<string, any>();
          for (const s of sessions ?? []) {
            latestByStudent.set(s.student_id, s);
          }
          for (const s of latestByStudent.values()) {
            if (s.completed) completedCount++;
            else startedCount++;
          }
        }

        return {
          id: g.id as string,
          name: g.name as string,
          totalStudents: studentIds.length,
          completedCount,
          startedCount,
        };
      }),
    );

    return { groups: enriched };
  });

// ── ADMIN: get group detail ───────────────────────────────────────────────────

export const adminGetGroupDetail = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string; groupId: string }) =>
    z.object({ password: z.string().min(1), groupId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    adminGuard(data.password);

    const { data: students } = await supabaseAdmin
      .from("students")
      .select("id, unique_id, name")
      .eq("group_id", data.groupId)
      .order("unique_id");

    const enriched = await Promise.all(
      (students ?? []).map(async (s: any) => {
        const { data: session } = await supabaseAdmin
          .from("scan_sessions")
          .select("id, completed, started_at, completed_at")
          .eq("student_id", s.id)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        let subTopicSummary: Record<string, number | null> = {};
        if (session) {
          const { data: results } = await supabaseAdmin
            .from("sub_topic_results")
            .select("sub_topic_key, grade_ceiling")
            .eq("session_id", session.id)
            .eq("completed", true);
          for (const r of results ?? []) {
            subTopicSummary[r.sub_topic_key] = r.grade_ceiling;
          }
        }

        return {
          id: s.id as string,
          uniqueId: s.unique_id as string,
          name: s.name as string,
          status: session ? (session.completed ? "complete" : "in_progress") : "not_started",
          startedAt: session?.started_at ?? null,
          completedAt: session?.completed_at ?? null,
          subTopicSummary,
        };
      }),
    );

    // Grade distribution per sub-topic for the group
    const subTopicStats: Record<string, Record<string, number>> = {};
    for (const student of enriched) {
      for (const [key, ceiling] of Object.entries(student.subTopicSummary)) {
        if (!subTopicStats[key]) subTopicStats[key] = { null: 0, "1": 0, "2": 0, "3": 0, "4": 0 };
        const bucket = ceiling === null ? "null" : String(ceiling);
        subTopicStats[key][bucket] = (subTopicStats[key][bucket] ?? 0) + 1;
      }
    }

    return { students: enriched, subTopicStats };
  });

// ── ADMIN: get student detail ─────────────────────────────────────────────────

export const adminGetStudentDetail = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string; studentId: string }) =>
    z.object({ password: z.string().min(1), studentId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    adminGuard(data.password);

    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id, unique_id, name, groups(name)")
      .eq("id", data.studentId)
      .single();
    if (!student) throw new Error("Student not found");

    const { data: session } = await supabaseAdmin
      .from("scan_sessions")
      .select("id, theme, music_used, completed, started_at, completed_at, accessibility_settings")
      .eq("student_id", data.studentId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!session) {
      return { student, session: null, subTopics: [], attempts: [] };
    }

    const { data: subTopics } = await supabaseAdmin
      .from("sub_topic_results")
      .select(
        "sub_topic_key, selection_order, grade_ceiling, needed_g2_retry, completed, current_grade",
      )
      .eq("session_id", session.id)
      .order("selection_order");

    const { data: attempts } = await supabaseAdmin
      .from("question_attempts")
      .select("sub_topic_key, grade, attempt_number, is_correct, seconds_taken, created_at")
      .eq("session_id", session.id)
      .order("created_at");

    // Avg time per question
    const times = (attempts ?? [])
      .map((a: any) => a.seconds_taken as number)
      .filter(Boolean);
    const avgTime = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : null;

    return {
      student,
      session,
      subTopics: subTopics ?? [],
      attempts: attempts ?? [],
      avgSecondsPerQuestion: avgTime,
    };
  });

// ── ADMIN: get/toggle categories ──────────────────────────────────────────────

export const adminGetCategories = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string }) => z.object({ password: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    adminGuard(data.password);
    const { data: cats, error } = await supabaseAdmin
      .from("category_settings")
      .select("*")
      .order("display_order");
    if (error) throw new Error(error.message);
    return { categories: cats };
  });

export const adminToggleCategory = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string; categoryKey: string; isActive: boolean }) =>
    z
      .object({ password: z.string().min(1), categoryKey: z.string(), isActive: z.boolean() })
      .parse(d),
  )
  .handler(async ({ data }) => {
    adminGuard(data.password);
    const { error } = await supabaseAdmin
      .from("category_settings")
      .update({ is_active: data.isActive })
      .eq("category_key", data.categoryKey);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUpdateCategoryName = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string; categoryKey: string; displayName: string }) =>
    z
      .object({ password: z.string().min(1), categoryKey: z.string(), displayName: z.string().min(1) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    adminGuard(data.password);
    const { error } = await supabaseAdmin
      .from("category_settings")
      .update({ display_name: data.displayName })
      .eq("category_key", data.categoryKey);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Sub-topic server functions ────────────────────────────────────────────────

export const getSubTopics = createServerFn({ method: "POST" })
  .inputValidator((d: { categoryKey: string }) =>
    z.object({ categoryKey: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin
      .from("sub_topics")
      .select("sub_topic_key, display_name, display_order")
      .eq("category_key", data.categoryKey)
      .order("display_order");
    if (error) throw new Error(error.message);
    return { subTopics: rows ?? [] };
  });

export const adminGetSubTopics = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string; categoryKey?: string }) =>
    z.object({ password: z.string().min(1), categoryKey: z.string().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    adminGuard(data.password);
    let query = supabaseAdmin
      .from("sub_topics")
      .select("id, category_key, sub_topic_key, display_name, display_order")
      .order("category_key")
      .order("display_order");
    if (data.categoryKey) query = query.eq("category_key", data.categoryKey);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return { subTopics: rows ?? [] };
  });

export const adminAddSubTopic = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string; categoryKey: string; displayName: string }) =>
    z
      .object({ password: z.string().min(1), categoryKey: z.string().min(1), displayName: z.string().min(1) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    adminGuard(data.password);
    const subTopicKey = data.displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    const { data: existing } = await supabaseAdmin
      .from("sub_topics")
      .select("display_order")
      .eq("category_key", data.categoryKey)
      .order("display_order", { ascending: false })
      .limit(1)
      .single();
    const nextOrder = (existing?.display_order ?? 0) + 1;
    const { error } = await supabaseAdmin.from("sub_topics").insert({
      category_key:  data.categoryKey,
      sub_topic_key: subTopicKey,
      display_name:  data.displayName,
      display_order: nextOrder,
    });
    if (error) throw new Error(error.message);
    return { ok: true, subTopicKey };
  });

export const adminUpdateSubTopic = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string; id: string; displayName: string }) =>
    z
      .object({ password: z.string().min(1), id: z.string().uuid(), displayName: z.string().min(1) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    adminGuard(data.password);
    const { error } = await supabaseAdmin
      .from("sub_topics")
      .update({ display_name: data.displayName })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteSubTopic = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string; id: string }) =>
    z.object({ password: z.string().min(1), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    adminGuard(data.password);
    const { error } = await supabaseAdmin.from("sub_topics").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── ADMIN: export results as JSON ─────────────────────────────────────────────

export const adminExportResults = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string; groupId?: string }) =>
    z.object({ password: z.string().min(1), groupId: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    adminGuard(data.password);

    let studentsQ = supabaseAdmin
      .from("students")
      .select("id, unique_id, name, group_id, groups(name)");
    if (data.groupId) studentsQ = studentsQ.eq("group_id", data.groupId) as any;

    const { data: students } = await studentsQ.order("unique_id");

    const rows = await Promise.all(
      (students ?? []).map(async (s: any) => {
        const { data: session } = await supabaseAdmin
          .from("scan_sessions")
          .select("id, completed, started_at, completed_at, theme, music_used")
          .eq("student_id", s.id)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!session) return { uniqueId: s.unique_id, name: s.name, group: s.groups?.name };

        const { data: subTopics } = await supabaseAdmin
          .from("sub_topic_results")
          .select("sub_topic_key, selection_order, grade_ceiling, needed_g2_retry, completed")
          .eq("session_id", session.id);

        return {
          uniqueId: s.unique_id,
          name: s.name,
          group: s.groups?.name,
          theme: session.theme,
          musicUsed: session.music_used,
          completed: session.completed,
          startedAt: session.started_at,
          completedAt: session.completed_at,
          subTopics: subTopics ?? [],
        };
      }),
    );

    return { results: rows };
  });

// ── ADMIN: AI agent query ─────────────────────────────────────────────────────

export const adminAiQuery = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string; query: string }) =>
    z
      .object({ password: z.string().min(1), query: z.string().min(1).max(1000) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    adminGuard(data.password);

    // Gather context data
    const { data: groups } = await supabaseAdmin
      .from("groups")
      .select("id, name");

    const { data: sessions } = await supabaseAdmin
      .from("scan_sessions")
      .select("id, student_id, completed, started_at, completed_at, students(unique_id, name, group_id)")
      .order("started_at", { ascending: false })
      .limit(200);

    const { data: subTopicResults } = await supabaseAdmin
      .from("sub_topic_results")
      .select("session_id, sub_topic_key, grade_ceiling, completed, selection_order, needed_g2_retry")
      .limit(2000);

    const context = JSON.stringify({ groups, sessions, subTopicResults }, null, 2);

    const model = getModel();
    const { text } = await generateText({
      model,
      prompt: `You are an AI assistant for a maths skills discovery tool at Bradford College.
You help the admin (a maths teacher) understand data about their students.

Here is the current data:
${context}

The sub-topics are: Place Value, Addition, Subtraction, Multiplication, Division, Negative Numbers, Rounding & Estimation, Factors & Multiples, Prime Numbers, Prime Factors, Square & Cube Numbers, Indices, Ordering Numbers, Significant Figures, Standard Form, Problem Solving.

Grade ceilings: null = couldn't reach G1, 1 = G1, 2 = G2, 3 = G3, 4 = G4.

Answer this question in plain, friendly English. Be concise and helpful.
Question: ${data.query}`,
    });

    return { answer: text };
  });

// ── ADMIN: Question Bank ──────────────────────────────────────────────────────

export const adminGetQuestions = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string; subTopicKey?: string; grade?: number; categoryKey?: string }) =>
    z
      .object({
        password: z.string().min(1),
        subTopicKey: z.string().optional(),
        grade: z.number().int().min(1).max(4).optional(),
        categoryKey: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    adminGuard(data.password);

    let q = supabaseAdmin
      .from("questions")
      .select("id, category_key, sub_topic_key, grade, question_text, accepted_answers, image_search_term, custom_image_url")
      .order("category_key")
      .order("sub_topic_key")
      .order("grade");

    if (data.categoryKey)  q = q.eq("category_key", data.categoryKey) as any;
    if (data.subTopicKey)  q = q.eq("sub_topic_key", data.subTopicKey) as any;
    if (data.grade)        q = q.eq("grade", data.grade) as any;

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { questions: rows ?? [] };
  });

export const adminUpdateQuestion = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      password: string;
      id: string;
      questionText?: string;
      acceptedAnswers?: string[];
      imageSearchTerm?: string | null;
      customImageUrl?: string | null;
    }) =>
      z
        .object({
          password: z.string().min(1),
          id: z.string().uuid(),
          questionText: z.string().min(1).optional(),
          acceptedAnswers: z.array(z.string()).optional(),
          imageSearchTerm: z.string().nullable().optional(),
          customImageUrl: z.string().nullable().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data }) => {
    adminGuard(data.password);

    const update: Record<string, unknown> = {};
    if (data.questionText !== undefined)   update.question_text      = data.questionText;
    if (data.acceptedAnswers !== undefined) update.accepted_answers   = data.acceptedAnswers;
    if (data.imageSearchTerm !== undefined) update.image_search_term  = data.imageSearchTerm;
    if (data.customImageUrl !== undefined)  update.custom_image_url   = data.customImageUrl;

    const { error } = await supabaseAdmin
      .from("questions")
      .update(update as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteQuestion = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string; id: string }) =>
    z.object({ password: z.string().min(1), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    adminGuard(data.password);
    const { error } = await supabaseAdmin.from("questions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminAddQuestion = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      password: string;
      subTopicKey: string;
      grade: number;
      questionText: string;
      acceptedAnswers: string[];
      imageSearchTerm?: string | null;
      customImageUrl?: string | null;
    }) =>
      z
        .object({
          password: z.string().min(1),
          subTopicKey: z.string().min(1),
          grade: z.number().int().min(1).max(4),
          questionText: z.string().min(1),
          acceptedAnswers: z.array(z.string().min(1)).min(1),
          imageSearchTerm: z.string().nullable().optional(),
          customImageUrl: z.string().nullable().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data }) => {
    adminGuard(data.password);

    // Resolve category_key from sub_topics table (default 'number' if not found)
    const { data: stRow } = await supabaseAdmin
      .from("sub_topics")
      .select("category_key")
      .eq("sub_topic_key", data.subTopicKey)
      .limit(1)
      .maybeSingle();
    const categoryKey = stRow?.category_key ?? "number";

    const { data: row, error } = await supabaseAdmin
      .from("questions")
      .insert({
        category_key:      categoryKey,
        sub_topic_key:     data.subTopicKey,
        grade:             data.grade,
        question_text:     data.questionText,
        accepted_answers:  data.acceptedAnswers,
        image_search_term: data.imageSearchTerm ?? null,
        custom_image_url:  data.customImageUrl ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

// ── ADMIN: reset a student's session ─────────────────────────────────────────

export const adminResetSession = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string; studentId: string }) =>
    z.object({ password: z.string().min(1), studentId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    adminGuard(data.password);
    // Cascade deletes sub_topic_results and question_attempts automatically
    const { error } = await supabaseAdmin
      .from("scan_sessions")
      .delete()
      .eq("student_id", data.studentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── ADMIN: seed demo student ──────────────────────────────────────────────────

export const adminSeedDemoStudent = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string }) => z.object({ password: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    adminGuard(data.password);

    // 1. Upsert demo group
    const { data: group, error: gErr } = await supabaseAdmin
      .from("groups")
      .upsert({ name: "Demo Group" }, { onConflict: "name" })
      .select("id")
      .single();
    if (gErr) throw new Error(gErr.message);

    // 2. Upsert demo student
    const { data: student, error: sErr } = await supabaseAdmin
      .from("students")
      .upsert({ unique_id: "DEMO001", name: "Alex Demo", group_id: group.id }, { onConflict: "unique_id" })
      .select("id")
      .single();
    if (sErr) throw new Error(sErr.message);

    // 3. Wipe any existing session (cascade clears subtopics + attempts)
    await supabaseAdmin.from("scan_sessions").delete().eq("student_id", student.id);

    const now = new Date();
    const sessionStart = new Date(now.getTime() - 45 * 60 * 1000); // 45 min ago

    // 4. Create a completed session
    const { data: session, error: seErr } = await supabaseAdmin
      .from("scan_sessions")
      .insert({
        student_id:  student.id,
        theme:       "forecourt",
        music_used:  true,
        music_track: "lofi-1",
        completed:   true,
        started_at:  sessionStart.toISOString(),
        completed_at: now.toISOString(),
      })
      .select("id")
      .single();
    if (seErr) throw new Error(seErr.message);

    // 5. Sub-topic results — realistic mixed profile
    // selection_order: 1 = picked first (most confident), 16 = last (least confident)
    const subTopicPlan: Array<{
      key: string; order: number; ceiling: number | null; retry: boolean;
    }> = [
      { key: "multiplication",          order: 1,  ceiling: 4, retry: false },
      { key: "addition",                order: 2,  ceiling: 4, retry: false },
      { key: "place_value",             order: 3,  ceiling: 3, retry: false },
      { key: "subtraction",             order: 4,  ceiling: 3, retry: false },
      { key: "division",                order: 5,  ceiling: 3, retry: false },
      { key: "ordering_numbers",        order: 6,  ceiling: 3, retry: false },
      { key: "negative_numbers",        order: 7,  ceiling: 2, retry: true  },
      { key: "rounding_estimation",     order: 8,  ceiling: 2, retry: false },
      { key: "factors_multiples",       order: 9,  ceiling: 2, retry: true  },
      { key: "square_cube_numbers",     order: 10, ceiling: 2, retry: false },
      { key: "prime_numbers",           order: 11, ceiling: 1, retry: false },
      { key: "indices",                 order: 12, ceiling: 1, retry: false },
      { key: "standard_form",           order: 13, ceiling: 1, retry: false },
      { key: "significant_figures",     order: 14, ceiling: null, retry: false },
      { key: "prime_factor_decomposition", order: 15, ceiling: null, retry: false },
      { key: "problem_solving",         order: 16, ceiling: 1, retry: false },
    ];

    // Question attempt templates per grade ceiling
    // Each entry: { grade, attempt_number, is_correct, seconds_taken }
    type AttemptTemplate = { grade: number; attempt_number: number; is_correct: boolean; seconds: number };

    function attemptsFor(ceiling: number | null, retry: boolean): AttemptTemplate[] {
      if (ceiling === null) {
        // Failed to reach G1: two wrong G1 attempts
        return [
          { grade: 1, attempt_number: 1, is_correct: false, seconds: 42 },
          { grade: 1, attempt_number: 2, is_correct: false, seconds: 38 },
        ];
      }
      const result: AttemptTemplate[] = [];
      // Always start at G2; pass it (or fail+retry if needed)
      if (retry) {
        result.push({ grade: 2, attempt_number: 1, is_correct: false, seconds: 28 });
        result.push({ grade: 2, attempt_number: 2, is_correct: true, seconds: 35 });
      } else {
        result.push({ grade: 2, attempt_number: 1, is_correct: true, seconds: 22 });
      }
      if (ceiling >= 3) {
        result.push({ grade: 3, attempt_number: 1, is_correct: true, seconds: 31 });
      }
      if (ceiling === 4) {
        result.push({ grade: 4, attempt_number: 1, is_correct: true, seconds: 48 });
      }
      if (ceiling === 1) {
        // Reached G1 ceiling: failed G2, then passed G1
        result.length = 0;
        result.push({ grade: 2, attempt_number: 1, is_correct: false, seconds: 44 });
        result.push({ grade: 1, attempt_number: 1, is_correct: true,  seconds: 19 });
      }
      return result;
    }

    let offsetMinutes = 0;
    for (const st of subTopicPlan) {
      const { data: str, error: strErr } = await supabaseAdmin
        .from("sub_topic_results")
        .insert({
          session_id:      session.id,
          sub_topic_key:   st.key,
          selection_order: st.order,
          grade_ceiling:   st.ceiling,
          needed_g2_retry: st.retry,
          completed:       true,
          current_grade:   st.ceiling ?? 1,
        })
        .select("id")
        .single();
      if (strErr) throw new Error(strErr.message);

      const attempts = attemptsFor(st.ceiling, st.retry);
      for (const a of attempts) {
        offsetMinutes += 2;
        const ts = new Date(sessionStart.getTime() + offsetMinutes * 60 * 1000).toISOString();
        await supabaseAdmin.from("question_attempts").insert({
          session_id:         session.id,
          sub_topic_result_id: str.id,
          sub_topic_key:      st.key,
          grade:              a.grade,
          attempt_number:     a.attempt_number,
          is_correct:         a.is_correct,
          given_answer:       a.is_correct ? "seed" : "seed-wrong",
          seconds_taken:      a.seconds + (Math.random() * 6 - 3), // ±3s jitter
          created_at:         ts,
        });
      }
    }

    return { ok: true, studentId: student.id, uniqueId: "DEMO001" };
  });

// ── ADMIN: upload question image to Supabase Storage ─────────────────────────

export const adminUploadQuestionImage = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string; fileName: string; fileBase64: string; mimeType: string }) =>
    z
      .object({
        password:    z.string().min(1),
        fileName:    z.string().min(1),
        fileBase64:  z.string().min(1),
        mimeType:    z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    adminGuard(data.password);
    const buffer = Buffer.from(data.fileBase64, "base64");
    const uniqueName = `${Date.now()}-${data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error } = await supabaseAdmin.storage
      .from("question-images")
      .upload(uniqueName, buffer, { contentType: data.mimeType, upsert: false });
    if (error) throw new Error(error.message);
    const { data: urlData } = supabaseAdmin.storage
      .from("question-images")
      .getPublicUrl(uniqueName);
    return { publicUrl: urlData.publicUrl };
  });
