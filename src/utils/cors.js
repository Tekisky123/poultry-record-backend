import cors from 'cors';

export default function corsConfig() {
  return cors({
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'https://poultry-record-frontend.vercel.app',
      'https://poultry-record-frontend.vercel.app/',  
      'http://localhost:6060',
      'https://poultry-record-backend.vercel.app',
      'https://poultry-record-backend.vercel.app/api',
      'http://localhost:8889/api',
    ],
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', "PATCH", "OPTIONS"],
  });
}