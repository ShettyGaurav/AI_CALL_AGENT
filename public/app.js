const socket = io();
let peerConnection;
let localStream;
const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

const startCallButton = document.getElementById('startCall');
const joinCallButton = document.getElementById('joinCall');
const roomIdInput = document.getElementById('roomId');
const statusDiv = document.getElementById('status');

// Add new elements for displaying transcribed text
const localTranscriptionDiv = document.createElement('div');
localTranscriptionDiv.id = 'localTranscription';
document.body.appendChild(localTranscriptionDiv);

const remoteTranscriptionDiv = document.createElement('div');
remoteTranscriptionDiv.id = 'remoteTranscription';
document.body.appendChild(remoteTranscriptionDiv);

startCallButton.addEventListener('click', startCall);
joinCallButton.addEventListener('click', joinCall);

async function startCall() {
  const roomId = Math.random().toString(36).substring(7);
  roomIdInput.value = roomId;
  await initializeCall();
  socket.emit('join-room', roomId);
  statusDiv.textContent = `Started call. Room ID: ${roomId}`;
}

async function joinCall() {
  const roomId = roomIdInput.value;
  if (!roomId) {
    alert('Please enter a Room ID');
    return;
  }
  await initializeCall();
  socket.emit('join-room', roomId);
  statusDiv.textContent = `Joined call. Room ID: ${roomId}`;
}

async function initializeCall() {
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  peerConnection = new RTCPeerConnection(configuration);

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  // Start speech recognition for local audio
  startSpeechRecognition(localStream, localTranscriptionDiv);

  peerConnection.ontrack = (event) => {
    const remoteAudio = new Audio();
    remoteAudio.srcObject = event.streams[0];
    remoteAudio.play();

    // Start speech recognition for the remote audio
    startSpeechRecognition(event.streams[0], remoteTranscriptionDiv);
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', event.candidate, roomIdInput.value);
    }
  };

  socket.on('user-connected', async () => {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', offer, roomIdInput.value);
  });

  socket.on('offer', async (offer) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', answer, roomIdInput.value);
  });

  socket.on('answer', async (answer) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  });

  socket.on('ice-candidate', async (candidate) => {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  });
}

function startSpeechRecognition(stream, transcriptionDiv) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.error('Speech recognition not supported in this browser');
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US'; // Set the language for speech recognition

  // Create a new audio context and connect the stream
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(1024, 1, 1);

  source.connect(processor);
  processor.connect(audioContext.destination);

  processor.onaudioprocess = (e) => {
    // This is needed to keep the audio context alive
  };

  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    transcriptionDiv.innerHTML = finalTranscript + '<i style="color: #999;">' + interimTranscript + '</i>';
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error', event.error);
  };

  recognition.start();
}