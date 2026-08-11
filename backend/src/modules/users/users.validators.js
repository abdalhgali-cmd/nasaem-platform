import { z } from "zod";

const DEPARTMENTS = ["VISAS", "FLIGHTS", "UMRAH", "HOTELS_PACKAGES", "FERRY"];

export const createUserSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional().nullable().or(z.literal("")),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"]).default("EMPLOYEE"),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).default("ACTIVE"),
  branchId: z.string().optional().nullable(),
  // Only meaningful for EMPLOYEE — see assertContactRequestAccess in
  // contact-requests.service.js. Left null/unset for any other role.
  department: z.enum(DEPARTMENTS).optional().nullable(),
});

export const updateUserStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
});

export const resetUserPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

// Nullable (not just optional) — "unassign" (send department: null) must be
// expressible, distinct from omitting the field entirely.
export const updateUserDepartmentSchema = z.object({
  department: z.enum(DEPARTMENTS).nullable(),
});
