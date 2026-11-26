import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
        throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env");
    }

    if (password.length < 12) {
        throw new Error("Admin password must be at least 12 characters long");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const admin = await prisma.user.upsert({
        where: { email },
        update: {
            passwordHash,
            role: "ADMIN",
        },
        create: {
            name: "CineBook Admin",
            email,
            passwordHash,
            role: "ADMIN",
        },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
        },
    });

    console.log("Admin account ready:");
    console.log(admin);
}

main()
    .catch((error) => {
        console.error("Admin seed failed:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });