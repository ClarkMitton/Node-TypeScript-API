import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import scansRouter from "./scans.js";
import documentsRouter from "./documents.js";
import openaiChatRouter from "./openai-chat.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(scansRouter);
router.use(documentsRouter);
router.use(openaiChatRouter);

export default router;
