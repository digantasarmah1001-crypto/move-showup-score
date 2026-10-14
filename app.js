// app.js: holds the playground state and draws it on the page.
// All the maths lives in score.js; this file only reads state, calls the
// scoring functions and turns the results into HTML.

import { generateUsers, DEFAULT_SEED } from "./sim.js";
import {
  simpleAverage, bayesianAverage, showUpBreakdown, ratingsOf, DEFAULT_SETTINGS,
  PRIOR_MEAN, PRIOR_SHOWS, PRIOR_NO_SHOWS, TRUSTED_MIN, BUILDING_MIN,
} from "./score.js";

const APPROACHES = ["A", "B", "C"];
const APPROACH_NAMES = { A: "Average rating", B: "Bayesian rating", C: "Show-up score" };
const LABEL_CLASSES = { "Trusted": "trusted", "Building trust": "building", "Low show-up": "low" };
const OUTCOME_NAMES = { showed: "showed up", late: "late cancel", noshow: "no-show" };

// Everything that can change on the page lives in this one object.
// Every user action updates it, then render() redraws the page from it.
const state = {
  seed: DEFAULT_SEED,
  users: generateUsers(DEFAULT_SEED),
  settings: { ...DEFAULT_SETTINGS }, // a copy, so moving a slider never changes the defaults
  approach: "A",
  previousApproach: null,            // used to draw the ▲▼ rank-change arrows
  selectedId: "nico",
};

// Calculates all three scores for one user with the current slider settings.
function scoresFor(user) {
  return {
    A: simpleAverage(user.events),
    B: bayesianAverage(user.events, state.settings.priorConfidence),
    C: showUpBreakdown(user.events, state.settings),
  };
}

// The number we sort by for an approach. A user with no ratings has no A
// score (null), so they go to the bottom instead of breaking the sort.
function sortValue(scores, approach) {
  if (approach === "C") return scores.C.score;
  return scores[approach] ?? -Infinity;
}

// Shows a score as text: A and B are 1-5 ratings, C is a whole number 0-100.
function formatScore(scores, approach) {
  if (approach === "C") return String(scores.C.score);
  return scores[approach] === null ? "–" : scores[approach].toFixed(2);
}

// Returns users with their scores, best first under the given approach.
function rankedUsers(approach) {
  return state.users
    .map((user) => ({ user, scores: scoresFor(user) }))
    .sort((x, y) => sortValue(y.scores, approach) - sortValue(x.scores, approach));
}

// Maps each user id to its position (0 = first) under an approach.
function positionsBy(approach) {
  return Object.fromEntries(rankedUsers(approach).map(({ user }, position) => [user.id, position]));
}

// The user whose score the right-hand panel is explaining.
function selectedUser() {
  return state.users.find((u) => u.id === state.selectedId);
}

// "1 plan", "2 plans": keeps the sentences on the page grammatical.
function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

// Describes what happened at one event.
function outcomeOf(event) {
  if (event.showedUp) return "showed";
  if (event.cancelledLate) return "late";
  return "noshow";
}

// Counts how many events ended in each outcome.
function countOutcomes(events) {
  const counts = { showed: 0, late: 0, noshow: 0 };
  events.forEach((e) => { counts[outcomeOf(e)] += 1; });
  return counts;
}

// One dot per event, oldest first. Screen readers get one summary sentence
// instead of twenty separate dots.
function timelineHtml(events) {
  const c = countOutcomes(events);
  const summary = `${plural(events.length, "plan")}: ${c.showed} showed up, ${plural(c.late, "late cancel")}, ${plural(c.noshow, "no-show")}`;
  const dots = events.map((e) =>
    `<span class="dot ${outcomeOf(e)}" title="${e.daysAgo} days ago: ${OUTCOME_NAMES[outcomeOf(e)]}"></span>`).join("");
  return `<span class="timeline" role="img" aria-label="${summary}">${dots}</span>`;
}

// The ▲2 / ▼3 next to a rank, showing how far someone moved since the last approach.
function rankChangeHtml(previousPositions, userId, position) {
  if (!previousPositions) return "";
  const change = previousPositions[userId] - position;
  if (change === 0) return "";
  const direction = change > 0 ? "up" : "down";
  return `<span class="move ${direction}"><span aria-hidden="true">${change > 0 ? "▲" : "▼"}${Math.abs(change)}</span>` +
    `<span class="sr-only">${direction} ${plural(Math.abs(change), "place")}</span></span>`;
}

