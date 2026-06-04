import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  startOrResumeSession,
  getCategories,
  startSubTopic,
  getCurrentQuestion,
  submitAnswer,
  updateSessionMeta,
  getSubTopics,
} from "@/lib/scan.functions";
import { NUMBER_SUB_TOPICS, checkAnswer, type Grade } from "@/lib/question-bank";
import { NumberPad } from "@/components/NumberPad";
import { RadioPlayer } from "@/components/RadioPlayer";
import {
  AccessibilityControls,
  buildBodyClasses,
  DEFAULT_ACCESSIBILITY,
  type AccessibilitySettings,
} from "@/components/AccessibilityControls";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    freeroam: search.freeroam === "true" || search.freeroam === "1",
  }),
  head: () => ({
    meta: [
      { title: "Skills Discovery — Maths" },
      { name: "description", content: "Bradford College Maths Skills Discovery" },
    ],
  }),
  component: SkillsDiscovery,
});

// ── Types ─────────────────────────────────────────────────────────────────────

type Theme  = "forecourt";
type Screen =
  | "landing"
  | "intro_modal"
  | "category_select"
  | "subtopic_select"
  | "question"
  | "freeroam_question"
  | "feedback"
  | "complete";

type Category = {
  category_key:  string;
  display_name:  string;
  is_active:     boolean;
  display_order: number;
};

type SubTopicState = {
  resultId:       string;
  key:            string;
  currentGrade:   number;
  attemptNumber:  number;
  question:       string;
  imageSearchTerm: string | null;
  customImageUrl:  string | null;
};

type FeedbackState = {
  isCorrect:    boolean;
  feedback:     string;
  nextAction:   { type: string; grade?: number; attemptNumber?: number; ceiling?: number | null };
  nextQuestion?: string | null;
  gradeCeiling?: number | null;
  subTopicDone: boolean;
  sessionComplete: boolean;
};

// ── Ceiling messages ──────────────────────────────────────────────────────────

function ceilingMessage(ceiling: number | null | undefined): string {
  if (ceiling === 4) return "Solid work on that one.";
  if (ceiling === 3) return "Good stuff. On to the next.";
  if (ceiling === 2) return "Noted. Let's move on.";
  return "On to the next one.";
}

const CORRECT_LABELS = ["Nice one.", "That's it.", "Good work."];

// ── Component ─────────────────────────────────────────────────────────────────

