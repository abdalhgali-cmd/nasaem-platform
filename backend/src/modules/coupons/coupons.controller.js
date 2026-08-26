import { createCouponSchema, updateCouponSchema, validateCouponSchema } from "./coupons.validators.js";
import {
  listCoupons,
  getCouponById,
  createCoupon,
  updateCoupon,
  setCouponStatus,
  listCouponUsages,
  validateCouponForCustomer,
  COUPON_ERROR_MESSAGES,
} from "./coupons.service.js";
import { parsePagination } from "../../utils/pagination.js";
import { logActivity } from "../../utils/activityLog.js";

function validationError(res, error) {
  return res.status(400).json({ success: false, message: "بيانات غير صحيحة", errors: error.flatten() });
}

export async function getCoupons(req, res, next) {
  try {
    const active = req.query.active === "true" ? true : req.query.active === "false" ? false : undefined;
    const archived = req.query.archived === "true" ? true : req.query.archived === "false" ? false : undefined;
    const { data, meta } = await listCoupons({ ...parsePagination(req.query), active, archived, search: req.query.search });
    return res.status(200).json({ success: true, data, meta });
  } catch (error) {
    next(error);
  }
}

export async function getCoupon(req, res, next) {
  try {
    const coupon = await getCouponById(req.params.id);
    if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found" });
    return res.status(200).json({ success: true, data: coupon });
  } catch (error) {
    next(error);
  }
}

export async function getCouponUsageHistory(req, res, next) {
  try {
    const coupon = await getCouponById(req.params.id);
    if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found" });
    const { data, meta } = await listCouponUsages(req.params.id, parsePagination(req.query));
    return res.status(200).json({ success: true, data, meta });
  } catch (error) {
    next(error);
  }
}

export async function storeCoupon(req, res, next) {
  try {
    const parsed = createCouponSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const result = await createCoupon(parsed.data, req.user.id);
    if (result.error === "CODE_TAKEN") {
      return res.status(409).json({ success: false, message: "رمز الكوبون مستخدم بالفعل" });
    }

    logActivity({ userId: req.user.id, action: "COUPON_CREATED", entity: "Coupon", entityId: result.coupon.id, req, newValue: result.coupon });
    return res.status(201).json({ success: true, message: "تم إنشاء الكوبون بنجاح", data: result.coupon });
  } catch (error) {
    next(error);
  }
}

export async function patchCoupon(req, res, next) {
  try {
    const parsed = updateCouponSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const coupon = await updateCoupon(req.params.id, parsed.data);
    if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found" });

    logActivity({ userId: req.user.id, action: "COUPON_UPDATED", entity: "Coupon", entityId: coupon.id, req, newValue: coupon });
    return res.status(200).json({ success: true, message: "تم تحديث الكوبون", data: coupon });
  } catch (error) {
    next(error);
  }
}

function makeStatusHandler(statusPatch, action) {
  return async (req, res, next) => {
    try {
      const coupon = await setCouponStatus(req.params.id, statusPatch);
      if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found" });
      logActivity({ userId: req.user.id, action, entity: "Coupon", entityId: coupon.id, req, newValue: coupon });
      return res.status(200).json({ success: true, data: coupon });
    } catch (error) {
      next(error);
    }
  };
}

export const activateCoupon = makeStatusHandler({ active: true }, "COUPON_ACTIVATED");
export const deactivateCoupon = makeStatusHandler({ active: false }, "COUPON_DEACTIVATED");
export const archiveCoupon = makeStatusHandler({ archived: true, active: false }, "COUPON_ARCHIVED");

// Customer-facing preview: validates a code and shows the computed
// discount WITHOUT recording a usage — actual redemption only happens
// server-side at order creation (orders.service.js's createOrder via
// applyCouponToOrder), never here. Keeps "never trust the frontend for
// the final price" true even for this preview: the number shown here is
// server-computed, but it is re-computed and re-validated from scratch
// when the order is actually placed.
export async function validateCoupon(req, res, next) {
  try {
    const parsed = validateCouponSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const result = await validateCouponForCustomer({ ...parsed.data, customerId: req.customer.id });
    if (!result.valid) {
      return res.status(400).json({ success: false, message: COUPON_ERROR_MESSAGES[result.error] || "تعذر تطبيق الكوبون" });
    }

    return res.status(200).json({
      success: true,
      message: "تم تطبيق الكوبون بنجاح",
      data: {
        code: result.coupon.code,
        discountType: result.coupon.discountType,
        discountValue: Number(result.coupon.discountValue),
        originalAmount: result.originalAmount,
        discountAmount: result.discountAmount,
        finalAmount: result.finalAmount,
      },
    });
  } catch (error) {
    next(error);
  }
}
