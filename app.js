// Audio elements and controls
const audioElement = document.getElementById('audio-element');
const audioFileInput = document.getElementById('audio-file');
const fileNameDisplay = document.getElementById('file-name');
const analysisStatus = document.getElementById('analysis-status');
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
let isAnalyzed = false;
let currentAudioBuffer = null;
let preAnalyzedData = []; // Store all dynamics data from pre-analysis

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

// Pre-analyze audio file
async function preAnalyzeAudio(file) {
    analysisStatus.textContent = 'Analyzing audio...';
    playBtn.disabled = true;
    pauseBtn.disabled = true;
    stopBtn.disabled = true;
    isAnalyzed = false;
    preAnalyzedData = [];

    try {
        const arrayBuffer = await file.arrayBuffer();
        const offlineContext = new OfflineAudioContext(2, 44100 * 600, 44100); // Max 10 minutes
        const audioBuffer = await offlineContext.decodeAudioData(arrayBuffer);
        currentAudioBuffer = audioBuffer;

        // Create offline analyzer
        const offlineAnalyser = offlineContext.createAnalyser();
        offlineAnalyser.fftSize = 256;
        const bufferLength = offlineAnalyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        // Create source and connect
        const offlineSource = offlineContext.createBufferSource();
        offlineSource.buffer = audioBuffer;
        offlineSource.connect(offlineAnalyser);
        offlineAnalyser.connect(offlineContext.destination);

        // Calculate sample rate - sample every 16ms (approximately 60 fps)
        const sampleInterval = 0.016;
        const totalSamples = Math.floor(audioBuffer.duration / sampleInterval);
        let tempMin = Infinity;
        let tempMax = -Infinity;
        let tempData = [];

        // Create a script processor to analyze
        const scriptProcessor = offlineContext.createScriptProcessor(2048, 2, 2);
        let sampleCount = 0;
        let lastSampleTime = 0;

        scriptProcessor.onaudioprocess = () => {
            const currentTime = offlineContext.currentTime;
            if (currentTime - lastSampleTime >= sampleInterval) {
                offlineAnalyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    sum += dataArray[i];
                }
                const average = sum / dataArray.length;
                if (average > 0) {
                    tempMin = Math.min(tempMin, average);
                    tempMax = Math.max(tempMax, average);
                }
                tempData.push({ time: currentTime, volume: average });
                lastSampleTime = currentTime;
                sampleCount++;

                // Update progress
                const progress = Math.floor((sampleCount / totalSamples) * 100);
                analysisStatus.textContent = `Analyzing: ${progress}%`;
            }
        };

        offlineAnalyser.connect(scriptProcessor);
        scriptProcessor.connect(offlineContext.destination);
        offlineSource.start(0);

        await offlineContext.startRendering();

        // Set the global min/max
        volumeMin = tempMin;
        volumeMax = tempMax;

        // Calculate levels for all data points
        preAnalyzedData = tempData.map(d => ({
            time: d.time,
            volume: d.volume,
            level: volumeToLevel(d.volume)
        }));

        // Calculate moving average (1 second window ~62 samples)
        const movingAvgWindow = 62;
        for (let i = 0; i < preAnalyzedData.length; i++) {
            const startIdx = Math.max(0, i - Math.floor(movingAvgWindow / 2));
            const endIdx = Math.min(preAnalyzedData.length, i + Math.floor(movingAvgWindow / 2) + 1);
            let sum = 0;
            for (let j = startIdx; j < endIdx; j++) {
                sum += preAnalyzedData[j].volume;
            }
            const avgVolume = sum / (endIdx - startIdx);
            preAnalyzedData[i].avgVolume = avgVolume;
            preAnalyzedData[i].avgLevel = volumeToLevel(avgVolume);
        }

        isAnalyzed = true;

        analysisStatus.textContent = 'Analysis complete! Ready to play.';
        playBtn.disabled = false;
        pauseBtn.disabled = false;
        stopBtn.disabled = false;

    } catch (error) {
        console.error('Error analyzing audio:', error);
        analysisStatus.textContent = 'Analysis failed. Using real-time mode.';
        volumeMin = Infinity;
        volumeMax = -Infinity;
        isAnalyzed = false;
        preAnalyzedData = [];
        playBtn.disabled = false;
        pauseBtn.disabled = false;
        stopBtn.disabled = false;
    }
}

