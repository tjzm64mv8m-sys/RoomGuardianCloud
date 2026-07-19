const http = require("http");
const WebSocket = require("ws");

let latestFrame = null;
let frameCounter = 0;
let audioPacketCounter = 0;

const audioViewers = new Set();

let deviceSocket = null;
let webRtcBrowserSocket = null;
let webRtcDeviceSocket = null;

const server = http.createServer((req, res) => {

    // =========================
    // MJPEG VIDEO STREAM
    // =========================

    if (req.method === "GET" && req.url === "/live") {

        res.writeHead(200, {
            "Content-Type":
                "multipart/x-mixed-replace; boundary=frame",
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

            res.write(
                "Content-Length: "
                + latestFrame.length
                + "\r\n\r\n"
            );

            res.write(latestFrame);
            res.write("\r\n");

        }, 100);

        req.on("close", () => {
            clearInterval(interval);
        });

        return;
    }


    // =========================
    // WATCH PAGE
    // =========================

    if (req.method === "GET" && req.url === "/watch") {

        res.writeHead(200, {
            "Content-Type":
                "text/html; charset=utf-8",
            "Cache-Control": "no-cache"
        });

        res.end(`
<!DOCTYPE html>
<html lang="en">

<head>

    <meta charset="utf-8">

    <meta
        name="viewport"
        content="width=device-width,
                 initial-scale=1,
                 maximum-scale=1,
                 viewport-fit=cover"
    >

    <title>RoomGuardian Live</title>

    <style>

        * {
            box-sizing: border-box;
        }

        html,
        body {
            margin: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;

            background: #0d0d0d;
            color: white;

            font-family:
                Arial,
                sans-serif;
        }

        .app {
            width: 100%;

            height: 100vh;
            height: 100svh;
            height: 100dvh;

            display: grid;

            grid-template-rows:
                auto
                minmax(0, 1fr)
                auto;

            background: #0d0d0d;
        }

        .title {
            margin: 0;

            padding:
                8px
                12px;

            font-size: 19px;
            line-height: 1.2;
            font-weight: 600;

            text-align: center;

            background: #151515;
        }

        .video-container {
            width: 100%;
            min-height: 0;

            display: flex;
            align-items: center;
            justify-content: center;

            overflow: hidden;

            background: black;
        }

        .video-container img {
            display: block;

            width: auto;

            height:
                min(
                    92vw,
                    70dvh
                );

            max-width: none;

            object-fit: contain;

            transform:
                rotate(90deg);

            transform-origin:
                center;

            background: black;

            .video-container img.front-camera {
    transform:
        rotate(270deg);
}
        }

        .controls {
            width: 100%;

            padding-top: 10px;
            padding-left: 12px;
            padding-right: 12px;

            padding-bottom:
                calc(
                    82px
                    +
                    env(
                        safe-area-inset-bottom
                    )
                );

            background: #171717;

            border-top:
                1px solid #2c2c2c;
        }

        .audio-row {
            display: grid;

            grid-template-columns:
                1fr
                1fr;

            gap: 10px;

            margin-bottom: 10px;
        }

        button {
            width: 100%;

            min-height: 50px;

            padding:
                11px
                10px;

            border: 0;

            border-radius: 12px;

            font-size: 16px;
            font-weight: 600;

            cursor: pointer;

            -webkit-tap-highlight-color:
                transparent;
        }

        #audioOnButton {
            background: #f2f2f2;
            color: #111111;
        }

        #audioOffButton {
            background: #3b3b3b;
            color: white;
        }

        #talkButton {
            background: #f2f2f2;
            color: #111111;

            touch-action: none;

            user-select: none;
            -webkit-user-select: none;
        }

        #talkButton.talking {
            background: #c62828;
            color: white;
        }

        #status {
            min-height: 18px;

            margin-top: 8px;

            font-size: 13px;
            line-height: 18px;

            text-align: center;

            color: #cccccc;
        }

        @media (orientation: landscape) {

            .title {
                padding:
                    5px
                    10px;

                font-size: 16px;
            }

            .video-container img {
                height:
                    min(
                        68vw,
                        62dvh
                    );
            }

            .controls {
                padding-top: 8px;

                padding-bottom:
                    calc(
                        58px
                        +
                        env(
                            safe-area-inset-bottom
                        )
                    );
            }

            button {
                min-height: 44px;
                font-size: 15px;
            }
        }

    </style>

</head>

<body>

<div class="app">

    <h1 class="title">
        RoomGuardian Live
    </h1>

    <div class="video-container">

        <img
            src="/live"
            alt="RoomGuardian live video"
        >

    </div>

    <div class="controls">

        <div class="audio-row">

            <button id="audioOnButton">
                🔊 Enable Audio
            </button>

            <button id="audioOffButton">
                🔇 Disable Audio
            </button>

        </div>

        <button id="switchCameraButton">
    🔄 Switch Camera
</button>

        <button id="talkButton">
            🎤 Hold to Talk
        </button>

        <div id="status">
            Audio is off
        </div>

    </div>

</div>


<script>

    const audioOnButton =
        document.getElementById(
            "audioOnButton"
        );

    const audioOffButton =
        document.getElementById(
            "audioOffButton"
        );

        const switchCameraButton =
    document.getElementById(
        "switchCameraButton"
    );

    const liveImage =
    document.querySelector(
        ".video-container img"
    );

    const talkButton =
        document.getElementById(
            "talkButton"
        );

    const status =
        document.getElementById(
            "status"
        );


    let audioContext = null;
    let audioSocket = null;
    let nextPlayTime = 0;


    let rtcSocket = null;
let rtcPeerConnection = null;
let rtcStream = null;
let rtcMicrophoneTrack = null;
let rtcReady = false;
let talking = false;

let cameraControlSocket = null;

let frontCameraSelected = false;

let pendingRemoteIceCandidates = [];

// =========================
// CAMERA CONTROL
// =========================

switchCameraButton.addEventListener(
    "click",
    () => {

        const protocol =
            window.location.protocol ===
            "https:"
                ? "wss:"
                : "ws:";

        const sendSwitchCommand = () => {

            cameraControlSocket.send(
                "switch-camera"
            );

            frontCameraSelected =
                !frontCameraSelected;

            setTimeout(
    () => {

        liveImage.style.transform =
            frontCameraSelected
                ? "rotate(270deg)"
                : "rotate(90deg)";

    },
    1800
);

            status.textContent =
                frontCameraSelected
                    ? "📷 Front camera selected"
                    : "📷 Back camera selected";
        };

        if (
            !cameraControlSocket
            ||
            cameraControlSocket.readyState !==
                WebSocket.OPEN
        ) {

            cameraControlSocket =
                new WebSocket(
                    protocol
                    + "//"
                    + window.location.host
                    + "/camera-control"
                );

            cameraControlSocket.onopen =
                sendSwitchCommand;

            cameraControlSocket.onerror =
                () => {

                    status.textContent =
                        "❌ Camera control error";
                };

            return;
        }

        sendSwitchCommand();
    }
);


    // =========================
    // ROOM AUDIO
    // =========================

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

        if (audioContext) {

            await audioContext.resume();

            return;
        }


        const AudioContextClass =
            window.AudioContext
            ||
            window.webkitAudioContext;


        audioContext =
            new AudioContextClass();


        // Unlock Safari audio.
        const unlockBuffer =
            audioContext.createBuffer(
                1,
                1,
                16000
            );

        const unlockSource =
            audioContext
                .createBufferSource();


        unlockSource.buffer =
            unlockBuffer;

        unlockSource.connect(
            audioContext.destination
        );

        unlockSource.start(0);


        await audioContext.resume();


        nextPlayTime =
            audioContext.currentTime;


        const protocol =
            window.location.protocol
            === "https:"
                ? "wss:"
                : "ws:";


        audioSocket =
            new WebSocket(
                protocol
                + "//"
                + window.location.host
                + "/viewer"
            );


        audioSocket.binaryType =
            "arraybuffer";


        audioSocket.onopen = () => {

            status.textContent =
                "✅ Audio connected";

            audioOnButton.textContent =
                "✅ Audio Enabled";
        };


        audioSocket.onerror = () => {

            status.textContent =
                "❌ Audio connection error";
        };


        audioSocket.onclose = () => {

            if (audioContext) {

                status.textContent =
                    "❌ Audio disconnected";
            }
        };


        audioSocket.onmessage = event => {

            playPcmAudio(
                event.data
            );
        };
    }


    function stopAudio(event) {

        if (event) {
            event.preventDefault();
        }


        if (audioSocket) {

            audioSocket.onclose = null;

            try {
                audioSocket.close();

            } catch (ignored) {
            }

            audioSocket = null;
        }


        if (audioContext) {

            try {
                audioContext.close();

            } catch (ignored) {
            }

            audioContext = null;
        }


        nextPlayTime = 0;


        audioOnButton.textContent =
            "🔊 Enable Audio";

        status.textContent =
            "Audio is off";
    }


    function playPcmAudio(arrayBuffer) {

        if (!audioContext) {
            return;
        }


        const view =
            new DataView(
                arrayBuffer
            );


        const sampleCount =
            Math.floor(
                view.byteLength / 2
            );


        if (sampleCount === 0) {
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


        for (
            let i = 0;
            i < sampleCount;
            i++
        ) {

            channel[i] =
                view.getInt16(
                    i * 2,
                    true
                )
                /
                32768;
        }


        const source =
            audioContext
                .createBufferSource();


        source.buffer =
            audioBuffer;


        source.connect(
            audioContext.destination
        );


        const now =
            audioContext.currentTime;


        if (
            nextPlayTime < now
            ||
            nextPlayTime - now > 0.25
        ) {

            nextPlayTime = now;
        }


        source.start(
            nextPlayTime
        );


        nextPlayTime +=
            audioBuffer.duration;
    }

        // =========================
    // WEBRTC TALKBACK
    // =========================

    talkButton.addEventListener(
        "pointerdown",
        event => {
            event.preventDefault();

            try {
                talkButton.setPointerCapture(
                    event.pointerId
                );
            } catch (ignored) {
            }

            startTalk();
        }
    );

    talkButton.addEventListener(
        "pointerup",
        stopTalk
    );

    talkButton.addEventListener(
        "pointercancel",
        stopTalk
    );

    talkButton.addEventListener(
        "lostpointercapture",
        stopTalk
    );


    async function startTalk() {

        if (talking) {
            return;
        }

        talking = true;

        talkButton.textContent =
            "🔴 Connecting...";

        talkButton.classList.add(
            "talking"
        );

        try {

            await ensureWebRtcTalkback();

            if (rtcMicrophoneTrack) {
                rtcMicrophoneTrack.enabled = true;
            }

            talkButton.textContent =
                "🔴 Talking...";

            status.textContent =
                "🎤 WebRTC talkback active";

        } catch (error) {

            talking = false;

            talkButton.textContent =
                "🎤 Hold to Talk";

            talkButton.classList.remove(
                "talking"
            );

            status.textContent =
                "❌ WebRTC error: "
                + error.message;
        }
    }


    function stopTalk(event) {

        if (event) {
            event.preventDefault();
        }

        talking = false;

        if (rtcMicrophoneTrack) {
            rtcMicrophoneTrack.enabled = false;
        }

        talkButton.textContent =
            "🎤 Hold to Talk";

        talkButton.classList.remove(
            "talking"
        );

        if (rtcReady) {
            status.textContent =
                "✅ WebRTC ready";
        }
    }


    async function ensureWebRtcTalkback() {

        if (
            rtcPeerConnection &&
            rtcReady
        ) {
            return;
        }

        if (!rtcStream) {

            rtcStream =
                await navigator.mediaDevices
                    .getUserMedia({
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true,
                            channelCount: 1
                        },
                        video: false
                    });

            rtcMicrophoneTrack =
                rtcStream
                    .getAudioTracks()[0];

            rtcMicrophoneTrack.enabled =
                false;
        }

        rtcPeerConnection =
            new RTCPeerConnection({
                iceServers: [
                    {
                        urls:
                            "stun:stun.l.google.com:19302"
                    }
                ]
            });

        rtcPeerConnection.addTrack(
            rtcMicrophoneTrack,
            rtcStream
        );

        rtcPeerConnection.onicecandidate =
            event => {

                if (
                    !event.candidate ||
                    !rtcSocket ||
                    rtcSocket.readyState !==
                        WebSocket.OPEN
                ) {
                    return;
                }

                rtcSocket.send(
                    JSON.stringify({
                        type: "ice",
                        sdpMid:
                            event.candidate.sdpMid,
                        sdpMLineIndex:
                            event.candidate
                                .sdpMLineIndex,
                        candidate:
                            event.candidate.candidate
                    })
                );
            };

        rtcPeerConnection
            .onconnectionstatechange =
            () => {

                const state =
                    rtcPeerConnection
                        .connectionState;

                if (state === "connected") {

                    rtcReady = true;

                    status.textContent =
                        talking
                            ? "🎤 WebRTC talkback active"
                            : "✅ WebRTC ready";

                    return;
                }

                if (
                    state === "failed" ||
                    state === "disconnected" ||
                    state === "closed"
                ) {

                    rtcReady = false;

                    status.textContent =
                        "❌ WebRTC "
                        + state;
                }
            };

        const protocol =
            window.location.protocol ===
            "https:"
                ? "wss:"
                : "ws:";

        rtcSocket =
            new WebSocket(
                protocol
                + "//"
                + window.location.host
                + "/webrtc-browser"
            );

        await new Promise(
            (resolve, reject) => {

                rtcSocket.onopen =
                    resolve;

                rtcSocket.onerror =
                    () => reject(
                        new Error(
                            "signalling connection failed"
                        )
                    );
            }
        );

        rtcSocket.onmessage =
            async event => {

                try {

                    const message =
                        JSON.parse(
                            event.data
                        );

                    if (
                        message.type ===
                        "answer"
                    ) {

                        await rtcPeerConnection
                            .setRemoteDescription({
                                type: "answer",
                                sdp: message.sdp
                            });

                        for (
                            const candidate
                            of pendingRemoteIceCandidates
                        ) {
                            await rtcPeerConnection
                                .addIceCandidate(
                                    candidate
                                );
                        }

                        pendingRemoteIceCandidates =
                            [];

                        return;
                    }

                    if (
                        message.type ===
                        "ice"
                    ) {

                        const candidate =
                            new RTCIceCandidate({
                                sdpMid:
                                    message.sdpMid,
                                sdpMLineIndex:
                                    message
                                        .sdpMLineIndex,
                                candidate:
                                    message.candidate
                            });

                        if (
                            rtcPeerConnection
                                .remoteDescription
                        ) {

                            await rtcPeerConnection
                                .addIceCandidate(
                                    candidate
                                );

                        } else {

                            pendingRemoteIceCandidates
                                .push(
                                    candidate
                                );
                        }
                    }

                } catch (error) {

                    status.textContent =
                        "❌ WebRTC message error: "
                        + error.message;
                }
            };

        const offer =
            await rtcPeerConnection
                .createOffer({
                    offerToReceiveAudio:
                        false
                });

        await rtcPeerConnection
            .setLocalDescription(
                offer
            );

        rtcSocket.send(
            JSON.stringify({
                type: "offer",
                sdp: offer.sdp
            })
        );
    }

</script>

</body>

</html>
        `);

        return;
    }


    // =========================
    // HOME PAGE
    // =========================

    res.writeHead(200, {
        "Content-Type":
            "text/html; charset=utf-8"
    });


    res.end(`
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
    `);
});


