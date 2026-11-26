
import { Router } from "express";
import { authenticate, authorizeAdmin } from "../../middleware/auth.middleware";
import {
    createMovie,
    updateMovie,
    deleteMovie,
    createCinema,
    createScreen,
    createScreening,
} from "./admin.controller";
import { seedDemoData } from "./admin.seed.controller";

const router = Router();

router.use(authenticate, authorizeAdmin);

router.post("/movies", createMovie);
router.patch("/movies/:id", updateMovie);
router.delete("/movies/:id", deleteMovie);

router.post("/cinemas", createCinema);
router.post("/screens", createScreen);
router.post("/screenings", createScreening);

router.post("/seed-demo", seedDemoData);

export default router;
