const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

const rooms = {};

io.on('connection', socket => {
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    const clients = io.sockets.adapter.rooms.get(roomId);
    if (clients.size > 1) {
      socket.to(roomId).emit('viewer-joined', socket.id);
    }

    socket.on('offer', (data) => {
      socket.to(data.to).emit('offer', {
        from: socket.id,
        sdp: data.sdp
      });
    });

    socket.on('answer', (data) => {
      socket.to(data.to).emit('answer', {
        from: socket.id,
        sdp: data.sdp
      });
    });

    socket.on('ice-candidate', (data) => {
      socket.to(data.to).emit('ice-candidate', {
        from: socket.id,
        candidate: data.candidate
      });
    });
  });
});

server.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
