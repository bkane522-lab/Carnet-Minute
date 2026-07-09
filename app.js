(function () {
  'use strict';

  const STORAGE_KEYS = {
    sessions: 'carnetMinute.sessions.v1',
    temp: 'carnetMinute.tempResult.v1'
  };

  function generateId(prefix = 'cm') {
    const random = Math.random().toString(36).slice(2, 10);
    return `${prefix}_${Date.now()}_${random}`;
  }

  function safeJsonParse(value, fallback) {
    try {
      return JSON.parse(value);
    } catch (_) {
      return fallback;
    }
  }

  function getSessions() {
    const raw = localStorage.getItem(STORAGE_KEYS.sessions);
    const sessions = safeJsonParse(raw, []);
    return Array.isArray(sessions) ? sessions : [];
  }

  function saveSessions(sessions) {
    localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(sessions));
  }

  function getSession(id) {
    return getSessions().find((session) => session.id === id) || null;
  }

  function upsertSession(session) {
    const sessions = getSessions();
    const cleanSession = {
      ...session,
      updatedAt: new Date().toISOString()
    };
    const index = sessions.findIndex((item) => item.id === cleanSession.id);

    if (index >= 0) {
      sessions[index] = cleanSession;
    } else {
      sessions.unshift(cleanSession);
    }

    sessions.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    saveSessions(sessions);
    return cleanSession;
  }

  function deleteSession(id) {
    saveSessions(getSessions().filter((session) => session.id !== id));
  }

  function clearSessions() {
    localStorage.removeItem(STORAGE_KEYS.sessions);
  }

  function setTempSession(payload) {
    localStorage.setItem(STORAGE_KEYS.temp, JSON.stringify(payload));
  }

  function getTempSession() {
    const raw = localStorage.getItem(STORAGE_KEYS.temp);
    return safeJsonParse(raw, null);
  }

  function clearTempSession() {
    localStorage.removeItem(STORAGE_KEYS.temp);
  }

  function formatDate(value, options) {
    if (!value) return 'Date inconnue';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Date inconnue';

    return date.toLocaleString('fr-FR', options || {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatDuration(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  function bytesToSize(bytes) {
    if (!Number.isFinite(bytes)) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(2)} MB`;
  }

  function showAlert(target, message, type = 'info') {
    if (!target) return;
    target.hidden = false;
    target.className = `alert ${type}`;
    target.textContent = message;
  }

  function hideAlert(target) {
    if (!target) return;
    target.hidden = true;
    target.className = 'alert';
    target.textContent = '';
  }

  function normalizeResult(result) {
    return {
      summary: typeof result?.summary === 'string' ? result.summary : '',
      tasks: Array.isArray(result?.tasks) ? result.tasks : [],
      decisions: Array.isArray(result?.decisions) ? result.decisions : [],
      deadlines: Array.isArray(result?.deadlines) ? result.deadlines : []
    };
  }

  function makeDefaultTitle() {
    const date = new Date();
    return `Réunion du ${date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })}`;
  }

  function summarizeForCard(summary) {
    if (!summary) return 'Aucun résumé disponible.';
    return summary.length > 165 ? `${summary.slice(0, 165).trim()}…` : summary;
  }

  function buildMarkdown(session) {
    const result = normalizeResult(session.result || session);
    const title = session.title || 'Compte rendu';
    const createdAt = session.createdAt ? formatDate(session.createdAt) : formatDate(new Date().toISOString());

    const lines = [];
    lines.push(`# ${title}`);
    lines.push('');
    lines.push(`Date : ${createdAt}`);
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



  function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function initHomeDashboard() {
    const taskCountNode = document.getElementById('homeTaskCount');
    if (!taskCountNode) return;

    const sessions = getSessions();
    const totals = sessions.reduce((acc, session) => {
      const result = normalizeResult(session.result);
      acc.tasks += result.tasks.length;
      acc.decisions += result.decisions.length;
      acc.deadlines += result.deadlines.length;
      return acc;
    }, { tasks: 0, decisions: 0, deadlines: 0 });

    setText('homeTaskCount', totals.tasks);
    setText('homeDecisionCount', totals.decisions);
    setText('homeDeadlineCount', totals.deadlines);

    const latestCard = document.getElementById('latestSessionCard');
    const latest = sessions[0];
    if (!latestCard || !latest) return;

    const result = normalizeResult(latest.result);
    latestCard.hidden = false;
    setText('latestSessionTitle', latest.title || 'Session récente');
    setText('latestSessionSummary', summarizeForCard(result.summary));

    const link = document.getElementById('latestSessionLink');
    if (link) link.href = `review.html?id=${encodeURIComponent(latest.id)}`;

    const stats = document.getElementById('latestSessionStats');
    if (stats) {
      stats.innerHTML = '';
      [
        `✓ ${result.tasks.length} tâches`,
        `⚖ ${result.decisions.length} décisions`,
        `17 ${result.deadlines.length} échéances`
      ].forEach((text) => {
        const pill = document.createElement('span');
        pill.className = 'meta-pill';
        pill.textContent = text;
        stats.appendChild(pill);
      });
    }
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  window.CMApp = {
    STORAGE_KEYS,
    generateId,
    getSessions,
    saveSessions,
    getSession,
    upsertSession,
    deleteSession,
    clearSessions,
    setTempSession,
    getTempSession,
    clearTempSession,
    formatDate,
    formatDuration,
    bytesToSize,
    showAlert,
    hideAlert,
    normalizeResult,
    makeDefaultTitle,
    summarizeForCard,
    buildMarkdown,
    initHomeDashboard
  };

  initHomeDashboard();
})();
