import bcrypt from "bcryptjs";
import prisma from "../src/config/database.js";
import { nextSequence } from "../src/utils/sequence.js";

async function main() {
  const email = "admin@nasaem-platform.local";

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    console.log("Super admin already exists.");
    return;
  }

  const seedPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!seedPassword) {
    throw new Error(
      "SEED_ADMIN_PASSWORD is not set. Set it in your .env before running the seed script."
    );
  }

  const passwordHash = await bcrypt.hash(seedPassword, 12);
  const employeeNo = `EMP-${String(await nextSequence("employee")).padStart(4, "0")}`;

  const superAdmin = await prisma.user.create({
    data: {
      employeeNo,
      fullName: "Super Admin",
      email,
      phone: "+0000000000",
      passwordHash,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    },
  });

  console.log("Super admin created:", superAdmin.email);
  console.log("Remember to change this password after the first login.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
