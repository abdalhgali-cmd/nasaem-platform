import { createBranchSchema } from "./branches.validators.js";
import { createBranch, getBranchById, listBranches } from "./branches.service.js";

export async function getBranches(req, res, next) {
  try {
    const branches = await listBranches();

    return res.status(200).json({
      success: true,
      data: branches,
    });
  } catch (error) {
    next(error);
  }
}

export async function getBranch(req, res, next) {
  try {
    const { id } = req.params;
    const branch = await getBranchById(id);

    if (!branch) {
      return res.status(404).json({
        success: false,
        message: "Branch not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: branch,
    });
  } catch (error) {
    next(error);
  }
}

export async function storeBranch(req, res, next) {
  try {
    const parsed = createBranchSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const branch = await createBranch(parsed.data);

    return res.status(201).json({
      success: true,
      message: "Branch created successfully",
      data: branch,
    });
  } catch (error) {
    next(error);
  }
}
