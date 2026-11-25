// Tiny local bridge: lets Command Hub read data from the robot.
// The robot's web server sends no CORS headers, so browsers block other pages
// from reading its replies. Run this on a computer on the same network:
//   node tools/robot-proxy.mjs 192.168.0.188
// It listens on http://localhost:8787 and forwards everything to the robot.
import http from "node:http";
// Keep running even if something unexpected happens with one request.
process.on("uncaughtException", (e) => console.error("Fel (bryggan fortsätter):", e.message));

const ROBOT = process.argv[2] || process.env.ROBOT_IP || "192.168.0.188";
const [HOST, RPORT = "80"] = ROBOT.split(":");
const PORT = Number(process.env.PORT || 8787);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Private-Network": "true",
};

http.createServer((req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  // The robot's web server cannot read chunked bodies, so buffer the whole
  // request and send it with an exact Content-Length.
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const headers = { "content-type": req.headers["content-type"] || "text/plain", "content-length": body.length };
    if (req.headers.authorization) headers.authorization = req.headers.authorization;
    // Live camera: /stream is served by the robot's separate stream server on port 81.
    const isStream = req.url.startsWith("/stream");
    const up = http.request({ host: HOST, port: isStream ? 81 : Number(RPORT), path: req.url, method: req.method, headers, timeout: isStream ? 15000 : 8000 }, (r) => {
      res.writeHead(r.statusCode || 502, { ...cors, "content-type": r.headers["content-type"] || "text/plain" });
      r.on("error", () => res.destroy());
      r.pipe(res);
      // Closing the camera view in the browser must also close the robot's stream.
      res.on("close", () => r.destroy());
    });
    up.on("error", (e) => {
      // Never crash the bridge: if the reply already started, just close it.
      if (res.headersSent) { res.destroy(); return; }
      res.writeHead(502, cors); res.end(`Kan inte nå roboten på ${ROBOT}: ${e.message}`);
    });
    up.on("timeout", () => up.destroy(new Error("timeout")));
    up.end(body);
  });
}).on("clientError", (_e, sock) => sock.destroy())
  .listen(PORT, () => console.log(`Brygga igång: http://localhost:${PORT} → http://${ROBOT}`));
