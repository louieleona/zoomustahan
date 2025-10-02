import { useEffect, useState } from 'react';

function Podium({ topPlayers, onNewGame }) {
  const [animationStage, setAnimationStage] = useState(0);

  useEffect(() => {
    // Animate podium appearance with delays
    const timeouts = [];

    // Third place appears first
    timeouts.push(setTimeout(() => setAnimationStage(1), 500));
    // Second place appears next
    timeouts.push(setTimeout(() => setAnimationStage(2), 1000));
    // First place appears last
    timeouts.push(setTimeout(() => setAnimationStage(3), 1500));

    return () => timeouts.forEach(clearTimeout);
  }, []);

  const getPodiumHeight = (position) => {
    switch (position) {
      case 1: return 'h-32'; // 1st place - tallest
      case 2: return 'h-24'; // 2nd place - medium
      case 3: return 'h-16'; // 3rd place - shortest
      default: return 'h-16';
    }
  };

  const getPodiumColor = (position) => {
    switch (position) {
      case 1: return 'bg-gradient-to-t from-yellow-400 to-yellow-300'; // Gold
      case 2: return 'bg-gradient-to-t from-gray-400 to-gray-300'; // Silver
      case 3: return 'bg-gradient-to-t from-amber-600 to-amber-500'; // Bronze
      default: return 'bg-gray-400';
    }
  };

  const getAnimation = (position) => {
    const shouldShow =
      (position === 3 && animationStage >= 1) ||
      (position === 2 && animationStage >= 2) ||
      (position === 1 && animationStage >= 3);

    return shouldShow
      ? 'opacity-100 scale-100'
      : 'opacity-0 scale-50';
  };

  const getMedal = (position) => {
    switch (position) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return '';
    }
  };

  // Arrange players for podium display (2nd, 1st, 3rd)
  const podiumOrder = [
    topPlayers[1], // 2nd place (left)
    topPlayers[0], // 1st place (center)
    topPlayers[2]  // 3rd place (right)
  ].filter(Boolean);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-500 to-blue-600 flex flex-col items-center justify-center p-6">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-white mb-4 animate-pulse">
          🎉 Game Complete! 🎉
        </h1>
        <p className="text-xl text-white opacity-90">Final Results</p>
      </div>

      <div className="flex items-end space-x-8 mb-8">
        {podiumOrder.map((player, index) => {
          if (!player) return null;

          const actualPosition = index === 1 ? 1 : index === 0 ? 2 : 3;
          const displayPosition = player === topPlayers[0] ? 1 : player === topPlayers[1] ? 2 : 3;

          return (
            <div key={player.id} className="flex flex-col items-center">
              {/* Player Info */}
              <div className={`text-center mb-4 transition-all duration-500 ${getAnimation(displayPosition)}`}>
                <div className="text-4xl mb-2">{getMedal(displayPosition)}</div>
                <h3 className="font-bold text-2xl text-white">{player.name}</h3>
              </div>

              {/* Podium Block */}
              <div className={`
                w-24 ${getPodiumHeight(displayPosition)} ${getPodiumColor(displayPosition)}
                rounded-t-lg shadow-lg border-2 border-white border-opacity-30
                transition-all duration-500 ${getAnimation(displayPosition)}
              `}>
              </div>
            </div>
          );
        })}
      </div>

      {/* All Players Scores */}
      <div className="bg-white bg-opacity-90 rounded-lg p-6 shadow-xl max-w-md w-full">
        <h3 className="text-lg font-bold text-gray-800 mb-4 text-center">Final Scores</h3>
        <div className="space-y-2">
          {topPlayers.map((player, index) => (
            <div key={player.id} className="flex justify-between items-center p-2 rounded bg-gray-50">
              <span className="font-medium">
                {getMedal(index + 1)} {player.name}
              </span>
              <span className="font-bold text-blue-600">{player.score}</span>
            </div>
          ))}
        </div>
      </div>

      {onNewGame && (
        <button
          onClick={onNewGame}
          className="mt-8 bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-8 rounded-lg shadow-lg transition duration-200 animate-pulse"
        >
          Start New Game
        </button>
      )}
    </div>
  );
}

export default Podium;