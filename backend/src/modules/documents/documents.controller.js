import path from "path";
import { createDocumentSchema } from "./documents.validators.js";
import {
  createDocument,
  deleteDocument,
  getDocumentById,
  listDocuments,
  orderBelongsToCustomer,
} from "./documents.service.js";
import { parsePagination } from "../../utils/pagination.js";

const UPLOAD_ROOT = path.resolve("uploads");

export async function getDocuments(req, res, next) {
  try {
    const { data, meta } = await listDocuments(parsePagination(req.query));

    return res.status(200).json({
      success: true,
      data,
      meta,
    });
  } catch (error) {
    next(error);
  }
}

export async function getDocument(req, res, next) {
  try {
    const { id } = req.params;
    const document = await getDocumentById(id);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: document,
    });
  } catch (error) {
    next(error);
  }
}

export async function storeDocument(req, res, next) {
  try {
    const parsed = createDocumentSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "A file is required",
      });
    }

    if (!(await orderBelongsToCustomer(parsed.data.orderId, parsed.data.customerId))) {
      return res.status(400).json({
        success: false,
        message: "This order does not belong to the given customer",
      });
    }

    const document = await createDocument({
      ...parsed.data,
      uploadedById: req.user.id,
      fileName: req.file.originalname,
      // Store a path relative to the uploads root, not the absolute server
      // filesystem path, so API responses don't leak server directory layout.
      storagePath: path.join("documents", req.file.filename),
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
    });

    return res.status(201).json({
      success: true,
      message: "Document created successfully",
      data: document,
    });
  } catch (error) {
    next(error);
  }
}

// Same res.download() treatment as contact-requests.controller.js's
// staff file downloads — without it, staff had no way to ever open a
// document again after uploading it (see the mechanics audit).
export async function downloadDocument(req, res, next) {
  try {
    const document = await getDocumentById(req.params.id);

    if (!document) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }

    return res.download(
      path.join(UPLOAD_ROOT, document.storagePath),
      `${document.type.toLowerCase()}-${document.fileName}`,
      (error) => {
        if (error && !res.headersSent) {
          res.status(404).json({ success: false, message: "File missing on disk" });
        }
      }
    );
  } catch (error) {
    next(error);
  }
}

export async function removeDocument(req, res, next) {
  try {
    const { id } = req.params;
    const document = await deleteDocument(id);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Document removed successfully",
    });
  } catch (error) {
    next(error);
  }
}
