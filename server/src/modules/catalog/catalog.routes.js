"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catalog_controller_1 = require("./catalog.controller");
const router = (0, express_1.Router)();
router.get("/movies", catalog_controller_1.getMovies);
router.get("/movies/:id", catalog_controller_1.getMovieById);
router.get("/cinemas", catalog_controller_1.getCinemas);
router.get("/cinemas/:id", catalog_controller_1.getCinemaById);
router.get("/screenings", catalog_controller_1.getScreenings);
exports.default = router;
//# sourceMappingURL=catalog.routes.js.map