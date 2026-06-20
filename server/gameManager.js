import { v4 as uuidv4 } from 'uuid';
import {
  MAX_STORY_LENGTH,
  MAX_USERNAME_LENGTH,
  MIN_PLAYERS_PER_MATCH,
  RESULTS_DURATION_MS,
  STORY_PROMPTS,
  TYPING_BROADCAST_MS,
  VOTING_DURATION_MS,
  WRITING_DURATION_MS,
} from '../shared/constants.js';

export class GameManager {
  constructor(io) {
    this.io = io;
    this.users = new Map();
    this.queue = [];
    this.champion = null;
    this.match = null;
    this.round = 0;
    this.timers = {};
    this.typingThrottle = null;
  }

  getPublicState(forSocketId = null) {
    const users = [...this.users.values()].map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
    }));

    let matchState = null;
    if (this.match) {
      const spectatorCount = [...this.users.keys()].filter(
        (id) => id !== this.match.player1 && id !== this.match.player2,
      ).length;

      matchState = {
        id: this.match.id,
        phase: this.match.phase,
        prompt: this.match.prompt,
        player1: this.formatPlayer(this.match.player1),
        player2: this.formatPlayer(this.match.player2),
        liveText:
          this.match.phase === 'writing'
            ? { ...this.match.liveText }
            : null,
        submissions:
          this.match.phase !== 'writing'
            ? {
                player1: this.match.submissions.player1 ?? '',
                player2: this.match.submissions.player2 ?? '',
              }
            : null,
        votes: {
          player1: this.match.votes.player1,
          player2: this.match.votes.player2,
          total: this.match.votes.player1 + this.match.votes.player2,
        },
        votersCount: this.match.voters.size,
        spectatorCount,
        winner: this.match.winner,
        phaseEndsAt: this.match.phaseEndsAt,
      };

      if (forSocketId) {
        const isSpectator =
          forSocketId !== this.match.player1 &&
          forSocketId !== this.match.player2;
        matchState.canVote =
          isSpectator &&
          (this.match.phase === 'writing' || this.match.phase === 'voting');
        matchState.myVote = this.match.voterChoices.get(forSocketId) ?? null;
      }
    }

    return {
      users,
      queue: this.queue.map((id) => this.users.get(id)?.name ?? 'Unknown'),
      queueCount: this.queue.length,
      champion: this.champion ? this.users.get(this.champion)?.name ?? null : null,
      round: this.round,
      match: matchState,
    };
  }

  formatPlayer(userId) {
    const user = this.users.get(userId);
    if (!user) return null;
    return { id: user.id, name: user.name };
  }

  broadcastState() {
    for (const [id, user] of this.users) {
      user.socket.emit('game:state', this.getPublicState(id));
    }
  }

  broadcastLiveTyping() {
    if (!this.match || this.match.phase !== 'writing') return;
    this.io.emit('typing:live', {
      matchId: this.match.id,
      liveText: { ...this.match.liveText },
    });
  }

  join(socket, name) {
    const trimmed = name.trim().slice(0, MAX_USERNAME_LENGTH);
    if (!trimmed) return { error: 'Name is required' };

    const user = {
      id: socket.id,
      name: trimmed,
      role: 'spectator',
      socket,
    };

    this.users.set(socket.id, user);
    this.queue.push(socket.id);
    this.syncRoles();
    this.broadcastState();

    if (!this.match) {
      this.tryStartMatch();
    }

    return { success: true, userId: socket.id };
  }

  leave(socketId) {
    const user = this.users.get(socketId);
    if (!user) return;

    this.queue = this.queue.filter((id) => id !== socketId);

    if (this.match) {
      const { player1, player2, phase } = this.match;

      if (phase === 'writing' && (player1 === socketId || player2 === socketId)) {
        this.endMatchEarly(socketId);
      } else if (player1 === socketId || player2 === socketId) {
        this.clearTimers();
        this.match = null;
        this.champion = null;
      }
    }

    if (this.champion === socketId) {
      this.champion = null;
    }

    this.users.delete(socketId);
    this.syncRoles();
    this.broadcastState();

    if (!this.match) {
      this.tryStartMatch();
    }
  }

  syncRoles() {
    for (const user of this.users.values()) {
      user.role = 'spectator';
    }

    if (this.match) {
      const p1 = this.users.get(this.match.player1);
      const p2 = this.users.get(this.match.player2);
      if (p1) p1.role = 'player';
      if (p2) p2.role = 'player';
    }
  }

  tryStartMatch() {
    if (this.match) return;

    let player1 = this.champion;
    let player2 = null;

    if (player1) {
      player2 = this.queue.find((id) => id !== player1 && this.users.has(id)) ?? null;
    } else {
      const available = this.queue.filter((id) => this.users.has(id));
      if (available.length >= MIN_PLAYERS_PER_MATCH) {
        player1 = available[0];
        player2 = available[1];
      }
    }

    if (!player1 || !player2) return;

    this.queue = this.queue.filter((id) => id !== player1 && id !== player2);
    this.round += 1;

    this.match = {
      id: uuidv4(),
      phase: 'writing',
      prompt: STORY_PROMPTS[Math.floor(Math.random() * STORY_PROMPTS.length)],
      player1,
      player2,
      liveText: { player1: '', player2: '' },
      submissions: { player1: '', player2: '' },
      votes: { player1: 0, player2: 0 },
      voters: new Set(),
      voterChoices: new Map(),
      winner: null,
      phaseEndsAt: Date.now() + WRITING_DURATION_MS,
    };

    this.syncRoles();
    this.broadcastState();

    this.timers.writing = setTimeout(() => this.startVoting(), WRITING_DURATION_MS);
  }

  updateTyping(socketId, text) {
    if (!this.match || this.match.phase !== 'writing') return;

    const slot = this.getPlayerSlot(socketId);
    if (!slot) return;

    this.match.liveText[slot] = text.slice(0, MAX_STORY_LENGTH);

    if (!this.typingThrottle) {
      this.typingThrottle = setTimeout(() => {
        this.broadcastLiveTyping();
        this.typingThrottle = null;
      }, TYPING_BROADCAST_MS);
    }
  }

  getPlayerSlot(socketId) {
    if (!this.match) return null;
    if (this.match.player1 === socketId) return 'player1';
    if (this.match.player2 === socketId) return 'player2';
    return null;
  }

  startVoting() {
    if (!this.match) return;

    clearTimeout(this.timers.writing);
    if (this.typingThrottle) {
      clearTimeout(this.typingThrottle);
      this.typingThrottle = null;
    }

    this.match.submissions.player1 = this.match.liveText.player1.trim();
    this.match.submissions.player2 = this.match.liveText.player2.trim();
    this.match.phase = 'voting';
    this.match.phaseEndsAt = Date.now() + VOTING_DURATION_MS;
    this.broadcastState();

    this.timers.voting = setTimeout(() => this.endVoting(), VOTING_DURATION_MS);
  }

  vote(socketId, choice) {
    if (!this.match || (this.match.phase !== 'writing' && this.match.phase !== 'voting')) {
      return { error: 'Voting is not open' };
    }

    if (this.match.player1 === socketId || this.match.player2 === socketId) {
      return { error: 'Players cannot vote in their own match' };
    }

    if (choice !== 'player1' && choice !== 'player2') {
      return { error: 'Invalid vote' };
    }

    const previous = this.match.voterChoices.get(socketId);
    if (previous === choice) {
      return { success: true, votes: { ...this.match.votes }, myVote: choice };
    }

    if (previous) {
      this.match.votes[previous] = Math.max(0, this.match.votes[previous] - 1);
    } else {
      this.match.voters.add(socketId);
    }

    this.match.voterChoices.set(socketId, choice);
    this.match.votes[choice] += 1;
    this.broadcastState();

    return {
      success: true,
      votes: { ...this.match.votes },
      myVote: choice,
    };
  }

  endVoting() {
    if (!this.match) return;

    clearTimeout(this.timers.voting);

    const { votes, player1, player2 } = this.match;
    let winner;

    if (votes.player1 > votes.player2) {
      winner = 'player1';
    } else if (votes.player2 > votes.player1) {
      winner = 'player2';
    } else {
      winner = Math.random() < 0.5 ? 'player1' : 'player2';
    }

    const winnerId = winner === 'player1' ? player1 : player2;
    const loserId = winner === 'player1' ? player2 : player1;

    this.match.phase = 'results';
    this.match.winner = winner;
    this.match.phaseEndsAt = Date.now() + RESULTS_DURATION_MS;
    this.champion = winnerId;

    this.queue.push(loserId);
    this.broadcastState();

    this.timers.results = setTimeout(() => {
      this.match = null;
      this.syncRoles();
      this.broadcastState();
      this.tryStartMatch();
    }, RESULTS_DURATION_MS);
  }

  endMatchEarly(disconnectedId) {
    if (!this.match) return;

    this.clearTimers();

    const { player1, player2 } = this.match;
    const winnerId = disconnectedId === player1 ? player2 : player1;
    const loserId = disconnectedId === player1 ? player1 : player2;

    this.match.phase = 'results';
    this.match.winner = winnerId === player1 ? 'player1' : 'player2';
    this.match.phaseEndsAt = Date.now() + RESULTS_DURATION_MS;
    this.champion = winnerId;

    this.queue.push(loserId);
    this.broadcastState();

    this.timers.results = setTimeout(() => {
      this.match = null;
      this.syncRoles();
      this.broadcastState();
      this.tryStartMatch();
    }, RESULTS_DURATION_MS);
  }

  clearTimers() {
    clearTimeout(this.timers.writing);
    clearTimeout(this.timers.voting);
    clearTimeout(this.timers.results);
    if (this.typingThrottle) {
      clearTimeout(this.typingThrottle);
      this.typingThrottle = null;
    }
    this.timers = {};
  }
}
