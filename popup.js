const TOTAL_CHANCE_PERCENT = 100;
const KAOMOJI_STATES = ["idle", "spinning", "reward", "noReward"];
const CHANCE_SUM_TOLERANCE = 1e-9;

const wheel = document.querySelector("#wheel");
const spinButton = document.querySelector("#spin-button");
const spinCountInput = document.querySelector("#spin-input");
const resetButton = document.querySelector("#reset-button");
const feedbackKaomoji = document.querySelector("#feedback-kaomoji");
const feedbackMessage = document.querySelector("#feedback-message");
const balanceDisplay = document.querySelector("#balance");
const status = document.querySelector("#status");

let totalCents = 0;
let rotation = 0;
let spinning = false;
let resetting = false;
let maxSpinsPerBatch;
let rewards;
let totalConfiguredChance;
let totalSliceWeight;
let kaomojiBank;

function setControlsDisabled(disabled) {
  spinButton.disabled = disabled;
  spinCountInput.disabled = disabled;
  resetButton.disabled = disabled;
}

function setFeedback(state, message) {
  const kaomojis = kaomojiBank[state];
  const randomIndex = Math.floor(Math.random() * kaomojis.length);
  feedbackKaomoji.textContent = kaomojis[randomIndex];
  feedbackMessage.textContent = message;
}

async function loadSettings() {
  const response = await fetch(chrome.runtime.getURL("setting.json"));
  if (!response.ok) {
    throw new Error(`Settings request failed with status ${response.status}.`);
  }

  const settings = await response.json();
  if (
    settings === null
    || typeof settings !== "object"
    || Array.isArray(settings)
    || !Number.isSafeInteger(settings.maxSpinsPerBatch)
    || settings.maxSpinsPerBatch < 1
    || !Array.isArray(settings.rewards)
    || settings.rewards.length === 0
    || settings.rewards.some((reward) => (
      reward === null
      || typeof reward !== "object"
      || Array.isArray(reward)
      || !Number.isSafeInteger(reward.cents)
      || reward.cents < 0
      || !Number.isFinite(reward.chancePercent)
      || reward.chancePercent <= 0
      || !Number.isFinite(reward.sliceWeight)
      || reward.sliceWeight <= 0
      || typeof reward.color !== "string"
      || !CSS.supports("color", reward.color)
    ))
    || settings.kaomojis === null
    || typeof settings.kaomojis !== "object"
    || Array.isArray(settings.kaomojis)
    || KAOMOJI_STATES.some((state) => (
      !Array.isArray(settings.kaomojis[state])
      || settings.kaomojis[state].length === 0
      || settings.kaomojis[state].some((kaomoji) => (
        typeof kaomoji !== "string" || kaomoji.trim() === ""
      ))
    ))
  ) {
    throw new Error("Settings must include valid spin, reward, and kaomoji values.");
  }

  maxSpinsPerBatch = settings.maxSpinsPerBatch;
  rewards = settings.rewards;
  kaomojiBank = settings.kaomojis;
  totalConfiguredChance = rewards.reduce((sum, reward) => sum + reward.chancePercent, 0);
  totalSliceWeight = rewards.reduce((sum, reward) => sum + reward.sliceWeight, 0);

  if (
    Math.abs(totalConfiguredChance - TOTAL_CHANCE_PERCENT) > CHANCE_SUM_TOLERANCE
    || !Number.isFinite(totalSliceWeight)
    || totalSliceWeight <= 0
  ) {
    throw new Error("Reward chances must total 100% and slice weights must have a positive total.");
  }

  spinCountInput.max = String(maxSpinsPerBatch);
}

function pointOnWheel(angleDegrees, radius) {
  const radians = ((angleDegrees - 90) * Math.PI) / 180;
  return {
    x: 150 + Math.cos(radians) * radius,
    y: 150 + Math.sin(radians) * radius,
  };
}

function getSliceAngle(sliceWeight) {
  return sliceWeight / totalSliceWeight * 360;
}

function drawWheel() {
  let startAngle = 0;
  const segments = rewards.map((reward) => {
    const segmentAngle = getSliceAngle(reward.sliceWeight);
    const endAngle = startAngle + segmentAngle;
    const midAngle = startAngle + segmentAngle / 2;
    const label = pointOnWheel(midAngle, 94);
    const largeArc = segmentAngle > 180 ? 1 : 0;
    const start = pointOnWheel(startAngle, 141);
    const end = pointOnWheel(endAngle, 141);
    startAngle = endAngle;

    return `
      <path
        d="M 150 150 L ${start.x} ${start.y} A 141 141 0 ${largeArc} 1 ${end.x} ${end.y} Z"
        fill="${reward.color}"
        stroke="var(--color-neutral-0)"
        stroke-width="2"
      />
      <text
        class="wheel-label"
        x="${label.x}"
        y="${label.y}"
        transform="rotate(${midAngle} ${label.x} ${label.y})"
      >${formatWheelReward(reward.cents)}</text>
    `;
  }).join("");

  wheel.innerHTML = `${segments}<circle cx="150" cy="150" r="141" fill="none" stroke="var(--color-neutral-0)" stroke-width="2" />`;
}

