(function () {
  'use strict';

  const MAX_FILE_SIZE = 4 * 1024 * 1024;
  const ALERT_SECONDS = 25 * 60;
  const LIMIT_SECONDS = 30 * 60;

  const elements = {
    tabRecord: document.getElementById('tabRecord'),
    tabImport: document.getElementById('tabImport'),
    recordPanel: document.getElementById('recordPanel'),
    importPanel: document.getElementById('importPanel'),
    timer: document.getElementById('timer'),
    recordState: document.getElementById('recordState'),
    pulseDot: document.getElementById('pulseDot'),
    startBtn: document.getElementById('startBtn'),
    pauseBtn: document.getElementById('pauseBtn'),
    stopBtn: document.getElementById('stopBtn'),
    audioPreview: document.getElementById('audioPreview'),
    processRecordingBtn: document.getElementById('processRecordingBtn'),
    audioFile: document.getElementById('audioFile'),
    fileInfo: document.getElementById('fileInfo'),
    processImportBtn: document.getElementById('processImportBtn'),
    progressBox: document.getElementById('progressBox'),
    progressTitle: document.getElementById('progressTitle'),
    progressText: document.getElementById('progressText'),
    alertBox: document.getElementById('alertBox')
  };

  let mediaRecorder = null;
  let stream = null;
  let chunks = [];
  let timerId = null;
  let startedAt = 0;
  let pausedAt = 0;
  let pausedTotal = 0;
  let elapsedSeconds = 0;
  let alertShown = false;
  let recordingBlob = null;
  let importedFile = null;

  function setMode(mode) {
    const isRecord = mode === 'record';
    elements.tabRecord.classList.toggle('is-active', isRecord);
    elements.tabImport.classList.toggle('is-active', !isRecord);
    elements.recordPanel.hidden = !isRecord;
    elements.importPanel.hidden = isRecord;
    CMApp.hideAlert(elements.alertBox);
  }

  function updateTimer() {
    if (!startedAt) return;
    const now = Date.now();
    elapsedSeconds = Math.floor((now - startedAt - pausedTotal) / 1000);
    elements.timer.textContent = CMApp.formatDuration(elapsedSeconds);

    if (elapsedSeconds >= ALERT_SECONDS && !alertShown) {
      alertShown = true;
      CMApp.showAlert(elements.alertBox, 'Vous approchez des 30 minutes. Pour cette V1, gardez des audios courts si possible.', 'info');
    }

    if (elapsedSeconds >= LIMIT_SECONDS && mediaRecorder && mediaRecorder.state !== 'inactive') {
      stopRecording();
      CMApp.showAlert(elements.alertBox, 'Limite douce de 30 minutes atteinte. Enregistrement arrêté automatiquement.', 'info');
    }
  }

  function startTimer() {
    clearInterval(timerId);
    timerId = setInterval(updateTimer, 500);
    updateTimer();
  }

  function stopTimer() {
    clearInterval(timerId);
    timerId = null;
  }

  function resetRecorderUi() {
    elements.startBtn.disabled = false;
    elements.pauseBtn.disabled = true;
    elements.stopBtn.disabled = true;
    elements.pauseBtn.textContent = 'Pause';
    elements.recordState.textContent = 'Prêt à enregistrer';
    elements.pulseDot.classList.remove('is-recording');
  }

  function setBusy(isBusy, title, text) {
    elements.progressBox.hidden = !isBusy;
    elements.progressTitle.textContent = title || 'Traitement en cours';
    elements.progressText.textContent = text || 'Préparation…';
    elements.startBtn.disabled = isBusy;
    elements.pauseBtn.disabled = isBusy || !mediaRecorder || mediaRecorder.state === 'inactive';
    elements.stopBtn.disabled = isBusy || !mediaRecorder || mediaRecorder.state === 'inactive';
    elements.processRecordingBtn.disabled = isBusy;
    elements.processImportBtn.disabled = isBusy || !importedFile;
  }

  function getBestMimeType() {
    const options = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus'
    ];

    if (!window.MediaRecorder) return '';
    return options.find((type) => MediaRecorder.isTypeSupported(type)) || '';
  }

  async function startRecording() {
    CMApp.hideAlert(elements.alertBox);

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      CMApp.showAlert(elements.alertBox, 'Votre navigateur ne supporte pas l’enregistrement audio MediaRecorder.', 'error');
      return;
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getBestMimeType();
      chunks = [];
      recordingBlob = null;
      alertShown = false;
      elapsedSeconds = 0;
      startedAt = Date.now();
      pausedAt = 0;
      pausedTotal = 0;
      elements.timer.textContent = '00:00';
      elements.audioPreview.hidden = true;
      elements.processRecordingBtn.hidden = true;

      mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      mediaRecorder.addEventListener('dataavailable', (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      });

      mediaRecorder.addEventListener('stop', () => {
        const type = mediaRecorder.mimeType || 'audio/webm';
        recordingBlob = new Blob(chunks, { type });
        const url = URL.createObjectURL(recordingBlob);
        elements.audioPreview.src = url;
        elements.audioPreview.hidden = false;
        elements.processRecordingBtn.hidden = false;
        elements.recordState.textContent = `Enregistrement prêt — ${CMApp.bytesToSize(recordingBlob.size)}`;
        resetRecorderUi();
        stopTimer();
        stopStream();
      });

      mediaRecorder.start(1000);
      elements.startBtn.disabled = true;
      elements.pauseBtn.disabled = false;
      elements.stopBtn.disabled = false;
      elements.recordState.textContent = 'Enregistrement en cours…';
      elements.pulseDot.classList.add('is-recording');
      startTimer();
    } catch (error) {
      CMApp.showAlert(elements.alertBox, `Impossible d’accéder au micro : ${error.message || 'permission refusée'}.`, 'error');
      resetRecorderUi();
      stopStream();
    }
  }

  function pauseRecording() {
    if (!mediaRecorder) return;

    if (mediaRecorder.state === 'recording') {
      mediaRecorder.pause();
      pausedAt = Date.now();
      elements.pauseBtn.textContent = 'Reprendre';
      elements.recordState.textContent = 'Enregistrement en pause';
      elements.pulseDot.classList.remove('is-recording');
      stopTimer();
      return;
    }

    if (mediaRecorder.state === 'paused') {
      mediaRecorder.resume();
      pausedTotal += Date.now() - pausedAt;
      pausedAt = 0;
      elements.pauseBtn.textContent = 'Pause';
      elements.recordState.textContent = 'Enregistrement en cours…';
      elements.pulseDot.classList.add('is-recording');
      startTimer();
    }
  }

  function stopRecording() {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
    mediaRecorder.stop();
  }

  function stopStream() {
    if (!stream) return;
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  function onFileSelected(event) {
    CMApp.hideAlert(elements.alertBox);
    importedFile = event.target.files?.[0] || null;
    elements.processImportBtn.disabled = true;

    if (!importedFile) {
      elements.fileInfo.hidden = true;
      return;
    }

    elements.fileInfo.hidden = false;
    elements.fileInfo.textContent = `${importedFile.name} — ${CMApp.bytesToSize(importedFile.size)}`;

    if (!importedFile.type.startsWith('audio/')) {
      CMApp.showAlert(elements.alertBox, 'Le fichier choisi ne semble pas être un audio.', 'error');
      return;
    }

    if (importedFile.size > MAX_FILE_SIZE) {
      CMApp.showAlert(elements.alertBox, 'Fichier trop lourd pour cette V1. Découpez l’audio ou utilisez un fichier plus court.', 'error');
      return;
    }

    elements.processImportBtn.disabled = false;
  }

  function blobToFile(blob) {
    const extension = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
    return new File([blob], `carnet-minute-${Date.now()}.${extension}`, { type: blob.type || 'audio/webm' });
  }

  async function processAudio(fileOrBlob) {
    CMApp.hideAlert(elements.alertBox);

    const file = fileOrBlob instanceof File ? fileOrBlob : blobToFile(fileOrBlob);

    if (!file) {
      CMApp.showAlert(elements.alertBox, 'Aucun audio à traiter.', 'error');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      CMApp.showAlert(elements.alertBox, 'Audio trop lourd pour cette V1. Découpez l’audio ou utilisez un fichier plus court.', 'error');
      return;
    }

    try {
      setBusy(true, 'Transcription', 'Envoi de l’audio à Groq Whisper…');

      const formData = new FormData();
      formData.append('audio', file, file.name || 'audio.webm');

      const transcribeResponse = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData
      });

      const transcribePayload = await transcribeResponse.json().catch(() => ({}));
      if (!transcribeResponse.ok) {
        throw new Error(transcribePayload.error || 'Erreur pendant la transcription.');
      }

      const transcript = transcribePayload.transcript || '';
      if (!transcript.trim()) {
        throw new Error('La transcription est vide. Essayez avec un audio plus clair.');
      }

      setBusy(true, 'Analyse', 'Extraction du résumé, des tâches, décisions et échéances…');

      const extractResponse = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript })
      });

      const extractPayload = await extractResponse.json().catch(() => ({}));
      if (!extractResponse.ok) {
        throw new Error(extractPayload.error || 'Erreur pendant l’analyse.');
      }

      const result = CMApp.normalizeResult(extractPayload);
      const tempSession = {
        id: CMApp.generateId('temp'),
        title: CMApp.makeDefaultTitle(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        transcript,
        result
      };

      CMApp.setTempSession(tempSession);
      window.location.href = 'review.html?source=temp';
    } catch (error) {
      setBusy(false);
      CMApp.showAlert(elements.alertBox, error.message || 'Une erreur inconnue est survenue.', 'error');
    }
  }

  elements.tabRecord.addEventListener('click', () => setMode('record'));
  elements.tabImport.addEventListener('click', () => setMode('import'));
  elements.startBtn.addEventListener('click', startRecording);
  elements.pauseBtn.addEventListener('click', pauseRecording);
  elements.stopBtn.addEventListener('click', stopRecording);
  elements.audioFile.addEventListener('change', onFileSelected);
  elements.processRecordingBtn.addEventListener('click', () => processAudio(recordingBlob));
  elements.processImportBtn.addEventListener('click', () => processAudio(importedFile));

  window.addEventListener('beforeunload', stopStream);

  const initialMode = new URLSearchParams(window.location.search).get('mode');
  setMode(initialMode === 'import' ? 'import' : 'record');
})();
