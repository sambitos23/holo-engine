// ==========================================
// 1. NATURAL SOUND ENGINE (Assets)
// ==========================================

const ASSETS = {
    heart: "assets/sound/heart",
    sunflower: "assets/sound/flower",
    buddha: "assets/sound/budha",
    dna: "assets/sound/dna",
    saturn: "assets/sound/space",
};

class NaturalSoundEngine {
    constructor() {
        this.audioElements = {};
        this.currentAudio = null;
        this.isMuted = true;
        this.volume = 0.5;

        Object.keys(ASSETS).forEach((key) => {
            const exts = [".mp3", ".ogg"];
            let chosen = null;
            for (const ext of exts) {
                const testType = ext === ".mp3" ? "audio/mpeg" : "audio/ogg";
                if (new Audio().canPlayType(testType)) {
                    chosen = ASSETS[key] + ext;
                    break;
                }
            }
            if (!chosen) chosen = ASSETS[key] + ".mp3";

            const aud = new Audio(chosen);
            aud.preload = "auto";
            aud.crossOrigin = "anonymous";
            aud.loop = true;
            aud.volume = 0;

            aud.addEventListener("canplay", () => {
                // Preloaded
            });
            try {
                aud.load();
            } catch (e) { }
            this.audioElements[key] = aud;
        });
    }

    toggleMute(forcedState = null) {
        if (forcedState !== null) this.isMuted = forcedState;
        else this.isMuted = !this.isMuted;

        const led = document.getElementById("led-sound");
        const txt = document.getElementById("txt-sound");

        if (this.isMuted) {
            led.className = "led off";
            txt.innerText = "SOUND: MUTED";
            txt.style.color = "#888";
            if (this.currentAudio) this.currentAudio.volume = 0;
        } else {
            led.className = "led on";
            txt.innerText = "SOUND: NATURE";
            txt.style.color = "#fff";
            if (this.currentAudio) this.currentAudio.volume = this.volume;
        }
    }

    play(shape) {
        const nextAudio = this.audioElements[shape];
        if (!nextAudio) return;

        // Bug Fix: If called but already assigned, just ensure volume is up
        if (nextAudio === this.currentAudio) {
            if (!this.isMuted && nextAudio.paused)
                nextAudio.play().catch((e) => { });
            return;
        }

        if (this.currentAudio) {
            const old = this.currentAudio;
            let vol = old.volume;
            const fadeOut = setInterval(() => {
                if (vol > 0.05) {
                    vol -= 0.05;
                    old.volume = vol;
                } else {
                    old.pause();
                    old.currentTime = 0;
                    clearInterval(fadeOut);
                }
            }, 50);
        }

        this.currentAudio = nextAudio;
        nextAudio.play().catch((e) => { });

        if (!this.isMuted) {
            let vol = 0;
            nextAudio.volume = 0;
            const fadeIn = setInterval(() => {
                if (vol < this.volume) {
                    vol += 0.05;
                    nextAudio.volume = vol;
                } else {
                    clearInterval(fadeIn);
                }
            }, 50);
        }
    }

    // Force reset allows playing the same track again if it was blocked
    forceReset() {
        this.currentAudio = null;
    }
}

const soundEngine = new NaturalSoundEngine();

// ==========================================
// 2. SNAP DETECTOR
// ==========================================
async function initMic() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
        });
        const audioCtx = new (window.AudioContext ||
            window.webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();

        // OPTIMIZATION for Snaps:
        // 1. Lower fftSize means faster processing per frame (less frequency resolution, usually better time calc)
        // 2. smoothingTimeConstant=0.1 means the analyser doesn't "smooth out" the sudden spike of a snap
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.1;

        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const micTxt = document.getElementById("txt-mic");
        micTxt.innerText = "MIC: LISTENING";
        micTxt.style.color = "#0f0";

        let lastSnap = 0;
        let backgroundNoise = 0;
        let frames = 0;

        function detect() {
            analyser.getByteFrequencyData(dataArray);

            // Calculate energy
            // Start bin 5 to capture slightly more "body" of the clap/snap
            // but still skip low-end rumble (bins 0-4 are < ~400Hz at 48k/512fft)
            let sum = 0;
            let count = 0;
            const startBin = 5;

            for (let i = startBin; i < dataArray.length; i++) {
                sum += dataArray[i];
                count++;
            }
            const currentEnergy = count > 0 ? sum / count : 0;

            // Adapt background noise
            if (frames < 50) {
                backgroundNoise = backgroundNoise === 0 ? currentEnergy : (backgroundNoise * 0.9 + currentEnergy * 0.1);
                frames++;
            } else {
                // If it's a spike, adapt VERY slowly (so we don't absorb the snap into the background level)
                // If it's quiet, adapt normally
                if (currentEnergy > backgroundNoise * 1.2) {
                    backgroundNoise = backgroundNoise * 0.999 + currentEnergy * 0.001;
                } else {
                    backgroundNoise = backgroundNoise * 0.95 + currentEnergy * 0.05;
                }
            }

            const now = Date.now();

            // Detection Logic Refined:
            // 1. Sensitivity: relaxed multiplier (1.3x background instead of 1.5x/1.8x)
            // 2. Absolute Floor: lowered to 20 to catch quieter snaps (was 35)
            // 3. Removed 'previousEnergy' ratio check as it can be unreliable at 60fps for fast transients
            if (now - lastSnap > 1000 && frames > 30) {
                if (currentEnergy > backgroundNoise * 1.3 && currentEnergy > 20) {

                    console.log("Snap Detected! Level:", currentEnergy.toFixed(1), "Bg:", backgroundNoise.toFixed(1));
                    soundEngine.toggleMute();
                    lastSnap = now;

                    const gestureInd = document.querySelector(".gesture-indicator");
                    if (gestureInd) {
                        gestureInd.style.background = "rgba(255,255,255,0.4)";
                        setTimeout(() => {
                            gestureInd.style.background = "var(--glass-bg)";
                        }, 150);
                    }
                }
            }

            requestAnimationFrame(detect);
        }
        detect();
    } catch (e) {
        console.error("Mic Error", e);
        const micTxt = document.getElementById("txt-mic");
        if (micTxt) {
            micTxt.innerText = "MIC: BLOCKED";
            micTxt.style.color = "red";
        }
    }
}

