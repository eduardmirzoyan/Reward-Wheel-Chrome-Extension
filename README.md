# Habit Reward Wheel

A Manifest V3 Chrome extension that provides a reward-wheel popup for habit
building. Spin once or run a batch of spins, earn virtual rewards, and track the
accumulated balance.

## Features

- Popup wheel animation and reward feedback.
- Spin individually or run 1–10 sequential spins per batch.
- Virtual balance saved locally in Chrome and a control to reset it.
- Extension icons at 16, 32, 48, and 128 pixels.

Rewards are for habit-building motivation only. They are virtual, are not real
money, and cannot be redeemed.

## Default rewards

The reward configuration is in `popup.js`.

| Reward | Chance | Slice weight |
| --- | ---: | ---: |
| $0 | 83.33% | 10 |
| $3 | 14.25% | 5 |
| $10 | 2.00% | 3 |
| $40 | 0.42% | 2 |

`chancePercent` determines the probability of winning each reward (decimal
percentages are supported). The chances must total 100%. `sliceWeight` sets the
relative visual size of each wheel segment; weights must be positive but do not
need to total a particular amount. Change the `REWARDS` array in `popup.js` to
customize the rewards, chances, or segment sizes.

## Install in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Select **Load unpacked** and choose this project folder.
4. Pin **Habit Reward Wheel** from the Extensions menu for easy access.

After changing extension files, reload the extension from `chrome://extensions`
to apply the changes.
