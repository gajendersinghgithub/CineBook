
import { z } from "zod";

export const movieQuerySchema = z.object({
    search: z.string().trim().max(100).optional(),
    genre: z.string().trim().max(50).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const screeningQuerySchema = z.object({
    movieId: z.string().uuid().optional(),
    cinemaId: z.string().uuid().optional(),
    date: z.string().datetime({ offset: true }).optional(),
});

export const movieIdSchema = z.object({
    id: z.string().uuid(),
});

export const cinemaIdSchema = z.object({
    id: z.string().uuid(),
});
