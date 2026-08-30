// Vercel Serverless Function for shared contract address discovery
let contractStore = { contractAddress: null, updatedAt: null };

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (body?.contractAddress) {
        contractStore = {
          contractAddress: body.contractAddress,
          updatedAt: Date.now(),
        };
      }
      return res.status(200).json({ success: true, ...contractStore });
    } catch (err) {
      return res.status(400).json({ error: String(err) });
    }
  }

  return res.status(200).json(contractStore);
}
