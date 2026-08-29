import { createCustomerSchema, updateCustomerSchema } from "./customers.validators.js";
import { createCustomer, getCustomerById, listCustomers, lookupCustomer, updateCustomer } from "./customers.service.js";
import { parsePagination } from "../../utils/pagination.js";

export async function getCustomers(req, res, next) {
  try {
    const { data, meta } = await listCustomers({ ...parsePagination(req.query), search: req.query.search, organizationId: req.user.organizationId });
    return res.status(200).json({ success: true, data, meta });
  } catch (error) { next(error); }
}

export async function getCustomerLookup(req, res, next) {
  try {
    const customer = await lookupCustomer({ passportNo: req.query.passportNo, phone: req.query.phone, organizationId: req.user.organizationId });
    return res.status(200).json({ success: true, data: customer });
  } catch (error) { next(error); }
}

export async function getCustomer(req, res, next) {
  try {
    const customer = await getCustomerById(req.params.id, req.user.organizationId);
    if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });
    return res.status(200).json({ success: true, data: customer });
  } catch (error) { next(error); }
}

export async function storeCustomer(req, res, next) {
  try {
    const parsed = createCustomerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });
    const customer = await createCustomer(parsed.data, req.user.organizationId);
    return res.status(201).json({ success: true, message: "Customer created successfully", data: customer });
  } catch (error) { next(error); }
}

export async function patchCustomer(req, res, next) {
  try {
    const parsed = updateCustomerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });
    const customer = await updateCustomer(req.params.id, parsed.data, req.user.organizationId);
    if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });
    return res.status(200).json({ success: true, message: "Customer updated successfully", data: customer });
  } catch (error) { next(error); }
}
