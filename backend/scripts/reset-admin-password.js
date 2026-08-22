import bcrypt from "bcryptjs";
import prisma from "../src/config/database.js";

const email = process.env.ADMIN_RESET_EMAIL || "admin@nasaem-platform.local";
const password = process.env.ADMIN_RESET_PASSWORD;

if (!password) {
  throw new Error("ADMIN_RESET_PASSWORD is not set. Set it only for the password reset run.");
}

if (password.length < 12) {
  throw new Error("ADMIN_RESET_PASSWORD must be at least 12 characters long.");
}

const user = await prisma.user.findUnique({ where: { email } });

if (!user) {
  throw new Error(`Admin account not found: ${email}`);
}

const passwordHash = await bcrypt.hash(password, 12);
await prisma.user.update({
  where: { id: user.id },
  data: { passwordHash, status: "ACTIVE" },
});

console.log(`Admin password reset successfully for ${email}.`);
console.log("Remove ADMIN_RESET_PASSWORD from the environment after this run.");

await prisma.$disconnect();
