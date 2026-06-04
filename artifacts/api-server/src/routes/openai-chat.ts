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
    "You are a GDPR compliance expert assistant. You help users understand GDPR-relevant behaviours found in code repositories. Be specific, cite evidence from findings, and give actionable remediation advice.",
  ];

  if (scanContext) {
    parts.push("\n## Scan Context\n" + JSON.stringify(scanContext, null, 2));
  }

  if (docTexts.length > 0) {
    parts.push("\n## Uploaded Documents\n" + docTexts.join("\n\n---\n\n").slice(0, 8000));
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
