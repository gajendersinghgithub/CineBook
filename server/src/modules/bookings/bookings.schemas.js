"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.confirmBookingSchema = exports.holdSeatsSchema = void 0;
const zod_1 = require("zod");
exports.holdSeatsSchema = zod_1.z.object({
    screeningId: zod_1.z.string().uuid(),
    screeningSeatIds: zod_1.z.array(zod_1.z.string().uuid()).min(1).max(10),
}).refine((data) => new Set(data.screeningSeatIds).size === data.screeningSeatIds.length, { message: "Duplicate seat IDs are not allowed." });
exports.confirmBookingSchema = exports.holdSeatsSchema;
//# sourceMappingURL=bookings.schemas.js.map