(function () {
  'use strict';

  const elements = {
    sessionTitle: document.getElementById('sessionTitle'),
    summaryInput: document.getElementById('summaryInput'),
    tabs: Array.from(document.querySelectorAll('.section-tab')),
    panels: Array.from(document.querySelectorAll('.items-panel')),
    tasksList: document.getElementById('tasksList'),
    decisionsList: document.getElementById('decisionsList'),
    deadlinesList: document.getElementById('deadlinesList'),
    addTaskBtn: document.getElementById('addTaskBtn'),
    addDecisionBtn: document.getElementById('addDecisionBtn'),
    addDeadlineBtn: document.getElementById('addDeadlineBtn'),
    saveBtn: document.getElementById('saveBtn'),
    exportBtn: document.getElementById('exportBtn'),
    shareBtn: document.getElementById('shareBtn'),
    alertBox: document.getElementById('alertBox')
  };

  let currentSession = null;
  let currentResult = CMApp.normalizeResult({});

  function loadSession() {
    const params = new URLSearchParams(window.location.search);
    const source = params.get('source');
    const id = params.get('id');

    if (source === 'temp') {
      currentSession = CMApp.getTempSession();
    } else if (id) {
      currentSession = CMApp.getSession(id);
    } else {
      currentSession = CMApp.getTempSession();
    }

    if (!currentSession) {
      currentSession = {
        id: CMApp.generateId('manual'),
        title: CMApp.makeDefaultTitle(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        transcript: '',
        result: CMApp.normalizeResult({})
      };
      CMApp.showAlert(elements.alertBox, 'Aucune session trouvée. Vous pouvez créer un compte rendu manuel.', 'info');
    }

    currentResult = CMApp.normalizeResult(currentSession.result);
    elements.sessionTitle.value = currentSession.title || CMApp.makeDefaultTitle();
    elements.summaryInput.value = currentResult.summary || '';
  }

  function switchTab(targetId) {
    elements.tabs.forEach((tab) => {
      tab.classList.toggle('is-active', tab.dataset.target === targetId);
    });

    elements.panels.forEach((panel) => {
      panel.hidden = panel.id !== targetId;
    });
  }

  function createInput(value, placeholder, onInput) {
    const input = document.createElement('input');
    input.className = 'input';
    input.type = 'text';
    input.value = value || '';
    input.placeholder = placeholder || '';
    input.addEventListener('input', () => onInput(input.value));
    return input;
  }

  function createTextarea(value, placeholder, onInput) {
    const textarea = document.createElement('textarea');
    textarea.className = 'textarea';
    textarea.rows = 3;
    textarea.value = value || '';
    textarea.placeholder = placeholder || '';
    textarea.addEventListener('input', () => onInput(textarea.value));
    return textarea;
  }

  function createSelect(value, options, onChange) {
    const select = document.createElement('select');
    select.className = 'select';

    options.forEach((option) => {
      const item = document.createElement('option');
      item.value = option.value;
      item.textContent = option.label;
      select.appendChild(item);
    });

    select.value = value || options[0]?.value || '';
    select.addEventListener('change', () => onChange(select.value));
    return select;
  }

  function createLabel(text) {
    const label = document.createElement('label');
    label.className = 'field-label';
    label.textContent = text;
    return label;
  }

  function createDeleteButton(onClick) {
    const button = document.createElement('button');
    button.className = 'delete-btn';
    button.type = 'button';
    button.textContent = 'Supprimer';
    button.addEventListener('click', onClick);
    return button;
  }

  function renderEmpty(container, message) {
    const empty = document.createElement('div');
    empty.className = 'item-card muted';
    empty.textContent = message;
    container.appendChild(empty);
  }

  function renderTasks() {
    elements.tasksList.innerHTML = '';

    if (!currentResult.tasks.length) {
      renderEmpty(elements.tasksList, 'Aucune tâche détectée. Vous pouvez en ajouter une manuellement.');
      return;
    }

    currentResult.tasks.forEach((task, index) => {
      const card = document.createElement('article');
      card.className = 'item-card';

      const textLabel = createLabel('Tâche');
      const textInput = createTextarea(task.text, 'Action à faire…', (value) => {
        currentResult.tasks[index].text = value;
      });

      const grid = document.createElement('div');
      grid.className = 'item-grid three';

      const assigneeWrap = document.createElement('div');
      assigneeWrap.append(
        createLabel('Assigné'),
        createInput(task.assignee || '', 'Nom ou vide', (value) => {
          currentResult.tasks[index].assignee = value.trim() || null;
        })
      );

      const priorityWrap = document.createElement('div');
      priorityWrap.append(
        createLabel('Priorité'),
        createSelect(task.priority || 'moyenne', [
          { value: 'haute', label: 'Haute' },
          { value: 'moyenne', label: 'Moyenne' },
          { value: 'basse', label: 'Basse' }
        ], (value) => {
          currentResult.tasks[index].priority = value;
          renderTasks();
        })
      );

      const confidenceWrap = document.createElement('div');
      confidenceWrap.append(
        createLabel('Fiabilité'),
        createSelect(task.confidence || 'moyenne', [
          { value: 'haute', label: 'Haute' },
          { value: 'moyenne', label: 'Moyenne' },
          { value: 'basse', label: 'Basse' }
        ], (value) => {
          currentResult.tasks[index].confidence = value;
        })
      );

      grid.append(assigneeWrap, priorityWrap, confidenceWrap);

      const actions = document.createElement('div');
      actions.className = 'item-actions';
      const badge = document.createElement('span');
      badge.className = `badge ${task.priority || 'moyenne'}`;
      badge.textContent = `Priorité ${task.priority || 'moyenne'}`;
      actions.append(badge, createDeleteButton(() => {
        currentResult.tasks.splice(index, 1);
        renderTasks();
      }));

      card.append(textLabel, textInput, grid, actions);
      elements.tasksList.appendChild(card);
    });
  }

  function renderDecisions() {
    elements.decisionsList.innerHTML = '';

    if (!currentResult.decisions.length) {
      renderEmpty(elements.decisionsList, 'Aucune décision détectée. Vous pouvez en ajouter une manuellement.');
      return;
    }

    currentResult.decisions.forEach((decision, index) => {
      const card = document.createElement('article');
      card.className = 'item-card';

      const grid = document.createElement('div');
      grid.className = 'item-grid';

      const textWrap = document.createElement('div');
      textWrap.append(
        createLabel('Décision'),
        createTextarea(decision.text, 'Décision validée…', (value) => {
          currentResult.decisions[index].text = value;
        })
      );

      const confidenceWrap = document.createElement('div');
      confidenceWrap.append(
        createLabel('Fiabilité'),
        createSelect(decision.confidence || 'moyenne', [
          { value: 'haute', label: 'Haute' },
          { value: 'moyenne', label: 'Moyenne' },
          { value: 'basse', label: 'Basse' }
        ], (value) => {
          currentResult.decisions[index].confidence = value;
        })
      );

      grid.append(textWrap, confidenceWrap);

      card.append(
        grid,
        createLabel('Contexte'),
        createTextarea(decision.context, 'Contexte utile…', (value) => {
          currentResult.decisions[index].context = value;
        })
      );

      const actions = document.createElement('div');
      actions.className = 'item-actions';
      const badge = document.createElement('span');
      badge.className = `badge ${decision.confidence || 'moyenne'}`;
      badge.textContent = `Fiabilité ${decision.confidence || 'moyenne'}`;
      actions.append(badge, createDeleteButton(() => {
        currentResult.decisions.splice(index, 1);
        renderDecisions();
      }));

      card.appendChild(actions);
      elements.decisionsList.appendChild(card);
    });
  }

  function sortDeadlines() {
    currentResult.deadlines.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return String(a.date).localeCompare(String(b.date));
    });
  }

  function renderDeadlines() {
    sortDeadlines();
    elements.deadlinesList.innerHTML = '';

    if (!currentResult.deadlines.length) {
      renderEmpty(elements.deadlinesList, 'Aucune échéance détectée. Vous pouvez en ajouter une manuellement.');
      return;
    }

    currentResult.deadlines.forEach((deadline, index) => {
      const card = document.createElement('article');
      card.className = 'item-card';

      card.append(
        createLabel('Échéance'),
        createTextarea(deadline.text, 'Ce qui doit arriver…', (value) => {
          currentResult.deadlines[index].text = value;
        })
      );

      const grid = document.createElement('div');
      grid.className = 'item-grid three';

      const dateWrap = document.createElement('div');
      dateWrap.append(
        createLabel('Date ISO'),
        createInput(deadline.date || '', 'YYYY-MM-DD ou vide', (value) => {
          currentResult.deadlines[index].date = value.trim() || null;
        })
      );

      const dateTextWrap = document.createElement('div');
      dateTextWrap.append(
        createLabel('Expression'),
        createInput(deadline.date_text || '', 'ex : vendredi prochain', (value) => {
          currentResult.deadlines[index].date_text = value.trim() || null;
        })
      );

      const confidenceWrap = document.createElement('div');
      confidenceWrap.append(
        createLabel('Fiabilité'),
        createSelect(deadline.confidence || 'moyenne', [
          { value: 'haute', label: 'Haute' },
          { value: 'moyenne', label: 'Moyenne' },
          { value: 'basse', label: 'Basse' }
        ], (value) => {
          currentResult.deadlines[index].confidence = value;
        })
      );

      grid.append(dateWrap, dateTextWrap, confidenceWrap);

      card.append(
        grid,
        createLabel('Tâche liée'),
        createInput(deadline.related_task || '', 'Tâche liée ou vide', (value) => {
          currentResult.deadlines[index].related_task = value.trim() || null;
        })
      );

      const actions = document.createElement('div');
      actions.className = 'item-actions';
      const badge = document.createElement('span');
      badge.className = `badge ${deadline.confidence || 'moyenne'}`;
      badge.textContent = deadline.date || deadline.date_text || 'Sans date';
      actions.append(badge, createDeleteButton(() => {
        currentResult.deadlines.splice(index, 1);
        renderDeadlines();
      }));

      card.appendChild(actions);
      elements.deadlinesList.appendChild(card);
    });
  }

  function renderAll() {
    renderTasks();
    renderDecisions();
    renderDeadlines();
  }

  function collectSession() {
    currentResult.summary = elements.summaryInput.value.trim();

    return {
      ...currentSession,
      id: currentSession?.id && !currentSession.id.startsWith('temp') ? currentSession.id : CMApp.generateId('session'),
      title: elements.sessionTitle.value.trim() || CMApp.makeDefaultTitle(),
      createdAt: currentSession?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      result: CMApp.normalizeResult(currentResult)
    };
  }

  function saveCurrentSession() {
    const session = collectSession();
    currentSession = CMApp.upsertSession(session);
    CMApp.clearTempSession();
    CMApp.showAlert(elements.alertBox, 'Session sauvegardée dans l’historique local.', 'success');
    window.history.replaceState({}, '', `review.html?id=${encodeURIComponent(currentSession.id)}`);
  }

  async function exportCurrentSession() {
    const session = collectSession();
    CMApp.hideAlert(elements.alertBox);

    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Export serveur indisponible.');
      return payload.markdown || CMApp.buildMarkdown(session);
    } catch (_) {
      return CMApp.buildMarkdown(session);
    }
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  }

  async function handleExport() {
    const markdown = await exportCurrentSession();
    await copyText(markdown);
    CMApp.showAlert(elements.alertBox, 'Export copié dans le presse-papiers.', 'success');
  }

  async function handleShare() {
    const session = collectSession();
    const markdown = await exportCurrentSession();

    if (navigator.share) {
      try {
        await navigator.share({
          title: session.title || 'Compte rendu',
          text: markdown
        });
        return;
      } catch (error) {
        if (error.name === 'AbortError') return;
      }
    }

    await copyText(markdown);
    CMApp.showAlert(elements.alertBox, 'Partage direct indisponible. Le compte rendu a été copié.', 'success');
  }

  function addTask() {
    currentResult.tasks.push({
      text: '',
      assignee: null,
      priority: 'moyenne',
      confidence: 'haute'
    });
    renderTasks();
  }

  function addDecision() {
    currentResult.decisions.push({
      text: '',
      context: '',
      confidence: 'haute'
    });
    renderDecisions();
  }

  function addDeadline() {
    currentResult.deadlines.push({
      text: '',
      date: null,
      date_text: null,
      related_task: null,
      confidence: 'haute'
    });
    renderDeadlines();
  }

  elements.tabs.forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.target));
  });

  elements.addTaskBtn.addEventListener('click', addTask);
  elements.addDecisionBtn.addEventListener('click', addDecision);
  elements.addDeadlineBtn.addEventListener('click', addDeadline);
  elements.saveBtn.addEventListener('click', saveCurrentSession);
  elements.exportBtn.addEventListener('click', handleExport);
  elements.shareBtn.addEventListener('click', handleShare);

  loadSession();
  renderAll();
})();
