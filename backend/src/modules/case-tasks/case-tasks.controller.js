import { createCaseTaskSchema } from "./case-tasks.validators.js";
import { completeCaseTask, createManualTask, listCaseTasks } from "./case-tasks.service.js";

const ERROR_RESPONSES = {
  NOT_FOUND: { status: 404, message: "Contact request not found" },
  ASSIGNEE_NOT_FOUND: { status: 404, message: "Assignee not found in this organization" },
  TASK_NOT_FOUND: { status: 404, message: "Task not found on this case" },
  TASK_NOT_OPEN: { status: 409, message: "This task is not open" },
};

function respondToError(res, result) {
  const mapped = ERROR_RESPONSES[result.error];
  if (!mapped) return null;
  return res.status(mapped.status).json({ success: false, message: mapped.message });
}

export async function getCaseTasks(req, res, next) {
  try {
    const result = await listCaseTasks(req.params.id, req.user.organizationId);
    const errorResponse = respondToError(res, result);
    if (errorResponse) return errorResponse;
    return res.status(200).json({ success: true, data: result.tasks });
  } catch (error) {
    next(error);
  }
}

export async function storeCaseTask(req, res, next) {
  try {
    const parsed = createCaseTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });
    }

    const result = await createManualTask(req.params.id, parsed.data, req.user.id, req.user.organizationId);
    const errorResponse = respondToError(res, result);
    if (errorResponse) return errorResponse;

    return res.status(201).json({ success: true, data: result.task });
  } catch (error) {
    next(error);
  }
}

export async function patchCaseTaskComplete(req, res, next) {
  try {
    const result = await completeCaseTask(req.params.id, req.params.taskId, req.user.id, req.user.organizationId);
    const errorResponse = respondToError(res, result);
    if (errorResponse) return errorResponse;
    return res.status(200).json({ success: true, data: result.task });
  } catch (error) {
    next(error);
  }
}