// File upload handler
audioFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        audioElement.src = url;
        fileNameDisplay.textContent = file.name;
        volumeHistory.length = 0;
        initAudioContext();
        await preAnalyzeAudio(file);
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
    // Only update min/max if we haven't pre-analyzed
    if (!isAnalyzed && average > 0) {
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

    let level;

    if (isAnalyzed && preAnalyzedData.length > 0) {
        // Use pre-analyzed data synced to audio element time
        const currentTime = audioElement.currentTime;

        // Find the closest data point to current time
        let closestIndex = 0;
        let minDiff = Math.abs(preAnalyzedData[0].time - currentTime);

        for (let i = 1; i < preAnalyzedData.length; i++) {
            const diff = Math.abs(preAnalyzedData[i].time - currentTime);
            if (diff < minDiff) {
                minDiff = diff;
                closestIndex = i;
            } else {
                break; // Data is sorted, so we can stop once diff starts increasing
            }
        }

        level = preAnalyzedData[closestIndex].level;
    } else {
        // Fallback to real-time analysis if not pre-analyzed
        const volume = getVolume();
        level = volumeToLevel(volume);
        volumeHistory.push({ volume, level });
        if (volumeHistory.length > maxHistoryPoints) {
            volumeHistory.shift();
        }
    }

    currentLevelDisplay.textContent = `Level: ${level}`;
    currentLevelDisplay.style.backgroundColor = getColorForLevel(level);
    drawVisualization();
    animationId = requestAnimationFrame(visualize);
}

// Draw the moving line visualization with past/future split
function drawVisualization() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const levelHeight = canvas.height / numLevels;

    // Draw level background zones
    for (let i = 0; i < numLevels; i++) {
        ctx.fillStyle = getColorForLevel(i + 1) + '20';
        ctx.fillRect(0, canvas.height - (i + 1) * levelHeight, canvas.width, levelHeight);
    }

    if (!isAnalyzed || preAnalyzedData.length === 0) {
        // Fallback to old visualization if not pre-analyzed
        drawLegacyVisualization(levelHeight);
        return;
    }

    const currentTime = audioElement.currentTime;
    const duration = audioElement.duration;
    const midX = canvas.width / 2;

    // Calculate time window (show total of ~10 seconds: 5 past, 5 future)
    const timeWindow = 10; // seconds
    const pastWindow = timeWindow / 2;
    const futureWindow = timeWindow / 2;

    // Filter data for past (left half)
    const pastData = preAnalyzedData.filter(d =>
        d.time >= currentTime - pastWindow && d.time <= currentTime
    );

    // Filter data for future (right half)
    const futureData = preAnalyzedData.filter(d =>
        d.time > currentTime && d.time <= currentTime + futureWindow
    );

    // Draw moving average with glow effect first (underneath)
    if (pastData.length > 0) {
        drawMovingAverageGlow(pastData, 0, midX, currentTime - pastWindow, currentTime, false, levelHeight);
    }
    if (futureData.length > 0) {
        drawMovingAverageGlow(futureData, midX, canvas.width, currentTime, currentTime + futureWindow, true, levelHeight);
    }

    // Draw main dynamics lines on top (sharp)
    if (pastData.length > 0) {
        drawSection(pastData, 0, midX, currentTime - pastWindow, currentTime, false, levelHeight);
    }

    // Draw future (right half - grayed)
    if (futureData.length > 0) {
        drawSection(futureData, midX, canvas.width, currentTime, currentTime + futureWindow, true, levelHeight);
    }

    // Draw center line to mark current position
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(midX, 0);
    ctx.lineTo(midX, canvas.height);
    ctx.stroke();
    ctx.setLineDash([]);
}

