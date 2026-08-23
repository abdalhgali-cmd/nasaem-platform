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
import serviceRoutes from "../modules/services/services.routes.js";
import activityRoutes from "../modules/activity/activity.routes.js";
import notificationRoutes from "../modules/notifications/notifications.routes.js";
import contactRequestRoutes from "../modules/contact-requests/contact-requests.routes.js";
import contactRequestTrackingRoutes from "../modules/contact-request-tracking/contact-request-tracking.routes.js";
import passportOcrRoutes from "../modules/passport-ocr/passport-ocr.routes.js";
import siteAssetRoutes from "../modules/site-assets/site-assets.routes.js";
import flightRoutes from "../modules/flights/flights.routes.js";
import flightBookingRoutes from "../modules/flight-bookings/flight-bookings.routes.js";
import paymentAccountRoutes from "../modules/payment-accounts/payment-accounts.routes.js";
import paymentAccountPublicRoutes from "../modules/payment-accounts/payment-accounts.public.routes.js";
import umrahGroupRoutes from "../modules/umrah-groups/umrah-groups.routes.js";
import financeRoutes from "../modules/finance/finance.routes.js";
import homepageRoutes from "../modules/homepage/homepage.routes.js";
import themeRoutes from "../modules/theme/theme.routes.js";
import visaTypeRoutes from "../modules/visa-types/visa-types.routes.js";
import ferryRoutes from "../modules/ferries/ferries.routes.js";
import airlineRoutes from "../modules/airlines/airlines.routes.js";

const router = Router();

router.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ success: true, system: "Nasaem Platform API", version: "1.0.0", database: "connected", status: "running" });
  } catch (error) {
    res.status(500).json({ success: false, system: "Nasaem Platform API", version: "1.0.0", database: "disconnected", status: "error" });
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
router.use("/services", serviceRoutes);
router.use("/activity-logs", activityRoutes);
router.use("/notifications", notificationRoutes);
router.use("/contact-requests", contactRequestRoutes);
router.use("/tracking", contactRequestTrackingRoutes);
router.use("/payment-accounts", paymentAccountRoutes);
router.use("/payment-accounts/public", paymentAccountPublicRoutes);
router.use("/passport-ocr", passportOcrRoutes);
router.use("/site-assets", siteAssetRoutes);
router.use("/flights", flightRoutes);
router.use("/flight-bookings", flightBookingRoutes);
router.use("/umrah-groups", umrahGroupRoutes);
router.use("/finance", financeRoutes);
router.use("/homepage", homepageRoutes);
router.use("/theme", themeRoutes);
router.use("/visa-types", visaTypeRoutes);
router.use("/ferries", ferryRoutes);
router.use("/airlines", airlineRoutes);

export default router;
