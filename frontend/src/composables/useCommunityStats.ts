import { ref, readonly, computed } from 'vue';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { CommunityStats, CharacterCommunityStats } from '../types';

// Singleton state - shared across all component instances
const communityStats = ref<CommunityStats | null>(null);
const isLoading = ref(false);
const error = ref<string | null>(null);
const lastFetchedAt = ref<Date | null>(null);

// Cache TTL: 15 minutes (stats update daily, no need to refetch frequently)
const CACHE_TTL_MS = 15 * 60 * 1000;

export function useCommunityStats() {
  const isCacheValid = computed(() => {
    if (!lastFetchedAt.value) return false;
    return Date.now() - lastFetchedAt.value.getTime() < CACHE_TTL_MS;
  });

  const fetchStats = async (force = false): Promise<void> => {
    // Skip if already loading
    if (isLoading.value) return;

    // Use cache if valid and not forcing refresh
    if (!force && isCacheValid.value && communityStats.value) {
      return;
    }

    // Skip if Supabase not configured
    if (!isSupabaseConfigured()) {
      error.value = 'Supabase not configured';
      return;
    }

    isLoading.value = true;
    error.value = null;

    try {
      const { data, error: fetchError } = await supabase
        .from('community_stats')
        .select('character_stats, total_users, last_aggregated_at')
        .eq('id', 'global')
        .single();

      if (fetchError) {
        // PGRST116 means no rows found - stats not yet aggregated
        if (fetchError.code === 'PGRST116') {
          communityStats.value = null;
          error.value = 'Community stats not yet available';
        } else {
          throw fetchError;
        }
      } else if (data) {
        communityStats.value = {
          characterStats: data.character_stats || {},
          totalUsers: data.total_users || 0,
          lastAggregatedAt: data.last_aggregated_at,
        };
        lastFetchedAt.value = new Date();
        error.value = null;
      }
    } catch (e) {
      console.error('Failed to fetch community stats:', e);
      error.value = 'Failed to load community statistics';
    } finally {
      isLoading.value = false;
    }
  };

  // Helper to get stats for a specific character
  const getCharacterStats = (characterId: string): CharacterCommunityStats | null => {
    if (!communityStats.value) return null;
    return communityStats.value.characterStats[characterId] || null;
  };

  // Get owned percentage for a character
  const getOwnedPercentage = (characterId: string): number | null => {
    const stats = getCharacterStats(characterId);
    return stats?.owned.percentage ?? null;
  };

  // Get owned count for a character
  const getOwnedCount = (characterId: string): number | null => {
    const stats = getCharacterStats(characterId);
    return stats?.owned.count ?? null;
  };

  // Get planning percentage for a character
  const getPlanningPercentage = (characterId: string): number | null => {
    const stats = getCharacterStats(characterId);
    return stats?.planning.percentage ?? null;
  };

  // Get planning count for a character
  const getPlanningCount = (characterId: string): number | null => {
    const stats = getCharacterStats(characterId);
    return stats?.planning.count ?? null;
  };

  // Get eidolon distribution for a character (returns owned and planning stats)
  const getEidolonStats = (
    characterId: string,
    level: number
  ): { owned: { count: number; percentage: number }; planning: { count: number; percentage: number } } | null => {
    const stats = getCharacterStats(characterId);
    return stats?.eidolons[String(level)] ?? null;
  };

  // Get light cone usage stats (returns owned and planning stats)
  const getLightConeStats = (
    characterId: string,
    lightConeId: string
  ): {
    owned: { count: number; percentage: number; avgSuperimposition: number };
    planning: { count: number; percentage: number; avgSuperimposition: number };
  } | null => {
    const stats = getCharacterStats(characterId);
    return stats?.lightCones[lightConeId] ?? null;
  };

  return {
    // State (readonly to prevent external mutation)
    stats: readonly(communityStats),
    isLoading: readonly(isLoading),
    error: readonly(error),

    // Computed
    totalUsers: computed(() => communityStats.value?.totalUsers ?? 0),
    lastAggregatedAt: computed(() => communityStats.value?.lastAggregatedAt ?? null),
    hasStats: computed(() => communityStats.value !== null),

    // Methods
    fetchStats,
    getCharacterStats,
    getOwnedPercentage,
    getOwnedCount,
    getPlanningPercentage,
    getPlanningCount,
    getEidolonStats,
    getLightConeStats,
  };
}
