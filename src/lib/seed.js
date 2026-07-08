import { uid } from './storage.js';
import { DEFAULT_EARN_RATE } from './constants.js';

// Initial demo data so a first-time user sees a populated, understandable app.
// Goals are in minutes. `role` distinguishes parents (managers) from kids.
export function createSeedState() {
  const eliya = uid('kid');
  const aviel = uid('kid');
  const parent = uid('parent');

  return {
    version: 1,
    settings: {
      earnRate: DEFAULT_EARN_RATE, // minutes of activity per minute of screen unlocked
    },
    activeProfileId: eliya,
    profiles: [
      {
        id: parent,
        name: 'Parent',
        role: 'parent',
        color: 'slate',
        goals: { screenMax: 0, activityMin: 0 },
      },
      {
        id: eliya,
        name: 'Eliya',
        role: 'kid',
        color: 'rose',
        // daily goals in minutes
        goals: { screenMax: 120, activityMin: 60, choresMin: 30 },
      },
      {
        id: aviel,
        name: 'Aviel',
        role: 'kid',
        color: 'indigo',
        goals: { screenMax: 90, activityMin: 60, choresMin: 20 },
      },
    ],
    // A block is a scheduled task instance on the weekly grid.
    blocks: [
      block(eliya, 'activity', 'Play outside', 'mon', 16, 60, true),
      block(eliya, 'chore', 'Set the table', 'mon', 17, 30, true),
      block(eliya, 'screen', 'Tablet time', 'mon', 18, 60, false),
      block(eliya, 'homework', 'Reading', 'tue', 16, 45, false),
      block(eliya, 'activity', 'Bike ride', 'tue', 17, 45, false),
      block(aviel, 'activity', 'Playground', 'mon', 16, 45, true),
      block(aviel, 'chore', 'Tidy up toys', 'mon', 8, 15, true),
      block(aviel, 'screen', 'Cartoons', 'mon', 18, 30, false),
    ],
  };
}

function block(profileId, category, title, day, hour, duration, done) {
  return {
    id: uid('blk'),
    profileId,
    category,
    title,
    day,
    startHour: hour, // integer hour 6..21
    duration, // minutes
    completed: done,
    approved: done, // completed chores/activities start pre-approved in seed
  };
}
