import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
} from 'react';
import { load, save, uid } from '../lib/storage.js';
import { createSeedState } from '../lib/seed.js';

const StoreContext = createContext(null);

function reducer(state, action) {
  switch (action.type) {
    case 'SET_ACTIVE_PROFILE':
      return { ...state, activeProfileId: action.profileId };

    case 'ADD_PROFILE': {
      const profile = {
        id: uid('profile'),
        role: 'kid',
        color: action.profile.color ?? 'rose',
        goals: { screenMax: 120, activityMin: 60, choresMin: 30 },
        ...action.profile,
      };
      return { ...state, profiles: [...state.profiles, profile] };
    }

    case 'UPDATE_PROFILE':
      return {
        ...state,
        profiles: state.profiles.map((p) =>
          p.id === action.profile.id ? { ...p, ...action.profile } : p
        ),
      };

    case 'DELETE_PROFILE': {
      const profiles = state.profiles.filter((p) => p.id !== action.profileId);
      const blocks = state.blocks.filter((b) => b.profileId !== action.profileId);
      const activeProfileId =
        state.activeProfileId === action.profileId
          ? profiles.find((p) => p.role === 'kid')?.id ?? profiles[0]?.id ?? null
          : state.activeProfileId;
      return { ...state, profiles, blocks, activeProfileId };
    }

    case 'ADD_BLOCK': {
      const block = {
        id: uid('blk'),
        completed: false,
        approved: false,
        duration: 30,
        ...action.block,
      };
      return { ...state, blocks: [...state.blocks, block] };
    }

    case 'UPDATE_BLOCK':
      return {
        ...state,
        blocks: state.blocks.map((b) =>
          b.id === action.block.id ? { ...b, ...action.block } : b
        ),
      };

    case 'MOVE_BLOCK':
      return {
        ...state,
        blocks: state.blocks.map((b) =>
          b.id === action.id
            ? { ...b, day: action.day, startHour: action.startHour }
            : b
        ),
      };

    case 'DELETE_BLOCK':
      return {
        ...state,
        blocks: state.blocks.filter((b) => b.id !== action.id),
      };

    case 'TOGGLE_COMPLETE':
      return {
        ...state,
        blocks: state.blocks.map((b) =>
          b.id === action.id
            ? {
                ...b,
                completed: !b.completed,
                // Re-completing resets approval; un-completing clears it.
                approved: false,
              }
            : b
        ),
      };

    case 'SET_APPROVAL':
      return {
        ...state,
        blocks: state.blocks.map((b) =>
          b.id === action.id ? { ...b, approved: action.approved } : b
        ),
      };

    case 'UPDATE_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.settings } };

    case 'RESET':
      return createSeedState();

    default:
      return state;
  }
}

function init() {
  return load() ?? createSeedState();
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, init);

  // Persist on every change (debounce-free is fine for this data volume).
  useEffect(() => {
    save(state);
  }, [state]);

  return (
    <StoreContext.Provider value={{ state, dispatch }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within a StoreProvider');
  return ctx;
}

// Convenience selectors
export function useProfiles() {
  return useStore().state.profiles;
}

export function useKids() {
  return useStore().state.profiles.filter((p) => p.role === 'kid');
}
