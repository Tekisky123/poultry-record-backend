import cors from "cors";

const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "https://poultry-record-frontend.vercel.app",
    "https://poultry-record-frontend-qa.vercel.app",
];

export default function corsConfig() {
    return cors({
        origin: (origin, callback) => {
            // ✅ allow server-to-server & preflight
            if (!origin) return callback(null, true);

            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            return callback(
                new Error(`CORS blocked for origin: ${origin}`)
            );
        },
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
        credentials: true,
    });
}
