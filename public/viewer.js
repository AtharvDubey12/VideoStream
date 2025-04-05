const socket = io({
  transports: ["websocket"]
});

const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');

const camVideo = document.getElementById('camVideo');
const screenVideo = document.getElementById('screenVideo');

const peer = new RTCPeerConnection({
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ]
});

const camStream = new MediaStream();
const screenStream = new MediaStream();

let videoCount = 0;

const remoteStream = new MediaStream();
const videoElement = document.getElementById("screenVideo");

peer.ontrack = (event) => {
  console.log("Received track:", event.track.kind, "label:", event.track.label);

  remoteStream.addTrack(event.track);
  videoElement.srcObject = remoteStream;

  // Force play if autoplay fails
  videoElement.onloadedmetadata = () => {
    videoElement.play().catch((err) => {
      console.error("Autoplay failed:", err);
    });
  };
};


let hostId;

peer.onicecandidate = e => {
  if (e.candidate) {
    socket.emit('ice-candidate', { to: hostId, candidate: e.candidate });
  }
};

socket.emit('join-room', roomId);

socket.on('offer', async (data) => {
  hostId = data.from;
  await peer.setRemoteDescription(new RTCSessionDescription(data.sdp));
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  socket.emit('answer', { to: hostId, sdp: answer });
});

socket.on('ice-candidate', (data) => {
  peer.addIceCandidate(new RTCIceCandidate(data.candidate));
});
