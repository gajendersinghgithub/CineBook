import { z } from "zod";
export declare const holdSeatsSchema: z.ZodObject<{
    screeningId: z.ZodString;
    screeningSeatIds: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export declare const confirmBookingSchema: z.ZodObject<{
    screeningId: z.ZodString;
    screeningSeatIds: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
//# sourceMappingURL=bookings.schemas.d.ts.map