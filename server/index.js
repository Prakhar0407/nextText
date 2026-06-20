import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GameManager } from './gameManager.js';
import { SERVER_PORT } from '../shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || SERVER_PORT;
const isProduction = process.env.NODE_ENV === 'production';
const clientDist = path.join(__dirname, '../client/dist');

const app = express();
const httpServer = createServer(app);

const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(',').map((o) => o.trim())
  : true;

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
});

const game = new GameManager(io);

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    players: game.users.size,
    round: game.round,
    hasMatch: !!game.match,
    champion: game.champion ? game.users.get(game.champion)?.name ?? null : null,
  });
});

io.on('connection', (socket) => {
  socket.on('join', (name, callback) => {
    const result = game.join(socket, name);
    if (callback) {
      callback({
        ...result,
        state: result.success ? game.getPublicState(socket.id) : undefined,
      });
    }
  });

  socket.on('typing:update', (text) => {
    game.updateTyping(socket.id, text);
  });

  socket.on('vote', (choice, callback) => {
    const result = game.vote(socket.id, choice);
    if (callback) callback(result);
  });

  socket.on('disconnect', () => {
    game.leave(socket.id);
  });
});

if (isProduction) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`NextText server running on port ${PORT}${isProduction ? ' (production)' : ''}`);
});
