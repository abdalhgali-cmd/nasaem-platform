import prisma from "../config/database.js";

// Staff resource routes fail closed with 404 when the id belongs to another
// organization. Returning the same response as a nonexistent id avoids
// leaking that another tenant's record exists.
export async function requireContactRequestOrganization(req, res, next) {
  const contactRequest = await prisma.contactRequest.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
    select: { id: true },
  });

  if (!contactRequest) {
    return res.status(404).json({ success: false, message: "Contact request not found" });
  }

  return next();
}
