function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const maxSize = 1024 * 1024;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxSize) {
        reject(new Error('Export trop volumineux.'));
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

function normalizeResult(session) {
  const result = session?.result || session || {};
  return {
    summary: typeof result.summary === 'string' ? result.summary : '',
    tasks: Array.isArray(result.tasks) ? result.tasks : [],
    decisions: Array.isArray(result.decisions) ? result.decisions : [],
    deadlines: Array.isArray(result.deadlines) ? result.deadlines : []
  };
}

function formatDate(value) {
  if (!value) return 'Date inconnue';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date inconnue';
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function buildMarkdown(session) {
  const result = normalizeResult(session);
  const lines = [];

  lines.push(`# ${session.title || 'Compte rendu'}`);
  lines.push('');
  lines.push(`Date : ${formatDate(session.createdAt || new Date().toISOString())}`);
  lines.push('');
  lines.push('## Résumé');
  lines.push(result.summary || 'Aucun résumé.');
  lines.push('');

  lines.push('## Tâches');
  if (result.tasks.length) {
    result.tasks.forEach((task) => {
      const assignee = task.assignee ? ` — assigné : ${task.assignee}` : '';
      const priority = task.priority ? ` — priorité : ${task.priority}` : '';
      lines.push(`- ${task.text || 'Tâche sans titre'}${assignee}${priority}`);
    });
  } else {
    lines.push('- Aucune tâche détectée.');
  }
  lines.push('');

  lines.push('## Décisions');
  if (result.decisions.length) {
    result.decisions.forEach((decision) => {
      const context = decision.context ? ` — ${decision.context}` : '';
      lines.push(`- ${decision.text || 'Décision sans titre'}${context}`);
    });
  } else {
    lines.push('- Aucune décision détectée.');
  }
  lines.push('');

  lines.push('## Échéances');
  if (result.deadlines.length) {
    result.deadlines.forEach((deadline) => {
      const date = deadline.date || deadline.date_text || 'date non précisée';
      const related = deadline.related_task ? ` — lié à : ${deadline.related_task}` : '';
      lines.push(`- ${deadline.text || 'Échéance sans titre'} — ${date}${related}`);
    });
  } else {
    lines.push('- Aucune échéance détectée.');
  }

  lines.push('');
  lines.push('---');
  lines.push('Généré avec Carnet Minute. Résultats à vérifier manuellement.');

  return lines.join('\n');
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
    return sendJson(res, 200, { markdown: buildMarkdown(body) });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || 'Erreur serveur pendant l’export.' });
  }
};
