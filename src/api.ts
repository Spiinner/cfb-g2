import type {
  ESPNScoreboardResponse,
  ESPNEvent,
  ESPNSummaryResponse,
  ESPNPlay,
  ESPNSummaryTeam,
  FlatPlay,
  FieldPosition,
  GameState,
} from './types';

// ── Configuration ───────────────────────────────────────────────────
// In dev (Vite): relative "/espn" works because the Vite proxy handles it.
// On Render: relative "/espn" works because Express proxies it.
// Inside EvenHub (.ehpk): the page is loaded locally, so we need the full
//   Render URL to reach the ESPN proxy.
const RENDER_URL = 'https://cfb-g2.onrender.com';

function getApiBase(): string {
  // If served from Render or localhost, relative path works (proxy handles it)
  if (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
     window.location.hostname === '127.0.0.1' ||
     window.location.hostname.includes('onrender.com'))
  ) {
    return '/espn';
  }
  // Otherwise (EvenHub WebView, file://, etc.) use the full Render URL
  return `${RENDER_URL}/espn`;
}

const API_BASE = getApiBase();
const CFB = '/apis/site/v2/sports/football/college-football';

// ── Fetchers ────────────────────────────────────────────────────────

export async function fetchScoreboard(): Promise<ESPNEvent[]> {
  const res = await fetch(`${API_BASE}${CFB}/scoreboard`);
  if (!res.ok) throw new Error(`Scoreboard ${res.status}`);
  const data: ESPNScoreboardResponse = await res.json();
  return data.events ?? [];
}

export async function fetchSummary(gameId: string): Promise<ESPNSummaryResponse> {
  const res = await fetch(`${API_BASE}${CFB}/summary?event=${gameId}`);
  if (!res.ok) throw new Error(`Summary ${res.status}`);
  return res.json();
}

// ── Parsing ─────────────────────────────────────────────────────────

/** Map ESPN status string → our simplified status. */
function parseGameStatus(statusName: string): 'live' | 'pre' | 'final' {
  if (statusName.includes('PROGRESS') || statusName.includes('HALFTIME') || statusName.includes('END_PERIOD')) {
    return 'live';
  }
  if (statusName.includes('FINAL') || statusName.includes('POSTPONED')) {
    return 'final';
  }
  return 'pre';
}

/** Flatten all plays from drives into chronological order. */
function flattenPlays(summary: ESPNSummaryResponse, homeTeamId: string): FlatPlay[] {
  const drives = summary.drives;
  if (!drives) return [];

  const allDrives = [...(drives.previous ?? [])];
  if (drives.current) allDrives.push(drives.current);

  const plays: FlatPlay[] = [];
  for (const drive of allDrives) {
    for (const play of drive.plays ?? []) {
      plays.push({
        playText: play.text,
        driveText: play.start?.downDistanceText ?? '',
        homeScore: play.homeScore,
        visitorScore: play.awayScore,
        clock: play.clock?.displayValue ?? '',
        teamId: play.start?.team?.id ?? drive.team?.id ?? '',
        period: play.period?.number ?? 0,
      });
    }
  }

  return plays;
}

/**
 * Convert ESPN's yardsToEndzone into our field coordinate system.
 *
 * Our system: 0 = away (left) end zone, 100 = home (right) end zone.
 *
 * ESPN's yardsToEndzone = distance from the end zone the offense is attacking.
 *   - Home team attacks the away EZ (position 0) → ballYard = yardsToEndzone
 *   - Away team attacks the home EZ (position 100) → ballYard = 100 - yardsToEndzone
 */
function espnToFieldPosition(
  play: ESPNPlay,
  homeTeamId: string,
): FieldPosition | null {
  const end = play.end;
  if (!end || end.down < 0) return null;

  const possTeamId = end.team?.id ?? play.start?.team?.id;
  const isHomePoss = possTeamId === homeTeamId;
  const yте = end.yardsToEndzone ?? end.yardLine;

  if (yте == null || yте < 0) return null;

  const ballYard = isHomePoss ? yте : 100 - yте;

  let firstDownYard: number | null = null;
  if (end.distance > 0) {
    // Home moves left (toward 0), away moves right (toward 100)
    firstDownYard = isHomePoss
      ? ballYard - end.distance
      : ballYard + end.distance;
    firstDownYard = Math.max(0, Math.min(100, firstDownYard));
  } else if (end.distance === 0) {
    // "& Goal" — first down line is the goal line
    firstDownYard = isHomePoss ? 0 : 100;
  }

  return {
    ballYard,
    firstDownYard,
    down: end.down,
    distance: end.distance <= 0 ? 'Goal' : String(end.distance),
    raw: end.downDistanceText ?? `${end.down} & ${end.distance}`,
  };
}

// ── Build full game state ───────────────────────────────────────────

