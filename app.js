// app.js: holds the playground state and draws it on the page.
// All the maths lives in score.js; this file only reads state, calls the
// scoring functions and turns the results into HTML.

import { generateUsers, DEFAULT_SEED, HISTORY_DAYS } from "./sim.js";
import {
  simpleAverage, bayesianAverage, showUpBreakdown, ratingsOf, recencyWeight,
  DEFAULT_SETTINGS, PRIOR_MEAN, PRIOR_SHOWS, PRIOR_NO_SHOWS,
} from "./score.js";

const APPROACH_NAMES = { A: "Average rating", B: "Bayesian rating", C: "Show-up score" };
const LABEL_CLASSES = { "Trusted": "trusted", "Building trust": "building", "Low show-up": "low" };
const OUTCOME_NAMES = { showed: "showed up", late: "late cancel", noshow: "no-show" };
const KEY_TO_APPROACH = { 1: "A", 2: "B", 3: "C" };

const GHOST_OPACITY = 0.12;  // plans that A and B never see
const OLDEST_OPACITY = 0.25; // under C, even the oldest plan stays faintly visible

// How each slider's value is written next to its label.
const SETTING_FORMATS = {
  halfLife: (v) => `${v} days`,
  reliabilityWeight: (v) => `${Math.round(v * 100)}%`,
  priorConfidence: (v) => String(v),
};

// Size of the weight chart, in the SVG's own units (see the viewBox in index.html).
const CHART = { left: 8, right: 392, base: 118, height: 100 };

// Everything that can change on the page lives in this one object.
// Every user action updates it, then render() redraws the page from it.
const state = {
  seed: DEFAULT_SEED,
  users: generateUsers(DEFAULT_SEED),
  settings: { ...DEFAULT_SETTINGS }, // a copy, so moving a slider never changes the defaults
  approach: "A",
  selectedId: "nico",
};

const app = document.getElementById("app");
const board = document.getElementById("board");
const cover = document.getElementById("cover");

// ---------- Reading scores ----------

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

// Returns users with their scores, best first under the given approach.
function rankedUsers(approach) {
  return state.users
    .map((user) => ({ user, scores: scoresFor(user) }))
    .sort((x, y) => sortValue(y.scores, approach) - sortValue(x.scores, approach));
}

// The user whose score the right-hand panel is showing.
function selectedUser() {
  return state.users.find((u) => u.id === state.selectedId);
}

// The score as text: A and B are 1-5 ratings, C is a whole number 0-100.
function formatValue(scores, approach) {
  if (approach === "C") return String(scores.C.score);
  return scores[approach] === null ? "–" : scores[approach].toFixed(2);
}

// How full the score bar is, from 0 to 1. Ratings start at 1, so 1★ is an empty bar.
function meterFraction(scores, approach) {
  if (approach === "C") return scores.C.score / 100;
  return scores[approach] === null ? 0 : (scores[approach] - 1) / 4;
}

// ---------- Small helpers ----------

// "1 plan", "2 plans": keeps sentences grammatical.
function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

// 0.275 → "28%".
function percent(fraction) {
  return `${Math.round(100 * fraction)}%`;
}

// Describes what happened at one plan.
function outcomeOf(event) {
  if (event.showedUp) return "showed";
  if (event.cancelledLate) return "late";
  return "noshow";
}

// Counts how many plans ended in each outcome.
function countOutcomes(events) {
  const counts = { showed: 0, late: 0, noshow: 0 };
  events.forEach((e) => { counts[outcomeOf(e)] += 1; });
  return counts;
}

// Where a plan sits on the 90-day line: 0% is 90 days ago, 100% is today.
function timelinePosition(daysAgo) {
  return 100 * (1 - daysAgo / HISTORY_DAYS);
}

// How visible a plan's dot is. A and B only use ratings, so plans with no
// rating (no-shows, late cancels) almost disappear: those formulas never see
// them. Under C every plan counts, and older plans fade as their weight drops.
function dotOpacity(event) {
  if (state.approach !== "C") return event.rating === null ? GHOST_OPACITY : 1;
  const weight = recencyWeight(event.daysAgo, state.settings.halfLife);
  return OLDEST_OPACITY + (1 - OLDEST_OPACITY) * weight;
}

// ---------- The ranking board ----------

