import { ref, watch, type Ref } from 'vue';
import type { User } from '../lib/supabase';
import { getUserData, upsertUserData } from '../lib/supabase';
import type { UserCharacterInvestment } from '../types';

// Storage keys (must match App.vue)
const ROSTER_STORAGE_KEY = 'starguide-roster';
const INCLUDE_PLANNING_KEY = 'starguide-include-planning';
const FAVORITED_TEAMS_KEY = 'starguide-favorited-teams';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

// Debounce helper
function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

export function useCloudSync(
  user: Ref<User | null>,
  roster: Ref<Map<string, UserCharacterInvestment>>,
  favoritedTeams: Ref<string[][]>,
  includePlanningInTeams: Ref<boolean>
) {
  const syncStatus = ref<SyncStatus>('idle');
  const lastSyncAt = ref<Date | null>(null);
  const pendingChanges = ref(0);
  const isSyncing = ref(false);

  // Convert roster Map to array for JSON storage
  const rosterToArray = (): [string, UserCharacterInvestment][] => {
    return Array.from(roster.value.entries());
  };

  // Convert array back to Map
  const arrayToRoster = (
    arr: [string, unknown][]
  ): Map<string, UserCharacterInvestment> => {
    const map = new Map<string, UserCharacterInvestment>();
    for (const [key, value] of arr) {
      // Handle migration from old format if needed
      if (typeof value === 'string') {
        // Legacy format: just ownership status
        map.set(key, {
          ownership: value as 'owned' | 'concept' | 'none',
          eidolonLevel: 0,
          lightConeId: undefined,
          lightConeSuperimposition: undefined,
        });
      } else {
        map.set(key, value as UserCharacterInvestment);
      }
    }
    return map;
  };

  // Push current local state to cloud
  const syncToCloud = async (): Promise<{ error: string | null }> => {
    if (!user.value) {
      return { error: 'Not authenticated' };
    }

    if (isSyncing.value) {
      pendingChanges.value++;
      return { error: null };
    }

    isSyncing.value = true;
    syncStatus.value = 'syncing';

    try {
      const result = await upsertUserData(user.value.id, {
        roster: rosterToArray(),
        favorited_teams: favoritedTeams.value,
        settings: {
          includePlanningInTeams: includePlanningInTeams.value,
        },
      });

      if (result.error) {
        syncStatus.value = 'error';
        return result;
      }

      lastSyncAt.value = new Date();
      syncStatus.value = 'synced';

      // Process any pending changes that came in during sync
      if (pendingChanges.value > 0) {
        pendingChanges.value = 0;
        // Re-sync after a short delay
        setTimeout(() => syncToCloud(), 500);
      }

      return { error: null };
    } catch (e) {
      console.error('Sync to cloud failed:', e);
      syncStatus.value = 'error';
      return { error: 'Sync failed' };
    } finally {
      isSyncing.value = false;
    }
  };

  // Pull cloud state to local
  const syncFromCloud = async (): Promise<{
    error: string | null;
    hasData: boolean;
  }> => {
    if (!user.value) {
      return { error: 'Not authenticated', hasData: false };
    }

    syncStatus.value = 'syncing';

    try {
      const cloudData = await getUserData(user.value.id);

      if (!cloudData) {
        // No cloud data - user is new or hasn't synced yet
        syncStatus.value = 'idle';
        return { error: null, hasData: false };
      }

      // Apply cloud data to local state
      if (cloudData.roster && Array.isArray(cloudData.roster)) {
        roster.value = arrayToRoster(cloudData.roster);
        // Also save to localStorage for offline access
        localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify(cloudData.roster));
      }

      if (cloudData.favorited_teams && Array.isArray(cloudData.favorited_teams)) {
        favoritedTeams.value = cloudData.favorited_teams;
        localStorage.setItem(
          FAVORITED_TEAMS_KEY,
          JSON.stringify(cloudData.favorited_teams)
        );
      }

      if (cloudData.settings) {
        if (typeof cloudData.settings.includePlanningInTeams === 'boolean') {
          includePlanningInTeams.value = cloudData.settings.includePlanningInTeams;
          localStorage.setItem(
            INCLUDE_PLANNING_KEY,
            String(cloudData.settings.includePlanningInTeams)
          );
        }
      }

      lastSyncAt.value = new Date();
      syncStatus.value = 'synced';

      return { error: null, hasData: true };
    } catch (e) {
      console.error('Sync from cloud failed:', e);
      syncStatus.value = 'error';
      return { error: 'Sync failed', hasData: false };
    }
  };

  // Migrate local data to cloud (first-time sync after login)
  const migrateLocalToCloud = async (): Promise<{ error: string | null }> => {
    if (!user.value) {
      return { error: 'Not authenticated' };
    }

    syncStatus.value = 'syncing';

    try {
      // Check if cloud has existing data
      const cloudData = await getUserData(user.value.id);

      if (cloudData && cloudData.roster && cloudData.roster.length > 0) {
        // Cloud has data - merge with local (cloud wins for conflicts)
        // This handles the case where user has data from another device
        const cloudRoster = arrayToRoster(cloudData.roster);
        const localRoster = roster.value;

        // Merge: start with cloud, add any local-only characters
        const mergedRoster = new Map(cloudRoster);
        for (const [key, value] of localRoster) {
          if (!mergedRoster.has(key)) {
            mergedRoster.set(key, value);
          }
        }

        roster.value = mergedRoster;

        // Merge favorited teams (combine both, dedupe)
        const cloudTeams = cloudData.favorited_teams || [];
        const localTeams = favoritedTeams.value;
        const allTeamKeys = new Set<string>();
        const mergedTeams: string[][] = [];

        for (const team of [...cloudTeams, ...localTeams]) {
          const key = [...team].sort().join(',');
          if (!allTeamKeys.has(key)) {
            allTeamKeys.add(key);
            mergedTeams.push(team);
          }
        }

        favoritedTeams.value = mergedTeams;

        // Use cloud settings
        if (cloudData.settings?.includePlanningInTeams !== undefined) {
          includePlanningInTeams.value = cloudData.settings.includePlanningInTeams;
        }
      }

      // Push merged/local data to cloud
      return syncToCloud();
    } catch (e) {
      console.error('Migration failed:', e);
      syncStatus.value = 'error';
      return { error: 'Migration failed' };
    }
  };

  // Export all user data as JSON blob
  const exportData = (): Blob => {
    const data = {
      exportedAt: new Date().toISOString(),
      roster: rosterToArray(),
      favoritedTeams: favoritedTeams.value,
      settings: {
        includePlanningInTeams: includePlanningInTeams.value,
      },
    };

    return new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
  };

  // Debounced sync function (2 second delay for responsive feel)
  const debouncedSyncToCloud = debounce(syncToCloud, 2000);

  // Set up watchers for auto-sync when user is authenticated
  let stopWatchers: (() => void)[] = [];

  const startAutoSync = () => {
    // Clear any existing watchers
    stopAutoSync();

    // Watch roster changes
    const stopRoster = watch(
      roster,
      () => {
        if (user.value) {
          debouncedSyncToCloud();
        }
      },
      { deep: true }
    );

    // Watch favorited teams changes
    const stopFavorited = watch(
      favoritedTeams,
      () => {
        if (user.value) {
          debouncedSyncToCloud();
        }
      },
      { deep: true }
    );

    // Watch settings changes
    const stopSettings = watch(includePlanningInTeams, () => {
      if (user.value) {
        debouncedSyncToCloud();
      }
    });

    stopWatchers = [stopRoster, stopFavorited, stopSettings];
  };

  const stopAutoSync = () => {
    for (const stop of stopWatchers) {
      stop();
    }
    stopWatchers = [];
  };

  return {
    // State
    syncStatus,
    lastSyncAt,
    isSyncing,

    // Methods
    syncToCloud,
    syncFromCloud,
    migrateLocalToCloud,
    exportData,
    startAutoSync,
    stopAutoSync,
  };
}
