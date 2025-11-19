const STORAGE_KEYS = {
  rooms: 'exam_rooms',
  students: 'exam_students',
  theme: 'exam-theme'
};

const state = {
  students: [],
  rooms: [],
  assignments: [],
  roomSummaries: [],
  diagnostics: null,
  sessionId: null,
  sessionDate: null
};

const elements = {};

function initElements() {
  elements.root = document.documentElement;
  elements.themeToggle = document.getElementById('theme-toggle');
  elements.studentStatus = document.getElementById('student-status');
  elements.studentSummary = document.getElementById('student-summary');
  elements.subjectList = document.getElementById('subject-list');
  elements.studentCount = document.getElementById('student-count');
  elements.roomsPreview = document.getElementById('rooms-preview');
  elements.scheduleStatus = document.getElementById('schedule-status');
  elements.diagnosticsPanel = document.getElementById('diagnostics-panel');
  elements.diagnosticsList = document.getElementById('diagnostics-list');
  elements.resultsWrapper = document.getElementById('results');
  elements.assignmentBody = document.getElementById('assignment-body');
  elements.summaries = document.getElementById('summaries');
  elements.metricStudents = document.getElementById('metric-students');
  elements.metricRooms = document.getElementById('metric-rooms');
  elements.metricCapacity = document.getElementById('metric-capacity');
  elements.pdfRoomSelect = document.getElementById('pdf-room-select');
  elements.downloadRoomBtn = document.getElementById('download-room-pdf');
  elements.downloadAllBtn = document.getElementById('download-all-pdf');
  elements.studentFileInput = document.getElementById('student-file');
  elements.studentTextArea = document.getElementById('student-text');
  elements.uploadButton = document.getElementById('upload-btn');
  elements.pasteButton = document.getElementById('paste-btn');
  elements.sampleButton = document.getElementById('sample-btn');
  elements.roomForm = document.getElementById('room-form');
  elements.roomId = document.getElementById('room-id');
  elements.roomName = document.getElementById('room-name');
  elements.roomBenches = document.getElementById('room-benches');
  elements.roomSeats = document.getElementById('room-seats');
  elements.syncRooms = document.getElementById('sync-rooms');
  elements.scheduleButton = document.getElementById('schedule-btn');
  elements.sessionDate = document.getElementById('session-date');
  elements.seedInput = document.getElementById('seed');
}

function initTheme() {
  const preferredTheme = localStorage.getItem(STORAGE_KEYS.theme)
    || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  elements.root.dataset.theme = preferredTheme;
  updateThemeLabel(preferredTheme);
}

function updateThemeLabel(theme) {
  if (!elements.themeToggle) return;
  elements.themeToggle.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
}

function showStatus(el, message, type = 'success') {
  if (!el) return;
  el.textContent = message;
  el.classList.remove('success', 'error');
  el.classList.add(type === 'error' ? 'error' : 'success');
  el.style.display = 'block';
}

function hideStatus(el) {
  if (!el) return;
  el.textContent = '';
  el.style.display = 'none';
}

function renderMetrics() {
  if (!elements.metricStudents) return;
  elements.metricStudents.textContent = state.students.length;
  elements.metricRooms.textContent = state.rooms.length;
  elements.metricCapacity.textContent = state.rooms.reduce(
    (sum, room) => sum + room.num_benches * room.seats_per_bench,
    0
  );
}

function renderStudentSummary(subjectCounts) {
  if (!elements.studentSummary) return;
  elements.studentSummary.style.display = state.students.length ? 'block' : 'none';
  elements.studentCount.textContent = `${state.students.length} students loaded.`;
  elements.subjectList.innerHTML = '';
  Object.entries(subjectCounts).forEach(([subject, count]) => {
    const li = document.createElement('li');
    li.className = 'pill';
    li.textContent = `${subject}: ${count}`;
    elements.subjectList.appendChild(li);
  });
}