// Draws the ranking table, ordered by the selected approach so the order
// visibly changes when you switch from A to B to C.
function renderRanking() {
  const previous = state.previousApproach ? positionsBy(state.previousApproach) : null;

  document.getElementById("ranking-body").innerHTML = rankedUsers(state.approach).map(({ user, scores }, position) => `
    <tr class="${user.id === state.selectedId ? "selected" : ""}">
      <td class="rank">${position + 1}${rankChangeHtml(previous, user.id, position)}</td>
      <th scope="row">
        <button type="button" class="person" data-id="${user.id}" aria-pressed="${user.id === state.selectedId}">
          <span class="avatar" aria-hidden="true">${user.name[0]}</span>
          <span><strong>${user.name}</strong><small>${user.tagline}</small></span>
        </button>
      </th>
      <td>${timelineHtml(user.events)}</td>
      ${APPROACHES.map((a) => `<td class="num ${a === state.approach ? "active" : ""}">${formatScore(scores, a)}</td>`).join("")}
      <td><span class="badge ${LABEL_CLASSES[scores.C.label]}">${scores.C.label}</span></td>
    </tr>`).join("");

  document.querySelectorAll("[data-column]").forEach((th) => {
    th.classList.toggle("active", th.dataset.column === state.approach);
  });
  const since = state.previousApproach ? ` · arrows show the change since ${state.previousApproach}` : "";
  document.getElementById("board-eyebrow").textContent = `Ranked by ${state.approach} · ${APPROACH_NAMES[state.approach]}${since}`;
}

// A horizontal bar, used to show a number as a length. Hidden from screen
// readers because the sentence next to it already says the number.
function barHtml(fraction, extraClass = "") {
  return `<div class="bar" aria-hidden="true"><span class="fill ${extraClass}" style="width:${100 * fraction}%"></span></div>`;
}

// The final score as one bar split into its two parts, with marks at the
// label thresholds so you can see how close someone is to the next label.
function scoreBarHtml(showPoints, ratePoints) {
  return `
    <div class="bar score" aria-hidden="true">
      <span class="fill" style="width:${showPoints}%"></span>
      <span class="fill rating" style="width:${ratePoints}%"></span>
      <span class="tick" style="left:${BUILDING_MIN}%"></span>
      <span class="tick" style="left:${TRUSTED_MIN}%"></span>
    </div>
    <div class="tick-labels" aria-hidden="true">
      <span style="left:${BUILDING_MIN}%">${BUILDING_MIN}</span><span style="left:${TRUSTED_MIN}%">${TRUSTED_MIN}</span>
    </div>`;
}

// The plain-language part of the panel: score C for the selected user in
// three steps, using the numbers showUpBreakdown already calculated.
function renderHoodSummary(user, b) {
  const counts = countOutcomes(user.events);
  const ratings = ratingsOf(user.events);
  const showShare = state.settings.reliabilityWeight;
  const showPoints = 100 * showShare * b.reliability;
  const ratePoints = 100 * b.ratingWeight * b.ratingPart;
  const late = counts.late > 0 ? ` and ${plural(counts.late, "late cancel")}` : "";

  document.getElementById("hood-summary").innerHTML = `
    <div class="hood-head">
      <span class="avatar" aria-hidden="true">${user.name[0]}</span>
      <div><h2 id="hood-title">${user.name}</h2><p>${user.tagline}</p></div>
      <div class="big-score"><strong>${b.score}</strong><span class="badge ${LABEL_CLASSES[b.label]}">${b.label}</span></div>
    </div>
    <ol class="steps">
      <li>
        <h3>1 · Shows up <span>${Math.round(100 * b.reliability)}%</span></h3>
        ${barHtml(b.reliability)}
        <p>Came to ${counts.showed} of ${plural(user.events.length, "plan")}${late}. Recent plans count more,
          and everyone starts with ${PRIOR_SHOWS} pretend shows and ${PRIOR_NO_SHOWS} pretend no-show.</p>
      </li>
      <li>
        <h3>2 · Gets rated <span>${b.bayes.toFixed(2)}★</span></h3>
        ${barHtml(b.ratingPart, "rating")}
        <p>${plural(ratings.length, "real rating")} mixed with ${state.settings.priorConfidence} pretend
          ${PRIOR_MEAN}★ ones, so a few reviews can't swing it.</p>
      </li>
      <li>
        <h3>3 · Score <span>${b.score} / 100</span></h3>
        ${scoreBarHtml(showPoints, ratePoints)}
        <p>${Math.round(100 * showShare)}% showing up + ${Math.round(100 * b.ratingWeight)}% rating
          = ${showPoints.toFixed(1)} + ${ratePoints.toFixed(1)} = ${b.score}</p>
      </li>
    </ol>`;
}

