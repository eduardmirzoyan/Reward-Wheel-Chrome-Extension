const REWARDS_CENTS = [10, 25, 50, 100, 200];
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
const SEGMENT_ANGLE = 360 / REWARDS_CENTS.length;

const wheel = document.querySelector("#wheel");
const spinButton = document.querySelector("#spin-button");
const resetButton = document.querySelector("#reset-button");
const feedback = document.querySelector("#feedback");
const balanceDisplay = document.querySelector("#balance");
const spinCountDisplay = document.querySelector("#spin-count");
const status = document.querySelector("#status");

let totalCents = 0;
let spinCount = 0;
let rotation = 0;
let spinning = false;
let resetting = false;

function pointOnWheel(angleDegrees, radius) {
  const radians = ((angleDegrees - 90) * Math.PI) / 180;
  return {
    x: 150 + Math.cos(radians) * radius,
    y: 150 + Math.sin(radians) * radius,
  };
}

function drawWheel() {
  const segments = REWARDS_CENTS.map((reward, index) => {
    const startAngle = index * SEGMENT_ANGLE;
    const endAngle = startAngle + SEGMENT_ANGLE;
    const start = pointOnWheel(startAngle, 141);
    const end = pointOnWheel(endAngle, 141);
    const label = pointOnWheel(startAngle + SEGMENT_ANGLE / 2, 94);
    const labelRotation = startAngle + SEGMENT_ANGLE / 2;

    return `
      <path
        d="M 150 150 L ${start.x} ${start.y} A 141 141 0 0 1 ${end.x} ${end.y} Z"
        fill="${SEGMENT_COLORS[index % SEGMENT_COLORS.length]}"
        stroke="var(--color-wheel-divider)"
        stroke-width="2"
      />
      <text
        class="wheel-label"
        x="${label.x}"
        y="${label.y}"
        transform="rotate(${labelRotation} ${label.x} ${label.y})"
      >$${(reward / 100).toFixed(2)}</text>
    `;
  }).join("");

  wheel.innerHTML = `${segments}<circle cx="150" cy="150" r="141" fill="none" stroke="var(--color-wheel-divider)" stroke-width="2" />`;
}

function formatMoney(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function updateDisplays() {
  balanceDisplay.textContent = formatMoney(totalCents);
  if (spinCountDisplay) {
    spinCountDisplay.textContent = `${spinCount} ${spinCount === 1 ? "spin" : "spins"}`;
  }
}

function randomSegmentIndex() {
  const range = 0x100000000;
  const limit = range - (range % REWARDS_CENTS.length);
  const value = new Uint32Array(1);

  do {
    crypto.getRandomValues(value);
  } while (value[0] >= limit);

  return value[0] % REWARDS_CENTS.length;
}

async function saveProgress() {
  await chrome.storage.local.set({ totalCents, spinCount });
}

async function initialize() {
  drawWheel();
  try {
    const saved = await chrome.storage.local.get(["totalCents", "spinCount"]);
    totalCents = Number.isSafeInteger(saved.totalCents) && saved.totalCents >= 0
      ? saved.totalCents
      : 0;
    spinCount = Number.isSafeInteger(saved.spinCount) && saved.spinCount >= 0
      ? saved.spinCount
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
  const reward = REWARDS_CENTS[segmentIndex];
  const segmentCenter = segmentIndex * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
  const currentAngle = ((rotation % 360) + 360) % 360;
  const landingAdjustment = (360 - ((segmentCenter + currentAngle) % 360)) % 360;
  const targetRotation = rotation + 5 * 360 + landingAdjustment;

  spinning = true;
  spinButton.disabled = true;
  resetButton.disabled = true;
  status.textContent = "";
  feedback.textContent = "The wheel is spinning…";
  wheel.style.transform = `rotate(${targetRotation}deg)`;

  wheel.addEventListener("transitionend", async function onSpinEnd(event) {
    if (event.target !== wheel || event.propertyName !== "transform") return;
    wheel.removeEventListener("transitionend", onSpinEnd);
    rotation = targetRotation;
    totalCents += reward;
    spinCount += 1;
    updateDisplays();
    const rewardMessage = `You earned ${formatMoney(reward)}!`;
    feedback.textContent = rewardMessage;
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
  feedback.textContent = "Balance reset.";

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

initialize();
