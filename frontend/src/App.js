import React, { useState } from 'react';
import { Upload, Calendar, Users, Building2, Download, AlertCircle, CheckCircle, Settings } from 'lucide-react';

const API_BASE = 'http://localhost:3001/api';

export default function ExamSeatingApp() {
  const [step, setStep] = useState('upload'); // upload, configure, preview, print
  const [students, setStudents] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [scheduleResult, setScheduleResult] = useState(null);
  const [examDate, setExamDate] = useState(new Date().toLocaleDateString('en-GB'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleStudentUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE}/upload-students`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      
      if (data.success) {
        setStudents(data.students);
        setStep('configure');
      } else {
        setError(data.error || 'Failed to upload students');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRoom = () => {
    setRooms([...rooms, { room_id: `R${rooms.length + 1}`, room_name: `Room ${rooms.length + 1}`, num_benches: 11, seats_per_bench: 2 }]);
  };

  const handleRoomChange = (index, field, value) => {
    const newRooms = [...rooms];
    newRooms[index][field] = field === 'num_benches' || field === 'seats_per_bench' ? parseInt(value) || 0 : value;
    setRooms(newRooms);
  };

  const handleRemoveRoom = (index) => {
    setRooms(rooms.filter((_, i) => i !== index));
  };

  const handleSchedule = async () => {
    if (rooms.length === 0) {
      setError('Please add at least one room');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Save rooms first
      await fetch(`${API_BASE}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rooms }),
      });

      // Run scheduler
      const response = await fetch(`${API_BASE}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          students,
          rooms,
          constraints: { no_same_subject_bench: true },
          date: examDate,
          seed: 42,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setScheduleResult(data);
        setStep('preview');
      } else {
        setError(data.diagnostics?.conflicts.map(c => c.message).join(', ') || 'Scheduling failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrintRoom = (roomId) => {
    const url = `${API_BASE}/room/${roomId}/print?session_id=${scheduleResult.session_id}`;
    window.open(url, '_blank');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-blue-600 text-white py-6 px-8">
        <h1 className="text-3xl font-bold">Exam Seating Arrangement System</h1>
        <p className="text-blue-100 mt-2">Automate seating arrangements with constraint-based scheduling</p>
      </div>

      {/* Navigation */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-8 py-4">
          <div className="flex space-x-6">
            <button
              onClick={() => setStep('upload')}
              className={`flex items-center space-x-2 px-4 py-2 rounded ${step === 'upload' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <Upload size={18} />
              <span>Upload</span>
            </button>
            <button
              onClick={() => setStep('configure')}
              disabled={students.length === 0}
              className={`flex items-center space-x-2 px-4 py-2 rounded ${step === 'configure' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Settings size={18} />
              <span>Configure</span>
            </button>
            <button
              onClick={() => setStep('preview')}
              disabled={!scheduleResult}
              className={`flex items-center space-x-2 px-4 py-2 rounded ${step === 'preview' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Building2 size={18} />
              <span>Preview</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-8 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3">
            <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
            <div className="text-red-700">{error}</div>
          </div>
        )}

        {/* Upload Step */}
        {step === 'upload' && (
          <div className="bg-white rounded-lg shadow-sm p-8">
            <h2 className="text-2xl font-semibold mb-6">Upload Student List</h2>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Students CSV File
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <Upload className="mx-auto text-gray-400 mb-4" size={48} />
                <p className="text-gray-600 mb-4">Upload a CSV file with columns: roll, name, subject, preferred_room</p>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleStudentUpload}
                  className="hidden"
                  id="student-upload"
                />
                <label
                  htmlFor="student-upload"
                  className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700"
                >
                  Choose File
                </label>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-2">CSV Format Example:</h3>
              <pre className="text-sm bg-white p-3 rounded border overflow-x-auto">
{`roll,name,subject,preferred_room
1043-1,Ajay Kumar,BBA,
1076-1,Rahul Singh,BCom,
1061-1,Neha Sharma,BCA,Room 1`}
              </pre>
            </div>

            {students.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center space-x-2 text-green-600 mb-4">
                  <CheckCircle size={20} />
                  <span className="font-semibold">Successfully uploaded {students.length} students</span>
                </div>
                <button
                  onClick={() => setStep('configure')}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Continue to Configure Rooms
                </button>
              </div>
            )}
          </div>
        )}

        {/* Configure Step */}
        {step === 'configure' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm p-8">
              <h2 className="text-2xl font-semibold mb-6">Configure Exam Details</h2>
              
              <div className="grid grid-cols-2 gap-6 mb-8">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Exam Date
                  </label>
                  <input
                    type="text"
                    value={examDate}
                    onChange={(e) => setExamDate(e.target.value)}
                    placeholder="DD.MM.YYYY"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Total Students
                  </label>
                  <div className="px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg">
                    {students.length} students
                  </div>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-semibold">Room Configuration</h3>
                  <button
                    onClick={handleAddRoom}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Add Room
                  </button>
                </div>

                {rooms.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No rooms configured. Click "Add Room" to get started.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {rooms.map((room, index) => (
                      <div key={index} className="border border-gray-200 rounded-lg p-4">
                        <div className="grid grid-cols-4 gap-4">
                          <div>
                            <label className="block text-sm text-gray-600 mb-1">Room ID</label>
                            <input
                              type="text"
                              value={room.room_id}
                              onChange={(e) => handleRoomChange(index, 'room_id', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-600 mb-1">Room Name</label>
                            <input
                              type="text"
                              value={room.room_name}
                              onChange={(e) => handleRoomChange(index, 'room_name', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-600 mb-1">Benches</label>
                            <input
                              type="number"
                              value={room.num_benches}
                              onChange={(e) => handleRoomChange(index, 'num_benches', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded"
                            />
                          </div>
                          <div className="flex items-end space-x-2">
                            <div className="flex-1">
                              <label className="block text-sm text-gray-600 mb-1">Seats/Bench</label>
                              <input
                                type="number"
                                value={room.seats_per_bench}
                                onChange={(e) => handleRoomChange(index, 'seats_per_bench', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded"
                              />
                            </div>
                            <button
                              onClick={() => handleRemoveRoom(index)}
                              className="px-3 py-2 bg-red-100 text-red-600 rounded hover:bg-red-200"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                        <div className="mt-2 text-sm text-gray-500">
                          Capacity: {room.num_benches * room.seats_per_bench} seats
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {rooms.length > 0 && (
                  <div className="mt-6 flex justify-between items-center p-4 bg-blue-50 rounded-lg">
                    <div>
                      <div className="font-semibold">Total Capacity: {rooms.reduce((sum, r) => sum + r.num_benches * r.seats_per_bench, 0)} seats</div>
                      <div className="text-sm text-gray-600">Students: {students.length}</div>
                    </div>
                    <button
                      onClick={handleSchedule}
                      disabled={loading}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {loading ? 'Scheduling...' : 'Generate Seating Arrangement'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Preview Step */}
        {step === 'preview' && scheduleResult && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm p-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-semibold">Seating Arrangement Preview</h2>
                <div className="flex items-center space-x-2 text-green-600">
                  <CheckCircle size={20} />
                  <span className="font-semibold">Successfully scheduled {scheduleResult.assignments.length} students</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6">
                {scheduleResult.room_summaries.map((summary) => (
                  <div key={summary.room_id} className="border border-gray-200 rounded-lg p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-xl font-bold">{summary.room_name}</h3>
                        <p className="text-gray-600">Total: {summary.total} students</p>
                      </div>
                      <button
                        onClick={() => handlePrintRoom(summary.room_id)}
                        className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        <Download size={18} />
                        <span>Print Room Sheet</span>
                      </button>
                    </div>

                    <div className="space-y-2">
                      {summary.subjects.map((subj, idx) => (
                        <div key={idx} className="flex items-center space-x-4 text-sm">
                          <span className="font-semibold w-20">{subj.subject}</span>
                          <span className="flex-1">{subj.ranges}</span>
                          <span className="text-gray-500">({subj.count})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}