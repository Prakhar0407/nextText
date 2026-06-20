// ── Game timing ──────────────────────────────────────────────────────────────

export const WRITING_DURATION_MS = 20_000;
export const VOTING_DURATION_MS = 5_000;
export const RESULTS_DURATION_MS = 8_000;
export const TYPING_BROADCAST_MS = 80;
export const COUNTDOWN_TICK_MS = 250;

export const WRITING_DURATION_SEC = WRITING_DURATION_MS / 1000;
export const VOTING_DURATION_SEC = VOTING_DURATION_MS / 1000;
export const RESULTS_DURATION_SEC = RESULTS_DURATION_MS / 1000;

// ── Game limits ──────────────────────────────────────────────────────────────

export const MAX_USERNAME_LENGTH = 24;
export const MAX_STORY_LENGTH = 2000;

// ── Match requirements ───────────────────────────────────────────────────────

export const MIN_PLAYERS_PER_MATCH = 2;
export const MIN_PLAYERS_TO_VOTE = 3;

// ── UI thresholds ────────────────────────────────────────────────────────────

export const WRITING_TIMER_URGENT_SEC = 10;
export const VOTING_TIMER_URGENT_SEC = 3;

// ── Server / client ──────────────────────────────────────────────────────────

export const SERVER_PORT = 3001;
export const CLIENT_PORT = 5173;
export const SERVER_URL = `http://localhost:${SERVER_PORT}`;

// ── Story prompts ────────────────────────────────────────────────────────────

export const STORY_PROMPTS = [
  'The door creaked open, and nobody was there — except a note that read:',
  'She opened the last letter and realized the truth:',
  'In the middle of the ocean, the lighthouse keeper saw something impossible:',
  'The old photograph fell from the book, and on the back someone had written:',
  'Every night at midnight, the same stranger knocked on his door and said:',
  'The map led to a place that shouldn\'t exist, where the trees whispered:',
  'He woke up with no memory, but his pocket contained a key and a single sentence:',
  'The last person on Earth heard a knock at the door, and when they opened it:',
  'The fortune cookie said three words that changed everything:',
  'Deep in the archive, she found a file with her name on it — dated tomorrow:',
];
