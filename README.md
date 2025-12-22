# Mitigations & Missteps

Card-driven, online Snakes & Ladders variant for incident-response storytelling. A 50-square board: land on marked squares to draw a random "control" (move forward) or "misstep" (move back); each player starts off-board with a mitigation hand to counter missteps (your choice), and burned mitigations drop into a visible discard pile.

## Quick start
- Install: `npm install`
- Run: `npm start` (defaults to port `31337`, or override with `PORT=4000 npm start`)
- Visit: http://localhost:31337 and share the room code with others (default `alpha`).

## How the game works
- **Rooms**: Players join a named room (e.g., `alpha`). Anyone using the same code shares the same state.
- **Joining**: Enter a display name (24 chars max) and room code (32 chars max). A random two-word room code is suggested each session; first player sets turn order, later players append to the end. Everyone starts on the Start Here square; the next square is numbered 1.
- **Turn order**: Locked to join order. After each valid roll, turn advances to the next player (wraps to start).
- **Dice**: Server rolls a fair 6-sided die when the current player clicks “Roll the die.” Out-of-turn clicks are rejected.
- **Card squares**: Landing on a marked square draws a random card:
  - **Control card**: Move forward by the card’s delta (clamped to square 100).
  - **Misstep card**: Move back by the card’s delta unless you choose a matching mitigation card to burn. The UI prompts you to select a mitigation or accept the setback.
- **Mitigation hand**: Each player is dealt 3 mitigation cards from a shared deck on join/reset (no duplicates per game). Cards are single-use; once burned, they move to the discard pile (visible to all).
- **Threat intel share**: When you share a square with another player, an automatic “share intel” roll happens. On 4–6, you draw one mitigation from the remaining deck (if any). Only one attempt per square per player; not triggered while a misstep choice is pending.
- **Win condition**: First player to reach square 100 wins. Further rolls are blocked until a reset.
- **Reset**: Any player can reset; positions go back to Start Here, mitigation hands are re-dealt, and turn order is preserved.
- **Player limit**: Up to 6 simultaneous players per room. Extra joins get a toast indicating the room is full.

## Customising for incident response
- **Card positions & text**: Card draw squares are randomized each game/reset (currently 25 draws) and always include the last square. If you roll past the final square, you win; if you land exactly on it, you still draw a card. Edit `data/cards.md` to change how many draws exist, and to add/remove controls, missteps, mitigations, or retag them.
- **Visuals**: Update colors/tokens/background in `public/styles.css`.
- **Copy/UI hints**: Adjust sidebar tips and hero text in `public/index.html`.
- **Telemetry**: Extend `broadcast` in `server.js` to log rolls, time-to-win, or export activity elsewhere.

## Files of interest
- `server.js` — Express + Socket.IO server, room state, dice/turn enforcement, cards, and mitigation handling.
- `public/index.html` — Page layout, controls, mitigation hand panel, and guidance.
- `public/client.js` — Board rendering, token placement, card-square highlights, mitigation hand display, and live state updates.
- `public/styles.css` — Theme, layout, and board styling.

## Manual playtest (sanity)
1) Start the server: `npm start` (or `PORT=31337 npm start`).
2) Open two browser tabs to http://localhost:31337 with the same room code (e.g., `alpha`).
3) Join as two different names; note turn order matches join order. Pieces sit off-board until first rolls.
4) Roll in turn; draw squares are randomized each game. Landing on one pulls a random control (forward) or misstep (back). On misstep, pick a matching mitigation (if tags align) or take the setback; used mitigations hit the discard pile.
5) Move both players onto the same square and click “Share threat intel”; on a 4–6 you gain a mitigation (if the deck isn’t empty).
6) Continue until someone hits square 100; winner banner appears and rolls lock until a reset.
7) Click “Reset board” in either tab; positions zero out, fresh mitigation hands are dealt from a new deck, and turn order persists.

If anything looks off, check server logs and tweak `server.js`/`public/client.js` as needed.