function SkillsDiscovery() {
  const { freeroam } = Route.useSearch();

  const startFn         = useServerFn(startOrResumeSession);
  const getCatsFn       = useServerFn(getCategories);
  const getSubTopicsFn  = useServerFn(getSubTopics);
  const startSubTopicFn = useServerFn(startSubTopic);
  const getCurrentQFn   = useServerFn(getCurrentQuestion);
  const submitFn        = useServerFn(submitAnswer);
  const updateMetaFn    = useServerFn(updateSessionMeta);

  // ── Core state ──────────────────────────────────────────────────────────────
  const [screen,       setScreen]       = useState<Screen>(freeroam ? "category_select" : "landing");
  const [theme]        = useState<Theme>("forecourt");

  // ── Freeroam state ───────────────────────────────────────────────────────────
  const [freeroamGrade, setFreeroamGrade] = useState<Grade>(2);
  const [freeroamResult, setFreeroamResult] = useState<{ correct: boolean; correctAnswer: string } | null>(null);
  const [accessibility, setAccessibility] = useState<AccessibilitySettings>(DEFAULT_ACCESSIBILITY);

  const [studentId, setStudentId] = useState("");
  const [error,     setError]     = useState<string | null>(null);
  const [loading,   setLoading]   = useState(false);

  const [sessionId,          setSessionId]          = useState<string | null>(null);
  const [categories,         setCategories]          = useState<Category[]>([]);
  const [selectedCategory,   setSelectedCategory]    = useState<string>("number");
  const [dbSubTopics,        setDbSubTopics]         = useState<{ sub_topic_key: string; display_name: string; display_order: number }[]>([]);
  const [completedSubTopics, setCompletedSubTopics]  = useState<string[]>([]);
  const [selectionCounter,   setSelectionCounter]    = useState(1);

  const [activeSubTopic, setActiveSubTopic] = useState<SubTopicState | null>(null);
  const [answer,         setAnswer]         = useState("");
  const [feedbackState,  setFeedbackState]  = useState<FeedbackState | null>(null);

  // ── Image state ──────────────────────────────────────────────────────────────
  const [imageUrl,    setImageUrl]    = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [showAttrib,  setShowAttrib]  = useState(false);

  // ── Fade transition ──────────────────────────────────────────────────────────
  const [fading,  setFading]  = useState(false);
  const fadingRef = useRef(false);

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const questionStartRef = useRef<number>(0);
  const sessionIdRef     = useRef<string | null>(null);
  const feedbackRef      = useRef<FeedbackState | null>(null);
  const activeSTRef      = useRef<SubTopicState | null>(null);

  useEffect(() => { sessionIdRef.current     = sessionId;    }, [sessionId]);
  useEffect(() => { feedbackRef.current      = feedbackState; }, [feedbackState]);
  useEffect(() => { activeSTRef.current      = activeSubTopic; }, [activeSubTopic]);

  // ── Apply body classes ────────────────────────────────────────────────────────
  useEffect(() => {
    document.body.className = buildBodyClasses(theme, accessibility);
  }, [theme, accessibility]);

  // ── Freeroam: load categories on mount ───────────────────────────────────────
  useEffect(() => {
    if (!freeroam) return;
    getCatsFn().then((res) => setCategories(res.categories as Category[]));
  }, []); // eslint-disable-line

  // ── Fade navigation ───────────────────────────────────────────────────────────
  const goTo = useCallback((next: Screen) => {
    if (fadingRef.current) return;
    fadingRef.current = true;
    setFading(true);
    setTimeout(() => {
      setScreen(next);
      setTimeout(() => {
        setFading(false);
        fadingRef.current = false;
      }, 40);
    }, 180);
  }, []);

  // ── Accessibility ─────────────────────────────────────────────────────────────
  function handleAccessibilityChange(s: AccessibilitySettings) {
    setAccessibility(s);
    if (sessionIdRef.current) {
      updateMetaFn({
        data: { sessionId: sessionIdRef.current, accessibilitySettings: s as any },
      }).catch(() => {});
    }
  }

  // ── Image: build URL when sub-topic changes ───────────────────────────────────
  useEffect(() => {
    if (!activeSubTopic) { setImageUrl(null); setImageLoaded(false); return; }
    const { customImageUrl, imageSearchTerm } = activeSubTopic;
    if (customImageUrl) {
      setImageUrl(customImageUrl);
      setShowAttrib(false);
      setImageLoaded(false);
    } else if (imageSearchTerm) {
      const enc = encodeURIComponent(imageSearchTerm);
      setImageUrl(`https://source.unsplash.com/featured/1600x900/?${enc}`);
      setShowAttrib(true);
      setImageLoaded(false);
    } else {
      setImageUrl(null);
      setImageLoaded(true);
      setShowAttrib(false);
    }
  }, [activeSubTopic?.key, activeSubTopic?.currentGrade]); // eslint-disable-line

  // ── Landing: start session ───────────────────────────────────────────────────
  async function handleStartSession(e: React.FormEvent) {
    e.preventDefault();
    if (!studentId.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const res = await startFn({ data: { studentId: studentId.trim(), theme } });
      if ("error" in res && res.error === "not_found") {
        setError("That code isn't recognised — check with your teacher.");
        return;
      }
      if ("error" in res) {
        setError("Something went wrong. Please try again.");
        return;
      }

      setSessionId(res.sessionId);
      setCompletedSubTopics(res.completedSubTopics ?? []);
      setSelectionCounter((res.completedSubTopics?.length ?? 0) + 1);

      const catRes = await getCatsFn();
      setCategories(catRes.categories as Category[]);

      if (res.resumed) {
        if (res.inProgressSubTopic) {
          const q = await getCurrentQFn({
            data: { subTopicResultId: res.inProgressSubTopic.id },
          });
          setActiveSubTopic({
            resultId:        res.inProgressSubTopic.id,
            key:             res.inProgressSubTopic.key,
            currentGrade:    q.grade,
            attemptNumber:   q.attemptNumber,
            question:        q.question,
            imageSearchTerm: (q as any).imageSearchTerm ?? null,
            customImageUrl:  (q as any).customImageUrl ?? null,
          });
          questionStartRef.current = Date.now();
          setAnswer("");
          goTo("question");
        } else {
          goTo("subtopic_select");
        }
      } else {
        if ("isFirstSession" in res && res.isFirstSession) {
          const shown = localStorage.getItem("sd_intro_shown");
          if (!shown) { goTo("intro_modal"); return; }
        }
        goTo("category_select");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function dismissIntro() {
    localStorage.setItem("sd_intro_shown", "1");
    goTo("category_select");
  }

  async function selectCategory(key: string) {
    setSelectedCategory(key);
    try {
      const res = await getSubTopicsFn({ data: { categoryKey: key } });
      setDbSubTopics(res.subTopics);
    } catch {
      // Fallback: NUMBER_SUB_TOPICS used in the render below
      setDbSubTopics([]);
    }
    goTo("subtopic_select");
  }

  async function selectSubTopic(subTopicKey: string) {
    if (!sessionId) return;
    if (completedSubTopics.includes(subTopicKey)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await startSubTopicFn({
        data: { sessionId, subTopicKey, selectionOrder: selectionCounter },
      });
      setActiveSubTopic({
        resultId:        res.subTopicResultId,
        key:             subTopicKey,
        currentGrade:    res.grade,
        attemptNumber:   res.attemptNumber,
        question:        res.question,
        imageSearchTerm: (res as any).imageSearchTerm ?? null,
        customImageUrl:  (res as any).customImageUrl ?? null,
      });
      questionStartRef.current = Date.now();
      setAnswer("");
      setFeedbackState(null);
      goTo("question");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start sub-topic");
    } finally {
      setLoading(false);
    }
  }

  // ── Freeroam helpers ──────────────────────────────────────────────────────────
  function selectSubTopicFreeroam(key: string) {
    const stDef = NUMBER_SUB_TOPICS.find((s) => s.key === key);
    if (!stDef) return;
    setActiveSubTopic({
      resultId:        "freeroam",
      key,
      currentGrade:    freeroamGrade,
      attemptNumber:   1,
      question:        stDef.questions[freeroamGrade].prompt,
      imageSearchTerm: null,
      customImageUrl:  null,
    });
    setFreeroamResult(null);
    setAnswer("");
    goTo("freeroam_question");
  }

  function changeFreeroamGrade(grade: Grade) {
    setFreeroamGrade(grade);
    if (!activeSubTopic) return;
    const stDef = NUMBER_SUB_TOPICS.find((s) => s.key === activeSubTopic.key);
    if (!stDef) return;
    setActiveSubTopic({ ...activeSubTopic, currentGrade: grade, question: stDef.questions[grade].prompt });
    setFreeroamResult(null);
    setAnswer("");
  }

  function handleFreeroamSubmit() {
    if (!activeSubTopic || !answer.trim()) return;
    const stDef = NUMBER_SUB_TOPICS.find((s) => s.key === activeSubTopic.key);
    if (!stDef) return;
    const entry = stDef.questions[freeroamGrade];
    const correct = checkAnswer(answer, entry);
    setFreeroamResult({ correct, correctAnswer: entry.answers[0] });
  }

  async function handleSubmitAnswer() {
    if (!sessionId || !activeSubTopic || !answer.trim()) return;
    setLoading(true);
    const secondsTaken = (Date.now() - questionStartRef.current) / 1000;
    try {
      const res = await submitFn({
        data: {
          sessionId,
          subTopicResultId: activeSubTopic.resultId,
          answer: answer.trim(),
          secondsTaken,
        },
      });
      setFeedbackState(res as FeedbackState);
      if ((res as FeedbackState).subTopicDone) {
        const newCompleted = [...completedSubTopics, activeSubTopic.key];
        setCompletedSubTopics(newCompleted);
        setSelectionCounter(newCompleted.length + 1);
      }
      goTo("feedback");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit answer");
      setLoading(false);
    } finally {
      setLoading(false);
    }
  }

  // ── After feedback: advance ───────────────────────────────────────────────────
  function advanceFromFeedback() {
    const fb = feedbackRef.current;
    const st = activeSTRef.current;
    if (!fb) return;

    if (fb.sessionComplete) { goTo("complete"); return; }

    if (fb.subTopicDone) {
      setActiveSubTopic(null);
      setFeedbackState(null);
      setAnswer("");
      goTo("subtopic_select");
      return;
    }

    const next = fb.nextAction;
    let nextGrade   = st?.currentGrade ?? 2;
    let nextAttempt = 1;

    if (next.type === "retry")       { nextGrade = next.grade ?? nextGrade; nextAttempt = 2; }
    else if (next.type === "next_grade")  { nextGrade = next.grade ?? nextGrade; }
    else if (next.type === "fallback_g1") { nextGrade = 1; }

    setActiveSubTopic(
      st
        ? {
            ...st,
            currentGrade:  nextGrade,
            attemptNumber: nextAttempt,
            question:      fb.nextQuestion ?? st.question,
          }
        : null,
    );
    questionStartRef.current = Date.now();
    setAnswer("");
    setFeedbackState(null);
    goTo("question");
  }

  // ── Auto-advance all feedback screens ────────────────────────────────────────
  useEffect(() => {
    if (!feedbackState) return;
    const delay = feedbackState.nextAction.type === "retry" ? 800 : 1800;
    const t = setTimeout(advanceFromFeedback, delay);
    return () => clearTimeout(t);
  }, [feedbackState]); // eslint-disable-line

  // ── Music ─────────────────────────────────────────────────────────────────────
  function handleMusicChange(playing: boolean, trackId: string) {
    if (!sessionIdRef.current) return;
    updateMetaFn({
      data: { sessionId: sessionIdRef.current, musicUsed: playing, musicTrack: trackId },
    }).catch(() => {});
  }

  // ── Derived feedback display text ─────────────────────────────────────────────
  const feedbackMainText = (() => {
    if (!feedbackState) return "";
    if (feedbackState.nextAction.type === "retry") return "Have another go.";
    if (feedbackState.isCorrect) return feedbackState.feedback;
    if (feedbackState.subTopicDone) return ceilingMessage(feedbackState.gradeCeiling);
    return feedbackState.feedback;
  })();

  const feedbackSubText =
    feedbackState?.isCorrect && feedbackState.subTopicDone
      ? ceilingMessage(feedbackState.gradeCeiling)
      : null;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        background: "var(--bg-primary)",
        color:      "var(--text-primary)",
        minHeight:  "100vh",
        fontFamily: "var(--font-body)",
      }}
    >
      {/* Accessibility panel — hidden on landing */}
      {screen !== "landing" && (
        <AccessibilityControls settings={accessibility} onUpdate={handleAccessibilityChange} />
      )}

      {/* Fade wrapper */}
      <div
        className="sd-fade"
        style={{ opacity: fading ? 0 : 1, minHeight: "100vh" }}
      >
        {/* ── LANDING ───────────────────────────────────────────────────────── */}
        {screen === "landing" && (
          <div
            style={{
              minHeight:          "100vh",
              display:            "flex",
              flexDirection:      "column",
              alignItems:         "center",
              justifyContent:     "center",
              padding:            "48px 24px",
              backgroundImage:    "url('/bg-landing.jpg')",
              backgroundSize:     "cover",
              backgroundPosition: "center",
              position:           "relative",
            }}
          >
            {/* Dark scrim */}
            <div
              style={{
                position:   "absolute",
                inset:      0,
                background: "rgba(0,0,0,0.60)",
                zIndex:     0,
              }}
            />

            {/* Content sits above scrim */}
            <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
              {/* App name */}
              <div style={{ textAlign: "center", marginBottom: 56 }}>
                <h1
                  style={{
                    fontFamily: "'Permanent Marker', cursive",
                    fontSize:   56,
                    fontWeight: 400,
                    color:      "#FFFFFF",
                    margin:     0,
                    lineHeight: 1.1,
                    textShadow: "2px 4px 12px rgba(0,0,0,0.7)",
                  }}
                >
                  Maths Skills Discovery
                </h1>
              </div>

              {/* Enter the Garage CTA */}
              <div
                style={{
                  marginBottom:   48,
                  padding:        "28px 48px",
                  borderRadius:   12,
                  border:         "3px solid #FFE600",
                  background:     "rgba(0,0,0,0.55)",
                  textAlign:      "center",
                  maxWidth:       360,
                  width:          "100%",
                }}
              >
                <p
                  style={{
                    fontFamily: "'Permanent Marker', cursive",
                    fontSize:   28,
                    color:      "#FFE600",
                    margin:     "0 0 4px",
                    textShadow: "1px 2px 8px rgba(0,0,0,0.6)",
                  }}
                >
                  Enter the Garage
                </p>
                <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "rgba(255,255,255,0.55)", margin: 0 }}>
                  Enter your code below to begin
                </p>
              </div>

              {/* ID input */}
              <form onSubmit={handleStartSession} style={{ width: "100%", maxWidth: 280, display: "flex", flexDirection: "column", gap: 16 }}>
              <input
                type="text"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="Enter your code"
                autoFocus
                autoComplete="off"
                style={{
                  width:          "100%",
                  background:     "rgba(0,0,0,0.4)",
                  border:         "1px solid rgba(255,255,255,0.3)",
                  borderRadius:   8,
                  padding:        "12px 16px",
                  fontFamily:     "var(--font-body)",
                  fontSize:       18,
                  color:          "#FFFFFF",
                  letterSpacing:  "0.15em",
                  outline:        "none",
                  textAlign:      "center",
                  boxSizing:      "border-box",
                }}
              />

              {error && (
                <p style={{ fontSize: 14, color: "#ef4444", textAlign: "center", margin: 0 }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !studentId.trim()}
                style={{
                  width:          "100%",
                  height:         52,
                  minHeight:      52,
                  borderRadius:   8,
                  border:         "2px solid #FFE600",
                  background:     loading || !studentId.trim() ? "rgba(255,230,0,0.15)" : "#FFE600",
                  color:          loading || !studentId.trim() ? "#FFE600" : "#0E0E10",
                  fontFamily:     "'Permanent Marker', cursive",
                  fontWeight:     400,
                  fontSize:       18,
                  cursor:         loading || !studentId.trim() ? "not-allowed" : "pointer",
                  opacity:        loading || !studentId.trim() ? 0.6 : 1,
                  transition:     "background 150ms, color 150ms",
                }}
                onMouseEnter={(e) => {
                  if (!loading && studentId.trim())
                    (e.currentTarget as HTMLElement).style.background = "#FFF176";
                }}
                onMouseLeave={(e) => {
                  if (!loading && studentId.trim())
                    (e.currentTarget as HTMLElement).style.background = "#FFE600";
                }}
                onMouseDown={(e) => {
                  if (!loading && studentId.trim())
                    (e.currentTarget as HTMLElement).style.transform = "scale(0.97)";
                }}
                onMouseUp={(e) => {
                  (e.currentTarget as HTMLElement).style.transform = "scale(1)";
                }}
              >
                {loading ? "Checking…" : "Begin"}
              </button>
            </form>

              <p style={{ marginTop: 40, fontSize: 12, color: "rgba(255,255,255,0.3)", display: "flex", gap: 16, justifyContent: "center" }}>
                <Link to="/admin" style={{ color: "rgba(255,255,255,0.3)", textDecoration: "none" }}>
                  Admin
                </Link>
                <span style={{ color: "rgba(255,255,255,0.2)" }}>·</span>
                <a href="/?freeroam=true" style={{ color: "rgba(255,255,255,0.3)", textDecoration: "none" }}>
                  Demo
                </a>
              </p>
            </div>{/* end content wrapper */}
          </div>
        )}

        {/* ── INTRO MODAL ───────────────────────────────────────────────────── */}
        {screen === "intro_modal" && (
          <div
            style={{
              position:       "fixed",
              inset:          0,
              background:     "var(--overlay)",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              padding:        24,
              zIndex:         20,
            }}
          >
            <div style={{ maxWidth: 560, width: "100%", textAlign: "center" }}>
              <h2
                style={{
                  fontFamily:   "var(--font-heading)",
                  fontSize:     28,
                  fontWeight:   600,
                  color:        "var(--text-primary)",
                  marginBottom: 24,
                }}
              >
                This isn't a test.
              </h2>
              <p
                style={{
                  fontFamily:   "var(--font-body)",
                  fontSize:     18,
                  color:        "var(--text-secondary)",
                  lineHeight:   1.7,
                  marginBottom: 40,
                }}
              >
                Have a go at some questions from each topic. Start with the ones you feel most
                confident about. We're just working out what to spend time on this year.
              </p>
              <button
                onClick={dismissIntro}
                style={{
                  border:       "none",
                  borderRadius: 8,
                  height:       52,
                  minHeight:    52,
                  padding:      "0 48px",
                  background:   "var(--sd-accent)",
                  color:        "var(--bg-primary)",
                  fontFamily:   "var(--font-heading)",
                  fontWeight:   500,
                  fontSize:     18,
                  cursor:       "pointer",
                  transition:   "background 150ms",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "var(--sd-accent-hover)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "var(--sd-accent)";
                }}
              >
                Got it
              </button>
            </div>
          </div>
        )}

        {/* ── CATEGORY SELECT ───────────────────────────────────────────────── */}
        {screen === "category_select" && (
          <div style={{ minHeight: "100vh", paddingTop: freeroam ? 44 : 80, backgroundImage: "url('https://source.unsplash.com/featured/1920x1080/?engineering,workshop,garage,youth')", backgroundSize: "cover", backgroundPosition: "center", position: "relative" }}>
            {freeroam && (
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, background: "#00D4FF", color: "#0E0E10", padding: "8px 24px", fontFamily: "'Permanent Marker', cursive", fontSize: 14, zIndex: 2 }}>
                ADMIN FREEROAM — no data saved
              </div>
            )}
            {/* scrim */}
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 0 }} />
            <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{ padding: "0 10vw", marginBottom: 48 }}>
                <h2
                  style={{
                    fontFamily:   "var(--font-heading)",
                    fontSize:     36,
                    fontWeight:   600,
                    color:        "var(--text-primary)",
                    marginBottom: 8,
                  }}
                >
                  Choose a topic
                </h2>
                <p style={{ fontFamily: "var(--font-body)", fontSize: 18, color: "var(--text-secondary)", margin: 0 }}>
                  Start with the one you feel most confident about.
                </p>
              </div>

              <div>
                {categories.map((cat, idx) => (
                  <CategoryRow
                    key={cat.category_key}
                    label={cat.display_name}
                    active={freeroam ? true : cat.is_active}
                    index={idx}
                    onClick={() => selectCategory(cat.category_key)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SUB-TOPIC SELECT ──────────────────────────────────────────────── */}
        {screen === "subtopic_select" && (
          <div style={{ minHeight: "100vh", paddingTop: 80, backgroundImage: "url('https://source.unsplash.com/featured/1920x1080/?vocational,training,bradford,uk,mechanics')", backgroundSize: "cover", backgroundPosition: "center", position: "relative" }}>
            {/* scrim */}
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 0 }} />
            <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{ padding: "0 10vw", marginBottom: 48 }}>
                <h2
                  style={{
                    fontFamily:   "var(--font-heading)",
                    fontSize:     36,
                    fontWeight:   600,
                    color:        "var(--text-primary)",
                    marginBottom: 8,
                  }}
                >
                  {categories.find((c) => c.category_key === selectedCategory)?.display_name ?? "Number"}
                </h2>
                {(() => {
                  const subTopicsToShow = dbSubTopics.length > 0
                    ? dbSubTopics
                    : NUMBER_SUB_TOPICS.map((s) => ({ sub_topic_key: s.key, display_name: s.displayName, display_order: 0 }));
                  const pct = subTopicsToShow.length > 0
                    ? Math.round((completedSubTopics.length / subTopicsToShow.length) * 100)
                    : 0;
                  return (
                    <>
                      <p style={{ fontFamily: "var(--font-body)", fontSize: 16, color: "var(--text-secondary)", margin: "0 0 10px" }}>
                        {completedSubTopics.length} of {subTopicsToShow.length} done
                      </p>
                      <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.15)", overflow: "hidden", maxWidth: 240 }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: "#00D4FF", borderRadius: 3, transition: "width 400ms ease" }} />
                      </div>
                    </>
                  );
                })()}
              </div>

              {error && (
                <p style={{ padding: "0 10vw", fontSize: 14, color: "#ef4444", marginBottom: 12 }}>
                  {error}
                </p>
              )}

              <div>
                {(() => {
                  const subTopicsToShow = dbSubTopics.length > 0
                    ? dbSubTopics
                    : NUMBER_SUB_TOPICS.map((s) => ({ sub_topic_key: s.key, display_name: s.displayName, display_order: 0 }));
                  return subTopicsToShow.map((st, idx) => {
                    const done = freeroam ? false : completedSubTopics.includes(st.sub_topic_key);
                    return (
                      <SubTopicRow
                        key={st.sub_topic_key}
                        label={st.display_name}
                        done={done}
                        loading={loading}
                        index={idx}
                        onClick={() => freeroam
                          ? selectSubTopicFreeroam(st.sub_topic_key)
                          : (!done && !loading && selectSubTopic(st.sub_topic_key))
                        }
                      />
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        )}

        {/* ── QUESTION ──────────────────────────────────────────────────────── */}
        {screen === "question" && activeSubTopic && (
          <div
            style={{
              display:        "flex",
              flexDirection:  "row",
              height:         "100vh",
              width:          "100vw",
              overflow:       "hidden",
            }}
          >
            {/* Left: image panel */}
            <div
              style={{
                position: "relative",
                width:    "50%",
                height:   "100%",
                flexShrink: 0,
                background: "var(--bg-elevated)",
              }}
            >
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt=""
                  onLoad={() => setImageLoaded(true)}
                  onError={() => { setImageUrl(null); setImageLoaded(true); }}
                  style={{
                    position:   "absolute",
                    inset:      0,
                    width:      "100%",
                    height:     "100%",
                    objectFit:  "cover",
                    opacity:    imageLoaded ? 1 : 0,
                    transition: "opacity 400ms ease",
                  }}
                />
              )}

              {/* Gradient bleed */}
              <div
                style={{
                  position:   "absolute",
                  inset:      0,
                  background: "linear-gradient(to right, transparent 70%, var(--bg-primary) 100%)",
                  zIndex:     1,
                }}
              />

              {/* Sub-topic label */}
              <div
                style={{
                  position:   "absolute",
                  bottom:     32,
                  left:       32,
                  zIndex:     2,
                  fontFamily: "var(--font-heading)",
                  fontWeight: 500,
                  fontSize:   16,
                  color:      "rgba(255,255,255,0.7)",
                  textShadow: "0 1px 4px rgba(0,0,0,0.5)",
                }}
              >
                {NUMBER_SUB_TOPICS.find((st) => st.key === activeSubTopic.key)?.displayName ??
                  activeSubTopic.key.replace(/_/g, " ")}
              </div>

              {/* Unsplash attribution */}
              {showAttrib && imageUrl && (
                <div
                  style={{
                    position:   "absolute",
                    bottom:     8,
                    right:      8,
                    zIndex:     2,
                    fontSize:   11,
                    color:      "rgba(255,255,255,0.35)",
                    fontFamily: "var(--font-body)",
                  }}
                >
                  Photo: Unsplash
                </div>
              )}
            </div>

            {/* Right: question + numpad */}
            <div
              style={{
                flex:           1,
                height:         "100%",
                background:     "var(--bg-primary)",
                padding:        "64px 8vw 120px 6vw",
                display:        "flex",
                flexDirection:  "column",
                justifyContent: "center",
                overflowY:      "auto",
                boxSizing:      "border-box",
              }}
            >
              <p
                style={{
                  fontFamily:   "var(--font-heading)",
                  fontWeight:   500,
                  fontSize:     28,
                  color:        "var(--text-primary)",
                  lineHeight:   1.5,
                  marginBottom: 48,
                  maxWidth:     520,
                }}
              >
                {activeSubTopic.question}
              </p>

              <NumberPad
                value={answer}
                onChange={setAnswer}
                onSubmit={handleSubmitAnswer}
                disabled={loading}
              />

              {error && (
                <p style={{ fontSize: 14, color: "#ef4444", marginTop: 12 }}>{error}</p>
              )}
            </div>
          </div>
        )}

        {/* ── FREEROAM QUESTION ─────────────────────────────────────────────── */}
        {screen === "freeroam_question" && activeSubTopic && (
          <div
            style={{
              minHeight:      "100vh",
              display:        "flex",
              flexDirection:  "column",
              background:     "var(--bg-primary)",
              padding:        "0 0 80px",
            }}
          >
            {/* Admin banner */}
            <div
              style={{
                background:  "#00D4FF",
                color:       "#0E0E10",
                padding:     "8px 24px",
                display:     "flex",
                alignItems:  "center",
                justifyContent: "space-between",
                gap:         12,
                flexShrink:  0,
              }}
            >
              <span style={{ fontFamily: "'Permanent Marker', cursive", fontSize: 14 }}>
                ADMIN FREEROAM — no data saved
              </span>
              <button
                onClick={() => goTo("subtopic_select")}
                style={{
                  fontFamily:   "var(--font-body)",
                  fontSize:     13,
                  background:   "rgba(0,0,0,0.15)",
                  border:       "none",
                  borderRadius: 6,
                  padding:      "4px 12px",
                  cursor:       "pointer",
                  color:        "#0E0E10",
                  minHeight:    "unset",
                }}
              >
                ← Back to topics
              </button>
            </div>

            <div
              style={{
                flex:           1,
                display:        "flex",
                flexDirection:  "column",
                justifyContent: "center",
                padding:        "40px 8vw",
                maxWidth:       680,
                width:          "100%",
                margin:         "0 auto",
              }}
            >
              {/* Sub-topic label */}
              <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>
                {NUMBER_SUB_TOPICS.find((s) => s.key === activeSubTopic.key)?.displayName}
              </p>

              {/* Grade selector */}
              <div style={{ display: "flex", gap: 8, marginBottom: 32 }}>
                {([1, 2, 3, 4] as Grade[]).map((g) => (
                  <button
                    key={g}
                    onClick={() => changeFreeroamGrade(g)}
                    style={{
                      height:       36,
                      minHeight:    36,
                      padding:      "0 16px",
                      borderRadius: 6,
                      border:       freeroamGrade === g ? "2px solid #00D4FF" : "2px solid var(--sd-border)",
                      background:   freeroamGrade === g ? "#00D4FF" : "transparent",
                      color:        freeroamGrade === g ? "#0E0E10" : "var(--text-secondary)",
                      fontFamily:   "'Permanent Marker', cursive",
                      fontSize:     14,
                      cursor:       "pointer",
                      transition:   "all 120ms",
                    }}
                  >
                    G{g}
                  </button>
                ))}
              </div>

              {/* Question */}
              <p
                style={{
                  fontFamily:   "var(--font-heading)",
                  fontSize:     28,
                  fontWeight:   400,
                  color:        "var(--text-primary)",
                  lineHeight:   1.5,
                  marginBottom: 32,
                }}
              >
                {activeSubTopic.question}
              </p>

              {/* Feedback or numpad */}
              {freeroamResult ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div
                    style={{
                      padding:      "20px 24px",
                      borderRadius: 10,
                      border:       `2px solid ${freeroamResult.correct ? "#4ADE80" : "#FF6B35"}`,
                      background:   freeroamResult.correct ? "rgba(74,222,128,0.08)" : "rgba(255,107,53,0.08)",
                    }}
                  >
                    <p
                      style={{
                        fontFamily: "'Permanent Marker', cursive",
                        fontSize:   22,
                        color:      freeroamResult.correct ? "#4ADE80" : "#FF6B35",
                        margin:     "0 0 6px",
                      }}
                    >
                      {freeroamResult.correct ? "Correct!" : "Not quite"}
                    </p>
                    {!freeroamResult.correct && (
                      <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
                        Expected: <strong style={{ color: "var(--text-primary)" }}>{freeroamResult.correctAnswer}</strong>
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => { setFreeroamResult(null); setAnswer(""); }}
                    style={{
                      alignSelf:    "flex-start",
                      height:       40,
                      minHeight:    40,
                      padding:      "0 20px",
                      borderRadius: 8,
                      border:       "1px solid var(--sd-border)",
                      background:   "transparent",
                      color:        "var(--text-secondary)",
                      fontFamily:   "var(--font-body)",
                      fontSize:     14,
                      cursor:       "pointer",
                    }}
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <NumberPad
                  value={answer}
                  onChange={setAnswer}
                  onSubmit={handleFreeroamSubmit}
                  disabled={false}
                />
              )}
            </div>
          </div>
        )}

        {/* ── FEEDBACK ──────────────────────────────────────────────────────── */}
        {screen === "feedback" && feedbackState && (
          <div
            style={{
              minHeight:      "100vh",
              display:        "flex",
              flexDirection:  "column",
              alignItems:     "center",
              justifyContent: "center",
              padding:        48,
            }}
          >
            <p
              style={{
                fontFamily:   "var(--font-heading)",
                fontWeight:   feedbackState.nextAction.type === "retry" ? 500 : 600,
                fontSize:     feedbackState.nextAction.type === "retry" ? 36 : 48,
                color:        "var(--text-primary)",
                textAlign:    "center",
                margin:       0,
              }}
            >
              {feedbackMainText}
            </p>

            {feedbackSubText && (
              <FeedbackSubText text={feedbackSubText} />
            )}
          </div>
        )}

        {/* ── COMPLETE ──────────────────────────────────────────────────────── */}
        {screen === "complete" && (
          <div
            style={{
              minHeight:      "100vh",
              display:        "flex",
              flexDirection:  "column",
              alignItems:     "center",
              justifyContent: "center",
              padding:        48,
              textAlign:      "center",
            }}
          >
            <h2
              style={{
                fontFamily:   "var(--font-heading)",
                fontWeight:   600,
                fontSize:     56,
                color:        "var(--text-primary)",
                marginBottom: 24,
              }}
            >
              That's it.
            </h2>
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize:   18,
                color:      "var(--text-secondary)",
                maxWidth:   480,
                lineHeight: 1.7,
                marginBottom: 48,
              }}
            >
              You've finished the Skills Discovery. Your results will help plan your lessons for
              the year.
            </p>
            <SubmitButton />
          </div>
        )}
      </div>

      {/* Radio player — shown on all screens except landing */}
      {screen !== "landing" && (
        <RadioPlayer onPlayStateChange={handleMusicChange} />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

const GRAFFITI_COLOURS = ["#FF6B35","#FFE600","#00D4FF","#FF1493","#39FF14","#BF5FFF"];

function CategoryRow({
  label,
  active,
  index,
  onClick,
}: {
  label: string;
  active: boolean;
  index: number;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const accent = GRAFFITI_COLOURS[index % GRAFFITI_COLOURS.length];

  return (
    <button
      onClick={active ? onClick : undefined}
      onMouseEnter={() => active && setHover(true)}
      onMouseLeave={() => setHover(false)}
      disabled={!active}
      style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        width:          "100%",
        minHeight:      88,
        padding:        "10px 10vw",
        background:     hover ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.35)",
        border:         "none",
        borderLeft:     `5px solid ${accent}`,
        borderBottom:   "1px solid rgba(255,255,255,0.07)",
        textAlign:      "left",
        cursor:         active ? "pointer" : "default",
        transition:     "background 120ms",
      }}
    >
      <span
        style={{
          fontFamily:  "var(--font-heading)",
          fontWeight:  active ? 500 : 400,
          fontSize:    "clamp(15px, 2.2vw, 22px)",
          lineHeight:  1.3,
          whiteSpace:  "normal",
          color:       active ? "var(--text-primary)" : "var(--text-muted)",
        }}
      >
        {label}
      </span>
      {!active && (
        <span style={{ fontSize: 13, color: "var(--text-muted)", fontFamily: "var(--font-body)", flexShrink: 0 }}>
          Soon
        </span>
      )}
    </button>
  );
}

function SubTopicRow({
  label,
  done,
  loading,
  index,
  onClick,
}: {
  label:   string;
  done:    boolean;
  loading: boolean;
  index:   number;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const accent = GRAFFITI_COLOURS[index % GRAFFITI_COLOURS.length];

  return (
    <button
      onClick={!done && !loading ? onClick : undefined}
      onMouseEnter={() => !done && setHover(true)}
      onMouseLeave={() => setHover(false)}
      disabled={done || loading}
      style={{
        display:        "flex",
        alignItems:     "center",
        width:          "100%",
        minHeight:      88,
        padding:        "10px 10vw",
        background:     hover ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.35)",
        border:         "none",
        borderLeft:     done ? "5px solid rgba(255,255,255,0.15)" : `5px solid ${accent}`,
        borderBottom:   "1px solid rgba(255,255,255,0.07)",
        textAlign:      "left",
        cursor:         done || loading ? "default" : "pointer",
        transition:     "background 120ms",
        gap:            12,
      }}
    >
      {/* Completion dot */}
      {done ? (
        <span
          style={{
            width:        4,
            height:       4,
            minHeight:    4,
            borderRadius: "50%",
            background:   "var(--feedback-success)",
            flexShrink:   0,
            display:      "block",
          }}
        />
      ) : (
        <span style={{ width: 4, flexShrink: 0 }} />
      )}

      <span
        style={{
          fontFamily:  "var(--font-heading)",
          fontWeight:  done ? 400 : 500,
          fontSize:    "clamp(15px, 2.2vw, 22px)",
          lineHeight:  1.3,
          whiteSpace:  "normal",
          color:       done ? "var(--text-muted)" : "var(--text-primary)",
        }}
      >
        {label}
      </span>
    </button>
  );
}

function FeedbackSubText({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <p
      style={{
        fontFamily:  "var(--font-body)",
        fontSize:    18,
        color:       "var(--text-secondary)",
        marginTop:   16,
        opacity:     visible ? 1 : 0,
        transition:  "opacity 200ms ease",
      }}
    >
      {text}
    </p>
  );
}

function SubmitButton() {
  const [done, setDone] = useState(false);
  return done ? (
    <p style={{ fontFamily: "var(--font-body)", fontSize: 18, color: "var(--text-secondary)" }}>
      Thank you.
    </p>
  ) : (
    <button
      onClick={() => setDone(true)}
      style={{
        width:        280,
        height:       52,
        minHeight:    52,
        borderRadius: 8,
        border:       "none",
        background:   "var(--sd-accent)",
        color:        "var(--bg-primary)",
        fontFamily:   "var(--font-heading)",
        fontWeight:   500,
        fontSize:     18,
        cursor:       "pointer",
        transition:   "background 150ms",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = "var(--sd-accent-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "var(--sd-accent)";
      }}
      onMouseDown={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "scale(0.97)";
      }}
      onMouseUp={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "scale(1)";
      }}
    >
      Submit
    </button>
  );
}
