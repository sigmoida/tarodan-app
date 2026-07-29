import { AdminRole, PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function main(): Promise<void> {
  if (process.env.APP_ENV !== "production") {
    throw new Error("Production admin bootstrap requires APP_ENV=production");
  }

  const email = required("BOOTSTRAP_ADMIN_EMAIL").toLowerCase();
  const password = required("BOOTSTRAP_ADMIN_PASSWORD");
  const displayName =
    process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME?.trim() || "Tarodan Super Admin";

  if (email === "platform@tarodan.com") {
    throw new Error("Platform service account cannot be used as an admin");
  }
  if (password.length < 16 || Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be between 16 and 72 bytes");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      displayName,
      isVerified: true,
      isEmailVerified: true,
      isSeller: false,
      acceptsMarketingEmails: false,
    },
    update: {
      passwordHash,
      displayName,
      isVerified: true,
      isEmailVerified: true,
      isBanned: false,
      bannedAt: null,
      bannedBy: null,
      bannedReason: null,
      deletedAt: null,
      acceptsMarketingEmails: false,
    },
  });

  await prisma.adminUser.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      role: AdminRole.super_admin,
      permissions: { all: true },
      isActive: true,
    },
    update: {
      role: AdminRole.super_admin,
      permissions: { all: true },
      isActive: true,
    },
  });

  console.log(`Production super admin is ready: ${email}`);
}

main()
  .catch((error) => {
    console.error("Production admin bootstrap failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
