// scheduler.js - Core scheduling algorithms

class SchedulerError extends Error {
  constructor(message, diagnostics) {
    super(message);
    this.diagnostics = diagnostics;
  }
}

/**
 * Greedy pairing algorithm - pairs students ensuring no same subject on bench
 */
function greedyPairScheduler(students, rooms, constraints = {}) {
  const assignments = [];
  const diagnostics = { feasible: true, conflicts: [], suggestions: [] };
  
  // Group students by subject
  const subjectGroups = {};
  students.forEach(s => {
    if (!subjectGroups[s.subject]) subjectGroups[s.subject] = [];
    subjectGroups[s.subject].push(s);
  });
  
  // Calculate total capacity
  const totalCapacity = rooms.reduce((sum, r) => sum + r.num_benches * r.seats_per_bench, 0);
  if (students.length > totalCapacity) {
    diagnostics.feasible = false;
    diagnostics.suggestions.push(`Not enough capacity. Need ${students.length} seats but have ${totalCapacity}.`);
    return { success: false, assignments: [], diagnostics, room_summaries: [] };
  }
  
  // Check feasibility: max subject count should not exceed (total_seats + 1) / 2 for bench constraint
  const subjects = Object.keys(subjectGroups);
  const maxSubjectCount = Math.max(...subjects.map(s => subjectGroups[s].length));
  const requiredSeats = students.length;
  
  if (maxSubjectCount > Math.ceil(requiredSeats / 2)) {
    diagnostics.feasible = false;
    diagnostics.conflicts.push({
      type: 'infeasible',
      message: `Subject with ${maxSubjectCount} students cannot be seated with bench constraint. Maximum allowed: ${Math.ceil(requiredSeats / 2)}`
    });
    return { success: false, assignments: [], diagnostics, room_summaries: [] };
  }
  
  // Distribute students across rooms
  const roomAssignments = rooms.map(r => ({
    room: r,
    students: [],
    capacity: r.num_benches * r.seats_per_bench
  }));
  
  // Respect preferred rooms first
  const unassignedStudents = [];
  students.forEach(student => {
    if (student.preferred_room) {
      const roomAssignment = roomAssignments.find(ra => 
        ra.room.room_name === student.preferred_room || ra.room.room_id === student.preferred_room
      );
      if (roomAssignment && roomAssignment.students.length < roomAssignment.capacity) {
        roomAssignment.students.push(student);
      } else {
        unassignedStudents.push(student);
      }
    } else {
      unassignedStudents.push(student);
    }
  });
  
  // Distribute remaining students evenly
  let roomIdx = 0;
  unassignedStudents.forEach(student => {
    while (roomAssignments[roomIdx].students.length >= roomAssignments[roomIdx].capacity) {
      roomIdx = (roomIdx + 1) % roomAssignments.length;
    }
    roomAssignments[roomIdx].students.push(student);
    roomIdx = (roomIdx + 1) % roomAssignments.length;
  });
  
  // Assign seats within each room using greedy pairing
  roomAssignments.forEach(ra => {
    const roomStudents = ra.students;
    const room = ra.room;
    const seatsPerBench = room.seats_per_bench || 2;
    const positionLabels = seatsPerBench === 2 ? ['left', 'right'] : null;
    
    // Group by subject
    const roomSubjectGroups = {};
    roomStudents.forEach(s => {
      if (!roomSubjectGroups[s.subject]) roomSubjectGroups[s.subject] = [];
      roomSubjectGroups[s.subject].push(s);
    });
    
    let remainingStudents = roomStudents.length;
    
    const getSortedSubjects = () => Object.keys(roomSubjectGroups)
      .filter(subject => roomSubjectGroups[subject].length > 0)
      .sort((a, b) => roomSubjectGroups[b].length - roomSubjectGroups[a].length);
    
    for (let benchIdx = 0; benchIdx < room.num_benches && remainingStudents > 0; benchIdx++) {
      const benchSubjects = new Set();
      const sortedSubjects = getSortedSubjects();
      
      if (!sortedSubjects.length) break;
      
      for (let seatIdx = 0; seatIdx < seatsPerBench && remainingStudents > 0; seatIdx++) {
        let availableSubjects = getSortedSubjects();
        if (!availableSubjects.length) break;
        
        let chosenSubject = availableSubjects.find(subject => !benchSubjects.has(subject));
        let respectedConstraint = true;
        
        if (!chosenSubject) {
          chosenSubject = availableSubjects[0];
          respectedConstraint = false;
        }
        
        const student = roomSubjectGroups[chosenSubject].pop();
        if (!roomSubjectGroups[chosenSubject].length) {
          delete roomSubjectGroups[chosenSubject];
        }
        
        const position = positionLabels
          ? (positionLabels[seatIdx] || `seat_${seatIdx + 1}`)
          : `seat_${seatIdx + 1}`;
        
        assignments.push({
          room_id: room.room_id,
          room_name: room.room_name,
          bench_number: benchIdx + 1,
          position,
          student
        });
        
        remainingStudents--;
        
        if (respectedConstraint) {
          benchSubjects.add(student.subject);
        } else {
          diagnostics.conflicts.push({
            type: 'constraint',
            room: room.room_name,
            bench_number: benchIdx + 1,
            message: `Had to seat two ${student.subject} students on bench ${benchIdx + 1} in ${room.room_name}`
          });
        }
      }
    }
    
    if (remainingStudents > 0) {
      diagnostics.conflicts.push({
        type: 'overflow',
        room: room.room_name,
        message: `Not enough benches in ${room.room_name}`
      });
    }
  });
  
  // Generate room summaries
  const room_summaries = generateRoomSummaries(assignments, rooms);
  
  return {
    success: diagnostics.feasible && diagnostics.conflicts.length === 0,
    assignments,
    diagnostics,
    room_summaries
  };
}

