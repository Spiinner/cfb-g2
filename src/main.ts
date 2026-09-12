/**
 * main.ts — CFB G2: College Football Play-by-Play for Even Realities G2
 *
 * Architecture:
 *   NCAA API  →  this app (Vite web app)  →  Even Hub SDK  →  G2 glasses
 *
 * Screens:
 *   1. Game List — scrollable list of today's FBS games (live → pre → final)
 *   2. Game View — scoreboard header, field graphic with arrow, play-by-play
 *
 * Controls:
 *   - Tap: select game / refresh
 *   - Double-tap: back to game list / exit app
 */

import {
  EvenAppBridge,
  waitForEvenAppBridge,
  TextContainerProperty,
  ImageContainerProperty,
  ListContainerProperty,
  ListItemContainerProperty,
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerUpgrade,
  ImageRawDataUpdate,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk';
import type { EvenHubEvent } from '@evenrealities/even_hub_sdk';

import type { ESPNEvent, GameState, Screen } from './types';
import {
  fetchScoreboard,
  sortGames,
  formatGameListItem,
  buildGameState,
} from './api';
import { renderField, renderPreview, FIELD_W, FIELD_H } from './field';

// ── State ───────────────────────────────────────────────────────────
let bridge: EvenAppBridge;
let currentScreen: Screen = 'list';
let games: ESPNEvent[] = [];
let selectedGame: ESPNEvent | null = null;
let gameState: GameState | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let isUpdating = false;
let hasStartedUp = false; // Track whether createStartUpPageContainer was called

const POLL_INTERVAL_MS = 3_000; // 3 seconds for live games
const status = (msg: string) => {
  const el = document.getElementById('status');
  if (el) el.textContent = msg;
  console.log(`[CFB-G2] ${msg}`);
};

// ── Initialization ──────────────────────────────────────────────────

async function init() {
  status('Connecting to Even Hub SDK...');

  bridge = await waitForEvenAppBridge();

  // Register event handler
  bridge.onEvenHubEvent((event: EvenHubEvent) => {
    const osEvent =
      event.listEvent?.eventType ??
      event.textEvent?.eventType ??
      event.sysEvent?.eventType;

    // SDK converts 0 (CLICK_EVENT) to undefined — handle both
    if (osEvent === OsEventTypeList.CLICK_EVENT || osEvent === undefined) {
      handleTap(event);
    } else if (osEvent === OsEventTypeList.DOUBLE_CLICK_EVENT) {
      handleDoubleTap();
    }
  });

  // Set up browser preview overlay
  setupBrowserPreview();

  await showGameList();
}

// ── Game List Screen ────────────────────────────────────────────────

async function showGameList() {
  currentScreen = 'list';
  stopPolling();
  selectedGame = null;
  gameState = null;
  status('Loading scoreboard...');

  try {
    const allGames = await fetchScoreboard();
    games = sortGames(allGames).slice(0, 20); // Max 20 items in list
  } catch (e) {
    status(`Error loading games: ${e}`);
    games = [];
  }

  if (games.length === 0) {
    await showMessage('No FBS games found today.\nTap to refresh.');
    return;
  }

  const itemNames = games.map(formatGameListItem);

  const listContainer = new ListContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: 288,
    borderWidth: 1,
    borderColor: 8,
    borderRadius: 4,
    paddingLength: 4,
    containerID: 1,
    containerName: 'game-list',
    isEventCapture: 1,
    itemContainer: new ListItemContainerProperty({
      itemCount: itemNames.length,
      itemWidth: 560,
      isItemSelectBorderEn: 1,
      itemName: itemNames,
    }),
  });

  if (!hasStartedUp) {
    // First launch — must use createStartUpPageContainer exactly once
    const result = await bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer({
        containerTotalNum: 1,
        listObject: [listContainer],
      }),
    );
    hasStartedUp = true;
    status(`Game list loaded (${games.length} games). Tap to select.`);
    console.log('createStartUpPageContainer result:', result);
  } else {
    // Already started — use rebuild
    await bridge.rebuildPageContainer(
      new RebuildPageContainer({
        containerTotalNum: 1,
        listObject: [listContainer],
      }),
    );
    status(`Game list refreshed (${games.length} games).`);
  }
}

// ── Game View Screen ────────────────────────────────────────────────

