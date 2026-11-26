
import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import {
    createMovieSchema,
    updateMovieSchema,
    createCinemaSchema,
} from "./admin.schemas";
import {
    createScreenSchema,
    createScreeningSchema,
} from "./admin.schemas";

export async function createMovie(req: Request, res: Response) {
    const parsed = createMovieSchema.safeParse(req.body);

    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            errors: parsed.error.flatten(),
        });
    }

    try {
        const movie = await prisma.movie.create({
            data: {
                ...parsed.data,
                posterUrl: parsed.data.posterUrl || null,
                releaseDate: parsed.data.releaseDate
                    ? new Date(parsed.data.releaseDate)
                    : null,
            },
        });

        return res.status(201).json({
            success: true,
            message: "Movie created successfully.",
            data: movie,
        });
    } catch (error) {
        console.error("Create movie error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to create movie.",
        });
    }
}

export async function updateMovie(req: Request, res: Response) {
    const id = req.params.id;
    const parsed = updateMovieSchema.safeParse(req.body);

    if (typeof id !== "string" || !parsed.success) {
        return res.status(400).json({
            success: false,
            message: "Invalid movie ID or request data.",
            errors: parsed.success ? undefined : parsed.error.flatten(),
        });
    }

    try {
        const movie = await prisma.movie.update({
            where: { id },
            data: {
                ...parsed.data,
                releaseDate: parsed.data.releaseDate
                    ? new Date(parsed.data.releaseDate)
                    : undefined,
            },
        });

        return res.json({
            success: true,
            message: "Movie updated successfully.",
            data: movie,
        });
    } catch (error) {
        if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "P2025"
        ) {
            return res.status(404).json({
                success: false,
                message: "Movie not found.",
            });
        }

        console.error("Update movie error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to update movie.",
        });
    }
}

export async function deleteMovie(req: Request, res: Response) {
    const id = req.params.id;

    if (typeof id !== "string") {
        return res.status(400).json({
            success: false,
            message: "Invalid movie ID.",
        });
    }

    try {
        await prisma.movie.delete({ where: { id } });

        return res.json({
            success: true,
            message: "Movie deleted successfully.",
        });
    } catch (error) {
        if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "P2025"
        ) {
            return res.status(404).json({
                success: false,
                message: "Movie not found.",
            });
        }

        // Existing screenings reference movies with onDelete: Restrict.
        return res.status(409).json({
            success: false,
            message: "Movie cannot be deleted because it is referenced by screenings.",
        });
    }
}

export async function createCinema(req: Request, res: Response) {
    const parsed = createCinemaSchema.safeParse(req.body);

    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            errors: parsed.error.flatten(),
        });
    }

    try {
        const cinema = await prisma.cinema.create({
            data: parsed.data,
        });

        return res.status(201).json({
            success: true,
            message: "Cinema created successfully.",
            data: cinema,
        });
    } catch (error) {
        console.error("Create cinema error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to create cinema.",
        });
    }
}


export async function createScreen(req: Request, res: Response) {
    const parsed = createScreenSchema.safeParse(req.body);

    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            errors: parsed.error.flatten(),
        });
    }

    try {
        const { cinemaId, name, rows } = parsed.data;

        const result = await prisma.$transaction(async (tx) => {
            const cinema = await tx.cinema.findUnique({
                where: { id: cinemaId },
                select: { id: true },
            });

            if (!cinema) {
                throw new Error("CINEMA_NOT_FOUND");
            }

            const screen = await tx.screen.create({
                data: { cinemaId, name },
            });

            const seats = rows.flatMap((row) =>
                Array.from({ length: row.seatCount }, (_, index) => ({
                    screenId: screen.id,
                    rowLabel: row.rowLabel,
                    seatNumber: index + 1,
                    seatType: row.seatType,
                }))
            );

            await tx.seat.createMany({ data: seats });

            return tx.screen.findUnique({
                where: { id: screen.id },
                include: {
                    seats: {
                        orderBy: [
                            { rowLabel: "asc" },
                            { seatNumber: "asc" },
                        ],
                    },
                    _count: { select: { seats: true } },
                },
            });
        });

        return res.status(201).json({
            success: true,
            message: "Screen and seating layout created successfully.",
            data: result,
        });
    } catch (error) {
        if (error instanceof Error && error.message === "CINEMA_NOT_FOUND") {
            return res.status(404).json({
                success: false,
                message: "Cinema not found.",
            });
        }

        console.error("Create screen error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to create screen. Check whether this screen name already exists in the cinema.",
        });
    }
}


