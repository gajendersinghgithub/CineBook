
import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import {
    movieQuerySchema,
    screeningQuerySchema,
    movieIdSchema,
    cinemaIdSchema,
} from "./catalog.schemas";

export async function getMovies(req: Request, res: Response) {
    const parsed = movieQuerySchema.safeParse(req.query);

    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            message: "Invalid query parameters",
            errors: parsed.error.flatten().fieldErrors,
        });
    }

    try {
        const { search, genre, page, limit } = parsed.data;

        const where = {
            ...(search
                ? { title: { contains: search, mode: "insensitive" as const } }
                : {}),
            ...(genre
                ? { genre: { equals: genre, mode: "insensitive" as const } }
                : {}),
        };

        const [movies, total] = await prisma.$transaction([
            prisma.movie.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.movie.count({ where }),
        ]);

        return res.status(200).json({
            success: true,
            data: {
                movies,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                },
            },
        });
    } catch (error) {
        console.error("Get movies error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to retrieve movies",
        });
    }
}

export async function getMovieById(req: Request, res: Response) {
    const parsed = movieIdSchema.safeParse(req.params);

    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            message: "Invalid movie ID",
        });
    }

    try {
        const movie = await prisma.movie.findUnique({
            where: { id: parsed.data.id },
            include: {
                screenings: {
                    where: {
                        status: "SCHEDULED",
                        startTime: { gt: new Date() },
                    },
                    orderBy: { startTime: "asc" },
                    include: {
                        screen: {
                            include: { cinema: true },
                        },
                    },
                },
            },
        });

        if (!movie) {
            return res.status(404).json({
                success: false,
                message: "Movie not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: { movie },
        });
    } catch (error) {
        console.error("Get movie error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to retrieve movie",
        });
    }
}

export async function getCinemas(_req: Request, res: Response) {
    try {
        const cinemas = await prisma.cinema.findMany({
            orderBy: { name: "asc" },
            include: {
                _count: { select: { screens: true } },
            },
        });

        return res.status(200).json({
            success: true,
            data: { cinemas },
        });
    } catch (error) {
        console.error("Get cinemas error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to retrieve cinemas",
        });
    }
}

export async function getCinemaById(req: Request, res: Response) {
    const parsed = cinemaIdSchema.safeParse(req.params);

    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            message: "Invalid cinema ID",
        });
    }

    try {
        const cinema = await prisma.cinema.findUnique({
            where: { id: parsed.data.id },
            include: {
                screens: {
                    include: {
                        _count: { select: { seats: true } },
                    },
                },
            },
        });

        if (!cinema) {
            return res.status(404).json({
                success: false,
                message: "Cinema not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: { cinema },
        });
    } catch (error) {
        console.error("Get cinema error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to retrieve cinema",
        });
    }
}

export async function getScreenings(req: Request, res: Response) {
    const parsed = screeningQuerySchema.safeParse(req.query);

    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            message: "Invalid screening filters",
            errors: parsed.error.flatten().fieldErrors,
        });
    }

    try {
        const { movieId, cinemaId, date } = parsed.data;

        let dateFilter = {};

        if (date) {
            const selectedDate = new Date(date);
            const startOfDay = new Date(selectedDate);
            startOfDay.setUTCHours(0, 0, 0, 0);

            const endOfDay = new Date(startOfDay);
            endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

            dateFilter = {
                startTime: {
                    gte: startOfDay,
                    lt: endOfDay,
                },
            };
        }

        const screenings = await prisma.screening.findMany({
            where: {
                status: "SCHEDULED",
                startTime: { gt: new Date() },
                ...(movieId ? { movieId } : {}),
                ...(cinemaId ? { screen: { cinemaId } } : {}),
                ...dateFilter,
            },
            orderBy: { startTime: "asc" },
            include: {
                movie: {
                    select: {
                        id: true,
                        title: true,
                        posterUrl: true,
                        duration: true,
                        genre: true,
                        language: true,
                    },
                },
                screen: {
                    include: {
                        cinema: true,
                        _count: { select: { seats: true } },
                    },
                },
            },
        });

        return res.status(200).json({
            success: true,
            data: { screenings },
        });
    } catch (error) {
        console.error("Get screenings error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to retrieve screenings",
        });
    }
}
