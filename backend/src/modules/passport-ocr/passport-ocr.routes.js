import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { uploadPassportImage } from "../../middleware/upload.middleware.js";
import { scanPassport } from "./passport-ocr.controller.js";

const router = Router();

router.use(requireAuth, requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"));

function handleUpload(req, res, next) {
  uploadPassportImage(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || "File upload failed",
      });
    }

    next();
  });
}

router.post("/scan", handleUpload, scanPassport);

export default router;
