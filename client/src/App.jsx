import { useState, useEffect, useCallback } from 'react';
import { connectSocket, disconnectSocket, getSocket } from './socket';
import { useCountdown, formatTime } from './hooks';
import {
  MAX_STORY_LENGTH,
  MAX_USERNAME_LENGTH,
  MIN_PLAYERS_PER_MATCH,
  MIN_PLAYERS_TO_VOTE,
  VOTING_DURATION_SEC,
  VOTING_TIMER_URGENT_SEC,
  WRITING_DURATION_SEC,
  WRITING_TIMER_URGENT_SEC,
} from '../../shared/constants.js';

function ShareLink() {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== 'undefined' ? window.location.href : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="share-link">
      <p className="share-label">Global arena — share with friends</p>
      <div className="share-row">
        <input type="text" readOnly value={url} className="share-input" />
        <button type="button" className="btn-share" onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy link'}
        </button>
      </div>
    </div>
  );
}

function JoinScreen({ onJoin }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lobby, setLobby] = useState(null);

  useEffect(() => {
    const fetchLobby = () => {
      fetch('/api/health')
        .then((r) => r.json())
        .then(setLobby)
        .catch(() => {});
    };
    fetchLobby();
    const id = setInterval(fetchLobby, 5000);
    return () => clearInterval(id);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError('');

    const socket = connectSocket();
    socket.emit('join', name.trim(), (result) => {
      setLoading(false);
      if (result.error) {
        setError(result.error);
      } else {
        onJoin(result.userId, name.trim(), result.state);
      }
    });
  };

  return (
    <div className="join-screen">
      <div className="join-card">
        <h1 className="logo">NextText</h1>
        <p className="tagline">One global arena. Two writers. Everyone votes.</p>

        {lobby && (
          <div className="global-lobby">
            <span className="global-lobby-dot" />
            <strong>{lobby.players}</strong> playing worldwide
            {lobby.champion && <> · 👑 Champion: <strong>{lobby.champion}</strong></>}
          </div>
        )}

        <ShareLink />

        <form className="join-form" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Enter your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_USERNAME_LENGTH}
            autoFocus
          />
          <button type="submit" className="btn-primary" disabled={loading || !name.trim()}>
            {loading ? 'Joining…' : 'Enter the Arena'}
          </button>
          {error && <p className="error-msg">{error}</p>}
        </form>

        <div className="how-it-works">
          <h3>How it works</h3>
          <ol>
            <li>Two players face off each round</li>
            <li>Everyone else <strong>watches and votes</strong></li>
            <li>Get a story prompt — write for <strong>{WRITING_DURATION_SEC} seconds</strong> (auto-submits)</li>
            <li>Spectators watch live and can <strong>vote anytime</strong> — even while stories are being written</li>
            <li>Switch your vote anytime before the round ends</li>
            <li>Winner advances; loser re-queues. Champion keeps the crown!</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

function Header({ userName, userRole, onlineCount, round, champion }) {
  return (
    <header className="header">
      <div className="header-logo">NextText</div>
      <div className="header-stats">
        <span className="global-badge">🌍 Global</span>
        {champion && <span className="round-badge">👑 {champion}</span>}
        {round > 0 && <span className="round-badge">Round {round}</span>}
        <div className="stat">
          <span className="stat-value">{onlineCount}</span> online
        </div>
        <div className={`user-badge ${userRole === 'player' ? 'player' : ''}`}>
          {userName} {userRole === 'player' ? '⚔️' : '👁'}
        </div>
      </div>
    </header>
  );
}

function Sidebar({ users, queueCount, champion, userId }) {
  return (
    <aside className="sidebar">
      {champion && (
        <div className="champion-badge">
          👑 Champion: <span>{champion}</span>
        </div>
      )}

      <div className="queue-info">
        <strong>{queueCount}</strong> players waiting in queue
      </div>

      <div className="sidebar-section">
        <h4>Online ({users.length})</h4>
        <ul className="user-list">
          {users.map((u) => (
            <li key={u.id} className={u.id === userId ? 'active' : ''}>
              <span className="user-dot" />
              {u.name}
              {u.role === 'player' && ' ⚔️'}
              {u.id === userId && ' (you)'}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

function WaitingView({ queueCount, match }) {
  if (match) {
    return (
      <div className="waiting-state">
        <h2>Battle in progress!</h2>
        <p>
          {match.player1?.name} vs {match.player2?.name} — watch and vote when stories are ready.
        </p>
        <div className="pulse-dot" />
      </div>
    );
  }

  return (
    <div className="waiting-state">
      <h2>Waiting for the next battle…</h2>
      <p>{queueCount} players in queue. Need at least {MIN_PLAYERS_PER_MATCH} to start — join with {MIN_PLAYERS_TO_VOTE}+ friends to vote!</p>
      <div className="pulse-dot" />
    </div>
  );
}

function PhaseBanner({ phase, endsAt }) {
  const remaining = useCountdown(endsAt);
  const labels = {
    writing: '✍️ Writing Phase',
    voting: '🗳️ Voting Phase',
    results: '🏆 Results',
  };

  return (
    <div className="phase-banner">
      <span className={`phase-label ${phase}`}>{labels[phase]}</span>
      {phase !== 'results' && (
        <span className={`timer ${remaining <= (phase === 'voting' ? VOTING_TIMER_URGENT_SEC : WRITING_TIMER_URGENT_SEC) ? 'urgent' : ''}`}>
          {formatTime(remaining)}
        </span>
      )}
    </div>
  );
}

function MatchupHeader({ player1, player2, winner }) {
  return (
    <div className="matchup">
      <div className={`player-card p1 ${winner === 'player1' ? 'winner' : ''}`}>
        <div className="player-name">{player1?.name}</div>
        <div className="player-status">Player 1</div>
      </div>
      <div className="vs-badge">vs</div>
      <div className={`player-card p2 ${winner === 'player2' ? 'winner' : ''}`}>
        <div className="player-name">{player2?.name}</div>
        <div className="player-status">Player 2</div>
      </div>
    </div>
  );
}

function SpectatorView({ match, prompt, onVote }) {
  const isWriting = match.phase === 'writing';
  const live = match.liveText ?? { player1: '', player2: '' };
  const myVote = match.myVote;

  const voteLabel = (choice) => {
    if (myVote === choice) return '✓ Your vote';
    if (myVote) return 'Switch vote here';
    return 'Vote for this story';
  };

  const storyText = (slot) => {
    if (isWriting) return live[slot] || '';
    return match.submissions?.[slot] || '';
  };

  return (
    <div className="spectator-live">
      <VoteTally
        votes={match.votes}
        votersCount={match.votersCount}
        spectatorCount={match.spectatorCount}
      />

      <div className="live-stories-grid">
        <div className={`live-story-panel p1 ${myVote === 'player1' ? 'voted-for' : ''}`}>
          <div className="live-story-header">
            <span className="live-story-author">{match.player1?.name}</span>
            <span className="vote-count">
              {match.votes.player1} {match.votes.player1 === 1 ? 'vote' : 'votes'}
            </span>
          </div>
          <div className="story-prompt-line">{prompt}</div>
          <div className="live-story-body">
            {storyText('player1') || (
              <span className="live-placeholder">
                {isWriting ? 'Waiting for first word…' : '(No story written)'}
              </span>
            )}
            {isWriting && storyText('player1') && <span className="live-cursor">|</span>}
          </div>
          {isWriting && <span className="live-dot">● typing live</span>}
          {match.canVote && (
            <button
              className={`btn-vote ${myVote === 'player1' ? 'voted' : ''}`}
              onClick={() => onVote('player1')}
            >
              {voteLabel('player1')}
            </button>
          )}
        </div>

        <div className={`live-story-panel p2 ${myVote === 'player2' ? 'voted-for' : ''}`}>
          <div className="live-story-header">
            <span className="live-story-author">{match.player2?.name}</span>
            <span className="vote-count">
              {match.votes.player2} {match.votes.player2 === 1 ? 'vote' : 'votes'}
            </span>
          </div>
          <div className="story-prompt-line">{prompt}</div>
          <div className="live-story-body">
            {storyText('player2') || (
              <span className="live-placeholder">
                {isWriting ? 'Waiting for first word…' : '(No story written)'}
              </span>
            )}
            {isWriting && storyText('player2') && <span className="live-cursor">|</span>}
          </div>
          {isWriting && <span className="live-dot">● typing live</span>}
          {match.canVote && (
            <button
              className={`btn-vote ${myVote === 'player2' ? 'voted' : ''}`}
              onClick={() => onVote('player2')}
            >
              {voteLabel('player2')}
            </button>
          )}
        </div>
      </div>

      {match.canVote && (
        <p className="voted-msg" style={{ color: 'var(--text-muted)' }}>
          {isWriting
            ? myVote
              ? 'Stories are still being written — switch your vote anytime!'
              : 'Vote now while they write — you can change your mind anytime!'
            : myVote
              ? 'Final seconds — tap the other story to switch your vote!'
              : 'Stories locked — pick your winner!'}
        </p>
      )}
    </div>
  );
}

function WritingPhase({ match, userId }) {
  const [story, setStory] = useState('');

  const handleChange = (e) => {
    const value = e.target.value;
    setStory(value);
    getSocket().emit('typing:update', value);
  };

  return (
    <div className="writing-area">
      <textarea
        placeholder="Continue the story…"
        value={story}
        onChange={handleChange}
        maxLength={MAX_STORY_LENGTH}
        autoFocus
      />
      <div className="writing-actions">
        <span className="char-count">{story.length} / {MAX_STORY_LENGTH}</span>
        <span className="auto-submit-note">Auto-submits when timer hits 0:00</span>
      </div>
    </div>
  );
}

function VoteTally({ votes, votersCount, spectatorCount }) {
  const total = votes.total || 0;
  const p1Pct = total > 0 ? Math.round((votes.player1 / total) * 100) : 50;
  const p2Pct = total > 0 ? 100 - p1Pct : 50;

  return (
    <div className="vote-tally">
      <div className="vote-tally-header">
        <span className="live-badge">● LIVE</span>
        <span className="vote-tally-meta">
          {votersCount} of {spectatorCount} spectators voted
        </span>
        <span className="vote-tally-total">{total} total votes</span>
      </div>
      <div className="vote-bar">
        <div
          className="vote-bar-p1"
          style={{ width: `${p1Pct}%` }}
        >
          {total > 0 && <span>{votes.player1}</span>}
        </div>
        <div
          className="vote-bar-p2"
          style={{ width: `${p2Pct}%` }}
        >
          {total > 0 && <span>{votes.player2}</span>}
        </div>
      </div>
    </div>
  );
}

function VotingPhase({ match, userId, prompt, onVote }) {
  const isPlayer =
    match.player1?.id === userId || match.player2?.id === userId;
  const myVote = match.myVote;

  const voteLabel = (choice) => {
    if (myVote === choice) return '✓ Your vote';
    if (myVote) return 'Switch vote here';
    return 'Vote for this story';
  };

  return (
    <>
      <VoteTally
        votes={match.votes}
        votersCount={match.votersCount}
        spectatorCount={match.spectatorCount}
      />

      <div className="stories-grid">
        <div className={`story-card p1 ${myVote === 'player1' ? 'voted-for' : ''}`}>
          <div className="story-header">
            <span className="story-author">{match.player1?.name}</span>
            <span className="vote-count">
              {match.votes.player1} {match.votes.player1 === 1 ? 'vote' : 'votes'}
            </span>
          </div>
          <div className="story-prompt-line">{prompt}</div>
          <div className="story-text">
            {match.submissions?.player1 || '(No story written)'}
          </div>
          {match.canVote && (
            <button
              className={`btn-vote ${myVote === 'player1' ? 'voted' : ''}`}
              onClick={() => onVote('player1')}
            >
              {voteLabel('player1')}
            </button>
          )}
        </div>

        <div className={`story-card p2 ${myVote === 'player2' ? 'voted-for' : ''}`}>
          <div className="story-header">
            <span className="story-author">{match.player2?.name}</span>
            <span className="vote-count">
              {match.votes.player2} {match.votes.player2 === 1 ? 'vote' : 'votes'}
            </span>
          </div>
          <div className="story-prompt-line">{prompt}</div>
          <div className="story-text">
            {match.submissions?.player2 || '(No story written)'}
          </div>
          {match.canVote && (
            <button
              className={`btn-vote ${myVote === 'player2' ? 'voted' : ''}`}
              onClick={() => onVote('player2')}
            >
              {voteLabel('player2')}
            </button>
          )}
        </div>
      </div>

      {match.canVote && (
        <p className="voted-msg" style={{ color: 'var(--text-muted)' }}>
          {myVote
            ? 'Tap the other story to switch your vote — counts update live!'
            : 'Pick a story — you can change your vote anytime!'}
        </p>
      )}
      {isPlayer && (
        <p className="voted-msg" style={{ color: 'var(--text-muted)' }}>
          Time&apos;s up! {match.spectatorCount} spectators have {VOTING_DURATION_SEC} seconds to vote…
        </p>
      )}
    </>
  );
}

function ResultsPhase({ match }) {
  const winnerName =
    match.winner === 'player1'
      ? match.player1?.name
      : match.player2?.name;

  return (
    <div className="results-banner">
      <h2>
        <span className="winner-name">{winnerName}</span> wins!
      </h2>
      <p style={{ color: 'var(--text-muted)' }}>Advancing to the next round…</p>
      <div className="results-scores">
        <div className="score-item p1">
          <div className="score-value">{match.votes.player1}</div>
          <div className="score-label">{match.player1?.name}</div>
        </div>
        <div className="score-item p2">
          <div className="score-value">{match.votes.player2}</div>
          <div className="score-label">{match.player2?.name}</div>
        </div>
      </div>
    </div>
  );
}

function Arena({ gameState, userId }) {
  const { match } = gameState;

  const handleVote = useCallback((choice) => {
    const socket = getSocket();
    socket.emit('vote', choice, (result) => {
      if (result.error) {
        console.warn('Vote failed:', result.error);
      }
    });
  }, []);

  if (!match) {
    return <WaitingView queueCount={gameState.queueCount} match={null} />;
  }

  const isSpectator =
    match.player1?.id !== userId && match.player2?.id !== userId;

  if (isSpectator && (match.phase === 'writing' || match.phase === 'voting')) {
    return (
      <div className="arena">
        <PhaseBanner phase={match.phase} endsAt={match.phaseEndsAt} />
        <MatchupHeader player1={match.player1} player2={match.player2} />
        <div className="prompt-card">
          <div className="prompt-label">Story Prompt</div>
          <div className="prompt-text">&ldquo;{match.prompt}&rdquo;</div>
        </div>
        <SpectatorView match={match} prompt={match.prompt} onVote={handleVote} />
      </div>
    );
  }

  return (
    <div className="arena">
      <PhaseBanner phase={match.phase} endsAt={match.phaseEndsAt} />
      <MatchupHeader
        player1={match.player1}
        player2={match.player2}
        winner={match.phase === 'results' ? match.winner : null}
      />

      <div className="prompt-card">
        <div className="prompt-label">Story Prompt</div>
        <div className="prompt-text">&ldquo;{match.prompt}&rdquo;</div>
      </div>

      {match.phase === 'writing' && (
        <WritingPhase match={match} userId={userId} />
      )}
      {match.phase === 'voting' && (
        <VotingPhase
          match={match}
          userId={userId}
          prompt={match.prompt}
          onVote={handleVote}
        />
      )}
      {match.phase === 'results' && <ResultsPhase match={match} />}
    </div>
  );
}

function GameScreen({ userId, userName, initialState }) {
  const [gameState, setGameState] = useState(initialState ?? null);

  useEffect(() => {
    const socket = getSocket();

    const onState = (state) => setGameState(state);
    const onLiveTyping = ({ matchId, liveText }) => {
      setGameState((prev) => {
        if (!prev?.match || prev.match.id !== matchId || prev.match.phase !== 'writing') {
          return prev;
        }
        return { ...prev, match: { ...prev.match, liveText } };
      });
    };

    socket.on('game:state', onState);
    socket.on('typing:live', onLiveTyping);

    return () => {
      socket.off('game:state', onState);
      socket.off('typing:live', onLiveTyping);
    };
  }, []);

  if (!gameState) {
    return (
      <div className="waiting-state">
        <div className="pulse-dot" />
      </div>
    );
  }

  const myUser = gameState.users.find((u) => u.id === userId);
  const userRole = myUser?.role ?? 'spectator';

  return (
    <>
      <Header
        userName={userName}
        userRole={userRole}
        onlineCount={gameState.users.length}
        round={gameState.round}
        champion={gameState.champion}
      />
      <div className="main">
        <Sidebar
          users={gameState.users}
          queueCount={gameState.queueCount}
          champion={gameState.champion}
          userId={userId}
        />
        <Arena gameState={gameState} userId={userId} />
      </div>
    </>
  );
}

export default function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    return () => disconnectSocket();
  }, []);

  if (!session) {
    return (
      <div className="app">
        <JoinScreen onJoin={(userId, name, state) => setSession({ userId, name, initialState: state })} />
      </div>
    );
  }

  return (
    <div className="app">
      <GameScreen userId={session.userId} userName={session.name} initialState={session.initialState} />
    </div>
  );
}
