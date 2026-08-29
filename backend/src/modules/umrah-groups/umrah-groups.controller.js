import { addMemberSchema, createGroupSchema, updateGroupSchema, updateMemberSchema } from "./umrah-groups.validators.js";
import { addMember, createGroup, getGroupById, listGroups, removeMember, updateGroup, updateMember } from "./umrah-groups.service.js";
import { logActivity } from "../../utils/activityLog.js";

const MEMBER_ERROR_STATUS = {
  GROUP_NOT_FOUND: 404,
  CUSTOMER_NOT_FOUND: 404,
  ORDER_NOT_FOUND: 404,
  NOT_FOUND: 404,
  ORDER_CUSTOMER_MISMATCH: 409,
  ALREADY_MEMBER: 409,
};

const MEMBER_ERROR_MESSAGE = {
  GROUP_NOT_FOUND: "Group not found",
  CUSTOMER_NOT_FOUND: "Customer not found",
  ORDER_NOT_FOUND: "Order not found",
  NOT_FOUND: "Member not found",
  ORDER_CUSTOMER_MISMATCH: "Order does not belong to this customer",
  ALREADY_MEMBER: "Customer is already a member of this group",
};

export async function getGroups(req, res, next) {
  try {
    const data = await listGroups();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getGroup(req, res, next) {
  try {
    const group = await getGroupById(req.params.id);
    if (!group) return res.status(404).json({ success: false, message: "Group not found" });
    return res.status(200).json({ success: true, data: group });
  } catch (error) {
    next(error);
  }
}

export async function storeGroup(req, res, next) {
  try {
    const parsed = createGroupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });

    const group = await createGroup(parsed.data);
    logActivity({ userId: req.user?.id, action: "UMRAH_GROUP_CREATED", entity: "UmrahGroup", entityId: group.id, req });

    return res.status(201).json({ success: true, message: "Group created successfully", data: group });
  } catch (error) {
    next(error);
  }
}

export async function patchGroup(req, res, next) {
  try {
    const parsed = updateGroupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });

    const group = await updateGroup(req.params.id, parsed.data);
    if (!group) return res.status(404).json({ success: false, message: "Group not found" });

    logActivity({ userId: req.user?.id, action: "UMRAH_GROUP_UPDATED", entity: "UmrahGroup", entityId: group.id, req });
    return res.status(200).json({ success: true, message: "Group updated successfully", data: group });
  } catch (error) {
    next(error);
  }
}

export async function storeMember(req, res, next) {
  try {
    const parsed = addMemberSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });

    const result = await addMember(req.params.id, parsed.data);
    if (result.error) return res.status(MEMBER_ERROR_STATUS[result.error]).json({ success: false, message: MEMBER_ERROR_MESSAGE[result.error] });

    logActivity({ userId: req.user?.id, action: "UMRAH_GROUP_MEMBER_ADDED", entity: "UmrahGroupMember", entityId: result.member.id, req });
    return res.status(201).json({ success: true, message: "Member added successfully", data: result.member });
  } catch (error) {
    next(error);
  }
}

export async function patchMember(req, res, next) {
  try {
    const parsed = updateMemberSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });

    const result = await updateMember(req.params.id, req.params.memberId, parsed.data);
    if (result.error) return res.status(MEMBER_ERROR_STATUS[result.error]).json({ success: false, message: MEMBER_ERROR_MESSAGE[result.error] });

    logActivity({ userId: req.user?.id, action: "UMRAH_GROUP_MEMBER_UPDATED", entity: "UmrahGroupMember", entityId: result.member.id, req });
    return res.status(200).json({ success: true, message: "Member updated successfully", data: result.member });
  } catch (error) {
    next(error);
  }
}

export async function destroyMember(req, res, next) {
  try {
    const member = await removeMember(req.params.id, req.params.memberId);
    if (!member) return res.status(404).json({ success: false, message: "Member not found" });

    logActivity({ userId: req.user?.id, action: "UMRAH_GROUP_MEMBER_REMOVED", entity: "UmrahGroupMember", entityId: member.id, req });
    return res.status(200).json({ success: true, message: "Member removed successfully" });
  } catch (error) {
    next(error);
  }
}
