const http = require("http");
const WebSocket = require("ws");

let latestFrame = null;
let frameCounter = 0;
let audioPacketCounter = 0;

const audioViewers = new Set();

let deviceSocket = null;

const server = http.createServer((req, res) => {

    // Existing MJPEG video stream
    if (req.method === "GET" && req.url === "/live") {
        res.writeHead(200, {
            "Content-Type": "multipart/x-mixed-replace; boundary=frame",
            "Cache-Control": "no-cache",
            "Connection": "close",
            "Pragma": "no-cache"
        });

        const interval = setInterval(() => {
            if (!latestFrame) {
                return;
            }

            res.write("--frame\r\n");
            res.write("Content-Type: image/jpeg\r\n");
            res.write("Content-Length: " + latestFrame.length + "\r\n\r\n");
            res.write(latestFrame);
            res.write("\r\n");
        }, 100);

        req.on("close", () => {
            clearInterval(interval);
        });

        return;
    }

    // Combined video + audio viewer
    if (req.method === "GET" && req.url === "/watch") {
        res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-cache"
        });

        res.end(`
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1">
    <title>RoomGuardian Live</title>

    <style>
        body {
            margin: 0;
            background: #111;
            color: white;
            font-family: Arial, sans-serif;
            text-align: center;
        }

        h2 {
            margin: 14px 0;
        }

        img {
    display: block;
    width: auto;
    height: 80vh;
    max-width: 100%;
    margin: 0 auto;
    background: black;
    transform: rotate(90deg);
}

        button {
            margin: 18px;
            padding: 14px 24px;
            font-size: 18px;
            border: 0;
            border-radius: 10px;
        }

        #talkButton {
            touch-action: none;
            user-select: none;
            -webkit-user-select: none;
        }          
        

        #status {
            margin-bottom: 20px;
        }
    </style>
</head>

<body>

<h2>RoomGuardian Live</h2>

<img src="/live" alt="RoomGuardian live video">

<button id="audioButton">🔊 Enable Audio</button>

<button id="talkButton">🎤 Hold to Talk</button>

<div id="status">Audio is off</div>

<script>
    const button = document.getElementById("audioButton");
    const status = document.getElementById("status");
    const talkButton = document.getElementById("talkButton");

    let talkSocket = null;
    let talkStream = null;
    let talkAudioContext = null;
    let talkProcessor = null;
    let talking = false;

    

    let audioContext = null;
    let socket = null;
    let nextPlayTime = 0;

    button.addEventListener("touchend", startAudio, { passive: false });
button.addEventListener("click", startAudio);

async function startAudio(event) {
    if (event) {
        event.preventDefault();
    }

    if (!audioContext) {
        const AudioContextClass =
            window.AudioContext || window.webkitAudioContext;

        audioContext = new AudioContextClass();

        // Unlock iPhone Safari audio output.
        const unlockBuffer = audioContext.createBuffer(1, 1, 16000);
        const unlockSource = audioContext.createBufferSource();

        unlockSource.buffer = unlockBuffer;
        unlockSource.connect(audioContext.destination);
        unlockSource.start(0);

        await audioContext.resume();

        nextPlayTime = audioContext.currentTime;

        const protocol =
            window.location.protocol === "https:" ? "wss:" : "ws:";

        socket = new WebSocket(
            protocol + "//" + window.location.host + "/viewer"
        );

        socket.binaryType = "arraybuffer";

        socket.onopen = () => {
            status.textContent = "✅ Audio connected";
            button.textContent = "🔊 Audio Enabled";
        };

        socket.onerror = () => {
            status.textContent = "❌ Audio connection error";
        };

        socket.onclose = () => {
            status.textContent = "❌ Audio disconnected";
        };

        socket.onmessage = event => {
            playPcmAudio(event.data);
        };
    } else {
        await audioContext.resume();
    }
}

    function playPcmAudio(arrayBuffer) {
        if (!audioContext) {
            return;
        }

        const view = new DataView(arrayBuffer);
        const sampleCount = Math.floor(view.byteLength / 2);

        if (sampleCount === 0) {
            return;
        }

        const audioBuffer =
            audioContext.createBuffer(1, sampleCount, 16000);

        const channel = audioBuffer.getChannelData(0);

        for (let i = 0; i < sampleCount; i++) {
            channel[i] = view.getInt16(i * 2, true) / 32768;
        }

        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);

        const now = audioContext.currentTime;

        // Prevent old audio packets building up and causing a long delay.
const maximumAudioDelay = 0.25;

if (nextPlayTime < now || nextPlayTime - now > maximumAudioDelay) {
    nextPlayTime = now;
}

source.start(nextPlayTime);
nextPlayTime += audioBuffer.duration;
    }

    talkButton.addEventListener("touchstart", startTalk, { passive: false });
    talkButton.addEventListener("touchend", stopTalk, { passive: false });
    talkButton.addEventListener("touchcancel", stopTalk, { passive: false });

    talkButton.addEventListener("mousedown", startTalk);
    talkButton.addEventListener("mouseup", stopTalk);
    talkButton.addEventListener("mouseleave", stopTalk);

    async function startTalk(event) {
        if (event) {
        event.preventDefault();
        }

        if (talking) {
        return;
        }

        talking = true;
        talkButton.textContent = "🔴 Talking...";

        try {
            talkStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1
                },
                video: false
            });

            const AudioContextClass =
                window.AudioContext || window.webkitAudioContext;

            talkAudioContext = new AudioContextClass();
            await talkAudioContext.resume();

            const protocol =
                window.location.protocol === "https:" ? "wss:" : "ws:";

            talkSocket = new WebSocket(
                protocol + "//" + window.location.host + "/talk"
            );

            talkSocket.binaryType = "arraybuffer";

            const microphoneSource =
                talkAudioContext.createMediaStreamSource(talkStream);

            talkProcessor =
                talkAudioContext.createScriptProcessor(4096, 1, 1);

            talkProcessor.onaudioprocess = audioEvent => {
                if (!talking ||
                        !talkSocket ||
                        talkSocket.readyState !== WebSocket.OPEN) {
                    return;
                }

                const input =
                    audioEvent.inputBuffer.getChannelData(0);

                const downsampled = downsampleTo16000(
                    input,
                    talkAudioContext.sampleRate
                );

                const pcm16 = new Int16Array(downsampled.length);

                for (let i = 0; i < downsampled.length; i++) {
                    const sample = Math.max(
                        -1,
                        Math.min(1, downsampled[i])
                    );

                    pcm16[i] =
                        sample < 0
                            ? sample * 32768
                            : sample * 32767;
                }

                talkSocket.send(pcm16.buffer);
            };

            microphoneSource.connect(talkProcessor);
            talkProcessor.connect(talkAudioContext.destination);

        } catch (error) {
            talking = false;
            talkButton.textContent = "🎤 Hold to Talk";
            status.textContent =
                "❌ Microphone error: " + error.message;
    }
}

function stopTalk(event) {
    if (event) {
        event.preventDefault();
    }

    talking = false;
    talkButton.textContent = "🎤 Hold to Talk";

    if (talkProcessor) {
        try {
            talkProcessor.disconnect();
        } catch (ignored) {
        }

        talkProcessor.onaudioprocess = null;
        talkProcessor = null;
    }

    if (talkStream) {
        talkStream.getTracks().forEach(track => track.stop());
        talkStream = null;
    }

    if (talkSocket) {
        try {
            talkSocket.close();
        } catch (ignored) {
        }

        talkSocket = null;
    }

    if (talkAudioContext) {
        try {
            talkAudioContext.close();
        } catch (ignored) {
        }

        talkAudioContext = null;
    }
}

function downsampleTo16000(input, inputSampleRate) {
    const outputSampleRate = 16000;

    if (inputSampleRate === outputSampleRate) {
        return input;
    }

    const ratio = inputSampleRate / outputSampleRate;
    const outputLength =
        Math.round(input.length / ratio);

    const output = new Float32Array(outputLength);

    let inputPosition = 0;

    for (let outputPosition = 0;
         outputPosition < outputLength;
         outputPosition++) {

        const nextInputPosition =
            Math.round((outputPosition + 1) * ratio);

        let total = 0;
        let count = 0;

        for (let i = inputPosition;
             i < nextInputPosition && i < input.length;
             i++) {

            total += input[i];
            count++;
        }

        output[outputPosition] =
            count > 0 ? total / count : 0;

        inputPosition = nextInputPosition;
    }

    return output;
}
    
</script>

</body>
</html>
        `);

        return;
    }

    res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8"
    });

    res.end(`
        <h1>RoomGuardian Cloud Relay</h1>
        <p><a href="/watch">Open video with audio</a></p>
        <p><a href="/live">Open video only</a></p>
    `);
});

