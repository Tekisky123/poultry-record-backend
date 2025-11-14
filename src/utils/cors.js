import cors from 'cors';

export default function corsConfig() {
    return cors({
        origin: [
            'http://localhost:5174',
            'http://localhost:5173',
            'https://poultry-record-frontend.vercel.app',
        ],
        credentials: true,
    });
}