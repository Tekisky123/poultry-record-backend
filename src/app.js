import cors from 'cors';
import express from 'express';
import connectDB from './configs/database.js';
import cookieParser from 'cookie-parser';
import router from './routes/index.routes.js';
import apiLogger from './utils/apiLogger.js';
//import corsConfig from './utils/cors.js';
import globalErrorHandler from './utils/globalErrorHandler.js';
import http from 'http';

// import initializeSocket from './utils/socket.js';

const app = express();
const port = process.env.PORT || 8889;
const NODE_ENV = process.env.NODE_ENV || 'development';
const BASE_URL = NODE_ENV === 'production'
  ? 'https://poultry-record-backend-qa.vercel.app/api'
  : `http://localhost:${port}`;

// app.use(corsConfig());
app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    "https://poultry-record-frontend.vercel.app",
    "https://poultry-record-frontend-qa.vercel.app",
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// VERY IMPORTANT for preflight

// Remove explicit options handler that might conflict with global cors
// app.options("*", cors()); // Global cors middleware handles this

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(apiLogger);

// const server = http.createServer(app);

app.use("/api", router);

app.get('/health', (req, res) => {
  return res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: 'Invalid API Call!!',
  });
});

// initializeSocket(server);

app.use(globalErrorHandler);

connectDB()
  .then(async () => {
    console.log(`✔️  Database connected!! ${process.env.DATABASE_USER || ''}`);

    // Only listen if not in production (Vercel/Serverless likely handles the server)
    // Or strictly if we are running locally.
    if (process.env.NODE_ENV !== 'production') {
      app.listen(port, () =>
        console.log(
          `✔️  PoultryRecord backend server is listening on ::: ${BASE_URL}`
        )
      );
    }
  })
  .catch((err) => {
    console.error("❌ Database connection failed!!");
    console.error(err.message);
  });


export default app;
