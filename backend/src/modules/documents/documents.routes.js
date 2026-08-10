import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { uploadDocument } from "../../middleware/upload.middleware.js";
import { downloadDocument, getDocument, getDocuments, removeDocument, storeDocument } from "./documents.controller.js";

const router = Router();

router.use(requireAuth);

function handleUpload(req, res, next) {
  uploadDocument(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || "File upload failed",
      });
    }

    next();
  });
}

router.get("/", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), getDocuments);
router.get("/:id", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), getDocument);
router.get("/:id/file", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), downloadDocument);
router.post("/", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"), handleUpload, storeDocument);
router.delete("/:id", requireRole("SUPER_ADMIN", "ADMIN"), removeDocument);

export default router;
