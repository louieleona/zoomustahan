import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Room from './pages/Room';
import JoinRoom from './pages/JoinRoom';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/join/:roomCode" element={<JoinRoom />} />
          <Route path="/room/:roomCode" element={<Room />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App
