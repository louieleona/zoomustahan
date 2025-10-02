import { useEffect, useRef } from 'react';

function AnswerChat({ answerLog, currentPlayerId }) {
  const chatEndRef = useRef(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [answerLog]);

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  if (!answerLog || answerLog.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 h-64 flex items-center justify-center">
        <p className="text-gray-500 text-center">
          Answer attempts will appear here when players start answering questions.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 rounded-t-lg">
        <h3 className="text-lg font-semibold text-gray-800">💬 Answer Chat</h3>
        <p className="text-sm text-gray-600">Live feed of all answer attempts</p>
      </div>

      <div className="h-64 overflow-y-auto p-4 space-y-3">
        {answerLog.map((entry) => {
          const isCurrentPlayer = entry.playerId === currentPlayerId;

          return (
            <div key={entry.id} className={`flex ${isCurrentPlayer ? 'justify-end' : 'justify-start'}`}>
              <div className={`relative max-w-xs ${
                isCurrentPlayer
                  ? 'bg-blue-100 text-blue-900 border border-blue-200'
                  : entry.isCorrect
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-red-50 border border-red-200'
              } rounded-lg px-4 py-3 shadow-sm`}>

                {/* Player name and timestamp */}
                <div className={`flex items-center justify-between mb-2 ${
                  isCurrentPlayer ? 'text-blue-700' : 'text-gray-600'
                }`}>
                  <span className="text-xs font-medium truncate pr-2">
                    {isCurrentPlayer ? 'You' : entry.player}
                  </span>
                  <span className="text-xs flex-shrink-0">
                    {formatTime(entry.timestamp)}
                  </span>
                </div>

                {/* Answer text */}
                <div className="mb-2">
                  <span className={`font-mono text-sm break-words ${
                    isCurrentPlayer ? 'text-blue-900' : 'text-gray-900'
                  }`}>
                    "{entry.answer}"
                  </span>
                </div>

                {/* Status indicator */}
                {entry.isCorrect && (
                  <div className={`text-xs font-medium ${
                    isCurrentPlayer ? 'text-green-700' : 'text-green-600'
                  }`}>
                    ✓ Correct!
                  </div>
                )}

              </div>
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>

      <div className="bg-gray-50 px-4 py-2 border-t border-gray-200 rounded-b-lg">
        <p className="text-xs text-gray-600 text-center">
          {answerLog.length} answer{answerLog.length !== 1 ? 's' : ''} submitted
        </p>
      </div>
    </div>
  );
}

export default AnswerChat;