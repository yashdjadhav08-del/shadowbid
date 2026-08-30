// Vercel Serverless Function for shared auctions list sync
let auctionsStore = [];

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'POST') {
    try {
      const item = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (item && typeof item === 'object') {
        const existingIdx = auctionsStore.findIndex(
          (a) => a.itemName === item.itemName || (item.id && String(a.id) === String(item.id))
        );
        if (existingIdx >= 0) {
          auctionsStore[existingIdx] = {
            ...auctionsStore[existingIdx],
            ...item,
            updatedAt: Date.now(),
          };
        } else {
          auctionsStore.unshift({
            ...item,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
      }
      return res.status(200).json({ success: true, auctions: auctionsStore });
    } catch (err) {
      return res.status(400).json({ error: String(err) });
    }
  }

  return res.status(200).json({ auctions: auctionsStore });
}
