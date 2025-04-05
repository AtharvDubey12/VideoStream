const socket = io({
  transports: ["websocket"]
});

const roomId = Math.random().toString(36).substring(2, 8);
const peers = {};

document.getElementById('shareLink').innerText =
  `Share this link: http://localhost:3000/viewer.html?room=${roomId}`;

async function start() {
  const camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });

  const localVideo = document.getElementById('localVideo');
  localVideo.srcObject = camStream;

  socket.emit('join-room', roomId);

  socket.on('viewer-joined', async (viewerId) => {
    const peer = new RTCPeerConnection();

    [...camStream.getTracks(), ...screenStream.getTracks()].forEach(track => {
      peer.addTrack(track);
    });

    peer.onicecandidate = e => {
      if (e.candidate) {
        socket.emit('ice-candidate', { to: viewerId, candidate: e.candidate });
      }
    };

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    socket.emit('offer', { to: viewerId, sdp: offer });

    peers[viewerId] = peer;
  });

  socket.on('answer', async (data) => {
    await peers[data.from].setRemoteDescription(new RTCSessionDescription(data.sdp));
  });

  socket.on('ice-candidate', (data) => {
    peers[data.from]?.addIceCandidate(new RTCIceCandidate(data.candidate));
  });
}

start();
