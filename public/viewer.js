const socket = io({
  transports: ["websocket"]
});

const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');

const camVideo = document.getElementById('camVideo');
const screenVideo = document.getElementById('screenVideo');

// Make sure these attributes exist in HTML
// <video id="camVideo" autoplay playsinline muted></video>
// <video id="screenVideo" autoplay playsinline></video>

const peer = new RTCPeerConnection({
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { 
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ]
});

const camStream = new MediaStream();
const screenStream = new MediaStream();

let videoCount = 0;
let hostId;

// Display connection status
const statusElement = document.createElement('div');
statusElement.id = 'connectionStatus';
statusElement.style.padding = '10px';
statusElement.style.backgroundColor = '#f0f0f0';
statusElement.style.margin = '10px 0';
statusElement.textContent = 'Connecting...';
document.body.insertBefore(statusElement, document.body.firstChild);

function updateStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.style.backgroundColor = isError ? '#ffdddd' : '#f0f0f0';
}

// Connection state monitoring
peer.onconnectionstatechange = () => {
  console.log("Connection state:", peer.connectionState);
  updateStatus(`Connection: ${peer.connectionState}`);
  
  if (peer.connectionState === 'connected') {
    updateStatus('Connected to host!');
  } else if (peer.connectionState === 'disconnected' || peer.connectionState === 'failed') {
    updateStatus('Connection lost with host. Trying to reconnect...', true);
  }
};

// ICE connection monitoring
peer.oniceconnectionstatechange = () => {
  console.log("ICE connection state:", peer.iceConnectionState);
  if (peer.iceConnectionState === 'failed') {
    updateStatus('Network connection failed. Please check your connection.', true);
  }
};

// Handle tracks received from host
peer.ontrack = (event) => {
  const track = event.track;
  console.log("Received track:", track.kind, "label:", track.label);
  
  try {
    if (track.kind === 'video') {
      videoCount++;
      if (videoCount === 1) {
        // First video track - assume it's the camera
        camStream.addTrack(track);
        camVideo.srcObject = camStream;
        
        // Force play attempt
        camVideo.play().catch(err => {
          console.error("Could not play camera video:", err);
          updateStatus('Could not play camera video. Click on the page to enable.', true);
        });
        
        updateStatus('Camera stream connected!');
      } else if (videoCount === 2) {
        // Second video track - assume it's the screen
        screenStream.addTrack(track);
        screenVideo.srcObject = screenStream;
        
        // Force play attempt
        screenVideo.play().catch(err => {
          console.error("Could not play screen video:", err);
          updateStatus('Could not play screen video. Click on the page to enable.', true);
        });
        
        updateStatus('Both camera and screen streams connected!');
      }
    } else if (track.kind === 'audio') {
      // Add audio to the camera stream
      camStream.addTrack(track);
      camVideo.srcObject = camStream;
    }
    
    // Monitor track status
    track.onended = () => {
      console.log(`Track ended: ${track.kind} (${track.label})`);
      updateStatus(`A ${track.kind} stream has ended`, true);
    };
    
    track.onmute = () => {
      console.log(`Track muted: ${track.kind} (${track.label})`);
    };
    
    track.onunmute = () => {
      console.log(`Track unmuted: ${track.kind} (${track.label})`);
    };
  } catch (error) {
    console.error("Error handling track:", error);
  }
};

// Handle ICE candidates
peer.onicecandidate = e => {
  if (e.candidate) {
    console.log("Sending ICE candidate to host");
    socket.emit('ice-candidate', { to: hostId, candidate: e.candidate });
  }
};

// Join room
socket.on('connect', () => {
  console.log("Socket connected with ID:", socket.id);
  socket.emit('join-room', roomId);
  console.log("Joining room:", roomId);
  updateStatus(`Joining room: ${roomId}`);
});

socket.on('disconnect', () => {
  console.log("Socket disconnected");
  updateStatus('Connection to server lost. Please refresh the page.', true);
});

// Handle offer from host
socket.on('offer', async (data) => {
  try {
    hostId = data.from;
    console.log("Received offer from host:", hostId);
    updateStatus('Received connection offer from host');
    
    await peer.setRemoteDescription(new RTCSessionDescription(data.sdp));
    console.log("Set remote description from offer");
    
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    console.log("Created and set answer");
    
    socket.emit('answer', { to: hostId, sdp: answer });
    console.log("Sent answer to host");
    updateStatus('Connecting to streams...');
  } catch (error) {
    console.error("Error handling offer:", error);
    updateStatus('Failed to connect: ' + error.message, true);
  }
});

// Handle ICE candidates from host
socket.on('ice-candidate', async (data) => {
  try {
    console.log("Received ICE candidate from host");
    await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
  } catch (error) {
    console.error("Error adding ICE candidate:", error);
  }
});

// Periodic track status check
setInterval(() => {
  if (camVideo.srcObject) {
    const tracks = camVideo.srcObject.getTracks();
    tracks.forEach(track => {
      console.log(`Camera Track ${track.id} (${track.kind}): readyState=${track.readyState}, enabled=${track.enabled}`);
    });
  }
  
  if (screenVideo.srcObject) {
    const tracks = screenVideo.srcObject.getTracks();
    tracks.forEach(track => {
      console.log(`Screen Track ${track.id} (${track.kind}): readyState=${track.readyState}, enabled=${track.enabled}`);
    });
  }
}, 10000);

// Add click handler to help with autoplay issues
document.addEventListener('click', () => {
  if (camVideo.paused && camVideo.srcObject) {
    camVideo.play().catch(e => console.error("Could not play camera video:", e));
  }
  
  if (screenVideo.paused && screenVideo.srcObject) {
    screenVideo.play().catch(e => console.error("Could not play screen video:", e));
  }
});

// Update HTML for viewer
document.title = `Viewing: ${roomId}`;
