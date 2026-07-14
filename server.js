const http = require("http");
const WebSocket = require("ws");

let latestFrame = null;
let frameCounter = 0;
let audioPacketCounter = 0;

const audioViewers = new Set();

const server = http.createServer((req, res) => {
    // =========================================================
    // MJPEG VIDEO-ONLY ENDPOINT
    // =========================================================
    if (req.method === "GET" && req.url === "/live") {
        res.writeHead(200, {
            "Content-Type": "multipart/x-mixed-replace; boundary=frame",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Connection": "close",
            "Pragma": "no-cache",
            "Expires": "0"
        });

        const interval = setInterval(() => {
            if (!latestFrame || res.destroyed) {
                return;
            }

            try {
                res.write("--frame\r\n");
                res.write("Content-Type: image/jpeg\r\n");
                res.write(
                    "Content-Length: " +
                    latestFrame.length +
                    "\r\n\r\n"
                );

                res.write(latestFrame);
                res.write("\r\n");
            } catch (error) {
                clearInterval(interval);
            }
        }, 100);

        req.on("close", () => {
            clearInterval(interval);
        });

        return;
    }

    // =========================================================
    // VIDEO + AUDIO VIEWER PAGE
    // =========================================================
    if (req.method === "GET" && req.url === "/watch") {
        res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        });

        res.end(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">

    <meta
        name="viewport"
        content="width=device-width, initial-scale=1, maximum-scale=1"
    >

    <title>RoomGuardian Live</title>

    <style>
        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            background: #111;
            color: white;
            font-family: Arial, sans-serif;
            text-align: center;
        }

        header {
            padding: 12px;
            background: #1b1b1b;
        }

        h2 {
            margin: 0;
            font-size: 22px;
        }

        .video-container {
            width: 100%;
            background: black;
        }

        .video-container img {
            display: block;
            width: 100%;
            height: auto;
            background: black;
        }

        .controls {
            padding: 18px 10px 8px;
        }

        button {
            min-width: 145px;
            margin: 6px;
            padding: 14px 18px;
            border: 0;
            border-radius: 10px;
            font-size: 17px;
            font-weight: bold;
            cursor: pointer;
        }

        #audioOnButton {
            background: #2e9d48;
            color: white;
        }

        #audioOffButton {
            background: #b43b3b;
            color: white;
        }

        #status {
            min-height: 28px;
            margin: 5px 10px 20px;
            font-size: 16px;
        }
    </style>
</head>

<body>

<header>
    <h2>📹 RoomGuardian Live</h2>
</header>

<div class="video-container">
    <img
        src="/live"
        alt="RoomGuardian live video"
    >
</div>

<div class="controls">
    <button id="audioOnButton">
        🔊 Audio On
    </button>

    <button id="audioOffButton">
        🔇 Audio Off
    </button>
</div>

<div id="status">
    🔇 Audio is off
</div>

