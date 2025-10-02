import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import socket from '../services/socket';
import Podium from '../components/Podium';
import TypeRoom from './TypeRoom';

function Room() {
  const location = useLocation();
  const navigate = useNavigate();
  const { roomCode } = useParams();
  const [players, setPlayers] = useState(location.state?.players || []);
  const [player, setPlayer] = useState(location.state?.player || null);
  const [buzzOrder, setBuzzOrder] = useState([]);
  const [playerBuzzed, setPlayerBuzzed] = useState(false);
  const [roundActive, setRoundActive] = useState(true);
  const [markedPlayers, setMarkedPlayers] = useState(new Set());
  const [gameState, setGameState] = useState(location.state?.gameState || 'waiting');
  const [topPlayers, setTopPlayers] = useState([]);
  const [roomType, setRoomType] = useState(location.state?.roomType || 'buzzer');

  useEffect(() => {
    if (!player || !roomCode) {
      navigate('/');
      return;
    }

    socket.on('player_joined', (newPlayer) => {
      setPlayers(prev => [...prev, newPlayer]);
    });

    socket.on('player_left', ({ playerId, players: updatedPlayers }) => {
      setPlayers(updatedPlayers);
    });

    socket.on('player_buzzed', ({ player: buzzedPlayer, buzzOrder }) => {
      setPlayers(prev =>
        prev.map(p =>
          p.id === buzzedPlayer.id ? { ...p, buzzed: true, buzzTime: buzzedPlayer.buzzTime } : p
        )
      );
      setBuzzOrder(buzzOrder);

      if (buzzedPlayer.id === player.id) {
        setPlayerBuzzed(true);
      }
    });

    socket.on('buzzers_reset', () => {
      setPlayers(prev => prev.map(p => ({ ...p, buzzed: false, buzzTime: null })));
      setBuzzOrder([]);
      setPlayerBuzzed(false);
      setRoundActive(true);
      setMarkedPlayers(new Set());
    });

    socket.on('answer_marked', ({ playerId, correct, players: updatedPlayers, buzzOrder: updatedBuzzOrder }) => {
      setPlayers(updatedPlayers);
      if (updatedBuzzOrder) {
        setBuzzOrder(updatedBuzzOrder);
      }
      setMarkedPlayers(prev => new Set([...prev, playerId]));
      if (correct) {
        setRoundActive(false);
      }
    });

    socket.on('game_started', ({ gameState }) => {
      setGameState(gameState);
    });

    socket.on('game_ended', ({ gameState, topPlayers }) => {
      setGameState(gameState);
      setTopPlayers(topPlayers);
    });

    socket.on('new_game_started', ({ gameState, players }) => {
      setGameState(gameState);
      setPlayers(players);
      setTopPlayers([]);
      setBuzzOrder([]);
      setPlayerBuzzed(false);
      setRoundActive(true);
      setMarkedPlayers(new Set());
    });

    return () => {
      socket.off('player_joined');
      socket.off('player_left');
      socket.off('player_buzzed');
      socket.off('buzzers_reset');
      socket.off('answer_marked');
      socket.off('game_started');
      socket.off('game_ended');
      socket.off('new_game_started');
    };
  }, [player, roomCode, navigate]);

  const handleBuzz = () => {
    if (playerBuzzed) return;
    socket.emit('buzz', roomCode);
  };

  const handleReset = () => {
    if (!player.isHost) return;
    socket.emit('reset_buzzers', roomCode);
  };

  const handleMarkAnswer = (playerId, correct) => {
    if (!player.isHost) return;
    socket.emit('mark_answer', {
      roomCode,
      playerId,
      correct
    });
  };

  const handleStartGame = () => {
    if (!player.isHost) return;
    socket.emit('start_game', roomCode);
  };

  const handleEndGame = () => {
    if (!player.isHost) return;
    socket.emit('end_game', roomCode);
  };

  const handleNewGame = () => {
    if (!player.isHost) return;
    socket.emit('new_game', roomCode);
  };

  const handleLeaveRoom = () => {
    socket.disconnect();
    navigate('/');
  };

  if (!player) {
    return <div>Loading...</div>;
  }

  // Show podium if game has ended
  if (gameState === 'ended') {
    return (
      <Podium
        topPlayers={topPlayers}
        onNewGame={player.isHost ? handleNewGame : undefined}
      />
    );
  }

  // Redirect to TypeRoom if it's a type room
  if (roomType === 'type') {
    return (
      <TypeRoom
        roomCode={roomCode}
        player={player}
        players={players}
        gameState={gameState}
        onLeaveRoom={handleLeaveRoom}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-400 to-blue-500 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-xl p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <div className="flex items-center space-x-3 mb-2">
                <h1 className="text-2xl font-bold text-gray-800">Room: {roomCode}</h1>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(roomCode);
                    // Optional: Show a brief success message
                    const button = event.target;
                    const originalText = button.textContent;
                    button.textContent = '✓';
                    setTimeout(() => {
                      button.textContent = originalText;
                    }, 1000);
                  }}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 p-2 rounded-md transition duration-200"
                  title="Copy room code"
                >
                  📋
                </button>
              </div>
              <p className="text-gray-600">
                Playing as: <span className="font-semibold">{player.name}</span>
                {player.isHost && <span className="ml-2 text-blue-600">(Host)</span>}
              </p>
              <div className="mt-2">
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                  gameState === 'waiting' ? 'bg-yellow-100 text-yellow-800' :
                  gameState === 'active' ? 'bg-green-100 text-green-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {gameState === 'waiting' ? '⏳ Waiting to Start' :
                   gameState === 'active' ? '🎮 Game Active' :
                   '🏁 Game Ended'}
                </span>
                {gameState !== 'active' && (
                  <span className="ml-2 text-sm text-gray-500">
                    (Buzzing enabled, but no points awarded)
                  </span>
                )}
              </div>
            </div>
            <div className="flex space-x-2">
              {player.isHost && gameState === 'waiting' && (
                <button
                  onClick={handleStartGame}
                  className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-md transition duration-200"
                >
                  Start Game
                </button>
              )}
              {player.isHost && gameState === 'active' && (
                <button
                  onClick={handleEndGame}
                  className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-md transition duration-200"
                >
                  End Game
                </button>
              )}
              <button
                onClick={handleLeaveRoom}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md transition duration-200"
              >
                Leave Room
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-10 gap-8">
            {/* Left Column - Buzzer and Buzz Order (70%) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Buzzer Section */}
              <div className="text-center">
                <button
                  onClick={handleBuzz}
                  disabled={playerBuzzed}
                  className={`w-48 h-48 rounded-full text-white font-bold text-2xl transition duration-200 ${
                    playerBuzzed
                      ? 'bg-red-500 cursor-not-allowed'
                      : 'bg-yellow-500 hover:bg-yellow-600 active:scale-95 shadow-lg hover:shadow-xl'
                  }`}
                >
                  {playerBuzzed ? 'BUZZED!' : 'BUZZ'}
                </button>
              </div>

              {player.isHost && (
                <div className="text-center">
                  <button
                    onClick={handleReset}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-md font-medium transition duration-200"
                  >
                    Reset Buzzers
                  </button>
                </div>
              )}

              {/* Buzz Order Section */}
              {buzzOrder.length > 0 && (
                <div>
                  <h2 className="text-xl font-semibold mb-4">Buzz Order</h2>
                  <div className="space-y-2">
                    {buzzOrder.map((p, index) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between p-3 bg-yellow-100 border border-yellow-300 rounded-md"
                      >
                        <div className="flex items-center space-x-3">
                          <span className="font-medium">
                            #{p.position} - {p.name}
                          </span>
                          <span className="text-sm text-gray-600">
                            {p.timeDiff === 0 ? '0ms' : `+${(p.timeDiff / 1000).toFixed(3)}s`}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          {player.isHost && gameState === 'active' && roundActive && !markedPlayers.has(p.id) && (
                            <div className="flex space-x-1">
                              <button
                                onClick={() => handleMarkAnswer(p.id, true)}
                                className="bg-green-500 hover:bg-green-600 text-white w-8 h-8 rounded-full flex items-center justify-center transition duration-200"
                                title="Mark Correct"
                              >
                                ✓
                              </button>
                              <button
                                onClick={() => handleMarkAnswer(p.id, false)}
                                className="bg-red-500 hover:bg-red-600 text-white w-8 h-8 rounded-full flex items-center justify-center transition duration-200"
                                title="Mark Incorrect"
                              >
                                ✗
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column - Players (30%) */}
            <div className="lg:col-span-3">
              <div>
                <h2 className="text-xl font-semibold mb-4">Players ({players.length})</h2>
                <div className="space-y-2">
                  {players.map((p, index) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-3 rounded-md bg-gray-100 border"
                    >
                      <span className="font-medium">
                        {p.name}
                        {p.isHost && <span className="ml-2 text-blue-600 text-sm">(Host)</span>}
                      </span>
                      <span className="bg-blue-500 text-white text-sm px-2 py-1 rounded-full">
                        {p.score || 0}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Room;