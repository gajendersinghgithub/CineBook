
import { Router } from "express";
import {
    getMovies,
    getMovieById,
    getCinemas,
    getCinemaById,
    getScreenings,
} from "./catalog.controller";

const router = Router();

router.get("/movies", getMovies);
router.get("/movies/:id", getMovieById);

router.get("/cinemas", getCinemas);
router.get("/cinemas/:id", getCinemaById);

router.get("/screenings", getScreenings);

export default router;
