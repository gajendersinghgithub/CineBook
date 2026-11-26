import express from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./modules/auth/auth.routes";
import catalogRoutes from "./modules/catalog/catalog.routes";
import bookingRoutes from "./modules/bookings/bookings.routes";
import adminRoutes from "./modules/admin/admin.routes";

const app = express();

app.use(helmet());

app.use(
    cors({
        origin: process.env.CLIENT_URL || "http://localhost:5173",
        credentials: true,
    })
);

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
    res.status(200).json({
        success: true,
        message: "CineBook API is running",
        timestamp: new Date().toISOString(),
    });
});

app.use("/api/auth", authRoutes);
app.use("/api", catalogRoutes);
app.use("/api", bookingRoutes);
app.use("/api/admin", adminRoutes);

export default app;