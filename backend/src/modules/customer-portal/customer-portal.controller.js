import { createSelfOrderSchema } from "./customer-portal.validators.js";
import { uploadContactRequestDocumentSchema } from "../contact-request-documents/contact-request-documents.validators.js";
import {
  getMyOverview,
  listMyOrders,
  getMyOrderById,
  listMyDocuments,
  listMyCoupons,
  createSelfOrder,
  listMyRequests,
  getMyRequestById,
  getMyRequestDeliverableFile,
  uploadMyRequestDocument,
  listMyNotifications,
  markMyNotificationRead,
} from "./customer-portal.service.js";
import { parsePagination } from "../../utils/pagination.js";
import { logActivity } from "../../utils/activityLog.js";

export async function getOverview(req, res, next) {
  try {
    const data = await getMyOverview(req.customer.id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getOrders(req, res, next) {
  try {
    const { data, meta } = await listMyOrders(req.customer.id, parsePagination(req.query));
    return res.status(200).json({ success: true, data, meta });
  } catch (error) {
    next(error);
  }
}

export async function getOrder(req, res, next) {
  try {
    const order = await getMyOrderById(req.customer.id, req.params.id);
    if (!order) return res.status(404).json({ success: false, message: "الطلب غير موجود" });
    return res.status(200).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
}

export async function getRequests(req, res, next) {
  try {
    const result = await listMyRequests(req.customer.id, parsePagination(req.query));
    return res.status(200).json({ success: true, ...result });
  } catch (error) { next(error); }
}

export async function getRequest(req, res, next) {
  try {
    const request = await getMyRequestById(req.customer.id, req.params.id);
    if (!request) return res.status(404).json({ success: false, message: "الطلب غير موجود" });
    return res.status(200).json({ success: true, data: request });
  } catch (error) { next(error); }
}

export async function uploadRequestDocument(req, res, next) {
  try {
    const parsed = uploadContactRequestDocumentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "بيانات المستند غير صحيحة", errors: parsed.error.flatten() });
    if (!req.file) return res.status(400).json({ success: false, message: "الملف مطلوب" });
    const result = await uploadMyRequestDocument(req.customer.id, req.params.id, { label: parsed.data.label, file: req.file, requirementId: parsed.data.requirementId });
    if (result.error === "NOT_FOUND") return res.status(404).json({ success: false, message: "الطلب غير موجود" });
    if (result.error) return res.status(400).json({ success: false, message: "تعذر رفع المستند", details: result.details });
    return res.status(201).json({ success: true, data: result.document });
  } catch (error) { next(error); }
}

export async function downloadRequestDeliverable(req, res, next) {
  try {
    const file = await getMyRequestDeliverableFile(req.customer.id, req.params.id, req.params.deliverableId);
    if (!file) return res.status(404).json({ success: false, message: "الملف غير موجود" });
    return res.sendFile(file.absolutePath, { headers: { "Content-Type": file.mimeType } });
  } catch (error) { next(error); }
}

export async function getNotifications(req, res, next) {
  try {
    const result = await listMyNotifications(req.customer.id, parsePagination(req.query));
    return res.status(200).json({ success: true, ...result });
  } catch (error) { next(error); }
}

export async function readNotification(req, res, next) {
  try {
    const notification = await markMyNotificationRead(req.customer.id, req.params.id);
    if (!notification) return res.status(404).json({ success: false, message: "الإشعار غير موجود" });
    return res.status(200).json({ success: true, data: notification });
  } catch (error) { next(error); }
}

export async function getDocuments(req, res, next) {
  try {
    const documents = await listMyDocuments(req.customer.id);
    return res.status(200).json({ success: true, data: documents });
  } catch (error) {
    next(error);
  }
}

export async function getCoupons(req, res, next) {
  try {
    const data = await listMyCoupons(req.customer.id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function storeSelfOrder(req, res, next) {
  try {
    const parsed = createSelfOrderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "بيانات غير صحيحة", errors: parsed.error.flatten() });

    const result = await createSelfOrder(req.customer.id, parsed.data);
    if (result.error === "SERVICE_NOT_FOUND") return res.status(404).json({ success: false, message: "الخدمة غير متاحة" });
    if (result.error === "VISA_TYPE_NOT_FOUND") return res.status(404).json({ success: false, message: "نوع التأشيرة غير متاح لهذه الخدمة" });
    if (result.error === "COUPON_ERROR") return res.status(400).json({ success: false, message: result.message });

    logActivity({ action: "CUSTOMER_ORDER_CREATED", entity: "Order", entityId: result.order.id, req });
    return res.status(201).json({ success: true, message: "تم إنشاء الطلب بنجاح", data: result.order });
  } catch (error) {
    next(error);
  }
}
