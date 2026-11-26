
import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import {
    getScreeningSeats,
    holdSeats,
    confirmBooking,
    getMyBookings,
    cancelBooking,
} from "./bookings.controller";

const router = Router();

router.get("/screenings/:id/seats", getScreeningSeats);

router.post("/bookings/hold", authenticate, holdSeats);
router.post("/bookings/confirm", authenticate, confirmBooking);

router.get("/bookings/my-bookings", authenticate, getMyBookings);
router.patch("/bookings/:id/cancel", authenticate, cancelBooking);

export default router;
