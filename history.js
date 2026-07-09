(function () {
  'use strict';

  const elements = {
    historyList: document.getElementById('historyList'),
    emptyState: document.getElementById('emptyState'),
    clearHistoryBtn: document.getElementById('clearHistoryBtn')
  };

  function countItems(session, key) {
    const result = CMApp.normalizeResult(session.result);
    return result[key]?.length || 0;
  }

  function renderHistory() {
    const sessions = CMApp.getSessions();
    elements.historyList.innerHTML = '';
    elements.emptyState.hidden = sessions.length > 0;
    elements.clearHistoryBtn.disabled = sessions.length === 0;

    sessions.forEach((session) => {
      const result = CMApp.normalizeResult(session.result);
      const card = document.createElement('article');
      card.className = 'history-card';

      const titleRow = document.createElement('div');
      titleRow.className = 'history-title-row';

      const titleWrap = document.createElement('div');
      const title = document.createElement('h2');
      title.textContent = session.title || 'Session sans titre';
      const meta = document.createElement('p');
      meta.className = 'muted';
      meta.textContent = CMApp.formatDate(session.updatedAt || session.createdAt);
      titleWrap.append(title, meta);

      const deleteButton = document.createElement('button');
      deleteButton.className = 'delete-btn';
      deleteButton.type = 'button';
      deleteButton.textContent = 'Supprimer';
      deleteButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const confirmed = confirm('Supprimer cette session ?');
        if (!confirmed) return;
        CMApp.deleteSession(session.id);
        renderHistory();
      });

      titleRow.append(titleWrap, deleteButton);

      const summary = document.createElement('p');
      summary.className = 'muted';
      summary.textContent = CMApp.summarizeForCard(result.summary);

      const stats = document.createElement('div');
      stats.className = 'history-stats';
      [
        `✓ ${countItems(session, 'tasks')} tâches`,
        `🤝 ${countItems(session, 'decisions')} décisions`,
        `📅 ${countItems(session, 'deadlines')} échéances`
      ].forEach((text) => {
        const pill = document.createElement('span');
        pill.className = 'meta-pill';
        pill.textContent = text;
        stats.appendChild(pill);
      });

      card.append(titleRow, summary, stats);
      card.addEventListener('click', () => {
        window.location.href = `review.html?id=${encodeURIComponent(session.id)}`;
      });

      elements.historyList.appendChild(card);
    });
  }

  elements.clearHistoryBtn.addEventListener('click', () => {
    const confirmed = confirm('Vider tout l’historique local ? Cette action est définitive.');
    if (!confirmed) return;
    CMApp.clearSessions();
    renderHistory();
  });

  renderHistory();
})();
