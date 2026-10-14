// sim.js: makes the five simulated MOVE users and their event histories.
// Uses a seeded random generator so the same seed always gives the same users:
// the demo is repeatable and nothing changes between rehearsal and demo day.

// The first seed after 16102026 (demo day) where every step of the demo shows
// clearly: Sam and Nico top under A, Nico first under B, Nico last under C.
export const DEFAULT_SEED = 16102341;
const HISTORY_DAYS = 90;              // events are spread over the last 90 days

// mulberry32: a tiny seeded pseudo-random generator. Math.random() cannot be
// seeded, so it would give different users on every page load. Returns a
// function that gives a new number between 0 and 1 each time it is called.
export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The five test users. showChance is a function of event age so Ana can
// behave differently in her first month than now.
// lateCancelShare: when someone doesn't show, how often it is a late cancel
// rather than a silent no-show.
export const PERSONAS = [
  {
    id: "marta", name: "Marta", tagline: "Reliable regular",
    eventCount: 20, historyDays: HISTORY_DAYS,
    showChance: () => 0.95, lateCancelShare: 0.5, ratingCenter: 4.5, ratingSpread: 1,
  },
  {
    id: "leo", name: "Leo", tagline: "Flaky",
    eventCount: 20, historyDays: HISTORY_DAYS,
    showChance: () => 0.3, lateCancelShare: 0.3, ratingCenter: 4.0, ratingSpread: 1,
  },
  {
    id: "sam", name: "Sam", tagline: "Brand new",
    eventCount: 1, historyDays: 7,
    showChance: () => 1, lateCancelShare: 0, ratingCenter: 5, ratingSpread: 0,
  },
  {
    // Nico's friends always leave 5 stars, but he skips most plans with strangers.
    id: "nico", name: "Nico", tagline: "Rating farmer",
    eventCount: 20, historyDays: HISTORY_DAYS,
    showChance: () => 0.25, lateCancelShare: 0, ratingCenter: 5, ratingSpread: 0,
  },
  {
    // Flaky in her first month (more than 60 days ago), reliable since.
    id: "ana", name: "Ana", tagline: "Reformed",
    eventCount: 20, historyDays: HISTORY_DAYS,
    showChance: (daysAgo) => (daysAgo > 60 ? 0.2 : 0.95), lateCancelShare: 0.3, ratingCenter: 4.5, ratingSpread: 1,
  },
];

// Picks a whole-star rating (1-5) around the persona's typical rating.
function randomRating(persona, random) {
  const raw = persona.ratingCenter + (random() - 0.5) * 2 * persona.ratingSpread;
  return Math.min(5, Math.max(1, Math.round(raw)));
}

// Makes one event for a persona: when it happened and whether they showed up.
// rating is null unless they showed, because nobody can rate someone who didn't come.
function randomEvent(persona, random) {
  const daysAgo = Math.floor(random() * persona.historyDays);
  const showedUp = random() < persona.showChance(daysAgo);
  const cancelledLate = !showedUp && random() < persona.lateCancelShare;
  const rating = showedUp ? randomRating(persona, random) : null;
  return { daysAgo, showedUp, cancelledLate, rating };
}

// Builds every persona's history from one seed. Events are sorted oldest
// first so the timeline dots read left to right like a calendar.
export function generateUsers(seed = DEFAULT_SEED) {
  const random = mulberry32(seed);
  return PERSONAS.map((persona) => {
    const events = Array.from({ length: persona.eventCount }, () => randomEvent(persona, random));
    events.sort((x, y) => y.daysAgo - x.daysAgo);
    return { id: persona.id, name: persona.name, tagline: persona.tagline, events };
  });
}
