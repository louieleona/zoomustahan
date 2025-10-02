import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import socket from '../services/socket';

function Home() {
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [roomType, setRoomType] = useState('buzzer'); // 'buzzer' or 'type'
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleCreateRoom = () => {
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }

    setLoading(true);
    setError('');

    socket.connect();

    socket.emit('create_room', { playerName: playerName.trim(), roomType });

    socket.on('room_created', ({ roomCode, player, roomType, gameState }) => {
      setLoading(false);
      navigate(`/room/${roomCode}`, {
        state: {
          player,
          roomCode,
          roomType,
          gameState,
          players: [player]
        }
      });
    });

    socket.on('room_error', (message) => {
      setLoading(false);
      setError(message);
    });
  };

  const handleJoinRoom = () => {
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }

    if (!roomCode.trim()) {
      setError('Please enter a room code');
      return;
    }

    setLoading(true);
    setError('');

    socket.connect();

    socket.emit('join_room', {
      roomCode: roomCode.trim(),
      playerName: playerName.trim()
    });

    socket.on('room_joined', ({ roomCode, player, players, roomType, gameState }) => {
      setLoading(false);
      navigate(`/room/${roomCode}`, {
        state: {
          player,
          roomCode,
          roomType,
          gameState,
          players
        }
      });
    });

    socket.on('room_error', (message) => {
      setLoading(false);
      setError(message);
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-6">
      <div className="bg-white rounded-lg shadow-xl p-10 w-full max-w-lg mx-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Zoomustahan</h1>
          <p className="text-gray-600">Sige ako na mag i-score</p>
        </div>

        <div className="space-y-8">
          <div>
            <label htmlFor="playerName" className="block text-sm font-medium text-gray-700 mb-3">
              Your Name
            </label>
            <input
              type="text"
              id="playerName"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
              placeholder="Enter your name"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Room Type
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setRoomType('buzzer')}
                className={`p-4 border-2 rounded-lg transition duration-200 ${
                  roomType === 'buzzer'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
                disabled={loading}
              >
                <div className="text-center">
                  <div className="text-2xl mb-2">⚡</div>
                  <div className="font-medium">Buzzer Room</div>
                  <div className="text-xs text-gray-600">Traditional quiz buzzer</div>
                </div>
              </button>
              <button
                onClick={() => setRoomType('type')}
                className={`p-4 border-2 rounded-lg transition duration-200 ${
                  roomType === 'type'
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
                disabled={loading}
              >
                <div className="text-center">
                  <div className="text-2xl mb-2">⌨️</div>
                  <div className="font-medium">Type Room</div>
                  <div className="text-xs text-gray-600">Type the correct answer</div>
                </div>
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <button
            onClick={handleCreateRoom}
            disabled={loading}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-4 px-4 rounded-md transition duration-200 disabled:opacity-50 text-lg"
          >
            {loading ? 'Creating...' : 'Create Room'}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">OR</span>
            </div>
          </div>

          <div>
            <label htmlFor="roomCode" className="block text-sm font-medium text-gray-700 mb-3">
              Room Code
            </label>
            <input
              type="text"
              id="roomCode"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-lg"
              placeholder="Enter room code"
              disabled={loading}
            />
          </div>

          <button
            onClick={handleJoinRoom}
            disabled={loading}
            className="w-full bg-purple-500 hover:bg-purple-600 text-white font-medium py-4 px-4 rounded-md transition duration-200 disabled:opacity-50 text-lg"
          >
            {loading ? 'Joining...' : 'Join Room'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Home;