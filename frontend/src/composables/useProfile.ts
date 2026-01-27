import { ref, computed, readonly } from 'vue';
import type { UserProfile, PublicRoster } from '../lib/supabase';
import {
  getOwnProfile,
  getPublicProfile,
  getPublicRoster,
  createProfile as createProfileApi,
  updateProfile as updateProfileApi,
  checkUsernameAvailable as checkUsernameAvailableApi,
  setRosterPublic as setRosterPublicApi,
} from '../lib/supabase';
import { characters } from '../data';
import { useCommunityStats } from './useCommunityStats';
import type { UserCharacterInvestment } from '../types';
import { getEffectiveScore, scoreToTier } from '../utils/scaleConverters';
import type { Character, TierRating } from '../types';

// Singleton state - shared across all useProfile() calls
const profile = ref<UserProfile | null>(null);           // Own profile (for editing)
const publicProfile = ref<UserProfile | null>(null);     // Viewed profile (for display)
const publicRoster = ref<PublicRoster | null>(null);     // Viewed profile's roster
const isLoading = ref(false);
const error = ref<string | null>(null);
const isSaving = ref(false);

export function useProfile() {
  // ============================================
  // COMPUTED HELPERS
  // ============================================

  /**
   * Whether the current user has a profile (with username set)
   */
  const hasProfile = computed(() => {
    return !!profile.value?.username;
  });

  /**
   * Get the current user's username if they have a profile
   */
  const ownUsername = computed(() => {
    return profile.value?.username || null;
  });

  /**
   * Whether we're viewing our own profile (comparing publicProfile to profile)
   */
  const isOwnProfile = computed(() => {
    if (!profile.value?.username || !publicProfile.value?.username) return false;
    return profile.value.username === publicProfile.value.username;
  });

  // ============================================
  // FETCH METHODS
  // ============================================

  /**
   * Fetch own profile for settings/editing
   */
  const fetchOwnProfile = async (userId: string) => {
    isLoading.value = true;
    error.value = null;
    try {
      profile.value = await getOwnProfile(userId);
    } catch (e) {
      error.value = 'Failed to load profile';
      console.error(e);
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Fetch a public profile by username (for /u/:username)
   */
  const fetchPublicProfile = async (username: string) => {
    isLoading.value = true;
    error.value = null;
    publicProfile.value = null;
    publicRoster.value = null;

    try {
      const fetchedProfile = await getPublicProfile(username);
      if (!fetchedProfile) {
        error.value = 'Profile not found or is private';
        return;
      }
      publicProfile.value = fetchedProfile;

      // Also fetch roster if available
      const fetchedRoster = await getPublicRoster(fetchedProfile.id);
      publicRoster.value = fetchedRoster;
    } catch (e) {
      error.value = 'Failed to load profile';
      console.error(e);
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Save profile changes
   */
  const saveProfile = async (
    userId: string,
    updates: Partial<UserProfile>
  ): Promise<{ error: string | null }> => {
    return updateProfileApi(userId, updates);
  };

  /**
   * Check username availability (wrapper for API function)
   */
  const checkUsernameAvailable = async (username: string): Promise<boolean> => {
    return checkUsernameAvailableApi(username);
  };

  /**
   * Set roster visibility
   */
  const setRosterPublic = async (
    userId: string,
    isPublic: boolean
  ): Promise<{ error: string | null }> => {
    return setRosterPublicApi(userId, isPublic);
  };

  // ============================================
  // COMPUTED STATS FROM ROSTER
  // ============================================

  /**
   * Roster statistics for display
   */
  const rosterStats = computed(() => {
    if (!publicRoster.value?.roster) return null;

    const rosterMap = new Map<string, UserCharacterInvestment>(
      publicRoster.value.roster as [string, UserCharacterInvestment][]
    );

    const owned = [...rosterMap.entries()].filter(
      ([_, inv]) => inv.ownership === 'owned'
    );

    const fiveStarCount = owned.filter(([id]) => {
      const char = characters.find(c => c.id === id);
      return char?.rarity === 5;
    }).length;

    const fourStarCount = owned.filter(([id]) => {
      const char = characters.find(c => c.id === id);
      return char?.rarity === 4;
    }).length;

    // Only count 5★ eidolons (4★ eidolons are too common to be meaningful)
    const e1PlusCount = owned.filter(([id, inv]) => {
      const char = characters.find(c => c.id === id);
      return char?.rarity === 5 && inv.eidolonLevel >= 1;
    }).length;
    const e6Count = owned.filter(([id, inv]) => {
      const char = characters.find(c => c.id === id);
      return char?.rarity === 5 && inv.eidolonLevel === 6;
    }).length;

    // Count signature light cones
    const signatureLCCount = owned.filter(([id, inv]) => {
      const char = characters.find(c => c.id === id);
      const sigLC = char?.investment?.lightCones?.find(lc => lc.isSignature);
      return sigLC && inv.lightConeId === sigLC.id;
    }).length;

    return {
      totalOwned: owned.length,
      totalCharacters: characters.length,
      ownedPercent: Math.round((owned.length / characters.length) * 100),
      fiveStarCount,
      fourStarCount,
      e1PlusCount,
      e6Count,
      signatureLCCount,
    };
  });

  /**
   * Element and path distribution for charts
   */
  const distribution = computed(() => {
    if (!publicRoster.value?.roster) return null;

    const rosterMap = new Map<string, UserCharacterInvestment>(
      publicRoster.value.roster as [string, UserCharacterInvestment][]
    );

    const ownedChars = [...rosterMap.entries()]
      .filter(([_, inv]) => inv.ownership === 'owned')
      .map(([id]) => characters.find(c => c.id === id))
      .filter((c): c is NonNullable<typeof c> => c !== undefined);

    const elements: Record<string, number> = {};
    const paths: Record<string, number> = {};

    for (const char of ownedChars) {
      elements[char.element] = (elements[char.element] || 0) + 1;
      paths[char.path] = (paths[char.path] || 0) + 1;
    }

    return { elements, paths };
  });

  /**
   * "Rare finds" - characters with <30% community ownership
   * Uses useCommunityStats for ownership percentages
   */
  const rareFinds = computed(() => {
    if (!publicRoster.value?.roster) return [];

    const { getOwnedPercentage, hasStats } = useCommunityStats();
    if (!hasStats.value) return [];

    const rosterMap = new Map<string, UserCharacterInvestment>(
      publicRoster.value.roster as [string, UserCharacterInvestment][]
    );

    return [...rosterMap.entries()]
      .filter(([_, inv]) => inv.ownership === 'owned')
      .map(([id]) => ({
        id,
        percent: getOwnedPercentage(id),
        character: characters.find(c => c.id === id),
      }))
      .filter(item => item.percent !== null && item.percent < 30 && item.character)
      .sort((a, b) => (a.percent ?? 100) - (b.percent ?? 100))
      .slice(0, 6)
      .map(item => item.character!);
  });

  /**
   * Get roster as a Map for easier lookups
   */
  const rosterMap = computed(() => {
    if (!publicRoster.value?.roster) return new Map<string, UserCharacterInvestment>();
    return new Map<string, UserCharacterInvestment>(
      publicRoster.value.roster as [string, UserCharacterInvestment][]
    );
  });

  /**
   * Get all owned characters sorted by name
   */
  const ownedCharacters = computed(() => {
    if (!publicRoster.value?.roster) return [];

    const roster = new Map<string, UserCharacterInvestment>(
      publicRoster.value.roster as [string, UserCharacterInvestment][]
    );

    return [...roster.entries()]
      .filter(([_, inv]) => inv.ownership === 'owned')
      .map(([id]) => characters.find(c => c.id === id))
      .filter((c): c is NonNullable<typeof c> => c !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  /**
   * Get avatar character (or default to highest tier owned character)
   */
  const avatarCharacter = computed((): Character | null => {
    // Prioritize own profile over public profile (for immediate updates when editing)
    const activeProfile = profile.value || publicProfile.value;

    // If avatar is explicitly set, use it
    if (activeProfile?.avatar_character_id) {
      const char = characters.find(c => c.id === activeProfile.avatar_character_id);
      if (char) return char;
    }

    // Default to highest tier owned character (adjusted for investment)
    if (!publicRoster.value?.roster || !ownedCharacters.value.length) return null;

    const roster = new Map<string, UserCharacterInvestment>(
      publicRoster.value.roster as [string, UserCharacterInvestment][]
    );

    const tierPriority: Record<TierRating, number> = {
      'T-1': 0,
      'T-0.5': 1,
      'T0': 2,
      'T0.5': 3,
      'T1': 4,
      'T1.5': 5,
      'T2': 6,
      'T3': 7,
      'T4': 8,
      'T5': 9,
    };

    // Calculate average tier for each owned character
    const sortedByTier = [...ownedCharacters.value].sort((a, b) => {
      const invA = roster.get(a.id);
      const invB = roster.get(b.id);

      if (!invA || !invB) return 0;

      // Calculate average score across all modes (adjusted for investment)
      const avgScoreA = (
        getEffectiveScore(a, 'moc', invA) +
        getEffectiveScore(a, 'pf', invA) +
        getEffectiveScore(a, 'as', invA)
      ) / 3;

      const avgScoreB = (
        getEffectiveScore(b, 'moc', invB) +
        getEffectiveScore(b, 'pf', invB) +
        getEffectiveScore(b, 'as', invB)
      ) / 3;

      const tierA = scoreToTier(avgScoreA);
      const tierB = scoreToTier(avgScoreB);

      const priorityDiff = tierPriority[tierA] - tierPriority[tierB];
      if (priorityDiff !== 0) return priorityDiff;

      // If same tier, prefer 5★ over 4★
      if (a.rarity !== b.rarity) return b.rarity - a.rarity;

      return a.name.localeCompare(b.name);
    });

    return sortedByTier[0] || null;
  });

  /**
   * Create a new profile (for setup wizard)
   */
  const createProfile = async (
    userId: string,
    username: string,
    displayName?: string,
    bio?: string
  ): Promise<{ error: string | null; username?: string }> => {
    isSaving.value = true;
    error.value = null;

    try {
      // Check username availability first
      const isAvailable = await checkUsernameAvailableApi(username.toLowerCase());
      if (!isAvailable) {
        return { error: 'Username is already taken' };
      }

      // Use insert for new profiles (createProfileApi)
      const result = await createProfileApi(userId, {
        username: username.toLowerCase(),
        display_name: displayName || null,
        bio: bio || null,
        game_uid: null,
        discord_handle: null,
        avatar_character_id: null,
        showcase_characters: [],
        is_public: false,
        show_uid: false,
        show_discord: false,
        show_investment: 'all',
      });

      if (result.error) {
        return { error: result.error };
      }

      // Refresh our profile data
      await fetchOwnProfile(userId);
      return { error: null, username: username.toLowerCase() };
    } catch (e) {
      console.error('Error creating profile:', e);
      return { error: 'Failed to create profile' };
    } finally {
      isSaving.value = false;
    }
  };

  /**
   * Update a single section of the profile (for inline editing)
   */
  const updateProfileSection = async (
    userId: string,
    updates: Partial<UserProfile>
  ): Promise<{ error: string | null }> => {
    isSaving.value = true;
    error.value = null;

    try {
      // Use update for existing profiles (doesn't require all fields)
      const result = await updateProfileApi(userId, updates);
      if (result.error) {
        return { error: result.error };
      }

      // Update local state immediately for optimistic UI
      if (profile.value) {
        profile.value = { ...profile.value, ...updates } as UserProfile;
      }

      // Also update publicProfile if viewing own profile
      if (publicProfile.value?.id === userId) {
        publicProfile.value = { ...publicProfile.value, ...updates } as UserProfile;
      }

      return { error: null };
    } catch (e) {
      console.error('Error updating profile:', e);
      return { error: 'Failed to save changes' };
    } finally {
      isSaving.value = false;
    }
  };

  /**
   * Update avatar character
   */
  const updateAvatar = async (
    userId: string,
    characterId: string | null
  ): Promise<{ error: string | null }> => {
    return updateProfileSection(userId, { avatar_character_id: characterId });
  };

  /**
   * Clear profile state (for logout)
   */
  const clearProfile = () => {
    profile.value = null;
    publicProfile.value = null;
    publicRoster.value = null;
    error.value = null;
  };

  // ============================================
  // RETURN
  // ============================================

  return {
    // State (readonly to prevent external mutation)
    profile: readonly(profile),
    publicProfile: readonly(publicProfile),
    publicRoster: readonly(publicRoster),
    isLoading: readonly(isLoading),
    isSaving: readonly(isSaving),
    error: readonly(error),

    // Computed helpers
    hasProfile,
    ownUsername,
    isOwnProfile,

    // Computed stats
    rosterStats,
    distribution,
    rareFinds,
    rosterMap,
    ownedCharacters,
    avatarCharacter,

    // Methods
    fetchOwnProfile,
    fetchPublicProfile,
    saveProfile,
    createProfile,
    updateProfileSection,
    updateAvatar,
    checkUsernameAvailable,
    setRosterPublic,
    clearProfile,
  };
}