function renderRooms() {
  const container = elements.roomsPreview;
  if (!container) return;
  container.innerHTML = '';
  if (!state.rooms.length) {
    container.innerHTML = '<p style="color: var(--muted); margin:0;">No rooms defined yet.</p>';
    return;
  }
  state.rooms.forEach(room => {
    const div = document.createElement('div');
    div.className = 'room-card';
    const capacity = room.num_benches * room.seats_per_bench;
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <strong>${room.room_name}</strong>
        <span class="pill">${room.room_id}</span>
      </div>
      <div style="font-size:0.95rem;">
        <div>Benches: ${room.num_benches}</div>
        <div>Seats / bench: ${room.seats_per_bench}</div>
        <div><strong>Capacity:</strong> ${capacity}</div>
      </div>
      <div class="room-actions">
        <button type="button" class="room-delete" data-remove-room="${room.room_id}">Remove</button>
      </div>
    `;
    container.appendChild(div);
  });
}

function updatePdfControls() {
  const select = elements.pdfRoomSelect;
  if (!select) return;
  select.innerHTML = '';
  const hasAssignments = state.assignments && state.assignments.length > 0;
  const disable = !state.sessionId || !hasAssignments;
  elements.downloadRoomBtn.disabled = disable;
  elements.downloadAllBtn.disabled = disable;

  if (disable) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = state.sessionId ? 'No assignments available' : 'Run scheduler first';
    select.appendChild(opt);
    return;
  }

  const rooms = [];
  state.assignments.forEach(assign => {
    if (!rooms.find(r => r.room_id === assign.room_id)) {
      rooms.push({ room_id: assign.room_id, room_name: assign.room_name });
    }
  });

  rooms.forEach(room => {
    const opt = document.createElement('option');
    opt.value = room.room_id;
    opt.textContent = `${room.room_name} (${room.room_id})`;
    select.appendChild(opt);
  });
}

function renderDiagnostics(diagnostics) {
  if (!elements.diagnosticsPanel) return;
  if (!diagnostics) {
    elements.diagnosticsPanel.style.display = 'none';
    elements.diagnosticsList.innerHTML = '';
    return;
  }
  elements.diagnosticsPanel.style.display = 'block';
  elements.diagnosticsList.innerHTML = '';
  if (diagnostics.conflicts?.length) {
    diagnostics.conflicts.forEach(conflict => {
      const li = document.createElement('li');
      li.className = 'diag-item error';
      li.textContent = conflict.message || JSON.stringify(conflict);
      elements.diagnosticsList.appendChild(li);
    });
  } else {
    const li = document.createElement('li');
    li.className = 'diag-item';
    li.textContent = diagnostics.feasible ? 'All constraints satisfied.' : 'Diagnostics available.';
    elements.diagnosticsList.appendChild(li);
  }
}

function renderResults(assignments, summaries) {
  if (!elements.resultsWrapper) return;
  elements.resultsWrapper.style.display = assignments.length ? 'block' : 'none';
  elements.assignmentBody.innerHTML = '';
  assignments.forEach(a => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${a.room_name}</td>
      <td>#${a.bench_number}</td>
      <td>${a.position}</td>
      <td>${a.student.roll}</td>
      <td>${a.student.name}</td>
      <td>${a.student.subject}</td>
    `;
    elements.assignmentBody.appendChild(tr);
  });
  elements.summaries.innerHTML = '';
  summaries.forEach(summary => {
    const div = document.createElement('div');
    div.className = 'room-card';
    const subjectsMarkup = summary.subjects
      .map(s => `<div><strong>${s.subject}</strong>: ${s.count} (${s.ranges})</div>`).join('');
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <strong>${summary.room_name}</strong>
        <span class="pill">Total: ${summary.total}</span>
      </div>
      ${subjectsMarkup || '<div>No students assigned</div>'}
    `;
    elements.summaries.appendChild(div);
  });
}

function parseCsv(content) {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error('CSV must include headers and at least one data row.');
  }
  const headers = lines[0].split(',').map(h => h.trim());
  const required = ['roll', 'name', 'subject'];
  const missing = required.filter(key => !headers.includes(key));
  if (missing.length) {
    throw new Error(`Missing required columns: ${missing.join(', ')}`);
  }
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.split(',').map(v => v.trim());
    const entry = {};
    headers.forEach((header, idx) => {
      entry[header] = values[idx] || '';
    });
    records.push({
      roll: entry.roll,
      name: entry.name,
      subject: entry.subject,
      preferred_room: entry.preferred_room || ''
    });
  }
  return records;
}

function computeSubjectCounts(students) {
  return students.reduce((acc, student) => {
    const subject = student.subject || 'Unknown';
    acc[subject] = (acc[subject] || 0) + 1;
    return acc;
  }, {});
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Unable to read file.'));
    reader.readAsText(file);
  });
}

async function uploadStudents(source) {
  try {
    let csvContent = '';
    if (source.type === 'file') {
      if (!source.file) {
        showStatus(elements.studentStatus, 'Select a CSV file first.', 'error');
        return;
      }
      csvContent = await readFileAsText(source.file);
    } else if (source.type === 'text') {
      if (!source.text.trim()) {
        showStatus(elements.studentStatus, 'Paste CSV text before submitting.', 'error');
        return;
      }
      csvContent = source.text;
    } else {
      throw new Error('Unknown upload source.');
    }

    showStatus(elements.studentStatus, 'Parsing CSV...');
    const students = parseCsv(csvContent);
    state.students = students;
    localStorage.setItem(STORAGE_KEYS.students, JSON.stringify(students));
    renderStudentSummary(computeSubjectCounts(students));
    renderMetrics();
    showStatus(elements.studentStatus, `Loaded ${students.length} students successfully.`);
  } catch (error) {
    console.error(error);
    showStatus(elements.studentStatus, error.message || 'Failed to upload students.', 'error');
  }
}

function persistRooms() {
  localStorage.setItem(STORAGE_KEYS.rooms, JSON.stringify(state.rooms));
  showStatus(elements.scheduleStatus, 'Rooms saved locally. This state will reload automatically.');
}

function handleRoomRemoval(roomId) {
  state.rooms = state.rooms.filter(room => room.room_id !== roomId);
  renderRooms();
  renderMetrics();
  persistRooms();
}

function loadFromStorage() {
  const storedRooms = localStorage.getItem(STORAGE_KEYS.rooms);
  if (storedRooms) {
    try {
      state.rooms = JSON.parse(storedRooms);
    } catch {
      state.rooms = [];
    }
  }
  const storedStudents = localStorage.getItem(STORAGE_KEYS.students);
  if (storedStudents) {
    try {
      state.students = JSON.parse(storedStudents);
      renderStudentSummary(computeSubjectCounts(state.students));
    } catch {
      state.students = [];
    }
  }
  renderRooms();
  renderMetrics();
}

function runScheduler() {
  if (!state.students.length) {
    showStatus(elements.scheduleStatus, 'Upload students before scheduling.', 'error');
    return;
  }
  if (!state.rooms.length) {
    showStatus(elements.scheduleStatus, 'Define at least one room before scheduling.', 'error');
    return;
  }

  const schedulerEngine = globalThis.SchedulerLib;
  if (!schedulerEngine) {
    showStatus(elements.scheduleStatus, 'Scheduler engine not loaded. Please refresh.', 'error');
    return;
  }

  const payload = {
    students: state.students,
    rooms: state.rooms,
    constraints: { no_same_subject_bench: true }
  };

  const sessionDate = elements.sessionDate.value;
  const seedVal = elements.seedInput.value;
  if (sessionDate) payload.date = sessionDate;
  if (seedVal) payload.seed = Number(seedVal);

  showStatus(elements.scheduleStatus, 'Running scheduler...');
  const result = schedulerEngine.schedule(payload.students, payload.rooms, {
    algorithm: 'greedy',
    constraints: payload.constraints,
    seed: seedVal ? Number(seedVal) : null
  });

  state.assignments = result.assignments || [];
  state.roomSummaries = result.room_summaries || [];
  state.diagnostics = result.diagnostics || null;
  state.sessionId = result.success ? `session_${Date.now()}` : null;
  state.sessionDate = sessionDate || new Date().toLocaleDateString('en-GB');

  renderDiagnostics(state.diagnostics);

  if (!result.success) {
    updatePdfControls();
    const message = result.diagnostics?.conflicts?.map(c => c.message).join('; ') || 'Scheduler reported an issue';
    showStatus(elements.scheduleStatus, message, 'error');
    return;
  }

  showStatus(elements.scheduleStatus, `Schedule ready for session ${state.sessionId}`);
  renderResults(state.assignments, state.roomSummaries);
  updatePdfControls();
}

function openPrintableRoom(roomId) {
  if (!state.sessionId) {
    showStatus(elements.scheduleStatus, 'Run scheduler before downloading.', 'error');
    return;
  }
  const room = state.rooms.find(r => r.room_id === roomId);
  if (!room) {
    showStatus(elements.scheduleStatus, 'Room not found in current state.', 'error');
    return;
  }
  const assignments = state.assignments.filter(a => a.room_id === roomId);
  const summary = state.roomSummaries.find(s => s.room_id === roomId);
  const html = buildPrintableHtml([{ room, assignments, summary }], state.sessionDate);
  openPrintWindow(html);
}

function openPrintableAllRooms() {
  if (!state.sessionId) {
    showStatus(elements.scheduleStatus, 'Run scheduler before downloading.', 'error');
    return;
  }
  const payload = state.rooms.map(room => ({
    room,
    assignments: state.assignments.filter(a => a.room_id === room.room_id),
    summary: state.roomSummaries.find(s => s.room_id === room.room_id)
  }));
  const html = buildPrintableHtml(payload, state.sessionDate);
  openPrintWindow(html);
}

function buildPrintableHtml(roomPayloads, sessionDate) {
  const roomSections = roomPayloads.map(({ room, assignments, summary }) => {
    const subjectLines = summary?.subjects?.map(s => `${s.subject}: ${s.count} (${s.ranges})`).join('<br>') || '';
    const rows = assignments.map(assign => `
      <tr>
        <td>#${assign.bench_number}</td>
        <td>${assign.position}</td>
        <td>${assign.student.roll}</td>
        <td>${assign.student.name}</td>
        <td>${assign.student.subject}</td>
      </tr>
    `).join('');
    return `
      <section class="room">
        <div class="header">
          <div class="date">${sessionDate || ''}</div>
          <div class="room-name">${room.room_name} (${room.room_id})</div>
          <div class="total">Total Students: ${assignments.length}</div>
        </div>
        <div class="subjects">
          ${subjectLines || '<em>No subject breakdown available</em>'}
        </div>
        <table>
          <thead>
            <tr>
              <th>Bench</th>
              <th>Seat</th>
              <th>Roll</th>
              <th>Name</th>
              <th>Subject</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
    `;
  }).join('<div class="page-break"></div>');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Exam Seating Export</title>
  <style>
    body {
      font-family: "Segoe UI", Arial, sans-serif;
      margin: 20px;
      color: #0f172a;
    }
    .room {
      page-break-inside: avoid;
    }
    .header {
      text-align: center;
      margin-bottom: 20px;
    }
    .room-name {
      font-size: 1.4rem;
      font-weight: 600;
    }
    .subjects {
      margin-bottom: 12px;
      font-size: 0.95rem;
      line-height: 1.4;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    th, td {
      border: 1px solid #e2e8f0;
      padding: 8px 10px;
      text-align: left;
    }
    th {
      background: #f8fafc;
    }
    .page-break {
      page-break-after: always;
    }
    @media print {
      body {
        margin: 0;
      }
    }
  </style>
</head>
<body>
  ${roomSections}
</body>
</html>
`;
}

function openPrintWindow(html) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Pop-up blocked. Please allow pop-ups for this site to download PDFs.');
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 500);
}

