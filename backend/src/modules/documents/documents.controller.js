import path from "path";
import { createDocumentSchema } from "./documents.validators.js";
import { createDocument, getDocumentById, listDocuments } from "./documents.service.js";

export async function getDocuments(req, res, next) {
  try {
    const documents = await listDocuments();

    return res.status(200).json({
      success: true,
      data: documents,
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
