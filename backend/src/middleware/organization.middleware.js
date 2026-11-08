import prisma from "../config/database.js";
import { SERVICE_KIND_FILTERS } from "../modules/contact-requests/contact-requests.service.js";

// Staff resource routes fail closed with 404 when the id belongs to another
// organization. Returning the same response as a nonexistent id avoids
// leaking that another tenant's record exists.
export async function requireContactRequestOrganization(req, res, next) {
  const contactRequest = await prisma.contactRequest.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
    select: { id: true, assignedUserId: true },
  });

  if (!contactRequest) {
    return res.status(404).json({ success: false, message: "Contact request not found" });
  }

  return enforceUmrahAssignment(req, res, next, contactRequest);
}

// Same organization check, no assignment gate: only for the claim route, which
// exists precisely for a request nobody is assigned to yet.
export async function requireContactRequestOrganizationOnly(req, res, next) {
  const contactRequest = await prisma.contactRequest.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
    select: { id: true },
  });
  if (!contactRequest) return res.status(404).json({ success: false, message: "Contact request not found" });
  return next();
}

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// T10: a regular EMPLOYEE may change an Umrah request only while it is
// assigned to them. Reading is open to all staff. Managers (ADMIN,
// SUPER_ADMIN) keep their authority (including reassigning), and the finance
// role is unchanged: it only reaches finance actions through its own guards.
// An unassigned request is taken with the explicit, concurrency-safe claim
// operation (POST /:id/claim), never by editing it. Scoped to Umrah requests
// so the Egypt approval flows are untouched.
async function enforceUmrahAssignment(req, res, next, contactRequest) {
  if (req.user.role !== "EMPLOYEE" || READ_METHODS.has(req.method)) return next();
  if (contactRequest.assignedUserId === req.user.id) return next();
  const isUmrah = await prisma.contactRequest.count({ where: { id: contactRequest.id, AND: [SERVICE_KIND_FILTERS.UMRAH] } });
  if (!isUmrah) return next();
  if (contactRequest.assignedUserId) {
    return res.status(403).json({ success: false, code: "ASSIGNED_TO_OTHER", message: "هذا الطلب مُسند إلى موظف آخر. يعيد المدير إسناده إذا لزم." });
  }
  return res.status(409).json({ success: false, code: "CLAIM_REQUIRED", message: "هذا الطلب غير مُسند لأحد. استلمه أولًا ثم تابع العمل عليه." });
}
