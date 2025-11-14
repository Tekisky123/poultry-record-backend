import cors from 'cors';

export default function corsConfig() {
  return cors({
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:3000',
      'http://localhost:6060',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:6060',
      'https://poultry-record-frontend.vercel.app', // ✅ No trailing slash
      // Removed invalid origins with /api paths
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'], // ✅ Added OPTIONS
    allowedHeaders: [ // ✅ Added this - CRITICAL for Authorization header
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'Access-Control-Request-Method',
      'Access-Control-Request-Headers',
    ],
    exposedHeaders: ['Set-Cookie'],
    optionsSuccessStatus: 200, // ✅ Important for some browsers
  });
}