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

function extractText(buffer: Buffer, mimeType: string): string {
  // For text-based files extract as UTF-8; for binary types return a placeholder
  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml"
  ) {
    return buffer.toString("utf-8");
  }
  // PDF / DOCX: return raw buffer coerced to string (basic extraction)
  // A production version would use pdf-parse / mammoth here
  const text = buffer.toString("utf-8", 0, Math.min(buffer.length, 50000));
  // Strip non-printable chars
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

  const extractedText = extractText(req.file.buffer, req.file.mimetype);

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