document.body.addEventListener(
    "click",
    () => {
        document.getElementById("loader").style.display = "none";
        soundEngine.toggleMute(false);

        // FIX FOR SOUND BUG: Force reset current audio so play() actually executes
        soundEngine.forceReset();
        soundEngine.play(currentShape);

        if (document.getElementById("txt-mic").innerText === "MIC: OFF") {
            initMic();
        }
    },
    { once: true }
);

// ==========================================
// 3. VISUALS (THREE.JS)
// ==========================================
const PARTICLE_COUNT = 30000;
const PARTICLE_SIZE = 0.07;
let currentShape = "heart";
let isHandDetected = false;

let targetRotX = 0,
    targetRotY = 0,
    targetZoom = 1.0;
let actualRotX = 0,
    actualRotY = 0,
    actualZoom = 1.0;

const container = document.getElementById("canvas-container");
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.03);

const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    100
);
camera.position.z = 6.5;

const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(PARTICLE_COUNT * 3);
const colors = new Float32Array(PARTICLE_COUNT * 3);
const targetPositions = new Float32Array(PARTICLE_COUNT * 3);
const targetColors = new Float32Array(PARTICLE_COUNT * 3);

for (let i = 0; i < PARTICLE_COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 15;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 15;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 15;
    colors[i * 3] = 1;
    colors[i * 3 + 1] = 1;
    colors[i * 3 + 2] = 1;
}

geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3)
);
geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

const sprite = new THREE.TextureLoader().load(
    "https://threejs.org/examples/textures/sprites/spark1.png"
);
const material = new THREE.PointsMaterial({
    size: PARTICLE_SIZE,
    map: sprite,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.85,
});
const particles = new THREE.Points(geometry, material);
scene.add(particles);

