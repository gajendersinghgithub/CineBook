
import { z } from "zod";

export const holdSeatsSchema = z.object({
    screeningId: z.string().uuid(),
    screeningSeatIds: z.array(z.string().uuid()).min(1).max(10),
}).refine(
    (data) => new Set(data.screeningSeatIds).size === data.screeningSeatIds.length,
    { message: "Duplicate seat IDs are not allowed." }
);

export const confirmBookingSchema = holdSeatsSchema;
