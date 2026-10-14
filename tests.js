// tests.js: checks that the formulas in score.js behave as the README claims.
// Run with: node tests.js   (exits with code 1 if any check fails)

import {
  simpleAverage, bayesianAverage, showUpScore, showUpBreakdown,
  recencyWeight, trustLabel, PRIOR_MEAN,
} from "./score.js";

let failures = 0;

// Prints PASS or FAIL for one check. We use this instead of console.assert
// because console.assert does not make node exit with an error code.
function check(description, condition) {
  console.log(`${condition ? "PASS" : "FAIL"}  ${description}`);
  if (!condition) failures += 1;
}

// Builds one event. daysAgo 0 means today.
function event(daysAgo, outcome, rating = null) {
  return {
    daysAgo,
    showedUp: outcome === "showed",
    cancelledLate: outcome === "late",
    rating: outcome === "showed" ? rating : null,
  };
}

// A long, solid history: 40 show-ups over 80 days, all rated 4.6.
const veteran = Array.from({ length: 40 }, (_, i) => event(i * 2, "showed", 4.6));
// A brand-new user: one show-up today, rated 5.
const newcomer = [event(0, "showed", 5)];

// 1. With no history, B returns the prior and C starts in the middle.
const empty = showUpBreakdown([]);
check("empty history: B equals the prior mean 3.5", bayesianAverage([]) === PRIOR_MEAN);
check("empty history: reliability is the prior 2/3", Math.abs(empty.reliability - 2 / 3) < 1e-9);
check("empty history: C is 65 (Building trust)", empty.score === 65 && empty.label === "Building trust");

// 2. The problem with A: one 5-star review beats forty 4.6 reviews.
check("A: one 5-star review beats a long 4.6 history (the flaw)", simpleAverage(newcomer) > simpleAverage(veteran));

// 3. B and C fix that.
check("B: one 5-star review does NOT beat a long 4.6 history", bayesianAverage(newcomer) < bayesianAverage(veteran));
check("C: one 5-star review does NOT beat a long 4.6 history", showUpScore(newcomer) < showUpScore(veteran));

// 4. A no-show is invisible to A but lowers C.
const withNoShow = [...veteran, event(1, "noshow")];
check("A: a no-show does not change the simple average", simpleAverage(withNoShow) === simpleAverage(veteran));
check("C: a no-show lowers the show-up score", showUpScore(withNoShow) < showUpScore(veteran));

// 5. A late cancel counts as half a show, so it sits between the two.
const withLate = [...veteran, event(1, "late")];
check("C: late cancel scores between show-up and no-show",
  showUpBreakdown(withNoShow).reliability < showUpBreakdown(withLate).reliability &&
  showUpBreakdown(withLate).reliability < showUpBreakdown(veteran).reliability);

// 6. Recency: an old no-show hurts less than a recent one.
const shows = Array.from({ length: 10 }, (_, i) => event(i * 5, "showed", 4));
const oldNoShow = [...shows, event(90, "noshow")];
const recentNoShow = [...shows, event(0, "noshow")];
check("C: a no-show 90 days ago hurts less than one today", showUpScore(oldNoShow) > showUpScore(recentNoShow));
check("recency weight is 1 today and 0.5 after one half-life", recencyWeight(0) === 1 && recencyWeight(30) === 0.5);

// 7. Labels switch exactly at the thresholds.
check("labels: 75 Trusted, 74 and 50 Building trust, 49 Low show-up",
  trustLabel(75) === "Trusted" && trustLabel(74) === "Building trust" &&
  trustLabel(50) === "Building trust" && trustLabel(49) === "Low show-up");

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
if (failures > 0) process.exitCode = 1;
