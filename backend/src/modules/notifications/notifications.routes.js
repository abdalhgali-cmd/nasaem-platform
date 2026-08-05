import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware.js";
import { getNotifications, readNotification } from "./notifications.controller.js";

const router = Router();

router.use(requireAuth);

// No requireRole gate: every authenticated user manages only their own
// notifications (scoped by req.user.id in the service layer above).
router.get("/", getNotifications);
router.patch("/:id/read", readNotification);

export default router;