// --- SHAPE ALGORITHMS ---
function getShapeData(shapeName) {
    const pArr = [];
    const cArr = [];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        let x = 0,
            y = 0,
            z = 0,
            r = 1,
            g = 1,
            b = 1;

        if (shapeName === "heart") {
            const t = Math.random() * Math.PI * 2;
            const scale = 0.15;
            let hx = 16 * Math.pow(Math.sin(t), 3);
            let hy =
                13 * Math.cos(t) -
                5 * Math.cos(2 * t) -
                2 * Math.cos(3 * t) -
                Math.cos(4 * t);
            const vol = Math.random();
            x = hx * vol * scale;
            y = hy * vol * scale;
            z = (Math.random() - 0.5) * 3 * vol;
            const dist = Math.sqrt(x * x + y * y);
            r = 1.0;
            g = 0;
            b = 0.2 + dist * 0.3;
        } else if (shapeName === "sunflower") {
            // --- REDESIGNED SUNFLOWER (NO STEM) ---

            // 40% Seeds (Center)
            // 60% Petals (Multiple Layers)

            if (i < PARTICLE_COUNT * 0.4) {
                // CENTER DISK SEEDS (Fibonacci)
                const idx = i;
                const angle = idx * 137.508 * (Math.PI / 180);
                const nRad = Math.sqrt(idx / (PARTICLE_COUNT * 0.4));
                const rad = nRad * 2.0;

                x = rad * Math.cos(angle);
                y = rad * Math.sin(angle);
                // Slight dome shape
                z = 0.4 * (1 - nRad);

                // Dark Brown -> Orange
                r = 0.3 + nRad * 0.3;
                g = 0.15 + nRad * 0.15;
                b = 0.0;
            } else {
                // BEAUTIFUL PETALS
                // Divide remaining particles into 2 layers for depth
                const petalIdx = i - PARTICLE_COUNT * 0.4;
                const totalPetalP = PARTICLE_COUNT * 0.6;
                const isLayer1 = petalIdx < totalPetalP * 0.5; // Inner petal layer

                const angle = Math.random() * Math.PI * 2;
                const petalCount = 13;

                // Sine wave logic for petal shape
                // Creates "valleys" between petals
                let petalLen = Math.abs(Math.sin(angle * petalCount * 0.5));

                // Power it to make petals pointier/separated
                petalLen = Math.pow(petalLen, 0.5);

                let baseRad, maxExt;

                if (isLayer1) {
                    // Inner layer
                    baseRad = 2.0;
                    maxExt = 2.5;
                    z = 0.1 - Math.random() * 0.2; // Slightly forward
                    // Bright Yellow
                    r = 1.0;
                    g = 0.9;
                    b = 0.0;
                } else {
                    // Outer layer (offset angle)
                    baseRad = 2.0;
                    maxExt = 3.2;
                    // Shift angle for layer 2 so petals interleave
                    let shiftedAngle = angle + Math.PI / petalCount;
                    petalLen = Math.abs(Math.sin(shiftedAngle * petalCount * 0.5));
                    petalLen = Math.pow(petalLen, 0.5);

                    z = -0.1 - Math.random() * 0.2; // Behind
                    // Darker Gold
                    r = 1.0;
                    g = 0.7;
                    b = 0.0;
                }

                const dist = baseRad + Math.random() * maxExt * petalLen;

                // Re-calc position based on specific petal angle logic
                // We actually want to fill the volume of the petal
                // Using the angle directly:
                let finalAngle = isLayer1 ? angle : angle + Math.PI / petalCount;

                x = dist * Math.cos(finalAngle);
                y = dist * Math.sin(finalAngle);

                // Slight curve back at tips
                z -= (dist - baseRad) * 0.1;
            }
        } else if (shapeName === "buddha") {
            const scaleM = 2.5;
            const rand = Math.random();
            if (rand < 0.25) {
                const u = Math.random() * Math.PI * 2;
                const v = Math.random() * Math.PI;
                const rad = 0.6 * scaleM;
                x = rad * Math.sin(v) * Math.cos(u);
                y = rad * Math.sin(v) * Math.sin(u) + 1.8 * scaleM;
                z = rad * Math.cos(v);
                r = 1;
                g = 0.8;
                b = 0.2;
            } else if (rand < 0.7) {
                const theta = Math.random() * Math.PI * 2;
                const h = Math.random() * 2.0 * scaleM;
                const rad = (0.7 + Math.sin((h / scaleM) * 3) * 0.1) * scaleM;
                x = rad * Math.cos(theta);
                y = h - 0.2 * scaleM;
                z = rad * Math.sin(theta) * 0.6;
                r = 1;
                g = 0.4;
                b = 0;
            } else {
                const theta = Math.random() * Math.PI * 2;
                const rad = 1.5 * Math.sqrt(Math.random()) * scaleM;
                x = rad * Math.cos(theta);
                y = (Math.random() * 0.5 - 0.5) * scaleM;
                z = rad * Math.sin(theta);
                r = 0.8;
                g = 0.3;
                b = 0;
            }
            y -= 2.0;
        } else if (shapeName === "dna") {
            const strands = 7;
            const strandIdx = i % strands;
            const palette = [
                { r: 0.58, g: 0, b: 0.82 },
                { r: 0.29, g: 0, b: 0.51 },
                { r: 0, g: 0, b: 1 },
                { r: 0, g: 1, b: 0 },
                { r: 1, g: 1, b: 0 },
                { r: 1, g: 0.5, b: 0 },
                { r: 1, g: 0, b: 0 },
            ];
            const col = palette[strandIdx];
            r = col.r;
            g = col.g;
            b = col.b;
            const t = (i / PARTICLE_COUNT) * Math.PI * 15;
            const radius = 1.5;
            const angleOffset = (Math.PI * 2 * strandIdx) / strands;
            x = Math.cos(t + angleOffset) * radius;
            z = Math.sin(t + angleOffset) * radius;
            y = (i / PARTICLE_COUNT) * 12 - 6;
            x += (Math.random() - 0.5) * 0.15;
            z += (Math.random() - 0.5) * 0.15;
        } else if (shapeName === "saturn") {
            const rand = Math.random();
            if (rand < 0.6) {
                const u = Math.random() * Math.PI * 2;
                const v = Math.random() * Math.PI;
                const rad = 1.2;
                x = rad * Math.sin(v) * Math.cos(u);
                y = rad * Math.sin(v) * Math.sin(u);
                z = rad * Math.cos(v);
                r = 0.8;
                g = 0.6;
                b = 0.3;
            } else {
                const ang = Math.random() * Math.PI * 2;
                const dist = 1.6 + Math.random() * 1.8;
                x = Math.cos(ang) * dist;
                z = Math.sin(ang) * dist;
                y = (Math.random() - 0.5) * 0.1;
                const tilt = 0.4;
                let ty = y * Math.cos(tilt) - z * Math.sin(tilt);
                let tz = y * Math.sin(tilt) + z * Math.cos(tilt);
                y = ty;
                z = tz;
                r = 0.6;
                g = 0.7;
                b = 1.0;
            }
        }

        pArr.push(x, y, z);
        cArr.push(r, g, b);
    }
    return { p: pArr, c: cArr };
}