// Builds one row of the board. Rows are made once and afterwards only moved
// and updated, so the browser can animate them sliding to a new rank.
function createRow(user) {
  const row = document.createElement("li");
  row.className = "row";
  row.dataset.row = user.id;
  row.innerHTML = `
    <span class="rank"></span>
    <button type="button" class="who" data-id="${user.id}">
      <span class="avatar" aria-hidden="true">${user.name[0]}</span>
      <span><strong>${user.name}</strong><small>${user.tagline}</small></span>
    </button>
    <span class="timeline" role="img"></span>
    <span class="meter" aria-hidden="true"><span class="fill"></span><span class="tick t50"></span><span class="tick t75"></span></span>
    <span class="value"></span>
    <span class="badge"></span>`;
  return row;
}

// Puts one dot per plan on a row's 90-day line. Runs again whenever that
// user's plans change. Screen readers get one summary sentence instead.
function drawTimeline(row, user) {
  const c = countOutcomes(user.events);
  const timeline = row.querySelector(".timeline");
  timeline.setAttribute("aria-label",
    `${plural(user.events.length, "plan")}: ${c.showed} showed up, ${plural(c.late, "late cancel")}, ${plural(c.noshow, "no-show")}`);
  timeline.innerHTML = user.events.map((e) =>
    `<span class="dot ${outcomeOf(e)}" style="left:${timelinePosition(e.daysAgo)}%"></span>`).join("");
}

// Creates every row from scratch: at start-up and when the users change.
function buildBoard() {
  board.replaceChildren(...state.users.map((user) => {
    const row = createRow(user);
    drawTimeline(row, user);
    return row;
  }));
  board.style.setProperty("--count", state.users.length);
}

// Moves every row to its rank under the selected approach and updates its
// numbers. CSS turns each change of --rank into a sliding animation.
function renderBoard() {
  rankedUsers(state.approach).forEach(({ user, scores }, position) => {
    const row = board.querySelector(`[data-row="${user.id}"]`);
    const selected = user.id === state.selectedId;
    row.style.setProperty("--rank", position);
    row.classList.toggle("selected", selected);
    row.querySelector(".who").setAttribute("aria-pressed", String(selected));
    row.querySelector(".rank").textContent = position + 1;
    row.querySelector(".fill").style.width = `${100 * meterFraction(scores, state.approach)}%`;
    row.querySelector(".value").textContent = formatValue(scores, state.approach);
    const badge = row.querySelector(".badge");
    badge.textContent = scores.C.label;
    badge.className = `badge ${LABEL_CLASSES[scores.C.label]}`;
    row.querySelectorAll(".dot").forEach((dot, i) => { dot.style.opacity = dotOpacity(user.events[i]); });
  });
}

// ---------- Header and controls ----------

// The one-line formula next to the heading, for the selected approach.
function formulaText() {
  const { priorConfidence, reliabilityWeight, halfLife } = state.settings;
  if (state.approach === "A") return "average of all ratings";
  if (state.approach === "B") return `(${priorConfidence} × ${PRIOR_MEAN}★ + ratings) ÷ (${priorConfidence} + count)`;
  return `${percent(reliabilityWeight)} showing up + ${percent(1 - reliabilityWeight)} rating · half-life ${halfLife} days`;
}

// Updates the switch, formula, seed number and sliders to match state.
function renderControls() {
  app.dataset.approach = state.approach; // lets CSS show C-only things such as labels
  document.querySelectorAll("[data-pick]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.pick === state.approach));
  });
  document.getElementById("formula").textContent = formulaText();
  document.getElementById("seed-value").textContent = state.seed;
  document.querySelectorAll("[data-setting]").forEach((slider) => {
    const key = slider.dataset.setting;
    slider.value = state.settings[key];
    document.getElementById(`${key}-value`).textContent = SETTING_FORMATS[key](state.settings[key]);
  });
}

// ---------- Under the hood ----------

// Show-up points + rating points = score, using the numbers showUpBreakdown calculated.
function equationHtml(b) {
  const showWeight = state.settings.reliabilityWeight;
  const showPoints = 100 * showWeight * b.reliability;
  const ratePoints = 100 * b.ratingWeight * b.ratingPart;
  return `
    <div class="term"><span>Show-up</span><strong>${showPoints.toFixed(1)}</strong><small>${percent(b.reliability)} × ${showWeight.toFixed(2)}</small></div>
    <span class="op" aria-hidden="true">+</span>
    <div class="term"><span>Rating ${b.bayes.toFixed(2)}★</span><strong>${ratePoints.toFixed(1)}</strong><small>${percent(b.ratingPart)} × ${b.ratingWeight.toFixed(2)}</small></div>
    <span class="op" aria-hidden="true">=</span>
    <div class="term total"><span>Score</span><strong>${b.score}</strong><small>${b.label}</small></div>`;
}

