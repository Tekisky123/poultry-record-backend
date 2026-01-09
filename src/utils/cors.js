import cors from "cors";

const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:4173", // Vite preview
    "http://127.0.0.1:5173",
    "https://poultry-record-frontend-qa.vercel.app",
];

export default function corsConfig() {
    return cors({
        origin: (origin, callback) => {
            // ✅ allow server-to-server & preflight
            if (!origin) return callback(null, true);

            console.log(`[CORS] Incoming Origin: ${origin}`); // Debug log

            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            console.error(`[CORS] Blocked Origin: ${origin}`);
            return callback(
                new Error(`CORS blocked for origin: ${origin}`)
            );
        },
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
        credentials: true,
    });
}
