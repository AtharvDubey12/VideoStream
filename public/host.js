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
      video: true, 
      audio: true 
    });
    
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ 
      video: true
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
      
      // Create peer connection with multiple TURN servers
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
      
      // Monitor connection state
      peer.onconnectionstatechange = () => {
        console.log(`Connection state with ${viewerId}:`, peer.connectionState);
      };
      
      // Monitor ICE state
      peer.oniceconnectionstatechange = () => {
        console.log(`ICE connection state with ${viewerId}:`, peer.iceConnectionState);
        if (peer.iceConnectionState === 'failed') {
          console.log("Attempting ICE restart with viewer:", viewerId);
          peer.restartIce();
        }
      };
      
      peer.onicegatheringstatechange = () => {
        console.log(`ICE gathering state with ${viewerId}:`, peer.iceGatheringState);
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
      
      // Wait for ICE gathering to complete before sending offer
      let hasCreatedOffer = false;
      
      const checkAndSendOffer = async () => {
        if (peer.iceGatheringState === 'complete' && !hasCreatedOffer) {
          hasCreatedOffer = true;
          try {
            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);
            console.log("Sending offer to viewer:", viewerId);
            socket.emit('offer', { to: viewerId, sdp: peer.localDescription });
            
            // Store peer
            peers[viewerId] = peer;
          } catch (error) {
            console.error("Error creating/sending offer:", error);
          }
        }
      };
      
      peer.onicegatheringstatechange = () => {
        console.log(`ICE gathering state with ${viewerId}:`, peer.iceGatheringState);
        checkAndSendOffer();
      };
      
      // Also create offer after a short delay to ensure we don't wait forever
      setTimeout(async () => {
        if (!hasCreatedOffer) {
          hasCreatedOffer = true;
          try {
            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);
            console.log("Sending offer to viewer (timeout):", viewerId);
            socket.emit('offer', { to: viewerId, sdp: peer.localDescription });
            
            // Store peer
            peers[viewerId] = peer;
          } catch (error) {
            console.error("Error creating/sending offer (timeout):", error);
          }
        }
      }, 3000);
    });
    
    // Handle answer from viewer
    socket.on('answer', async (data) => {
      try {
        console.log("Received answer from viewer:", data.from);
        if (!peers[data.from]) {
          console.error("No peer for viewer:", data.from);
          return;
        }
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
          peers[data.from].addIceCandidate(new RTCIceCandidate(data.candidate))
            .catch(err => console.error("Error adding ICE candidate:", err));
        }
      } catch (error) {
        console.error("Error handling ICE candidate:", error);
      }
    });
    
    // Handle socket disconnection
    socket.on('disconnect', () => {
      console.log("Socket disconnected");
    });
  } catch (error) {
    console.error("Error starting stream:", error);
    alert("Failed to access camera or screen: " + error.message);
  }
}

start();
