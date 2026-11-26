"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginSchema = exports.registerSchema = void 0;
const zod_1 = require("zod");
exports.registerSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2).max(80),
    email: zod_1.z.string().trim().email().max(255),
    password: zod_1.z.string().min(8).max(72),
});
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().trim().email().max(255),
    password: zod_1.z.string().min(1).max(72),
});
//# sourceMappingURL=auth.schemas.js.map