// The x position in the chart of a plan from daysAgo days ago. Today is on the right.
function chartX(daysAgo) {
  return CHART.right - (daysAgo / HISTORY_DAYS) * (CHART.right - CHART.left);
}

// The y position in the chart for a weight between 0 and 1.
function chartY(weight) {
  return CHART.base - CHART.height * weight;
}

// The weight chart: one bar per plan, as tall as that plan's weight, in front
// of the decay curve. Moving the half-life slider reshapes the curve and bars.
function weightsChartSvg(user, b) {
  const halfLife = state.settings.halfLife;
  const curve = Array.from({ length: HISTORY_DAYS + 1 }, (_, day) =>
    `${chartX(day).toFixed(1)},${chartY(recencyWeight(day, halfLife)).toFixed(1)}`).join(" ");

  const bars = b.rows.map((row, i) => `
    <rect class="bar-${outcomeOf(user.events[i])}" x="${(chartX(row.daysAgo) - 3).toFixed(1)}" y="${chartY(row.weight).toFixed(1)}"
      width="6" height="${(CHART.height * row.weight).toFixed(1)}" rx="2"/>`).join("");

  // A dotted line where weight has dropped to one half. Hidden if it falls off the chart.
  let halfMark = "";
  if (halfLife <= HISTORY_DAYS) {
    const x = chartX(halfLife);
    const labelOnLeft = x > CHART.right - 60;
    halfMark = `
      <line class="half" x1="${x}" x2="${x}" y1="${chartY(1)}" y2="${CHART.base}"/>
      <text class="half-label" x="${labelOnLeft ? x - 4 : x + 4}" y="${chartY(1) + 10}" text-anchor="${labelOnLeft ? "end" : "start"}">half-life</text>`;
  }

  return `<line class="baseline" x1="${CHART.left}" x2="${CHART.right}" y1="${CHART.base}" y2="${CHART.base}"/>
    ${halfMark}<polyline class="curve" points="${curve}"/>${bars}`;
}

// The "Exact maths" section: every plan's weight and the formulas with real numbers.
function renderMaths(user, b) {
  const { halfLife, reliabilityWeight, priorConfidence } = state.settings;
  const ratings = ratingsOf(user.events);
  const ratingSum = ratings.reduce((total, r) => total + r, 0);
  const rows = b.rows.map((row, i) => `
    <tr><td>${OUTCOME_NAMES[outcomeOf(user.events[i])]}</td><td>${row.daysAgo}</td>
    <td>${row.weight.toFixed(3)}</td><td>${row.attendance}</td><td>${row.weighted.toFixed(3)}</td></tr>`).join("");

  document.getElementById("maths-body").innerHTML = `
    <p>Weight per plan: 0.5 ^ (days ago / ${halfLife})</p>
    <div class="events"><table>
      <tr><th>Plan</th><th>Days ago</th><th>Weight</th><th>Attended</th><th>Weight × attended</th></tr>
      ${rows}
      <tr><th>Total</th><td></td><th>${b.totalWeight.toFixed(3)}</th><td></td><th>${b.weightedAttendance.toFixed(3)}</th></tr>
    </table></div>
    <p>Show-up rate, with ${PRIOR_SHOWS} pretend shows and ${PRIOR_NO_SHOWS} pretend no-show</p>
    <p class="formula-line">(${b.weightedAttendance.toFixed(3)} + ${PRIOR_SHOWS}) / (${b.totalWeight.toFixed(3)} + ${PRIOR_SHOWS + PRIOR_NO_SHOWS}) = ${b.reliability.toFixed(3)}</p>
    <p>Rating, then scaled from 1-5 to 0-1</p>
    <p class="formula-line">(${priorConfidence} × ${PRIOR_MEAN} + ${ratingSum}) / (${priorConfidence} + ${ratings.length}) = ${b.bayes.toFixed(3)} → ${b.ratingPart.toFixed(3)}</p>
    <p>Score</p>
    <p class="formula-line">100 × (${reliabilityWeight.toFixed(2)} × ${b.reliability.toFixed(3)} + ${b.ratingWeight.toFixed(2)} × ${b.ratingPart.toFixed(3)}) = ${b.score}</p>`;
}

