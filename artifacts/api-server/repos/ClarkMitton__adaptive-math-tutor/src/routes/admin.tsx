import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import React, { useState } from "react";
import {
  adminLogin,
  adminUploadStudents,
  adminGetGroups,
  adminGetGroupDetail,
  adminGetStudentDetail,
  adminGetCategories,
  adminToggleCategory,
  adminAiQuery,
  adminExportResults,
  adminGetQuestions,
  adminUpdateQuestion,
  adminDeleteQuestion,
  adminAddQuestion,
  adminResetSession,
  adminSeedDemoStudent,
  adminUpdateCategoryName,
  adminUploadQuestionImage,
  adminGetSubTopics,
  adminAddSubTopic,
  adminUpdateSubTopic,
  adminDeleteSubTopic,
} from "@/lib/scan.functions";
import { NUMBER_SUB_TOPICS } from "@/lib/question-bank";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — Skills Discovery" }] }),
  component: AdminPage,
});

// ── Types ─────────────────────────────────────────────────────────────────────

type GroupSummary = {
  id: string;
  name: string;
  totalStudents: number;
  completedCount: number;
  startedCount: number;
};

type StudentSummary = {
  id: string;
  uniqueId: string;
  name: string;
  status: "complete" | "in_progress" | "not_started";
  startedAt: string | null;
  completedAt: string | null;
  subTopicSummary: Record<string, number | null>;
};

type Category = {
  id: string;
  category_key: string;
  display_name: string;
  is_active: boolean;
  display_order: number;
};

type AdminTab = "groups" | "categories" | "subtopics" | "questions" | "ai";

type SubTopicRow = {
  id: string;
  category_key: string;
  sub_topic_key: string;
  display_name: string;
  display_order: number;
};

type QuestionRow = {
  id:                string;
  category_key:      string;
  sub_topic_key:     string;
  grade:             number;
  question_text:     string;
  accepted_answers:  string[];
  image_search_term: string | null;
  custom_image_url:  string | null;
};

// ── Component ─────────────────────────────────────────────────────────────────

