"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.authorizeAdmin = authorizeAdmin;
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function authenticate(req, res, next) {
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
        const decoded = jsonwebtoken_1.default.verify(token, secret);
        if (typeof decoded === "string" ||
            typeof decoded.userId !== "string" ||
            !["CUSTOMER", "ADMIN"].includes(decoded.role)) {
            return res.status(401).json({
                success: false,
                message: "Invalid authentication token",
            });
        }
        req.auth = {
            userId: decoded.userId,
            role: decoded.role,
        };
        next();
    }
    catch {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired authentication token",
        });
    }
}
function authorizeAdmin(req, res, next) {
    if (req.auth?.role !== "ADMIN") {
        return res.status(403).json({
            success: false,
            message: "Admin access required",
        });
    }
    next();
}
//# sourceMappingURL=auth.middleware.js.map