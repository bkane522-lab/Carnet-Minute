const MAX_BYTES = 4 * 1024 * 1024;

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BYTES + 1024 * 1024) {
        reject(new Error('Fichier trop lourd pour cette V1. Limite serveur : 4 MB.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function splitBuffer(buffer, separator) {
  const parts = [];
  let start = 0;
  let index = buffer.indexOf(separator, start);

  while (index !== -1) {
    parts.push(buffer.slice(start, index));
    start = index + separator.length;
    index = buffer.indexOf(separator, start);
  }

  parts.push(buffer.slice(start));
  return parts;
}

function parseMultipart(buffer, contentType) {
  const boundaryMatch = /boundary=([^;]+)/i.exec(contentType || '');
  if (!boundaryMatch) {
    throw new Error('Requête multipart invalide : boundary manquant.');
  }

  const boundary = Buffer.from(`--${boundaryMatch[1].replace(/^"|"$/g, '')}`);
  const parts = splitBuffer(buffer, boundary);
  const fields = {};
  const files = {};

  for (const rawPart of parts) {
    let part = rawPart;

    if (!part.length) continue;
    if (part.slice(0, 2).toString() === '--') continue;
    if (part.slice(0, 2).toString() === '\r\n') part = part.slice(2);
    if (part.slice(-2).toString() === '\r\n') part = part.slice(0, -2);

    const separator = Buffer.from('\r\n\r\n');
    const headerEnd = part.indexOf(separator);
    if (headerEnd === -1) continue;

    const headerText = part.slice(0, headerEnd).toString('utf8');
    const body = part.slice(headerEnd + separator.length);
    const disposition = /content-disposition:\s*form-data;\s*([^\r\n]+)/i.exec(headerText)?.[1] || '';
    const name = /name="([^"]+)"/i.exec(disposition)?.[1];
    const filename = /filename="([^"]*)"/i.exec(disposition)?.[1];
    const mimeType = /content-type:\s*([^\r\n]+)/i.exec(headerText)?.[1]?.trim() || 'application/octet-stream';

    if (!name) continue;

    if (filename !== undefined) {
      files[name] = {
        filename: filename || 'audio.webm',
        mimeType,
        buffer: body
      };
    } else {
      fields[name] = body.toString('utf8');
    }
  }

  return { fields, files };
}

async function transcribeWithGroq(file) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('Clé GROQ_API_KEY manquante côté serveur.');
  }

  const model = process.env.WHISPER_MODEL || 'whisper-large-v3-turbo';
  const form = new FormData();
  const blob = new Blob([file.buffer], { type: file.mimeType || 'audio/webm' });

  form.append('file', blob, file.filename || 'audio.webm');
  form.append('model', model);
  form.append('response_format', 'json');

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: form
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || 'Erreur Groq pendant la transcription.';
    throw new Error(message);
  }

  return payload.text || payload.transcript || '';
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Méthode non autorisée. Utilisez POST.' });
  }

  try {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return sendJson(res, 400, { error: 'Format attendu : multipart/form-data avec un champ audio.' });
    }

    const rawBody = await readRawBody(req);
    const parsed = parseMultipart(rawBody, contentType);
    const audio = parsed.files.audio || parsed.files.file;

    if (!audio || !audio.buffer?.length) {
      return sendJson(res, 400, { error: 'Aucun fichier audio reçu.' });
    }

    if (audio.buffer.length > MAX_BYTES) {
      return sendJson(res, 413, { error: 'Fichier trop lourd pour cette V1. Limite : 4 MB.' });
    }

    if (!String(audio.mimeType || '').startsWith('audio/')) {
      return sendJson(res, 400, { error: 'Le fichier reçu ne semble pas être un audio.' });
    }

    const transcript = await transcribeWithGroq(audio);

    if (!transcript.trim()) {
      return sendJson(res, 422, { error: 'Transcription vide. Essayez avec un audio plus clair.' });
    }

    return sendJson(res, 200, { transcript });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || 'Erreur serveur pendant la transcription.' });
  }
};
