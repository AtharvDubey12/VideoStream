const socket = io({
  transports: ["websocket"]
});

const roomId = Math.random().toString(36).substring(2, 8);
const peers = {};

document.getElementById('shareLink').innerText = 
  `Share this link: https://videostream-n8t1.onrender.com/viewer.html?room=${roomId}`;

async function start() {
  try {
    // Get media streams with specific constraints
    const camStream = await navigator.mediaDevices.getUserMedia({ 
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { max: 30 }
      }, 
      audio: true 
    });
    
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ 
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { max: 15 } // Lower for screen share
      }
    });
    
    // Display local video
    const localVideo = document.getElementById('localVideo');
    localVideo.srcObject = camStream;
    
    // Join room
    socket.emit('join-room', roomId);
    console.log("Created room:", roomId);
    
    // Handle viewer joining
    socket.on('viewer-joined', async (viewerId) => {
      console.log("Viewer joined:", viewerId);
      
      // Create peer connection with better ICE servers
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
      
      // Monitor connection state
      peer.onconnectionstatechange = () => {
        console.log(`Connection state with ${viewerId}:`, peer.connectionState);
        if (peer.connectionState === 'disconnected' || peer.connectionState === 'failed') {
          console.log("Connection lost with viewer:", viewerId);
        }
      };
      
      // Monitor ICE state
      peer.oniceconnectionstatechange = () => {
        console.log(`ICE connection state with ${viewerId}:`, peer.iceConnectionState);
        if (peer.iceConnectionState === 'failed') {
          console.log("Attempting ICE restart with viewer:", viewerId);
          peer.restartIce();
        }
      };
      
      // Add all tracks to the peer connection
      [...camStream.getTracks(), ...screenStream.getTracks()].forEach(track => {
        console.log(`Adding track to peer: ${track.kind} (${track.label})`);
        peer.addTrack(track);
      });
      
      // Handle ICE candidates
      peer.onicecandidate = e => {
        if (e.candidate) {
          console.log("Sending ICE candidate to viewer:", viewerId);
          socket.emit('ice-candidate', { to: viewerId, candidate: e.candidate });
        }
      };
      
      // Create and send offer
      try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        console.log("Sending offer to viewer:", viewerId);
        socket.emit('offer', { to: viewerId, sdp: offer });
        
        // Store peer
        peers[viewerId] = peer;
      } catch (error) {
        console.error("Error creating/sending offer:", error);
      }
    });
    
    // Handle answer from viewer
    socket.on('answer', async (data) => {
      try {
        console.log("Received answer from viewer:", data.from);
        await peers[data.from].setRemoteDescription(new RTCSessionDescription(data.sdp));
        console.log("Set remote description for viewer:", data.from);
      } catch (error) {
        console.error("Error handling answer:", error);
      }
    });
    
    // Handle ICE candidates from viewers
    socket.on('ice-candidate', (data) => {
      try {
        console.log("Received ICE candidate from viewer:", data.from);
        if (peers[data.from]) {
          peers[data.from].addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      } catch (error) {
        console.error("Error handling ICE candidate:", error);
      }
    });
    
    // Handle socket disconnection
    socket.on('disconnect', () => {
      console.log("Socket disconnected");
    });
    
    // Handle track ending
    [...camStream.getTracks(), ...screenStream.getTracks()].forEach(track => {
      track.onended = () => {
        console.log(`Track ended: ${track.kind} (${track.label})`);
      };
    });
  } catch (error) {
    console.error("Error starting stream:", error);
    alert("Failed to access camera or screen: " + error.message);
  }
}

start();
