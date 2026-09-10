# Screenshot review rubric

Run `npm run screenshot` and look at `screenshots/*.png`. Judge every state against two readers.

## Reader 1 — will not read, does not know or care what proportional representation is
Pass only if, within the first screen after the sliders, they can see without reading any paragraph:
- [ ] which columns are "today" and which are the alternatives (the STV tag and outlined "best" cards);
- [ ] a single number per column that is obviously a score, bigger = better (the mirror score + meter);
- [ ] a picture where the mismatch is visible as shape, not as text (council ring vs. thin voters ring);
- [ ] one bold sentence that states the conclusion for the current sliders (the verdict box).

## Reader 2 — hostile to STV, looking for the trick
Pass only if they can find, without leaving the page:
- [ ] the exact counting rules (quota, transfers, elimination, tie-breaks) and every count round;
- [ ] the modelling assumptions stated as limits, including the bloc-voting simplification and the fact that census counts are people, not ballots;
- [ ] cases where STV does *not* win, shown honestly (party at 80/20: today's fixed 5+2 rule scores higher than 3-seat districts; a 9% group wins nothing in any layout under bloc voting);
- [ ] the data sources with links and a reproducible build;
- [ ] a table twin of every chart.

## Findings from the 2026-09-10 pass (Chrome 152 headless, 1280px light/dark, 400px phone)
- Reader 1: pass on party (2023 at-large data: 80 vs 94), faction, race, gender, car access, renters; the verdict box carries the message. The 2024 presidential view lands on "today is already about right", which is true and explained.
- Reader 2: pass; round tables were noisy (36 rounds of zero-vote eliminations) → now batched and never-voted candidates hidden.
- Phone: no horizontal scroll; cards stack; charts scale.
