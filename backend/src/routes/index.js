import { Router } from "express";

import prisma from "../config/database.js";

const router = Router();

router.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      success: true,
      system: "Nasaem Platform API",
      version: "1.0.0",
      database: "connected",
      status: "running",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      system: "Nasaem Platform API",
      version: "1.0.0",
      database: "disconnected",
      status: "error",
    });
  }
});

export default router;