function formatMoney(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatWheelReward(cents) {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : formatMoney(cents);
}

function updateDisplays() {
  balanceDisplay.textContent = formatMoney(totalCents);
}

function startIdleRotation() {
  wheel.style.setProperty("--wheel-idle-start", `${rotation}deg`);
  wheel.classList.add("is-idle");
}

async function stopIdleRotation() {
  if (!wheel.classList.contains("is-idle")) return;

  const transform = getComputedStyle(wheel).transform;
  if (transform !== "none") {
    const matrix = new DOMMatrixReadOnly(transform);
    rotation = (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;
  }

  wheel.classList.remove("is-idle");
  wheel.style.transform = `rotate(${rotation}deg)`;
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

function randomSegmentIndex() {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  const roll = value[0] / 0x100000000 * totalConfiguredChance;
  let cumulativeChance = 0;

  for (let index = 0; index < rewards.length; index += 1) {
    cumulativeChance += rewards[index].chancePercent;
    if (roll < cumulativeChance) return index;
  }

  throw new Error("Configured reward chances must add up to 100%.");
}

function getTargetRotation(segmentIndex) {
  const segmentCenter = rewards
    .slice(0, segmentIndex)
    .reduce((angle, item) => angle + getSliceAngle(item.sliceWeight), 0)
    + getSliceAngle(rewards[segmentIndex].sliceWeight) / 2;
  const currentAngle = ((rotation % 360) + 360) % 360;
  const landingAdjustment = (360 - ((segmentCenter + currentAngle) % 360)) % 360;
  return rotation + 5 * 360 + landingAdjustment;
}

function spinToSegment(targetRotation) {
  return new Promise((resolve) => {
    wheel.addEventListener("transitionend", function onSpinEnd(event) {
      if (event.target !== wheel || event.propertyName !== "transform") return;
      wheel.removeEventListener("transitionend", onSpinEnd);
      rotation = targetRotation;
      resolve();
    });
    wheel.style.transform = `rotate(${targetRotation}deg)`;
  });
}

async function saveProgress() {
  await chrome.storage.local.set({ totalCents });
}

async function initialize() {
  setControlsDisabled(true);

  try {
    await loadSettings();
  } catch (error) {
    status.textContent = "Settings couldn't be loaded. Check setting.json and reload the extension.";
    console.error("Unable to load settings:", error);
    return;
  }

  drawWheel();
  startIdleRotation();
  setFeedback("idle", "");
  try {
    const saved = await chrome.storage.local.get("totalCents");
    totalCents = Number.isSafeInteger(saved.totalCents) && saved.totalCents >= 0
      ? saved.totalCents
      : 0;
    updateDisplays();
    setControlsDisabled(false);
  } catch (error) {
    updateDisplays();
    setControlsDisabled(false);
    status.textContent = "Saved rewards couldn't be loaded. You can spin, but progress may not be saved.";
    console.error("Unable to load saved wheel rewards:", error);
  }
}

spinButton.addEventListener("click", async () => {
  if (spinning || resetting) return;

  const spinCount = spinCountInput.valueAsNumber;
  if (
    !Number.isInteger(spinCount)
    || spinCount < 1
    || spinCount > maxSpinsPerBatch
  ) {
    status.textContent = `Enter a whole number from 1 to ${maxSpinsPerBatch}.`;
    spinCountInput.focus();
    return;
  }

  spinning = true;
  setControlsDisabled(true);
  status.textContent = "";
  let batchReward = 0;
  let saveFailed = false;

  try {
    await stopIdleRotation();

    for (let index = 0; index < spinCount; index += 1) {
      const segmentIndex = randomSegmentIndex();
      const reward = rewards[segmentIndex].cents;
      const targetRotation = getTargetRotation(segmentIndex);
      setFeedback("spinning", spinCount > 1
        ? `Spin ${index + 1} of ${spinCount}…`
        : "The wheel is spinning…");
      await spinToSegment(targetRotation);
      totalCents += reward;
      batchReward += reward;
      updateDisplays();

      try {
        await saveProgress();
      } catch (error) {
        saveFailed = true;
        console.error("Unable to save wheel rewards:", error);
      }
    }

    if (batchReward === 0) {
      setFeedback("noReward", spinCount > 1 ? "No rewards this time." : "No reward this time.");
    } else {
      const result = spinCount > 1
        ? `${spinCount} spins: earned ${formatMoney(batchReward)}`
        : `You earned ${formatMoney(batchReward)}!`;
      setFeedback("reward", result);
    }
    if (saveFailed) {
      status.textContent = "One or more rewards could not be saved.";
    }
  } finally {
    spinning = false;
    setControlsDisabled(false);
  }
});

resetButton.addEventListener("click", async () => {
  if (spinning || resetting) return;

  resetting = true;
  setControlsDisabled(true);
  totalCents = 0;
  updateDisplays();
  status.textContent = "";
  setFeedback("idle", "Balance reset.");

  try {
    await saveProgress();
  } catch (error) {
    status.textContent = "Balance reset for now, but the change could not be saved.";
    console.error("Unable to save reset reward balance:", error);
  } finally {
    resetting = false;
    setControlsDisabled(false);
  }
});

initialize();