export async function buildGameState(event: ESPNEvent): Promise<GameState> {
  const comp = event.competitions[0];
  const homeComp = comp.competitors.find((c) => c.homeAway === 'home')!;
  const awayComp = comp.competitors.find((c) => c.homeAway === 'away')!;

  const homeRank = homeComp.curatedRank?.current;
  const awayRank = awayComp.curatedRank?.current;

  const state: GameState = {
    gameId: event.id,
    homeTeam: {
      name: homeComp.team.displayName,
      short: homeComp.team.abbreviation,
      rank: homeRank && homeRank <= 25 ? String(homeRank) : '',
      score: parseInt(homeComp.score ?? '0', 10) || 0,
    },
    awayTeam: {
      name: awayComp.team.displayName,
      short: awayComp.team.abbreviation,
      rank: awayRank && awayRank <= 25 ? String(awayRank) : '',
      score: parseInt(awayComp.score ?? '0', 10) || 0,
    },
    quarter: event.status.period > 0 ? `Q${event.status.period}` : '',
    clock: event.status.displayClock ?? '',
    possession: null,
    fieldPos: null,
    recentPlays: [],
    gameStatus: parseGameStatus(event.status.type.name),
  };

  if (state.gameStatus === 'pre') return state;

  try {
    const summary = await fetchSummary(event.id);
    const homeTeamId = homeComp.team.id;

    // Flatten all plays
    const allPlays = flattenPlays(summary, homeTeamId);
    state.recentPlays = allPlays.slice(-8);

    // Get the latest play for field position and possession
    const drives = summary.drives;
    const currentDrive = drives?.current;
    const lastDrivePlays = currentDrive?.plays ?? [];
    const latestPlay = lastDrivePlays.length > 0
      ? lastDrivePlays[lastDrivePlays.length - 1]
      : allPlays.length > 0
        ? findLatestESPNPlay(summary)
        : null;

    if (latestPlay) {
      // Determine possession from the play
      const possTeamId = latestPlay.end?.team?.id ?? latestPlay.start?.team?.id;
      if (possTeamId === homeTeamId) {
        state.possession = 'home';
      } else if (possTeamId) {
        state.possession = 'away';
      }

      // Update scores from latest play
      state.homeTeam.score = latestPlay.homeScore;
      state.awayTeam.score = latestPlay.awayScore;

      // Parse field position
      state.fieldPos = espnToFieldPosition(latestPlay, homeTeamId);
    }

    // Update clock from summary header if available
    const headerStatus = summary.header?.competitions?.[0]?.status;
    if (headerStatus) {
      if (headerStatus.period > 0) state.quarter = `Q${headerStatus.period}`;
      if (headerStatus.displayClock) state.clock = headerStatus.displayClock;
      state.gameStatus = parseGameStatus(headerStatus.type.name);
    }
  } catch (e) {
    console.warn('Could not fetch game summary:', e);
  }

  return state;
}

/** Find the very latest play across all drives. */
function findLatestESPNPlay(summary: ESPNSummaryResponse): ESPNPlay | null {
  const drives = summary.drives;
  if (!drives) return null;

  // Check current drive first
  if (drives.current?.plays?.length) {
    return drives.current.plays[drives.current.plays.length - 1];
  }

  // Fall back to last previous drive
  if (drives.previous?.length) {
    const lastDrive = drives.previous[drives.previous.length - 1];
    if (lastDrive.plays?.length) {
      return lastDrive.plays[lastDrive.plays.length - 1];
    }
  }

  return null;
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Sort games: live first, then pre, then final. */
export function sortGames(events: ESPNEvent[]): ESPNEvent[] {
  const order: Record<string, number> = { live: 0, pre: 1, final: 2 };
  return [...events].sort((a, b) => {
    const sa = parseGameStatus(a.status.type.name);
    const sb = parseGameStatus(b.status.type.name);
    return (order[sa] ?? 9) - (order[sb] ?? 9);
  });
}

/** Format a game for the G2 list view. */
export function formatGameListItem(event: ESPNEvent): string {
  const comp = event.competitions[0];
  const home = comp.competitors.find((c) => c.homeAway === 'home')!;
  const away = comp.competitors.find((c) => c.homeAway === 'away')!;

  const awayRank = away.curatedRank?.current;
  const homeRank = home.curatedRank?.current;
  const ar = awayRank && awayRank <= 25 ? `#${awayRank} ` : '';
  const hr = homeRank && homeRank <= 25 ? `#${homeRank} ` : '';
  const awayName = `${ar}${away.team.abbreviation}`;
  const homeName = `${hr}${home.team.abbreviation}`;

  const status = parseGameStatus(event.status.type.name);

  if (status === 'live') {
    const period = event.status.period > 4 ? 'OT' : `Q${event.status.period}`;
    const clock = event.status.displayClock;
    return `${awayName} ${away.score}-${home.score} ${homeName} ${period} ${clock}`;
  }
  if (status === 'final') {
    return `${awayName} ${away.score}-${home.score} ${homeName} F`;
  }
  // Pre-game
  const detail = event.status.type.shortDetail ?? 'TBD';
  return `${awayName} vs ${homeName} ${detail}`;
}
