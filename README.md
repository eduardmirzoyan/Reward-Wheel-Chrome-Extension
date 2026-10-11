# Habit Reward Wheel

A small Chrome extension popup for celebrating habits with a virtual cash-reward
wheel. Click the extension icon, then select **Spin the wheel**. Your virtual
reward balance is saved locally in the browser.

Rewards are for habit-building motivation only; they are not real money and
cannot be redeemed.

In `popup.js`, each reward's `chancePercent` controls how often it is selected
(decimal percentages are supported), while `sliceWeight` controls its visual
wheel size. Chances must total 100%; slice weights are positive relative values
and can total any amount.
The $0 reward displays a separate no-reward feedback message.

## Install in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Select **Load unpacked** and choose this project folder.
4. Pin **Habit Reward Wheel** from the Extensions menu for easy access.
