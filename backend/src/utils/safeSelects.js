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
