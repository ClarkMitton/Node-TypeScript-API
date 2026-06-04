import { Router, type IRouter } from "express";
import { eq, asc, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { conversations, messages, scans, documents } from "@workspace/db/schema";
import {
  CreateOpenaiConversationBody,
  GetOpenaiConversationParams,
  DeleteOpenaiConversationParams,
  ListOpenaiMessagesParams,
  SendOpenaiMessageParams,
  SendOpenaiMessageBody,
  ListOpenaiConversationsResponse,
  GetOpenaiConversationResponse,
  ListOpenaiMessagesResponse,
} from "@workspace/api-zod";
import OpenAI from "openai";

const router: IRouter = Router();

const openai = new OpenAI({
  apiKey: process.env["AI_INTEGRATIONS_OPENAI_API_KEY"],
  baseURL: process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"],
});

function buildSystemPrompt(
  scanContext: Record<string, unknown> | null,
  docTexts: string[],
): string {
  const parts: string[] = [
    `You are a strict GDPR compliance analysis engine.

Your job is to analyse repository scan results and ONLY make claims that are directly supported by evidence in the provided data.

❗ CRITICAL RULES (NON-NEGOTIABLE)

1. NO SPECULATION
You must NEVER infer GDPR risk from:
- framework presence (e.g. Express, React, FastAPI)
- generic functions (e.g. fs.writeFile, Object.create)
- dependencies alone
- environment variables unless explicitly shown to contain personal data
Only analyse confirmed evidence in findings.

2. EVIDENCE-ONLY REASONING
You may ONLY state a GDPR risk if:
- a user input source is detected (e.g. req.body, form input, query params)
AND it is directly used in one of:
- storage (DB, filesystem, localStorage)
- external transfer (fetch, axios, API calls)
- logging
If this chain is NOT present, you MUST classify it as: "No verified personal data flow detected"

3. SEPARATE "CAPABILITY" FROM "USAGE"
CAPABILITY (NOT GDPR RELEVANT): presence of Express, fs module, database library, env variables.
USAGE (GDPR RELEVANT ONLY IF LINKED TO INPUT DATA): req.body.email stored in DB, user input sent via fetch, form data logged.
Only USAGE can contribute to GDPR risk.

4. DO NOT ASSUME PERSONAL DATA EXISTS
Unless explicitly present in scan findings (userId, email, username, IP addresses, form inputs), you MUST NOT assume personal data is being processed.

5. USE ONLY PROVIDED SCAN DATA
You are given a structured scan object containing static findings, AST findings, dependency analysis, and risk scores.
You MUST NOT reference external knowledge, typical behaviour of libraries, or assumptions about what "might happen".

📊 OUTPUT FORMAT (STRICT)

1. Verdict: one of LOW RISK / MEDIUM RISK / HIGH RISK / INSUFFICIENT EVIDENCE

2. Reasoning (bullet points): each bullet must include file, evidence snippet, and why it is or is not GDPR relevant.

3. VERIFIED DATA FLOWS (MOST IMPORTANT SECTION)
Only include flows that satisfy: user input → processing → storage OR external transfer OR logging.
Format: SOURCE → PROCESS → DESTINATION
If none exist, state: "No verified personal data flows detected in scan."

4. EXPLICIT NON-FINDINGS: list what was checked but NOT found (e.g. no verified user input handling, no confirmed personal data fields, no confirmed external transfer of user data).

🚫 FORBIDDEN OUTPUTS
You must NOT say: "likely stores personal data", "may involve GDPR risk", "could be used for user data", "framework implies data handling".
Only say what is proven.

🧠 CORE PRINCIPLE
You are not a creative analyst. You are a verifiable evidence auditor.
If something is not proven in the scan data, you must treat it as NOT present.`,
  ];

  if (scanContext) {
    parts.push("\n## Scan Data (treat this as the sole source of truth)\n" + JSON.stringify(scanContext, null, 2));
  }

  if (docTexts.length > 0) {
    parts.push("\n## Uploaded Compliance Documents (reference only — do not infer risk from these alone)\n" + docTexts.join("\n\n---\n\n").slice(0, 8000));
  }

  return parts.join("\n");
}

router.get("/openai/conversations", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.createdAt));
  res.json(
    ListOpenaiConversationsResponse.parse(
      rows.map((c) => ({
        id: c.id,
        title: c.title,
        createdAt: c.createdAt.toISOString(),
      })),
    ),
  );
});

router.post("/openai/conversations", async (req, res): Promise<void> => {
  const parsed = CreateOpenaiConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [conv] = await db
    .insert(conversations)
    .values({ title: parsed.data.title })
    .returning();

  res.status(201).json({
    id: conv!.id,
    title: conv!.title,
    createdAt: conv!.createdAt.toISOString(),
  });
});

router.get("/openai/conversations/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetOpenaiConversationParams.safeParse({ id: parseInt(raw!, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, params.data.id));

  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, params.data.id))
    .orderBy(asc(messages.createdAt));

  res.json(
    GetOpenaiConversationResponse.parse({
      id: conv.id,
      title: conv.title,
      createdAt: conv.createdAt.toISOString(),
      messages: msgs.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    }),
  );
});

router.delete("/openai/conversations/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteOpenaiConversationParams.safeParse({ id: parseInt(raw!, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(conversations)
    .where(eq(conversations.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  res.sendStatus(204);
});

router.get("/openai/conversations/:id/messages", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = ListOpenaiMessagesParams.safeParse({ id: parseInt(raw!, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, params.data.id))
    .orderBy(asc(messages.createdAt));

  res.json(
    ListOpenaiMessagesResponse.parse(
      msgs.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    ),
  );
});

router.post("/openai/conversations/:id/messages", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = SendOpenaiMessageParams.safeParse({ id: parseInt(rawId!, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const bodyParsed = SendOpenaiMessageBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }

  const { content, scanId, documentIds } = bodyParsed.data;

  // Verify conversation exists
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, params.data.id));

  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  // Load scan context if provided
  let scanContext: Record<string, unknown> | null = null;
  if (scanId != null) {
    const [scan] = await db.select().from(scans).where(eq(scans.id, scanId));
    if (scan) {
      scanContext = {
        repo: scan.repoName,
        score: scan.gdprScore,
        riskLevel: scan.riskLevel,
        totalFindings: scan.totalFindings,
        findings: scan.findings,
        dependencies: scan.dependencies,
      };
    }
  }

  // Load document texts if provided
  const docTexts: string[] = [];
  if (documentIds && documentIds.length > 0) {
    for (const docId of documentIds) {
      const [doc] = await db.select().from(documents).where(eq(documents.id, docId));
      if (doc) {
        docTexts.push(`### ${doc.name}\n${doc.extractedText.slice(0, 3000)}`);
      }
    }
  }

  // Save user message
  await db.insert(messages).values({
    conversationId: params.data.id,
    role: "user",
    content,
  });

  // Load conversation history
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, params.data.id))
    .orderBy(asc(messages.createdAt));

  const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: buildSystemPrompt(scanContext, docTexts),
    },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  // Stream SSE response
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let assistantContent = "";

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: chatMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        assistantContent += delta;
        res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
      }
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: String(err) })}\n\n`);
  }

  // Save assistant reply
  if (assistantContent) {
    await db.insert(messages).values({
      conversationId: params.data.id,
      role: "assistant",
      content: assistantContent,
    });
  }

  res.write("data: [DONE]\n\n");
  res.end();
});

export default router;
