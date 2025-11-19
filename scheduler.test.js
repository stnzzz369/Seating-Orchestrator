// scheduler.test.js - Unit tests for scheduler
const { schedule, validateConstraints, generateRoomSummaries } = require('./scheduler');

// Simple test framework
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function runTest(name, testFn) {
  try {
    testFn();
    console.log(`✓ ${name}`);
    return true;
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  ${error.message}`);
    return false;
  }
}

// Test data
const sampleStudents = [
  { roll: '1043-1', name: 'Ajay', subject: 'BBA' },
  { roll: '1043-2', name: 'Vijay', subject: 'BBA' },
  { roll: '1043-3', name: 'Sanjay', subject: 'BBA' },
  { roll: '1076-1', name: 'Rahul', subject: 'BCom' },
  { roll: '1076-2', name: 'Rohit', subject: 'BCom' },
  { roll: '1061-1', name: 'Neha', subject: 'BCA' },
  { roll: '1061-2', name: 'Priya', subject: 'BCA' },
  { roll: '1061-3', name: 'Sneha', subject: 'BCA' },
];

const sampleRooms = [
  { room_id: 'R1', room_name: 'Room 1', num_benches: 4, seats_per_bench: 2 }
];

// Tests
console.log('\n=== Running Scheduler Tests ===\n');

let passed = 0;
let failed = 0;

// Test 1: Validate basic scheduling
if (runTest('Basic scheduling with valid input', () => {
  const result = schedule(sampleStudents, sampleRooms);
  assert(result.success, 'Scheduling should succeed');
  assertEqual(result.assignments.length, sampleStudents.length, 'All students should be assigned');
})) passed++; else failed++;

// Test 2: No same subject on same bench
if (runTest('No same subject on same bench constraint', () => {
  const result = schedule(sampleStudents, sampleRooms);
  
  // Group assignments by bench
  const benches = {};
  result.assignments.forEach(a => {
    const key = `${a.room_id}-${a.bench_number}`;
    if (!benches[key]) benches[key] = [];
    benches[key].push(a.student.subject);
  });
  
  // Check each bench
  Object.values(benches).forEach(subjects => {
    if (subjects.length === 2) {
      assert(subjects[0] !== subjects[1], 'No two students of same subject should be on same bench');
    }
  });
})) passed++; else failed++;

// Test 3: Insufficient capacity
if (runTest('Detect insufficient capacity', () => {
  const manyStudents = Array(20).fill(null).map((_, i) => ({
    roll: `${i}`,
    name: `Student ${i}`,
    subject: 'BBA'
  }));
  
  const smallRooms = [
    { room_id: 'R1', room_name: 'Room 1', num_benches: 2, seats_per_bench: 2 }
  ];
  
  const result = schedule(manyStudents, smallRooms);
  assert(!result.success, 'Should fail with insufficient capacity');
  assert(result.diagnostics.suggestions.length > 0, 'Should provide suggestions');
})) passed++; else failed++;

// Test 4: Infeasible due to subject distribution
if (runTest('Detect infeasible subject distribution', () => {
  const imbalancedStudents = [
    ...Array(10).fill(null).map((_, i) => ({ roll: `${i}`, name: `S${i}`, subject: 'BBA' })),
    { roll: '100', name: 'Sole', subject: 'BCom' }
  ];
  
  const result = schedule(imbalancedStudents, sampleRooms);
  // This should fail because we have 10 BBA students but only 11 total seats
  // With bench constraint, max for one subject should be (11+1)/2 = 6
  assert(!result.success, 'Should detect infeasible distribution');
})) passed++; else failed++;

// Test 5: Validate constraints function
if (runTest('Validate constraints - empty inputs', () => {
  const errors = validateConstraints([], []);
  assert(errors.length > 0, 'Should return errors for empty inputs');
})) passed++; else failed++;

// Test 6: Validate constraints - duplicate rolls
if (runTest('Validate constraints - duplicate rolls', () => {
  const duplicateStudents = [
    { roll: '1', name: 'A', subject: 'BBA' },
    { roll: '1', name: 'B', subject: 'BCom' }
  ];
  
  const errors = validateConstraints(duplicateStudents, sampleRooms);
  assert(errors.some(e => e.includes('Duplicate')), 'Should detect duplicate rolls');
})) passed++; else failed++;

// Test 7: Room summaries generation
if (runTest('Generate room summaries correctly', () => {
  const result = schedule(sampleStudents, sampleRooms);
  assert(result.room_summaries.length > 0, 'Should generate room summaries');
  
  const summary = result.room_summaries[0];
  assert(summary.total === sampleStudents.length, 'Summary should have correct total');
  assert(summary.subjects.length > 0, 'Summary should have subject breakdown');
})) passed++; else failed++;

// Test 8: Preferred room handling
if (runTest('Respect preferred room assignments', () => {
  const studentsWithPreference = [
    { roll: '1', name: 'A', subject: 'BBA', preferred_room: 'Room 1' },
    { roll: '2', name: 'B', subject: 'BCom', preferred_room: 'Room 1' },
  ];
  
  const multiRooms = [
    { room_id: 'R1', room_name: 'Room 1', num_benches: 2, seats_per_bench: 2 },
    { room_id: 'R2', room_name: 'Room 2', num_benches: 2, seats_per_bench: 2 }
  ];
  
  const result = schedule(studentsWithPreference, multiRooms);
  
  // Both students should be in Room 1
  const room1Assignments = result.assignments.filter(a => a.room_name === 'Room 1');
  assertEqual(room1Assignments.length, 2, 'Both students should be in preferred room');
})) passed++; else failed++;

// Test 9: Deterministic with seed
if (runTest('Deterministic scheduling with seed', () => {
  const result1 = schedule(sampleStudents, sampleRooms, { seed: 42 });
  const result2 = schedule(sampleStudents, sampleRooms, { seed: 42 });
  
  // Compare assignments
  for (let i = 0; i < result1.assignments.length; i++) {
    assertEqual(
      result1.assignments[i].student.roll,
      result2.assignments[i].student.roll,
      'Same seed should produce same assignments'
    );
  }
})) passed++; else failed++;

// Test 10: Multiple rooms distribution
if (runTest('Distribute students across multiple rooms', () => {
  const multiRooms = [
    { room_id: 'R1', room_name: 'Room 1', num_benches: 2, seats_per_bench: 2 },
    { room_id: 'R2', room_name: 'Room 2', num_benches: 2, seats_per_bench: 2 },
    { room_id: 'R3', room_name: 'Room 3', num_benches: 2, seats_per_bench: 2 }
  ];
  
  const result = schedule(sampleStudents, multiRooms);
  assert(result.success, 'Scheduling should succeed');
  
  // Check that students are distributed
  const roomCounts = {};
  result.assignments.forEach(a => {
    roomCounts[a.room_id] = (roomCounts[a.room_id] || 0) + 1;
  });
  
  assert(Object.keys(roomCounts).length > 1, 'Students should be in multiple rooms');
})) passed++; else failed++;

console.log(`\n=== Test Results ===`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}\n`);

process.exit(failed > 0 ? 1 : 0);