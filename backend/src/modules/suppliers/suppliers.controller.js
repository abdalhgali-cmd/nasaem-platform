import { createSupplierSchema, updateSupplierSchema } from "./suppliers.validators.js";
import { createSupplier, getSupplierById, listSuppliers, updateSupplier } from "./suppliers.service.js";

export async function getSuppliers(req, res, next) {
  try {
    const suppliers = await listSuppliers();

    return res.status(200).json({
      success: true,
      data: suppliers,
    });
  } catch (error) {
    next(error);
  }
}

export async function getSupplier(req, res, next) {
  try {
    const { id } = req.params;
    const supplier = await getSupplierById(id);

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: supplier,
    });
  } catch (error) {
    next(error);
  }
}

export async function storeSupplier(req, res, next) {
  try {
    const parsed = createSupplierSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const supplier = await createSupplier(parsed.data);

    return res.status(201).json({
      success: true,
      message: "Supplier created successfully",
      data: supplier,
    });
  } catch (error) {
    next(error);
  }
}

export async function patchSupplier(req, res, next) {
  try {
    const { id } = req.params;
    const parsed = updateSupplierSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const supplier = await updateSupplier(id, parsed.data);

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Supplier updated successfully",
      data: supplier,
    });
  } catch (error) {
    next(error);
  }
}
