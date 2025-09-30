import express from 'express';
import connectDB from './configs/database.js';
import cookieParser from 'cookie-parser';
import router from './routes/index.routes.js';
import apiLogger from './utils/apiLogger.js';
import cors from 'cors';
import globalErrorHandler from './utils/globalErrorHandler.js';
import http from 'http';
// import initializeSocket from './utils/socket.js';

const app = express();
const port = process.env.PORT || 8889;
const NODE_ENV = process.env.NODE_ENV || 'development';
const BASE_URL = NODE_ENV === 'production'
  ? 'https://poultry-record-backend.vercel.app/api'
  : `http://localhost:${port}`;

app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174', 
    'https://poultry-record-frontend.vercel.app'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', "PATCH"],
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());
app.use(apiLogger);

const server = http.createServer(app);

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

connectDB()
  .then(() => {
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