function updateParticles(shape) {
    const data = getShapeData(shape);
    for (let i = 0; i < PARTICLE_COUNT * 3; i++) {
        targetPositions[i] = data.p[i];
        targetColors[i] = data.c[i];
    }
    soundEngine.play(shape);
}

updateParticles("heart");

window.setShape = (name, btnEl) => {
    currentShape = name;
    updateParticles(name);
    document
        .querySelectorAll(".btn-glass")
        .forEach((b) => b.classList.remove("active"));
    if (btnEl && btnEl.classList) btnEl.classList.add("active");
};

// --- HAND TRACKING & ANIMATION ---
const cursor = document.getElementById("hand-cursor");
const rotStat = document.getElementById("rot-stat");
const zoomStat = document.getElementById("zoom-stat");
const sysStatus = document.getElementById("sys-status");

function onResults(results) {
    if (
        results.multiHandLandmarks &&
        results.multiHandLandmarks.length > 0
    ) {
        isHandDetected = true;
        sysStatus.innerHTML =
            "SYSTEM: <span style='color:#0f0'>TRACKING</span>";
        cursor.style.display = "block";

        const lm = results.multiHandLandmarks[0];
        const x = lm[8].x;
        const y = lm[8].y;

        cursor.style.left = `${x * 100}%`;
        cursor.style.top = `${y * 100}%`;

        targetRotY = (x - 0.5) * Math.PI * 2;
        targetRotX = (y - 0.5) * Math.PI;

        const dist = Math.sqrt(
            Math.pow(lm[4].x - lm[8].x, 2) + Math.pow(lm[4].y - lm[8].y, 2)
        );
        targetZoom = Math.max(0.3, Math.min(2.5, dist * 5));

        rotStat.innerText = `X:${targetRotX.toFixed(
            1
        )} Y:${targetRotY.toFixed(1)}`;
        zoomStat.innerText = `${targetZoom.toFixed(2)}x`;
    } else {
        isHandDetected = false;
        sysStatus.innerHTML =
            "SYSTEM: <span style='color:orange'>SEARCHING</span>";
        cursor.style.display = "none";
        targetRotX = 0;
        targetRotY = 0;
        targetZoom = 1.0;
    }
}

const hands = new Hands({
    locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
});
hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
});
hands.onResults(onResults);

const cam = new Camera(document.getElementById("input_video"), {
    onFrame: async () => {
        await hands.send({ image: document.getElementById("input_video") });
    },
    width: 640,
    height: 480,
});
cam.start();

const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    actualRotX += (targetRotX - actualRotX) * 0.1;
    actualRotY += (targetRotY - actualRotY) * 0.1;
    actualZoom += (targetZoom - actualZoom) * 0.1;

    particles.rotation.x = actualRotX;
    particles.rotation.y = actualRotY;
    particles.scale.set(actualZoom, actualZoom, actualZoom);

    const pArr = geometry.attributes.position.array;
    const cArr = geometry.attributes.color.array;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const idx = i * 3;
        pArr[idx] += (targetPositions[idx] - pArr[idx]) * 0.05;
        pArr[idx + 1] += (targetPositions[idx + 1] - pArr[idx + 1]) * 0.05;
        pArr[idx + 2] += (targetPositions[idx + 2] - pArr[idx + 2]) * 0.05;
        cArr[idx] += (targetColors[idx] - cArr[idx]) * 0.05;
        cArr[idx + 1] += (targetColors[idx + 1] - cArr[idx + 1]) * 0.05;
        cArr[idx + 2] += (targetColors[idx + 2] - cArr[idx + 2]) * 0.05;

        if (!isHandDetected) {
            pArr[idx + 1] +=
                Math.sin(clock.elapsedTime * 2 + pArr[idx]) * 0.002;
        }
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
