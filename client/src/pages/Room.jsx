import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import socket from '../services/socket';
import Podium from '../components/Podium';
import TypeRoom from './TypeRoom';
import { ArrowRightStartOnRectangleIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';

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
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!player || !roomCode) {
      navigate(`/join/${roomCode}`);
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

    return () => {
      socket.off('player_joined');
      socket.off('player_left');
      socket.off('player_buzzed');
      socket.off('buzzers_reset');
      socket.off('answer_marked');
      socket.off('game_started');
      socket.off('game_ended');
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

    // Only allow marking the next player in buzz order
    const nextUnmarkedPlayer = buzzOrder.find(p => !markedPlayers.has(p.id));
    if (!nextUnmarkedPlayer || nextUnmarkedPlayer.id !== playerId) {
      return; // Not the next player to be validated
    }

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
        onBackToHome={handleLeaveRoom}
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
          {/* Header */}
          <div className="mb-6 space-y-4">
            {/* Room Code, Copy Button, and Leave Room */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Room: {roomCode}</h1>
                <button
                  onClick={() => {
                    const roomUrl = `${window.location.origin}/join/${roomCode}`;
                    navigator.clipboard.writeText(roomUrl);
                    setCopied(true);
                    setTimeout(() => {
                      setCopied(false);
                    }, 1000);
                  }}
                  className="text-gray-600 hover:text-gray-800 p-2 transition duration-200"
                  title="Copy room link"
                >
                  {copied ? (
                    <span className="text-green-600 font-bold">✓</span>
                  ) : (
                    <ClipboardDocumentIcon className="w-6 h-6" />
                  )}
                </button>
              </div>
              {/* Leave Room - Heroicon for all views */}
              <button
                onClick={handleLeaveRoom}
                className="text-red-500 hover:text-red-700 p-2 transition duration-200"
                title="Leave Room"
              >
                <ArrowRightStartOnRectangleIcon className="w-6 h-6" />
              </button>
            </div>

            {/* Playing As and Game State */}
            <div className="flex flex-col gap-3">
              <p className="text-gray-600 text-sm sm:text-base">
                Playing as: <span className="font-semibold">{player.name}</span>
                {player.isHost && <span className="ml-2 text-blue-600">(Host)</span>}
              </p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium w-fit ${
                  gameState === 'waiting' ? 'bg-gray-100 text-gray-700' :
                  gameState === 'active' ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {gameState === 'waiting' ? '⏳ Waiting to Start' :
                   gameState === 'active' ? '🎮 Game Active' :
                   '🏁 Game Ended'}
                </span>
                {gameState !== 'active' && (
                  <span className="text-xs sm:text-sm text-gray-500">
                    (Buzzing enabled, but no points awarded)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Fixed Bottom Action Button - Mobile Only */}
          {player.isHost && gameState === 'waiting' && (
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 sm:hidden z-40">
              <button
                onClick={handleStartGame}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-md transition duration-200 font-medium text-lg"
              >
                Start Game
              </button>
            </div>
          )}
          {player.isHost && gameState === 'active' && (
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 sm:hidden z-40">
              <button
                onClick={handleEndGame}
                className="w-full bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-md transition duration-200 font-medium text-lg"
              >
                End Game
              </button>
            </div>
          )}

          {/* Desktop Action Buttons */}
          {player.isHost && (
            <div className="hidden sm:flex gap-2 mb-6">
              {gameState === 'waiting' && (
                <button
                  onClick={handleStartGame}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition duration-200"
                >
                  Start Game
                </button>
              )}
              {gameState === 'active' && (
                <button
                  onClick={handleEndGame}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md transition duration-200"
                >
                  End Game
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-10 gap-8">
            {/* Left Column - Buzzer and Buzz Order (70%) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Buzzer Section */}
              <div className="text-center">
                {!player.isHost ? (
                  <button
                    onClick={handleBuzz}
                    disabled={playerBuzzed}
                    className={`w-48 h-48 rounded-full text-white font-bold text-2xl transition duration-200 ${
                      playerBuzzed
                        ? 'bg-red-500 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 active:scale-95 shadow-lg hover:shadow-xl'
                    }`}
                  >
                    {playerBuzzed ? 'BUZZED!' : 'BUZZ'}
                  </button>
                ) : (
                  <div className="w-48 h-48 mx-auto flex items-center justify-center bg-gray-200 rounded-full text-gray-500 font-medium text-center p-6">
                    Host cannot buzz
                  </div>
                )}
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
                  {player.isHost && gameState === 'active' && (
                    <p className="text-sm text-gray-600 mb-3">
                      Validate answers in order, starting from the fastest buzzer
                    </p>
                  )}
                  <div className="space-y-2">
                    {buzzOrder.map((p, index) => {
                      const isMarked = markedPlayers.has(p.id);
                      const nextUnmarkedPlayer = buzzOrder.find(player => !markedPlayers.has(player.id));
                      const isNextToValidate = nextUnmarkedPlayer && nextUnmarkedPlayer.id === p.id;

                      return (
                        <div
                          key={p.id}
                          className={`flex items-center justify-between p-3 rounded-md border-2 transition-all ${
                            isMarked
                              ? 'bg-gray-100 border-gray-300 opacity-60'
                              : isNextToValidate && player.isHost && gameState === 'active' && roundActive
                              ? 'bg-blue-100 border-blue-500 shadow-md'
                              : 'bg-gray-50 border-gray-300'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            <span className="font-medium">
                              #{p.position} - {p.name}
                            </span>
                            <span className="text-sm text-gray-600">
                              {p.timeDiff === 0 ? '0ms' : `+${(p.timeDiff / 1000).toFixed(3)}s`}
                            </span>
                            {isNextToValidate && player.isHost && gameState === 'active' && roundActive && (
                              <span className="text-xs bg-blue-500 text-white px-2 py-1 rounded-full">
                                Validate Now
                              </span>
                            )}
                          </div>
                          <div className="flex items-center space-x-2">
                            {player.isHost && gameState === 'active' && roundActive && !isMarked && (
                              <div className="flex space-x-1">
                                <button
                                  onClick={() => handleMarkAnswer(p.id, true)}
                                  disabled={!isNextToValidate}
                                  className={`w-8 h-8 rounded-full flex items-center justify-center transition duration-200 ${
                                    isNextToValidate
                                      ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  }`}
                                  title={isNextToValidate ? 'Mark Correct' : 'Wait for previous answers first'}
                                >
                                  ✓
                                </button>
                                <button
                                  onClick={() => handleMarkAnswer(p.id, false)}
                                  disabled={!isNextToValidate}
                                  className={`w-8 h-8 rounded-full flex items-center justify-center transition duration-200 ${
                                    isNextToValidate
                                      ? 'bg-red-500 hover:bg-red-600 text-white cursor-pointer'
                                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  }`}
                                  title={isNextToValidate ? 'Mark Incorrect' : 'Wait for previous answers first'}
                                >
                                  ✗
                                </button>
                              </div>
                            )}
                            {isMarked && (
                              <span className="text-sm text-gray-500">✓ Validated</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
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