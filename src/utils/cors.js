import cors from 'cors';

const allowedOrigins = [
    'http://localhost:5174',
    'http://localhost:5173',
    'https://poultry-record-frontend.vercel.app',
];

export default function corsConfig() {
    return cors({
        origin: (origin, callback) => {
            if (allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        methods: ['GET', 'POST', 'PUT', 'DELETE', "PATCH", "OPTIONS"],
        credentials: true,
    });
}