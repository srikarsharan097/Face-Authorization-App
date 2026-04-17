// State
let currentTab = 'signup';
let modelsLoaded = false;
let isCameraRunning = false;
let isProcessing = false;

// DOM Elements
const video = document.getElementById('videoElement');
const videoPlaceholder = document.getElementById('video-placeholder');
const usernameInput = document.getElementById('username');
const actionBtn = document.getElementById('action-btn');
const btnText = document.getElementById('btn-text');
const btnLoader = document.getElementById('btn-loader');
const statusMsg = document.getElementById('status-msg');
const greetingOverlay = document.getElementById('greeting-overlay');
const greetingText = document.getElementById('greeting-text');
let cleanupCanvas = null;

// Initialize
async function init() {
    try {
        console.log("Loading models...");
        setStatus("Loading Models...", "loading");
        
        // Load face-api models securely from our local models folder
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
            faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
            faceapi.nets.faceRecognitionNet.loadFromUri('/models')
        ]);
        
        modelsLoaded = true;
        console.log("Models loaded successfully");
        setStatus("Models loaded. Please start camera.", "loading");
        
        // Setup initial UI state
        updateActionBtnState();
        
        // Always try to start camera
        await startCamera();
    } catch (err) {
        console.error("Error loading models:", err);
        setStatus("Failed to load models. Check console.", "error");
    }
}

// Start camera stream
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: "user" 
            } 
        });
        video.srcObject = stream;
        
        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                video.play();
                isCameraRunning = true;
                video.classList.remove('hidden');
                videoPlaceholder.classList.add('hidden');
                
                // Create a canvas once strictly for drawing detections periodically
                if (!cleanupCanvas) {
                    cleanupCanvas = faceapi.createCanvasFromMedia(video);
                    document.getElementById('video-container').appendChild(cleanupCanvas);
                    faceapi.matchDimensions(cleanupCanvas, { width: video.videoWidth, height: video.videoHeight });
                    
                    // Simple interval to just draw box (visual feedback)
                    setInterval(async () => {
                        if(isCameraRunning && !isProcessing) {
                            const detection = await faceapi.detectSingleFace(video);
                            cleanupCanvas.getContext('2d').clearRect(0, 0, cleanupCanvas.width, cleanupCanvas.height);
                            if(detection) {
                                const resized = faceapi.resizeResults(detection, { width: video.videoWidth, height: video.videoHeight });
                                faceapi.draw.drawDetections(cleanupCanvas, resized);
                            }
                        }
                    }, 200);
                }
                
                setStatus("Camera active. Ready.", "success");
                updateActionBtnState();
                resolve();
            };
        });
    } catch (err) {
        console.error("Camera access denied or error:", err);
        setStatus("Camera access denied. Please allow camera.", "error");
    }
}

// Set status message
function setStatus(msg, type) {
    statusMsg.textContent = msg;
    statusMsg.className = `status ${type}`;
}

// Update Action Button State
function updateActionBtnState() {
    if (!modelsLoaded || !isCameraRunning) {
        actionBtn.disabled = true;
        btnText.textContent = "Initializing...";
        return;
    }
    
    actionBtn.disabled = false;
    btnText.textContent = currentTab === 'signup' ? "Sign Up & Register Face" : "Verify & Login";
}

// Tab Switching logic
window.switchTab = function(tab) {
    if (tab === currentTab || isProcessing) return;
    
    document.getElementById(`tab-${currentTab}`).classList.remove('active');
    document.getElementById(`tab-${tab}`).classList.add('active');
    
    currentTab = tab;
    // reset fields
    usernameInput.value = "";
    greetingOverlay.classList.remove('active');
    setStatus("Ready.", "success");
    updateActionBtnState();
}

const setLoading = (loading) => {
    isProcessing = loading;
    actionBtn.disabled = loading;
    if (loading) {
        btnText.classList.add('hidden');
        btnLoader.classList.remove('hidden');
    } else {
        btnText.classList.remove('hidden');
        btnLoader.classList.add('hidden');
    }
}

// Form Submission / Handling
window.handleAction = async function() {
    const username = usernameInput.value.trim();
    
    if (!username) {
        setStatus("Please enter a username.", "error");
        return;
    }
    
    setLoading(true);
    setStatus("Detecting face features... Please look at the camera.", "loading");

    try {
        // Detect single face with landmarks and descriptor
        const detection = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor();

        if (!detection) {
            setStatus("No face detected! Please ensure your face is clearly visible.", "error");
            setLoading(false);
            return;
        }

        const descriptor = Array.from(detection.descriptor); // Convert Float32Array to standard Array for JSON serialization

        if (currentTab === 'signup') {
            // -- SIGNUP LOGIC --
            // Check if user already exists
            if (localStorage.getItem(`faceauth_${username}`)) {
                setStatus("Username already exists. Please choose a different one or login.", "error");
            } else {
                // Save it
                localStorage.setItem(`faceauth_${username}`, JSON.stringify(descriptor));
                setStatus("Successfully signed up! You can now login.", "success");
                usernameInput.value = "";
                // Automatically switch to login
                setTimeout(() => switchTab('login'), 1500);
            }
        } else {
            // -- LOGIN LOGIC --
            // Get stored descriptor
            const storedData = localStorage.getItem(`faceauth_${username}`);
            
            if (!storedData) {
                setStatus("Username not found. Please sign up first.", "error");
            } else {
                const storedDescriptor = new Float32Array(JSON.parse(storedData));
                
                // Calculate Euclidean distance
                const distance = faceapi.euclideanDistance(detection.descriptor, storedDescriptor);
                
                // Typical threshold is 0.6. Less than 0.6 means it's a match.
                if (distance < 0.6) {
                    setStatus("Verified successfully!", "success");
                    showGreeting(username);
                } else {
                    setStatus(`Face mismatch! Verification failed. (Distance: ${distance.toFixed(2)})`, "error");
                }
            }
        }
    } catch (err) {
        console.error("Action error:", err);
        setStatus("An error occurred during facial processing.", "error");
    } finally {
        setLoading(false);
    }
}

function showGreeting(username) {
    greetingText.textContent = `Hey, ${username}!`;
    greetingOverlay.classList.add('active');
    // Hide rectangle if needed
    if(cleanupCanvas) {
        cleanupCanvas.getContext('2d').clearRect(0, 0, cleanupCanvas.width, cleanupCanvas.height);
    }
}

window.resetGreeting = function() {
    greetingOverlay.classList.remove('active');
    usernameInput.value = "";
}

// Start when document is ready
document.addEventListener('DOMContentLoaded', init);
