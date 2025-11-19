// server.js - Express backend API
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const { schedule } = require('./scheduler');
const path = require('path');
const PDFDocument = require('pdfkit');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.get('/sample-students.csv', (req, res) => {
  res.sendFile(path.join(__dirname, 'sample-students.csv'));
});

function renderRoomAssignmentSection(doc, room, assignments, date) {
  doc.font('Helvetica-Bold').fontSize(18).text(room.room_name.toUpperCase());
  doc.fontSize(12).text(`Room ID: ${room.room_id}`);
  doc.text(`Exam Date: ${date}`);
  doc.text(`Total Students: ${assignments.length}`);
  doc.moveDown();

  const columnWidths = [80, 80, 120, 160, 120];
  const headers = ['Bench', 'Seat', 'Roll', 'Name', 'Subject'];
  const tableTop = doc.y;

  const drawRow = (values, isHeader = false) => {
    let x = doc.page.margins.left;
    const y = doc.y;
    values.forEach((text, idx) => {
      doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(isHeader ? 11 : 10)
        .text(text, x, y, { width: columnWidths[idx], continued: false });
      x += columnWidths[idx];
    });
    doc.moveDown(0.6);
  };

  drawRow(headers, true);
  doc.moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .stroke();
  doc.moveDown(0.2);

  assignments.forEach(assign => {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 40) {
      doc.addPage();
      drawRow(headers, true);
      doc.moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .stroke();
      doc.moveDown(0.2);
    }

    drawRow([
      `#${assign.bench_number}`,
      assign.position,
      assign.student_roll,
      assign.name,
      assign.subject
    ]);
  });

  doc.moveDown(1);
}

