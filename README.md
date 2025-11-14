# MultiBuzz

A real-time multiplayer game platform featuring two competitive game modes: traditional buzzer-style trivia and fast-paced typing challenges. Players create rooms, invite friends, and compete for points in an engaging web-based experience.

## Features

### Two Game Modes

**⚡ Buzzer Room**
- Traditional quiz show buzzer system
- Players race to buzz in first
- Host validates answers with ✓/✗ controls
- Time tracking shows buzz order with millisecond precision

**⌨️ Type Room**
- Custom question-answer trivia
- Players type answers as fast as possible
- First correct answer wins the point
- Support for multiple valid answers (e.g., "USA/America")
- Case-insensitive matching

### Core Features
- **Room Creation**: Generate unique room codes instantly
- **Real-time Multiplayer**: Socket.io-powered synchronization
- **Host Controls**: Start/end games, manage questions, award points
- **Smart Scoring**: Points only awarded during active games
- **Podium Display**: Animated winner celebration with top 3 rankings
- **Auto Host Transfer**: Seamless handoff when host leaves
- **Room Code Sharing**: Copy-to-clipboard for easy invitations

## Tech Stack

**Frontend**
- React 19.1.1 + Vite 7.1.6
- React Router 7.9.1
- Tailwind CSS 4.1.13
- Socket.io Client 4.8.1

**Backend**
- Node.js + Express 5.1.0
- Socket.io 4.8.1
- CORS enabled

## Getting Started

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd zoomustahan
```

2. Install server dependencies:
```bash
cd server
npm install
```

3. Install client dependencies:
```bash
cd ../client
npm install
```

### Running the Application

1. Start the server (Terminal 1):
```bash
cd server
npm run dev
```
Server runs on `http://localhost:3001`

2. Start the client (Terminal 2):
```bash
cd client
npm run dev
```
Client runs on `http://localhost:5174`

3. Open your browser and navigate to `http://localhost:5174`

## How to Play

### Creating a Game

1. Visit the home page and choose a game mode:
   - **⚡ Buzzer Room** for traditional quiz show style
   - **⌨️ Type Room** for typing-based trivia

2. Share the generated room code with other players

### Buzzer Room

**Host:**
- Wait for players to join
- Click "Start Game" to begin scoring
- Ask questions verbally
- Use ✓/✗ buttons to mark answers correct/incorrect
- Click "End Game" to see winners on the podium

**Player:**
- Enter room code and your name
- Wait for game to start
- Hit the buzzer when you know the answer
- Answer the question and wait for host validation

### Type Room

**Host:**
- Add questions and answers before starting:
  - **Manually**: Enter questions one-by-one
  - **Bulk Upload**: Upload CSV, JSON, or TXT files with multiple questions
- Click "Start Game" to begin
- Click "Show Question" to display each question
- Points awarded automatically to fastest correct answer
- Click "End Game" to finish

**Player:**
- Enter room code and your name
- Wait for game to start
- Type answers quickly when questions appear
- First correct answer gets the point

## Project Structure

```
zoomustahan/
├── client/              # React frontend
│   ├── src/
│   │   ├── pages/       # Home, Room, TypeRoom
│   │   ├── components/  # Podium, etc.
│   │   ├── services/    # Socket.io client
│   │   └── App.jsx
│   └── package.json
│
├── server/              # Node.js backend
│   ├── index.js         # Express + Socket.io server
│   └── package.json
│
└── README.md
```

## Development

### Available Scripts

**Client:**
```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

**Server:**
```bash
npm run dev      # Start with nodemon (auto-reload)
npm start        # Start production server
```

## Features in Detail

### Answer Validation (Type Room)
- Case-insensitive matching: "paris" = "PARIS" = "Paris"
- Multiple valid answers: "usa/america" or "usa or america"
- Numeric comparison for amount type: "34.5" = "34.50" = "34.500"
- Exact match required (no partial credit)

### Question Management
- Add/edit/delete questions before game starts
- **Answer Types** (optional, defaults to "text"): Choose between "text" or "amount" (numeric) answers
  - Text: Traditional text-based answers (default)
  - Amount: Shows numeric keypad on mobile devices
- **Bulk Upload**: Import questions from files
  - **CSV format**: `question,answer` or `question,answer,answerType` (answerType is optional)
  - **JSON format**: `[{"question":"...","answer":"...","answerType":"text|amount"}]` (answerType is optional)
  - **TXT format**: `Q: question A: answer`, `question|answer`, or `question[TAB]answer` (text type only)
- Host-only permissions
- Real-time sync across all players
- All questions stored in memory (no database required)

### Game States
- **Waiting**: Players join, host prepares
- **Active**: Points awarded for correct answers
- **Ended**: Podium display with top 3 winners

## File Upload Examples

### CSV File (`questions.csv`)
**Basic format (defaults to text type):**
```csv
question,answer
What is 2+2?,4
Capital of France?,Paris
Largest planet in solar system?,Jupiter
```

**With answer type (optional third column):**
```csv
question,answer,answerType
What is 2+2?,4,amount
Capital of France?,Paris,text
What is the price?,34.50,amount
```

**Mixed format (some with answerType, some without):**
```csv
question,answer,answerType
What is 2+2?,4,amount
Capital of France?,Paris
What is the price?,34.50,amount
Largest planet?,Jupiter
```
*Note: Rows without answerType (like "Capital of France?" and "Largest planet?") automatically default to text type.*

### JSON File (`questions.json`)
**Basic format (defaults to text type):**
```json
[
  {"question": "What is 2+2?", "answer": "4"},
  {"question": "Capital of France?", "answer": "Paris"},
  {"question": "Largest planet in solar system?", "answer": "Jupiter"}
]
```

**With answer type (optional field):**
```json
[
  {"question": "What is 2+2?", "answer": "4", "answerType": "amount"},
  {"question": "Capital of France?", "answer": "Paris", "answerType": "text"},
  {"question": "What is the price?", "answer": "34.50", "answerType": "amount"}
]
```

**Mixed format (some with answerType, some without):**
```json
[
  {"question": "What is 2+2?", "answer": "4", "answerType": "amount"},
  {"question": "Capital of France?", "answer": "Paris"},
  {"question": "What is the price?", "answer": "34.50", "answerType": "amount"},
  {"question": "Largest planet?", "answer": "Jupiter"}
]
```
*Note: Objects without answerType field (like "Capital of France?" and "Largest planet?") automatically default to text type.*

### TXT File (`questions.txt`)
**TXT files always default to text type**

```
Q: What is 2+2? A: 4
Q: Capital of France? A: Paris
Q: Largest planet in solar system? A: Jupiter
```

Or pipe-separated:
```
What is 2+2?|4
Capital of France?|Paris
Largest planet in solar system?|Jupiter
```

## Future Enhancements

- Sound effects and animations
- Room settings (max players, time limits)
- Player avatars
- Question categories and difficulty levels
- Mobile app version
- Password-protected rooms
- Spectator mode
- Multi-game leaderboards

## License

ISC

## Contributing

Contributions welcome! Please open an issue or submit a pull request.
