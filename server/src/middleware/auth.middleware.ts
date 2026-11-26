import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

interface TokenPayload {
    userId: string;
    role: "CUSTOMER" | "ADMIN";
}

export function authenticate(
    req: Request,
    res: Response,
    next: NextFunction
) {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "Authentication token required",
        });
    }

    const token = authHeader.slice(7);

    try {
        const secret = process.env.JWT_SECRET;

        if (!secret || secret.length < 32) {
            throw new Error("Invalid server JWT configuration");
        }

        const decoded = jwt.verify(token, secret);

        if (
            typeof decoded === "string" ||
            typeof decoded.userId !== "string" ||
            !["CUSTOMER", "ADMIN"].includes(decoded.role as string)
        ) {
            return res.status(401).json({
                success: false,
                message: "Invalid authentication token",
            });
        }

        req.auth = {
            userId: decoded.userId,
            role: decoded.role as TokenPayload["role"],
        };

        next();
    } catch {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired authentication token",
        });
    }
}

export function authorizeAdmin(
    req: Request,
    res: Response,
    next: NextFunction
) {
    if (req.auth?.role !== "ADMIN") {
        return res.status(403).json({
            success: false,
            message: "Admin access required",
        });
    }

    next();
}