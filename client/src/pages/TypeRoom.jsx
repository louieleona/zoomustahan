import { useState, useEffect, useRef } from 'react';
import socket from '../services/socket';
import AnswerChat from '../components/AnswerChat';
import Podium from '../components/Podium';
import { ArrowRightStartOnRectangleIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';

function TypeRoom({ roomCode, player, players: initialPlayers, gameState, onLeaveRoom }) {
  const [players, setPlayers] = useState(initialPlayers);
  const [questions, setQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(-1);
  const [currentQuestionAnswerType, setCurrentQuestionAnswerType] = useState('text');
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [newAnswerType, setNewAnswerType] = useState('text'); // default to text
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [editQuestion, setEditQuestion] = useState('');
  const [editAnswer, setEditAnswer] = useState('');
  const [editAnswerType, setEditAnswerType] = useState('text');
  const [playerAnswer, setPlayerAnswer] = useState('');
  const [hasAnswered, setHasAnswered] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [answerLog, setAnswerLog] = useState([]);
  const [topPlayers, setTopPlayers] = useState([]);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const [uploadError, setUploadError] = useState(null);
  const [pendingUpload, setPendingUpload] = useState(null);
  const [showUploadConfirm, setShowUploadConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    socket.on('question_added', ({ questions }) => {
      setQuestions(questions);
    });

    socket.on('question_updated', ({ questions }) => {
      setQuestions(questions);
    });

    socket.on('question_deleted', ({ questions }) => {
      setQuestions(questions);
    });

    socket.on('questions_cleared', ({ questions }) => {
      setQuestions(questions);
    });

    socket.on('question_started', ({ question, questionIndex, answerLog, answerType }) => {
      setCurrentQuestion(question);
      setCurrentQuestionIndex(questionIndex);
      setCurrentQuestionAnswerType(answerType || 'text'); // default to text if not provided
      setPlayerAnswer('');
      setHasAnswered(false);
      setFeedback(null);
      setAnswerLog(answerLog || []);
      // Auto-focus input field when new question starts
      if (!player.isHost) {
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
          }
        }, 200);
      }
    });

    socket.on('player_joined', (newPlayer) => {
      setPlayers(prev => [...prev, newPlayer]);
    });

    socket.on('player_left', ({ playerId, players: updatedPlayers }) => {
      setPlayers(updatedPlayers);
    });

    socket.on('answer_attempt', ({ answerEntry, answerLog }) => {
      setAnswerLog(answerLog);
    });

    socket.on('correct_answer', ({ player: correctPlayer, answer, correctAnswer, players, answerLog }) => {
      setFeedback({
        type: 'success',
        message: `${correctPlayer.name} got it right with "${answer}"! Round ended.`
      });
      // Round has ended, clear current question but keep index for host navigation
      setCurrentQuestion(null);
      // Don't reset currentQuestionIndex - host needs it to navigate to next question
      setPlayerAnswer('');
      setHasAnswered(false);
      // Update player scores and answer log
      setPlayers(players);
      setAnswerLog(answerLog || []);
    });

    socket.on('incorrect_answer', ({ answer, correctAnswer }) => {
      setFeedback({
        type: 'error',
        message: `"${answer}" is incorrect. Try again!`
      });
      // Allow player to try again
      setPlayerAnswer('');
      setHasAnswered(false);
      // Restore focus to input field
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 100);
    });

    socket.on('game_started', ({ gameState }) => {
      // Game state is managed by parent component
    });

    socket.on('game_ended', ({ gameState, topPlayers }) => {
      setTopPlayers(topPlayers);
    });

    return () => {
      socket.off('question_added');
      socket.off('question_updated');
      socket.off('question_deleted');
      socket.off('questions_cleared');
      socket.off('question_started');
      socket.off('player_joined');
      socket.off('player_left');
      socket.off('answer_attempt');
      socket.off('correct_answer');
      socket.off('incorrect_answer');
      socket.off('game_started');
      socket.off('game_ended');
    };
  }, []);

  // Update local players when props change
  useEffect(() => {
    setPlayers(initialPlayers);
  }, [initialPlayers]);

  const handleAddQuestion = () => {
    if (!newQuestion.trim() || !newAnswer.trim()) return;

    socket.emit('add_question', {
      roomCode,
      question: newQuestion.trim(),
      answer: newAnswer.trim(),
      answerType: newAnswerType || 'text' // default to text if not set
    });

    setNewQuestion('');
    setNewAnswer('');
    setNewAnswerType('text'); // reset to default
  };

  const handleEditQuestion = (question) => {
    setEditingQuestion(question.id);
    setEditQuestion(question.question);
    setEditAnswer(question.answer);
    setEditAnswerType(question.answerType || 'text'); // default to text if not set
  };

  const handleSaveEdit = () => {
    if (!editQuestion.trim() || !editAnswer.trim()) return;

    socket.emit('update_question', {
      roomCode,
      questionId: editingQuestion,
      question: editQuestion.trim(),
      answer: editAnswer.trim(),
      answerType: editAnswerType || 'text' // default to text if not set
    });

    setEditingQuestion(null);
    setEditQuestion('');
    setEditAnswer('');
    setEditAnswerType('text'); // reset to default
  };

  const handleCancelEdit = () => {
    setEditingQuestion(null);
    setEditQuestion('');
    setEditAnswer('');
    setEditAnswerType('text'); // reset to default
  };

  const handleDeleteQuestion = (questionId) => {
    socket.emit('delete_question', {
      roomCode,
      questionId
    });
  };

  const handleStartQuestion = (questionIndex) => {
    socket.emit('start_question', { roomCode, questionIndex });
  };

  const handleNextQuestion = () => {
    const nextIndex = currentQuestionIndex + 1;
    if (nextIndex < questions.length) {
      handleStartQuestion(nextIndex);
    }
  };

  const handleSubmitAnswer = (inputRef) => {
    if (!playerAnswer.trim() || hasAnswered) return;

    setHasAnswered(true);
    socket.emit('submit_answer', {
      roomCode,
      answer: playerAnswer.trim()
    });

    // Keep focus on input field after submission
    if (inputRef && inputRef.current) {
      setTimeout(() => {
        inputRef.current.focus();
      }, 100);
    }
  };

  const handleStartGame = () => {
    socket.emit('start_game', roomCode);
  };

  const handleEndGame = () => {
    socket.emit('end_game', roomCode);
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploadError(null);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const content = e.target.result;
        const parsedQuestions = parseFileContent(content, file.name);

        if (parsedQuestions.length === 0) {
          setUploadError('No valid questions found in the file');
          return;
        }

        // Check if there are existing questions
        if (questions.length > 0) {
          // Show confirmation dialog
          setPendingUpload(parsedQuestions);
          setShowUploadConfirm(true);
        } else {
          // No existing questions, just add them
          addQuestionsFromUpload(parsedQuestions, false);
        }

        setUploadError(null);
      } catch (error) {
        setUploadError(error.message);
      }
    };

    reader.onerror = () => {
      setUploadError('Failed to read file');
    };

    reader.readAsText(file);
  };

  const addQuestionsFromUpload = (parsedQuestions, shouldOverwrite) => {
    // If overwrite, clear existing questions first
    if (shouldOverwrite) {
      socket.emit('clear_questions', { roomCode });
    }

    // Add all parsed questions
    parsedQuestions.forEach(({ question, answer, answerType }) => {
      socket.emit('add_question', {
        roomCode,
        question: question.trim(),
        answer: answer.trim(),
        answerType: answerType || 'text' // default to text if not provided
      });
    });

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    // Close confirmation dialog
    setShowUploadConfirm(false);
    setPendingUpload(null);
  };

  const handleUploadConfirm = (shouldOverwrite) => {
    if (pendingUpload) {
      addQuestionsFromUpload(pendingUpload, shouldOverwrite);
    }
  };

  const handleUploadCancel = () => {
    setShowUploadConfirm(false);
    setPendingUpload(null);
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const parseFileContent = (content, filename) => {
    const questions = [];

    // Detect file type
    if (filename.endsWith('.json')) {
      // JSON format: [{"question": "...", "answer": "..."}, ...]
      const data = JSON.parse(content);
      if (!Array.isArray(data)) {
        throw new Error('JSON must be an array of question objects');
      }
      data.forEach((item, index) => {
        if (!item.question || !item.answer) {
          throw new Error(`Invalid format at index ${index}: missing question or answer`);
        }
        questions.push({
          question: item.question,
          answer: item.answer,
          answerType: item.answerType || 'text' // optional field, defaults to text
        });
      });
    } else if (filename.endsWith('.csv')) {
      // CSV format: question,answer (with optional header)
      const lines = content.split('\n').filter(line => line.trim());
      lines.forEach((line, index) => {
        // Skip header row if it looks like a header
        if (index === 0 && (line.toLowerCase().includes('question') || line.toLowerCase().includes('answer'))) {
          return;
        }

        // Split by comma, but respect quoted strings
        const parts = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
        if (!parts || parts.length < 2) {
          return; // Skip invalid lines
        }

        const question = parts[0].replace(/^"|"$/g, '').trim();
        const answer = parts[1].replace(/^"|"$/g, '').trim();
        const answerType = parts[2] ? parts[2].replace(/^"|"$/g, '').trim() : 'text'; // optional third column

        if (question && answer) {
          questions.push({ question, answer, answerType });
        }
      });
    } else {
      // Plain text format: Q: ... A: ... or question|answer or question\tanswer
      const lines = content.split('\n').filter(line => line.trim());
      lines.forEach((line) => {
        let question, answer;

        // Format 1: Q: question A: answer
        if (line.match(/Q:\s*.+\s+A:\s*.+/i)) {
          const match = line.match(/Q:\s*(.+?)\s+A:\s*(.+)/i);
          if (match) {
            question = match[1].trim();
            answer = match[2].trim();
          }
        }
        // Format 2: question|answer
        else if (line.includes('|')) {
          const parts = line.split('|');
          if (parts.length >= 2) {
            question = parts[0].trim();
            answer = parts[1].trim();
          }
        }
        // Format 3: question\tanswer (tab-separated)
        else if (line.includes('\t')) {
          const parts = line.split('\t');
          if (parts.length >= 2) {
            question = parts[0].trim();
            answer = parts[1].trim();
          }
        }

        if (question && answer) {
          questions.push({ question, answer });
        }
      });
    }

    return questions;
  };

  // Show podium if game has ended
  if (gameState === 'ended') {
    return (
      <Podium
        topPlayers={topPlayers}
        onBackToHome={onLeaveRoom}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-400 to-blue-600 p-4">
      <div className="max-w-6xl mx-auto">
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
                onClick={onLeaveRoom}
                className="text-red-500 hover:text-red-700 p-2 transition duration-200"
                title="Leave Room"
              >
                <ArrowRightStartOnRectangleIcon className="w-6 h-6" />
              </button>
            </div>

            {/* Playing As and Game State */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <p className="text-gray-600 text-sm sm:text-base">
                  Playing as: <span className="font-semibold">{player.name}</span>
                  {player.isHost && <span className="ml-2 text-blue-600">(Host)</span>}
                </p>
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium w-fit ${
                  gameState === 'waiting' ? 'bg-gray-100 text-gray-700' :
                  gameState === 'active' ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {gameState === 'waiting' ? '⏳ Waiting to Start' :
                   gameState === 'active' ? '🎮 Game Active' :
                   '🏁 Game Ended'}
                </span>
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

          {/* Upload Confirmation Dialog */}
          {showUploadConfirm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl">
                <h3 className="text-xl font-bold text-gray-800 mb-4">Questions Already Exist</h3>
                <p className="text-gray-600 mb-6">
                  You have {questions.length} existing question{questions.length !== 1 ? 's' : ''}.
                  You are uploading {pendingUpload?.length} new question{pendingUpload?.length !== 1 ? 's' : ''}.
                  <br /><br />
                  How would you like to proceed?
                </p>
                <div className="flex flex-col space-y-3">
                  <button
                    onClick={() => handleUploadConfirm(false)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-md transition duration-200"
                  >
                    Append ({questions.length + (pendingUpload?.length || 0)} total questions)
                  </button>
                  <button
                    onClick={() => handleUploadConfirm(true)}
                    className="bg-red-600 hover:bg-red-700 text-white font-medium py-3 px-4 rounded-md transition duration-200"
                  >
                    Overwrite (replace all with {pendingUpload?.length} new questions)
                  </button>
                  <button
                    onClick={handleUploadCancel}
                    className="border-2 border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-3 px-4 rounded-md transition duration-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Question Display - Full Width and Prominent - Only show when game is active */}
          {currentQuestion && gameState === 'active' && (
            <div className="mb-8">
              <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg p-8 text-center shadow-xl">
                <p className="text-4xl font-bold leading-relaxed">{currentQuestion}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
            {/* Left Column - Main Game Area (70%) */}
            <div className="lg:col-span-7 space-y-6">

              {/* Host Question Management - Only for Host */}
              {player.isHost && (
                <>
                  {/* Question Setup (before/after game) */}
                  {gameState !== 'active' && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                      <h3 className="text-lg font-bold text-gray-800 mb-4">Add Questions</h3>

                      {/* File Upload Section */}
                      <div className="mb-6 p-4 bg-white rounded-lg border border-gray-300">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Upload Questions File</h4>
                        <p className="text-xs text-gray-600 mb-3">
                          Upload CSV, JSON, or TXT file. Supported formats:
                        </p>
                        <ul className="text-xs text-gray-500 mb-3 ml-4 space-y-1">
                          <li>• <span className="font-mono">CSV:</span> question,answer</li>
                          <li>• <span className="font-mono">JSON:</span> [{"{"}"question":"...","answer":"..."{"}"}]</li>
                          <li>• <span className="font-mono">TXT:</span> Q: ... A: ... or question|answer or question[TAB]answer</li>
                        </ul>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".csv,.json,.txt"
                          onChange={handleFileUpload}
                          className="hidden"
                          id="question-file-upload"
                        />
                        <label
                          htmlFor="question-file-upload"
                          className="block w-full bg-blue-600 hover:bg-blue-700 text-white text-center font-medium py-2 px-4 rounded-md cursor-pointer transition duration-200"
                        >
                          📁 Upload File
                        </label>
                        {uploadError && (
                          <div className="mt-2 p-2 bg-red-100 border border-red-300 text-red-700 text-xs rounded">
                            {uploadError}
                          </div>
                        )}
                      </div>

                      {/* Manual Add Section */}
                      <div className="space-y-4">
                        <h4 className="text-sm font-semibold text-gray-700">Or Add Manually</h4>
                        <input
                          type="text"
                          value={newQuestion}
                          onChange={(e) => setNewQuestion(e.target.value)}
                          placeholder="Enter question..."
                          className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <input
                          type="text"
                          value={newAnswer}
                          onChange={(e) => setNewAnswer(e.target.value)}
                          placeholder="Enter correct answer..."
                          className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Answer Type (optional)</label>
                          <select
                            value={newAnswerType}
                            onChange={(e) => setNewAnswerType(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="text">Text</option>
                            <option value="amount">Amount (Number)</option>
                          </select>
                        </div>
                        <button
                          onClick={handleAddQuestion}
                          disabled={!newQuestion.trim() || !newAnswer.trim()}
                          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-3 px-4 rounded-md transition duration-200"
                        >
                          Add Question
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Questions List for Host (only show when game is not active) */}
                  {questions.length > 0 && gameState !== 'active' && (
                    <div>
                      <h2 className="text-xl font-semibold mb-4">Questions ({questions.length})</h2>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {questions.map((q, index) => (
                          <div key={q.id} className="p-3 bg-gray-50 border rounded-md">
                            {editingQuestion === q.id ? (
                              // Edit mode
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  value={editQuestion}
                                  onChange={(e) => setEditQuestion(e.target.value)}
                                  placeholder="Edit question..."
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                />
                                <input
                                  type="text"
                                  value={editAnswer}
                                  onChange={(e) => setEditAnswer(e.target.value)}
                                  placeholder="Edit answer..."
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                />
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">Answer Type</label>
                                  <select
                                    value={editAnswerType}
                                    onChange={(e) => setEditAnswerType(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                  >
                                    <option value="text">Text</option>
                                    <option value="amount">Amount (Number)</option>
                                  </select>
                                </div>
                                <div className="flex space-x-2">
                                  <button
                                    onClick={handleSaveEdit}
                                    disabled={!editQuestion.trim() || !editAnswer.trim()}
                                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-xs px-3 py-1 rounded transition duration-200"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={handleCancelEdit}
                                    className="bg-gray-500 hover:bg-gray-600 text-white text-xs px-3 py-1 rounded transition duration-200"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              // View mode
                              <div className="flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm">{q.question}</p>
                                  <p className="text-xs text-gray-600">Answer: {q.answer}</p>
                                </div>
                                <div className="flex space-x-2 ml-3">
                                  <button
                                    onClick={() => handleEditQuestion(q)}
                                    className="bg-blue-500 hover:bg-blue-600 text-white text-xs px-2 py-1 rounded transition duration-200"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDeleteQuestion(q.id)}
                                    className="bg-red-500 hover:bg-red-600 text-white text-xs px-2 py-1 rounded transition duration-200"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Answer Chat */}
              <div>
                <AnswerChat answerLog={answerLog} currentPlayerId={player.id} />
              </div>

              {/* Active Game Controls - For Host Only */}
              {player.isHost && gameState === 'active' && questions.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                  <h3 className="text-lg font-bold text-blue-800 mb-4">Game Controls</h3>

                  {/* Current Question Info */}
                  <div className="mb-4 p-3 bg-white rounded-lg border">
                    <p className="text-sm text-gray-600 mb-1">
                      Question {Math.max(currentQuestionIndex + 1, 1)} of {questions.length}
                    </p>
                    {currentQuestionIndex >= 0 && (
                      <div>
                        <p className="font-medium">{questions[currentQuestionIndex]?.question}</p>
                        <p className="text-sm text-gray-500">Answer: {questions[currentQuestionIndex]?.answer}</p>
                        {!currentQuestion && (
                          <p className="text-sm text-green-600 mt-1">✓ Question completed - ready for next</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Navigation Controls */}
                  <div className="flex space-x-3">
                    <button
                      onClick={() => handleStartQuestion(currentQuestionIndex === -1 ? 0 : currentQuestionIndex)}
                      disabled={questions.length === 0}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-3 px-4 rounded-md transition duration-200"
                    >
                      {currentQuestionIndex === -1 ? 'Start First Question' :
                       currentQuestion ? 'Restart Current' : 'Repeat Question'}
                    </button>

                    <button
                      onClick={handleNextQuestion}
                      disabled={currentQuestionIndex >= questions.length - 1 || questions.length === 0}
                      className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-medium py-3 px-4 rounded-md transition duration-200"
                    >
                      Next Question
                    </button>
                  </div>

                 
                </div>
              )}

              {/* Answer Input Section - For Players Only */}
              {currentQuestion && !player.isHost && (
                <div>
                  <div className="bg-white border-2 border-blue-200 rounded-lg p-6 shadow-lg">
                    <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4">
                      <input
                        ref={inputRef}
                        type={currentQuestionAnswerType === 'amount' ? 'number' : 'text'}
                        inputMode={currentQuestionAnswerType === 'amount' ? 'decimal' : 'text'}
                        step={currentQuestionAnswerType === 'amount' ? 'any' : undefined}
                        value={playerAnswer}
                        onChange={(e) => setPlayerAnswer(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSubmitAnswer(inputRef)}
                        placeholder={currentQuestionAnswerType === 'amount' ? 'Enter number...' : 'Type your answer here...'}
                        disabled={hasAnswered}
                        className="flex-1 px-4 py-4 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-xl font-medium disabled:bg-gray-100"
                      />
                      <button
                        onClick={() => handleSubmitAnswer(inputRef)}
                        disabled={hasAnswered || !playerAnswer.trim()}
                        className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-bold py-4 px-8 rounded-md transition duration-200 text-lg whitespace-nowrap w-full sm:w-auto"
                      >
                        {hasAnswered ? 'Submitted!' : 'Submit'}
                      </button>
                    </div>

                    {feedback && (
                      <div className={`mt-4 p-4 rounded-md ${
                        feedback.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'
                      }`}>
                        <div className="font-medium">{feedback.message}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column - Player Information (30%) */}
            <div className="lg:col-span-3">
              <div className="sticky top-6">
                <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                  <h2 className="text-lg font-semibold mb-4 text-center">Players</h2>
                  <div className="space-y-3">
                    {players.map((p) => (
                      <div key={p.id}>
                        <div className="bg-gray-50 border rounded-lg p-2">
                          <div className="flex items-center justify-between">
                            {/* Player name - 75% */}
                            <div className="flex-1 min-w-0 pr-2">
                              <div className="font-medium text-xs truncate">
                                {p.name}
                              </div>
                              {p.isHost && (
                                <div className="text-xs text-blue-600">(Host)</div>
                              )}
                            </div>

                            {/* Points - 25% */}
                            <div className="flex-shrink-0">
                              <div className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full">
                                {p.score || 0}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-200 text-center">
                    <div className="text-xs text-gray-500">
                      {players.length} player{players.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TypeRoom;