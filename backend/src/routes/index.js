import { Router } from "express";

const router = Router();

router.get("/health", async (req, res) => {
  res.status(200).json({
    success: true,
    system: "Nasaem Platform API",
    version: "1.0.0",
    database: "not-connected-yet",
    status: "running",
  });
});

export default router;
