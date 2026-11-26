import { Request, Response } from "express";
import { prisma } from "../../config/prisma";

const demoMovies = [
    {
        title: "Inception",
        description: "A skilled thief enters people's dreams to steal secrets and faces his most challenging mission.",
        duration: 148,
        genre: "Sci-Fi",
        language: "English",
    },
    {
        title: "The Dark Knight",
        description: "Batman faces a criminal mastermind who brings chaos to Gotham City.",
        duration: 152,
        genre: "Action",
        language: "English",
    },
    {
        title: "Dune: Part Two",
        description: "Paul Atreides joins the Fremen on an epic journey across the desert planet Arrakis.",
        duration: 166,
        genre: "Sci-Fi",
        language: "English",
    },
    {
        title: "Oppenheimer",
        description: "The story of the scientist who led the development of the first atomic bomb.",
        duration: 180,
        genre: "Drama",
        language: "English",
    },
    {
        title: "Jawan",
        description: "A man driven by a personal mission takes on corruption and injustice.",
        duration: 169,
        genre: "Action",
        language: "Hindi",
    },
    {
        title: "3 Idiots",
        description: "Three engineering students discover friendship, ambition and the meaning of success.",
        duration: 170,
        genre: "Comedy",
        language: "Hindi",
    },
    {
        title: "Drishyam 2",
        description: "A family tries to protect its secrets as an old investigation resurfaces.",
        duration: 140,
        genre: "Thriller",
        language: "Hindi",
    },
    {
        title: "Spider-Man: Across the Spider-Verse",
        description: "Miles Morales travels across the multiverse and meets other Spider-People.",
        duration: 140,
        genre: "Animation",
        language: "English",
    },
    {
        title: "Avatar: The Way of Water",
        description: "The Sully family explores the oceans of Pandora while facing a new threat.",
        duration: 192,
        genre: "Adventure",
        language: "English",
    },
    {
        title: "Kalki 2898 AD",
        description: "A futuristic epic set in a world where ancient legends meet advanced technology.",
        duration: 181,
        genre: "Sci-Fi",
        language: "Hindi",
    },
];

const screenRows = [
    { rowLabel: "A", seatCount: 10, seatType: "REGULAR" },
    { rowLabel: "B", seatCount: 10, seatType: "REGULAR" },
    { rowLabel: "C", seatCount: 10, seatType: "PREMIUM" },
];

export const seedDemoData = async (req: Request, res: Response) => {
    try {
        const { cinemaId, date } = req.body as {
            cinemaId?: string;
            date?: string;
        };

        if (!cinemaId || !date) {
            return res.status(400).json({
                success: false,
                message: "cinemaId and date are required.",
            });
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({
                success: false,
                message: "Date must use YYYY-MM-DD format.",
            });
        }

        const cinema = await prisma.cinema.findUnique({
            where: { id: cinemaId },
        });

        if (!cinema) {
            return res.status(404).json({
                success: false,
                message: "Cinema not found.",
            });
        }

        const now = new Date();

        const morning = new Date(`${date}T09:00:00+05:30`);
        const afternoon = new Date(`${date}T13:00:00+05:30`);
        const evening = new Date(`${date}T17:00:00+05:30`);

        if (morning <= now) {
            return res.status(400).json({
                success: false,
                message: "Please choose a future date.",
            });
        }

        const result = await prisma.$transaction(
            async (tx) => {
                // Create 10 demo movies.
                const movies = [];

                for (const movie of demoMovies) {
                    const createdMovie = await tx.movie.create({
                        data: movie,
                    });

                    movies.push(createdMovie);
                }

                // Ensure the cinema has exactly five screens available
                // for this demo setup. Existing screens are reused.
                const existingScreens = await tx.screen.findMany({
                    where: { cinemaId },
                    orderBy: { name: "asc" },
                });

                const screens = [...existingScreens];

                for (let number = 1; number <= 5; number++) {
                    const screenName = `Screen ${number}`;

                    const alreadyExists = screens.some(
                        (screen) => screen.name === screenName
                    );

                    if (!alreadyExists) {
                        const createdScreen = await tx.screen.create({
                            data: {
                                cinemaId,
                                name: screenName,
                                seats: {
                                    create: screenRows.flatMap((row) =>
                                        Array.from(
                                            { length: row.seatCount },
                                            (_, index) => ({
                                                rowLabel: row.rowLabel,
                                                seatNumber: index + 1,
                                                seatType: row.seatType,
                                            })
                                        )
                                    ),
                                },
                            },
                        });

                        screens.push(createdScreen);
                    }
                }

                const demoScreens = screens
                    .filter((screen) =>
                        /^Screen [1-5]$/.test(screen.name)
                    )
                    .sort((a, b) => a.name.localeCompare(b.name, undefined, {
                        numeric: true,
                    }))
                    .slice(0, 5);

                if (demoScreens.length !== 5) {
                    throw new Error("Could not prepare five screens.");
                }

                const slots = [morning, afternoon, evening];
                const createdScreenings = [];

                // Create three showtimes on each of the five screens.
                for (let screenIndex = 0; screenIndex < demoScreens.length; screenIndex++) {
                    const screen = demoScreens[screenIndex];

                    const physicalSeats = await tx.seat.findMany({
                        where: { screenId: screen.id },
                        select: { id: true },
                    });

                    if (physicalSeats.length === 0) {
                        throw new Error(`${screen.name} has no seats.`);
                    }

                    for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
                        const movieIndex =
                            (screenIndex * slots.length + slotIndex) % movies.length;

                        const movie = movies[movieIndex];
                        const startTime = new Date(slots[slotIndex]);

                        // Movie duration plus 20 minutes for turnaround.
                        const endTime = new Date(
                            startTime.getTime() +
                            (movie.duration + 20) * 60 * 1000
                        );

                        const conflict = await tx.screening.findFirst({
                            where: {
                                screenId: screen.id,
                                status: "SCHEDULED",
                                startTime: { lt: endTime },
                                endTime: { gt: startTime },
                            },
                        });

                        if (conflict) {
                            throw new Error(
                                `${screen.name} already has a screening during one of the selected time slots. Choose another date.`
                            );
                        }

                        const screening = await tx.screening.create({
                            data: {
                                movieId: movie.id,
                                screenId: screen.id,
                                startTime,
                                endTime,
                                seats: {
                                    createMany: {
                                        data: physicalSeats.map((seat) => ({
                                            seatId: seat.id,
                                        })),
                                    },
                                },
                            },
                            include: {
                                movie: true,
                                screen: {
                                    include: {
                                        cinema: true,
                                    },
                                },
                            },
                        });

                        createdScreenings.push(screening);
                    }
                }

                return {
                    movies,
                    screens: demoScreens,
                    screenings: createdScreenings,
                };
            },
            {
                maxWait: 10000,
                timeout: 60000,
            }
        );

        return res.status(201).json({
            success: true,
            message: "Demo cinema data created successfully.",
            summary: {
                moviesCreated: result.movies.length,
                screensAvailable: result.screens.length,
                screeningsCreated: result.screenings.length,
                showtimes: ["09:00 AM", "01:00 PM", "05:00 PM"],
            },
            data: result,
        });
    } catch (error) {
        console.error("Demo seed error:", error);

        return res.status(500).json({
            success: false,
            message:
                error instanceof Error
                    ? error.message
                    : "Unable to create demo data.",
        });
    }
};