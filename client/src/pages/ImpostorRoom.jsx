import { useState, useEffect, useRef } from 'react';
import { ArrowRightStartOnRectangleIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import socket from '../services/socket';

function ImpostorRoom({ roomCode, player, players, gameState: initialGameState, onLeaveRoom }) {
  const [gameState, setGameState] = useState(initialGameState);
  const [videos, setVideos] = useState([]);
  const [voteResults, setVoteResults] = useState({});
  const [myVote, setMyVote] = useState(null);
  const [recording, setRecording] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [videoDuration, setVideoDuration] = useState(3000);
  const [submissionCount, setSubmissionCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [previewStream, setPreviewStream] = useState(null); // Preview before recording
  const [showQRDialog, setShowQRDialog] = useState(false);

  const videoRef = useRef(null);
  const previewVideoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    // Socket event listeners
    socket.on('recording_started', ({ gameState: newState, maxDuration }) => {
      setGameState(newState);
      setVideoDuration(maxDuration);

      // Only start recording if player is a Player (not a Voter)
      if (player.role === 'Player') {
        startRecording(maxDuration);
      }
    });

    socket.on('video_submitted', ({ playerName, videoCount }) => {
      setSubmissionCount(videoCount);
    });

    socket.on('voting_started', ({ gameState: newState, videos: newVideos }) => {
      console.log('voting_started event received:', {
        gameState: newState,
        videosCount: newVideos?.length,
        videos: newVideos
      });

      // Check each video's data format
      newVideos?.forEach((video, index) => {
        console.log(`Video ${index} data check:`, {
          id: video.id,
          playerName: video.playerName,
          mimeType: video.mimeType,
          dataLength: video.videoData?.length,
          dataPrefix: video.videoData?.substring(0, 50),
          isDataURL: video.videoData?.startsWith('data:')
        });
      });

      setGameState(newState);
      setVideos(newVideos);
    });

    socket.on('vote_update', ({ voteResults: newResults }) => {
      setVoteResults(newResults);
    });

    socket.on('results_ready', ({ gameState: newState, voteResults: newResults }) => {
      setGameState(newState);
      setVoteResults(newResults);
    });

    socket.on('round_reset', ({ gameState: newState }) => {
      console.log('Round reset, returning to waiting state');
      setGameState(newState);
      setVideos([]);
      setVoteResults({});
      setMyVote(null);
      setHasSubmitted(false);
      setSubmissionCount(0);
      setError('');
    });

    return () => {
      socket.off('recording_started');
      socket.off('video_submitted');
      socket.off('voting_started');
      socket.off('vote_update');
      socket.off('results_ready');
      socket.off('round_reset');

      // Cleanup camera streams if still active
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (previewStream) {
        previewStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [previewStream]);

  const startRecording = async (duration) => {
    try {
      setError('');

      // Stop preview if running
      stopPreview();

      // Check browser support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError('Your browser does not support video recording.');
        return;
      }

      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: true
      });

      streamRef.current = stream;

      // Show preview
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Countdown: 3, 2, 1
      for (let i = 3; i > 0; i--) {
        setCountdown(i);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      setCountdown('Recording!');

      // Determine supported mime type
      let mimeType = 'video/webm;codecs=vp9';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }

      // Start MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      const chunks = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        console.log('MediaRecorder stopped, chunks count:', chunks.length);
        const blob = new Blob(chunks, { type: mediaRecorder.mimeType });
        console.log('Blob created, size:', blob.size, 'type:', blob.type);

        // Convert to base64
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          console.log('Base64 conversion complete, length:', reader.result?.length);

          // Fix the data URL: remove codecs from mime type
          // FileReader creates: data:video/webm;codecs=vp9,opus;base64,XXX
          // We need: data:video/webm;base64,XXX
          let dataURL = reader.result;
          const mimeType = blob.type.split(';')[0]; // Extract just "video/webm"

          // Replace the malformed data URL prefix with correct one
          if (dataURL.includes(';codecs=')) {
            // Find where ";base64," appears and split there
            const base64Index = dataURL.indexOf(';base64,');
            if (base64Index !== -1) {
              const base64Data = dataURL.substring(base64Index + 8); // Skip ";base64," (8 chars)
              dataURL = `data:${mimeType};base64,${base64Data}`;
              console.log('Fixed data URL format, new mime type:', mimeType);
            }
          }

          const videoData = {
            roomCode,
            videoData: dataURL,
            mimeType: mimeType,
            duration
          };

          console.log('Emitting submit_video event:', {
            roomCode,
            mimeType: mimeType,
            duration,
            dataLength: dataURL?.length
          });

          socket.emit('submit_video', videoData);
          setHasSubmitted(true);
        };

        reader.onerror = (err) => {
          console.error('FileReader error:', err);
          setError('Failed to process video: ' + err);
        };

        // Stop camera
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;

        // Clear preview
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
      };

      console.log('Starting MediaRecorder with mimeType:', mimeType);
      mediaRecorder.start();
      setRecording(true);

      // Stop after configured duration
      setTimeout(() => {
        console.log('Recording timeout reached, stopping MediaRecorder');
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
        setRecording(false);
        setCountdown(null);
      }, duration);

    } catch (err) {
      console.error('Camera error:', err);
      if (err.name === 'NotAllowedError') {
        setError('Camera permission denied. Please allow camera access and try again.');
      } else if (err.name === 'NotFoundError') {
        setError('No camera found on your device.');
      } else {
        setError('Camera access failed: ' + err.message);
      }
      setCountdown(null);
      setRecording(false);
    }
  };

  const handleVote = (videoId) => {
    if (gameState !== 'voting') return;

    setMyVote(videoId);
    socket.emit('submit_vote', { roomCode, videoId });
  };

  const handleShowResults = () => {
    if (!player.isHost) return;
    socket.emit('show_results', roomCode);
  };

  const handleNewRound = () => {
    if (!player.isHost) return;
    socket.emit('new_round', roomCode);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShowQR = () => {
    setShowQRDialog(true);
  };

  const handleCloseQR = () => {
    setShowQRDialog(false);
  };

  // Generate join URL for QR code
  const joinUrl = `${window.location.origin}/join/${roomCode}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(joinUrl)}`;

  // Start preview camera for Players in waiting state
  const startPreview = async () => {
    console.log('startPreview called');
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError('Your browser does not support video recording.');
        return;
      }

      console.log('Requesting camera access for preview...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false // No audio for preview
      });

      console.log('Preview stream obtained:', stream);
      setPreviewStream(stream);

      // Use a slight delay to ensure ref is ready
      setTimeout(() => {
        if (previewVideoRef.current) {
          console.log('Setting preview video src');
          previewVideoRef.current.srcObject = stream;
        } else {
          console.error('previewVideoRef.current is null');
        }
      }, 100);
    } catch (err) {
      console.error('Preview camera error:', err);
      if (err.name === 'NotAllowedError') {
        setError('Camera permission denied. Please allow camera access.');
      } else if (err.name === 'NotFoundError') {
        setError('No camera found on your device.');
      } else {
        setError('Camera access failed: ' + err.message);
      }
    }
  };

  const stopPreview = () => {
    if (previewStream) {
      previewStream.getTracks().forEach(track => track.stop());
      setPreviewStream(null);
    }
  };

  // Christmas snow animation
  const snowflakes = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    animationDuration: `${5 + Math.random() * 10}s`,
    animationDelay: `${Math.random() * 5}s`,
    opacity: Math.random()
  }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-600 via-green-600 to-red-700 p-4 relative overflow-hidden">
      {/* QR Code Dialog */}
      {showQRDialog && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
          onClick={handleCloseQR}
        >
          <div
            className="bg-white rounded-2xl p-8 max-w-md mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-4">
              <h3 className="text-2xl font-bold text-gray-800 mb-2">
                Scan to Join! 📱
              </h3>
              <p className="text-gray-600">
                Scan this QR code to join the room
              </p>
            </div>

            <div className="bg-white p-4 rounded-lg border-4 border-green-500 mb-4">
              <img
                src={qrCodeUrl}
                alt="QR Code to join room"
                className="w-full h-auto"
              />
            </div>

            <div className="text-center mb-4">
              <p className="text-sm text-gray-600 mb-2">Room Code:</p>
              <p className="text-3xl font-bold text-red-600">{roomCode}</p>
            </div>

            <div className="text-center">
              <button
                onClick={handleCloseQR}
                className="bg-gradient-to-r from-red-500 to-green-600 hover:from-red-600 hover:to-green-700 text-white font-bold py-3 px-8 rounded-lg shadow-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Snow Animation */}
      {snowflakes.map(flake => (
        <div
          key={flake.id}
          className="fixed text-white text-2xl pointer-events-none select-none"
          style={{
            left: flake.left,
            top: '-10vh',
            animation: `snowfall ${flake.animationDuration} linear infinite`,
            animationDelay: flake.animationDelay,
            opacity: flake.opacity,
            zIndex: 9999
          }}
        >
          ❄
        </div>
      ))}

      <style>{`
        @keyframes snowfall {
          0% { transform: translateY(-10vh) translateX(0); }
          100% { transform: translateY(100vh) translateX(10vw); }
        }
      `}</style>

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-5xl font-bold text-white mb-2 drop-shadow-lg">
            🎄 Impostor Game 🎅
          </h1>
          <p className="text-white text-xl drop-shadow-md">
            Christmas Video Challenge! 🎁
          </p>
        </div>

        {/* Room Code and Controls */}
        <div className="bg-white bg-opacity-90 rounded-lg shadow-xl p-6 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-sm font-medium text-gray-600">Room Code:</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-3xl font-bold text-red-600">{roomCode}</span>
                  <button
                    onClick={handleCopyCode}
                    className="p-2 rounded-md bg-green-100 hover:bg-green-200 transition"
                    title="Copy room code"
                  >
                    <ClipboardDocumentIcon className="w-5 h-5 text-green-700" />
                  </button>
                  {player.isHost && (
                    <button
                      onClick={handleShowQR}
                      className="p-2 rounded-md bg-blue-100 hover:bg-blue-200 transition"
                      title="Show QR Code"
                    >
                      <svg className="w-5 h-5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                      </svg>
                    </button>
                  )}
                  {copied && <span className="text-sm text-green-600">Copied!</span>}
                </div>
              </div>
            </div>

            <button
              onClick={onLeaveRoom}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-md transition"
            >
              <ArrowRightStartOnRectangleIcon className="w-5 h-5" />
              Leave Room
            </button>
          </div>

          {/* Players List */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="grid grid-cols-3 gap-4">
              {/* Host */}
              <div>
                <p className="text-sm font-medium text-gray-600 mb-2">
                  👑 Host:
                </p>
                <div className="flex flex-wrap gap-2">
                  {players.filter(p => p.isHost).map(p => (
                    <span
                      key={p.id}
                      className="px-3 py-1 rounded-full text-sm bg-yellow-100 text-yellow-800 font-semibold"
                    >
                      {p.name} 👑
                    </span>
                  ))}
                </div>
              </div>

              {/* Players (recording) */}
              <div>
                <p className="text-sm font-medium text-gray-600 mb-2">
                  🎥 Players ({players.filter(p => p.role === 'Player').length}/5):
                </p>
                <div className="flex flex-wrap gap-2">
                  {players.filter(p => p.role === 'Player').map(p => (
                    <span
                      key={p.id}
                      className="px-3 py-1 rounded-full text-sm bg-green-100 text-green-700"
                    >
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>

              {/* Voters */}
              <div>
                <p className="text-sm font-medium text-gray-600 mb-2">
                  🗳️ Voters ({players.filter(p => p.role === 'Voter').length}):
                </p>
                <div className="flex flex-wrap gap-2">
                  {players.filter(p => p.role === 'Voter').map(p => (
                    <span
                      key={p.id}
                      className="px-3 py-1 rounded-full text-sm bg-purple-100 text-purple-700"
                    >
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Game Content */}
        <div className="bg-white bg-opacity-90 rounded-lg shadow-xl p-6 min-h-96">
          {/* WAITING STATE */}
          {gameState === 'waiting' && (
            <div className="text-center py-12">
              {player.isHost ? (
                // Host view
                <div>
                  <div className="text-6xl mb-6">🎬</div>
                  <button
                    onClick={() => socket.emit('start_recording', roomCode)}
                    className="bg-gradient-to-r from-red-500 to-green-600 hover:from-red-600 hover:to-green-700 text-white font-bold py-4 px-8 rounded-lg shadow-lg text-xl transition transform hover:scale-105"
                  >
                    🎥 Start Recording for All Players
                  </button>
                  <p className="text-gray-700 mt-4">
                    Click to start {videoDuration / 1000}s recording for all players
                  </p>
                </div>
              ) : player.role === 'Player' ? (
                // Player preview
                <div>
                  <div className="text-4xl mb-4">🎥 Position Yourself</div>
                  <p className="text-gray-700 mb-4">
                    Preview your camera before recording starts
                  </p>

                  {/* Camera Preview */}
                  {previewStream ? (
                    <div className="max-w-md mx-auto mb-4">
                      <video
                        ref={previewVideoRef}
                        autoPlay
                        muted
                        playsInline
                        className="w-full rounded-lg shadow-lg border-4 border-green-500"
                      />
                      <button
                        onClick={stopPreview}
                        className="mt-3 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-md"
                      >
                        Stop Preview
                      </button>
                    </div>
                  ) : (
                    <div>
                      <button
                        onClick={startPreview}
                        className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg shadow-lg"
                      >
                        📷 Start Camera Preview
                      </button>
                    </div>
                  )}

                  {error && (
                    <div className="max-w-md mx-auto bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mt-4">
                      {error}
                    </div>
                  )}

                  <p className="text-gray-500 mt-4">
                    Waiting for host to start recording...
                  </p>
                </div>
              ) : (
                // Voter view
                <div>
                  <div className="text-6xl mb-6">🎬</div>
                  <p className="text-xl text-gray-700 font-semibold">
                    Waiting for host to start recording... 🗳️
                  </p>
                  <p className="text-gray-500 mt-2">
                    You're a Voter - get ready to watch and vote!
                  </p>
                </div>
              )}
            </div>
          )}

          {/* RECORDING STATE */}
          {gameState === 'recording' && (
            <div className="text-center py-12">
              {player.isHost ? (
                // Host view - monitoring
                <div>
                  <div className="text-6xl mb-4">🎬</div>
                  <p className="text-2xl font-bold text-yellow-600 mb-2">
                    Players are Recording...
                  </p>
                  <p className="text-gray-600">
                    Recording in progress ({submissionCount} / {players.filter(p => p.role === 'Player').length})
                  </p>
                  <p className="text-sm text-gray-500 mt-4">
                    Waiting for all players to submit their videos
                  </p>
                </div>
              ) : player.role === 'Player' ? (
                // Player view - recording
                !hasSubmitted ? (
                  <div>
                    {countdown && (
                      <div className="mb-6">
                        <div className="text-8xl font-bold text-red-600 animate-pulse">
                          {countdown}
                        </div>
                      </div>
                    )}

                    {/* Camera Preview */}
                    <div className="max-w-md mx-auto mb-4">
                      <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        className="w-full rounded-lg shadow-lg border-4 border-green-500"
                      />
                    </div>

                    {error && (
                      <div className="max-w-md mx-auto bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                        {error}
                      </div>
                    )}

                    <p className="text-gray-600">
                      Recording your {videoDuration / 1000}-second video...
                    </p>
                  </div>
                ) : (
                  <div>
                    <div className="text-6xl mb-4">✅</div>
                    <p className="text-2xl font-bold text-green-600 mb-2">
                      Video Submitted!
                    </p>
                    <p className="text-gray-600">
                      Waiting for other players... ({submissionCount} / {players.filter(p => p.role === 'Player').length})
                    </p>
                  </div>
                )
              ) : (
                // Voter view - waiting
                <div>
                  <div className="text-6xl mb-4">🎬</div>
                  <p className="text-2xl font-bold text-purple-600 mb-2">
                    Players are Recording...
                  </p>
                  <p className="text-gray-600">
                    Waiting for players to finish recording ({submissionCount} / {players.filter(p => p.role === 'Player').length})
                  </p>
                  <p className="text-sm text-gray-500 mt-4">
                    You're a Voter - get ready to watch and vote!
                  </p>
                </div>
              )}
            </div>
          )}

          {/* VOTING STATE */}
          {gameState === 'voting' && (
            <div>
              <div className="text-center mb-6">
                <h2 className="text-3xl font-bold text-gray-800 mb-2">
                  🕵️ Who is the Impostor?
                </h2>
                <p className="text-gray-600">
                  Vote for who you think is the impostor!
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Videos available: {videos.length}
                </p>
              </div>

              {videos.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-red-600 font-semibold">No videos received yet</p>
                  <p className="text-gray-500 text-sm mt-2">Waiting for videos to load...</p>
                </div>
              ) : null}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {videos.map((video) => {
                  console.log('Rendering video:', {
                    id: video.id,
                    playerName: video.playerName,
                    hasData: !!video.videoData,
                    dataPreview: video.videoData?.substring(0, 100),
                    dataLength: video.videoData?.length
                  });
                  return (
                  <div
                    key={video.id}
                    className="bg-white rounded-lg shadow-lg p-4 border-4 border-green-500 hover:border-red-500 transition"
                  >
                    {/* Video Player */}
                    <video
                      src={video.videoData}
                      loop
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-48 object-cover rounded-lg mb-3"
                      onError={(e) => {
                        console.error('Video playback error for', video.playerName, e);
                        console.log('Video data length:', video.videoData?.length);
                        console.log('Video mime type:', video.mimeType);
                      }}
                      onLoadedData={() => {
                        console.log('Video loaded successfully for', video.playerName);
                      }}
                    />

                    {/* Player Name */}
                    <p className="text-center font-semibold text-lg mb-2 text-gray-800">
                      {video.playerName}
                    </p>

                    {/* Vote Button - only for Voters */}
                    {player.isHost ? (
                      <div className="w-full py-3 bg-yellow-100 text-yellow-800 rounded-md text-center font-bold">
                        👑 Host View Only
                      </div>
                    ) : player.role === 'Voter' ? (
                      <button
                        onClick={() => handleVote(video.id)}
                        disabled={myVote && myVote !== video.id}
                        className={`w-full py-3 rounded-md transition transform hover:scale-105 font-bold ${
                          myVote === video.id
                            ? 'bg-green-500 text-white shadow-lg'
                            : 'bg-gradient-to-r from-red-500 to-green-600 hover:from-red-600 hover:to-green-700 text-white'
                        } ${myVote && myVote !== video.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {myVote === video.id ? '✓ Your Vote' : 'Vote'}
                      </button>
                    ) : (
                      <div className="w-full py-3 bg-gray-200 text-gray-500 rounded-md text-center font-bold">
                        Players Cannot Vote
                      </div>
                    )}

                    {/* Vote Count */}
                    <div className="mt-3 text-center">
                      <div className="text-3xl font-bold text-red-600">
                        {voteResults[video.id]?.percentage || 0}%
                      </div>
                      <div className="text-sm text-gray-600">
                        {voteResults[video.id]?.count || 0} {voteResults[video.id]?.count === 1 ? 'vote' : 'votes'}
                      </div>
                    </div>
                  </div>
                );
                })}
              </div>

              {/* Host Controls */}
              {player.isHost && (
                <div className="text-center mt-8">
                  <button
                    onClick={handleShowResults}
                    className="bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-white font-bold py-3 px-8 rounded-lg shadow-lg text-lg transition transform hover:scale-105"
                  >
                    📊 Show Final Results
                  </button>
                </div>
              )}
            </div>
          )}

          {/* RESULTS STATE */}
          {gameState === 'results' && (
            <div>
              <div className="text-center mb-8">
                <h2 className="text-4xl font-bold text-gray-800 mb-2">
                  🕵️ The Impostor Votes! 🎭
                </h2>
                <p className="text-gray-600">Here's who voters think is the impostor</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {videos
                  .sort((a, b) => (voteResults[b.id]?.percentage || 0) - (voteResults[a.id]?.percentage || 0))
                  .map((video, index) => (
                    <div
                      key={video.id}
                      className={`bg-white rounded-lg shadow-lg p-4 border-4 ${
                        index === 0 ? 'border-yellow-400' : 'border-green-500'
                      }`}
                    >
                      {/* Top Suspect Badge */}
                      {index === 0 && (
                        <div className="text-center mb-2">
                          <span className="text-4xl">🎭</span>
                          <p className="text-sm font-bold text-red-600">Most Suspected!</p>
                        </div>
                      )}

                      {/* Video Player */}
                      <video
                        src={video.videoData}
                        loop
                        autoPlay
                        muted
                        playsInline
                        className="w-full h-48 object-cover rounded-lg mb-3"
                      />

                      {/* Player Name */}
                      <p className="text-center font-semibold text-lg mb-2 text-gray-800">
                        {video.playerName}
                      </p>

                      {/* Final Percentage */}
                      <div className="text-center">
                        <div className="text-5xl font-bold text-red-600">
                          {voteResults[video.id]?.percentage || 0}%
                        </div>
                        <div className="text-lg text-gray-600 mt-1">
                          {voteResults[video.id]?.count || 0} {voteResults[video.id]?.count === 1 ? 'vote' : 'votes'}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>

              {/* Host Controls */}
              {player.isHost && (
                <div className="text-center mt-8 space-x-4">
                  <button
                    onClick={handleNewRound}
                    className="bg-gradient-to-r from-green-500 to-blue-600 hover:from-green-600 hover:to-blue-700 text-white font-bold py-3 px-8 rounded-lg shadow-lg text-lg transition transform hover:scale-105"
                  >
                    🔄 Start New Round
                  </button>
                  <button
                    onClick={onLeaveRoom}
                    className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-bold py-3 px-8 rounded-lg shadow-lg text-lg transition transform hover:scale-105"
                  >
                    🏠 Back to Home
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ImpostorRoom;
