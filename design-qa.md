# Lobby design QA

- Source visual truth: `/tmp/codex-clipboard-32b9c886-c003-4e4a-82a7-586021fc1606.png`
- Implementation screenshot: `tmp/lobby-verification/osuguessr-lobby-implementation.png`
- Side-by-side evidence: `tmp/lobby-verification/lobby-compare.png`
- Viewport: 1051 x 626 CSS px, device scale factor 1
- Source pixels: 1051 x 626
- Implementation pixels: 1051 x 626
- State: dark theme, private host lobby, 4/8 players, all guests ready, join event visible in chat
- Interactions checked: Room settings dialog opens, Change setup dialog opens, Start game enabled
- Console errors: none

## Comparison

The implementation now follows the source hierarchy: compact room header, horizontal player strip, open chat timeline with system join rows, and a separated next-match rail with readiness and leave controls. Typography, spacing rhythm, dark tokens, control sizing, and copy are consistent with the source. The QA fixture uses default avatars while the source uses illustrative avatars; production renders each player's real avatar, so this is expected data variance rather than a layout mismatch.

The native-size full-view comparison is readable enough to evaluate the important typography, spacing, colors, controls, and chat content, so a separate focused crop was not needed.

## Iteration history

- Initial P1: join activity appeared outside the chat timeline. Fixed by persisting join events as multiplayer messages and rendering them as system rows in chat.
- Initial P1: section labels and larger player blocks made the gathering area heavier than the source. Fixed by removing the Players/Lobby chat headings and using the compact horizontal player strip.
- Initial P2: room actions and leave control did not match the source hierarchy. Fixed by grouping invite/settings in the header with a divider and moving Leave lobby into the lower right rail.
- Initial P2: host readiness copy showed guest-only counts. Fixed by presenting the host as implicitly ready in the UI while preserving the existing backend readiness rule.
- Post-fix evidence: `tmp/lobby-verification/osuguessr-lobby-implementation.png` at the same 1051 x 626 state, with `tmp/lobby-verification/lobby-compare.png` as the side-by-side comparison.

final result: passed