export async function createScreening(req: Request, res: Response) {
    const parsed = createScreeningSchema.safeParse(req.body);

    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            errors: parsed.error.flatten(),
        });
    }

    try {
        const { movieId, screenId, startTime, endTime } = parsed.data;

        const start = new Date(startTime);
        const end = new Date(endTime);

        const result = await prisma.$transaction(
            async (tx) => {
                // 1. Verify movie exists
                const movie = await tx.movie.findUnique({
                    where: { id: movieId },
                    select: { id: true },
                });

                if (!movie) {
                    throw new Error("MOVIE_NOT_FOUND");
                }

                // 2. Lock screen row to prevent concurrent scheduling conflicts
                const lockedScreens = await tx.$queryRaw<{ id: string }[]>`
                    SELECT id
                    FROM "Screen"
                    WHERE id = ${screenId}
                    FOR UPDATE
                `;

                if (lockedScreens.length === 0) {
                    throw new Error("SCREEN_NOT_FOUND");
                }

                // 3. Get physical seats belonging to this screen
                const physicalSeats = await tx.seat.findMany({
                    where: { screenId },
                    select: { id: true },
                });

                if (physicalSeats.length === 0) {
                    throw new Error("SCREEN_HAS_NO_SEATS");
                }

                // 4. Check for overlapping scheduled screenings
                const overlapping = await tx.screening.findFirst({
                    where: {
                        screenId,
                        status: "SCHEDULED",
                        startTime: { lt: end },
                        endTime: { gt: start },
                    },
                    select: { id: true },
                });

                if (overlapping) {
                    throw new Error("SCREENING_OVERLAP");
                }

                // 5. Create screening
                const screening = await tx.screening.create({
                    data: {
                        movieId,
                        screenId,
                        startTime: start,
                        endTime: end,
                        status: "SCHEDULED",
                    },
                });

                // 6. Generate independent seat inventory for this screening
                await tx.screeningSeat.createMany({
                    data: physicalSeats.map((seat) => ({
                        screeningId: screening.id,
                        seatId: seat.id,
                        status: "AVAILABLE",
                    })),
                });

                // 7. Return screening details
                return tx.screening.findUnique({
                    where: { id: screening.id },
                    include: {
                        movie: true,
                        screen: {
                            include: { cinema: true },
                        },
                        _count: {
                            select: { seats: true },
                        },
                    },
                });
            },
            {
                maxWait: 10000,
                timeout: 20000,
            }
        );

        return res.status(201).json({
            success: true,
            message: "Screening created and seat inventory generated.",
            data: result,
        });

    } catch (error) {
        const message = error instanceof Error ? error.message : "";

        if (message === "MOVIE_NOT_FOUND") {
            return res.status(404).json({
                success: false,
                message: "Movie not found.",
            });
        }

        if (message === "SCREEN_NOT_FOUND") {
            return res.status(404).json({
                success: false,
                message: "Screen not found.",
            });
        }

        if (message === "SCREEN_HAS_NO_SEATS") {
            return res.status(400).json({
                success: false,
                message: "Create a seating layout before scheduling a screening.",
            });
        }

        if (message === "SCREENING_OVERLAP") {
            return res.status(409).json({
                success: false,
                message: "This screen already has a screening during the requested time.",
            });
        }

        console.error("Create screening error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to create screening.",
        });
    }
}


