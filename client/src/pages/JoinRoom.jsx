import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import socket from '../services/socket';

function JoinRoom() {
  const [playerName, setPlayerName] = useState('');
  const [role, setRole] = useState('Player'); // 'Player' or 'Voter' for impostor rooms
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { roomCode } = useParams();

  const handleJoinRoom = () => {
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }

    setLoading(true);
    setError('');

    console.log('Joining room with role:', role);

    socket.connect();

    socket.emit('join_room', {
      roomCode: roomCode,
      playerName: playerName.trim(),
      role: role // Will be used for impostor rooms, ignored for others
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

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleJoinRoom();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-6">
      <div className="bg-white rounded-lg shadow-xl p-10 w-full max-w-lg mx-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Zoomustahan</h1>
          <p className="text-gray-600">Sige ako na mag i-score</p>
        </div>

        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-center">
            <p className="text-sm text-gray-600 mb-1">Room Code</p>
            <p className="text-2xl font-bold text-blue-600">{roomCode}</p>
          </div>

          <div>
            <label htmlFor="playerName" className="block text-sm font-medium text-gray-700 mb-3">
              Your Name
            </label>
            <input
              type="text"
              id="playerName"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
              placeholder="Enter your name"
              disabled={loading}
              autoFocus
            />
          </div>

          {/* Role Selection - shown for potential impostor rooms */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Your Role (for Impostor Game rooms)
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => {
                  console.log('Setting role to Player');
                  setRole('Player');
                }}
                className={`p-4 border-2 rounded-lg transition duration-200 ${
                  role === 'Player'
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
                disabled={loading}
              >
                <div className="text-center">
                  <div className="text-2xl mb-2">🎥</div>
                  <div className="font-medium">Player</div>
                  <div className="text-xs text-gray-600">Record video (Max 5)</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  console.log('Setting role to Voter');
                  setRole('Voter');
                }}
                className={`p-4 border-2 rounded-lg transition duration-200 ${
                  role === 'Voter'
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
                disabled={loading}
              >
                <div className="text-center">
                  <div className="text-2xl mb-2">🗳️</div>
                  <div className="font-medium">Voter</div>
                  <div className="text-xs text-gray-600">Watch and vote only</div>
                </div>
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">
              Role only applies to Impostor Game rooms
            </p>
          </div>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <button
            onClick={handleJoinRoom}
            disabled={loading}
            className="w-full bg-purple-500 hover:bg-purple-600 text-white font-medium py-4 px-4 rounded-md transition duration-200 disabled:opacity-50 text-lg"
          >
            {loading ? 'Joining...' : 'Join Room'}
          </button>

          <div className="text-center">
            <button
              onClick={() => navigate('/')}
              className="text-sm text-gray-600 hover:text-gray-800 underline"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default JoinRoom;
