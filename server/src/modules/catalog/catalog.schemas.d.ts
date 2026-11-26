import { z } from "zod";
export declare const movieQuerySchema: z.ZodObject<{
    search: z.ZodOptional<z.ZodString>;
    genre: z.ZodOptional<z.ZodString>;
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export declare const screeningQuerySchema: z.ZodObject<{
    movieId: z.ZodOptional<z.ZodString>;
    cinemaId: z.ZodOptional<z.ZodString>;
    date: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const movieIdSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export declare const cinemaIdSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
//# sourceMappingURL=catalog.schemas.d.ts.map