// Initialize database
const db = new sqlite3.Database(':memory:'); // Use ':memory:' for demo, or './exam.db' for persistence

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roll TEXT UNIQUE,
    name TEXT,
    subject TEXT,
    preferred_room TEXT
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT UNIQUE,
    room_name TEXT,
    num_benches INTEGER,
    seats_per_bench INTEGER
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    room_id TEXT,
    bench_number INTEGER,
    position TEXT,
    student_roll TEXT,
    locked INTEGER DEFAULT 0
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    date TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    constraints TEXT
  )`);
});

// Helper function to parse CSV
function parseCSV(content) {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;
    
    const values = lines[i].split(',').map(v => v.trim());
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] || '';
    });
    data.push(obj);
  }
  
  return data;
}

// API Routes

/**
 * POST /api/upload-students
 * Upload student CSV and return parsed data
 */
app.post('/api/upload-students', upload.single('file'), (req, res) => {
  try {
    let csvContent;
    
    if (req.file) {
      csvContent = req.file.buffer.toString('utf-8');
    } else if (req.body.csv_content) {
      csvContent = req.body.csv_content;
    } else {
      return res.status(400).json({ error: 'No CSV file or content provided' });
    }
    
    const students = parseCSV(csvContent);
    
    // Calculate subject counts
    const subjects = {};
    students.forEach(s => {
      subjects[s.subject] = (subjects[s.subject] || 0) + 1;
    });
    
    // Store in database
    const stmt = db.prepare('INSERT OR REPLACE INTO students (roll, name, subject, preferred_room) VALUES (?, ?, ?, ?)');
    students.forEach(s => {
      stmt.run(s.roll, s.name, s.subject, s.preferred_room || '');
    });
    stmt.finalize();
    
    res.json({
      success: true,
      students,
      count: students.length,
      subjects
    });
  } catch (error) {
    console.error('Error uploading students:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/rooms
 * Create or update room definitions
 */
app.post('/api/rooms', (req, res) => {
  try {
    const { rooms } = req.body;
    
    if (!rooms || !Array.isArray(rooms)) {
      return res.status(400).json({ error: 'Invalid rooms data' });
    }
    
    const stmt = db.prepare('INSERT OR REPLACE INTO rooms (room_id, room_name, num_benches, seats_per_bench) VALUES (?, ?, ?, ?)');
    rooms.forEach(r => {
      stmt.run(r.room_id, r.room_name, r.num_benches, r.seats_per_bench);
    });
    stmt.finalize();
    
    res.json({ success: true, rooms });
  } catch (error) {
    console.error('Error saving rooms:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/rooms/:roomId
 * Delete a room definition
 */
app.delete('/api/rooms/:roomId', (req, res) => {
  const { roomId } = req.params;
  db.run('DELETE FROM rooms WHERE room_id = ?', [roomId], function(err) {
    if (err) {
      console.error('Error deleting room:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true, deleted: this.changes });
  });
});

/**
 * GET /api/students
 * Get all students
 */
app.get('/api/students', (req, res) => {
  db.all('SELECT * FROM students', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ students: rows });
  });
});

/**
 * GET /api/rooms
 * Get all rooms
 */
app.get('/api/rooms', (req, res) => {
  db.all('SELECT * FROM rooms', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ rooms: rows });
  });
});

/**
 * POST /api/schedule
 * Run the scheduler
 */
app.post('/api/schedule', (req, res) => {
  try {
    const { students, rooms, constraints, date, seed } = req.body;
    
    if (!students || !rooms) {
      return res.status(400).json({ error: 'Students and rooms are required' });
    }
    
    // Persist rooms to database for downstream artifacts
    const roomStmt = db.prepare('INSERT OR REPLACE INTO rooms (room_id, room_name, num_benches, seats_per_bench) VALUES (?, ?, ?, ?)');
    rooms.forEach(r => {
      roomStmt.run(r.room_id, r.room_name, r.num_benches, r.seats_per_bench);
    });
    roomStmt.finalize();
    
    // Ensure students exist in database for PDF joins
    const studentStmt = db.prepare('INSERT OR REPLACE INTO students (roll, name, subject, preferred_room) VALUES (?, ?, ?, ?)');
    students.forEach(s => {
      studentStmt.run(s.roll, s.name, s.subject, s.preferred_room || '');
    });
    studentStmt.finalize();
    
    // Run scheduler
    const result = schedule(students, rooms, {
      algorithm: 'greedy',
      constraints: constraints || { no_same_subject_bench: true },
      seed: seed || null
    });
    
    // Save session
    const sessionId = `session_${Date.now()}`;
    db.run('INSERT INTO sessions (id, date, constraints) VALUES (?, ?, ?)',
      [sessionId, date || new Date().toLocaleDateString('en-GB'), JSON.stringify(constraints)]);
    
    // Save assignments
    if (result.success) {
      const stmt = db.prepare('INSERT INTO assignments (session_id, room_id, bench_number, position, student_roll) VALUES (?, ?, ?, ?, ?)');
      result.assignments.forEach(a => {
        stmt.run(sessionId, a.room_id, a.bench_number, a.position, a.student.roll);
      });
      stmt.finalize();
    }
    
    res.json({
      ...result,
      session_id: sessionId,
      date: date || new Date().toLocaleDateString('en-GB')
    });
  } catch (error) {
    console.error('Error scheduling:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/room/:id/print
 * Get printable HTML for a specific room
 */
app.get('/api/room/:id/print', (req, res) => {
  const roomId = req.params.id;
  const sessionId = req.query.session_id;
  
  // Get room info
  db.get('SELECT * FROM rooms WHERE room_id = ?', [roomId], (err, room) => {
    if (err || !room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Get assignments
    db.all(`
      SELECT a.*, s.name, s.subject 
      FROM assignments a 
      JOIN students s ON a.student_roll = s.roll 
      WHERE a.room_id = ? AND a.session_id = ?
      ORDER BY a.bench_number, a.position
    `, [roomId, sessionId], (err, assignments) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // Get session date
      db.get('SELECT date FROM sessions WHERE id = ?', [sessionId], (err, session) => {
        const date = session ? session.date : new Date().toLocaleDateString('en-GB');
        
        // Group by subject
        const subjectGroups = {};
        assignments.forEach(a => {
          if (!subjectGroups[a.subject]) {
            subjectGroups[a.subject] = [];
          }
          subjectGroups[a.subject].push(a.student_roll);
        });
        
        // Format subject lines
        const subjectLines = Object.keys(subjectGroups).sort().map(subject => {
          const rolls = subjectGroups[subject].sort();
          const ranges = formatRollRanges(rolls);
          return `${subject} ${ranges} (${rolls.length})`;
        });
        
        // Generate HTML
        const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${room.room_name} - Seating Arrangement</title>
  <style>
    @page { margin: 20mm; }
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 20px;
      font-size: 14pt;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .date {
      font-size: 16pt;
      font-weight: bold;
      margin-bottom: 10px;
    }
    .total {
      font-size: 16pt;
      font-weight: bold;
      margin-bottom: 20px;
    }
    .room-name {
      font-size: 18pt;
      font-weight: bold;
      margin-bottom: 30px;
      text-align: center;
    }
    .subject-list {
      line-height: 2;
    }
    .subject-line {
      margin-bottom: 10px;
    }
    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="date">${date}</div>
    <div class="total">TOTAL - ${assignments.length}</div>
  </div>
  <div class="room-name">${room.room_name.toUpperCase()}</div>
  <div class="subject-list">
    ${subjectLines.map(line => `<div class="subject-line">${line}</div>`).join('')}
  </div>
</body>
</html>
        `;
        
        res.send(html);
      });
    });
  });
});

/**
 * GET /api/session/:sessionId/room/:roomId/pdf
 * Download PDF for a specific room within a session
 */
