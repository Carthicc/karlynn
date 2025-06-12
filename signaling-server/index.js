const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // In development only, allow all
    methods: ["GET", "POST"],
  },
});

// WebSocket handlers
io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    socket.to(roomId).emit("user-joined", socket.id);
  });

  socket.on("signal", ({ roomId, signalData }) => {
    socket.to(roomId).emit("signal", { signalData, sender: socket.id });
  });

  socket.on("play", (roomId) => {
    socket.to(roomId).emit("play");
  });

  socket.on("pause", (roomId) => {
    socket.to(roomId).emit("pause");
  });

  socket.on("sync", ({ roomId, currentTime }) => {
    socket.to(roomId).emit("sync", currentTime);
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// 🚀 KEEP SERVER RUNNING
server.listen(3001, () => {
  console.log("🚀 Signaling server running on http://localhost:3001");
});
