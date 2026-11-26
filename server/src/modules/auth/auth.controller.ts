import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/prisma";
import { loginSchema, registerSchema } from "./auth.schemas";

function getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;

    if (!secret || secret.length < 32) {
        throw new Error("JWT_SECRET must be configured with at least 32 characters");
    }

    return secret;
}

function generateToken(user: { id: string; role: "CUSTOMER" | "ADMIN" }) {
    return jwt.sign(
        { userId: user.id, role: user.role },
        getJwtSecret(),
        { expiresIn: "1d" }
    );
}

export async function register(req: Request, res: Response) {
    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            message: "Invalid registration details",
            errors: parsed.error.flatten().fieldErrors,
        });
    }

    try {
        const { name, email, password } = parsed.data;
        const normalizedEmail = email.toLowerCase();

        const existingUser = await prisma.user.findUnique({
            where: { email: normalizedEmail },
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "An account with this email already exists",
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const user = await prisma.user.create({
            data: {
                name,
                email: normalizedEmail,
                passwordHash,
                role: "CUSTOMER",
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true,
            },
        });

        const token = generateToken(user);

        return res.status(201).json({
            success: true,
            message: "Registration successful",
            data: { user, token },
        });
    } catch (error) {
        // Handle concurrent registrations with the same email.
        if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "P2002"
        ) {
            return res.status(409).json({
                success: false,
                message: "An account with this email already exists",
            });
        }

        console.error("Registration error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to register user",
        });
    }
}

export async function login(req: Request, res: Response) {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            message: "Invalid login details",
            errors: parsed.error.flatten().fieldErrors,
        });
    }

    try {
        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password",
            });
        }

        const passwordMatches = await bcrypt.compare(
            password,
            user.passwordHash
        );

        if (!passwordMatches) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password",
            });
        }

        const token = generateToken(user);

        return res.status(200).json({
            success: true,
            message: "Login successful",
            data: {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                },
                token,
            },
        });
    } catch (error) {
        console.error("Login error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to login",
        });
    }
}

export async function getMe(req: Request, res: Response) {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.auth!.userId },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true,
            },
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User account no longer exists",
            });
        }

        return res.status(200).json({
            success: true,
            data: { user },
        });
    } catch (error) {
        console.error("Get current user error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve user",
        });
    }
}