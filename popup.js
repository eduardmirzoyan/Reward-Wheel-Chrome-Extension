const TOTAL_CHANCE_PERCENT = 100;
const REWARDS = [
  { cents: 10, chancePercent: 30 },
  { cents: 25, chancePercent: 25 },
  { cents: 50, chancePercent: 20 },
  { cents: 100, chancePercent: 15 },
  { cents: 200, chancePercent: 10 },
];
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
const resetButton = document.querySelector("#reset-button");
const feedbackKaomoji = document.querySelector("#feedback-kaomoji");
const feedbackMessage = document.querySelector("#feedback-message");
const balanceDisplay = document.querySelector("#balance");
const status = document.querySelector("#status");

let totalCents = 0;
let rotation = 0;
let spinning = false;
let resetting = false;

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

function drawWheel() {
  let startAngle = 0;
  const segments = REWARDS.map((reward, index) => {
    const segmentAngle = reward.chancePercent / TOTAL_CHANCE_PERCENT * 360;
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
      >$${(reward.cents / 100).toFixed(2)}</text>
    `;
  }).join("");

  wheel.innerHTML = `${segments}<circle cx="150" cy="150" r="141" fill="none" stroke="var(--color-neutral-0)" stroke-width="2" />`;
}

function formatMoney(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function updateDisplays() {
  balanceDisplay.textContent = formatMoney(totalCents);
}

function randomSegmentIndex() {
  const range = 0x100000000;
  const limit = range - (range % TOTAL_CHANCE_PERCENT);
  const value = new Uint32Array(1);

  do {
    crypto.getRandomValues(value);
  } while (value[0] >= limit);

  const roll = value[0] % TOTAL_CHANCE_PERCENT;
  let cumulativeChance = 0;

  for (let index = 0; index < REWARDS.length; index += 1) {
    cumulativeChance += REWARDS[index].chancePercent;
    if (roll < cumulativeChance) return index;
  }

  throw new Error("Configured reward chances must add up to 100%.");
}

async function saveProgress() {
  await chrome.storage.local.set({ totalCents });
}

async function initialize() {
  const totalChance = REWARDS.reduce((sum, reward) => sum + reward.chancePercent, 0);
  const hasInvalidChance = REWARDS.some(
    (reward) => !Number.isInteger(reward.chancePercent) || reward.chancePercent <= 0,
  );
  if (hasInvalidChance || totalChance !== TOTAL_CHANCE_PERCENT) {
    status.textContent = "Reward chances must be positive whole percentages adding up to 100%.";
    spinButton.disabled = true;
    resetButton.disabled = true;
    console.error("Invalid reward configuration:", { totalChance, rewards: REWARDS });
    return;
  }

  drawWheel();
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

spinButton.addEventListener("click", () => {
  if (spinning || resetting) return;

  const segmentIndex = randomSegmentIndex();
  const reward = REWARDS[segmentIndex].cents;
  const segmentCenter = REWARDS
    .slice(0, segmentIndex)
    .reduce((angle, item) => angle + item.chancePercent / TOTAL_CHANCE_PERCENT * 360, 0)
    + REWARDS[segmentIndex].chancePercent / TOTAL_CHANCE_PERCENT * 180;
  const currentAngle = ((rotation % 360) + 360) % 360;
  const landingAdjustment = (360 - ((segmentCenter + currentAngle) % 360)) % 360;
  const targetRotation = rotation + 5 * 360 + landingAdjustment;

  spinning = true;
  spinButton.disabled = true;
  resetButton.disabled = true;
  status.textContent = "";
  setFeedback("(ﾉ>ω<)ﾉ", "The wheel is spinning…");
  wheel.style.transform = `rotate(${targetRotation}deg)`;

  wheel.addEventListener("transitionend", async function onSpinEnd(event) {
    if (event.target !== wheel || event.propertyName !== "transform") return;
    wheel.removeEventListener("transitionend", onSpinEnd);
    rotation = targetRotation;
    totalCents += reward;
    updateDisplays();
    setFeedback("ヽ(^o^)ノ", `You earned ${formatMoney(reward)}!`);
    try {
      await saveProgress();
    } catch (error) {
      status.textContent = "Reward added for now, but it could not be saved.";
      console.error("Unable to save wheel rewards:", error);
    } finally {
      spinning = false;
      spinButton.disabled = false;
      resetButton.disabled = false;
    }
  });
});

resetButton.addEventListener("click", async () => {
  if (spinning || resetting) return;

  resetting = true;
  spinButton.disabled = true;
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
    resetButton.disabled = false;
  }
});

setFeedback("(-_-) zZ", "");
initialize();
