
import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import {
    getScreeningSeats,
    holdSeats,
    confirmBooking,
    getMyBookings
} from "./bookings.controller";

const router = Router();

// Seat availability can be viewed without logging in.
router.get("/screenings/:id/seats", getScreeningSeats);

// Booking operations require authentication.
router.post("/bookings/hold", authenticate, holdSeats);
router.post("/bookings/confirm", authenticate, confirmBooking);

router.get("/bookings/my-bookings", authenticate, getMyBookings);

export default router;
