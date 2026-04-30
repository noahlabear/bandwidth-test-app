import express from 'express';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Constants
// Each /stream request sends data at exactly 1 Mbps for 60 seconds.
//
//   1 Mbps = 125,000 bytes/sec
//   Chunk:  12,500 bytes every 100 ms  →  125,000 bytes/sec = 1 Mbps
//   Duration: 60 s  (long enough for Prometheus 5m rate to register signal)
// ---------------------------------------------------------------------------
const CHUNK_BYTES       = 12_500;   // bytes per write
const CHUNK_INTERVAL_MS = 100;      // ms between writes
const STREAM_DURATION_MS = 60_000; // 60 seconds total per button press

let activeStreams = 0;

// Pre-allocate a reusable chunk of random-ish bytes (avoids per-tick alloc)
const CHUNK = randomBytes(CHUNK_BYTES);

app.use(express.static(join(__dirname, 'public')));

// ── Status endpoint ── polled by the UI every second
app.get('/status', (_req, res) => {
  res.json({ activeStreams });
});

// ── Stream endpoint ── each call generates 1 Mbps egress for 60 seconds
app.get('/stream', (req, res) => {
  activeStreams++;

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  // Tell any proxy not to buffer — keeps the chunks flowing continuously
  res.setHeader('X-Accel-Buffering', 'no');

  let elapsed = 0;
  let done = false;

  const finish = () => {
    if (done) return;
    done = true;
    activeStreams = Math.max(0, activeStreams - 1);
    clearInterval(timer);
    if (!res.writableEnded) res.end();
  };

  const timer = setInterval(() => {
    elapsed += CHUNK_INTERVAL_MS;
    if (!res.writableEnded) res.write(CHUNK);
    if (elapsed >= STREAM_DURATION_MS) finish();
  }, CHUNK_INTERVAL_MS);

  req.on('close', finish);
  req.on('error', finish);
});

app.listen(PORT, () => {
  console.log(`bandwidth-test-app listening on port ${PORT}`);
});
