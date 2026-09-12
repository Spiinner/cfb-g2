// ── ESPN API response types ─────────────────────────────────────────

export interface ESPNScoreboardResponse {
  events: ESPNEvent[];
}

export interface ESPNEvent {
  id: string;
  name: string;
  shortName: string;
  competitions: ESPNCompetition[];
  status: ESPNStatus;
  situation?: ESPNSituation;
  week?: { number: number };
}

export interface ESPNCompetition {
  competitors: ESPNCompetitor[];
}

export interface ESPNCompetitor {
  homeAway: 'home' | 'away';
  team: {
    id: string;
    displayName: string;
    abbreviation: string;
    shortDisplayName: string;
    color?: string;
    logo?: string;
  };
  score?: string;
  curatedRank?: { current: number };
}

export interface ESPNStatus {
  clock: number;
  displayClock: string;
  period: number;
  type: { name: string; description?: string; shortDetail?: string };
}

export interface ESPNSituation {
  yardLine?: number;
  down?: number;
  distance?: number;
  possession?: string;
  downDistanceText?: string;
  shortDownDistanceText?: string;
  possessionText?: string;
  lastPlay?: { text?: string };
  isRedZone?: boolean;
}

// ── ESPN Summary (play-by-play) types ───────────────────────────────

export interface ESPNSummaryResponse {
  boxscore: {
    teams: ESPNSummaryTeam[];
  };
  drives?: ESPNDrives;
  header?: {
    competitions?: Array<{
      status?: ESPNStatus;
    }>;
  };
}

export interface ESPNSummaryTeam {
  team: {
    id: string;
    abbreviation: string;
    displayName: string;
    shortDisplayName: string;
    color?: string;
    logo?: string;
  };
  homeAway: 'home' | 'away';
  statistics?: Array<{ name: string; displayValue: string }>;
}

export interface ESPNDrives {
  current?: ESPNDrive;
  previous?: ESPNDrive[];
}

export interface ESPNDrive {
  id: string;
  description?: string;
  team: { id: string; abbreviation: string; displayName?: string };
  start?: ESPNDrivePoint;
  end?: ESPNDrivePoint;
  result?: string;
  displayResult?: string;
  plays: ESPNPlay[];
  isScore?: boolean;
}

export interface ESPNDrivePoint {
  period?: { number: number };
  clock?: { displayValue: string };
  yardLine?: number;
  text?: string;
}

export interface ESPNPlay {
  id: string;
  sequenceNumber?: string;
  type: { id: string; text: string; abbreviation: string };
  text: string;
  awayScore: number;
  homeScore: number;
  period: { number: number };
  clock: { displayValue: string };
  wallclock?: string;
  scoringPlay: boolean;
  statYardage?: number;
  start: ESPNPlayPosition;
  end: ESPNPlayPosition;
  isPenalty?: boolean;
  isTurnover?: boolean;
}

export interface ESPNPlayPosition {
  down: number;
  distance: number;
  yardLine: number;
  yardsToEndzone: number;
  downDistanceText?: string;
  shortDownDistanceText?: string;
  possessionText?: string;
  team?: { id: string };
}

// ── App-level types (unchanged — consumed by main.ts + field.ts) ────

export interface FlatPlay {
  playText: string;
  driveText: string;
  homeScore: number | null;
  visitorScore: number | null;
  clock: string;
  teamId: string;
  period: number;
}

export interface FieldPosition {
  /** 0 = away end zone (left), 100 = home end zone (right) */
  ballYard: number;
  /** Absolute first-down marker position (0-100) */
  firstDownYard: number | null;
  /** Down number (1-4) */
  down: number;
  /** Distance to first down */
  distance: string;
  /** Pre-formatted text, e.g. "2nd & 7 at MICH 35" */
  raw: string;
}

export interface GameState {
  gameId: string;
  homeTeam: { name: string; short: string; rank: string; score: number };
  awayTeam: { name: string; short: string; rank: string; score: number };
  quarter: string;
  clock: string;
  possession: 'home' | 'away' | null;
  fieldPos: FieldPosition | null;
  recentPlays: FlatPlay[];
  gameStatus: 'live' | 'pre' | 'final';
}

export type Screen = 'list' | 'game';
