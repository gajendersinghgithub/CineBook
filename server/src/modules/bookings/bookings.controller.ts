
import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { prisma } from "../../config/prisma";
import { holdSeatsSchema, confirmBookingSchema } from "./bookings.schemas";

type LockedSeat = {
    id: string;
    status: "AVAILABLE" | "HELD" | "BOOKED";
    heldById: string | null;
    holdExpiresAt: Date | null;
    dbNow: Date;
};

function getUserId(req: Request): string {
    if (!req.auth?.userId) {
        throw new Error("UNAUTHENTICATED");
    }
    return req.auth.userId;
}

// GET /api/screenings/:id/seats
export async function getScreeningSeats(req: Request, res: Response) {
    try {
        const screeningId = req.params.id;

        if (typeof screeningId !== "string") {
            return res.status(400).json({ success: false, message: "Invalid screening ID." });
        }

        const screening = await prisma.screening.findUnique({
            where: { id: screeningId },
            select: { id: true },
        });

        if (!screening) {
            return res.status(404).json({ success: false, message: "Screening not found." });
        }

        const seats = await prisma.$transaction(async (tx) => {
            // Use PostgreSQL time as the source of truth for hold expiry.
            await tx.$executeRaw`
        UPDATE "ScreeningSeat"
        SET
          status = 'AVAILABLE',
          "heldById" = NULL,
          "holdExpiresAt" = NULL,
          "updatedAt" = NOW()
        WHERE "screeningId" = ${screeningId}
          AND status = 'HELD'
          AND "holdExpiresAt" <= NOW()
      `;

            return tx.screeningSeat.findMany({
                where: { screeningId },
                include: {
                    seat: {
                        select: {
                            id: true,
                            rowLabel: true,
                            seatNumber: true,
                            seatType: true,
                        },
                    },
                },
                orderBy: [
                    { seat: { rowLabel: "asc" } },
                    { seat: { seatNumber: "asc" } },
                ],
            });
        });

        return res.json({ success: true, data: seats });
    } catch (error) {
        console.error("Get screening seats error:", error);
        return res.status(500).json({ success: false, message: "Unable to fetch seats." });
    }
}

// POST /api/bookings/hold
export async function holdSeats(req: Request, res: Response) {
    try {
        const userId = getUserId(req);
        const parsed = holdSeatsSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: "Invalid request.",
                errors: parsed.error.flatten(),
            });
        }

        const { screeningId, screeningSeatIds } = parsed.data;

        const result = await prisma.$transaction(async (tx) => {
            const screening = await tx.screening.findUnique({
                where: { id: screeningId },
                select: { id: true, status: true, startTime: true },
            });

            if (!screening) {
                throw new Error("SCREENING_NOT_FOUND");
            }

            if (screening.status !== "SCHEDULED" || screening.startTime <= new Date()) {
                throw new Error("SCREENING_UNAVAILABLE");
            }

            // Lock requested inventory rows. Concurrent requests for the same
            // seats must wait until this transaction completes.
            const lockedSeats = await tx.$queryRaw<LockedSeat[]>`
        SELECT
          id,
          status::text AS status,
          "heldById",
          "holdExpiresAt",
          NOW() AS "dbNow"
        FROM "ScreeningSeat"
        WHERE "screeningId" = ${screeningId}
          AND id IN (${Prisma.join(screeningSeatIds)})
        ORDER BY id
        FOR UPDATE
      `;

            if (lockedSeats.length !== screeningSeatIds.length) {
                throw new Error("INVALID_SEAT_SELECTION");
            }

            const now = lockedSeats[0].dbNow;

            const unavailable = lockedSeats.some((seat) => {
                if (seat.status === "AVAILABLE") return false;

                if (
                    seat.status === "HELD" &&
                    seat.holdExpiresAt &&
                    seat.holdExpiresAt <= now
                ) {
                    return false;
                }

                // A customer can renew their own active hold.
                if (seat.status === "HELD" && seat.heldById === userId) {
                    return false;
                }

                return true;
            });

            if (unavailable) {
                throw new Error("SEATS_UNAVAILABLE");
            }

            await tx.$executeRaw`
        UPDATE "ScreeningSeat"
        SET
          status = 'HELD',
          "heldById" = ${userId},
          "holdExpiresAt" = NOW() + INTERVAL '5 minutes',
          "updatedAt" = NOW()
        WHERE id IN (${Prisma.join(screeningSeatIds)})
          AND "screeningId" = ${screeningId}
      `;

            return tx.screeningSeat.findMany({
                where: { id: { in: screeningSeatIds } },
                include: {
                    seat: {
                        select: {
                            rowLabel: true,
                            seatNumber: true,
                            seatType: true,
                        },
                    },
                },
            });
        });

        return res.status(200).json({
            success: true,
            message: "Seats held successfully for 5 minutes.",
            data: result,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "";

        if (message === "UNAUTHENTICATED") {
            return res.status(401).json({ success: false, message: "Authentication required." });
        }
        if (message === "SCREENING_NOT_FOUND") {
            return res.status(404).json({ success: false, message: "Screening not found." });
        }
        if (message === "SCREENING_UNAVAILABLE") {
            return res.status(400).json({ success: false, message: "This screening is no longer available." });
        }
        if (message === "INVALID_SEAT_SELECTION") {
            return res.status(400).json({ success: false, message: "One or more seats do not belong to this screening." });
        }
        if (message === "SEATS_UNAVAILABLE") {
            return res.status(409).json({ success: false, message: "One or more seats are already held or booked." });
        }

        console.error("Hold seats error:", error);
        return res.status(500).json({ success: false, message: "Unable to hold seats." });
    }
}

