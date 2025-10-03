// Audio elements and controls
const audioElement = document.getElementById('audio-element');
const audioFileInput = document.getElementById('audio-file');
const fileNameDisplay = document.getElementById('file-name');
const playBtn = document.getElementById('play-btn');
const pauseBtn = document.getElementById('pause-btn');
const stopBtn = document.getElementById('stop-btn');
const speedControl = document.getElementById('speed-control');
const speedValue = document.getElementById('speed-value');
const levelsInput = document.getElementById('levels-input');
const currentLevelDisplay = document.getElementById('current-level');
const levelsLegend = document.getElementById('levels-legend');
const progressFill = document.getElementById('progress-fill');
const progressBar = document.getElementById('progress-bar');
const timeDisplay = document.getElementById('time-display');

// Canvas
const canvas = document.getElementById('visualization-canvas');
const ctx = canvas.getContext('2d');

// Audio context and analyzer
let audioContext;
let analyser;
let dataArray;
let source;
let isPlaying = false;
let animationId;

// Visualization data
const volumeHistory = [];
const maxHistoryPoints = 500;
let numLevels = 5;
let volumeMin = Infinity;
let volumeMax = -Infinity;

// Cute color palette
const cuteColors = [
    '#FFB6C1', '#FFD4A3', '#FFFACD', '#B4E7CE', '#A7D8FF',
    '#DDA0DD', '#FFB3E6', '#C7CEEA', '#FFDAB9', '#E0BBE4'
];

// Initialize canvas size
function resizeCanvas() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// File upload handler
audioFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        audioElement.src = url;
        fileNameDisplay.textContent = file.name;
        playBtn.disabled = false;
        pauseBtn.disabled = false;
        stopBtn.disabled = false;
        volumeHistory.length = 0;
        volumeMin = Infinity;
        volumeMax = -Infinity;
        initAudioContext();
    }
});

// Initialize Web Audio API
function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        source = audioContext.createMediaElementSource(audioElement);
        source.connect(analyser);
        analyser.connect(audioContext.destination);
    }
}

// Get current volume level
function getVolume() {
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
    }
    const average = sum / dataArray.length;
    if (average > 0) {
        volumeMin = Math.min(volumeMin, average);
        volumeMax = Math.max(volumeMax, average);
    }
    return average;
}

// Map volume to level
function volumeToLevel(volume) {
    if (!isFinite(volumeMax) || !isFinite(volumeMin) || volumeMax === volumeMin) return 1;
    const range = volumeMax - volumeMin;
    const normalized = (volume - volumeMin) / range;
    const level = Math.ceil(normalized * numLevels);
    return Math.max(1, Math.min(numLevels, level || 1));
}

// Get color for level
function getColorForLevel(level) {
    return cuteColors[(level - 1) % cuteColors.length];
}

// Update levels legend
function updateLegend() {
    numLevels = parseInt(levelsInput.value);
    levelsLegend.innerHTML = '';
    for (let i = numLevels; i >= 1; i--) {
        const levelItem = document.createElement('div');
        levelItem.className = 'legend-item';
        levelItem.style.backgroundColor = getColorForLevel(i);
        levelItem.textContent = `Level ${i}`;
        levelsLegend.appendChild(levelItem);
    }
}

// Visualization loop
function visualize() {
    if (!isPlaying) return;
    const volume = getVolume();
    const level = volumeToLevel(volume);
    volumeHistory.push({ volume, level });
    if (volumeHistory.length > maxHistoryPoints) {
        volumeHistory.shift();
    }
    currentLevelDisplay.textContent = `Level: ${level}`;
    currentLevelDisplay.style.backgroundColor = getColorForLevel(level);
    drawVisualization();
    animationId = requestAnimationFrame(visualize);
}

// Draw the moving line visualization
function drawVisualization() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (volumeHistory.length === 0) return;
    const pointWidth = canvas.width / maxHistoryPoints;
    const levelHeight = canvas.height / numLevels;

    // Draw level background zones
    for (let i = 0; i < numLevels; i++) {
        ctx.fillStyle = getColorForLevel(i + 1) + '20';
        ctx.fillRect(0, canvas.height - (i + 1) * levelHeight, canvas.width, levelHeight);
    }

    // Draw the volume line
    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    for (let i = 0; i < volumeHistory.length; i++) {
        const x = i * pointWidth;
        const level = volumeHistory[i].level;
        const y = canvas.height - (level * levelHeight) + (levelHeight / 2);
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }

    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    for (let i = 0; i < volumeHistory.length; i++) {
        const level = volumeHistory[i].level;
        const color = getColorForLevel(level);
        const position = Math.max(0, Math.min(1, i / volumeHistory.length));
        gradient.addColorStop(position, color);
    }
    ctx.strokeStyle = gradient;
    ctx.stroke();

    // Fill area under line
    if (volumeHistory.length > 0) {
        ctx.lineTo((volumeHistory.length - 1) * pointWidth, canvas.height);
        ctx.lineTo(0, canvas.height);
        ctx.closePath();
        const fillGradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
        for (let i = 0; i < volumeHistory.length; i++) {
            const level = volumeHistory[i].level;
            const color = getColorForLevel(level);
            const position = Math.max(0, Math.min(1, i / volumeHistory.length));
            fillGradient.addColorStop(position, color + '40');
        }
        ctx.fillStyle = fillGradient;
        ctx.fill();
    }
}

// Playback controls
playBtn.addEventListener('click', () => {
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    audioElement.play();
    isPlaying = true;
    visualize();
});

pauseBtn.addEventListener('click', () => {
    audioElement.pause();
    isPlaying = false;
    cancelAnimationFrame(animationId);
});

stopBtn.addEventListener('click', () => {
    audioElement.pause();
    audioElement.currentTime = 0;
    isPlaying = false;
    cancelAnimationFrame(animationId);
    volumeHistory.length = 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    currentLevelDisplay.textContent = 'Level: -';
    currentLevelDisplay.style.backgroundColor = '#f0f0f0';
});

// Speed control
speedControl.addEventListener('input', (e) => {
    const speed = parseFloat(e.target.value);
    audioElement.playbackRate = speed;
    speedValue.textContent = `${speed.toFixed(2)}x`;
});

// Levels input
levelsInput.addEventListener('input', updateLegend);

// Progress bar
audioElement.addEventListener('timeupdate', () => {
    const progress = (audioElement.currentTime / audioElement.duration) * 100;
    progressFill.style.width = `${progress}%`;
    const currentMin = Math.floor(audioElement.currentTime / 60);
    const currentSec = Math.floor(audioElement.currentTime % 60);
    const durationMin = Math.floor(audioElement.duration / 60);
    const durationSec = Math.floor(audioElement.duration % 60);
    timeDisplay.textContent = `${currentMin}:${currentSec.toString().padStart(2, '0')} / ${durationMin}:${durationSec.toString().padStart(2, '0')}`;
});

// Seek functionality
progressBar.addEventListener('click', (e) => {
    const rect = progressBar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    audioElement.currentTime = percentage * audioElement.duration;
});

updateLegend();
