"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getScreeningSeats = getScreeningSeats;
exports.holdSeats = holdSeats;
exports.confirmBooking = confirmBooking;
const express_1 = require("express");
const client_1 = require("@prisma/client");
const crypto_1 = require("crypto");
const prisma_1 = require("../../config/prisma");
const bookings_schemas_1 = require("./bookings.schemas");
function getUserId(req) {
    if (!req.auth?.userId) {
        throw new Error("UNAUTHENTICATED");
    }
    return req.auth.userId;
}
// GET /api/screenings/:id/seats
async function getScreeningSeats(req, res) {
    try {
        const screeningId = req.params.id;
        if (typeof screeningId !== "string") {
            return res.status(400).json({ success: false, message: "Invalid screening ID." });
        }
        const screening = await prisma_1.prisma.screening.findUnique({
            where: { id: screeningId },
            select: { id: true },
        });
        if (!screening) {
            return res.status(404).json({ success: false, message: "Screening not found." });
        }
        const seats = await prisma_1.prisma.$transaction(async (tx) => {
            // Use PostgreSQL time as the source of truth for hold expiry.
            await tx.$executeRaw `
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
    }
    catch (error) {
        console.error("Get screening seats error:", error);
        return res.status(500).json({ success: false, message: "Unable to fetch seats." });
    }
}
// POST /api/bookings/hold
async function holdSeats(req, res) {
    try {
        const userId = getUserId(req);
        const parsed = bookings_schemas_1.holdSeatsSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: "Invalid request.",
                errors: parsed.error.flatten(),
            });
        }
        const { screeningId, screeningSeatIds } = parsed.data;
        const result = await prisma_1.prisma.$transaction(async (tx) => {
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
            const lockedSeats = await tx.$queryRaw `
        SELECT
          id,
          status::text AS status,
          "heldById",
          "holdExpiresAt",
          NOW() AS "dbNow"
        FROM "ScreeningSeat"
        WHERE "screeningId" = ${screeningId}
          AND id IN (${client_1.Prisma.join(screeningSeatIds)})
        ORDER BY id
        FOR UPDATE
      `;
            if (lockedSeats.length !== screeningSeatIds.length) {
                throw new Error("INVALID_SEAT_SELECTION");
            }
            const now = lockedSeats[0].dbNow;
            const unavailable = lockedSeats.some((seat) => {
                if (seat.status === "AVAILABLE")
                    return false;
                if (seat.status === "HELD" &&
                    seat.holdExpiresAt &&
                    seat.holdExpiresAt <= now) {
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
            await tx.$executeRaw `
        UPDATE "ScreeningSeat"
        SET
          status = 'HELD',
          "heldById" = ${userId},
          "holdExpiresAt" = NOW() + INTERVAL '5 minutes',
          "updatedAt" = NOW()
        WHERE id IN (${client_1.Prisma.join(screeningSeatIds)})
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
    }
    catch (error) {
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
async function confirmBooking(req, res) {
    try {
        const userId = getUserId(req);
        const parsed = bookings_schemas_1.confirmBookingSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: "Invalid request.",
                errors: parsed.error.flatten(),
            });
        }
        const { screeningId, screeningSeatIds } = parsed.data;
        const booking = await prisma_1.prisma.$transaction(async (tx) => {
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
            const lockedSeats = await tx.$queryRaw `
        SELECT
          id,
          status::text AS status,
          "heldById",
          "holdExpiresAt",
          NOW() AS "dbNow"
        FROM "ScreeningSeat"
        WHERE "screeningId" = ${screeningId}
          AND id IN (${client_1.Prisma.join(screeningSeatIds)})
        ORDER BY id
        FOR UPDATE
      `;
            if (lockedSeats.length !== screeningSeatIds.length) {
                throw new Error("INVALID_SEAT_SELECTION");
            }
            const now = lockedSeats[0].dbNow;
            const validHold = lockedSeats.every((seat) => seat.status === "HELD" &&
                seat.heldById === userId &&
                seat.holdExpiresAt !== null &&
                seat.holdExpiresAt > now);
            if (!validHold) {
                throw new Error("HOLD_EXPIRED_OR_INVALID");
            }
            const createdBooking = await tx.booking.create({
                data: {
                    bookingReference: `CB-${(0, crypto_1.randomUUID)().toUpperCase()}`,
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
    }
    catch (error) {
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
//# sourceMappingURL=bookings.controller.js.map