const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const allowedOrigin = process.env.CLIENT_URL || "http://localhost:5173";

const io = socketIo(server, {
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

function generateRoomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create_room', ({ playerName, roomType }) => {
    const roomCode = generateRoomCode();
    const room = {
      id: roomCode,
      type: roomType || 'buzzer', // 'buzzer' or 'type'
      host: socket.id,
      players: [{
        id: socket.id,
        name: playerName,
        isHost: true,
        buzzed: false,
        buzzTime: null,
        score: 0
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

  socket.on('join_room', ({ roomCode, playerName }) => {
    const room = rooms.get(roomCode);

    if (!room) {
      socket.emit('room_error', 'Room not found');
      return;
    }

    if (room.players.find(p => p.name === playerName)) {
      socket.emit('room_error', 'Name already taken in this room');
      return;
    }

    const newPlayer = {
      id: socket.id,
      name: playerName,
      isHost: false,
      buzzed: false,
      buzzTime: null,
      score: 0
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
    if (!player || player.buzzed) return;

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

    room.players.forEach(p => {
      p.buzzed = false;
      p.buzzTime = null;
    });
    room.buzzOrder = [];
    room.firstBuzzTime = null;

    io.to(roomCode).emit('buzzers_reset');
    console.log(`Buzzers reset in room ${roomCode}`);
  });

  socket.on('new_game', (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    const host = room.players.find(p => p.id === socket.id);
    if (!host || !host.isHost) return;

    // Reset game state and scores
    room.gameState = 'waiting';
    room.players.forEach(p => {
      p.buzzed = false;
      p.buzzTime = null;
      p.score = 0;
      // Reset TypeRoom specific player states
      p.answered = false;
      p.answerTime = null;
    });
    room.buzzOrder = [];
    room.firstBuzzTime = null;

    // Reset TypeRoom specific states
    if (room.type === 'type') {
      room.currentQuestion = null;
      room.currentQuestionIndex = -1;
      room.answerLog = [];
    }

    io.to(roomCode).emit('new_game_started', {
      gameState: room.gameState,
      players: room.players
    });

    console.log(`New game started in room ${roomCode}`);
  });

  // Type room specific events
  socket.on('add_question', ({ roomCode, question, answer }) => {
    const room = rooms.get(roomCode);
    if (!room || room.type !== 'type') return;

    const host = room.players.find(p => p.id === socket.id);
    if (!host || !host.isHost) return;

    const newQuestion = {
      id: Date.now(),
      question: question.trim(),
      answer: answer.trim().toLowerCase()
    };

    room.questions.push(newQuestion);

    socket.emit('question_added', {
      questions: room.questions
    });

    console.log(`Question added to room ${roomCode}: ${question}`);
  });

  socket.on('update_question', ({ roomCode, questionId, question, answer }) => {
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
      answer: answer.trim().toLowerCase()
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

  socket.on('start_question', ({ roomCode, questionIndex }) => {
    const room = rooms.get(roomCode);
    if (!room || room.type !== 'type') return;

    const host = room.players.find(p => p.id === socket.id);
    if (!host || !host.isHost) return;

    if (questionIndex < 0 || questionIndex >= room.questions.length) return;

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
      answerLog: room.answerLog
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

    // Check for multiple valid answers separated by '/' or 'or'
    let validAnswers = [correctAnswer];
    if (correctAnswer.includes('/')) {
      validAnswers = correctAnswer.split('/').map(a => a.trim());
    } else if (correctAnswer.includes(' or ')) {
      validAnswers = correctAnswer.split(' or ').map(a => a.trim());
    }

    const isCorrect = validAnswers.includes(submittedAnswer);
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

    room.gameState = 'ended';

    // Sort players by score for podium
    const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);
    const topPlayers = sortedPlayers.slice(0, 3);

    io.to(roomCode).emit('game_ended', {
      gameState: room.gameState,
      topPlayers
    });

    console.log(`Game ended in room ${roomCode}`);
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