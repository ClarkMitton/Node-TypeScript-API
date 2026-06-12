import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import multer from "multer";
import { db } from "@workspace/db";
import { documents } from "@workspace/db/schema";
import {
  GetDocumentParams,
  DeleteDocumentParams,
  ListDocumentsResponse,
  GetDocumentResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

async function extractText(
  buffer: Buffer,
  mimeType: string,
  filename = "",
): Promise<string> {
  const lower = filename.toLowerCase();

  // Plain text-ish formats
  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml"
  ) {
    return buffer.toString("utf-8");
  }

  // DOCX → real text extraction via mammoth
  if (mimeType.includes("wordprocessingml") || lower.endsWith(".docx")) {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      if (result.value.trim()) return result.value;
    } catch {
      /* fall through to best-effort */
    }
  }

  // PDF → real text extraction via pdf-parse. Import the inner module to avoid
  // pdf-parse's index.js debug block that reads a bundled test file at load.
  if (mimeType === "application/pdf" || lower.endsWith(".pdf")) {
    try {
      const { default: pdfParse } = await import("pdf-parse/lib/pdf-parse.js");
      const result = await pdfParse(buffer);
      if (result.text.trim()) return result.text;
    } catch {
      /* fall through to best-effort */
    }
  }

  // Best-effort fallback: strip non-printable bytes from a UTF-8 view.
  const text = buffer.toString("utf-8", 0, Math.min(buffer.length, 50000));
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ").trim();
}

router.get("/documents", async (_req, res): Promise<void> => {
  const rows = await db.select().from(documents).orderBy(desc(documents.createdAt));
  res.json(
    ListDocumentsResponse.parse(
      rows.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        createdAt: d.createdAt.toISOString(),
      })),
    ),
  );
});

router.post("/documents", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const docType = (req.body as Record<string, string>)["type"] ?? "other";
  const docName =
    (req.body as Record<string, string>)["name"] ??
    req.file.originalname ??
    "Untitled";

  const extractedText = await extractText(req.file.buffer, req.file.mimetype, req.file.originalname);

  const [doc] = await db
    .insert(documents)
    .values({
      name: docName,
      type: docType,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      extractedText,
    })
    .returning();

  res.status(201).json({
    id: doc!.id,
    name: doc!.name,
    type: doc!.type,
    mimeType: doc!.mimeType,
    sizeBytes: doc!.sizeBytes,
    createdAt: doc!.createdAt.toISOString(),
  });
});

router.get("/documents/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetDocumentParams.safeParse({ id: parseInt(raw!, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [doc] = await db.select().from(documents).where(eq(documents.id, params.data.id));

  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  res.json(
    GetDocumentResponse.parse({
      id: doc.id,
      name: doc.name,
      type: doc.type,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      extractedText: doc.extractedText,
      createdAt: doc.createdAt.toISOString(),
    }),
  );
});

router.delete("/documents/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteDocumentParams.safeParse({ id: parseInt(raw!, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(documents)
    .where(eq(documents.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
