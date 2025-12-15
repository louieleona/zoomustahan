const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const allowedOrigin = process.env.CLIENT_URL || "http://localhost:5173";

// Impostor Game Configuration
const IMPOSTOR_CONFIG = {
  MAX_VIDEOS: 5,
  VIDEO_DURATION: 3000,  // 3 seconds - CHANGE THIS to increase duration
  MAX_HTTP_BUFFER_SIZE: 50e6  // 50MB buffer for videos (to support 100 voters)
};

const io = socketIo(server, {
  maxHttpBufferSize: IMPOSTOR_CONFIG.MAX_HTTP_BUFFER_SIZE, // 50MB for video data
  pingTimeout: 60000, // 60 seconds
  pingInterval: 25000, // 25 seconds
  cors: {
    origin: allowedOrigin,
    methods: ["GET", "POST"]
  }
});

app.use(cors({
  origin: allowedOrigin,
  methods: ["GET", "POST"]
}));
app.use(express.json());

const rooms = new Map();
let questionIdCounter = 0; // Global counter for unique question IDs

function generateRoomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function logScoreTally(roomCode, event, room) {
  console.log('\n========== SCORE TALLY ==========');
  console.log(`Room: ${roomCode}`);
  console.log(`Event: ${event}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Room Type: ${room.type}`);
  console.log(`Game State: ${room.gameState}`);

  if (room.type === 'type' && room.currentQuestionIndex >= 0) {
    console.log(`Question: ${room.currentQuestionIndex + 1}/${room.questions.length}`);
  }

  console.log('\nPlayer Scores:');
  room.players.forEach((player, index) => {
    console.log(`  ${index + 1}. ${player.name}${player.isHost ? ' (Host)' : ''}: ${player.score} points`);
  });

  const totalPoints = room.players.reduce((sum, p) => sum + p.score, 0);
  console.log(`\nTotal Points Distributed: ${totalPoints}`);
  console.log('=================================\n');
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create_room', ({ playerName, roomType }) => {
    const roomCode = generateRoomCode();
    const room = {
      id: roomCode,
      type: roomType || 'buzzer', // 'buzzer', 'type', or 'impostor'
      host: socket.id,
      players: [{
        id: socket.id,
        name: playerName,
        isHost: true,
        buzzed: false,
        buzzTime: null,
        score: 0,
        role: undefined // Host has no role - just manages the game
      }],
      gameState: 'waiting', // 'waiting', 'active', 'ended'
      buzzOrder: [],
      firstBuzzTime: null,
      // Type room specific
      questions: [],
      currentQuestion: null,
      currentQuestionIndex: -1,
      answerLog: []
    };

    // Add impostor-specific properties
    if (roomType === 'impostor') {
      room.videos = [];
      room.votes = {};
      room.voteResults = {};
      room.recordingComplete = new Set();
      room.maxVideos = IMPOSTOR_CONFIG.MAX_VIDEOS;
      room.maxDuration = IMPOSTOR_CONFIG.VIDEO_DURATION;
      room.maxPlayers = IMPOSTOR_CONFIG.MAX_VIDEOS; // Max 5 Players
    }

    rooms.set(roomCode, room);
    socket.join(roomCode);

    socket.emit('room_created', {
      roomCode,
      player: room.players[0],
      gameState: room.gameState,
      roomType: room.type
    });

    console.log(`Room ${roomCode} created by ${playerName}`);
  });

  socket.on('join_room', ({ roomCode, playerName, role }) => {
    console.log(`[join_room] Player "${playerName}" joining room ${roomCode} with role: ${role}`);

    const room = rooms.get(roomCode);

    if (!room) {
      socket.emit('room_error', 'Room not found');
      return;
    }

    if (room.players.find(p => p.name === playerName)) {
      socket.emit('room_error', 'Name already taken in this room');
      return;
    }

    // For impostor rooms, validate Player count
    if (room.type === 'impostor' && role === 'Player') {
      const currentPlayerCount = room.players.filter(p => p.role === 'Player').length;
      if (currentPlayerCount >= room.maxPlayers) {
        socket.emit('room_error', `Maximum ${room.maxPlayers} Players allowed. Join as Voter instead.`);
        return;
      }
    }

    const assignedRole = room.type === 'impostor' ? (role || 'Voter') : undefined;
    console.log(`[join_room] Room type: ${room.type}, Assigned role: ${assignedRole}`);

    const newPlayer = {
      id: socket.id,
      name: playerName,
      isHost: false,
      buzzed: false,
      buzzTime: null,
      score: 0,
      role: assignedRole
    };

    room.players.push(newPlayer);
    socket.join(roomCode);

    socket.emit('room_joined', {
      roomCode,
      player: newPlayer,
      players: room.players,
      gameState: room.gameState,
      roomType: room.type
    });

    socket.to(roomCode).emit('player_joined', newPlayer);

    console.log(`${playerName} joined room ${roomCode}`);
  });

  socket.on('buzz', (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.buzzed || player.isHost) return;

    const buzzTime = Date.now();

    if (room.firstBuzzTime === null) {
      room.firstBuzzTime = buzzTime;
    }

    const timeDiff = buzzTime - room.firstBuzzTime;

    player.buzzed = true;
    player.buzzTime = buzzTime;

    const buzzEntry = {
      ...player,
      buzzTime,
      timeDiff
    };

    room.buzzOrder.push(buzzEntry);

    const sortedBuzzOrder = room.buzzOrder
      .sort((a, b) => a.buzzTime - b.buzzTime)
      .map((buzz, index) => ({
        ...buzz,
        position: index + 1
      }));

    io.to(roomCode).emit('player_buzzed', {
      player,
      buzzOrder: sortedBuzzOrder
    });

    console.log(`${player.name} buzzed in room ${roomCode} (+${timeDiff}ms)`);
  });

  socket.on('reset_buzzers', (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.isHost) return;

    // Log score tally before resetting
    logScoreTally(roomCode, 'Buzzer Reset', room);

    room.players.forEach(p => {
      p.buzzed = false;
      p.buzzTime = null;
    });
    room.buzzOrder = [];
    room.firstBuzzTime = null;

    io.to(roomCode).emit('buzzers_reset');
    console.log(`Buzzers reset in room ${roomCode}`);
  });

  // Type room specific events
  socket.on('add_question', ({ roomCode, question, answer, answerType }) => {
    const room = rooms.get(roomCode);
    if (!room || room.type !== 'type') return;

    const host = room.players.find(p => p.id === socket.id);
    if (!host || !host.isHost) return;

    // Use counter + timestamp to ensure unique IDs even for rapid uploads
    questionIdCounter++;
    const newQuestion = {
      id: Date.now() + questionIdCounter,
      question: question.trim(),
      answer: answer.trim().toLowerCase(),
      answerType: answerType || 'text' // default to text if not provided
    };

    room.questions.push(newQuestion);

    socket.emit('question_added', {
      questions: room.questions
    });

    console.log(`Question added to room ${roomCode}: ${question}`);
  });

  socket.on('update_question', ({ roomCode, questionId, question, answer, answerType }) => {
    const room = rooms.get(roomCode);
    if (!room || room.type !== 'type') return;

    const host = room.players.find(p => p.id === socket.id);
    if (!host || !host.isHost) return;

    // Only allow editing if game hasn't started
    if (room.gameState === 'active') return;

    const questionIndex = room.questions.findIndex(q => q.id === questionId);
    if (questionIndex === -1) return;

    room.questions[questionIndex] = {
      ...room.questions[questionIndex],
      question: question.trim(),
      answer: answer.trim().toLowerCase(),
      answerType: answerType || 'text' // default to text if not provided
    };

    socket.emit('question_updated', {
      questions: room.questions
    });

    console.log(`Question updated in room ${roomCode}: ${question}`);
  });

  socket.on('delete_question', ({ roomCode, questionId }) => {
    const room = rooms.get(roomCode);
    if (!room || room.type !== 'type') return;

    const host = room.players.find(p => p.id === socket.id);
    if (!host || !host.isHost) return;

    // Only allow deleting if game hasn't started
    if (room.gameState === 'active') return;

    room.questions = room.questions.filter(q => q.id !== questionId);

    socket.emit('question_deleted', {
      questions: room.questions
    });

    console.log(`Question deleted from room ${roomCode}`);
  });

  socket.on('clear_questions', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || room.type !== 'type') return;

    const host = room.players.find(p => p.id === socket.id);
    if (!host || !host.isHost) return;

    // Only allow clearing if game hasn't started
    if (room.gameState === 'active') return;

    room.questions = [];

    socket.emit('questions_cleared', {
      questions: room.questions
    });

    console.log(`All questions cleared from room ${roomCode}`);
  });

  socket.on('start_question', ({ roomCode, questionIndex }) => {
    const room = rooms.get(roomCode);
    if (!room || room.type !== 'type') return;

    const host = room.players.find(p => p.id === socket.id);
    if (!host || !host.isHost) return;

    if (questionIndex < 0 || questionIndex >= room.questions.length) return;

    // Log score tally before starting new question (except for first question)
    if (questionIndex > 0 || room.currentQuestionIndex >= 0) {
      logScoreTally(roomCode, `Starting Question ${questionIndex + 1}`, room);
    }

    room.currentQuestion = room.questions[questionIndex];
    room.currentQuestionIndex = questionIndex;

    // Reset player states for new question
    room.players.forEach(p => {
      p.answered = false;
      p.answerTime = null;
    });

    // Clear answer log for new question
    room.answerLog = [];

    io.to(roomCode).emit('question_started', {
      question: room.currentQuestion.question,
      questionIndex,
      answerLog: room.answerLog,
      answerType: room.currentQuestion.answerType || 'text' // send answer type to clients
    });

    console.log(`Question ${questionIndex + 1} started in room ${roomCode}`);
  });

  socket.on('submit_answer', ({ roomCode, answer }) => {
    const room = rooms.get(roomCode);
    if (!room || room.type !== 'type' || !room.currentQuestion) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    // Check if round is already ended (someone got correct answer)
    if (!room.currentQuestion) return;

    const submittedAnswer = answer.trim().toLowerCase();
    const correctAnswer = room.currentQuestion.answer;
    const answerType = room.currentQuestion.answerType || 'text';

    // Check for multiple valid answers separated by '/' or 'or'
    let validAnswers = [correctAnswer];
    if (correctAnswer.includes('/')) {
      validAnswers = correctAnswer.split('/').map(a => a.trim());
    } else if (correctAnswer.includes(' or ')) {
      validAnswers = correctAnswer.split(' or ').map(a => a.trim());
    }

    let isCorrect = false;

    // For numeric answers, compare as numbers (handles 34.5 == 34.50)
    if (answerType === 'amount') {
      const submittedNum = parseFloat(submittedAnswer);
      isCorrect = validAnswers.some(validAns => {
        const validNum = parseFloat(validAns);
        return !isNaN(submittedNum) && !isNaN(validNum) && submittedNum === validNum;
      });
    } else {
      // For text answers, use exact string matching (case-insensitive)
      isCorrect = validAnswers.includes(submittedAnswer);
    }
    const timestamp = Date.now();

    // Log the answer attempt
    const answerEntry = {
      id: timestamp,
      player: player.name,
      playerId: player.id,
      answer: answer.trim(), // Keep original case for display
      isCorrect,
      timestamp
    };

    room.answerLog.push(answerEntry);

    // Broadcast answer attempt to all players
    io.to(roomCode).emit('answer_attempt', {
      answerEntry,
      answerLog: room.answerLog
    });

    if (isCorrect) {
      // Award points if game is active
      if (room.gameState === 'active') {
        player.score += 1;
      }

      // Mark player as answered and record time for this correct answer
      player.answered = true;
      player.answerTime = timestamp;

      // End the round for everyone (but keep question index for host navigation)
      room.currentQuestion = null;
      // Don't reset currentQuestionIndex - host needs it for navigation

      // Broadcast correct answer to all players
      io.to(roomCode).emit('correct_answer', {
        player,
        answer: submittedAnswer,
        correctAnswer,
        players: room.players,
        answerLog: room.answerLog
      });

      console.log(`${player.name} got correct answer in room ${roomCode}: ${submittedAnswer}`);
    } else {
      // Send incorrect feedback only to the player who answered
      // Don't mark as answered so they can try again
      socket.emit('incorrect_answer', {
        answer: submittedAnswer,
        correctAnswer: room.currentQuestion.answer
      });

      console.log(`${player.name} submitted incorrect answer in room ${roomCode}: ${submittedAnswer}`);
    }
  });

  socket.on('mark_answer', ({ roomCode, playerId, correct }) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    const host = room.players.find(p => p.id === socket.id);
    if (!host || !host.isHost) return;

    const player = room.players.find(p => p.id === playerId);
    if (!player) return;

    // Only award points if game is active
    if (correct && room.gameState === 'active') {
      player.score += 1;
    }

    // Update buzz order with current player data
    const updatedBuzzOrder = room.buzzOrder.map(buzzEntry => {
      if (buzzEntry.id === playerId) {
        return { ...buzzEntry, score: player.score };
      }
      return buzzEntry;
    });
    room.buzzOrder = updatedBuzzOrder;

    io.to(roomCode).emit('answer_marked', {
      playerId,
      correct,
      player,
      players: room.players,
      buzzOrder: updatedBuzzOrder
    });

    console.log(`${player.name}'s answer marked as ${correct ? 'correct' : 'incorrect'} in room ${roomCode}`);
  });

  socket.on('start_game', (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    const host = room.players.find(p => p.id === socket.id);
    if (!host || !host.isHost) return;

    room.gameState = 'active';

    // Reset buzzers when starting game (for buzzer rooms)
    if (room.type === 'buzzer') {
      room.players.forEach(p => {
        p.buzzed = false;
        p.buzzTime = null;
      });
      room.buzzOrder = [];
      room.firstBuzzTime = null;

      io.to(roomCode).emit('buzzers_reset');
    }

    io.to(roomCode).emit('game_started', {
      gameState: room.gameState
    });

    console.log(`Game started in room ${roomCode}`);
  });

  socket.on('end_game', (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    const host = room.players.find(p => p.id === socket.id);
    if (!host || !host.isHost) return;

    // Log final score tally
    logScoreTally(roomCode, 'Game Ended - Final Scores', room);

    room.gameState = 'ended';

    // Sort players by score for podium, excluding the host
    const sortedPlayers = [...room.players]
      .filter(p => !p.isHost)
      .sort((a, b) => b.score - a.score);
    const topPlayers = sortedPlayers.slice(0, 3);

    io.to(roomCode).emit('game_ended', {
      gameState: room.gameState,
      topPlayers
    });

    console.log(`Game ended in room ${roomCode}`);
  });

  // Impostor Game specific events
  socket.on('start_recording', (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room || room.type !== 'impostor') return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.isHost) return;

    room.gameState = 'recording';
    room.videos = [];
    room.recordingComplete = new Set();

    io.to(roomCode).emit('recording_started', {
      gameState: 'recording',
      maxDuration: room.maxDuration
    });

    console.log(`Recording started in room ${roomCode}`);
  });

  socket.on('submit_video', ({ roomCode, videoData, mimeType, duration }) => {
    console.log(`[submit_video] Received from ${socket.id}, room: ${roomCode}, mimeType: ${mimeType}, duration: ${duration}, dataSize: ${videoData?.length || 0}`);

    const room = rooms.get(roomCode);
    if (!room || room.type !== 'impostor') {
      console.log(`[submit_video] REJECTED: Invalid room or room type`);
      return;
    }
    if (room.gameState !== 'recording') {
      console.log(`[submit_video] REJECTED: Game state is ${room.gameState}, not recording`);
      return;
    }

    const player = room.players.find(p => p.id === socket.id);
    if (!player) {
      console.log(`[submit_video] REJECTED: Player not found`);
      return;
    }
    if (room.recordingComplete.has(socket.id)) {
      console.log(`[submit_video] REJECTED: Player already submitted`);
      return;
    }

    // Only Players can submit videos
    if (player.role !== 'Player') {
      console.log(`[submit_video] REJECTED: Player role is ${player.role}, not Player`);
      return;
    }

    // Validate
    if (duration > room.maxDuration) {
      console.log(`[submit_video] REJECTED: Duration ${duration} exceeds max ${room.maxDuration}`);
      return;
    }
    if (room.videos.length >= room.maxVideos) {
      console.log(`[submit_video] REJECTED: Max videos ${room.maxVideos} reached`);
      return;
    }

    // Store video
    const video = {
      id: `video_${Date.now()}_${socket.id}`,
      playerId: socket.id,
      playerName: player.name,
      videoData,
      mimeType,
      duration,
      timestamp: Date.now()
    };

    room.videos.push(video);
    room.recordingComplete.add(socket.id);

    // Count total Players (not Voters)
    const totalPlayersCount = room.players.filter(p => p.role === 'Player').length;

    io.to(roomCode).emit('video_submitted', {
      playerName: player.name,
      videoCount: room.videos.length,
      totalPlayers: totalPlayersCount
    });

    console.log(`[submit_video] SUCCESS: Video submitted by ${player.name}, total videos: ${room.videos.length}/${totalPlayersCount}`);

    // Auto-transition to voting if all Players have submitted
    if (room.videos.length >= totalPlayersCount) {
      room.gameState = 'voting';
      io.to(roomCode).emit('voting_started', {
        gameState: 'voting',
        videos: room.videos.map(v => ({
          id: v.id,
          playerName: v.playerName,
          videoData: v.videoData,
          mimeType: v.mimeType
        }))
      });

      console.log(`Voting started in room ${roomCode}`);
    }
  });

  socket.on('submit_vote', ({ roomCode, videoId }) => {
    const room = rooms.get(roomCode);
    if (!room || room.type !== 'impostor') return;
    if (room.gameState !== 'voting') return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    // Only Voters can vote (not Players, not Host)
    if (player.role !== 'Voter') return;
    if (player.isHost) return; // Host cannot vote

    // Store vote
    room.votes[socket.id] = videoId;

    // Calculate results
    room.voteResults = {};
    const totalVotes = Object.keys(room.votes).length;

    room.videos.forEach(video => {
      const voters = Object.entries(room.votes)
        .filter(([_, votedId]) => votedId === video.id)
        .map(([voterId, _]) => room.players.find(p => p.id === voterId)?.name);

      room.voteResults[video.id] = {
        count: voters.length,
        percentage: totalVotes > 0 ? Math.round((voters.length / totalVotes) * 100) : 0,
        voters
      };
    });

    // Broadcast update
    io.to(roomCode).emit('vote_update', {
      videoId,
      voterName: player.name,
      voteResults: room.voteResults
    });

    console.log(`Vote submitted by ${player.name} in room ${roomCode}`);
  });

  socket.on('show_results', (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room || room.type !== 'impostor') return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.isHost) return;

    room.gameState = 'results';

    io.to(roomCode).emit('results_ready', {
      gameState: 'results',
      voteResults: room.voteResults
    });

    console.log(`Results shown in room ${roomCode}`);
  });

  socket.on('new_round', (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room || room.type !== 'impostor') return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.isHost) return;

    // Reset game state for new round
    room.gameState = 'waiting';
    room.videos = [];
    room.votes = {};
    room.voteResults = {};
    room.recordingComplete = new Set();

    io.to(roomCode).emit('round_reset', {
      gameState: 'waiting'
    });

    console.log(`New round started in room ${roomCode}`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    for (const [roomCode, room] of rooms.entries()) {
      const playerIndex = room.players.findIndex(p => p.id === socket.id);

      if (playerIndex !== -1) {
        const player = room.players[playerIndex];
        room.players.splice(playerIndex, 1);

        if (room.players.length === 0) {
          rooms.delete(roomCode);
          console.log(`Room ${roomCode} deleted (empty)`);
        } else {
          if (player.isHost && room.players.length > 0) {
            room.players[0].isHost = true;
            room.host = room.players[0].id;
          }

          io.to(roomCode).emit('player_left', {
            playerId: socket.id,
            players: room.players
          });
        }

        console.log(`${player.name} left room ${roomCode}`);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`CORS enabled for origin: ${allowedOrigin}`);
});