// The "Show the exact maths" part: every event's weight and the real formulas.
function renderMaths(user, b) {
  const { halfLife, reliabilityWeight, priorConfidence } = state.settings;
  const ratings = ratingsOf(user.events);
  const ratingSum = ratings.reduce((total, r) => total + r, 0);
  const rows = b.rows.map((row, i) => `
    <tr><td>${OUTCOME_NAMES[outcomeOf(user.events[i])]}</td><td>${row.daysAgo}</td>
    <td>${row.weight.toFixed(3)}</td><td>${row.attendance}</td><td>${row.weighted.toFixed(3)}</td></tr>`).join("");

  document.getElementById("maths-body").innerHTML = `
    <p>Each plan's weight: w = 0.5 ^ (days ago / ${halfLife})</p>
    <div class="events"><table>
      <tr><th>Plan</th><th>Days ago</th><th>w</th><th>Attended</th><th>w × attended</th></tr>
      ${rows}
      <tr><th>Total</th><td></td><th>${b.totalWeight.toFixed(3)}</th><td></td><th>${b.weightedAttendance.toFixed(3)}</th></tr>
    </table></div>
    <p>Reliability</p>
    <p class="formula">(${b.weightedAttendance.toFixed(3)} + ${PRIOR_SHOWS}) / (${b.totalWeight.toFixed(3)} + ${PRIOR_SHOWS} + ${PRIOR_NO_SHOWS}) = ${b.reliability.toFixed(3)}</p>
    <p>Rating part</p>
    <p class="formula">(${priorConfidence} × ${PRIOR_MEAN} + ${ratingSum}) / (${priorConfidence} + ${ratings.length}) = ${b.bayes.toFixed(3)} → (${b.bayes.toFixed(3)} − 1) / 4 = ${b.ratingPart.toFixed(3)}</p>
    <p>Score</p>
    <p class="formula">100 × (${reliabilityWeight.toFixed(2)} × ${b.reliability.toFixed(3)} + ${b.ratingWeight.toFixed(2)} × ${b.ratingPart.toFixed(3)}) = ${b.score}</p>`;
}

// Draws the right-hand panel for the selected user.
function renderHood() {
  const user = selectedUser();
  const breakdown = showUpBreakdown(user.events, state.settings);
  renderHoodSummary(user, breakdown);
  renderMaths(user, breakdown);
  document.getElementById("log-name").textContent = user.name;
}

// Updates the approach cards, seed number and slider labels to match state.
function renderControls() {
  document.querySelectorAll("[data-approach]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.approach === state.approach));
  });
  document.getElementById("seed-value").textContent = state.seed;
  document.querySelectorAll("[data-setting]").forEach((slider) => {
    slider.value = state.settings[slider.dataset.setting];
    document.getElementById(`${slider.dataset.setting}-value`).textContent = slider.value;
  });
}

// Redraws the whole page from state. Five users is small enough that
// redrawing everything is simpler than tracking what changed.
function render() {
  renderControls();
  renderRanking();
  renderHood();
}

// Tells screen-reader users what changed, since they can't see the rows move.
function announceRanking() {
  const ranked = rankedUsers(state.approach);
  document.getElementById("announce").textContent =
    `Ranked by ${APPROACH_NAMES[state.approach]}. First ${ranked[0].user.name}, last ${ranked[ranked.length - 1].user.name}.`;
}

// Replaces all users with a fresh history from the given seed.
// Plans logged by hand are lost, because they belong to the old history.
function loadSeed(seed) {
  state.seed = seed;
  state.users = generateUsers(seed);
  render();
}

// Connects every button, slider and dropdown to state. Runs once at start-up.
function setUpEvents() {
  document.querySelectorAll("[data-approach]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.approach === state.approach) return;
      state.previousApproach = state.approach;
      state.approach = button.dataset.approach;
      render();
      announceRanking();
    });
  });

  // One listener on the table body instead of one per row, because the rows
  // are redrawn on every render and would lose their own listeners.
  document.getElementById("ranking-body").addEventListener("click", (e) => {
    const button = e.target.closest("[data-id]");
    if (!button) return;
    state.selectedId = button.dataset.id;
    render();
    // The old button was replaced by the redraw, so put keyboard focus back on the new one.
    document.querySelector(`[data-id="${state.selectedId}"]`).focus();
  });

  document.getElementById("new-seed").addEventListener("click", () => loadSeed(state.seed + 1));

  document.getElementById("reset").addEventListener("click", () => {
    state.settings = { ...DEFAULT_SETTINGS };
    state.approach = "A";
    state.previousApproach = null;
    state.selectedId = "nico";
    loadSeed(DEFAULT_SEED);
  });

  document.querySelectorAll("[data-setting]").forEach((slider) => {
    slider.addEventListener("input", () => {
      state.settings[slider.dataset.setting] = Number(slider.value);
      render();
    });
  });

  document.querySelectorAll("[data-outcome]").forEach((button) => {
    button.addEventListener("click", () => {
      const outcome = button.dataset.outcome;
      selectedUser().events.push({
        daysAgo: 0,
        showedUp: outcome === "showed",
        cancelledLate: outcome === "late",
        rating: outcome === "showed" ? Number(document.getElementById("log-rating").value) : null,
      });
      render();
    });
  });
}

setUpEvents();
render();