function AdminPage() {
  const loginFn = useServerFn(adminLogin);
  const uploadFn = useServerFn(adminUploadStudents);
  const getGroupsFn = useServerFn(adminGetGroups);
  const getGroupDetailFn = useServerFn(adminGetGroupDetail);
  const getStudentDetailFn = useServerFn(adminGetStudentDetail);
  const getCatsFn = useServerFn(adminGetCategories);
  const toggleCatFn = useServerFn(adminToggleCategory);
  const aiQueryFn = useServerFn(adminAiQuery);
  const exportFn      = useServerFn(adminExportResults);
  const getQsFn       = useServerFn(adminGetQuestions);
  const updateQFn     = useServerFn(adminUpdateQuestion);
  const deleteQFn     = useServerFn(adminDeleteQuestion);
  const addQFn        = useServerFn(adminAddQuestion);
  const resetFn           = useServerFn(adminResetSession);
  const seedDemoFn        = useServerFn(adminSeedDemoStudent);
  const updateCatNameFn   = useServerFn(adminUpdateCategoryName);
  const uploadImageFn     = useServerFn(adminUploadQuestionImage);
  const getSubTopicsFn    = useServerFn(adminGetSubTopics);
  const addSubTopicFn     = useServerFn(adminAddSubTopic);
  const updateSubTopicFn  = useServerFn(adminUpdateSubTopic);
  const deleteSubTopicFn  = useServerFn(adminDeleteSubTopic);

  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<AdminTab>("groups");

  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<{ id: string; name: string } | null>(null);
  const [groupStudents, setGroupStudents] = useState<StudentSummary[]>([]);
  const [subTopicStats, setSubTopicStats] = useState<Record<string, Record<string, number>>>({});
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);

  const [csvText, setCsvText] = useState("");
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [editingCatKey, setEditingCatKey] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState("");
  const [catNameLoading, setCatNameLoading] = useState(false);

  // ── Sub-topics state ─────────────────────────────────────────────────────────
  const [subTopics, setSubTopics] = useState<SubTopicRow[]>([]);
  const [stCategoryFilter, setStCategoryFilter] = useState<string>("");
  const [stLoading, setStLoading] = useState(false);
  const [stMsg, setStMsg] = useState<string | null>(null);
  const [newStName, setNewStName] = useState("");
  const [newStCategory, setNewStCategory] = useState("");
  const [editingStId, setEditingStId] = useState<string | null>(null);
  const [editingStName, setEditingStName] = useState("");
  const [deletingStId, setDeletingStId] = useState<string | null>(null);

  const [aiQuery, setAiQuery] = useState("");
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // ── Question Bank state ───────────────────────────────────────────────────────
  const [allSubTopics,     setAllSubTopics]     = useState<SubTopicRow[]>([]);
  const [questions,        setQuestions]        = useState<QuestionRow[]>([]);
  const [qFilter,          setQFilter]          = useState<{ subTopic: string; grade: string }>({ subTopic: "", grade: "" });
  const [editingQ,         setEditingQ]         = useState<QuestionRow | null>(null);
  const [addingQ,          setAddingQ]          = useState(false);
  const [editForm,         setEditForm]         = useState({ questionText: "", answers: "", imageSearchTerm: "", customImageUrl: "" });
  const [addForm,          setAddForm]          = useState({ subTopicKey: "", grade: "", questionText: "", answers: "", imageSearchTerm: "", customImageUrl: "" });
  const [deletingQId,      setDeletingQId]      = useState<string | null>(null);
  const [qLoading,         setQLoading]         = useState(false);
  const [qMsg,             setQMsg]             = useState<string | null>(null);

  // ── Auth ──────────────────────────────────────────────────────────────────────

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginFn({ data: { password } });
      setAuthed(true);
      await loadGroups();
    } catch {
      setError("Invalid password");
    } finally {
      setLoading(false);
    }
  }

  // ── Data loading ──────────────────────────────────────────────────────────────

  async function loadGroups() {
    const res = await getGroupsFn({ data: { password } });
    setGroups(res.groups as GroupSummary[]);
  }

  async function loadGroupDetail(groupId: string, groupName: string) {
    setLoading(true);
    setSelectedGroup({ id: groupId, name: groupName });
    setSelectedStudent(null);
    try {
      const res = await getGroupDetailFn({ data: { password, groupId } });
      setGroupStudents(res.students as StudentSummary[]);
      setSubTopicStats(res.subTopicStats as Record<string, Record<string, number>>);
    } finally {
      setLoading(false);
    }
  }

  async function loadStudentDetail(studentId: string) {
    setLoading(true);
    try {
      const res = await getStudentDetailFn({ data: { password, studentId } });
      setSelectedStudent(res);
    } finally {
      setLoading(false);
    }
  }

  async function loadCategories() {
    const res = await getCatsFn({ data: { password } });
    setCategories(res.categories as Category[]);
  }

  async function toggleCategory(key: string, current: boolean) {
    await toggleCatFn({ data: { password, categoryKey: key, isActive: !current } });
    await loadCategories();
  }

  async function saveCategoryName(key: string) {
    if (!editingCatName.trim()) return;
    setCatNameLoading(true);
    try {
      await updateCatNameFn({ data: { password, categoryKey: key, displayName: editingCatName.trim() } });
      setCategories((prev) =>
        prev.map((c) => (c.category_key === key ? { ...c, display_name: editingCatName.trim() } : c)),
      );
      setEditingCatKey(null);
    } finally {
      setCatNameLoading(false);
    }
  }

  // ── Sub-topic management ──────────────────────────────────────────────────────

  async function loadSubTopics(categoryKey?: string) {
    setStLoading(true);
    try {
      const res = await getSubTopicsFn({ data: { password, categoryKey: categoryKey || undefined } });
      setSubTopics(res.subTopics as SubTopicRow[]);
    } finally {
      setStLoading(false);
    }
  }

  async function handleAddSubTopic() {
    if (!newStCategory || !newStName.trim()) return;
    setStLoading(true);
    setStMsg(null);
    try {
      await addSubTopicFn({ data: { password, categoryKey: newStCategory, displayName: newStName.trim() } });
      setNewStName("");
      await loadSubTopics(stCategoryFilter || undefined);
      setStMsg("Sub-topic added.");
    } catch (e: any) {
      setStMsg(e?.message ?? "Error adding sub-topic");
    } finally {
      setStLoading(false);
    }
  }

  async function handleSaveStName(id: string) {
    if (!editingStName.trim()) return;
    setStLoading(true);
    try {
      await updateSubTopicFn({ data: { password, id, displayName: editingStName.trim() } });
      setSubTopics((prev) => prev.map((s) => (s.id === id ? { ...s, display_name: editingStName.trim() } : s)));
      setEditingStId(null);
    } finally {
      setStLoading(false);
    }
  }

  async function handleDeleteSubTopic(id: string) {
    setStLoading(true);
    try {
      await deleteSubTopicFn({ data: { password, id } });
      setSubTopics((prev) => prev.filter((s) => s.id !== id));
      setDeletingStId(null);
    } finally {
      setStLoading(false);
    }
  }

  // ── CSV upload ────────────────────────────────────────────────────────────────

  function handleFileRead(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText((ev.target?.result as string) ?? "");
    reader.readAsText(file);
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!csvText.trim()) return;
    setLoading(true);
    setUploadMsg(null);
    try {
      const res = await uploadFn({ data: { password, csvData: csvText } });
      setUploadMsg(`Uploaded ${res.inserted} student${res.inserted !== 1 ? "s" : ""}.${res.errors.length ? " Errors: " + res.errors.join("; ") : ""}`);
      await loadGroups();
    } catch (err) {
      setUploadMsg(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  // ── Question Bank handlers ────────────────────────────────────────────────────

  async function loadQuestions(subTopicKey?: string, grade?: number) {
    setQLoading(true);
    setQMsg(null);
    try {
      const [qRes, stRes] = await Promise.all([
        getQsFn({ data: { password, subTopicKey, grade } }),
        allSubTopics.length === 0 ? getSubTopicsFn({ data: { password } }) : Promise.resolve(null),
      ]);
      setQuestions(qRes.questions as QuestionRow[]);
      if (stRes) setAllSubTopics(stRes.subTopics as SubTopicRow[]);
    } catch (err) {
      setQMsg(err instanceof Error ? err.message : "Failed to load questions");
    } finally {
      setQLoading(false);
    }
  }

  function openEdit(q: QuestionRow) {
    setEditingQ(q);
    setEditForm({
      questionText:    q.question_text,
      answers:         q.accepted_answers.join(", "),
      imageSearchTerm: q.image_search_term ?? "",
      customImageUrl:  q.custom_image_url ?? "",
    });
  }

  async function saveEdit() {
    if (!editingQ) return;
    setQLoading(true);
    setQMsg(null);
    try {
      const answers = editForm.answers
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);
      await updateQFn({
        data: {
          password,
          id:              editingQ.id,
          questionText:    editForm.questionText,
          acceptedAnswers: answers,
          imageSearchTerm: editForm.imageSearchTerm || null,
          customImageUrl:  editForm.customImageUrl || null,
        },
      });
      setEditingQ(null);
      await loadQuestions(
        qFilter.subTopic || undefined,
        qFilter.grade ? Number(qFilter.grade) : undefined,
      );
      setQMsg("Saved.");
    } catch (err) {
      setQMsg(err instanceof Error ? err.message : "Save failed");
    } finally {
      setQLoading(false);
    }
  }

  async function confirmDelete(id: string) {
    setQLoading(true);
    setQMsg(null);
    try {
      await deleteQFn({ data: { password, id } });
      setDeletingQId(null);
      await loadQuestions(
        qFilter.subTopic || undefined,
        qFilter.grade ? Number(qFilter.grade) : undefined,
      );
    } catch (err) {
      setQMsg(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setQLoading(false);
    }
  }

  async function saveAdd() {
    setQLoading(true);
    setQMsg(null);
    try {
      const answers = addForm.answers
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);
      await addQFn({
        data: {
          password,
          subTopicKey:    addForm.subTopicKey,
          grade:          Number(addForm.grade),
          questionText:   addForm.questionText,
          acceptedAnswers: answers,
          imageSearchTerm: addForm.imageSearchTerm || null,
          customImageUrl:  addForm.customImageUrl || null,
        },
      });
      setAddingQ(false);
      setAddForm({ subTopicKey: "", grade: "", questionText: "", answers: "", imageSearchTerm: "", customImageUrl: "" });
      await loadQuestions(
        qFilter.subTopic || undefined,
        qFilter.grade ? Number(qFilter.grade) : undefined,
      );
      setQMsg("Question added.");
    } catch (err) {
      setQMsg(err instanceof Error ? err.message : "Add failed");
    } finally {
      setQLoading(false);
    }
  }

  // ── AI query ──────────────────────────────────────────────────────────────────

  async function handleAiQuery(e: React.FormEvent) {
    e.preventDefault();
    if (!aiQuery.trim()) return;
    setAiLoading(true);
    setAiAnswer(null);
    try {
      const res = await aiQueryFn({ data: { password, query: aiQuery } });
      setAiAnswer(res.answer);
    } catch (err) {
      setAiAnswer(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setAiLoading(false);
    }
  }

  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [seedLoading, setSeedLoading] = useState(false);

  async function handleSeedDemo() {
    setSeedLoading(true);
    setSeedMsg(null);
    try {
      const res = await seedDemoFn({ data: { password } });
      setSeedMsg(`Demo student created. Use code: ${(res as any).uniqueId}`);
      await loadGroups();
    } catch (err) {
      setSeedMsg(err instanceof Error ? err.message : "Seed failed");
    } finally {
      setSeedLoading(false);
    }
  }

  async function handleResetSession(studentId: string) {
    setLoading(true);
    try {
      await resetFn({ data: { password, studentId } });
      // Reload the student detail to reflect cleared session
      await loadStudentDetail(studentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  async function handleExport(groupId?: string) {
    const res = await exportFn({ data: { password, groupId } });
    const blob = new Blob([JSON.stringify(res.results, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "skills-discovery-results.json";
    a.click();
  }

  // ── Login screen ──────────────────────────────────────────────────────────────

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="max-w-sm w-full bg-card border border-border rounded-2xl p-8 space-y-6">
          <h1 className="text-2xl font-bold text-center text-foreground">Admin — Skills Discovery</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Admin password"
              autoFocus
              className="w-full rounded-lg border border-border bg-background text-foreground py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? "…" : "Sign in"}
            </button>
          </form>
          <p className="text-xs text-center text-muted-foreground">
            <Link to="/" className="hover:underline">← Student entry</Link>
          </p>
        </div>
      </div>
    );
  }

  // ── Main dashboard ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top nav */}
      <header className="border-b border-border bg-card px-6 py-3 flex items-center justify-between">
        <h1 className="font-bold text-lg">Skills Discovery · Admin</h1>
        <div className="flex items-center gap-4">
          <a
            href="/?freeroam=true"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-3 py-1.5 rounded-md bg-cyan-400 text-black font-semibold hover:bg-cyan-300 transition-colors"
          >
            Freeroam ↗
          </a>
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
            ← Student view
          </Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Tabs */}
        <div className="flex gap-2 border-b border-border">
          {(
            [
              { key: "groups",     label: "Groups & Students" },
              { key: "categories", label: "Category Unlock" },
              { key: "subtopics",  label: "Sub-topics" },
              { key: "questions",  label: "Question Bank" },
              { key: "ai",         label: "AI Assistant" },
            ] as { key: AdminTab; label: string }[]
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => {
                setTab(key);
                if (key === "categories") loadCategories();
                if (key === "subtopics")  { if (categories.length === 0) loadCategories(); loadSubTopics(); }
                if (key === "questions")  loadQuestions();
              }}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Groups tab ─────────────────────────────────────────────────────── */}
        {tab === "groups" && (
          <div className="space-y-6">
            {/* CSV upload */}
            <section className="bg-card border border-border rounded-xl p-6 space-y-4">
              <h2 className="font-semibold text-foreground">Upload Students (CSV)</h2>
              <p className="text-xs text-muted-foreground">
                Required columns: <code>Unique ID, Student Name, Group</code>
              </p>
              <form onSubmit={handleUpload} className="flex flex-wrap gap-3 items-end">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileRead}
                  className="text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground file:text-sm cursor-pointer"
                />
                <button
                  type="submit"
                  disabled={loading || !csvText.trim()}
                  className="py-1.5 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  Upload
                </button>
              </form>
              {uploadMsg && <p className="text-sm text-muted-foreground">{uploadMsg}</p>}
            </section>

            {/* Groups overview */}
            {!selectedGroup ? (
              <section className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h2 className="font-semibold">Groups ({groups.length})</h2>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSeedDemo}
                      disabled={seedLoading}
                      className="text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-colors disabled:opacity-50"
                    >
                      {seedLoading ? "Seeding…" : "Seed Demo Student"}
                    </button>
                    <button
                      onClick={() => handleExport()}
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                    >
                      Export all results
                    </button>
                  </div>
                </div>
                {seedMsg && (
                  <p className="text-xs text-muted-foreground bg-muted rounded-md px-3 py-2">{seedMsg}</p>
                )}
                {groups.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No groups yet. Upload a CSV to get started.</p>
                ) : (
                  <div className="grid gap-3">
                    {groups.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => loadGroupDetail(g.id, g.name)}
                        className="bg-card border border-border rounded-xl p-5 text-left hover:border-primary transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-foreground">{g.name}</h3>
                          <span className="text-xs text-muted-foreground">View →</span>
                        </div>
                        <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                          <span>{g.totalStudents} students</span>
                          <span>{g.completedCount} completed</span>
                          <span>{g.startedCount} in progress</span>
                          <span>{g.totalStudents - g.completedCount - g.startedCount} not started</span>
                        </div>
                        {/* Completion bar */}
                        <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{
                              width: g.totalStudents > 0
                                ? `${(g.completedCount / g.totalStudents) * 100}%`
                                : "0%",
                            }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {g.totalStudents > 0
                            ? Math.round((g.completedCount / g.totalStudents) * 100)
                            : 0}% completed
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            ) : (
              /* Group detail */
              <section className="space-y-6">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => { setSelectedGroup(null); setSelectedStudent(null); }}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    ← All groups
                  </button>
                  <h2 className="font-semibold text-lg">{selectedGroup.name}</h2>
                  <button
                    onClick={() => handleExport(selectedGroup.id)}
                    className="ml-auto text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Export group
                  </button>
                </div>

                {loading ? (
                  <p className="text-muted-foreground text-sm">Loading…</p>
                ) : selectedStudent ? (
                  /* Individual student view */
                  <StudentDetail
                    data={selectedStudent}
                    onBack={() => setSelectedStudent(null)}
                    onReset={() => handleResetSession(selectedStudent.student.id)}
                  />
                ) : (
                  <>
                    {/* Sub-topic grade distribution chart */}
                    {Object.keys(subTopicStats).length > 0 && (
                      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                        <h3 className="font-medium text-sm">Grade Distribution by Sub-topic</h3>
                        <div className="overflow-x-auto">
                          <div className="min-w-[600px]">
                            <SubTopicChart stats={subTopicStats} />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Student list */}
                    <div className="bg-card border border-border rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-muted-foreground border-b border-border text-xs">
                            <th className="px-4 py-3">Student ID</th>
                            <th className="px-4 py-3">Name</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Topics done</th>
                            <th className="px-4 py-3"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {groupStudents.map((s) => (
                            <tr key={s.id} className="border-b border-border last:border-0">
                              <td className="px-4 py-3 font-mono text-xs">{s.uniqueId}</td>
                              <td className="px-4 py-3">{s.name}</td>
                              <td className="px-4 py-3">
                                <StatusBadge status={s.status} />
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {Object.keys(s.subTopicSummary).length} / {NUMBER_SUB_TOPICS.length}
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => loadStudentDetail(s.id)}
                                  className="text-xs text-primary hover:underline"
                                >
                                  View
                                </button>
                              </td>
                            </tr>
                          ))}
                          {groupStudents.length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground text-sm">
                                No students in this group yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>
            )}
          </div>
        )}

        {/* ── Categories tab ──────────────────────────────────────────────────── */}
        {tab === "categories" && (
          <section className="space-y-4">
            <div>
              <h2 className="font-semibold">Category Unlock</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Toggle which categories students can access. Changes take effect immediately.
              </p>
            </div>
            {categories.length === 0 ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : (
              <div className="space-y-2">
                {categories.map((cat) => (
                  <div
                    key={cat.category_key}
                    className="flex items-center justify-between bg-card border border-border rounded-xl px-5 py-4 gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      {editingCatKey === cat.category_key ? (
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            value={editingCatName}
                            onChange={(e) => setEditingCatName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") saveCategoryName(cat.category_key); if (e.key === "Escape") setEditingCatKey(null); }}
                            className="flex-1 rounded border border-border bg-background text-foreground text-sm px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                          <button
                            onClick={() => saveCategoryName(cat.category_key)}
                            disabled={catNameLoading}
                            className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingCatKey(null)}
                            className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{cat.display_name}</p>
                          <button
                            onClick={() => { setEditingCatKey(cat.category_key); setEditingCatName(cat.display_name); }}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            title="Rename"
                          >
                            ✏️
                          </button>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {cat.is_active ? "Active — students can access this" : "Locked — hidden from students"}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleCategory(cat.category_key, cat.is_active)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                        cat.is_active ? "bg-primary" : "bg-muted"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          cat.is_active ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Sub-topics tab ─────────────────────────────────────────────────── */}
        {tab === "subtopics" && (
          <section className="space-y-5">
            <div>
              <h2 className="font-semibold">Sub-topic Management</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Add, rename, or remove sub-topics for each category. Students see these as the tiles to choose from.
              </p>
            </div>

            {/* Filter by category */}
            <div className="flex gap-3 flex-wrap items-center">
              <select
                value={stCategoryFilter}
                onChange={(e) => {
                  setStCategoryFilter(e.target.value);
                  loadSubTopics(e.target.value || undefined);
                }}
                className="rounded-md border border-border bg-card text-foreground text-sm px-3 py-1.5 focus:outline-none"
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.category_key} value={c.category_key}>{c.display_name}</option>
                ))}
              </select>
              <button
                onClick={() => loadSubTopics(stCategoryFilter || undefined)}
                className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border"
              >
                ↻ Reload
              </button>
            </div>

            {/* Add new sub-topic */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium">Add sub-topic</p>
              <div className="flex gap-3 flex-wrap items-end">
                <div className="flex-1 min-w-[160px]">
                  <label className="text-xs text-muted-foreground mb-1 block">Category</label>
                  <select
                    value={newStCategory}
                    onChange={(e) => setNewStCategory(e.target.value)}
                    className="w-full rounded-md border border-border bg-background text-foreground text-sm px-3 py-2 focus:outline-none"
                  >
                    <option value="">Select category…</option>
                    {categories.map((c) => (
                      <option key={c.category_key} value={c.category_key}>{c.display_name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 min-w-[160px]">
                  <label className="text-xs text-muted-foreground mb-1 block">Display name</label>
                  <input
                    type="text"
                    value={newStName}
                    onChange={(e) => setNewStName(e.target.value)}
                    placeholder="e.g. Solving Equations"
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddSubTopic(); }}
                    className="w-full rounded-md border border-border bg-background text-foreground text-sm px-3 py-2 focus:outline-none"
                  />
                </div>
                <button
                  onClick={handleAddSubTopic}
                  disabled={stLoading || !newStCategory || !newStName.trim()}
                  className="py-2 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 whitespace-nowrap"
                >
                  + Add
                </button>
              </div>
              {stMsg && <p className="text-xs text-muted-foreground">{stMsg}</p>}
            </div>

            {/* Sub-topic list */}
            {stLoading && subTopics.length === 0 ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : subTopics.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sub-topics yet — select a category filter or add one above.</p>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border text-xs">
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Key</th>
                      <th className="px-4 py-3">Display name</th>
                      <th className="px-4 py-3">Order</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {subTopics.map((st) => (
                      <tr key={st.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2 text-xs text-muted-foreground">{st.category_key}</td>
                        <td className="px-4 py-2 text-xs font-mono text-muted-foreground">{st.sub_topic_key}</td>
                        <td className="px-4 py-2 text-sm">
                          {editingStId === st.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                autoFocus
                                value={editingStName}
                                onChange={(e) => setEditingStName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") handleSaveStName(st.id); if (e.key === "Escape") setEditingStId(null); }}
                                className="rounded border border-border bg-background text-foreground text-sm px-2 py-1 focus:outline-none w-48"
                              />
                              <button onClick={() => handleSaveStName(st.id)} className="text-xs text-primary hover:underline">Save</button>
                              <button onClick={() => setEditingStId(null)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                            </div>
                          ) : (
                            <span>{st.display_name}</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{st.display_order}</td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => { setEditingStId(st.id); setEditingStName(st.display_name); }}
                              className="text-xs text-primary hover:underline"
                            >
                              Rename
                            </button>
                            {deletingStId === st.id ? (
                              <span className="flex items-center gap-2 text-xs">
                                <span className="text-muted-foreground">Sure?</span>
                                <button onClick={() => handleDeleteSubTopic(st.id)} className="text-destructive hover:underline">Delete</button>
                                <button onClick={() => setDeletingStId(null)} className="text-muted-foreground hover:text-foreground">Cancel</button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setDeletingStId(st.id)}
                                className="text-xs text-muted-foreground hover:text-destructive"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ── Question Bank tab ───────────────────────────────────────────────── */}
        {tab === "questions" && (
          <section className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Question Bank</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Edit question text, answers and image settings.
                </p>
              </div>
              <button
                onClick={() => { setAddingQ(true); setQMsg(null); }}
                className="py-1.5 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
              >
                + Add question
              </button>
            </div>

            {/* Filters */}
            <div className="flex gap-3 flex-wrap">
              <select
                value={qFilter.subTopic}
                onChange={(e) => {
                  const v = e.target.value;
                  setQFilter((f) => ({ ...f, subTopic: v }));
                  loadQuestions(v || undefined, qFilter.grade ? Number(qFilter.grade) : undefined);
                }}
                className="rounded-md border border-border bg-card text-foreground text-sm px-3 py-1.5 focus:outline-none"
              >
                <option value="">All sub-topics</option>
                {allSubTopics.length > 0
                  ? Object.entries(
                      allSubTopics.reduce<Record<string, SubTopicRow[]>>((acc, st) => {
                        (acc[st.category_key] = acc[st.category_key] ?? []).push(st);
                        return acc;
                      }, {}),
                    ).map(([catKey, sts]) => (
                      <optgroup key={catKey} label={categories.find((c) => c.category_key === catKey)?.display_name ?? catKey}>
                        {sts.map((st) => (
                          <option key={st.sub_topic_key} value={st.sub_topic_key}>{st.display_name}</option>
                        ))}
                      </optgroup>
                    ))
                  : NUMBER_SUB_TOPICS.map((st) => (
                      <option key={st.key} value={st.key}>{st.displayName}</option>
                    ))}
              </select>
              <select
                value={qFilter.grade}
                onChange={(e) => {
                  const v = e.target.value;
                  setQFilter((f) => ({ ...f, grade: v }));
                  loadQuestions(qFilter.subTopic || undefined, v ? Number(v) : undefined);
                }}
                className="rounded-md border border-border bg-card text-foreground text-sm px-3 py-1.5 focus:outline-none"
              >
                <option value="">All grades</option>
                <option value="1">Grade 1</option>
                <option value="2">Grade 2</option>
                <option value="3">Grade 3</option>
                <option value="4">Grade 4</option>
              </select>
            </div>

            {qMsg && <p className="text-sm text-muted-foreground">{qMsg}</p>}

            {/* Add question form */}
            {addingQ && (
              <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                <h3 className="font-medium text-sm">Add question</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Sub-topic *</label>
                    <select
                      value={addForm.subTopicKey}
                      onChange={(e) => setAddForm((f) => ({ ...f, subTopicKey: e.target.value }))}
                      className="w-full rounded-md border border-border bg-background text-foreground text-sm px-3 py-2 focus:outline-none"
                    >
                      <option value="">Select…</option>
                      {allSubTopics.length > 0
                        ? Object.entries(
                            allSubTopics.reduce<Record<string, SubTopicRow[]>>((acc, st) => {
                              (acc[st.category_key] = acc[st.category_key] ?? []).push(st);
                              return acc;
                            }, {}),
                          ).map(([catKey, sts]) => (
                            <optgroup key={catKey} label={categories.find((c) => c.category_key === catKey)?.display_name ?? catKey}>
                              {sts.map((st) => (
                                <option key={st.sub_topic_key} value={st.sub_topic_key}>{st.display_name}</option>
                              ))}
                            </optgroup>
                          ))
                        : NUMBER_SUB_TOPICS.map((st) => (
                            <option key={st.key} value={st.key}>{st.displayName}</option>
                          ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Grade *</label>
                    <select
                      value={addForm.grade}
                      onChange={(e) => setAddForm((f) => ({ ...f, grade: e.target.value }))}
                      className="w-full rounded-md border border-border bg-background text-foreground text-sm px-3 py-2 focus:outline-none"
                    >
                      <option value="">Select…</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                    </select>
                  </div>
                </div>
                <QEditFields form={addForm} onChange={(k, v) => setAddForm((f) => ({ ...f, [k]: v }))} password={password} uploadFn={uploadImageFn} />
                <div className="flex gap-3">
                  <button
                    onClick={saveAdd}
                    disabled={qLoading || !addForm.subTopicKey || !addForm.grade || !addForm.questionText || !addForm.answers}
                    className="py-1.5 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                  >
                    {qLoading ? "Saving…" : "Save question"}
                  </button>
                  <button
                    onClick={() => setAddingQ(false)}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Table */}
            {qLoading && !questions.length ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : questions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No questions loaded — use the filters above or select a tab.
              </p>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border text-xs">
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Sub-topic</th>
                      <th className="px-4 py-3">G</th>
                      <th className="px-4 py-3">Question</th>
                      <th className="px-4 py-3">Answer(s)</th>
                      <th className="px-4 py-3">Image term</th>
                      <th className="px-4 py-3">Custom URL</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {questions.map((q) => (
                      <React.Fragment key={q.id}>
                        <tr className="border-b border-border last:border-0">
                          <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                            {categories.find((c) => c.category_key === q.category_key)?.display_name ?? q.category_key}
                          </td>
                          <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                            {allSubTopics.find((st) => st.sub_topic_key === q.sub_topic_key)?.display_name ?? NUMBER_SUB_TOPICS.find((st) => st.key === q.sub_topic_key)?.displayName ?? q.sub_topic_key}
                          </td>
                          <td className="px-4 py-2 text-xs font-mono">{q.grade}</td>
                          <td className="px-4 py-2 text-xs max-w-xs">
                            <span className="line-clamp-2">{q.question_text}</span>
                          </td>
                          <td className="px-4 py-2 text-xs text-muted-foreground max-w-[120px] truncate">
                            {q.accepted_answers.join(", ")}
                          </td>
                          <td className="px-4 py-2 text-xs text-muted-foreground max-w-[120px] truncate">
                            {q.image_search_term ?? "—"}
                          </td>
                          <td className="px-4 py-2 text-xs text-muted-foreground max-w-[100px] truncate">
                            {q.custom_image_url ? "✓" : "—"}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => openEdit(q)}
                                className="text-xs text-primary hover:underline"
                              >
                                Edit
                              </button>
                              {deletingQId === q.id ? (
                                <span className="flex items-center gap-2 text-xs">
                                  <span className="text-muted-foreground">Sure?</span>
                                  <button
                                    onClick={() => confirmDelete(q.id)}
                                    className="text-destructive hover:underline"
                                  >
                                    Yes, delete
                                  </button>
                                  <button
                                    onClick={() => setDeletingQId(null)}
                                    className="text-muted-foreground hover:text-foreground"
                                  >
                                    Cancel
                                  </button>
                                </span>
                              ) : (
                                <button
                                  onClick={() => setDeletingQId(q.id)}
                                  className="text-xs text-muted-foreground hover:text-destructive"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {/* Inline edit drawer */}
                        {editingQ?.id === q.id && (
                          <tr className="bg-muted/40 border-b border-border">
                            <td colSpan={8} className="px-4 py-4">
                              <div className="space-y-3 max-w-xl">
                                <h4 className="font-medium text-sm">Edit question</h4>
                                <QEditFields
                                  form={editForm}
                                  onChange={(k, v) => setEditForm((f) => ({ ...f, [k]: v }))}
                                  password={password}
                                  uploadFn={uploadImageFn}
                                />
                                <p className="text-xs text-muted-foreground">
                                  Grade: {q.grade} (read-only — delete and re-add to change grade)
                                </p>
                                <div className="flex gap-3">
                                  <button
                                    onClick={saveEdit}
                                    disabled={qLoading}
                                    className="py-1.5 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                                  >
                                    {qLoading ? "Saving…" : "Save changes"}
                                  </button>
                                  <button
                                    onClick={() => setEditingQ(null)}
                                    className="text-sm text-muted-foreground hover:text-foreground"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ── AI tab ─────────────────────────────────────────────────────────── */}
        {tab === "ai" && (
          <section className="space-y-5">
            <div>
              <h2 className="font-semibold">AI Assistant</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Ask plain-English questions about your students&apos; results.
              </p>
            </div>

            <div className="text-xs text-muted-foreground space-y-1 bg-muted rounded-lg p-4">
              <p className="font-medium text-foreground mb-2">Example questions:</p>
              {[
                "Which sub-topics does Group A struggle with most?",
                "Who hasn't completed the scan yet?",
                "Which students are significantly slower than the group average?",
                "How long should we spend on Place Value with Group B this term?",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => setAiQuery(q)}
                  className="block text-left hover:text-primary transition-colors"
                >
                  → {q}
                </button>
              ))}
            </div>

            <form onSubmit={handleAiQuery} className="flex gap-3">
              <input
                type="text"
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                placeholder="Ask anything about your students…"
                className="flex-1 rounded-lg border border-border bg-card text-foreground py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-ring text-sm"
              />
              <button
                type="submit"
                disabled={aiLoading || !aiQuery.trim()}
                className="py-2.5 px-5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {aiLoading ? "…" : "Ask"}
              </button>
            </form>

            {aiAnswer && (
              <div className="bg-card border border-border rounded-xl p-5">
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{aiAnswer}</p>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function QEditFields({
  form,
  onChange,
  password,
  uploadFn,
}: {
  form: { questionText: string; answers: string; imageSearchTerm: string; customImageUrl: string };
  onChange: (key: string, val: string) => void;
  password: string;
  uploadFn: ReturnType<typeof useServerFn<typeof adminUploadQuestionImage>>;
}) {
  const [unsplashSeed, setUnsplashSeed] = React.useState(1);
  const [uploading, setUploading] = React.useState(false);
  const [uploadErr, setUploadErr] = React.useState<string | null>(null);

  const unsplashPreviewUrl = form.imageSearchTerm
    ? `https://source.unsplash.com/featured/640x360/?${encodeURIComponent(form.imageSearchTerm)}&sig=${unsplashSeed}`
    : null;
  const activePreviewUrl = form.customImageUrl || unsplashPreviewUrl;
  const previewLabel = form.customImageUrl
    ? "Uploaded / custom image (active)"
    : unsplashPreviewUrl
    ? "Unsplash result — click refresh for a different image"
    : null;

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadErr(null);
    try {
      const reader = new FileReader();
      const base64: string = await new Promise((res, rej) => {
        reader.onload = () => res((reader.result as string).split(",")[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const result = await uploadFn({ data: { password, fileName: file.name, fileBase64: base64, mimeType: file.type } });
      onChange("customImageUrl", result.publicUrl);
    } catch (err: any) {
      setUploadErr(err?.message ?? "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Question text</label>
        <textarea
          value={form.questionText}
          onChange={(e) => onChange("questionText", e.target.value)}
          rows={4}
          className="w-full rounded-md border border-border bg-background text-foreground text-sm px-3 py-2 focus:outline-none resize-y"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Accepted answer(s)</label>
        <input
          type="text"
          value={form.answers}
          onChange={(e) => onChange("answers", e.target.value)}
          className="w-full rounded-md border border-border bg-background text-foreground text-sm px-3 py-2 focus:outline-none"
        />
        <p className="text-xs text-muted-foreground mt-1">Separate multiple with a comma e.g. 4206, 4,206</p>
      </div>

      {/* Image section */}
      <div className="border border-border rounded-lg p-4 space-y-4 bg-muted/20">
        <p className="text-xs font-medium text-foreground">Image (optional)</p>

        {/* Unsplash search */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Unsplash search term</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={form.imageSearchTerm}
              onChange={(e) => { onChange("imageSearchTerm", e.target.value); setUnsplashSeed(1); }}
              placeholder="e.g. mechanic workshop bolts"
              className="flex-1 rounded-md border border-border bg-background text-foreground text-sm px-3 py-2 focus:outline-none"
            />
            {form.imageSearchTerm && (
              <button
                type="button"
                onClick={() => setUnsplashSeed((s) => s + 1)}
                className="px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground whitespace-nowrap"
                title="Get a different image"
              >
                ↻ Refresh
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Auto-fetches a relevant photo from Unsplash.</p>
        </div>

        {/* File upload */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Upload your own image</label>
          <label className="flex items-center gap-3 cursor-pointer">
            <span className="px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground whitespace-nowrap">
              {uploading ? "Uploading…" : "Choose file"}
            </span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={uploading}
              onChange={handleFileUpload}
            />
            <span className="text-xs text-muted-foreground">PNG, JPG, GIF, WebP — max ~4MB</span>
          </label>
          {uploadErr && <p className="text-xs text-destructive mt-1">{uploadErr}</p>}
        </div>

        {/* Custom URL override */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Or paste an image URL directly</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={form.customImageUrl}
              onChange={(e) => onChange("customImageUrl", e.target.value)}
              placeholder="https://..."
              className="flex-1 rounded-md border border-border bg-background text-foreground text-sm px-3 py-2 focus:outline-none"
            />
            {form.customImageUrl && (
              <button
                type="button"
                onClick={() => onChange("customImageUrl", "")}
                className="px-3 py-1.5 rounded-md border border-border text-xs text-destructive hover:bg-destructive/10 whitespace-nowrap"
              >
                Clear
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Custom URL overrides Unsplash. Upload above to auto-fill this.</p>
        </div>

        {/* Preview */}
        {activePreviewUrl && previewLabel && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">{previewLabel}</p>
            <img
              key={`${activePreviewUrl}-${unsplashSeed}`}
              src={activePreviewUrl}
              alt="preview"
              style={{ width: "100%", maxWidth: 480, height: 200, objectFit: "cover", borderRadius: 8, display: "block" }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    complete: "bg-primary/10 text-primary",
    in_progress: "bg-yellow-100 text-yellow-800",
    not_started: "bg-muted text-muted-foreground",
  }[status] ?? "bg-muted text-muted-foreground";

  const labels = {
    complete: "Complete",
    in_progress: "In progress",
    not_started: "Not started",
  }[status] ?? status;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles}`}>
      {labels}
    </span>
  );
}

const GRADE_COLORS: Record<string, string> = {
  null: "#94a3b8",
  "1": "#f97316",
  "2": "#22c55e",
  "3": "#3b82f6",
  "4": "#a855f7",
};

function SubTopicChart({ stats }: { stats: Record<string, Record<string, number>> }) {
  const data = NUMBER_SUB_TOPICS.map((st) => {
    const s = stats[st.key] ?? {};
    return {
      name: st.displayName.replace(" & ", " &\n"),
      null: s["null"] ?? 0,
      g1: s["1"] ?? 0,
      g2: s["2"] ?? 0,
      g3: s["3"] ?? 0,
      g4: s["4"] ?? 0,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 40 }}>
        <XAxis
          dataKey="name"
          tick={{ fontSize: 9 }}
          angle={-45}
          textAnchor="end"
          interval={0}
        />
        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
        <Tooltip
          formatter={(val, name) => [val, name === "null" ? "Below G1" : `Grade ${String(name).replace("g", "")}`]}
        />
        <Bar dataKey="null" stackId="a" fill={GRADE_COLORS["null"]} name="null" />
        <Bar dataKey="g1" stackId="a" fill={GRADE_COLORS["1"]} name="g1" />
        <Bar dataKey="g2" stackId="a" fill={GRADE_COLORS["2"]} name="g2" />
        <Bar dataKey="g3" stackId="a" fill={GRADE_COLORS["3"]} name="g3" />
        <Bar dataKey="g4" stackId="a" fill={GRADE_COLORS["4"]} name="g4" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function StudentDetail({
  data,
  onBack,
  onReset,
}: {
  data: any;
  onBack: () => void;
  onReset: () => void;
}) {
  const { student, session, subTopics, attempts, avgSecondsPerQuestion } = data;
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to group
        </button>
        <button
          onClick={() => window.print()}
          className="ml-auto text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors print:hidden"
        >
          🖨 Print summary
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-foreground">{student.name}</h3>
            <p className="text-xs text-muted-foreground">ID: {student.unique_id}</p>
          </div>
          {session && (
            confirmReset ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Reset all session data?</span>
                <button
                  onClick={() => { setConfirmReset(false); onReset(); }}
                  className="text-xs px-2 py-1 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Yes, reset
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmReset(true)}
                className="text-xs px-3 py-1.5 rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors"
              >
                Reset session
              </button>
            )
          )}
        </div>
        {session ? (
          <>
            <p className="text-xs text-muted-foreground">
              Started: {new Date(session.started_at).toLocaleString()}
            </p>
            {session.completed && (
              <p className="text-xs text-muted-foreground">
                Completed: {new Date(session.completed_at).toLocaleString()}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Theme: {session.theme} · Music: {session.music_used ? "Yes" : "No"}
            </p>
            {avgSecondsPerQuestion != null && (
              <p className="text-xs text-muted-foreground">
                Avg time per question: {avgSecondsPerQuestion.toFixed(1)}s
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">No session started yet.</p>
        )}
      </div>

      {subTopics.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border text-xs">
                <th className="px-4 py-3">Sub-topic</th>
                <th className="px-4 py-3">Order chosen</th>
                <th className="px-4 py-3">Grade ceiling</th>
                <th className="px-4 py-3">Needed G2 retry?</th>
              </tr>
            </thead>
            <tbody>
              {subTopics.map((st: any) => (
                <tr key={st.sub_topic_key} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-xs">
                    {NUMBER_SUB_TOPICS.find((s) => s.key === st.sub_topic_key)?.displayName ??
                      st.sub_topic_key}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">{st.selection_order}</td>
                  <td className="px-4 py-2">
                    {st.grade_ceiling != null ? (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
                        style={{ background: GRADE_COLORS[String(st.grade_ceiling)] }}
                      >
                        Grade {st.grade_ceiling}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">Below G1</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">
                    {st.needed_g2_retry ? "Yes" : "No"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Confidence order chart */}
      {subTopics.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h4 className="text-sm font-medium">Sub-topic confidence order (1 = most confident)</h4>
          <div className="space-y-1.5">
            {[...subTopics]
              .sort((a: any, b: any) => a.selection_order - b.selection_order)
              .map((st: any) => (
                <div key={st.sub_topic_key} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground w-4">{st.selection_order}.</span>
                  <span className="flex-1">
                    {NUMBER_SUB_TOPICS.find((s) => s.key === st.sub_topic_key)?.displayName ??
                      st.sub_topic_key}
                  </span>
                  {st.grade_ceiling != null && (
                    <span style={{ color: GRADE_COLORS[String(st.grade_ceiling)] }}>
                      G{st.grade_ceiling}
                    </span>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
