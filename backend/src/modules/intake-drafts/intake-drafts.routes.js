import { Router } from "express";
import rateLimit from "express-rate-limit";

import { uploadContactRequestDocument } from "../../middleware/upload.middleware.js";
import {
  destroyDraftDocument,
  getDraft,
  patchDraft,
  storeDraft,
  storeDraftDocument,
  submitDraftController,
} from "./intake-drafts.controller.js";

const router = Router();

function handleUpload(req, res, next) {
  uploadContactRequestDocument(req, res, (error) => {
    if (error) return res.status(400).json({ success: false, message: error.message || "File upload failed" });
    next();
  });
}

// Smart Case Operations — Release B. Three different limits for three
// different abuse surfaces:
//  - creating drafts is cheap but enumerable, so it's capped like any other
//    public write;
//  - autosave is called continuously by design as the customer types, so it
//    gets a much higher ceiling (a tight limit here would break the very
//    resilience this release exists to provide);
//  - submitting converts a draft into a real ContactRequest, the same thing
//    POST /api/contact-requests does, so it carries that endpoint's limit.
const createDraftLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please try again later." },
});

const autosaveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please try again later." },
});

const submitDraftLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please try again later." },
});

// Every route below is authorized by the draft's own unguessable token in
// the path — a draft is never listed, never reachable by id, and never
// exposed to staff endpoints until it becomes a ContactRequest.
router.post("/", createDraftLimiter, storeDraft);
router.get("/:token", autosaveLimiter, getDraft);
router.patch("/:token", autosaveLimiter, patchDraft);
router.post("/:token/documents", autosaveLimiter, handleUpload, storeDraftDocument);
router.delete("/:token/documents/:documentId", autosaveLimiter, destroyDraftDocument);
router.post("/:token/submit", submitDraftLimiter, submitDraftController);

export default router;
