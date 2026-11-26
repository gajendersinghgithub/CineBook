"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMovies = getMovies;
exports.getMovieById = getMovieById;
exports.getCinemas = getCinemas;
exports.getCinemaById = getCinemaById;
exports.getScreenings = getScreenings;
const express_1 = require("express");
const prisma_1 = require("../../config/prisma");
const catalog_schemas_1 = require("./catalog.schemas");
async function getMovies(req, res) {
    const parsed = catalog_schemas_1.movieQuerySchema.safeParse(req.query);
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
                ? { title: { contains: search, mode: "insensitive" } }
                : {}),
            ...(genre
                ? { genre: { equals: genre, mode: "insensitive" } }
                : {}),
        };
        const [movies, total] = await prisma_1.prisma.$transaction([
            prisma_1.prisma.movie.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma_1.prisma.movie.count({ where }),
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
    }
    catch (error) {
        console.error("Get movies error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to retrieve movies",
        });
    }
}
async function getMovieById(req, res) {
    const parsed = catalog_schemas_1.movieIdSchema.safeParse(req.params);
    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            message: "Invalid movie ID",
        });
    }
    try {
        const movie = await prisma_1.prisma.movie.findUnique({
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
    }
    catch (error) {
        console.error("Get movie error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to retrieve movie",
        });
    }
}
async function getCinemas(_req, res) {
    try {
        const cinemas = await prisma_1.prisma.cinema.findMany({
            orderBy: { name: "asc" },
            include: {
                _count: { select: { screens: true } },
            },
        });
        return res.status(200).json({
            success: true,
            data: { cinemas },
        });
    }
    catch (error) {
        console.error("Get cinemas error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to retrieve cinemas",
        });
    }
}
async function getCinemaById(req, res) {
    const parsed = catalog_schemas_1.cinemaIdSchema.safeParse(req.params);
    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            message: "Invalid cinema ID",
        });
    }
    try {
        const cinema = await prisma_1.prisma.cinema.findUnique({
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
    }
    catch (error) {
        console.error("Get cinema error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to retrieve cinema",
        });
    }
}
async function getScreenings(req, res) {
    const parsed = catalog_schemas_1.screeningQuerySchema.safeParse(req.query);
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
        const screenings = await prisma_1.prisma.screening.findMany({
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
    }
    catch (error) {
        console.error("Get screenings error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to retrieve screenings",
        });
    }
}
//# sourceMappingURL=catalog.controller.js.map