async function showGameView(game: ESPNEvent) {
  currentScreen = 'game';
  selectedGame = game;
  const comp = game.competitions[0];
  const away = comp.competitors.find((c) => c.homeAway === 'away')!;
  const home = comp.competitors.find((c) => c.homeAway === 'home')!;
  status(`Loading ${away.team.abbreviation} @ ${home.team.abbreviation}...`);

  // Build 3-container layout:
  //   Container 1: Score header (text)     — top 55px
  //   Container 2: Field graphic (image)   — middle 80px, centered
  //   Container 3: Play-by-play (text)     — bottom, scrollable

  const headerText = new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: 55,
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 0,
    paddingLength: 4,
    containerID: 1,
    containerName: 'header',
    isEventCapture: 0,
  });

  const fieldImage = new ImageContainerProperty({
    xPosition: Math.floor((576 - FIELD_W) / 2),
    yPosition: 55,
    width: FIELD_W,
    height: FIELD_H,
    containerID: 2,
    containerName: 'field',
  });

  const playsText = new TextContainerProperty({
    xPosition: 0,
    yPosition: 55 + FIELD_H + 2,
    width: 576,
    height: 288 - 55 - FIELD_H - 2,
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 0,
    paddingLength: 4,
    containerID: 3,
    containerName: 'plays',
    isEventCapture: 1,
  });

  try {
    await bridge.rebuildPageContainer(
      new RebuildPageContainer({
        containerTotalNum: 3,
        textObject: [headerText, playsText],
        imageObject: [fieldImage],
      }),
    );
  } catch (e) {
    status(`Error building game view: ${e}`);
    return;
  }

  // Fetch data and populate
  await refreshGameView();

  // Start polling for live games
  if (game.status.type.name.includes('PROGRESS') || game.status.type.name.includes('HALFTIME')) {
    startPolling();
  }
}

async function refreshGameView() {
  if (!selectedGame || isUpdating) return;
  isUpdating = true;

  try {
    gameState = await buildGameState(selectedGame);

    // Update containers sequentially (G2 can't handle concurrent sends)
    await updateHeader();
    await updateFieldImage();
    await updatePlays();

    status(
      `Updated ${gameState.homeTeam.short} game` +
        (gameState.quarter ? ` — ${gameState.quarter} ${gameState.clock}` : ''),
    );
  } catch (e) {
    status(`Refresh error: ${e}`);
  } finally {
    isUpdating = false;
  }
}

async function updateHeader() {
  if (!gameState) return;

  const g = gameState;
  const awayRank = g.awayTeam.rank ? `#${g.awayTeam.rank} ` : '';
  const homeRank = g.homeTeam.rank ? `#${g.homeTeam.rank} ` : '';
  const away = `${awayRank}${g.awayTeam.short}`;
  const home = `${homeRank}${g.homeTeam.short}`;
  const possAway = g.possession === 'away' ? ' ●' : '';
  const possHome = g.possession === 'home' ? '● ' : '';

  const line1 = `${away}${possAway} ${g.awayTeam.score}  ━  ${g.homeTeam.score} ${possHome}${home}`;

  let line2 = '';
  if (g.gameStatus === 'pre') {
    line2 = `Kickoff: ${g.clock || 'TBD'}`;
  } else if (g.gameStatus === 'final') {
    line2 = 'FINAL';
  } else {
    line2 = `${g.quarter}  ${g.clock}`;
    if (g.fieldPos) {
      line2 += `  ${g.fieldPos.down}${ordinal(g.fieldPos.down)} & ${g.fieldPos.distance}`;
    }
  }

  const headerContent = `${line1}\n${line2}`;
  updatePreviewText('header', headerContent);

  try {
    await bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: 1,
        containerName: 'header',
        content: headerContent,
      }),
    );
  } catch (e) {
    console.warn('Header update failed:', e);
  }
}

async function updateFieldImage() {
  if (!gameState) return;

  const g = gameState;
  const ballYard = g.fieldPos?.ballYard ?? 50;
  const firstDownYard = g.fieldPos?.firstDownYard ?? null;

  const fieldOpts = {
    ballYard,
    firstDownYard,
    awayLabel: g.awayTeam.short,
    homeLabel: g.homeTeam.short,
    possession: g.possession,
  };

  // Render to base64 PNG for G2
  const base64 = renderField(fieldOpts);

  // Also render browser preview canvas
  renderPreview(fieldOpts);

  // Convert base64 PNG to number[] for maximum G2 compatibility
  const binaryStr = atob(base64);
  const bytes: number[] = new Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  try {
    const update = new ImageRawDataUpdate({
      containerID: 2,
      containerName: 'field',
      imageData: bytes,
    });

    // Workaround: SDK 0.0.12–0.0.13 stamps compressMode: 2 (LZ4)
    // while sending uncompressed data, which causes the image to
    // silently fail on Even App < 2.2.7. Strip it.
    const origToJson = update.toJson.bind(update);
    update.toJson = () => {
      const json = origToJson();
      delete json.compressMode;
      delete json.compress_mode;
      return json;
    };

    await bridge.updateImageRawData(update);
  } catch (e) {
    console.warn('Field image update failed:', e);
  }
}