// =========================
// WEBSOCKET SERVER
// =========================

const wss =
    new WebSocket.Server({
        server
    });


wss.on(
    "connection",
    (ws, req) => {


        // WebRTC browser signalling
        if (
            req.url
            === "/webrtc-browser"
        ) {

            webRtcBrowserSocket = ws;


            console.log(
                "WebRTC browser connected"
            );


            ws.on(
                "message",
                message => {

                    if (
                        webRtcDeviceSocket
                        &&
                        webRtcDeviceSocket.readyState
                            === WebSocket.OPEN
                    ) {

                        webRtcDeviceSocket.send(
                            message.toString()
                        );
                    }
                }
            );


            ws.on(
                "close",
                () => {

                    if (
                        webRtcBrowserSocket
                        === ws
                    ) {

                        webRtcBrowserSocket =
                            null;
                    }


                    console.log(
                        "WebRTC browser disconnected"
                    );
                }
            );


            return;
        }


        // WebRTC Samsung signalling
        if (
            req.url
            === "/webrtc-device"
        ) {

            webRtcDeviceSocket = ws;


            console.log(
                "WebRTC device connected"
            );


            ws.on(
                "message",
                message => {

                    if (
                        webRtcBrowserSocket
                        &&
                        webRtcBrowserSocket.readyState
                            === WebSocket.OPEN
                    ) {

                        webRtcBrowserSocket.send(
                            message.toString()
                        );
                    }
                }
            );


            ws.on(
                "close",
                () => {

                    if (
                        webRtcDeviceSocket
                        === ws
                    ) {

                        webRtcDeviceSocket =
                            null;
                    }


                    console.log(
                        "WebRTC device disconnected"
                    );
                }
            );


            return;
        }


        // Browser room-audio viewer
        if (
            req.url
            === "/viewer"
        ) {

            audioViewers.add(ws);


            console.log(
                "Audio viewer connected"
            );


            ws.on(
                "close",
                () => {

                    audioViewers.delete(ws);


                    console.log(
                        "Audio viewer disconnected"
                    );
                }
            );


            return;
        }


        // iPhone talkback
        if (
            req.url
            === "/talk"
        ) {

            console.log(
                "Talkback viewer connected"
            );


            // Tell Samsung:
            // talkback started
            if (
                deviceSocket
                &&
                deviceSocket.readyState
                    === WebSocket.OPEN
            ) {

                deviceSocket.send(
                    Buffer.from([
                        0x04
                    ])
                );
            }


            ws.on(
                "message",
                data => {

                    if (
                        !deviceSocket
                        ||
                        deviceSocket.readyState
                            !== WebSocket.OPEN
                    ) {

                        return;
                    }


                    const audioBytes =
                        Buffer.from(data);


                    if (
                        audioBytes.length === 0
                    ) {

                        return;
                    }


                    const packet =
                        Buffer.alloc(
                            audioBytes.length
                            +
                            1
                        );


                    packet[0] =
                        0x03;


                    audioBytes.copy(
                        packet,
                        1
                    );


                    deviceSocket.send(
                        packet
                    );
                }
            );


            ws.on(
                "close",
                () => {

                    // Tell Samsung:
                    // talkback stopped
                    if (
                        deviceSocket
                        &&
                        deviceSocket.readyState
                            === WebSocket.OPEN
                    ) {

                        deviceSocket.send(
                            Buffer.from([
                                0x05
                            ])
                        );
                    }


                    console.log(
                        "Talkback viewer disconnected"
                    );
                }
            );


            return;
        }

        // Browser camera-control socket
if (
    req.url
    === "/camera-control"
) {

    console.log(
        "Camera-control browser connected"
    );

    ws.on(
        "message",
        message => {

            const command =
                message.toString();

            if (
                command !==
                "switch-camera"
            ) {
                return;
            }

            if (
                deviceSocket
                &&
                deviceSocket.readyState
                    === WebSocket.OPEN
            ) {

                deviceSocket.send(
                    Buffer.from([
                        0x06
                    ])
                );
            }
        }
    );

    ws.on(
        "close",
        () => {

            console.log(
                "Camera-control browser disconnected"
            );
        }
    );

    return;
}


        // Main Samsung stream socket
        console.log(
            "Device connected"
        );


        deviceSocket = ws;


        ws.on(
            "message",
            data => {

                const packet =
                    Buffer.from(data);


                if (
                    packet.length < 2
                ) {

                    return;
                }


                const packetType =
                    packet[0];


                const payload =
                    packet.subarray(1);


                // Video packet
                if (
                    packetType
                    === 0x01
                ) {

                    latestFrame =
                        payload;


                    frameCounter++;


                    if (
                        frameCounter
                        %
                        30
                        === 0
                    ) {

                        console.log(
                            "Video frames received: "
                            +
                            frameCounter
                        );
                    }


                    return;
                }


                // Room audio packet
                if (
                    packetType
                    === 0x02
                ) {

                    audioPacketCounter++;


                    for (
                        const viewer
                        of audioViewers
                    ) {

                        if (
                            viewer.readyState
                            === WebSocket.OPEN
                        ) {

                            viewer.send(
                                payload
                            );
                        }
                    }


                    if (
                        audioPacketCounter
                        %
                        50
                        === 0
                    ) {

                        console.log(
                            "Audio packets received: "
                            +
                            audioPacketCounter
                        );
                    }
                }
            }
        );


        ws.on(
            "close",
            () => {

                if (
                    deviceSocket
                    === ws
                ) {

                    deviceSocket =
                        null;
                }


                console.log(
                    "Device disconnected"
                );
            }
        );
    }
);


// =========================
// START SERVER
// =========================

const PORT =
    process.env.PORT
    ||
    3000;


server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            "RoomGuardian Cloud Relay running on port "
            +
            PORT
        );
    }
);
