import prisma from "../../config/database.js";
import { nextSequence } from "../../utils/sequence.js";
import { getRequiredDocumentTypes } from "../orders/orders.service.js";
import { safeUserSelect, safeCustomerSelect } from "../../utils/safeSelects.js";

async function generateGroupCode() {
  const year = new Date().getFullYear();
  const nextNumber = await nextSequence(`umrah-group-${year}`);
  return `UG-${year}-${String(nextNumber).padStart(4, "0")}`;
}

const memberInclude = {
  customer: { select: safeCustomerSelect },
  order: {
    include: {
      items: { include: { service: { select: { category: true } } } },
      documents: { select: { type: true } },
      assignedUser: { select: safeUserSelect },
    },
  },
};

// Every readiness signal is derived from the linked order — nothing here is
// stored redundantly, so it can never drift from the order's actual state.
// A member with no linked order yet is never ready (there's nothing to be
// ready from).
function memberReadiness(member) {
  const order = member.order;
  if (!order) {
    return { hasOrder: false, visaReady: false, ticketReady: false, paymentReady: false, documentsReady: false, fullyReady: false };
  }

  const documentTypes = new Set((order.documents || []).map((document) => document.type));
  const visaReady = documentTypes.has("VISA");
  const ticketReady = documentTypes.has("TICKET");
  const paymentReady = order.paymentStatus === "PAID";
  const required = getRequiredDocumentTypes(order);
  const documentsReady = required.every((type) => documentTypes.has(type));

  return {
    hasOrder: true,
    visaReady,
    ticketReady,
    paymentReady,
    documentsReady,
    fullyReady: visaReady && ticketReady && paymentReady && documentsReady,
  };
}

function summarize(members) {
  const readiness = members.map(memberReadiness);
  return {
    totalMembers: members.length,
    visaReady: readiness.filter((r) => r.visaReady).length,
    ticketReady: readiness.filter((r) => r.ticketReady).length,
    paymentComplete: readiness.filter((r) => r.paymentReady).length,
    documentsComplete: readiness.filter((r) => r.documentsReady).length,
    fullyReady: readiness.filter((r) => r.fullyReady).length,
  };
}

function serializeMember(member) {
  return {
    id: member.id,
    customer: member.customer,
    orderId: member.orderId,
    order: member.order
      ? {
          id: member.order.id,
          orderNumber: member.order.orderNumber,
          status: member.order.status,
          paymentStatus: member.order.paymentStatus,
          totalAmount: member.order.totalAmount,
          currency: member.order.currency,
          assignedUser: member.order.assignedUser,
        }
      : null,
    notes: member.notes,
    readiness: memberReadiness(member),
    createdAt: member.createdAt,
  };
}

export async function listGroups() {
  const groups = await prisma.umrahGroup.findMany({
    orderBy: [{ travelDate: "asc" }, { createdAt: "desc" }],
    include: { members: { include: memberInclude } },
  });
  return groups.map((group) => ({
    id: group.id,
    code: group.code,
    name: group.name,
    travelDate: group.travelDate,
    airline: group.airline,
    hotel: group.hotel,
    transport: group.transport,
    notes: group.notes,
    createdAt: group.createdAt,
    summary: summarize(group.members),
  }));
}

export async function getGroupById(id) {
  const group = await prisma.umrahGroup.findUnique({
    where: { id },
    include: { members: { include: memberInclude, orderBy: { createdAt: "asc" } } },
  });
  if (!group) return null;

  return {
    id: group.id,
    code: group.code,
    name: group.name,
    travelDate: group.travelDate,
    airline: group.airline,
    hotel: group.hotel,
    transport: group.transport,
    notes: group.notes,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    summary: summarize(group.members),
    members: group.members.map(serializeMember),
  };
}

export async function createGroup(data) {
  const code = await generateGroupCode();
  const group = await prisma.umrahGroup.create({
    data: {
      code,
      name: data.name,
      travelDate: data.travelDate ? new Date(data.travelDate) : null,
      airline: data.airline || null,
      hotel: data.hotel || null,
      transport: data.transport || null,
      notes: data.notes || null,
    },
  });
  return getGroupById(group.id);
}

export async function updateGroup(id, data) {
  const existing = await prisma.umrahGroup.findUnique({ where: { id } });
  if (!existing) return null;

  await prisma.umrahGroup.update({
    where: { id },
    data: {
      ...data,
      travelDate: "travelDate" in data ? (data.travelDate ? new Date(data.travelDate) : null) : undefined,
    },
  });
  return getGroupById(id);
}

export async function addMember(groupId, data) {
  const group = await prisma.umrahGroup.findUnique({ where: { id: groupId } });
  if (!group) return { error: "GROUP_NOT_FOUND" };

  const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
  if (!customer) return { error: "CUSTOMER_NOT_FOUND" };

  if (data.orderId) {
    const order = await prisma.order.findUnique({ where: { id: data.orderId }, select: { id: true, customerId: true } });
    if (!order) return { error: "ORDER_NOT_FOUND" };
    if (order.customerId !== data.customerId) return { error: "ORDER_CUSTOMER_MISMATCH" };
  }

  const existingMember = await prisma.umrahGroupMember.findUnique({
    where: { groupId_customerId: { groupId, customerId: data.customerId } },
  });
  if (existingMember) return { error: "ALREADY_MEMBER" };

  const member = await prisma.umrahGroupMember.create({
    data: { groupId, customerId: data.customerId, orderId: data.orderId || null, notes: data.notes || null },
    include: memberInclude,
  });
  return { member: serializeMember(member) };
}

export async function updateMember(groupId, memberId, data) {
  const member = await prisma.umrahGroupMember.findUnique({ where: { id: memberId } });
  if (!member || member.groupId !== groupId) return { error: "NOT_FOUND" };

  if ("orderId" in data && data.orderId) {
    const order = await prisma.order.findUnique({ where: { id: data.orderId }, select: { id: true, customerId: true } });
    if (!order) return { error: "ORDER_NOT_FOUND" };
    if (order.customerId !== member.customerId) return { error: "ORDER_CUSTOMER_MISMATCH" };
  }

  const updated = await prisma.umrahGroupMember.update({
    where: { id: memberId },
    data: {
      orderId: "orderId" in data ? data.orderId || null : undefined,
      notes: "notes" in data ? data.notes || null : undefined,
    },
    include: memberInclude,
  });
  return { member: serializeMember(updated) };
}

export async function removeMember(groupId, memberId) {
  const member = await prisma.umrahGroupMember.findUnique({ where: { id: memberId } });
  if (!member || member.groupId !== groupId) return null;
  await prisma.umrahGroupMember.delete({ where: { id: memberId } });
  return member;
}
