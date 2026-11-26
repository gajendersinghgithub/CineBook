
import { z } from "zod";

export const createMovieSchema = z.object({
    title: z.string().trim().min(1).max(150),
    description: z.string().trim().min(1),
    posterUrl: z.string().url().optional().or(z.literal("")),
    duration: z.number().int().positive(),
    genre: z.string().trim().min(1).max(80),
    language: z.string().trim().max(50).optional(),
    releaseDate: z.string().datetime({ offset: true }).optional(),
});

export const updateMovieSchema = createMovieSchema.partial();

export const createCinemaSchema = z.object({
    name: z.string().trim().min(1).max(150),
    location: z.string().trim().min(1).max(255),
});


export const createScreenSchema = z.object({
    cinemaId: z.string().uuid(),
    name: z.string().trim().min(1).max(80),
    rows: z.array(
        z.object({
            rowLabel: z.string().trim().min(1).max(5),
            seatCount: z.number().int().min(1).max(30),
            seatType: z.enum(["REGULAR", "PREMIUM", "RECLINER"]).default("REGULAR"),
        })
    ).min(1).max(20),
}).refine(
    (data) => new Set(data.rows.map((row) => row.rowLabel)).size === data.rows.length,
    { message: "Row labels must be unique." }
);

export const createScreeningSchema = z.object({
    movieId: z.string().uuid(),
    screenId: z.string().uuid(),
    startTime: z.string().datetime({ offset: true }),
    endTime: z.string().datetime({ offset: true }),
}).refine(
    (data) => new Date(data.endTime) > new Date(data.startTime),
    { message: "Screening end time must be after start time." }
).refine(
    (data) => new Date(data.startTime) > new Date(),
    { message: "Screening must start in the future." }
);