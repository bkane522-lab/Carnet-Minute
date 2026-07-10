function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const maxSize = 2 * 1024 * 1024;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxSize) {
        reject(new Error('Transcription trop longue pour cette V1.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (_) {
        reject(new Error('JSON invalide dans la requête.'));
      }
    });

    req.on('error', reject);
  });
}

function stripMarkdownFences(value) {
  let text = String(value || '').trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }

  return text;
}

function parseModelJson(content) {
  const cleaned = stripMarkdownFences(content);
  return JSON.parse(cleaned);
}

function normalizePriority(value) {
  const normalized = String(value || 'moyenne').toLowerCase();
  if (['haute', 'moyenne', 'basse'].includes(normalized)) return normalized;
  return 'moyenne';
}

function normalizeConfidence(value) {
  const normalized = String(value || 'moyenne').toLowerCase();
  if (['haute', 'moyenne', 'basse'].includes(normalized)) return normalized;
  return 'moyenne';
}

function asNullableString(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeResult(payload) {
  const tasks = Array.isArray(payload?.tasks) ? payload.tasks : [];
  const decisions = Array.isArray(payload?.decisions) ? payload.decisions : [];
  const deadlines = Array.isArray(payload?.deadlines) ? payload.deadlines : [];

  return {
    summary: typeof payload?.summary === 'string' ? payload.summary.trim() : '',
    tasks: tasks.map((task) => ({
      text: String(task?.text || '').trim(),
      assignee: asNullableString(task?.assignee),
      priority: normalizePriority(task?.priority),
      confidence: normalizeConfidence(task?.confidence)
    })).filter((task) => task.text),
    decisions: decisions.map((decision) => ({
      text: String(decision?.text || '').trim(),
      context: String(decision?.context || '').trim(),
      confidence: normalizeConfidence(decision?.confidence)
    })).filter((decision) => decision.text),
    deadlines: deadlines.map((deadline) => ({
      text: String(deadline?.text || '').trim(),
      date: asNullableString(deadline?.date),
      date_text: asNullableString(deadline?.date_text),
      related_task: asNullableString(deadline?.related_task),
      confidence: normalizeConfidence(deadline?.confidence)
    })).filter((deadline) => deadline.text)
  };
}

function buildPrompt(transcript) {
  return `Tu analyses la transcription d'une réunion ou conversation.

Réponds UNIQUEMENT en JSON valide.
Aucun texte avant ou après.
Aucun markdown.
Aucune phrase d'explication.

Règles importantes :
- N'invente jamais une tâche, une décision, un assigné ou une échéance.
- Si aucune personne n'est clairement assignée, mets "assignee": null.
- Si aucune date explicite n'est mentionnée, mets "date": null.
- Si une date est relative, garde l'expression entendue dans "date_text".
- Si une information est incertaine, indique une confidence basse.
- Une tâche doit être une action concrète à faire.
- Une décision doit être quelque chose qui a été validé ou tranché.
- Une échéance doit être une date, une période ou un délai mentionné.
- Si la transcription contient uniquement des mots de test, des hésitations, "ok", "test", ou aucune information exploitable, retourne un résumé qui dit clairement : "Transcription reçue, mais aucune action claire n’a été détectée." et laisse tasks, decisions et deadlines vides.

Format obligatoire :

{
  "summary": "résumé en 2-3 phrases",
  "tasks": [
    {
      "text": "...",
      "assignee": "nom ou null",
      "priority": "haute/moyenne/basse",
      "confidence": "haute/moyenne/basse"
    }
  ],
  "decisions": [
    {
      "text": "...",
      "context": "...",
      "confidence": "haute/moyenne/basse"
    }
  ],
  "deadlines": [
    {
      "text": "...",
      "date": "YYYY-MM-DD ou null",
      "date_text": "expression entendue ou null",
      "related_task": "... ou null",
      "confidence": "haute/moyenne/basse"
    }
  ]
}

Transcription :
"""
${transcript}
"""`;
}

async function extractWithGroq(transcript) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('Clé GROQ_API_KEY manquante côté serveur.');
  }

  const model = process.env.EXTRACT_MODEL || 'llama-3.3-70b-versatile';

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content: 'Tu es un extracteur strict de comptes rendus. Tu réponds uniquement en JSON valide.'
        },
        {
          role: 'user',
          content: buildPrompt(transcript)
        }
      ]
    })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || 'Erreur Groq pendant l’extraction.';
    throw new Error(message);
  }

  const content = payload?.choices?.[0]?.message?.content || '';
  if (!content.trim()) {
    throw new Error('Réponse IA vide pendant l’extraction.');
  }

  return normalizeResult(parseModelJson(content));
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
    const body = await readJsonBody(req);
    const transcript = String(body?.transcript || '').trim();

    if (!transcript) {
      return sendJson(res, 400, { error: 'Transcription manquante.' });
    }

    const result = await extractWithGroq(transcript);
    return sendJson(res, 200, result);
  } catch (error) {
    return sendJson(res, 500, { error: error.message || 'Erreur serveur pendant l’extraction.' });
  }
};