function attachEventListeners() {
  elements.themeToggle?.addEventListener('click', () => {
    const nextTheme = elements.root.dataset.theme === 'dark' ? 'light' : 'dark';
    elements.root.dataset.theme = nextTheme;
    localStorage.setItem(STORAGE_KEYS.theme, nextTheme);
    updateThemeLabel(nextTheme);
  });

  elements.uploadButton?.addEventListener('click', () => {
    uploadStudents({ type: 'file', file: elements.studentFileInput.files[0] });
  });

  elements.pasteButton?.addEventListener('click', () => {
    uploadStudents({ type: 'text', text: elements.studentTextArea.value });
  });

  elements.sampleButton?.addEventListener('click', async () => {
    try {
      const res = await fetch('./sample-students.csv');
      const csv = await res.text();
      elements.studentTextArea.value = csv;
      uploadStudents({ type: 'text', text: csv });
    } catch (err) {
      showStatus(elements.studentStatus, 'Unable to load sample CSV.', 'error');
    }
  });

  elements.roomForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const room = {
      room_id: elements.roomId.value.trim(),
      room_name: elements.roomName.value.trim(),
      num_benches: Number(elements.roomBenches.value),
      seats_per_bench: Number(elements.roomSeats.value)
    };
    if (!room.room_id || !room.room_name) {
      alert('Room ID and Room Name are required.');
      return;
    }
    const existingIndex = state.rooms.findIndex(r => r.room_id === room.room_id);
    if (existingIndex >= 0) {
      state.rooms[existingIndex] = room;
    } else {
      state.rooms.push(room);
    }
    renderRooms();
    renderMetrics();
    persistRooms();
    e.target.reset();
    elements.roomBenches.value = 10;
    elements.roomSeats.value = 2;
  });

  elements.syncRooms?.addEventListener('click', persistRooms);
  elements.scheduleButton?.addEventListener('click', runScheduler);

  elements.roomsPreview?.addEventListener('click', (event) => {
    const target = event.target.closest('[data-remove-room]');
    if (target) {
      const roomId = target.getAttribute('data-remove-room');
      handleRoomRemoval(roomId);
    }
  });

  elements.downloadRoomBtn?.addEventListener('click', () => {
    const roomId = elements.pdfRoomSelect.value;
    if (!roomId) {
      showStatus(elements.scheduleStatus, 'Select a room to download.', 'error');
      return;
    }
    openPrintableRoom(roomId);
  });

  elements.downloadAllBtn?.addEventListener('click', openPrintableAllRooms);
}

function init() {
  initElements();
  initTheme();
  loadFromStorage();
  attachEventListeners();
  updatePdfControls();
}

document.addEventListener('DOMContentLoaded', init);

