const socket = io();
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

peer.ontrack = (event) => {
  const track = event.track;
  console.log("Received track:", track.kind, "label:", track.label);

  if (track.kind === 'video') {
    videoCount++;
    if (videoCount === 1) {
      camStream.addTrack(track);
      camVideo.srcObject = camStream;
    } else if (videoCount === 2) {
      screenStream.addTrack(track);
      screenVideo.srcObject = screenStream;
    }
  } else if (track.kind === 'audio') {
    camStream.addTrack(track);
    camVideo.srcObject = camStream;
  }
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