// POST /api/bookings/confirm
export async function confirmBooking(req: Request, res: Response) {
    try {
        const userId = getUserId(req);
        const parsed = confirmBookingSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: "Invalid request.",
                errors: parsed.error.flatten(),
            });
        }

        const { screeningId, screeningSeatIds } = parsed.data;

        const booking = await prisma.$transaction(async (tx) => {
            const screening = await tx.screening.findUnique({
                where: { id: screeningId },
                select: { id: true, status: true, startTime: true },
            });

            if (!screening) {
                throw new Error("SCREENING_NOT_FOUND");
            }

            if (screening.status !== "SCHEDULED" || screening.startTime <= new Date()) {
                throw new Error("SCREENING_UNAVAILABLE");
            }

            const lockedSeats = await tx.$queryRaw<LockedSeat[]>`
        SELECT
          id,
          status::text AS status,
          "heldById",
          "holdExpiresAt",
          NOW() AS "dbNow"
        FROM "ScreeningSeat"
        WHERE "screeningId" = ${screeningId}
          AND id IN (${Prisma.join(screeningSeatIds)})
        ORDER BY id
        FOR UPDATE
      `;

            if (lockedSeats.length !== screeningSeatIds.length) {
                throw new Error("INVALID_SEAT_SELECTION");
            }

            const now = lockedSeats[0].dbNow;

            const validHold = lockedSeats.every(
                (seat) =>
                    seat.status === "HELD" &&
                    seat.heldById === userId &&
                    seat.holdExpiresAt !== null &&
                    seat.holdExpiresAt > now
            );

            if (!validHold) {
                throw new Error("HOLD_EXPIRED_OR_INVALID");
            }

            const createdBooking = await tx.booking.create({
                data: {
                    bookingReference: `CB-${randomUUID().toUpperCase()}`,
                    userId,
                    screeningId,
                    status: "CONFIRMED",
                    totalSeats: screeningSeatIds.length,
                    seats: {
                        create: screeningSeatIds.map((screeningSeatId) => ({
                            screeningSeatId,
                        })),
                    },
                },
                include: {
                    seats: {
                        include: {
                            screeningSeat: {
                                include: {
                                    seat: true,
                                },
                            },
                        },
                    },
                    screening: {
                        include: {
                            movie: true,
                            screen: {
                                include: { cinema: true },
                            },
                        },
                    },
                },
            });

            await tx.screeningSeat.updateMany({
                where: {
                    id: { in: screeningSeatIds },
                    screeningId,
                    status: "HELD",
                    heldById: userId,
                },
                data: {
                    status: "BOOKED",
                    heldById: null,
                    holdExpiresAt: null,
                },
            });

            return createdBooking;
        });

        return res.status(201).json({
            success: true,
            message: "Booking confirmed successfully.",
            data: booking,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "";

        if (message === "UNAUTHENTICATED") {
            return res.status(401).json({ success: false, message: "Authentication required." });
        }
        if (message === "SCREENING_NOT_FOUND") {
            return res.status(404).json({ success: false, message: "Screening not found." });
        }
        if (message === "SCREENING_UNAVAILABLE") {
            return res.status(400).json({ success: false, message: "This screening is no longer available." });
        }
        if (message === "INVALID_SEAT_SELECTION") {
            return res.status(400).json({ success: false, message: "One or more seats do not belong to this screening." });
        }
        if (message === "HOLD_EXPIRED_OR_INVALID") {
            return res.status(409).json({ success: false, message: "Your seat hold has expired or is no longer valid. Please select the seats again." });
        }

        console.error("Confirm booking error:", error);
        return res.status(500).json({ success: false, message: "Unable to confirm booking." });
    }
}


