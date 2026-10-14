// score.js: the three ways of scoring a MOVE user.
// Only pure functions live here (no DOM, no randomness), so tests.js can check
// them with node and app.js only has to display the results.

// ---- Approach B: Bayesian average ----
export const PRIOR_MEAN = 3.5;       // m: the rating we assume before seeing any reviews
export const PRIOR_CONFIDENCE = 5;   // C: how many pretend ratings of PRIOR_MEAN everyone starts with

// ---- Approach C: MOVE show-up score ----
export const HALF_LIFE_DAYS = 30;    // an event this many days old counts half as much
export const PRIOR_SHOWS = 2;        // a: pretend past show-ups (Beta prior)
export const PRIOR_NO_SHOWS = 1;     // b: pretend past no-shows, so a new user starts at 2/3
export const RELIABILITY_WEIGHT = 0.7; // share of the score from showing up; the rest comes from ratings

export const ATTENDANCE_SHOWED = 1;
export const ATTENDANCE_LATE_CANCEL = 0.5; // cancelled less than 2 hours before: half a show
export const ATTENDANCE_NO_SHOW = 0;

export const TRUSTED_MIN = 75;       // score >= 75 is "Trusted"
export const BUILDING_MIN = 50;      // score 50-74 is "Building trust", below is "Low show-up"

// The three values the sliders can change. Every scoring function takes a
// settings object so the UI can pass slider values without editing constants.
export const DEFAULT_SETTINGS = {
  halfLife: HALF_LIFE_DAYS,
  reliabilityWeight: RELIABILITY_WEIGHT,
  priorConfidence: PRIOR_CONFIDENCE,
};

// Adds up a list of numbers.
function sum(numbers) {
  return numbers.reduce((total, n) => total + n, 0);
}

// Returns only the ratings a user actually received. No-shows and late
// cancels have rating null, because nobody met them.
export function ratingsOf(events) {
  return events.filter((e) => e.rating !== null).map((e) => e.rating);
}

// Approach A: the plain mean of all ratings. Returns null when there are no
// ratings, because "no data" is not the same as a score of 0.
export function simpleAverage(events) {
  const ratings = ratingsOf(events);
  if (ratings.length === 0) return null;
  return sum(ratings) / ratings.length;
}

// Approach B: start everyone with C pretend ratings of m, then add the real
// ones. One 5-star review barely moves you; forty of them move you a lot.
export function bayesianAverage(events, priorConfidence = PRIOR_CONFIDENCE) {
  const ratings = ratingsOf(events);
  return (priorConfidence * PRIOR_MEAN + sum(ratings)) / (priorConfidence + ratings.length);
}

// How much an event counts based on its age: 1 today, 0.5 after one half-life,
// 0.25 after two. Exponential decay never goes negative and needs one parameter.
export function recencyWeight(daysAgo, halfLife = HALF_LIFE_DAYS) {
  return 0.5 ** (daysAgo / halfLife);
}

// Turns one event into a number between 0 and 1: did the person show up?
export function attendanceValue(event) {
  if (event.showedUp) return ATTENDANCE_SHOWED;
  if (event.cancelledLate) return ATTENDANCE_LATE_CANCEL;
  return ATTENDANCE_NO_SHOW;
}

// Turns a 0-100 score into the label shown to other users.
export function trustLabel(score) {
  if (score >= TRUSTED_MIN) return "Trusted";
  if (score >= BUILDING_MIN) return "Building trust";
  return "Low show-up";
}

// Approach C, returning every intermediate number (not just the score) so the
// under-the-hood panel can show the calculation step by step from the same code.
export function showUpBreakdown(events, settings = DEFAULT_SETTINGS) {
  const rows = events.map((event) => {
    const weight = recencyWeight(event.daysAgo, settings.halfLife);
    const attendance = attendanceValue(event);
    return { daysAgo: event.daysAgo, weight, attendance, weighted: weight * attendance };
  });

  const weightedAttendance = sum(rows.map((r) => r.weighted));
  const totalWeight = sum(rows.map((r) => r.weight));
  const reliability = (weightedAttendance + PRIOR_SHOWS) / (totalWeight + PRIOR_SHOWS + PRIOR_NO_SHOWS);

  const bayes = bayesianAverage(events, settings.priorConfidence);
  const ratingPart = (bayes - 1) / 4; // rescales a 1-5 rating to 0-1

  const ratingWeight = 1 - settings.reliabilityWeight;
  const score = Math.round(100 * (settings.reliabilityWeight * reliability + ratingWeight * ratingPart));

  return { rows, weightedAttendance, totalWeight, reliability, bayes, ratingPart, ratingWeight, score, label: trustLabel(score) };
}

// Approach C when only the final number is needed.
export function showUpScore(events, settings = DEFAULT_SETTINGS) {
  return showUpBreakdown(events, settings).score;
}
