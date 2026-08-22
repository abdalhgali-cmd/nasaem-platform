import { Router } from "express";
import multer from "multer";
import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import {
  downloadExcelTemplate,
  getFlights,
  getRates,
  importExcel,
  patchFlight,
  postFlight,
  removeFlight,
  searchFlights,
} from "./flights.controller.js";
import { patchRatesAndRefresh } from "./fx-refresh.controller.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get("/search", searchFlights);
router.get("/rates", getRates);

router.use(requireAuth);
router.get("/", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), getFlights);
router.get("/template", requireRole("SUPER_ADMIN", "ADMIN"), downloadExcelTemplate);
router.get("/admin/rates", requireRole("SUPER_ADMIN", "ADMIN"), getRates);
router.patch("/admin/rates", requireRole("SUPER_ADMIN", "ADMIN"), patchRatesAndRefresh);
router.post("/", requireRole("SUPER_ADMIN", "ADMIN"), postFlight);
router.patch("/:id", requireRole("SUPER_ADMIN", "ADMIN"), patchFlight);
router.delete("/:id", requireRole("SUPER_ADMIN"), removeFlight);
router.post("/import", requireRole("SUPER_ADMIN", "ADMIN"), upload.single("file"), importExcel);

export default router;