const wss = new WebSocket.Server({ server });

wss.on("connection", (ws, req) => {

    // Browser audio viewer
    if (req.url === "/viewer") {
        audioViewers.add(ws);
        console.log("Audio viewer connected");

        ws.on("close", () => {
            audioViewers.delete(ws);
            console.log("Audio viewer disconnected");
        });

        return;
    }

    // iPhone talkback microphone
if (req.url === "/talk") {
    console.log("Talkback viewer connected");

    ws.on("message", data => {
        if (!deviceSocket || deviceSocket.readyState !== WebSocket.OPEN) {
            return;
        }

        const audioBytes = Buffer.from(data);

        if (audioBytes.length === 0) {
            return;
        }

        const packet = Buffer.alloc(audioBytes.length + 1);

        packet[0] = 0x03;
        audioBytes.copy(packet, 1);

        deviceSocket.send(packet);
    });

    ws.on("close", () => {
        console.log("Talkback viewer disconnected");
    });

    return;
}

    // Samsung RoomGuardian device
    console.log("Device connected");

    deviceSocket = ws;

    ws.on("message", data => {
        const packet = Buffer.from(data);

        if (packet.length < 2) {
            return;
        }

        const packetType = packet[0];
        const payload = packet.subarray(1);

        // Video
        if (packetType === 0x01) {
            latestFrame = payload;
            frameCounter++;

            if (frameCounter % 30 === 0) {
                console.log("Video frames received: " + frameCounter);
            }

            return;
        }

        // Audio
        if (packetType === 0x02) {
            audioPacketCounter++;

            for (const viewer of audioViewers) {
                if (viewer.readyState === WebSocket.OPEN) {
                    viewer.send(payload);
                }
            }

            if (audioPacketCounter % 50 === 0) {
                console.log(
                    "Audio packets received: " + audioPacketCounter
                );
            }
        }
    });

    ws.on("close", () => {
    if (deviceSocket === ws) {
        deviceSocket = null;
    }

    console.log("Device disconnected");
});
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
    console.log(
        "RoomGuardian Cloud Relay running on port " + PORT
    );
});