/**
 * Generate summary statistics for each room
 */
function generateRoomSummaries(assignments, rooms) {
  const summaries = [];
  
  rooms.forEach(room => {
    const roomAssignments = assignments.filter(a => a.room_id === room.room_id);
    const subjectCounts = {};
    
    roomAssignments.forEach(a => {
      const subject = a.student.subject;
      subjectCounts[subject] = (subjectCounts[subject] || 0) + 1;
    });
    
    // Group by subject with roll ranges
    const subjectRanges = {};
    roomAssignments.forEach(a => {
      const subject = a.student.subject;
      if (!subjectRanges[subject]) subjectRanges[subject] = [];
      subjectRanges[subject].push(a.student.roll);
    });
    
    // Format ranges
    const formattedSubjects = Object.keys(subjectRanges).sort().map(subject => {
      const rolls = subjectRanges[subject].sort();
      const ranges = formatRollRanges(rolls);
      return {
        subject,
        count: rolls.length,
        ranges
      };
    });
    
    summaries.push({
      room_id: room.room_id,
      room_name: room.room_name,
      total: roomAssignments.length,
      subjects: formattedSubjects,
      subject_counts: subjectCounts
    });
  });
  
  return summaries;
}

/**
 * Format roll numbers into ranges (e.g., "1043-1 to 5" becomes "1 to 5")
 */
function formatRollRanges(rolls) {
  if (rolls.length === 0) return '';
  
  // Extract numeric parts
  const nums = rolls.map(r => {
    const match = r.match(/(\d+)-(\d+)/);
    return match ? parseInt(match[2]) : parseInt(r);
  });
  
  // Find consecutive ranges
  const ranges = [];
  let start = nums[0];
  let end = nums[0];
  
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] === end + 1) {
      end = nums[i];
    } else {
      ranges.push(start === end ? `${start}` : `${start} to ${end}`);
      start = end = nums[i];
    }
  }
  ranges.push(start === end ? `${start}` : `${start} to ${end}`);
  
  return ranges.join(', ');
}

/**
 * Validate constraints before scheduling
 */
function validateConstraints(students, rooms) {
  const errors = [];
  
  if (!students || students.length === 0) {
    errors.push('No students provided');
  }
  
  if (!rooms || rooms.length === 0) {
    errors.push('No rooms provided');
  }
  
  // Check for duplicate rolls
  const rolls = new Set();
  students.forEach(s => {
    if (rolls.has(s.roll)) {
      errors.push(`Duplicate roll number: ${s.roll}`);
    }
    rolls.add(s.roll);
  });
  
  return errors;
}

/**
 * Main scheduling entry point
 */
function schedule(students, rooms, options = {}) {
  const {
    algorithm = 'greedy',
    constraints = { no_same_subject_bench: true },
    seed = null
  } = options;
  
  // Validate inputs
  const validationErrors = validateConstraints(students, rooms);
  if (validationErrors.length > 0) {
    return {
      success: false,
      assignments: [],
      diagnostics: {
        feasible: false,
        conflicts: validationErrors.map(e => ({ type: 'validation', message: e })),
        suggestions: []
      },
      room_summaries: []
    };
  }
  
  // Shuffle students if seed provided
  let processedStudents = [...students];
  if (seed !== null) {
    processedStudents = seededShuffle(processedStudents, seed);
  }
  
  // Run appropriate algorithm
  switch (algorithm) {
    case 'greedy':
      return greedyPairScheduler(processedStudents, rooms, constraints);
    default:
      return greedyPairScheduler(processedStudents, rooms, constraints);
  }
}

/**
 * Seeded shuffle for deterministic randomization
 */
function seededShuffle(array, seed) {
  const arr = [...array];
  let m = arr.length, t, i;
  
  // Simple seeded random number generator
  let random = seed;
  const nextRandom = () => {
    random = (random * 9301 + 49297) % 233280;
    return random / 233280;
  };
  
  while (m) {
    i = Math.floor(nextRandom() * m--);
    t = arr[m];
    arr[m] = arr[i];
    arr[i] = t;
  }
  
  return arr;
}

const schedulerApi = {
  schedule,
  greedyPairScheduler,
  generateRoomSummaries,
  validateConstraints,
  SchedulerError
};

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = schedulerApi;
} else if (typeof globalThis !== 'undefined') {
  globalThis.SchedulerLib = schedulerApi;
}