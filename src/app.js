import express from 'express';
import compression from 'compression';
import connectDB from './configs/database.js';
import cookieParser from 'cookie-parser';
import router from './routes/index.routes.js';
import apiLogger from './utils/apiLogger.js';
import corsConfig from './utils/cors.js';
import globalErrorHandler from './utils/globalErrorHandler.js';
import http from 'http';
// import initializeSocket from './utils/socket.js';

const app = express();
const port = process.env.PORT || 8889;
const NODE_ENV = process.env.NODE_ENV || 'development';
const BASE_URL = NODE_ENV === 'production'
  ? `${process.env.BASE_URL}/api`
  : `http://localhost:${port}`;

// ✅ CORS must be FIRST middleware
app.use(corsConfig());

// ✅ Response compression middleware to reduce payload sizes
app.use(compression({
  threshold: 1024,
  level: 6,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(apiLogger);

const server = http.createServer(app);

// Ensure DB connection is established for serverless / standard requests
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});

app.use("/api", router);

app.get('/health', (req, res) => {
  return res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.all('/*splat', (req, res) => {
  return res.status(404).json({
    success: false,
    message: 'Invalid API Call!!',
  });
});

// initializeSocket(server);

app.use(globalErrorHandler);

if (!process.env.VERCEL) {
  connectDB()
    .then(async () => {
      console.log(`✔️  Database connected!! ${process.env.DATABASE_USER || ''}`);

      server.listen(port, () =>
        console.log(
          `✔️  PoultryRecord backend server is listening on ::: ${BASE_URL}`
        )
      );
    })
    .catch((err) => {
      console.error("❌ Database connection failed!!");
      console.error(err.message);
    });
}

export default app;

