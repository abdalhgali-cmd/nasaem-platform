// Shared Prisma `select` shape for embedding a User inside another model's
// response (e.g. Order.assignedUser, Document.uploadedBy, Branch.users).
// Never spread `include: { user: true }` for these relations — that also
// returns `passwordHash`, which then gets serialized straight into the API
// response.
export const safeUserSelect = {
  id: true,
  employeeNo: true,
  fullName: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  branchId: true,
  createdAt: true,
  updatedAt: true,
};

// Same rationale as safeUserSelect, for Customer: the Customer Account
// system (backend/src/modules/customer-auth) added passwordHash and the
// password-reset fields to this model. Every staff-facing endpoint that
// used to `include: { customer: true }` must use this instead —
// otherwise a Customer's password hash and live reset code ride along in
// an internal operations response (orders/payments/documents/dashboard/
// umrah-groups) that was never meant to carry authentication secrets.
export const safeCustomerSelect = {
  id: true,
  customerNo: true,
  fullName: true,
  passportNo: true,
  nationality: true,
  birthDate: true,
  gender: true,
  phone: true,
  email: true,
  country: true,
  city: true,
  address: true,
  notes: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
};
