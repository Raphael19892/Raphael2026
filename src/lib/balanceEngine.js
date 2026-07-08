// The Balance Engine — pure functions, no React, fully unit-testable.
//
// Core rule: screen time must be EARNED. Completing (and, for accountability,
// parent-approving) activity and chore blocks credits a screen-time "wallet".
// Scheduling / completing screen-time blocks debits it.
//
//   earnedMinutes   = sum(approved earn blocks duration) * earnRate
//   spentMinutes    = sum(completed screen blocks duration)
//   balance         = earnedMinutes - spentMinutes   (may go negative = overdrawn)
//   availableToSpend = max(0, earned - spent)
//
// A screen block is only "allowed" to be marked done if there is enough balance,
// but the engine reports the state rather than forbidding it, so parents keep
// final say in the UI.

import { CATEGORIES } from './constants.js';

export function categoryEffect(categoryId) {
  return CATEGORIES[categoryId]?.effect ?? 'neutral';
}

// Compute the screen-time ledger for one profile from its blocks.
// `scope` filters blocks (e.g. a single day's blocks or the whole week).
export function computeBalance(blocks, earnRate = 1.0) {
  let earnedMinutes = 0;
  let spentMinutes = 0;
  let pendingEarnMinutes = 0; // completed but not yet approved

  for (const b of blocks) {
    const effect = categoryEffect(b.category);
    if (effect === 'earn') {
      if (b.completed && b.approved) {
        earnedMinutes += b.duration;
      } else if (b.completed && !b.approved) {
        pendingEarnMinutes += b.duration;
      }
    } else if (effect === 'spend') {
      if (b.completed) {
        spentMinutes += b.duration;
      }
    }
  }

  const earnedCredit = Math.round(earnedMinutes * earnRate);
  const balance = earnedCredit - spentMinutes;

  return {
    earnedMinutes,
    earnedCredit,
    spentMinutes,
    pendingEarnMinutes,
    balance,
    availableToSpend: Math.max(0, balance),
    overdrawn: balance < 0,
  };
}

// Would marking `screenBlock` as completed keep the wallet non-negative?
export function canAffordScreen(blocks, screenBlock, earnRate = 1.0) {
  const { availableToSpend } = computeBalance(
    blocks.filter((b) => b.id !== screenBlock.id),
    earnRate
  );
  return availableToSpend >= screenBlock.duration;
}

// Daily goal progress for a profile against its goals object.
// Returns minutes tallies + percentage completion per goal.
export function computeGoalProgress(blocks, goals = {}) {
  let screen = 0;
  let activity = 0;
  let chores = 0;

  for (const b of blocks) {
    if (!b.completed) continue;
    if (b.category === 'screen') screen += b.duration;
    else if (b.category === 'activity') activity += b.duration;
    else if (b.category === 'chore') chores += b.duration;
  }

  const pct = (value, target) =>
    !target ? 0 : Math.min(100, Math.round((value / target) * 100));

  return {
    screen: {
      minutes: screen,
      max: goals.screenMax ?? 0,
      // For a "max" goal, being UNDER the cap is good.
      pct: goals.screenMax ? Math.round((screen / goals.screenMax) * 100) : 0,
      overLimit: goals.screenMax ? screen > goals.screenMax : false,
    },
    activity: {
      minutes: activity,
      min: goals.activityMin ?? 0,
      pct: pct(activity, goals.activityMin),
      met: goals.activityMin ? activity >= goals.activityMin : true,
    },
    chores: {
      minutes: chores,
      min: goals.choresMin ?? 0,
      pct: pct(chores, goals.choresMin),
      met: goals.choresMin ? chores >= goals.choresMin : true,
    },
  };
}

// Completion rate across all schedulable blocks (0..100).
export function completionRate(blocks) {
  if (blocks.length === 0) return 0;
  const done = blocks.filter((b) => b.completed).length;
  return Math.round((done / blocks.length) * 100);
}
