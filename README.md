# MOVE! Show-up score playground

MOVE! is an app for meeting new people in Barcelona the same day: *Show up. Meet up.*
After every plan, both people rate each other, and the app knows whether each person actually came.

This playground answers one question: **how should MOVE turn that history into one number that tells a
stranger whether you will show up?** It compares three scoring approaches side by side on the same five
simulated users, so you can watch the ranking change and see why.

## How to run

ES modules don't load from `file://`, so start a small local server in this folder:

```bash
python3 -m http.server
```

Then open http://localhost:8000. (On Windows, use `python` instead of `python3`.)

Run the tests with Node:

```bash
node tests.js
```

## The three approaches

| | Formula | Fixes | Still broken |
|---|---|---|---|
| **A. Simple average** | mean of ratings received | nothing, it's the baseline | one 5-star review beats forty 4.6 reviews; no-shows leave no rating, so they are invisible |
| **B. Bayesian average** | `(C × m + sum of ratings) / (C + n)`, `m = 3.5`, `C = 5` | new users start near 3.5 and must earn their score | still ignores no-shows, so the rating farmer looks great |
| **C. MOVE show-up score** | `100 × (0.7 × reliability + 0.3 × (B − 1) / 4)` | counts no-shows, recent behaviour matters more, new users start in the middle | the weights are a design choice (the sliders let you discuss them) |

### Inside score C

1. **Recency weight** per event: `w = 0.5 ^ (daysAgo / 30)`. An event 30 days ago counts half, 60 days a
   quarter, so someone who used to be flaky can recover.
2. **Attendance** per event: showed up = 1, late cancel (under 2 h before) = 0.5, no-show = 0.
3. **Reliability** = `(Σ w × attendance + a) / (Σ w + a + b)` with `a = 2`, `b = 1`. The `a` and `b` are
   pretend past events (a Beta prior), so a brand-new user starts at 2/3 rather than 0% or 100%, and an
   empty history never divides by zero.
4. **Rating part** = the Bayesian average from B, rescaled from 1-5 to 0-1: `(B − 1) / 4`.
5. **Score** = `100 × (0.7 × reliability + 0.3 × ratingPart)`, rounded. Showing up weighs more than being
   liked, because ratings can be farmed by friends and the product promise is showing up.
6. **Label**: 75+ *Trusted*, 50-74 *Building trust*, under 50 *Low show-up*.

Every constant is a named `const` at the top of `score.js`.

## The five personas

| Persona | Behaviour | A says | C says |
|---|---|---|---|
| Marta, Reliable regular | shows up 95%, rated ~4.5 | high | Trusted |
| Leo, Flaky | shows up 30%, rated ~4.0 | fairly high (4.0) | Low show-up |
| Sam, Brand new | 1 event, rated 5 | top (wrong) | Building trust |
| Nico, Rating farmer | friends always rate him 5, shows up 25% | top (wrong) | Low show-up |
| Ana, Reformed | shows up 20% in her first month, 95% since | high | Trusted, thanks to recency |

Histories are generated with a seeded random generator (mulberry32), so the same seed always produces the
same users. The default seed `16102341` was picked because every step of the demo shows clearly with it.
**New seed** moves to the next seed. Leo and Nico sit close to the 50 line, so on some seeds a run of recent
show-ups lifts one of them into *Building trust*. That is recency doing its job, and they still rank bottom
under C on almost every seed.

## Files

| File | What it does |
|---|---|
| `index.html` | page structure |
| `style.css` | MOVE styling: dark background, dark cards, lime accent |
| `score.js` | the three formulas as pure functions plus all constants; no DOM, so Node can test it |
| `sim.js` | seeded random generator and persona history generation |
| `app.js` | holds state, renders cards / ranking / Explain panel, handles sliders, buttons and the form |
| `tests.js` | 12 checks that the formulas behave as claimed |

## 2-minute demo script

1. **Approach A** (selected on load). Sam and Nico are tied at the top with 5.00. Sam has one review, Nico
   no-shows most plans. Ask the room: *would you meet Nico tonight?*
2. **Click B.** Sam drops to the bottom (3.75, tied with Leo): one review no longer wins. But Nico is now **first** (4.25),
   because B still can't see no-shows.
3. **Click C.** Nico falls to last (44, *Low show-up*), Leo is just above him (47). Marta (84) and Ana (80)
   lead. Ana no-showed a lot in her first month, but C forgives old behaviour. Drag **Half-life** to 120:
   old events count almost as much as new ones and Ana drops to 74, *Building trust*. Drag it back.
4. **Click Nico's card** and walk through the Explain panel: each event's weight, the weighted sum, adding the
   prior (+2 / +3), the rating part, and the final formula (`100 × (0.70 × 0.275 + 0.30 × 0.813) = 44`).
5. Optional: **Add event**, Marta, no-show. A and B don't move; C drops from 84 to 79.

## What I'd change next

- **Learn the weights from data** instead of choosing 0.7 / 0.3 and a 30-day half-life by hand: fit them to
  predict whether a user shows up to their *next* plan.
- **Weight ratings by who gave them.** Two friends can rate each other 5 forever; ratings from people you've
  met many times, or who always give 5 stars, should count less.
- **Make no-shows count more when the other person reports them**, and let users dispute a no-show.
- ID verification stops fake accounts, but not collusion between real accounts. That still needs work.
