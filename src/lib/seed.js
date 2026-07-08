import { uid } from './storage.js';
import { DEFAULT_EARN_RATE } from './constants.js';

// Initial demo data so a first-time user sees a populated, understandable app.
// Goals are in minutes. `role` distinguishes parents (managers) from kids.
export function createSeedState() {
  const emma = uid('kid');
  const liam = uid('kid');
  const parent = uid('parent');

  return {
    version: 1,
    settings: {
      earnRate: DEFAULT_EARN_RATE, // minutes of activity per minute of screen unlocked
    },
    activeProfileId: emma,
    profiles: [
      {
        id: parent,
        name: 'Parent',
        role: 'parent',
        color: 'slate',
        goals: { screenMax: 0, activityMin: 0 },
      },
      {
        id: emma,
        name: 'Emma',
        role: 'kid',
        color: 'rose',
        age: 10,
        // daily goals in minutes
        goals: { screenMax: 120, activityMin: 60, choresMin: 30 },
      },
      {
        id: liam,
        name: 'Liam',
        role: 'kid',
        color: 'indigo',
        age: 7,
        goals: { screenMax: 90, activityMin: 60, choresMin: 20 },
      },
    ],
    // A block is a scheduled task instance on the weekly grid.
    blocks: [
      block(emma, 'activity', 'Soccer practice', 'mon', 16, 60, true),
      block(emma, 'chore', 'Set the table', 'mon', 17, 30, true),
      block(emma, 'screen', 'Tablet games', 'mon', 18, 60, false),
      block(emma, 'homework', 'Math worksheet', 'tue', 16, 45, false),
      block(emma, 'activity', 'Bike ride', 'tue', 17, 45, false),
      block(liam, 'activity', 'Playground', 'mon', 16, 45, true),
      block(liam, 'chore', 'Feed the dog', 'mon', 8, 15, true),
      block(liam, 'screen', 'Cartoons', 'mon', 18, 30, false),
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
