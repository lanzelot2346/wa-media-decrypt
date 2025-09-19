import express from 'express';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';

const app = express();
app.use(express.json({ limit: '5mb' }));

// optional simple auth — set an API_KEY in Railway
const API_KEY = process.env.API_KEY;
app.use((req, res, next) => {
  if (!API_KEY) return next();
  if (req.headers['x-api-key'] === API_KEY) return next();
  return res.status(401).json({ error: 'unauthorized' });
});

app.get('/healthz', (_, res) => res.status(200).send('ok'));

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}

app.post('/decrypt-audio', async (req, res) => {
  try {
    // Accept either { audioMessage: {...} } or raw {...}
    const am = req.body?.audioMessage || req.body;
    if (!am?.url || !am?.directPath || !am?.mediaKey) {
      return res.status(400).json({ error: 'missing fields: url, directPath, mediaKey required' });
    }

    const audioMessage = {
      url: am.url,
      directPath: am.directPath,
      mediaKey: Buffer.from(am.mediaKey, 'base64'),
      fileEncSha256: am.fileEncSha256 ? Buffer.from(am.fileEncSha256, 'base64') : undefined,
      mediaKeyTimestamp: am.mediaKeyTimestamp ? Number(am.mediaKeyTimestamp) : undefined,
      mimetype: am.mimetype || 'audio/ogg',
      fileLength: am.fileLength,
      ptt: am.ptt ?? true
    };

    const stream = await downloadContentFromMessage(audioMessage, 'audio'); // Baileys decrypts .enc
    const buf = await streamToBuffer(stream);

    res.setHeader('Content-Type', audioMessage.mimetype || 'audio/ogg');
    res.setHeader('Content-Disposition', 'inline; filename="audio.ogg"');
    res.status(200).send(buf);
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: String(e?.message || e) });
  }
});

const port = process.env.PORT || 8787; // Railway injects PORT
app.listen(port, () => console.log('decrypt server listening on', port));
