import { Router } from "express";

import prisma from "../config/database.js";
import authRoutes from "../modules/auth/auth.routes.js";
import customerRoutes from "../modules/customers/customers.routes.js";

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

router.use("/auth", authRoutes);
router.use("/customers", customerRoutes);

export default router;
