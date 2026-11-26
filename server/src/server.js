"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const app_1 = __importDefault(require("./app"));
const prisma_1 = require("./config/prisma");
const PORT = Number(process.env.PORT) || 5000;
async function startServer() {
    try {
        await prisma_1.prisma.$connect();
        const server = app_1.default.listen(PORT, () => {
            console.log(`CineBook API running on port ${PORT}`);
            console.log(`Health: http://localhost:${PORT}/api/health`);
        });
        const shutdown = async () => {
            console.log("Shutting down server...");
            server.close(async () => {
                await prisma_1.prisma.$disconnect();
                process.exit(0);
            });
        };
        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);
    }
    catch (error) {
        console.error("Failed to start server:", error);
        await prisma_1.prisma.$disconnect();
        process.exit(1);
    }
}
startServer();
//# sourceMappingURL=server.js.map