import cors from 'cors';

export default function corsConfig() {
    return cors({
        origin: "*",
        // credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', "PATCH",],
    });
}