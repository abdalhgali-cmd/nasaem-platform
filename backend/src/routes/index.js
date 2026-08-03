import { Router } from "express";

import prisma from "../config/database.js";
import authRoutes from "../modules/auth/auth.routes.js";
import customerRoutes from "../modules/customers/customers.routes.js";
import orderRoutes from "../modules/orders/orders.routes.js";
import paymentRoutes from "../modules/payments/payments.routes.js";
import documentRoutes from "../modules/documents/documents.routes.js";
import offerRoutes from "../modules/offers/offers.routes.js";
import settingsRoutes from "../modules/settings/settings.routes.js";
import dashboardRoutes from "../modules/dashboard/dashboard.routes.js";
import branchRoutes from "../modules/branches/branches.routes.js";
import supplierRoutes from "../modules/suppliers/suppliers.routes.js";
import userRoutes from "../modules/users/users.routes.js";

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
router.use("/users", userRoutes);
router.use("/customers", customerRoutes);
router.use("/orders", orderRoutes);
router.use("/payments", paymentRoutes);
router.use("/documents", documentRoutes);
router.use("/offers", offerRoutes);
router.use("/settings", settingsRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/branches", branchRoutes);
router.use("/suppliers", supplierRoutes);

export default router;
