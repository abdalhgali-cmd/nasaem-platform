import { Prisma } from "@prisma/client";

// Maps a Prisma unique-constraint violation to a clean, user-facing message
// instead of leaking the raw ORM error text (which includes internal query
// details) with a generic 500.
function describePrismaError(error) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return null;
  }

  if (error.code === "P2002") {
    const fields = Array.isArray(error.meta?.target) ? error.meta.target.join(", ") : "field";
    return { statusCode: 409, message: `Duplicate value for unique field(s): ${fields}` };
  }

  if (error.code === "P2025") {
    return { statusCode: 404, message: "Record not found" };
  }

  if (error.code === "P2003") {
    return { statusCode: 409, message: "This action conflicts with a related record" };
  }

  return null;
}

export default function errorMiddleware(err, req, res, next) {
  console.error(err);

  const prismaDescription = describePrismaError(err);

  const statusCode = prismaDescription?.statusCode || err.statusCode || err.status || 500;
  const message = prismaDescription?.message || err.message || "Internal server error";

  res.status(statusCode).json({
    success: false,
    message,
  });
}
