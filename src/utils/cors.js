import cors from 'cors';

const NODE_ENV = process.env.NODE_ENV || 'development';

// Define allowed origins
const allowedOrigins = [
  'http://localhost:5173', // Vite default
  'http://localhost:5174', // Vite alternate
  'http://localhost:3000', // React default
  'http://localhost:6060', // Your current setup
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:6060',
  'https://poultry-record-frontend.vercel.app',
  'https://poultry-record-backend.vercel.app',
];

export default function corsConfig() {
  return cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps, Postman, or same-origin)
      if (!origin) {
        return callback(null, true);
      }

      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        // In development, log and allow (for debugging)
        if (NODE_ENV === 'development') {
          console.warn(`⚠️  CORS: Allowing origin ${origin} in development`);
          callback(null, true);
        } else {
          // In production, reject unknown origins
          console.error(`❌ CORS: Blocked origin ${origin}`);
          callback(new Error('Not allowed by CORS'));
        }
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'Access-Control-Request-Method',
      'Access-Control-Request-Headers',
    ],
    exposedHeaders: ['Set-Cookie'],
    optionsSuccessStatus: 200, // Some legacy browsers (IE11) choke on 204
  });
}