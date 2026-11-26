"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cinemaIdSchema = exports.movieIdSchema = exports.screeningQuerySchema = exports.movieQuerySchema = void 0;
const zod_1 = require("zod");
exports.movieQuerySchema = zod_1.z.object({
    search: zod_1.z.string().trim().max(100).optional(),
    genre: zod_1.z.string().trim().max(50).optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(50).default(20),
});
exports.screeningQuerySchema = zod_1.z.object({
    movieId: zod_1.z.string().uuid().optional(),
    cinemaId: zod_1.z.string().uuid().optional(),
    date: zod_1.z.string().datetime({ offset: true }).optional(),
});
exports.movieIdSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
});
exports.cinemaIdSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
});
//# sourceMappingURL=catalog.schemas.js.map