<script>
    const audioOnButton =
        document.getElementById("audioOnButton");

    const audioOffButton =
        document.getElementById("audioOffButton");

    const status =
        document.getElementById("status");

    let audioContext = null;
    let audioSocket = null;
    let nextPlayTime = 0;
    let startingAudio = false;

    audioOnButton.addEventListener(
        "click",
        startAudio
    );

    audioOffButton.addEventListener(
        "click",
        stopAudio
    );

    async function startAudio(event) {
        if (event) {
            event.preventDefault();
        }

        if (startingAudio) {
            return;
        }

        if (
            audioSocket &&
            audioSocket.readyState === WebSocket.OPEN &&
            audioContext
        ) {
            if (audioContext.state === "suspended") {
                await audioContext.resume();
            }

            status.textContent = "✅ Audio connected";
            return;
        }

        startingAudio = true;
        status.textContent = "⏳ Connecting audio...";

        try {
            const AudioContextClass =
                window.AudioContext ||
                window.webkitAudioContext;

            if (!AudioContextClass) {
                status.textContent =
                    "❌ Audio is not supported by this browser";

                startingAudio = false;
                return;
            }

            if (audioContext) {
                try {
                    await audioContext.close();
                } catch (ignored) {
                }

                audioContext = null;
            }

            audioContext = new AudioContextClass({
                sampleRate: 16000
            });

            // Unlock iPhone Safari audio after user tap.
            const unlockBuffer =
                audioContext.createBuffer(1, 1, 16000);

            const unlockSource =
                audioContext.createBufferSource();

            unlockSource.buffer = unlockBuffer;
            unlockSource.connect(audioContext.destination);
            unlockSource.start(0);

            if (audioContext.state === "suspended") {
                await audioContext.resume();
            }

            nextPlayTime = audioContext.currentTime;

            const protocol =
                window.location.protocol === "https:"
                    ? "wss:"
                    : "ws:";

            audioSocket = new WebSocket(
                protocol +
                "//" +
                window.location.host +
                "/viewer"
            );

            audioSocket.binaryType = "arraybuffer";

            audioSocket.onopen = () => {
                startingAudio = false;

                status.textContent =
                    "✅ Audio connected";

                audioOnButton.textContent =
                    "✅ Audio On";
            };

            audioSocket.onmessage = event => {
                playPcmAudio(event.data);
            };

            audioSocket.onerror = () => {
                startingAudio = false;

                status.textContent =
                    "❌ Audio connection error";
            };

            audioSocket.onclose = () => {
                startingAudio = false;
                audioSocket = null;

                status.textContent =
                    "🔇 Audio is off";

                audioOnButton.textContent =
                    "🔊 Audio On";
            };

        } catch (error) {
            startingAudio = false;

            status.textContent =
                "❌ Audio failed: " +
                (error.message || "unknown error");
        }
    }

    async function stopAudio(event) {
        if (event) {
            event.preventDefault();
        }

        startingAudio = false;

        if (audioSocket) {
            try {
                audioSocket.close(1000, "audio stopped");
            } catch (ignored) {
            }

            audioSocket = null;
        }

        if (audioContext) {
            try {
                await audioContext.close();
            } catch (ignored) {
            }

            audioContext = null;
        }

        nextPlayTime = 0;

        status.textContent =
            "🔇 Audio is off";

        audioOnButton.textContent =
            "🔊 Audio On";
    }

    function playPcmAudio(arrayBuffer) {
        if (
            !audioContext ||
            audioContext.state === "closed"
        ) {
            return;
        }

        const view = new DataView(arrayBuffer);
        const sampleCount =
            Math.floor(view.byteLength / 2);

        if (sampleCount <= 0) {
            return;
        }

        const audioBuffer =
            audioContext.createBuffer(
                1,
                sampleCount,
                16000
            );

        const channel =
            audioBuffer.getChannelData(0);

        for (let i = 0; i < sampleCount; i++) {
            channel[i] =
                view.getInt16(i * 2, true) / 32768;
        }

        const source =
            audioContext.createBufferSource();

        source.buffer = audioBuffer;
        source.connect(audioContext.destination);

        const now = audioContext.currentTime;
        const maximumAudioDelay = 0.25;

        // Avoid building a long queue of old audio.
        if (
            nextPlayTime < now ||
            nextPlayTime - now > maximumAudioDelay
        ) {
            nextPlayTime = now;
        }

        source.start(nextPlayTime);
        nextPlayTime += audioBuffer.duration;
    }
</script>

</body>
</html>
        `);

        return;
    }

    // =========================================================
    // HOME PAGE
    // =========================================================
    res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8"
    });

    res.end(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta
        name="viewport"
        content="width=device-width, initial-scale=1"
    >
    <title>RoomGuardian Cloud</title>
</head>

<body style="
    font-family: Arial, sans-serif;
    text-align: center;
    padding: 30px;
">
    <h1>RoomGuardian Cloud Relay</h1>

    <p>
        <a href="/watch">
            Open video with audio
        </a>
    </p>

    <p>
        <a href="/live">
            Open video only
        </a>
    </p>
</body>
</html>
    `);
});

// =============================================================
// WEBSOCKET SERVER
// =============================================================

const wss = new WebSocket.Server({
    server
});

wss.on("connection", (ws, req) => {
    // Browser audio viewer connection
    if (req.url === "/viewer") {
        audioViewers.add(ws);

        console.log(
            "Audio viewer connected. Total viewers: " +
            audioViewers.size
        );

        ws.on("close", () => {
            audioViewers.delete(ws);

            console.log(
                "Audio viewer disconnected. Total viewers: " +
                audioViewers.size
            );
        });

        ws.on("error", () => {
            audioViewers.delete(ws);
        });

        return;
    }

    // Samsung RoomGuardian device connection
    console.log("RoomGuardian device connected");

    ws.on("message", data => {
        const packet = Buffer.from(data);

        if (packet.length < 2) {
            return;
        }

        const packetType = packet[0];
        const payload = packet.subarray(1);

        // Video JPEG packet
        if (packetType === 0x01) {
            latestFrame = payload;
            frameCounter++;

            if (frameCounter % 30 === 0) {
                console.log(
                    "Video frames received: " +
                    frameCounter
                );
            }

            return;
        }

        // Raw PCM audio packet
        if (packetType === 0x02) {
            audioPacketCounter++;

            for (const viewer of audioViewers) {
                if (
                    viewer.readyState ===
                    WebSocket.OPEN
                ) {
                    viewer.send(payload);
                }
            }

            if (audioPacketCounter % 50 === 0) {
                console.log(
                    "Audio packets received: " +
                    audioPacketCounter
                );
            }
        }
    });

    ws.on("close", () => {
        console.log(
            "RoomGuardian device disconnected"
        );
    });

    ws.on("error", error => {
        console.error(
            "RoomGuardian device error:",
            error.message
        );
    });
});

// =============================================================
// SERVER START
// =============================================================

const PORT =
    process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
    console.log(
        "RoomGuardian Cloud Relay running on port " +
        PORT
    );

    console.log(
        "Viewer available at /watch"
    );
});
