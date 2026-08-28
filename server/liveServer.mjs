import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5176;
const DATA_DIR = path.join(__dirname, 'data');
const AUCTIONS_FILE = path.join(DATA_DIR, 'auctions.json');
const CONTRACT_FILE = path.join(DATA_DIR, 'contract.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadJSON(filePath, defaultValue) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) {
    console.warn(`[LiveServer] Error loading ${filePath}:`, e);
  }
  return defaultValue;
}

function saveJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error(`[LiveServer] Error saving ${filePath}:`, e);
  }
}

let auctionsStore = loadJSON(AUCTIONS_FILE, []);
let contractStore = loadJSON(CONTRACT_FILE, { contractAddress: null });

/** Active Server-Sent Event clients */
const sseClients = new Set();

function broadcast(eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/live-stream') {
    // SSE Stream
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(`event: init\ndata: ${JSON.stringify({ auctions: auctionsStore, contractAddress: contractStore.contractAddress })}\n\n`);
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  if (url.pathname === '/api/auctions') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ auctions: auctionsStore }));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          const item = JSON.parse(body);
          const existingIdx = auctionsStore.findIndex(
            (a) => a.itemName === item.itemName || (item.id && String(a.id) === String(item.id))
          );
          if (existingIdx >= 0) {
            auctionsStore[existingIdx] = { ...auctionsStore[existingIdx], ...item, updatedAt: Date.now() };
          } else {
            auctionsStore.unshift({ ...item, createdAt: Date.now(), updatedAt: Date.now() });
          }
          saveJSON(AUCTIONS_FILE, auctionsStore);
          broadcast('auction_update', { auctions: auctionsStore, updatedItem: item });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, auctions: auctionsStore }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }
  }

  if (url.pathname === '/api/contract') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(contractStore));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.contractAddress) {
            contractStore = { contractAddress: data.contractAddress, updatedAt: Date.now() };
            saveJSON(CONTRACT_FILE, contractStore);
            broadcast('contract_update', contractStore);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, ...contractStore }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.info(`[LiveServer] Live auction updates server running on http://localhost:${PORT}`);
});
