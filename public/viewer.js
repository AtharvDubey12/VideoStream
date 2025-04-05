const socket = io({
  transports: ["websocket"]
});

const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');

const camVideo = document.getElementById('camVideo');
const screenVideo = document.getElementById('screenVideo');

// Create status indicator
const statusElement = document.createElement('div');
statusElement.id = 'connectionStatus';
statusElement.style.padding = '10px';
statusElement.style.backgroundColor = '#f0f0f0';
statusElement.style.margin = '10px 0';
statusElement.style.borderRadius = '4px';
statusElement.textContent = 'Connecting...';
document.body.insertBefore(statusElement, document.body.firstChild);

function updateStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.style.backgroundColor = isError ? '#ffdddd' : '#f0f0f0';
  console.log("Status update:", message);
}

// Create a peer connection with multiple TURN servers
const peer = new RTCPeerConnection({
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:global.turn.twilio.com:3478?transport=udp',
      username: '82fb29863e0358a6add3e595be5ee7feaa7f01261ab1afebcbfb51b58c7442fb',
      credential: 'UMwZIBCGIH3VFyMUeJZMgKY4Xp7xhSLxAhSU7B48nxQ='
    },
    {
      urls: 'turn:relay.metered.ca:80',
      username: 'e60c9bca20a14a8e1eb3cf80',
      credential: 'X9GGE/wSNHLEjffa'
    },
    {
      urls: 'turn:relay.metered.ca:443',
      username: 'e60c9bca20a14a8e1eb3cf80',
      credential: 'X9GGE/wSNHLEjffa'
    }
  ],
  iceCandidatePoolSize: 10
});

const camStream = new MediaStream();
const screenStream = new MediaStream();

let videoCount = 0;
let hostId;

// Connection state monitoring
peer.onconnectionstatechange = () => {
  console.log("Connection state:", peer.connectionState);
  updateStatus(`Connection: ${peer.connectionState}`);
  
  if (peer.connectionState === 'connected') {
    updateStatus('Connected to host! Waiting for streams...');
  } else if (peer.connectionState === 'disconnected' || peer.connectionState === 'failed') {
    updateStatus('Connection lost. Try refreshing the page.', true);
  }
};

// ICE connection monitoring
peer.oniceconnectionstatechange = () => {
  console.log("ICE connection state:", peer.iceConnectionState);
  if (peer.iceConnectionState === 'failed') {
    updateStatus('Network connection failed. Please check your connection or try a different network.', true);
  }
};

// ICE gathering monitoring
peer.onicegatheringstatechange = () => {
  console.log("ICE gathering state:", peer.iceGatheringState);
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
          updateStatus('Click on the page to enable video playback', true);
        });
        
        updateStatus('Camera video connected!');
      } else if (videoCount === 2) {
        // Second video track - assume it's the screen
        screenStream.addTrack(track);
        screenVideo.srcObject = screenStream;
        
        // Force play attempt
        screenVideo.play().catch(err => {
          console.error("Could not play screen video:", err);
        });
        
        updateStatus('Both camera and screen streams connected!');
      }
    } else if (track.kind === 'audio') {
      // Add audio to the camera stream
      camStream.addTrack(track);
      camVideo.srcObject = camStream;
      updateStatus('Audio connected!');
    }
    
    // Monitor track status
    track.onended = () => {
      console.log(`Track ended: ${track.kind} (${track.label})`);
      updateStatus(`A ${track.kind} stream has ended`, true);
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

// Socket connection events
socket.on('connect', () => {
  console.log("Socket connected with ID:", socket.id);
  updateStatus("Connected to signaling server");
  
  // Join room
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
    
    console.log("Setting remote description...");
    await peer.setRemoteDescription(new RTCSessionDescription(data.sdp));
    console.log("Remote description set successfully!");
    
    console.log("Creating answer...");
    const answer = await peer.createAnswer();
    console.log("Answer created successfully!");
    
    console.log("Setting local description...");
    await peer.setLocalDescription(answer);
    console.log("Local description set successfully!");
    
    console.log("Sending answer to host...");
    socket.emit('answer', { to: hostId, sdp: answer });
    console.log("Answer sent to host!");
    
    updateStatus('Connected! Waiting for media streams...');
  } catch (error) {
    console.error("Error handling offer:", error);
    updateStatus('Failed to connect: ' + error.message, true);
    
    // Try again with a clean peer connection
    setTimeout(() => {
      location.reload();
    }, 5000);
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

// Add click handler to help with autoplay issues
document.addEventListener('click', () => {
  if (camVideo.paused && camVideo.srcObject) {
    camVideo.play().catch(e => console.error("Could not play camera video:", e));
  }
  
  if (screenVideo.paused && screenVideo.srcObject) {
    screenVideo.play().catch(e => console.error("Could not play screen video:", e));
  }
  
  updateStatus('Trying to enable video playback...');
});

// Add a trickle ICE timeout - if we don't get a connection after 20 seconds, reload
setTimeout(() => {
  if (peer.iceConnectionState !== 'connected' && peer.iceConnectionState !== 'completed') {
    console.log("Connection timeout - reloading page");
    updateStatus('Connection timeout. Reloading page...', true);
    location.reload();
  }
}, 20000);

// Update HTML for viewer
document.title = `Viewing: ${roomId}`;

// Add debugging button
const debugButton = document.createElement('button');
debugButton.textContent = 'Debug Connection';
debugButton.style.marginTop = '10px';
debugButton.style.padding = '8px 16px';
debugButton.addEventListener('click', () => {
  console.log("--- Debug Information ---");
  console.log("Socket connected:", socket.connected);
  console.log("Room ID:", roomId);
  console.log("Connection state:", peer.connectionState);
  console.log("ICE connection state:", peer.iceConnectionState);
  console.log("ICE gathering state:", peer.iceGatheringState);
  console.log("Host ID:", hostId);
  console.log("Video tracks received:", videoCount);
  
  if (camVideo.srcObject) {
    console.log("Camera tracks:", camVideo.srcObject.getTracks().length);
  }
  
  if (screenVideo.srcObject) {
    console.log("Screen tracks:", screenVideo.srcObject.getTracks().length);
  }
  
  updateStatus('Debug info printed to console. Press F12 to view.');
});
document.body.appendChild(debugButton);