async function updatePlays() {
  if (!gameState) return;

  const g = gameState;
  let content = '';

  if (g.gameStatus === 'pre') {
    content = 'Game has not started yet.\nTap to refresh.';
  } else if (g.recentPlays.length === 0) {
    content = 'No play data available yet.';
  } else {
    // Show last 3 plays, most recent first — full text, no truncation
    // G2 text container supports 2000 chars and scrolls if needed
    const recent = g.recentPlays.slice(-3).reverse();
    const lines: string[] = [];

    for (let i = 0; i < recent.length; i++) {
      const p = recent[i];
      const marker = i === 0 ? '▶' : ' ';
      const clock = p.clock || '';

      // Clean up ESPN's raw play text:
      // Remove leading clock "(06:03) " since we show it separately
      let text = p.playText || '(no description)';
      text = text.replace(/^\(\d{1,2}:\d{2}\)\s*/, '');
      // Remove jersey number tags like "#6 " for readability
      text = text.replace(/#\d{1,3}\s+/g, '');

      lines.push(`${marker} ${clock} ${text}`);
    }

    content = lines.join('\n');
  }

  updatePreviewText('plays', content);

  try {
    await bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: 3,
        containerName: 'plays',
        content,
      }),
    );
  } catch (e) {
    console.warn('Plays update failed:', e);
  }
}

// ── Event Handlers ──────────────────────────────────────────────────

function handleTap(event: EvenHubEvent) {
  if (currentScreen === 'list') {
    // Determine which game was selected
    let gameIdx = 0;

    if (event.listEvent) {
      // Try index first, fall back to name matching
      const idx = event.listEvent.currentSelectItemIndex;
      if (typeof idx === 'number' && idx >= 0 && idx < games.length) {
        gameIdx = idx;
      } else if (event.listEvent.currentSelectItemName) {
        const byName = games.findIndex(
          (g) => formatGameListItem(g) === event.listEvent!.currentSelectItemName,
        );
        if (byName >= 0) gameIdx = byName;
      }
    }

    if (games[gameIdx]) {
      showGameView(games[gameIdx]);
    }
  } else if (currentScreen === 'game') {
    // Tap on game view → refresh data
    refreshGameView();
  }
}

function handleDoubleTap() {
  if (currentScreen === 'game') {
    // Go back to game list
    showGameList();
  } else {
    // Root screen double-tap → trigger shutdown dialogue (required for submission)
    try {
      bridge.shutDownPageContainer(1);
    } catch {
      // Ignore if not supported (e.g. in simulator)
    }
  }
}

// ── Polling ─────────────────────────────────────────────────────────

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    if (currentScreen === 'game' && selectedGame) {
      refreshGameView();
    }
  }, POLL_INTERVAL_MS);
  status(`Auto-refreshing every ${POLL_INTERVAL_MS / 1000}s`);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// ── Utilities ───────────────────────────────────────────────────────

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/** Show a full-screen text message (error/empty state). */
async function showMessage(message: string) {
  const textContainer = new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: 288,
    borderWidth: 1,
    borderColor: 8,
    borderRadius: 4,
    paddingLength: 10,
    containerID: 1,
    containerName: 'message',
    isEventCapture: 1,
  });

  const pageConfig = {
    containerTotalNum: 1,
    textObject: [textContainer],
  };

  if (!hasStartedUp) {
    await bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer(pageConfig),
    );
    hasStartedUp = true;
  } else {
    await bridge.rebuildPageContainer(
      new RebuildPageContainer(pageConfig),
    );
  }

  await bridge.textContainerUpgrade(
    new TextContainerUpgrade({
      containerID: 1,
      containerName: 'message',
      content: message,
    }),
  );
}

// ── Browser Preview ─────────────────────────────────────────────────
// When running in a regular browser (not Even Hub WebView), show a
// visual preview of the G2 display at 576×288.

function setupBrowserPreview() {
  const preview = document.getElementById('preview');
  if (!preview) return;

  // Header text overlay
  const headerDiv = document.createElement('div');
  headerDiv.id = 'preview-header';
  headerDiv.style.cssText =
    'position:absolute;top:0;left:0;width:576px;height:55px;' +
    'font:12px monospace;color:#0f0;padding:6px;box-sizing:border-box;' +
    'white-space:pre;overflow:hidden;line-height:1.6;';
  preview.appendChild(headerDiv);

  // Plays text overlay
  const playsDiv = document.createElement('div');
  playsDiv.id = 'preview-plays';
  playsDiv.style.cssText =
    `position:absolute;top:${55 + FIELD_H + 2}px;left:0;width:576px;` +
    `height:${288 - 55 - FIELD_H - 2}px;` +
    'font:11px monospace;color:#0f0;padding:6px;box-sizing:border-box;' +
    'white-space:pre;overflow:hidden;line-height:1.5;';
  preview.appendChild(playsDiv);
}

function updatePreviewText(container: 'header' | 'plays', content: string) {
  const id = container === 'header' ? 'preview-header' : 'preview-plays';
  const el = document.getElementById(id);
  if (el) el.textContent = content;
}

// ── Start ───────────────────────────────────────────────────────────

init().catch((e) => {
  status(`Init failed: ${e}`);
  console.error(e);
});