// Draw a section of the visualization (past or future)
function drawSection(data, startX, endX, startTime, endTime, isFuture, levelHeight) {
    if (data.length === 0) return;

    const sectionWidth = endX - startX;
    const timeRange = endTime - startTime;

    // Draw the line
    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    for (let i = 0; i < data.length; i++) {
        const normalizedTime = (data[i].time - startTime) / timeRange;
        const x = startX + (normalizedTime * sectionWidth);
        const level = data[i].level;
        const y = canvas.height - (level * levelHeight) + (levelHeight / 2);

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }

    // Create gradient
    const gradient = ctx.createLinearGradient(startX, 0, endX, 0);
    for (let i = 0; i < data.length; i++) {
        const level = data[i].level;
        const color = getColorForLevel(level);
        const position = Math.max(0, Math.min(1, i / data.length));
        // Make future grayed out
        const finalColor = isFuture ? adjustColorBrightness(color, 0.5) : color;
        gradient.addColorStop(position, finalColor);
    }
    ctx.strokeStyle = gradient;
    ctx.stroke();

    // Fill area under line
    const lastX = startX + ((data[data.length - 1].time - startTime) / timeRange) * sectionWidth;
    ctx.lineTo(lastX, canvas.height);
    ctx.lineTo(startX, canvas.height);
    ctx.closePath();

    const fillGradient = ctx.createLinearGradient(startX, 0, endX, 0);
    for (let i = 0; i < data.length; i++) {
        const level = data[i].level;
        const color = getColorForLevel(level);
        const position = Math.max(0, Math.min(1, i / data.length));
        const finalColor = isFuture ? adjustColorBrightness(color, 0.5) : color;
        fillGradient.addColorStop(position, finalColor + (isFuture ? '20' : '40'));
    }
    ctx.fillStyle = fillGradient;
    ctx.fill();
}

// Draw moving average with illuminating glow effect
function drawMovingAverageGlow(data, startX, endX, startTime, endTime, isFuture, levelHeight) {
    if (data.length < 2) return;

    const sectionWidth = endX - startX;
    const timeRange = endTime - startTime;

    // Convert data to points using raw averaged volume (not stepped levels)
    const points = data.map(d => {
        const normalizedTime = (d.time - startTime) / timeRange;
        const x = startX + (normalizedTime * sectionWidth);

        // Map avgVolume directly to Y position without level stepping
        const range = volumeMax - volumeMin;
        const normalized = range > 0 ? (d.avgVolume - volumeMin) / range : 0;
        const y = canvas.height - (normalized * canvas.height);

        return { x, y };
    });

    // Save current context state
    ctx.save();

    // Draw multiple glow layers with increasing blur radius (illumination effect)
    const glowRadius = 25; // Total glow spread
    const glowSteps = 8; // Number of layers for smooth illumination
    const baseColor = isFuture ? [200, 200, 200] : [120, 140, 255]; // RGB values

    for (let i = glowSteps; i > 0; i--) {
        const radius = (i / glowSteps) * glowRadius;
        const alpha = (i / glowSteps) * 0.15; // Fades out toward edges

        ctx.shadowBlur = radius;
        ctx.shadowColor = `rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, ${alpha})`;

        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        ctx.moveTo(points[0].x, points[0].y);

        // Draw smooth curve using quadratic curves
        for (let j = 1; j < points.length - 1; j++) {
            const xc = (points[j].x + points[j + 1].x) / 2;
            const yc = (points[j].y + points[j + 1].y) / 2;
            ctx.quadraticCurveTo(points[j].x, points[j].y, xc, yc);
        }

        // Draw last segment
        if (points.length > 1) {
            const last = points.length - 1;
            ctx.quadraticCurveTo(points[last].x, points[last].y, points[last].x, points[last].y);
        }

        // Core line color
        ctx.strokeStyle = `rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, ${0.3 + (i / glowSteps) * 0.2})`;
        ctx.stroke();
    }

    // Restore context state
    ctx.restore();
}

// Helper to adjust color brightness for future preview
function adjustColorBrightness(hex, factor) {
    // Convert hex to RGB
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    // Mix with white (lighten)
    const nr = Math.round(r + (255 - r) * factor);
    const ng = Math.round(g + (255 - g) * factor);
    const nb = Math.round(b + (255 - b) * factor);

    return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
}

// Legacy visualization for non-analyzed mode
function drawLegacyVisualization(levelHeight) {
    if (volumeHistory.length === 0) return;
    const pointWidth = canvas.width / maxHistoryPoints;

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
