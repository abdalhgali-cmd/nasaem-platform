import bcrypt from "bcryptjs";
import prisma from "../src/config/database.js";

async function main() {
  const email = "admin@nasaem-platform.local";

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    console.log("Super admin already exists.");
    return;
  }

  const passwordHash = await bcrypt.hash("Admin@12345", 12);

  const superAdmin = await prisma.user.create({
    data: {
      employeeNo: "EMP-0001",
      fullName: "Super Admin",
      email,
      phone: "+0000000000",
      passwordHash,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    },
  });

  console.log("Super admin created:", superAdmin.email);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
