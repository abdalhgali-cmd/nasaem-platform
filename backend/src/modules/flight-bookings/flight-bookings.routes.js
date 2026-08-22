import { Router } from "express";
import multer from "multer";
import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { confirmPayment, createFlightBooking, getBankAccounts, getBookingFile, getFlightBooking, getPublicFlightBooking, issueFinalTicket, listFlightBookings, submitPaymentReceipt, uploadProvisionalTicket, upsertBankAccount } from "./flight-bookings.service.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post("/", async (req, res, next) => { try { res.status(201).json({ success: true, booking: await createFlightBooking(req.body) }); } catch (e) { next(e); } });
router.get("/bank-accounts", async (req, res, next) => { try { res.json({ success: true, accounts: await getBankAccounts() }); } catch (e) { next(e); } });
router.get("/public/:id", async (req, res, next) => { try { const booking = await getPublicFlightBooking(req.params.id, req.query.phone); if (!booking) return res.status(404).json({ success: false, message: "رقم الحجز أو رقم الهاتف غير صحيح" }); res.json({ success: true, booking }); } catch (e) { next(e); } });
router.post("/:id/payment-receipt", upload.single("file"), async (req, res, next) => { try { res.json({ success: true, booking: await submitPaymentReceipt(req.params.id, req.file, req.body.phone) }); } catch (e) { next(e); } });
router.get("/:id", async (req, res, next) => { try { const booking = await getFlightBooking(req.params.id); if (!booking) return res.status(404).json({ success: false, message: "Booking not found" }); res.json({ success: true, booking }); } catch (e) { next(e); } });
router.get("/:id/file/:kind", async (req, res, next) => { try { const file = await getBookingFile(req.params.id, req.params.kind); res.download(file.path, file.name); } catch (e) { next(e); } });

router.use(requireAuth);
router.get("/admin/list", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), async (req, res, next) => { try { res.json({ success: true, bookings: await listFlightBookings(req.query.status) }); } catch (e) { next(e); } });
router.get("/admin/bank-accounts", requireRole("SUPER_ADMIN", "ADMIN", "ACCOUNTANT"), async (req, res, next) => { try { res.json({ success: true, accounts: await getBankAccounts() }); } catch (e) { next(e); } });
router.post("/admin/bank-accounts", requireRole("SUPER_ADMIN", "ADMIN"), async (req, res, next) => { try { res.status(201).json({ success: true, account: await upsertBankAccount(req.body) }); } catch (e) { next(e); } });
router.post("/:id/provisional-ticket", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"), upload.single("file"), async (req, res, next) => { try { res.json({ success: true, booking: await uploadProvisionalTicket(req.params.id, req.file) }); } catch (e) { next(e); } });
router.post("/:id/confirm-payment", requireRole("SUPER_ADMIN", "ADMIN", "ACCOUNTANT"), async (req, res, next) => { try { res.json({ success: true, booking: await confirmPayment(req.params.id, req.user?.id, req.body.note) }); } catch (e) { next(e); } });
router.post("/:id/final-ticket", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"), upload.single("file"), async (req, res, next) => { try { res.json({ success: true, booking: await issueFinalTicket(req.params.id, req.file) }); } catch (e) { next(e); } });

export default router;
