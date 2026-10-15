const TOTAL_CHANCE_PERCENT = 100;
const MAX_SPINS_PER_BATCH = 10;
const REWARDS = [
  { cents: 0, chancePercent: 83.33, sliceWeight: 10 },
  { cents: 300, chancePercent: 14.25, sliceWeight: 5 },
  { cents: 1000, chancePercent: 2.00, sliceWeight: 3 },
  { cents: 4000, chancePercent: 0.42, sliceWeight: 2 },
];
const CHANCE_SUM_TOLERANCE = 1e-9;
const TOTAL_CONFIGURED_CHANCE = REWARDS.reduce((sum, reward) => sum + reward.chancePercent, 0);
const SEGMENT_COLORS = [
  "#ef8665",
  "#e6ae4f",
  "#82aa70",
  "#5b9b91",
  "#688ac0",
  "#9279b3",
  "#d27582",
  "#b58e62",
];
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

spinCountInput.max = String(MAX_SPINS_PER_BATCH);

function setFeedback(kaomoji, message) {
  feedbackKaomoji.textContent = kaomoji;
  feedbackMessage.textContent = message;
}

function pointOnWheel(angleDegrees, radius) {
  const radians = ((angleDegrees - 90) * Math.PI) / 180;
  return {
    x: 150 + Math.cos(radians) * radius,
    y: 150 + Math.sin(radians) * radius,
  };
}

function getSliceAngle(sliceWeight) {
  const totalSliceWeight = REWARDS.reduce((sum, reward) => sum + reward.sliceWeight, 0);
  return sliceWeight / totalSliceWeight * 360;
}

function drawWheel() {
  let startAngle = 0;
  const segments = REWARDS.map((reward, index) => {
    const segmentAngle = getSliceAngle(reward.sliceWeight);
    const endAngle = startAngle + segmentAngle;
    const start = pointOnWheel(startAngle, 141);
    const end = pointOnWheel(endAngle, 141);
    const midAngle = startAngle + segmentAngle / 2;
    const label = pointOnWheel(midAngle, 94);
    const largeArc = segmentAngle > 180 ? 1 : 0;
    startAngle = endAngle;

    return `
      <path
        d="M 150 150 L ${start.x} ${start.y} A 141 141 0 ${largeArc} 1 ${end.x} ${end.y} Z"
        fill="${SEGMENT_COLORS[index % SEGMENT_COLORS.length]}"
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
  const roll = value[0] / 0x100000000 * TOTAL_CONFIGURED_CHANCE;
  let cumulativeChance = 0;

  for (let index = 0; index < REWARDS.length; index += 1) {
    cumulativeChance += REWARDS[index].chancePercent;
    if (roll < cumulativeChance) return index;
  }

  throw new Error("Configured reward chances must add up to 100%.");
}

function getTargetRotation(segmentIndex) {
  const segmentCenter = REWARDS
    .slice(0, segmentIndex)
    .reduce((angle, item) => angle + getSliceAngle(item.sliceWeight), 0)
    + getSliceAngle(REWARDS[segmentIndex].sliceWeight) / 2;
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
  const totalChance = TOTAL_CONFIGURED_CHANCE;
  const totalSliceWeight = REWARDS.reduce((sum, reward) => sum + reward.sliceWeight, 0);
  const hasInvalidChance = REWARDS.some(
    (reward) => !Number.isFinite(reward.chancePercent) || reward.chancePercent <= 0,
  );
  const hasInvalidSliceWeight = REWARDS.some(
    (reward) => !Number.isFinite(reward.sliceWeight) || reward.sliceWeight <= 0,
  );
  if (
    hasInvalidChance
    || Math.abs(totalChance - TOTAL_CHANCE_PERCENT) > CHANCE_SUM_TOLERANCE
    || hasInvalidSliceWeight
    || !Number.isFinite(totalSliceWeight)
    || totalSliceWeight <= 0
  ) {
    status.textContent = "Reward chances must total 100% and slice weights must be positive numbers.";
    spinButton.disabled = true;
    resetButton.disabled = true;
    console.error("Invalid reward configuration:", { totalChance, totalSliceWeight, rewards: REWARDS });
    return;
  }

  drawWheel();
  startIdleRotation();
  try {
    const saved = await chrome.storage.local.get("totalCents");
    totalCents = Number.isSafeInteger(saved.totalCents) && saved.totalCents >= 0
      ? saved.totalCents
      : 0;
    updateDisplays();
    spinButton.disabled = false;
  } catch (error) {
    updateDisplays();
    spinButton.disabled = false;
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
    || spinCount > MAX_SPINS_PER_BATCH
  ) {
    status.textContent = `Enter a whole number from 1 to ${MAX_SPINS_PER_BATCH}.`;
    spinCountInput.focus();
    return;
  }

  spinning = true;
  spinButton.disabled = true;
  spinCountInput.disabled = true;
  resetButton.disabled = true;
  status.textContent = "";
  let batchReward = 0;
  let saveFailed = false;

  try {
    await stopIdleRotation();

    for (let index = 0; index < spinCount; index += 1) {
      const segmentIndex = randomSegmentIndex();
      const reward = REWARDS[segmentIndex].cents;
      const targetRotation = getTargetRotation(segmentIndex);
      setFeedback("(ﾉ>ω<)ﾉ", spinCount > 1
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
      setFeedback("(；ω；)", spinCount > 1 ? "No rewards this time." : "No reward this time.");
    } else {
      const result = spinCount > 1
        ? `${spinCount} spins: earned ${formatMoney(batchReward)}`
        : `You earned ${formatMoney(batchReward)}!`;
      setFeedback("ヽ(^o^)ノ", result);
    }
    if (saveFailed) {
      status.textContent = "One or more rewards could not be saved.";
    }
  } finally {
    spinning = false;
    spinButton.disabled = false;
    spinCountInput.disabled = false;
    resetButton.disabled = false;
  }
});

resetButton.addEventListener("click", async () => {
  if (spinning || resetting) return;

  resetting = true;
  spinButton.disabled = true;
  spinCountInput.disabled = true;
  resetButton.disabled = true;
  totalCents = 0;
  updateDisplays();
  status.textContent = "";
  setFeedback("(｀・ω・´)", "Balance reset.");

  try {
    await saveProgress();
  } catch (error) {
    status.textContent = "Balance reset for now, but the change could not be saved.";
    console.error("Unable to save reset reward balance:", error);
  } finally {
    resetting = false;
    spinButton.disabled = false;
    spinCountInput.disabled = false;
    resetButton.disabled = false;
  }
});

setFeedback("(-_-) zZ", "");
initialize();