// GET /api/bookings/my-bookings
export async function getMyBookings(req: Request, res: Response) {
    try {
        const userId = getUserId(req);

        const bookings = await prisma.booking.findMany({
            where: { userId },
            include: {
                screening: {
                    include: {
                        movie: true,
                        screen: {
                            include: { cinema: true },
                        },
                    },
                },
                seats: {
                    include: {
                        screeningSeat: {
                            include: { seat: true },
                        },
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        });

        return res.status(200).json({
            success: true,
            count: bookings.length,
            data: bookings,
        });
    } catch (error) {
        console.error("Get bookings error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to fetch bookings.",
        });
    }
}

// PATCH /api/bookings/:id/cancel
export async function cancelBooking(req: Request, res: Response) {
    try {
        const userId = getUserId(req);
        const bookingId = req.params.id;

        if (typeof bookingId !== "string") {
            return res.status(400).json({
                success: false,
                message: "Invalid booking ID.",
            });
        }

        const result = await prisma.$transaction(async (tx) => {
            // Lock booking to prevent simultaneous cancellation/confirmation.
            const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id
        FROM "Booking"
        WHERE id = ${bookingId}
          AND "userId" = ${userId}
        FOR UPDATE
      `;

            if (locked.length === 0) {
                throw new Error("BOOKING_NOT_FOUND");
            }

            const booking = await tx.booking.findUnique({
                where: { id: bookingId },
                include: {
                    screening: {
                        select: { startTime: true },
                    },
                    seats: {
                        where: { releasedAt: null },
                        select: { screeningSeatId: true },
                    },
                },
            });

            if (!booking) {
                throw new Error("BOOKING_NOT_FOUND");
            }

            if (booking.status !== "CONFIRMED") {
                throw new Error("BOOKING_NOT_ACTIVE");
            }

            if (booking.screening.startTime <= new Date()) {
                throw new Error("CANCELLATION_CLOSED");
            }

            const screeningSeatIds = booking.seats.map(
                (seat) => seat.screeningSeatId
            );

            if (screeningSeatIds.length > 0) {
                // Lock inventory rows before releasing them.
                await tx.$queryRaw`
          SELECT id
          FROM "ScreeningSeat"
          WHERE id IN (${Prisma.join(screeningSeatIds)})
          ORDER BY id
          FOR UPDATE
        `;

                await tx.screeningSeat.updateMany({
                    where: {
                        id: { in: screeningSeatIds },
                        status: "BOOKED",
                    },
                    data: {
                        status: "AVAILABLE",
                        heldById: null,
                        holdExpiresAt: null,
                    },
                });

                // Preserve booking history; mark the seat associations released.
                await tx.bookingSeat.updateMany({
                    where: {
                        bookingId,
                        releasedAt: null,
                    },
                    data: {
                        releasedAt: new Date(),
                    },
                });
            }

            return tx.booking.update({
                where: { id: bookingId },
                data: { status: "CANCELLED" },
            });
        });

        return res.status(200).json({
            success: true,
            message: "Booking cancelled successfully. Seats are now available.",
            data: result,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "";

        if (message === "UNAUTHENTICATED") {
            return res.status(401).json({
                success: false,
                message: "Authentication required.",
            });
        }

        if (message === "BOOKING_NOT_FOUND") {
            return res.status(404).json({
                success: false,
                message: "Booking not found.",
            });
        }

        if (message === "BOOKING_NOT_ACTIVE") {
            return res.status(409).json({
                success: false,
                message: "This booking has already been cancelled.",
            });
        }

        if (message === "CANCELLATION_CLOSED") {
            return res.status(400).json({
                success: false,
                message: "Bookings cannot be cancelled after the screening has started.",
            });
        }

        console.error("Cancel booking error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to cancel booking.",
        });
    }
}
