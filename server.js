const http = require("http");
const WebSocket = require("ws");

let latestFrame = null;
let latestAudio = null;

let frameCounter = 0;
let audioPacketCounter = 0;

const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/live") {
        res.writeHead(200, {
            "Content-Type": "multipart/x-mixed-replace; boundary=frame",
            "Cache-Control": "no-cache",
            "Connection": "close",
            "Pragma": "no-cache"
        });

        const interval = setInterval(() => {
            if (!latestFrame) return;

            res.write("--frame\r\n");
            res.write("Content-Type: image/jpeg\r\n");
            res.write("Content-Length: " + latestFrame.length + "\r\n\r\n");
            res.write(latestFrame);
            res.write("\r\n");
        }, 100);

        req.on("close", () => clearInterval(interval));
        return;
    }

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h1>RoomGuardian Cloud Relay v2</h1><p>Open /live</p>");
});

const wss = new WebSocket.Server({ server });

wss.on("connection", (ws, req) => {
    console.log("Device connected");

    ws.on("message", (data) => {
    const packet = Buffer.from(data);

    const isJpeg =
        packet.length >= 3 &&
        packet[0] === 0xff &&
        packet[1] === 0xd8 &&
        packet[2] === 0xff;

    if (isJpeg) {
        latestFrame = packet;
        frameCounter++;

        if (frameCounter % 30 === 0) {
            console.log("Video frames received: " + frameCounter);
        }

        return;
    }

    latestAudio = packet;
    audioPacketCounter++;

    if (audioPacketCounter % 50 === 0) {
        console.log("Audio packets received: " + audioPacketCounter);
    }
});

    ws.on("close", () => {
        console.log("Device disconnected");
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
    console.log(`RoomGuardian Cloud Relay v2 running on port ${PORT}`);
    console.log(`WebSocket ready at ws://localhost:${PORT}`);
});