app.get('/api/session/:sessionId/room/:roomId/pdf', (req, res) => {
  const { sessionId, roomId } = req.params;

  db.get('SELECT * FROM rooms WHERE room_id = ?', [roomId], (roomErr, room) => {
    if (roomErr || !room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    db.get('SELECT date FROM sessions WHERE id = ?', [sessionId], (sessionErr, session) => {
      if (sessionErr || !session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      db.all(`
        SELECT a.*, s.name, s.subject 
        FROM assignments a
        JOIN students s ON a.student_roll = s.roll
        WHERE a.session_id = ? AND a.room_id = ?
        ORDER BY a.bench_number, a.position
      `, [sessionId, roomId], (assignErr, assignments) => {
        if (assignErr) {
          return res.status(500).json({ error: assignErr.message });
        }
        if (!assignments || assignments.length === 0) {
          return res.status(404).json({ error: 'No assignments found for this room' });
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${room.room_id}-${sessionId}.pdf`);

        const doc = new PDFDocument({ margin: 36, size: 'A4' });
        doc.pipe(res);
        renderRoomAssignmentSection(doc, room, assignments, session.date);
        doc.end();
      });
    });
  });
});

/**
 * GET /api/session/:sessionId/pdf
 * Download consolidated PDF for every room in a session
 */
app.get('/api/session/:sessionId/pdf', (req, res) => {
  const { sessionId } = req.params;

  db.get('SELECT date FROM sessions WHERE id = ?', [sessionId], (sessionErr, session) => {
    if (sessionErr || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    db.all(`
      SELECT a.*, s.name, s.subject, r.room_name 
      FROM assignments a
      JOIN students s ON a.student_roll = s.roll
      JOIN rooms r ON r.room_id = a.room_id
      WHERE a.session_id = ?
      ORDER BY r.room_name, a.room_id, a.bench_number, a.position
    `, [sessionId], (assignErr, assignments) => {
      if (assignErr) {
        return res.status(500).json({ error: assignErr.message });
      }
      if (!assignments || assignments.length === 0) {
        return res.status(404).json({ error: 'No assignments found for this session' });
      }

      const grouped = assignments.reduce((acc, assign) => {
        if (!acc[assign.room_id]) {
          acc[assign.room_id] = {
            room: { room_id: assign.room_id, room_name: assign.room_name },
            assignments: []
          };
        }
        acc[assign.room_id].assignments.push(assign);
        return acc;
      }, {});

      const doc = new PDFDocument({ margin: 36, size: 'A4' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=session-${sessionId}.pdf`);
      doc.pipe(res);

      const roomIds = Object.keys(grouped);
      roomIds.forEach((roomId, idx) => {
        const { room, assignments: roomAssignments } = grouped[roomId];
        if (idx > 0) doc.addPage();
        renderRoomAssignmentSection(doc, room, roomAssignments, session.date);
      });

      doc.end();
    });
  });
});

/**
 * POST /api/override
 * Manual override of seat assignment
 */
app.post('/api/override', (req, res) => {
  try {
    const { session_id, from_seat, to_seat } = req.body;
    
    // Swap assignments
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      // Update from_seat
      db.run(`UPDATE assignments 
              SET room_id = ?, bench_number = ?, position = ? 
              WHERE session_id = ? AND room_id = ? AND bench_number = ? AND position = ?`,
        [to_seat.room_id, to_seat.bench_number, to_seat.position,
         session_id, from_seat.room_id, from_seat.bench_number, from_seat.position]);
      
      // Update to_seat
      db.run(`UPDATE assignments 
              SET room_id = ?, bench_number = ?, position = ? 
              WHERE session_id = ? AND room_id = ? AND bench_number = ? AND position = ?`,
        [from_seat.room_id, from_seat.bench_number, from_seat.position,
         session_id, to_seat.room_id, to_seat.bench_number, to_seat.position]);
      
      db.run('COMMIT', (err) => {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
      });
    });
  } catch (error) {
    console.error('Error overriding assignment:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function
function formatRollRanges(rolls) {
  if (rolls.length === 0) return '';
  
  const nums = rolls.map(r => {
    const match = r.match(/(\d+)-(\d+)/);
    return match ? { prefix: match[1], num: parseInt(match[2]), full: r } : { prefix: '', num: parseInt(r), full: r };
  });
  
  const ranges = [];
  let start = nums[0];
  let end = nums[0];
  
  for (let i = 1; i < nums.length; i++) {
    if (nums[i].prefix === end.prefix && nums[i].num === end.num + 1) {
      end = nums[i];
    } else {
      if (start.prefix) {
        ranges.push(start.num === end.num ? `${start.prefix}-${start.num}` : `${start.prefix}-${start.num} to ${end.num}`);
      } else {
        ranges.push(start.num === end.num ? `${start.num}` : `${start.num} to ${end.num}`);
      }
      start = end = nums[i];
    }
  }
  
  if (start.prefix) {
    ranges.push(start.num === end.num ? `${start.prefix}-${start.num}` : `${start.prefix}-${start.num} to ${end.num}`);
  } else {
    ranges.push(start.num === end.num ? `${start.num}` : `${start.num} to ${end.num}`);
  }
  
  return ranges.join(', ');
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}`);
});