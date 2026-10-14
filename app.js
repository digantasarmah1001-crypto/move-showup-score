// app.js: holds the playground state and draws it on the page.
// All the maths lives in score.js; this file only reads state, calls the
// scoring functions and turns the results into HTML.

import { generateUsers, DEFAULT_SEED } from "./sim.js";
import {
  simpleAverage, bayesianAverage, showUpBreakdown, ratingsOf,
  DEFAULT_SETTINGS, PRIOR_MEAN, PRIOR_SHOWS, PRIOR_NO_SHOWS,
} from "./score.js";

const APPROACH_NAMES = { A: "Simple average", B: "Bayesian average", C: "Show-up score" };
const LABEL_CLASSES = { "Trusted": "trusted", "Building trust": "building", "Low show-up": "low" };
const OUTCOME_NAMES = { showed: "showed", late: "late cancel", noshow: "no-show" };

// Everything that can change on the page lives in this one object.
// Every user action updates it, then render() redraws the page from it.
const state = {
  seed: DEFAULT_SEED,
  users: generateUsers(DEFAULT_SEED),
  settings: { ...DEFAULT_SETTINGS }, // a copy, so moving a slider never changes the defaults
  approach: "A",
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

// Describes what happened at one event, used both for event types and tooltips.
function outcomeOf(event) {
  if (event.showedUp) return "showed";
  if (event.cancelledLate) return "late";
  return "noshow";
}

// One dot per event, oldest on the left. The tooltip gives the details.
function timelineHtml(events) {
  return events.map((e) => {
    const outcome = outcomeOf(e);
    const rating = e.rating === null ? "" : `, rated ${e.rating}★`;
    return `<span class="dot ${outcome}" title="${e.daysAgo} days ago: ${OUTCOME_NAMES[outcome]}${rating}"></span>`;
  }).join("");
}

// Draws the five persona cards, ordered by the selected approach so the
// order visibly changes when you switch from A to B to C.
function renderCards() {
  document.getElementById("cards").innerHTML = rankedUsers(state.approach).map(({ user, scores }) => `
    <article class="card persona ${user.id === state.selectedId ? "selected" : ""}" data-id="${user.id}">
      <h3>${user.name}</h3>
      <p class="tagline">${user.tagline} · ${user.events.length} event${user.events.length === 1 ? "" : "s"}</p>
      <div class="timeline">${timelineHtml(user.events)}</div>
      <div class="scores">
        ${["A", "B", "C"].map((a) => `
          <div class="score ${a === state.approach ? "active" : ""}">
            <small>${a}</small><strong>${formatScore(scores, a)}</strong>
          </div>`).join("")}
      </div>
      <span class="badge ${LABEL_CLASSES[scores.C.label]}">${scores.C.label}</span>
    </article>`).join("");
}

// Draws the ranking table: position 1-5 under each approach side by side.
function renderRanking() {
  const columns = ["A", "B", "C"].map((a) => rankedUsers(a));
  const header = `<tr><th>#</th>${["A", "B", "C"].map((a) =>
    `<th class="${a === state.approach ? "active" : ""}" title="${APPROACH_NAMES[a]}">${a}</th>`).join("")}</tr>`;
  const rows = state.users.map((_, position) => `
    <tr><td>${position + 1}</td>${columns.map((column, i) => {
      const { user, scores } = column[position];
      const approach = ["A", "B", "C"][i];
      return `<td class="${approach === state.approach ? "active" : ""}">${user.name} ${formatScore(scores, approach)}</td>`;
    }).join("")}</tr>`).join("");
  document.getElementById("ranking").innerHTML = header + rows;
}

// Draws the Explain panel: score C for the selected user, step by step, using
// the intermediate numbers that showUpBreakdown already calculated.
function renderExplain() {
  const user = state.users.find((u) => u.id === state.selectedId);
  const b = showUpBreakdown(user.events, state.settings);
  const { halfLife, reliabilityWeight, priorConfidence } = state.settings;
  const ratings = ratingsOf(user.events);
  const ratingSum = ratings.reduce((total, r) => total + r, 0);

  const eventRows = b.rows.map((row, i) => `
    <tr><td>${OUTCOME_NAMES[outcomeOf(user.events[i])]}</td><td>${row.daysAgo}</td>
    <td>${row.weight.toFixed(3)}</td><td>${row.attendance}</td><td>${row.weighted.toFixed(3)}</td></tr>`).join("");

  document.getElementById("explain").innerHTML = `
    <h2>Explain: score C for <span>${user.name}</span></h2>

    <p class="step">1 · Weight each event by its age: w = 0.5 ^ (days ago / ${halfLife})</p>
    <div class="events"><table>
      <tr><th>Event</th><th>Days ago</th><th>Weight w</th><th>Attendance</th><th>w × attendance</th></tr>
      ${eventRows}
      <tr class="total"><td>Total</td><td></td><td>${b.totalWeight.toFixed(3)}</td><td></td><td>${b.weightedAttendance.toFixed(3)}</td></tr>
    </table></div>

    <p class="step">2 · Reliability, with ${PRIOR_SHOWS} pretend shows and ${PRIOR_NO_SHOWS} pretend no-show added</p>
    <p class="formula">(${b.weightedAttendance.toFixed(3)} + ${PRIOR_SHOWS}) / (${b.totalWeight.toFixed(3)} + ${PRIOR_SHOWS} + ${PRIOR_NO_SHOWS}) = ${b.reliability.toFixed(3)}</p>

    <p class="step">3 · Rating part: Bayesian average (approach B), rescaled from 1-5 to 0-1</p>
    <p class="formula">(${priorConfidence} × ${PRIOR_MEAN} + ${ratingSum}) / (${priorConfidence} + ${ratings.length}) = ${b.bayes.toFixed(3)}
      → (${b.bayes.toFixed(3)} − 1) / 4 = ${b.ratingPart.toFixed(3)}</p>

    <p class="step">4 · Final score</p>
    <p class="formula">100 × (${reliabilityWeight.toFixed(2)} × ${b.reliability.toFixed(3)} + ${b.ratingWeight.toFixed(2)} × ${b.ratingPart.toFixed(3)}) = ${b.score} → ${b.label}</p>`;
}

// Updates the approach buttons, seed number and slider labels to match state.
function renderControls() {
  document.querySelectorAll("[data-approach]").forEach((button) => {
    button.classList.toggle("active", button.dataset.approach === state.approach);
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
  renderCards();
  renderRanking();
  renderExplain();
}

// Replaces all users with a fresh history from the given seed.
// Events added by hand are lost, because they belong to the old history.
function loadSeed(seed) {
  state.seed = seed;
  state.users = generateUsers(seed);
  render();
}

// Connects buttons, sliders and the form to state. Runs once at start-up.
function setUpEvents() {
  document.getElementById("approach-buttons").addEventListener("click", (e) => {
    if (!e.target.dataset.approach) return;
    state.approach = e.target.dataset.approach;
    render();
  });

  // One listener on the container instead of one per card, because the cards
  // are redrawn on every render and would lose their own listeners.
  document.getElementById("cards").addEventListener("click", (e) => {
    const card = e.target.closest("[data-id]");
    if (!card) return;
    state.selectedId = card.dataset.id;
    render();
  });

  document.getElementById("new-seed").addEventListener("click", () => loadSeed(state.seed + 1));

  document.getElementById("reset").addEventListener("click", () => {
    state.settings = { ...DEFAULT_SETTINGS };
    state.approach = "A";
    loadSeed(DEFAULT_SEED);
  });

  document.querySelectorAll("[data-setting]").forEach((slider) => {
    slider.addEventListener("input", () => {
      state.settings[slider.dataset.setting] = Number(slider.value);
      render();
    });
  });

  // Only someone who showed up can be rated, so the rating box is disabled otherwise.
  const outcomeSelect = document.getElementById("add-outcome");
  const ratingSelect = document.getElementById("add-rating");
  outcomeSelect.addEventListener("change", () => {
    ratingSelect.disabled = outcomeSelect.value !== "showed";
  });

  document.getElementById("add-event").addEventListener("submit", (e) => {
    e.preventDefault(); // stop the browser reloading the page, which would lose all state
    const user = state.users.find((u) => u.id === document.getElementById("add-user").value);
    const outcome = outcomeSelect.value;
    user.events.push({
      daysAgo: 0,
      showedUp: outcome === "showed",
      cancelledLate: outcome === "late",
      rating: outcome === "showed" ? Number(ratingSelect.value) : null,
    });
    state.selectedId = user.id; // open the Explain panel on the user that just changed
    render();
  });
}

// Fills the "User" dropdown once; the five personas never change.
function fillUserSelect() {
  document.getElementById("add-user").innerHTML = state.users
    .map((u) => `<option value="${u.id}">${u.name}</option>`).join("");
}

fillUserSelect();
setUpEvents();
render();