// Draws the right-hand panel for the selected user.
function renderHood() {
  const user = selectedUser();
  const b = showUpBreakdown(user.events, state.settings);

  document.getElementById("hood-head").innerHTML = `
    <span class="avatar" aria-hidden="true">${user.name[0]}</span>
    <div><h2 id="hood-title">${user.name}</h2><p>${user.tagline}</p></div>`;
  document.getElementById("equation").innerHTML = equationHtml(b);

  const chart = document.getElementById("weights-chart");
  chart.innerHTML = weightsChartSvg(user, b);
  chart.setAttribute("aria-label",
    `How much each of ${user.name}'s plans counts. Weight halves every ${state.settings.halfLife} days.`);

  renderMaths(user, b);
  document.getElementById("log-name").textContent = user.name;
}

// Redraws everything from state. Five users is small enough that redrawing
// everything is simpler than tracking what changed.
function render() {
  renderControls();
  renderBoard();
  renderHood();
}

// ---------- Actions ----------

// Tells screen-reader users the new order, since they can't see rows move.
function announceRanking() {
  const names = rankedUsers(state.approach).map(({ user }) => user.name).join(", ");
  document.getElementById("announce").textContent = `Ranked by ${APPROACH_NAMES[state.approach]}: ${names}.`;
}

// Switches to approach A, B or C.
function pickApproach(approach) {
  if (approach === state.approach) return;
  state.approach = approach;
  render();
  announceRanking();
}

// Opens a person in the under-the-hood panel.
function selectPerson(id) {
  state.selectedId = id;
  render();
}

// Moves the selection one row up (-1) or down (+1) in the current ranking.
function moveSelection(step) {
  const ids = rankedUsers(state.approach).map(({ user }) => user.id);
  const next = ids.indexOf(state.selectedId) + step;
  if (next >= 0 && next < ids.length) selectPerson(ids[next]);
}

// Replaces all users with a fresh history from the given seed.
// Plans added by hand are lost, because they belong to the old history.
function loadSeed(seed) {
  state.seed = seed;
  state.users = generateUsers(seed);
  buildBoard();
  render();
}

// Puts everything back to how the demo starts.
function reset() {
  state.settings = { ...DEFAULT_SETTINGS };
  state.approach = "A";
  state.selectedId = "nico";
  loadSeed(DEFAULT_SEED);
}

// Adds a plan from today to the selected person and redraws their dots.
function addPlan(outcome) {
  const user = selectedUser();
  user.events.push({
    daysAgo: 0,
    showedUp: outcome === "showed",
    cancelledLate: outcome === "late",
    rating: outcome === "showed" ? Number(document.getElementById("log-rating").value) : null,
  });
  drawTimeline(board.querySelector(`[data-row="${user.id}"]`), user);
  render();
}

// Hides the cover slide and lets people use the playground. The playground is
// "inert" until then, so keyboard focus can't wander behind the cover.
function start() {
  cover.hidden = true;
  app.inert = false;
  app.classList.add("entering");
  document.querySelector('[data-pick][aria-pressed="true"]').focus();
}

// Keyboard shortcuts for presenting: 1 2 3 pick an approach, ↑ ↓ change
// person, R resets. Ignored inside sliders and dropdowns, which use those keys.
function handleKey(e) {
  if (!cover.hidden || document.activeElement.matches("input, select") || e.ctrlKey || e.metaKey || e.altKey) return;
  if (KEY_TO_APPROACH[e.key]) {
    pickApproach(KEY_TO_APPROACH[e.key]);
  } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault(); // otherwise the page scrolls too
    moveSelection(e.key === "ArrowDown" ? 1 : -1);
  } else if (e.key.toLowerCase() === "r") {
    reset();
  }
}

// Connects every button, slider and key to an action. Runs once at start-up.
function setUpEvents() {
  document.getElementById("start").addEventListener("click", start);
  document.addEventListener("keydown", handleKey);

  document.querySelectorAll("[data-pick]").forEach((button) => {
    button.addEventListener("click", () => pickApproach(button.dataset.pick));
  });

  // One listener on the board instead of one per row, so it keeps working
  // after the rows are rebuilt for new users.
  board.addEventListener("click", (e) => {
    const button = e.target.closest("[data-id]");
    if (button) selectPerson(button.dataset.id);
  });

  document.querySelectorAll("[data-setting]").forEach((slider) => {
    slider.addEventListener("input", () => {
      state.settings[slider.dataset.setting] = Number(slider.value);
      render();
    });
  });

  document.querySelectorAll("[data-outcome]").forEach((button) => {
    button.addEventListener("click", () => addPlan(button.dataset.outcome));
  });

  document.getElementById("new-seed").addEventListener("click", () => loadSeed(state.seed + 1));
  document.getElementById("reset").addEventListener("click", reset);
}

setUpEvents();
buildBoard();
render();
