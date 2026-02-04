<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import type { Character, OwnershipStatus, TierRating, UserCharacterInvestment, UserRosterMap } from './types';
import { characters } from './data';
import { TIER_SCORES, createDefaultInvestment } from './types';
import { migrateRoster, needsMigration } from './utils/investmentUtils';
import Starfield from './components/Starfield.vue';
import CharacterCard from './components/CharacterCard.vue';
import { jokeCharacters, toCharacterLike, type JokeCharacter } from './data/jokeCharacters';
import BestTeamsView from './components/BestTeamsView.vue';
import PullAdvisorView from './components/PullAdvisorView.vue';
import BannerAdvisorView from './components/BannerAdvisorView.vue';
import RosterView from './components/RosterView.vue';
import UserProfile from './components/UserProfile.vue';
import CharacterHeader from './components/CharacterHeader.vue';
import TeammateSection from './components/TeammateSection.vue';
import TeamCard from './components/TeamCard.vue';
import RestrictionsPanel from './components/RestrictionsPanel.vue';
import InvestmentPanel from './components/InvestmentPanel.vue';
import FeedbackWidget from './components/FeedbackWidget.vue';
import FeedbackNotification from './components/FeedbackNotification.vue';
import SpotlightOnboarding from './components/SpotlightOnboarding.vue';
import MobileTabBar from './components/MobileTabBar.vue';
import DiscordButton from './components/DiscordButton.vue';
import SurveyModal from './components/SurveyModal.vue';
import ChangelogModal from './components/ChangelogModal.vue';
import AuthModal from './components/AuthModal.vue';
import SettingsModal from './components/SettingsModal.vue';
import UserButton from './components/UserButton.vue';
import { useAuth } from './composables/useAuth';
import { useCloudSync } from './composables/useCloudSync';
import { useRouteState } from './composables/useRouteState';
import { useProfile } from './composables/useProfile';
import { useAdminAuth } from './composables/useAdminAuth';

// Admin components
import AdminLayout from './components/admin/AdminLayout.vue';
import AdminDashboard from './components/admin/AdminDashboard.vue';
import CharacterEditor from './components/admin/CharacterEditor.vue';
import UserManagement from './components/admin/UserManagement.vue';
import ReviewQueue from './components/admin/ReviewQueue.vue';
import ReviewEditor from './components/admin/ReviewEditor.vue';
import { useHead } from '@unhead/vue';
import { generateTeams, generateTeamsForSupport, type GeneratedTeam, type SupportTeamResult, type GameMode } from './utils/teamGenerator';
import { getTierData } from './data/tierData';
import { hasCompositions, getPrimaryComposition, getCompositionById } from './utils/characterUtils';
import CompositionSelector from './components/CompositionSelector.vue';

// ==================
// STATE
// ==================

// Router-based state for SEO (URL-based navigation)
const {
  selectedCharacter,
  viewMode,
  selectCharacter,
  setViewMode,
  isUserProfilePage,
  isProfileSetupPage,
  isProfilePage,
  isAdminPage,
  profileUsername,
  route
} = useRouteState();

// Admin auth
const { isAdmin, isContributor } = useAdminAuth();

// Profile composable for accessing user profile state
const { hasProfile, ownUsername, fetchOwnProfile } = useProfile();

const roster = ref<UserRosterMap>(new Map());
const activeTab = ref<'teammates' | 'my-teams' | 'investment'>('investment');
const selectedCompositionId = ref<string | null>(null); // Selected composition for current character
const isLoaded = ref(false);

// Get selected composition name for display
const selectedCompositionName = computed(() => {
  if (!selectedCharacter.value || !selectedCompositionId.value) return null;
  const comp = getCompositionById(selectedCharacter.value, selectedCompositionId.value);
  return comp?.name || null;
});
const gameMode = ref<GameMode>('moc'); // Current game mode for tier display

// Scroll to top when switching view modes
watch(viewMode, () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// SEO Configuration
const BASE_URL = 'https://starguide-bay.vercel.app';

// Dynamic SEO meta computed values
const seoTitle = computed(() => {
  if (isUserProfilePage.value && profileUsername.value) {
    return `${profileUsername.value}'s HSR Collection - StarGuide | Honkai Star Rail`;
  }
  if (isProfileSetupPage.value) {
    return 'Create Your Profile - StarGuide | Honkai Star Rail';
  }
  if (viewMode.value === 'best-teams') {
    return 'Best HSR Teams - StarGuide | Honkai Star Rail Team Builder';
  }
  if (viewMode.value === 'pull-advisor') {
    return 'HSR Pull Advisor - StarGuide | Who to Pull Next in Honkai Star Rail';
  }
  if (viewMode.value === 'banner-advisor') {
    return 'HSR Banner Advisor - StarGuide | Current & Upcoming Banners';
  }
  if (selectedCharacter.value) {
    return `${selectedCharacter.value.name} HSR Build & Teams - StarGuide | Honkai Star Rail`;
  }
  return 'HSR Team Builder From Your Roster | StarGuide';
});

const seoDescription = computed(() => {
  if (isUserProfilePage.value && profileUsername.value) {
    return `View ${profileUsername.value}'s Honkai Star Rail character collection, teams, and rare finds on StarGuide.`;
  }
  if (isProfileSetupPage.value) {
    return 'Create your public StarGuide profile. Share your Honkai Star Rail collection, showcase your favorite characters, and connect with other players.';
  }
  if (viewMode.value === 'best-teams') {
    return 'Find the best Honkai Star Rail team compositions from your owned characters. Optimized team recommendations for Memory of Chaos, Pure Fiction, and Apocalyptic Shadow.';
  }
  if (viewMode.value === 'pull-advisor') {
    return 'Get personalized pull recommendations based on your Honkai Star Rail roster. Find the best characters to pull that synergize with your existing teams.';
  }
  if (viewMode.value === 'banner-advisor') {
    return 'Evaluate current and upcoming Honkai Star Rail banners based on your roster. See which banner characters would benefit your account the most.';
  }
  if (selectedCharacter.value) {
    const char = selectedCharacter.value;
    const roles = char.roles.join(', ');
    const tierData = getTierData(char.id);
    const bestTier = tierData?.moc?.DPS || tierData?.moc?.Amplifier || tierData?.moc?.Sustain || 'T2';
    return char.description || `Best ${char.name} teams and builds for Honkai Star Rail. ${char.element} ${char.path} ${roles} rated ${bestTier}. Find optimal teammates, light cones, and investment priorities.`;
  }
  return 'Build HSR teams from your owned characters, eidolons, and light cones. The only Honkai Star Rail team builder made for YOUR account.';
});

const seoCanonical = computed(() => {
  if (isUserProfilePage.value && profileUsername.value) return `${BASE_URL}/u/${profileUsername.value}`;
  if (isProfileSetupPage.value) return `${BASE_URL}/profile/setup`;
  if (viewMode.value === 'best-teams') return `${BASE_URL}/best-teams`;
  if (viewMode.value === 'pull-advisor') return `${BASE_URL}/pull-advisor`;
  if (viewMode.value === 'banner-advisor') return `${BASE_URL}/banner-advisor`;
  if (selectedCharacter.value) return `${BASE_URL}/character/${selectedCharacter.value.id}`;
  return BASE_URL;
});

const seoOgImage = computed(() => {
  // Profile OG image (dynamic, generated by API)
  if (isUserProfilePage.value && profileUsername.value) {
    return `${BASE_URL}/api/og/${profileUsername.value}.png`;
  }
  // Character-specific OG image
  if (selectedCharacter.value) {
    return `${BASE_URL}/icons/${selectedCharacter.value.id}.webp`;
  }
  // Default OG image
  return `${BASE_URL}/og-image.png`;
});

// JSON-LD Structured Data - WebSite schema is what Google uses for site name in search results
const jsonLdWebSite = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'StarGuide',
  alternateName: 'StarGuide HSR Team Builder',
  url: BASE_URL,
  description: 'Build HSR teams from your owned characters, eidolons, and light cones. The only Honkai Star Rail team builder made for YOUR account.',
  potentialAction: {
    '@type': 'SearchAction',
    target: `${BASE_URL}/?q={search_term_string}`,
    'query-input': 'required name=search_term_string',
  },
};

const jsonLdWebApp = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'StarGuide',
  description: 'Build HSR teams from your owned characters, eidolons, and light cones. The only Honkai Star Rail team builder made for YOUR account.',
  applicationCategory: 'GameApplication',
  operatingSystem: 'Web',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  url: BASE_URL,
};

const jsonLdCharacter = computed(() => {
  if (!selectedCharacter.value) return null;
  const char = selectedCharacter.value;
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoGameCharacter',
    name: char.name,
    description: char.description || `${char.element} ${char.path} character in Honkai Star Rail`,
    image: `${BASE_URL}/icons/${char.id}.webp`,
    url: `${BASE_URL}/character/${char.id}`,
    partOfVideoGame: {
      '@type': 'VideoGame',
      name: 'Honkai: Star Rail',
      publisher: {
        '@type': 'Organization',
        name: 'miHoYo/Cognosphere'
      }
    }
  };
});

const jsonLdBreadcrumb = computed(() => {
  if (!selectedCharacter.value) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: BASE_URL,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Characters',
        item: BASE_URL,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: selectedCharacter.value.name,
        item: `${BASE_URL}/character/${selectedCharacter.value.id}`,
      },
    ],
  };
});

// Full SEO Head Management
useHead({
  title: seoTitle,
  meta: computed(() => [
    { name: 'description', content: seoDescription.value },
    // Open Graph
    { property: 'og:title', content: seoTitle.value },
    { property: 'og:description', content: seoDescription.value },
    { property: 'og:image', content: seoOgImage.value },
    { property: 'og:image:width', content: isUserProfilePage.value ? '1200' : '512' },
    { property: 'og:image:height', content: isUserProfilePage.value ? '630' : '512' },
    { property: 'og:url', content: seoCanonical.value },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: 'StarGuide' },
    // Twitter
    { name: 'twitter:card', content: (selectedCharacter.value && !isUserProfilePage.value) ? 'summary' : 'summary_large_image' },
    { name: 'twitter:title', content: seoTitle.value },
    { name: 'twitter:description', content: seoDescription.value },
    { name: 'twitter:image', content: seoOgImage.value },
  ]),
  link: computed(() => [
    { rel: 'canonical', href: seoCanonical.value },
  ]),
  script: computed(() => {
    const scripts = [
      { type: 'application/ld+json', innerHTML: JSON.stringify(jsonLdWebSite) },
      { type: 'application/ld+json', innerHTML: JSON.stringify(jsonLdWebApp) },
    ];
    if (jsonLdCharacter.value) {
      scripts.push({ type: 'application/ld+json', innerHTML: JSON.stringify(jsonLdCharacter.value) });
    }
    if (jsonLdBreadcrumb.value) {
      scripts.push({ type: 'application/ld+json', innerHTML: JSON.stringify(jsonLdBreadcrumb.value) });
    }
    return scripts;
  }),
});

// Locked teams for Best Teams view (character IDs that are "reserved" for locked teams)
const lockedTeams = ref<string[][]>([]);

// Favorited teams for Best Teams view (teams user has hearted, shown at top of list)
const favoritedTeams = ref<string[][]>([]);

// Mobile responsive state
const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1024);
const isMobile = computed(() => windowWidth.value < 768);

// Tier calculation helpers
const tierOrder: TierRating[] = ['T-1', 'T-0.5', 'T0', 'T0.5', 'T1', 'T1.5', 'T2', 'T3', 'T4', 'T5'];
const tierToNumber = (tier: TierRating): number => {
  const values: Record<TierRating, number> = {
    'T-1': -1, 'T-0.5': -0.5, 'T0': 0, 'T0.5': 0.5, 'T1': 1, 'T1.5': 1.5, 'T2': 2, 'T3': 3, 'T4': 4, 'T5': 5
  };
  return values[tier];
};
const numberToTier = (num: number): TierRating => {
  if (num <= -0.75) return 'T-1';
  if (num <= -0.25) return 'T-0.5';
  if (num <= 0.25) return 'T0';
  if (num <= 0.75) return 'T0.5';
  if (num <= 1.25) return 'T1';
  if (num <= 1.75) return 'T1.5';
  if (num <= 2.5) return 'T2';
  if (num <= 3.5) return 'T3';
  if (num <= 4.5) return 'T4';
  return 'T5';
};

// Get best tier for a specific mode
const getBestTierForMode = (characterId: string, mode: 'moc' | 'pf' | 'as'): TierRating => {
  const tierData = getTierData(characterId);
  if (!tierData) return 'T2';

  const modeData = tierData[mode];
  if (!modeData) return 'T2';

  const tiers = Object.values(modeData) as TierRating[];
  if (tiers.length === 0) return 'T2';

  return tiers.reduce((best, current) =>
    tierOrder.indexOf(current) < tierOrder.indexOf(best) ? current : best
  );
};

// Helper to get a character's tier based on current sort mode
const getCharacterTier = (characterId: string): TierRating => {
  const mode = tierSortMode.value;

  // If a specific game mode is selected, use that mode's tier
  if (mode === 'moc') return getBestTierForMode(characterId, 'moc');
  if (mode === 'pf') return getBestTierForMode(characterId, 'pf');
  if (mode === 'as') return getBestTierForMode(characterId, 'as');

  // Default: average across all game modes
  const mocTier = getBestTierForMode(characterId, 'moc');
  const pfTier = getBestTierForMode(characterId, 'pf');
  const asTier = getBestTierForMode(characterId, 'as');

  const avg = (tierToNumber(mocTier) + tierToNumber(pfTier) + tierToNumber(asTier)) / 3;
  return numberToTier(avg);
};

// Sidebar state
type FilterOption = 'all' | 'owned' | 'unowned';
type TierSortMode = 'avg' | 'moc' | 'pf' | 'as';
const sidebarFilter = ref<FilterOption>('all');
const tierSortMode = ref<TierSortMode>('moc');
const searchQuery = ref('');


// Local storage keys
const ROSTER_STORAGE_KEY = 'starguide-roster';
const INCLUDE_PLANNING_KEY = 'starguide-include-planning';
const FAVORITED_TEAMS_KEY = 'starguide-favorited-teams';

// Setting: whether "Planning to Pull" characters count toward team generation
const includePlanningInTeams = ref(true);

// ==================
// AUTH & CLOUD SYNC
// ==================

const {
  user,
  isLoading: isAuthLoading,
  initAuthListener,
  cleanupAuthListener,
  signOut: authSignOut,
  deleteAccount: authDeleteAccount,
} = useAuth();

// Modal states
const isAuthModalOpen = ref(false);
const isSettingsModalOpen = ref(false);

// Cloud sync (initialized after roster is loaded)
const cloudSync = useCloudSync(user, roster, favoritedTeams, includePlanningInTeams);
const { syncStatus, lastSyncAt, syncToCloud, syncFromCloud, migrateLocalToCloud, exportData, startAutoSync, stopAutoSync } = cloudSync;

// Handle sign out
const handleSignOut = async () => {
  stopAutoSync();
  await authSignOut();
  isSettingsModalOpen.value = false;
};

// Handle account deletion
const handleDeleteAccount = async () => {
  stopAutoSync();
  await authDeleteAccount();
  isSettingsModalOpen.value = false;
};

// Handle export data
const handleExportData = () => {
  const blob = exportData();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `starguide-export-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Handle manual sync
const handleSyncNow = () => {
  syncToCloud();
};

// Handle successful authentication
const handleAuthenticated = async () => {
  isAuthModalOpen.value = false;
  // Migrate local data to cloud on first login
  await migrateLocalToCloud();
  // Start auto-sync
  startAutoSync();
};

// Handle guest mode (user chose to continue without account)
const handleGuestMode = () => {
  isAuthModalOpen.value = false;
};

// Watch for auth state changes to start/stop auto-sync
watch(user, async (newUser, oldUser) => {
  if (newUser && !oldUser) {
    // User just logged in - start auto-sync
    const result = await syncFromCloud();
    if (result.hasData) {
      // User has cloud data - they've used the app before, skip onboarding
      localStorage.setItem('starguide_onboarding_complete', 'true');
    } else {
      await migrateLocalToCloud();
    }
    startAutoSync();
  } else if (!newUser && oldUser) {
    // User just logged out - stop auto-sync
    stopAutoSync();
  }
});

// Load roster and settings from localStorage
// Handles migration from legacy format (ownership string) to new format (investment object)
const loadRoster = () => {
  try {
    const saved = localStorage.getItem(ROSTER_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as [string, OwnershipStatus | UserCharacterInvestment][];

      // Check if migration is needed (legacy format uses strings)
      if (needsMigration(parsed)) {
        console.log('Migrating roster to new investment format...');
        const migrated = migrateRoster(parsed);
        roster.value = new Map(migrated);
        // Save immediately to persist migration
        saveRoster();
        console.log('Roster migration complete');
      } else {
        roster.value = new Map(parsed as [string, UserCharacterInvestment][]);
      }
    }
    const includePlanning = localStorage.getItem(INCLUDE_PLANNING_KEY);
    if (includePlanning !== null) {
      includePlanningInTeams.value = includePlanning === 'true';
    }
  } catch (e) {
    console.warn('Failed to load roster from localStorage:', e);
  }
};

// Save roster to localStorage
const saveRoster = () => {
  try {
    const entries = Array.from(roster.value.entries());
    localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify(entries));
  } catch (e) {
    console.warn('Failed to save roster to localStorage:', e);
  }
};

// Watch for roster changes and save
watch(roster, () => {
  saveRoster();
}, { deep: true });

// Watch for includePlanningInTeams setting changes and save
watch(includePlanningInTeams, (newVal) => {
  localStorage.setItem(INCLUDE_PLANNING_KEY, String(newVal));
});

// Load favorited teams from localStorage
const loadFavoritedTeams = () => {
  try {
    const saved = localStorage.getItem(FAVORITED_TEAMS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as string[][];
      favoritedTeams.value = parsed;
    }
  } catch (e) {
    console.warn('Failed to load favorited teams from localStorage:', e);
  }
};

// Save favorited teams to localStorage
const saveFavoritedTeams = () => {
  try {
    localStorage.setItem(FAVORITED_TEAMS_KEY, JSON.stringify(favoritedTeams.value));
  } catch (e) {
    console.warn('Failed to save favorited teams to localStorage:', e);
  }
};

// Watch for favorited teams changes and save
watch(favoritedTeams, () => {
  saveFavoritedTeams();
}, { deep: true });

// Check if a team is favorited (by character IDs)
const isTeamFavorited = (team: GeneratedTeam): boolean => {
  const teamKey = [...team.characters.map(c => c.id)].sort().join(',');
  return favoritedTeams.value.some(fav => [...fav].sort().join(',') === teamKey);
};

// Toggle favorite for a team
const toggleTeamFavorite = (team: GeneratedTeam) => {
  const teamIds = team.characters.map(c => c.id);
  const teamKey = [...teamIds].sort().join(',');

  const existingIndex = favoritedTeams.value.findIndex(
    fav => [...fav].sort().join(',') === teamKey
  );

  if (existingIndex >= 0) {
    // Unfavorite: remove from favorited teams
    const newFavorited = [...favoritedTeams.value];
    newFavorited.splice(existingIndex, 1);
    favoritedTeams.value = newFavorited;
  } else {
    // Favorite: add to favorited teams
    favoritedTeams.value = [...favoritedTeams.value, teamIds];
  }
};

// NOTE: Browser back button is now handled by vue-router automatically
// The old handlePopState function is no longer needed

// Initialize on mount
onMounted(async () => {
  // Load saved roster from localStorage first (for fast initial load)
  loadRoster();

  // Load favorited teams
  loadFavoritedTeams();

  // Initialize auth listener
  initAuthListener();

  // If user is already logged in, sync from cloud
  // Wait a bit for auth state to be determined
  setTimeout(async () => {
    if (user.value) {
      const result = await syncFromCloud();
      if (result.hasData) {
        // Cloud data loaded successfully - user has used app before, skip onboarding
        localStorage.setItem('starguide_onboarding_complete', 'true');
        startAutoSync();
      } else {
        // No cloud data yet, migrate local to cloud
        await migrateLocalToCloud();
        startAutoSync();
      }
      // Fetch user's profile for navigation
      fetchOwnProfile(user.value.id);
    }
  }, 500);

  // Staggered load animation
  setTimeout(() => {
    isLoaded.value = true;
  }, 100);

  // Mobile responsive listener
  const handleResize = () => {
    windowWidth.value = window.innerWidth;
  };
  window.addEventListener('resize', handleResize);

  // NOTE: Browser history is now handled by vue-router automatically

  onUnmounted(() => {
    window.removeEventListener('resize', handleResize);
    cleanupAuthListener();
    stopAutoSync();
  });
});

// Scroll to top and initialize composition when character changes
watch(selectedCharacter, (newChar) => {
  if (newChar) {
    nextTick(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Initialize composition selector with primary composition
    if (hasCompositions(newChar)) {
      const primary = getPrimaryComposition(newChar);
      selectedCompositionId.value = primary?.id || newChar.compositions?.[0]?.id || null;
    } else {
      selectedCompositionId.value = null;
    }
  }
  // NOTE: Browser history is now handled by vue-router automatically
});

// ==================
// SIDEBAR
// ==================

const charactersByTier = computed(() => {
  const tiers: TierRating[] = ['T-1', 'T-0.5', 'T0', 'T0.5', 'T1', 'T1.5', 'T2', 'T3', 'T4', 'T5'];
  const grouped: Record<string, Character[]> = {};
  const query = searchQuery.value.toLowerCase().trim();

  for (const tier of tiers) {
    const filtered = characters
      .filter(c => getCharacterTier(c.id) === tier)
      .filter(c => {
        // Search filter
        if (query && !c.name.toLowerCase().includes(query)) return false;
        // Ownership filter
        if (sidebarFilter.value === 'all') return true;
        if (sidebarFilter.value === 'owned') return isOwned(c.id);
        if (sidebarFilter.value === 'unowned') return !isOwned(c.id);
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    if (filtered.length > 0) {
      grouped[tier] = filtered;
    }
  }

  return grouped;
});

// Joke characters grouped by tier (always shown at end of each tier)
const jokeCharactersByTier = computed(() => {
  const grouped: Record<string, JokeCharacter[]> = {};
  const query = searchQuery.value.toLowerCase().trim();

  for (const joke of jokeCharacters) {
    // Apply search filter to joke characters too
    if (query && !joke.name.toLowerCase().includes(query)) continue;
    // Only show joke characters when filter is 'all' (they're never owned/unowned)
    if (sidebarFilter.value !== 'all') continue;

    if (!grouped[joke.tier]) {
      grouped[joke.tier] = [];
    }
    grouped[joke.tier]!.push(joke);
  }

  return grouped;
});

// Check if a tier has any characters (real or joke)
const tierHasContent = (tier: string) => {
  const realChars = charactersByTier.value[tier];
  const jokeChars = jokeCharactersByTier.value[tier];
  return (realChars && realChars.length > 0) || (jokeChars && jokeChars.length > 0);
};

// Get total count for a tier (real + joke)
const getTierCount = (tier: string) => {
  const realCount = charactersByTier.value[tier]?.length ?? 0;
  const jokeCount = jokeCharactersByTier.value[tier]?.length ?? 0;
  return realCount + jokeCount;
};

// All tiers that have content (for iteration)
const allTiers: TierRating[] = ['T-1', 'T-0.5', 'T0', 'T0.5', 'T1', 'T1.5', 'T2', 'T3', 'T4', 'T5'];
const tiersWithContent = computed(() => {
  return allTiers.filter(tier => tierHasContent(tier));
});

const ownedCount = computed(() => {
  return characters.filter(c => isOwned(c.id)).length;
});

// Total filtered character count (for search results)
const filteredCharacterCount = computed(() => {
  return Object.values(charactersByTier.value).reduce((sum, chars) => sum + chars.length, 0);
});

// All owned characters for Team Builder
const ownedCharacters = computed(() => {
  return characters.filter(c => isOwned(c.id));
});

// ==================
// OWNERSHIP & INVESTMENT
// ==================

const isOwned = (characterId: string): boolean => {
  const investment = roster.value.get(characterId);
  if (!investment) return false;
  if (investment.ownership === 'owned') return true;
  if (investment.ownership === 'concept') return includePlanningInTeams.value;
  return false;
};

const getOwnership = (characterId: string): OwnershipStatus => {
  const investment = roster.value.get(characterId);
  return investment?.ownership || 'none';
};

const getInvestment = (characterId: string): UserCharacterInvestment | undefined => {
  return roster.value.get(characterId) || undefined;
};
// Mark as used - will be used in Phase 11 (Investment Input UI)
void getInvestment;

const setInvestment = (characterId: string, investment: Partial<UserCharacterInvestment>) => {
  const current = roster.value.get(characterId) || createDefaultInvestment('none');
  const updated: UserCharacterInvestment = {
    ...current,
    ...investment,
  };

  // Always save investment data, even for unowned characters (for planning purposes)
  // Only delete if explicitly setting ownership to 'none' AND no investment data exists
  if (updated.ownership === 'none' && updated.eidolonLevel === 0 && !updated.lightConeId) {
    roster.value.delete(characterId);
  } else {
    roster.value.set(characterId, updated);
  }
  roster.value = new Map(roster.value);
};
// Mark as used - will be used in Phase 11 (Investment Input UI)
void setInvestment;

const toggleOwnership = (characterId: string) => {
  const current = roster.value.get(characterId);
  const currentOwnership = current?.ownership || 'none';
  const nextOwnership: OwnershipStatus =
    currentOwnership === 'none' ? 'owned' :
    currentOwnership === 'owned' ? 'concept' : 'none';

  if (nextOwnership === 'none') {
    roster.value.delete(characterId);
  } else {
    // Preserve investment data when toggling ownership
    const updated: UserCharacterInvestment = current
      ? { ...current, ownership: nextOwnership }
      : createDefaultInvestment(nextOwnership);
    roster.value.set(characterId, updated);
  }
  roster.value = new Map(roster.value);
};

const handleRosterOwnershipToggle = (characterId: string, newStatus: OwnershipStatus) => {
  if (newStatus === 'none') {
    roster.value.delete(characterId);
  } else {
    const existing = roster.value.get(characterId);
    const updated: UserCharacterInvestment = existing
      ? { ...existing, ownership: newStatus }
      : createDefaultInvestment(newStatus);
    roster.value.set(characterId, updated);
  }
  roster.value = new Map(roster.value);
};

// Long-press handling for mobile ownership toggle
const longPressTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const longPressCharacterId = ref<string | null>(null);
const longPressTriggered = ref(false); // Track if long-press was triggered

const handleTouchStart = (characterId: string) => {
  // Clear any existing timer first
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value);
  }

  longPressCharacterId.value = characterId;
  longPressTriggered.value = false;

  longPressTimer.value = setTimeout(() => {
    longPressTriggered.value = true;
    toggleOwnership(characterId);
    // Haptic feedback if available
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
    // Clear timer reference after triggering
    longPressTimer.value = null;
    longPressCharacterId.value = null;
  }, 300); // 300ms long-press threshold
};

const handleTouchEnd = () => {
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value);
    longPressTimer.value = null;
  }
  longPressCharacterId.value = null;
};

const handleTouchMove = () => {
  // Cancel long-press if finger moves
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value);
    longPressTimer.value = null;
  }
  longPressCharacterId.value = null;
};

// Modified character select to prevent click after long-press
const handleMobileCharacterSelect = (character: Character) => {
  // If long-press just triggered, don't also select
  if (longPressTriggered.value) {
    longPressTriggered.value = false;
    return;
  }
  handleCharacterSelect(character);
};

// ==================
// TEAM GENERATION
// ==================

// Check if selected character is a support (Amplifier/Sustain)
const isSelectedCharacterSupport = computed((): boolean => {
  if (!selectedCharacter.value) return false;
  const char = selectedCharacter.value;
  return !char.roles.includes('DPS') && !char.roles.includes('Support DPS');
});

// My teams for DPS characters
const myTeamsDPS = computed((): GeneratedTeam[] => {
  if (!selectedCharacter.value || isSelectedCharacterSupport.value) return [];

  const ownedChars = characters.filter(c => isOwned(c.id));
  const char = selectedCharacter.value;

  // Include selected character in pool even if not owned
  const availableChars = isOwned(char.id)
    ? ownedChars
    : [...ownedChars, char];

  // DPS: generate teams with this character as focal
  // If a specific composition is selected, only generate teams for that composition
  if (selectedCompositionId.value && hasCompositions(char)) {
    return generateTeams(char, availableChars, {
      maxTeams: 12,
      gameMode: gameMode.value,
      compositionId: selectedCompositionId.value,
      getInvestment,
    });
  }

  // No composition selected but character has compositions: generate for all and combine
  if (hasCompositions(char)) {
    const allTeams: GeneratedTeam[] = [];
    const seenTeamKeys = new Set<string>();

    for (const comp of char.compositions!) {
      const compTeams = generateTeams(char, availableChars, {
        maxTeams: 10,
        gameMode: gameMode.value,
        compositionId: comp.id,
        getInvestment,
      });

      for (const team of compTeams) {
        const teamKey = [...team.characters.map(c => c.id)].sort().join(',');
        if (!seenTeamKeys.has(teamKey)) {
          seenTeamKeys.add(teamKey);
          allTeams.push(team);
        }
      }
    }

    allTeams.sort((a, b) => b.score - a.score);
    return allTeams.slice(0, 12);
  }

  // Legacy: no compositions, use existing behavior
  return generateTeams(char, availableChars, { maxTeams: 10, gameMode: gameMode.value, getInvestment });
});

// My teams for Support characters (returns two arrays: focal and supporting)
const myTeamsSupport = computed((): SupportTeamResult => {
  if (!selectedCharacter.value || !isSelectedCharacterSupport.value) {
    return { focalTeams: [], supportingTeams: [] };
  }

  const ownedChars = characters.filter(c => isOwned(c.id));
  const char = selectedCharacter.value;

  return generateTeamsForSupport(char, ownedChars, characters, { maxTeams: 12, gameMode: gameMode.value, getInvestment });
});

// Combined my teams (for backwards compatibility with displayedTeams)
const myTeams = computed((): GeneratedTeam[] => {
  if (isSelectedCharacterSupport.value) {
    // For supports, combine both arrays for backwards compatibility
    return [...myTeamsSupport.value.focalTeams, ...myTeamsSupport.value.supportingTeams];
  }
  return myTeamsDPS.value;
});

// Selected team based on active tab (My Teams only now)
// Sorts favorited teams to the top, maintaining ranking order within groups
const displayedTeams = computed((): GeneratedTeam[] => {
  if (activeTab.value !== 'my-teams') return [];

  const teams = myTeams.value;

  // Create a helper to get team key for favorite lookup
  const getTeamKey = (team: GeneratedTeam) =>
    [...team.characters.map(c => c.id)].sort().join(',');

  // Create a Set of favorited team keys for fast lookup
  const favoritedKeys = new Set(
    favoritedTeams.value.map(teamIds => [...teamIds].sort().join(','))
  );

  // Separate into favorited and non-favorited, preserving original order
  const favorited: GeneratedTeam[] = [];
  const notFavorited: GeneratedTeam[] = [];

  for (const team of teams) {
    if (favoritedKeys.has(getTeamKey(team))) {
      favorited.push(team);
    } else {
      notFavorited.push(team);
    }
  }

  // Favorited teams first, then the rest
  return [...favorited, ...notFavorited];
});

// Best teams for the selected composition (or all if none selected)
import type { BestTeam } from './types';
const characterBestTeams = computed((): BestTeam[] => {
  if (!selectedCharacter.value) return [];

  const teams: BestTeam[] = [];
  const seenNames = new Set<string>();

  // If a specific composition is selected, only get teams from that composition
  if (selectedCompositionId.value && selectedCharacter.value.compositions) {
    const selectedComp = getCompositionById(selectedCharacter.value, selectedCompositionId.value);
    if (selectedComp?.teams) {
      for (const team of selectedComp.teams) {
        if (!seenNames.has(team.name)) {
          seenNames.add(team.name);
          teams.push(team);
        }
      }
    }
    return teams.slice(0, 6);
  }

  // Fallback: Get teams from all compositions (for characters without compositions or no selection)
  if (selectedCharacter.value.compositions) {
    for (const comp of selectedCharacter.value.compositions) {
      if (comp.teams) {
        for (const team of comp.teams) {
          if (!seenNames.has(team.name)) {
            seenNames.add(team.name);
            teams.push(team);
          }
        }
      }
    }
  }

  return teams.slice(0, 6); // Limit to 6 teams
});

// ==================
// UI HELPERS
// ==================

const elementColors: Record<string, string> = {
  Physical: '#c4c4c4',
  Fire: '#f4634e',
  Ice: '#47c7fd',
  Lightning: '#d376f0',
  Wind: '#5fe8b6',
  Quantum: '#625afa',
  Imaginary: '#f3d86b',
};

// selectedElementColor is available for potential future use
const _selectedElementColor = computed(() => {
  if (!selectedCharacter.value) return '#ffffff';
  return elementColors[selectedCharacter.value.element] || '#ffffff';
});
void _selectedElementColor;

const handleMobileBackButton = () => {
  // Vue router handles back navigation natively
  selectCharacter(null);
};

const handleCharacterSelect = (character: Character) => {
  if (selectedCharacter.value?.id === character.id) {
    // Deselecting - use router to go back to home
    selectCharacter(null);
  } else {
    selectCharacter(character);
  }
};

const handleOnboardingViewChange = (newViewMode: 'characters' | 'best-teams' | 'pull-advisor' | 'banner-advisor') => {
  setViewMode(newViewMode);
};

const handleOnboardingTabChange = (tab: 'teammates' | 'my-teams' | 'investment') => {
  activeTab.value = tab;
};

// Profile click handler: navigate to own profile or setup
const handleProfileClick = () => {
  if (hasProfile.value && ownUsername.value) {
    setViewMode('profile', { username: ownUsername.value });
  } else {
    setViewMode('profile', { username: null }); // Goes to /profile/setup
  }
};

// Mobile view change handler (handles profile mode specially)
const handleMobileViewChange = (mode: 'characters' | 'best-teams' | 'pull-advisor' | 'banner-advisor' | 'profile' | 'admin' | 'roster') => {
  if (mode === 'profile') {
    handleProfileClick();
  } else {
    setViewMode(mode);
  }
};

// calculateTeamTier is available but currently unused - may be needed for future features
const _calculateTeamTier = (team: GeneratedTeam): TierRating => {
  const scores = team.characters.map(c => {
    const tier = getCharacterTier(c.id);
    return TIER_SCORES[tier];
  });
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

  if (avg >= 95) return 'T0';
  if (avg >= 85) return 'T0.5';
  if (avg >= 75) return 'T1';
  if (avg >= 65) return 'T1.5';
  if (avg >= 55) return 'T2';
  if (avg >= 45) return 'T3';
  if (avg >= 35) return 'T4';
  return 'T5';
};
void _calculateTeamTier; // Suppress unused warning

// Check if character is selected
const canGenerateTeams = computed(() => {
  return selectedCharacter.value !== null;
});

// Check if selected character is DPS (can generate "My Teams")
const isDPSCharacter = computed(() => {
  if (!selectedCharacter.value) return false;
  return selectedCharacter.value.roles.includes('DPS') ||
         selectedCharacter.value.roles.includes('Support DPS');
});

// Role icons (new Prydwen roles) - available for components
const _roleIcons: Record<string, string> = {
  'DPS': '⚔️',
  'Support DPS': '🗡️',
  'Amplifier': '✨',
  'Sustain': '💚',
};
void _roleIcons;

// Get tier gradient style (new T0-T5 system)
const getTierGradient = (tier: string) => {
  const gradients: Record<string, string> = {
    'T0': 'linear-gradient(135deg, #ff9500 0%, #ff6b00 100%)',      // Orange - Apex
    'T0.5': 'linear-gradient(135deg, #ffd000 0%, #ffb800 100%)',    // Gold
    'T1': 'linear-gradient(135deg, #a855f7 0%, #8b5cf6 100%)',      // Purple
    'T1.5': 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',    // Pink
    'T2': 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',      // Blue
    'T3': 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',      // Green
    'T4': 'linear-gradient(135deg, #64748b 0%, #475569 100%)',      // Slate
    'T5': 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',      // Gray
  };
  return gradients[tier] || gradients['T5'];
};
</script>

<template>
  <div class="min-h-screen relative overflow-hidden">
    <!-- Background and ambient effects (hidden on admin pages) -->
    <template v-if="!isAdminPage">
      <Starfield />

      <!-- Ambient glow effects (hidden on mobile for performance) -->
      <div class="fixed inset-0 pointer-events-none z-0 hide-mobile">
        <div class="absolute top-0 left-1/4 w-[600px] h-[600px] bg-purple-500/10 rounded-full blur-[150px]"></div>
        <div class="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-stellar-500/10 rounded-full blur-[120px]"></div>
      </div>

      <!-- Animation Preloader - forces browser to compile CSS animations on initial load -->
      <div class="animation-preloader" aria-hidden="true">
        <div class="animate-fade-in"></div>
        <div class="animate-scale-in"></div>
        <div class="animate-slide-up"></div>
        <div class="animate-slide-in-right"></div>
        <div class="transition-all duration-300"></div>
        <div class="transition-all duration-200"></div>
      </div>
    </template>

    <!-- Main App Content (hidden on admin pages) -->
    <div v-if="!isAdminPage" class="relative z-10 flex min-h-screen">
      <!-- Sidebar (hidden on mobile) -->
      <aside
        class="sidebar hidden md:flex flex-shrink-0 bg-void-900/90 backdrop-blur-xl border-r border-white/5 flex-col transition-all duration-300"
        :class="{
          'sidebar-loaded': isLoaded,
          'sidebar-collapsed': viewMode !== 'characters',
          'w-80': viewMode === 'characters',
          'w-16': viewMode !== 'characters'
        }"
      >
        <!-- Header -->
        <div class="p-5 border-b border-white/5">
          <!-- Logo and User Button -->
          <div class="flex items-center justify-between mb-4" :class="{ 'justify-center': viewMode !== 'characters' }">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-stellar-500 to-stellar-600 flex items-center justify-center shadow-lg shadow-stellar-500/20 flex-shrink-0">
                <span class="text-xl">✦</span>
              </div>
              <div v-if="viewMode === 'characters'">
                <h1 class="font-display text-xl font-bold text-white tracking-wide">StarGuide</h1>
                <p class="text-xs text-white/40">Team Builder</p>
              </div>
            </div>
            <!-- User Button (only show when sidebar is expanded) -->
            <UserButton
              v-if="viewMode === 'characters'"
              :user="user"
              :is-loading="isAuthLoading"
              :sync-status="syncStatus"
              @open-auth="isAuthModalOpen = true"
              @open-settings="isSettingsModalOpen = true"
              @sign-out="handleSignOut"
            />
          </div>

          <!-- View Mode Toggle -->
          <div class="flex flex-col gap-1.5" data-onboarding="view-toggles">
            <button
              @click="setViewMode('characters')"
              class="sidebar-nav-btn w-full px-3 py-2.5 text-xs font-medium rounded-lg transition-all duration-300 flex items-center gap-2"
              :class="[
                viewMode === 'characters'
                  ? 'bg-stellar-500/20 text-stellar-400 shadow-sm shadow-stellar-500/10 border border-stellar-500/30'
                  : 'text-white/50 hover:text-white/70 hover:bg-white/5 border border-transparent',
                { 'justify-center px-0': viewMode !== 'characters' }
              ]"
              :data-tooltip="viewMode !== 'characters' ? 'Characters' : ''"
            >
              <span>👤</span>
              <span v-if="viewMode === 'characters'">Characters</span>
            </button>
            <button
              @click="setViewMode('best-teams')"
              class="sidebar-nav-btn w-full px-3 py-2.5 text-xs font-medium rounded-lg transition-all duration-300 flex items-center gap-2"
              :class="[
                viewMode === 'best-teams'
                  ? 'bg-indigo-500/20 text-indigo-400 shadow-sm shadow-indigo-500/10 border border-indigo-500/30'
                  : 'text-white/50 hover:text-white/70 hover:bg-white/5 border border-transparent',
                { 'justify-center px-0': viewMode !== 'characters' }
              ]"
              :data-tooltip="viewMode !== 'characters' ? 'Best Teams' : ''"
            >
              <span>◇</span>
              <span v-if="viewMode === 'characters'">Best Teams</span>
            </button>
            <button
              @click="setViewMode('pull-advisor')"
              class="sidebar-nav-btn w-full px-3 py-2.5 text-xs font-medium rounded-lg transition-all duration-300 flex items-center gap-2"
              :class="[
                viewMode === 'pull-advisor'
                  ? 'bg-emerald-500/20 text-emerald-400 shadow-sm shadow-emerald-500/10 border border-emerald-500/30'
                  : 'text-white/50 hover:text-white/70 hover:bg-white/5 border border-transparent',
                { 'justify-center px-0': viewMode !== 'characters' }
              ]"
              :data-tooltip="viewMode !== 'characters' ? 'Pull Advisor' : ''"
            >
              <span>◎</span>
              <span v-if="viewMode === 'characters'">Pull Advisor</span>
            </button>
            <button
              @click="setViewMode('banner-advisor')"
              class="sidebar-nav-btn w-full px-3 py-2.5 text-xs font-medium rounded-lg transition-all duration-300 flex items-center gap-2"
              :class="[
                viewMode === 'banner-advisor'
                  ? 'bg-amber-500/20 text-amber-400 shadow-sm shadow-amber-500/10 border border-amber-500/30'
                  : 'text-white/50 hover:text-white/70 hover:bg-white/5 border border-transparent',
                { 'justify-center px-0': viewMode !== 'characters' }
              ]"
              :data-tooltip="viewMode !== 'characters' ? 'Banner Advisor' : ''"
            >
              <span>✦</span>
              <span v-if="viewMode === 'characters'">Banner Advisor</span>
            </button>
            <button
              @click="handleProfileClick"
              class="sidebar-nav-btn w-full px-3 py-2.5 text-xs font-medium rounded-lg transition-all duration-300 flex items-center gap-2"
              :class="[
                viewMode === 'profile'
                  ? 'bg-purple-500/20 text-purple-400 shadow-sm shadow-purple-500/10 border border-purple-500/30'
                  : 'text-white/50 hover:text-white/70 hover:bg-white/5 border border-transparent',
                { 'justify-center px-0': viewMode !== 'characters' }
              ]"
              :data-tooltip="viewMode !== 'characters' ? 'My Profile' : ''"
            >
              <span>⬡</span>
              <span v-if="viewMode === 'characters'">My Profile</span>
            </button>
          </div>

          <!-- Roster Management button -->
          <div class="border-t border-white/5 pt-2 mt-2">
            <button
              @click="setViewMode('roster')"
              class="sidebar-nav-btn w-full px-3 py-2.5 text-xs font-medium rounded-lg transition-all duration-300 flex items-center gap-2"
              :class="[
                viewMode === 'roster'
                  ? 'bg-cyan-500/20 text-cyan-400 shadow-sm shadow-cyan-500/10 border border-cyan-500/30'
                  : 'text-white/50 hover:text-white/70 hover:bg-white/5 border border-transparent',
                { 'justify-center px-0': viewMode !== 'characters' }
              ]"
              :data-tooltip="viewMode !== 'characters' ? 'Manage Roster' : ''"
            >
              <span class="text-sm">📋</span>
              <span v-if="viewMode === 'characters'" class="truncate">Manage Roster</span>
            </button>
          </div>
        </div>

        <!-- Filter Buttons - Only show in Characters view -->
        <div v-if="viewMode === 'characters'" class="p-4 border-b border-white/5">
          <!-- Search Bar -->
          <div class="relative mb-3">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search characters..."
              class="w-full px-4 py-2.5 pl-10 bg-void-800/50 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:border-stellar-500/50 focus:ring-1 focus:ring-stellar-500/20 transition-all duration-200"
            />
            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <button
              v-if="searchQuery"
              @click="searchQuery = ''"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="flex gap-1 p-1 bg-void-800/50 rounded-lg">
            <button
              v-for="filter in ['all', 'owned', 'unowned'] as const"
              :key="filter"
              @click="sidebarFilter = filter"
              class="flex-1 px-3 py-2 text-xs font-medium rounded-md transition-all duration-300"
              :class="sidebarFilter === filter
                ? 'bg-stellar-500/20 text-stellar-400 shadow-sm shadow-stellar-500/10'
                : 'text-white/50 hover:text-white/70 hover:bg-white/5'"
            >
              {{ filter.charAt(0).toUpperCase() + filter.slice(1) }}
            </button>
          </div>

          <!-- Tier Sort Mode -->
          <div class="flex gap-1 p-1 bg-void-800/50 rounded-lg mt-2">
            <button
              v-for="mode in [
                { key: 'avg', label: 'AVG' },
                { key: 'moc', label: 'MoC' },
                { key: 'pf', label: 'PF' },
                { key: 'as', label: 'AS' }
              ] as const"
              :key="mode.key"
              @click="tierSortMode = mode.key"
              class="flex-1 px-2 py-2 text-xs font-medium rounded-md transition-all duration-300"
              :class="tierSortMode === mode.key
                ? 'bg-purple-500/20 text-purple-400 shadow-sm shadow-purple-500/10'
                : 'text-white/50 hover:text-white/70 hover:bg-white/5'"
            >
              {{ mode.label }}
            </button>
          </div>

          <div class="text-xs text-white/40 mt-3 text-center font-mono">
            <template v-if="searchQuery">
              <span class="text-stellar-400">{{ filteredCharacterCount }}</span> found
            </template>
            <template v-else>
              <span class="text-stellar-400">{{ ownedCount }}</span> / {{ characters.length }} owned
            </template>
          </div>

          <!-- Legend and Tip -->
          <div class="ownership-legend-panel" data-onboarding="ownership-legend">
            <div class="legend-title">Roster Status</div>
            <div class="legend-items">
              <div class="legend-item">
                <span class="ownership-badge-owned">✓</span>
                <span class="legend-label">Owned</span>
              </div>
              <div class="legend-item">
                <span class="ownership-badge-concept">?</span>
                <span class="legend-label">Planning to Pull</span>
              </div>
            </div>
            <p class="legend-hint">
              Right-click to toggle status
            </p>
            <!-- Planning toggle -->
            <label class="planning-toggle">
              <input
                type="checkbox"
                v-model="includePlanningInTeams"
                class="planning-toggle-input"
              />
              <span class="planning-toggle-switch"></span>
              <span class="planning-toggle-label">Include planned in teams</span>
            </label>
          </div>

          <!-- Tier Disclaimer -->
          <p class="text-xs text-white/40 mt-3 text-center leading-tight px-1">
            Tiers assume optimal teams. Your actual results depend on roster and content.
          </p>
        </div>

        <!-- Character List - Only show in Characters view -->
        <div v-if="viewMode === 'characters'" class="flex-1 overflow-hidden p-4 space-y-5" data-onboarding="character-grid">
          <div
            v-for="(tier, tierIndex) in tiersWithContent"
            :key="tier"
            class="tier-group"
            :style="{ '--tier-delay': `${tierIndex * 0.1}s` }"
          >
            <div class="flex items-center gap-2 mb-3">
              <span
                class="px-2 py-0.5 text-xs font-bold rounded-md"
                :style="{ background: getTierGradient(tier) }"
              >
                {{ tier }}
              </span>
              <div class="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent"></div>
              <span class="text-xs text-white/30">{{ getTierCount(tier) }}</span>
            </div>
            <div class="grid grid-cols-4 gap-2 p-1 pt-2">
              <!-- Real characters -->
              <div
                v-for="(char, charIndex) in (charactersByTier[tier] || [])"
                :key="char.id"
                @click="handleCharacterSelect(char)"
                @contextmenu.prevent="toggleOwnership(char.id)"
                class="cursor-pointer transform transition-all duration-200 hover:scale-110 hover:z-10"
                :style="{ '--char-delay': `${charIndex * 0.02}s` }"
              >
                <CharacterCard
                  :character="char"
                  :ownership="getOwnership(char.id)"
                  :selected="selectedCharacter?.id === char.id"
                  size="sm"
                />
              </div>
              <!-- Joke characters (always at end, unclickable) -->
              <div
                v-for="joke in (jokeCharactersByTier[tier] || [])"
                :key="joke.id"
                class="cursor-not-allowed opacity-90"
              >
                <CharacterCard
                  :character="toCharacterLike(joke)"
                  :image-override="joke.image"
                  size="sm"
                />
              </div>
            </div>
          </div>
        </div>
      </aside>

      <!-- Mobile Tab Bar -->
      <MobileTabBar
        v-if="isMobile"
        :view-mode="viewMode"
        @change-view="handleMobileViewChange"
        class="md:hidden"
      />

      <!-- Main Content -->
      <main class="flex-1 p-4 md:p-6 lg:p-8 pb-20 md:pb-8 overflow-x-hidden">
        <!-- Best Teams View (cached with KeepAlive) -->
        <KeepAlive>
          <BestTeamsView
            v-if="viewMode === 'best-teams'"
            :characters="characters"
            :owned-characters="ownedCharacters"
            :get-ownership="getOwnership"
            :get-investment="getInvestment"
            :game-mode="gameMode"
            :locked-teams="lockedTeams"
            :favorited-teams="favoritedTeams"
            class="max-w-6xl mx-auto overflow-visible"
            @update:locked-teams="lockedTeams = $event"
            @update:favorited-teams="favoritedTeams = $event"
          />
        </KeepAlive>

        <!-- Pull Advisor View (cached with KeepAlive) -->
        <KeepAlive>
          <PullAdvisorView
            v-if="viewMode === 'pull-advisor'"
            :characters="characters"
            :owned-characters="ownedCharacters"
            :get-ownership="getOwnership"
            :get-investment="getInvestment"
            :game-mode="gameMode"
            class="max-w-6xl mx-auto overflow-visible"
            @select-character="(id) => selectCharacter(characters.find(c => c.id === id) || null)"
          />
        </KeepAlive>

        <!-- Banner Advisor View (cached with KeepAlive) -->
        <KeepAlive>
          <BannerAdvisorView
            v-if="viewMode === 'banner-advisor'"
            :characters="characters"
            :owned-characters="ownedCharacters"
            :get-ownership="getOwnership"
            :get-investment="getInvestment"
            :game-mode="gameMode"
            class="max-w-6xl mx-auto overflow-visible"
            @select-character="(id) => selectCharacter(characters.find(c => c.id === id) || null)"
          />
        </KeepAlive>

        <!-- Roster Management View -->
        <RosterView
          v-if="viewMode === 'roster'"
          :roster="roster"
          :game-mode="gameMode"
          @toggle-ownership="handleRosterOwnershipToggle"
          @select-character="selectCharacter"
          class="max-w-6xl mx-auto"
        />

        <!-- User Profile View (both own profile and public profiles) -->
        <UserProfile
          v-if="isProfilePage"
          :username="profileUsername ?? undefined"
          :user="user"
          :roster="roster"
          :on-open-auth="() => isAuthModalOpen = true"
          class="max-w-4xl mx-auto"
        />

        <!-- Character View - No Selection State -->
        <div
          v-if="viewMode === 'characters' && !selectedCharacter"
          class="h-full"
        >
          <!-- Mobile Character Browser -->
          <div v-if="isMobile" class="mobile-character-browser">
            <!-- Header -->
            <div class="flex items-center justify-between mb-4">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-stellar-500 to-stellar-600 flex items-center justify-center shadow-lg shadow-stellar-500/20 flex-shrink-0">
                  <span class="text-xl">✦</span>
                </div>
                <div>
                  <h1 class="font-display text-xl font-bold text-white tracking-wide">StarGuide</h1>
                  <p class="text-xs text-white/40">Select a character</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <!-- Mobile User Button -->
                <UserButton
                  :user="user"
                  :is-loading="isAuthLoading"
                  :sync-status="syncStatus"
                  @open-auth="isAuthModalOpen = true"
                  @open-settings="isSettingsModalOpen = true"
                  @sign-out="handleSignOut"
                />
              </div>
            </div>

            <!-- Mobile Search Bar -->
            <div class="relative mb-3">
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Search characters..."
                class="w-full px-4 py-2.5 pl-10 bg-void-800/50 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:border-stellar-500/50 focus:ring-1 focus:ring-stellar-500/20 transition-all duration-200"
              />
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <button
                v-if="searchQuery"
                @click="searchQuery = ''"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <!-- Filter tabs -->
            <div class="flex gap-1 p-1 bg-void-800/50 rounded-lg mb-2">
              <button
                v-for="filter in ['all', 'owned', 'unowned'] as const"
                :key="filter"
                @click="sidebarFilter = filter"
                class="flex-1 px-3 py-2 text-xs font-medium rounded-md transition-all duration-300"
                :class="sidebarFilter === filter
                  ? 'bg-stellar-500/20 text-stellar-400 shadow-sm shadow-stellar-500/10'
                  : 'text-white/50 hover:text-white/70 hover:bg-white/5'"
              >
                {{ filter.charAt(0).toUpperCase() + filter.slice(1) }}
              </button>
            </div>

            <!-- Roster Management Button -->
            <button
              @click="setViewMode('roster')"
              class="w-full py-2.5 text-xs font-medium rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 transition-all duration-200 hover:bg-cyan-500/20 mb-2 flex items-center justify-center gap-1.5"
            >
              <span>📋</span> Manage Roster
            </button>

            <!-- Tier Sort Mode -->
            <div class="flex gap-1 p-1 bg-void-800/50 rounded-lg mb-2">
              <button
                v-for="mode in [
                  { key: 'avg', label: 'AVG' },
                  { key: 'moc', label: 'MoC' },
                  { key: 'pf', label: 'PF' },
                  { key: 'as', label: 'AS' }
                ] as const"
                :key="mode.key"
                @click="tierSortMode = mode.key"
                class="flex-1 px-2 py-2 text-xs font-medium rounded-md transition-all duration-300"
                :class="tierSortMode === mode.key
                  ? 'bg-purple-500/20 text-purple-400 shadow-sm shadow-purple-500/10'
                  : 'text-white/50 hover:text-white/70 hover:bg-white/5'"
              >
                {{ mode.label }}
              </button>
            </div>

            <!-- Search Results Count (when searching) -->
            <div v-if="searchQuery" class="text-xs text-white/40 mb-3 text-center font-mono">
              <span class="text-stellar-400">{{ filteredCharacterCount }}</span> found
            </div>

            <!-- Ownership Legend (at top) -->
            <div class="ownership-legend-panel mb-4">
              <div class="legend-title">Roster Status</div>
              <div class="legend-items">
                <div class="legend-item">
                  <span class="ownership-badge-owned">✓</span>
                  <span class="legend-label">Owned</span>
                </div>
                <div class="legend-item">
                  <span class="ownership-badge-concept">?</span>
                  <span class="legend-label">Planning to Pull</span>
                </div>
              </div>
              <p class="legend-hint">
                Long-press to toggle status
              </p>
              <!-- Planning toggle -->
              <label class="planning-toggle">
                <input
                  type="checkbox"
                  v-model="includePlanningInTeams"
                  class="planning-toggle-input"
                />
                <span class="planning-toggle-switch"></span>
                <span class="planning-toggle-label">Include planned in teams</span>
              </label>
            </div>

            <!-- Tier Disclaimer -->
            <p class="text-xs text-white/40 mb-4 text-center leading-tight">
              Tiers assume optimal teams. Your actual results depend on roster and content.
            </p>

            <!-- Character Grid - Grouped by Tier (matching sidebar) -->
            <div class="mobile-tier-groups">
              <div
                v-for="tier in tiersWithContent"
                :key="tier"
                class="mobile-tier-group"
              >
                <!-- Tier Header -->
                <div class="flex items-center gap-2 mb-2">
                  <span
                    class="px-2 py-0.5 text-xs font-bold rounded-md"
                    :style="{ background: getTierGradient(tier) }"
                  >
                    {{ tier }}
                  </span>
                  <div class="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent"></div>
                  <span class="text-xs text-white/30">{{ getTierCount(tier) }}</span>
                </div>

                <!-- Characters in this tier -->
                <div class="grid grid-cols-5 gap-2 mb-4">
                  <!-- Real characters -->
                  <div
                    v-for="character in (charactersByTier[tier] || [])"
                    :key="character.id"
                    @click="handleMobileCharacterSelect(character)"
                    @touchstart.passive="handleTouchStart(character.id)"
                    @touchend="handleTouchEnd"
                    @touchmove.passive="handleTouchMove"
                    @touchcancel="handleTouchEnd"
                    @contextmenu.prevent
                    class="cursor-pointer transform transition-all duration-200"
                    :class="{ 'scale-95 opacity-70': longPressCharacterId === character.id }"
                  >
                    <CharacterCard
                      :character="character"
                      :ownership="getOwnership(character.id)"
                      :selected="false"
                      size="sm"
                    />
                  </div>
                  <!-- Joke characters (always at end, unclickable) -->
                  <div
                    v-for="joke in (jokeCharactersByTier[tier] || [])"
                    :key="joke.id"
                    class="cursor-not-allowed opacity-90"
                  >
                    <CharacterCard
                      :character="toCharacterLike(joke)"
                      :image-override="joke.image"
                      size="sm"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Desktop Empty State -->
          <div v-else>
            <div class="fixed inset-0 flex items-center justify-center pointer-events-none" style="left: 280px;">
              <div class="text-center empty-state pointer-events-auto" :class="{ 'empty-state-loaded': isLoaded }">
              <div class="relative inline-block mb-6">
                <div class="absolute inset-0 bg-stellar-500/20 rounded-full blur-2xl animate-pulse"></div>
                <div class="relative text-8xl opacity-30 animate-float">✦</div>
              </div>
              <h2 class="text-2xl font-display text-white/60 mb-2">Select a Character</h2>
              <p class="text-sm text-white/40 max-w-xs mx-auto">
                Click a character from the sidebar to explore their optimal team compositions
              </p>
              <div class="mt-6 flex items-center justify-center gap-2 text-xs text-white/30">
                <span class="px-2 py-1 bg-white/5 rounded">Left click</span>
                <span>Select</span>
                <span class="mx-2">·</span>
                <span class="px-2 py-1 bg-white/5 rounded">Right click</span>
                <span>Toggle ownership</span>
              </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Character Selected - New Layout -->
        <div v-if="viewMode === 'characters' && selectedCharacter" class="space-y-6 max-w-6xl mx-auto character-view">
          <!-- Mobile Back Button -->
          <button
            v-if="isMobile"
            @click="handleMobileBackButton"
            class="mobile-back-button"
          >
            <span>←</span>
            <span>Characters</span>
          </button>

          <!-- Character Header Component -->
          <div data-onboarding="character-header">
            <CharacterHeader
              :character="selectedCharacter"
              :ownership="getOwnership(selectedCharacter.id)"
            />
          </div>

          <!-- Restrictions Panel (if any) -->
          <RestrictionsPanel
            v-if="selectedCharacter.restrictions"
            :character="selectedCharacter"
          />

          <!-- Composition Selector (above tabs, affects all three) -->
          <CompositionSelector
            v-if="selectedCharacter"
            :character="selectedCharacter"
            :selected-composition-id="selectedCompositionId"
            :get-ownership="getOwnership"
            @update:selected-composition-id="selectedCompositionId = $event"
          />

          <!-- Tabs - Full-width segmented control -->
          <div v-if="canGenerateTeams" class="tabs-container" data-onboarding="main-tabs">
            <div class="segmented-control">
              <!-- Sliding background indicator -->
              <div
                class="segment-indicator"
                :class="'segment-' + activeTab"
              ></div>

              <!-- Investment tab -->
              <button
                v-if="selectedCharacter"
                @click="activeTab = 'investment'"
                class="segment-button"
                :class="{ active: activeTab === 'investment' }"
              >
                <span class="segment-icon">💎</span>
                <span class="segment-label">Investment</span>
              </button>

              <!-- Teammates tab -->
              <button
                @click="activeTab = 'teammates'"
                class="segment-button"
                :class="{ active: activeTab === 'teammates' }"
              >
                <span class="segment-icon">◈</span>
                <span class="segment-label">Teammates</span>
              </button>

              <!-- My Teams tab -->
              <button
                @click="activeTab = 'my-teams'"
                class="segment-button"
                :class="{ active: activeTab === 'my-teams' }"
              >
                <span class="segment-icon">👤</span>
                <span class="segment-label">My Teams</span>
              </button>
            </div>

            <!-- Composition context indicator -->
            <Transition name="composition-hint">
              <div
                v-if="selectedCompositionName && (activeTab === 'teammates' || activeTab === 'my-teams')"
                :key="selectedCompositionName"
                class="composition-hint"
              >
                <span class="hint-arrow">↳</span>
                <span class="hint-text">Using playstyle</span>
                <span class="hint-name">"{{ selectedCompositionName }}"</span>
              </div>
            </Transition>
          </div>

          <!-- Teammates Tab (NEW - uses TeammateSection) -->
          <div v-if="canGenerateTeams && activeTab === 'teammates'" data-onboarding="teammates-section">
            <TeammateSection
              :character="selectedCharacter"
              :get-ownership="getOwnership"
              :get-investment="getInvestment"
              :selected-composition-id="selectedCompositionId"
            />

            <!-- Best Teams from character data -->
            <div v-if="characterBestTeams.length > 0" class="mt-8" data-onboarding="best-teams-section">
              <div class="flex items-center gap-3 mb-4">
                <div class="header-icon-sm">
                  <span>🏆</span>
                </div>
                <div>
                  <h3 class="text-lg font-display font-bold text-white">Pre-Built Teams</h3>
                  <p class="text-sm text-white/50">Recommended team compositions from character data</p>
                </div>
              </div>

              <!-- Best Teams Layout -->
              <div class="teams-grid">
                <TeamCard
                  v-for="(team, index) in characterBestTeams"
                  :key="team.name"
                  :best-team="team"
                  :get-ownership="getOwnership"
                  :get-investment="getInvestment"
                  :focal-character-id="selectedCharacter.id"
                  :composition-id="selectedCompositionId || undefined"
                  :style="{ '--card-delay': `${index * 0.05}s` }"
                />
              </div>
            </div>
          </div>

          <!-- My Teams Tab (for DPS characters) -->
          <div
            v-if="canGenerateTeams && activeTab === 'my-teams' && isDPSCharacter"
            class="my-teams-section"
          >
            <!-- Section Header -->
            <div class="section-header-row">
              <div class="header-left">
                <div class="header-icon-container">
                  <span class="header-icon">👤</span>
                </div>
                <div class="header-text">
                  <h3 class="header-title">Your Teams</h3>
                  <p class="header-subtitle">Teams built from your owned characters for {{ selectedCharacter.name }}</p>
                </div>
              </div>
              <div class="header-stats">
                <span class="stat-value">{{ displayedTeams.length }}</span>
                <span class="stat-label">teams found</span>
              </div>
            </div>

            <!-- Empty State -->
            <div v-if="displayedTeams.length === 0" class="empty-state-panel">
              <div class="empty-icon">🔍</div>
              <h4 class="empty-title">Not Enough Characters</h4>
              <p class="empty-message">
                You need more owned characters to build a team. Check the Pull Advisor tab for recommendations.
              </p>
            </div>

            <!-- Teams Grid -->
            <div v-else class="teams-grid">
              <TeamCard
                v-for="(team, index) in displayedTeams"
                :key="`team-${index}`"
                :generated-team="team"
                :get-ownership="getOwnership"
                :get-investment="getInvestment"
                :focal-character-id="selectedCharacter.id"
                :favorited="isTeamFavorited(team)"
                :show-favorite-button="true"
                :game-mode="gameMode"
                @favorite-toggle="toggleTeamFavorite(team)"
                :style="{ '--item-delay': `${index * 0.08}s` }"
              />
            </div>
          </div>

          <!-- My Teams Tab (for Support characters - TWO SECTIONS) -->
          <div
            v-if="canGenerateTeams && activeTab === 'my-teams' && !isDPSCharacter"
            class="my-teams-section support-teams-section"
          >
            <!-- Section 1: Teams Built Around Support (Focal Teams) -->
            <div class="support-section focal-section" v-if="myTeamsSupport.focalTeams.length > 0 || myTeamsSupport.supportingTeams.length === 0">
              <div class="section-header-row">
                <div class="header-left">
                  <div class="header-icon-container focal-icon">
                    <span class="header-icon">⭐</span>
                  </div>
                  <div class="header-text">
                    <h3 class="header-title">Teams Built Around {{ selectedCharacter.name }}</h3>
                    <p class="header-subtitle">From {{ selectedCharacter.name }}'s own team compositions</p>
                  </div>
                </div>
                <div class="header-stats">
                  <span class="stat-value">{{ myTeamsSupport.focalTeams.length }}</span>
                  <span class="stat-label">teams</span>
                </div>
              </div>

              <!-- Empty State for Focal -->
              <div v-if="myTeamsSupport.focalTeams.length === 0" class="empty-state-panel compact">
                <div class="empty-icon">📋</div>
                <h4 class="empty-title">No Focal Compositions</h4>
                <p class="empty-message">
                  {{ selectedCharacter.name }} doesn't have their own team compositions yet, or requirements aren't met.
                </p>
              </div>

              <!-- Focal Teams Grid -->
              <div v-else class="teams-grid">
                <TeamCard
                  v-for="(team, index) in myTeamsSupport.focalTeams"
                  :key="`focal-${index}`"
                  :generated-team="team"
                  :get-ownership="getOwnership"
                  :get-investment="getInvestment"
                  :focal-character-id="selectedCharacter.id"
                  :favorited="isTeamFavorited(team)"
                  :show-favorite-button="true"
                  :game-mode="gameMode"
                  @favorite-toggle="toggleTeamFavorite(team)"
                  :style="{ '--item-delay': `${index * 0.08}s` }"
                />
              </div>
            </div>

            <!-- Section 2: Teams Where Support Supports (Supporting Teams) -->
            <div class="support-section supporting-section" v-if="myTeamsSupport.supportingTeams.length > 0 || myTeamsSupport.focalTeams.length === 0">
              <div class="section-header-row">
                <div class="header-left">
                  <div class="header-icon-container supporting-icon">
                    <span class="header-icon">🤝</span>
                  </div>
                  <div class="header-text">
                    <h3 class="header-title">Teams Where {{ selectedCharacter.name }} Supports</h3>
                    <p class="header-subtitle">From DPS compositions that want {{ selectedCharacter.name }}</p>
                  </div>
                </div>
                <div class="header-stats">
                  <span class="stat-value">{{ myTeamsSupport.supportingTeams.length }}</span>
                  <span class="stat-label">teams</span>
                </div>
              </div>

              <!-- Empty State for Supporting -->
              <div v-if="myTeamsSupport.supportingTeams.length === 0" class="empty-state-panel compact">
                <div class="empty-icon">🔍</div>
                <h4 class="empty-title">No DPS Want This Support</h4>
                <p class="empty-message">
                  None of your owned DPS characters specifically recommend {{ selectedCharacter.name }}. Try owning more DPS characters.
                </p>
              </div>

              <!-- Supporting Teams Grid -->
              <div v-else class="teams-grid">
                <TeamCard
                  v-for="(team, index) in myTeamsSupport.supportingTeams"
                  :key="`supporting-${index}`"
                  :generated-team="team"
                  :get-ownership="getOwnership"
                  :get-investment="getInvestment"
                  :focal-character-id="selectedCharacter.id"
                  :favorited="isTeamFavorited(team)"
                  :show-favorite-button="true"
                  :game-mode="gameMode"
                  @favorite-toggle="toggleTeamFavorite(team)"
                  :style="{ '--item-delay': `${index * 0.08}s` }"
                />
              </div>
            </div>
          </div>

          <!-- Investment Tab -->
          <div v-if="canGenerateTeams && activeTab === 'investment' && selectedCharacter" class="space-y-6">
            <!-- Mode Selector for Investment -->
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-400">Tier Mode:</span>
              <div class="flex gap-1 p-1 bg-void-800/50 rounded-lg">
                <button
                  v-for="mode in [
                    { key: 'avg', label: 'AVG' },
                    { key: 'moc', label: 'MoC' },
                    { key: 'pf', label: 'PF' },
                    { key: 'as', label: 'AS' }
                  ] as const"
                  :key="mode.key"
                  @click="tierSortMode = mode.key"
                  class="px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-300"
                  :class="tierSortMode === mode.key
                    ? 'bg-purple-500/20 text-purple-400 shadow-sm shadow-purple-500/10'
                    : 'text-white/50 hover:text-white/70 hover:bg-white/5'"
                >
                  {{ mode.label }}
                </button>
              </div>
            </div>

            <InvestmentPanel
              :character="selectedCharacter"
              :game-mode="tierSortMode"
              :current-investment="getInvestment(selectedCharacter.id) || undefined"
              @update:eidolon="(level) => selectedCharacter && setInvestment(selectedCharacter.id, { eidolonLevel: level })"
              @update:lightCone="(lcId, superimposition) => selectedCharacter && setInvestment(selectedCharacter.id, { lightConeId: lcId, lightConeSuperimposition: superimposition })"
            />
          </div>

        </div>
      </main>
    </div>

    <!-- Admin Views -->
    <AdminLayout v-else-if="isAdminPage && isContributor">
      <AdminDashboard v-if="route.name === 'admin-dashboard'" />
      <CharacterEditor v-else-if="route.name === 'admin-character'" />
      <UserManagement v-else-if="route.name === 'admin-users' && isAdmin" />
      <ReviewQueue v-else-if="route.name === 'admin-review' && isAdmin" />
      <ReviewEditor v-else-if="route.name === 'admin-review-edit' && isAdmin" />
      <!-- Fallback for admin-only pages when user is contributor but not admin -->
      <div v-else-if="!isAdmin" class="p-8 text-center">
        <p class="text-slate-400">This page requires admin privileges.</p>
        <router-link to="/admin" class="text-orange-400 hover:text-orange-300 mt-4 inline-block">
          Return to dashboard
        </router-link>
      </div>
    </AdminLayout>

    <!-- Fallback for non-contributor on admin route -->
    <div v-else-if="isAdminPage && !isContributor" class="flex items-center justify-center min-h-screen bg-slate-900">
      <div class="text-center">
        <p class="text-slate-400 mb-4">You don't have access to the admin panel.</p>
        <router-link to="/" class="text-orange-400 hover:text-orange-300">
          Return to home
        </router-link>
      </div>
    </div>

    <!-- Discord Button (hidden on admin pages) -->
    <DiscordButton v-if="!isAdminPage" />

    <!-- Feedback Widget (hidden on admin pages) -->
    <FeedbackWidget v-if="!isAdminPage" />

    <!-- Feedback Completion Notification (hidden on admin pages) -->
    <FeedbackNotification v-if="!isAdminPage" />

    <!-- Changelog Modal (hidden on admin pages) -->
    <ChangelogModal v-if="!isAdminPage" />

    <!-- Spotlight Onboarding (hidden on admin pages) -->
    <SpotlightOnboarding
      v-if="!isAdminPage"
      :roster="roster"
      :characters="characters"
      @change-view="handleOnboardingViewChange"
      @change-tab="handleOnboardingTabChange"
    />

    <!-- Survey Modal (hidden on admin pages) -->
    <SurveyModal v-if="!isAdminPage" />

    <!-- Auth Modal -->
    <AuthModal
      :force-open="isAuthModalOpen"
      @close="isAuthModalOpen = false"
      @authenticated="handleAuthenticated"
      @guest-mode="handleGuestMode"
    />

    <!-- Settings Modal -->
    <SettingsModal
      :is-open="isSettingsModalOpen"
      :user="user"
      :sync-status="syncStatus"
      :last-sync-at="lastSyncAt"
      @close="isSettingsModalOpen = false"
      @sign-out="handleSignOut"
      @delete-account="handleDeleteAccount"
      @sync-now="handleSyncNow"
      @export-data="handleExportData"
    />
  </div>
</template>

<style>
/* ========================================
   ANIMATIONS
   ======================================== */

@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-10px); }
}

.animate-float {
  animation: float 4s ease-in-out infinite;
}

/* Sidebar load animation */
.sidebar {
  opacity: 0;
  transform: translateX(-20px);
  transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 100;
}

.sidebar-loaded {
  opacity: 1;
  transform: translateX(0);
}

/* Collapsed sidebar styles */
.sidebar-collapsed {
  overflow: visible;
}

.sidebar-collapsed .p-5 {
  padding: 1rem;
}

/* Empty state animation */
.empty-state {
  opacity: 0;
  transform: translateY(20px);
  transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1) 0.3s;
}

.empty-state-loaded {
  opacity: 1;
  transform: translateY(0);
}

/* Character banner */
.character-banner {
  animation: slideUp 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Team list cards stagger animation */
.team-list-card {
  animation: teamCardReveal 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) var(--item-delay, 0s) both;
}

@keyframes teamCardReveal {
  from {
    opacity: 0;
    transform: translateY(15px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.team-list-card:hover {
  transform: translateY(-2px);
}

/* Team detail animation */
.team-detail {
  animation: fadeScale 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes fadeScale {
  from {
    opacity: 0;
    transform: scale(0.98);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* Team slot stagger */
.team-slot {
  animation: slotReveal 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) var(--slot-delay, 0s) both;
}

@keyframes slotReveal {
  from {
    opacity: 0;
    transform: translateY(15px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* Insight card animation */
.insight-card {
  animation: insightReveal 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) var(--insight-delay, 0s) both;
}

@keyframes insightReveal {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* Warning card animation */
.warning-card {
  animation: warningPulse 0.4s ease-out both;
}

@keyframes warningPulse {
  from {
    opacity: 0;
    transform: translateX(-5px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* Pull item animation */
.pull-item {
  animation: slideInLeft 0.4s cubic-bezier(0.4, 0, 0.2, 1) var(--item-delay, 0s) both;
}

/* Archetype item animation */
.archetype-item {
  animation: slideInLeft 0.4s cubic-bezier(0.4, 0, 0.2, 1) var(--item-delay, 0s) both;
}

/* Tier group animation */
.tier-group {
  animation: tierReveal 0.5s ease-out var(--tier-delay, 0s) both;
}

@keyframes tierReveal {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ========================================
   COMPONENT STYLES
   ======================================== */

.glass-panel {
  background: rgba(20, 20, 42, 0.6);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.tabs-container {
  animation: slideUp 0.4s ease-out 0.2s both;
}

/* Segmented Control */
.segmented-control {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  position: relative;
  padding: 0.25rem;
  background: rgba(15, 15, 35, 0.8);
  border-radius: 1rem;
  border: 1px solid rgba(139, 92, 246, 0.2);
  box-shadow:
    0 4px 20px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.segment-indicator {
  position: absolute;
  top: 0.25rem;
  bottom: 0.25rem;
  width: calc(33.333% - 0.167rem);
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.3) 0%, rgba(139, 92, 246, 0.15) 100%);
  border-radius: 0.75rem;
  border: 1px solid rgba(139, 92, 246, 0.4);
  box-shadow:
    0 0 20px rgba(139, 92, 246, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 0;
}

.segment-indicator.segment-investment {
  transform: translateX(0);
  left: 0.25rem;
}

.segment-indicator.segment-teammates {
  transform: translateX(100%);
  left: 0.25rem;
}

.segment-indicator.segment-my-teams {
  transform: translateX(200%);
  left: 0.25rem;
}

.segment-button {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.875rem 1rem;
  background: transparent;
  border: none;
  border-radius: 0.75rem;
  cursor: pointer;
  transition: all 0.3s ease;
}

.segment-button:hover:not(.active) {
  background: rgba(255, 255, 255, 0.05);
}

.segment-icon {
  font-size: 1.125rem;
  transition: transform 0.3s ease;
}

.segment-button.active .segment-icon {
  transform: scale(1.1);
}

.segment-label {
  font-family: var(--font-display);
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: rgba(255, 255, 255, 0.5);
  transition: color 0.3s ease;
}

.segment-button.active .segment-label {
  color: rgba(255, 255, 255, 0.95);
}

.segment-button:hover:not(.active) .segment-label {
  color: rgba(255, 255, 255, 0.7);
}

/* Mobile adjustments for segmented control */
@media (max-width: 640px) {
  .segmented-control {
    padding: 0.1875rem;
  }

  .segment-button {
    padding: 0.75rem 0.5rem;
    gap: 0.375rem;
  }

  .segment-icon {
    font-size: 1rem;
  }

  .segment-label {
    font-size: 0.75rem;
  }

  .segment-indicator {
    border-radius: 0.625rem;
  }
}

/* Composition context hint */
.composition-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.5rem 0;
  font-size: 0.75rem;
}

.hint-arrow {
  color: rgba(139, 92, 246, 0.6);
  font-size: 0.875rem;
}

.hint-text {
  color: rgba(255, 255, 255, 0.4);
}

.hint-name {
  color: rgba(167, 139, 250, 0.9);
  font-weight: 500;
}

/* Composition hint transition */
.composition-hint-enter-active {
  transition: all 0.3s ease-out;
}

.composition-hint-leave-active {
  transition: none; /* Instant disappear */
}

.composition-hint-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}

.composition-hint-leave-to {
  opacity: 0;
}

.warning-banner {
  animation: slideUp 0.4s ease-out 0.3s both;
}


/* Scrollbar styling */
.scrollbar-thin::-webkit-scrollbar {
  width: 6px;
}

.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}

.scrollbar-thin::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.scrollbar-thin::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* Portrait glow effect for large size */
.character-portrait-large {
  position: relative;
}

.character-portrait-large::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 1rem;
  background: linear-gradient(135deg, var(--color-stellar-500) 0%, var(--color-nebula-500) 100%);
  opacity: 0.3;
  filter: blur(10px);
  z-index: -1;
}

/* Role label styling */
.role-label {
  animation: fadeIn 0.3s ease-out var(--slot-delay, 0s) both;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Header icon small */
.header-icon-sm {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  background: rgba(249, 147, 7, 0.1);
  border-radius: 10px;
  border: 1px solid rgba(249, 147, 7, 0.2);
}

/* Character view animations */
.character-view {
  animation: view-enter 0.5s ease-out;
}

@keyframes view-enter {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* ========================================
   MY TEAMS SECTION
   ======================================== */

.my-teams-section {
  animation: section-enter 0.5s ease-out;
}

/* Support Teams Section (Two sections) */
.support-teams-section {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.support-section {
  background: linear-gradient(135deg, rgba(18, 18, 38, 0.4) 0%, rgba(12, 12, 28, 0.6) 100%);
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.06);
  padding: 1.5rem;
}

.support-section .section-header-row {
  margin-bottom: 1rem;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.2);
}

.focal-section .header-icon-container.focal-icon {
  background: rgba(251, 191, 36, 0.15);
  border-color: rgba(251, 191, 36, 0.3);
}

.supporting-section .header-icon-container.supporting-icon {
  background: rgba(99, 102, 241, 0.15);
  border-color: rgba(99, 102, 241, 0.3);
}

.teams-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.75rem;
}

@media (min-width: 480px) {
  .teams-grid {
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 1rem;
  }
}

@media (min-width: 640px) {
  .teams-grid {
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  }
}

.empty-state-panel.compact {
  padding: 2rem;
}

.empty-state-panel.compact .empty-icon {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.empty-state-panel.compact .empty-title {
  font-size: 1rem;
}

.empty-state-panel.compact .empty-message {
  font-size: 0.8125rem;
}

.support-detail-panel {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

@keyframes section-enter {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Section Header */
.section-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
  padding: 1.25rem 1.5rem;
  background: linear-gradient(135deg, rgba(18, 18, 38, 0.6) 0%, rgba(12, 12, 28, 0.8) 100%);
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.header-icon-container {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(249, 147, 7, 0.1);
  border: 1px solid rgba(249, 147, 7, 0.2);
  border-radius: 12px;
  font-size: 1.5rem;
}

.header-text {
  display: flex;
  flex-direction: column;
}

.header-title {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 700;
  color: white;
  margin: 0;
}

.header-subtitle {
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.5);
  margin: 0.25rem 0 0 0;
}

.header-stats {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.125rem;
}

.stat-value {
  font-family: var(--font-mono);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-stellar-500);
}

.stat-label {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Empty State */
.empty-state-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  background: linear-gradient(135deg, rgba(18, 18, 38, 0.5) 0%, rgba(12, 12, 28, 0.7) 100%);
  border-radius: 1.25rem;
  border: 1px solid rgba(255, 255, 255, 0.05);
  text-align: center;
}

.empty-icon {
  font-size: 4rem;
  opacity: 0.3;
  margin-bottom: 1.5rem;
}

.empty-title {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 600;
  color: white;
  margin: 0 0 0.5rem 0;
}

.empty-message {
  font-size: 0.9375rem;
  color: rgba(255, 255, 255, 0.5);
  max-width: 28rem;
  margin: 0;
  line-height: 1.6;
}

/* Teams Layout - Stacked vertically */
.teams-layout {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.teams-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.75rem;
}

@media (min-width: 480px) {
  .teams-list {
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
  }
}

@media (min-width: 640px) {
  .teams-list {
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  }
}

.teams-list::-webkit-scrollbar {
  width: 6px;
}

.teams-list::-webkit-scrollbar-track {
  background: transparent;
}

.teams-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.teams-list::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}

.team-list-item {
  animation: team-item-reveal 0.4s ease-out both;
  animation-delay: var(--item-delay, 0s);
}

@keyframes team-item-reveal {
  from {
    opacity: 0;
    transform: translateX(-15px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* Team Detail Panel */
.team-detail-panel {
  min-height: 200px;
}

/* No Selection State */
.no-selection-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 200px;
  padding: 3rem;
  background: linear-gradient(135deg, rgba(18, 18, 38, 0.5) 0%, rgba(12, 12, 28, 0.7) 100%);
  border-radius: 1.5rem;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.no-selection-icon {
  font-size: 3rem;
  color: rgba(255, 255, 255, 0.15);
  margin-bottom: 1rem;
  animation: point-left 1.5s ease-in-out infinite;
}

@keyframes point-left {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(-10px); }
}

.no-selection-text {
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.4);
  margin: 0;
}

/* ========================================
   OWNERSHIP LEGEND PANEL
   ======================================== */

.ownership-legend-panel {
  margin-top: 0.75rem;
  padding: 0.75rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 0.5rem;
}

.ownership-legend-panel .legend-title {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.5);
  text-align: center;
  margin-bottom: 0.5rem;
}

.ownership-legend-panel .legend-items {
  display: flex;
  justify-content: center;
  gap: 1rem;
}

.ownership-legend-panel .legend-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.ownership-legend-panel .legend-label {
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.6);
}

.ownership-legend-panel .legend-hint {
  font-size: 0.625rem;
  color: rgba(255, 255, 255, 0.3);
  text-align: center;
  margin-top: 0.5rem;
  margin-bottom: 0;
}

/* Ownership Legend Badges */
.ownership-badge-owned,
.ownership-badge-concept {
  width: 1.125rem;
  height: 1.125rem;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.5625rem;
  font-weight: 700;
  color: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.ownership-badge-owned {
  background: linear-gradient(135deg, #f99307 0%, #dd6d02 100%);
}

.ownership-badge-concept {
  background: linear-gradient(135deg, #d946ef 0%, #a855f7 100%);
}

/* ========================================
   PLANNING TOGGLE
   ======================================== */

.planning-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  cursor: pointer;
  padding: 0.375rem 0;
  margin-top: 0.25rem;
}

.planning-toggle-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.planning-toggle-switch {
  position: relative;
  width: 28px;
  height: 16px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  transition: background 0.2s ease;
  flex-shrink: 0;
}

.planning-toggle-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 50%;
  transition: transform 0.2s ease, background 0.2s ease;
}

.planning-toggle-input:checked + .planning-toggle-switch {
  background: linear-gradient(135deg, #d946ef 0%, #a855f7 100%);
}

.planning-toggle-input:checked + .planning-toggle-switch::after {
  transform: translateX(12px);
  background: white;
}

.planning-toggle-label {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
  transition: color 0.2s ease;
}

.planning-toggle:hover .planning-toggle-label {
  color: rgba(255, 255, 255, 0.6);
}

.planning-toggle-input:checked ~ .planning-toggle-label {
  color: rgba(217, 70, 239, 0.8);
}

/* ========================================
   MOBILE BACK BUTTON
   ======================================== */

.mobile-back-button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.75rem;
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mobile-back-button:active {
  transform: scale(0.98);
  background: rgba(255, 255, 255, 0.08);
}

@media (min-width: 768px) {
  .mobile-back-button {
    display: none;
  }
}

/* ========================================
   MOBILE TIER GROUPS
   ======================================== */

.mobile-tier-groups {
  /* Removed max-height and overflow - scrolls with page instead */
}

/* ========================================
   SIDEBAR TOOLTIP STYLES
   ======================================== */

.sidebar-nav-btn {
  position: relative;
}

/* Styled tooltip for collapsed sidebar */
.sidebar-nav-btn[data-tooltip]:not([data-tooltip=""])::after {
  content: attr(data-tooltip);
  position: absolute;
  left: calc(100% + 12px);
  top: 50%;
  transform: translateY(-50%);
  padding: 0.5rem 0.75rem;
  background: linear-gradient(135deg, rgba(30, 30, 60, 0.95) 0%, rgba(20, 20, 45, 0.98) 100%);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 0.5rem;
  color: white;
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  z-index: 99999;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4), 0 0 20px rgba(249, 147, 7, 0.1);
}

/* Arrow pointer */
.sidebar-nav-btn[data-tooltip]:not([data-tooltip=""])::before {
  content: '';
  position: absolute;
  left: calc(100% + 4px);
  top: 50%;
  transform: translateY(-50%);
  border: 6px solid transparent;
  border-right-color: rgba(30, 30, 60, 0.95);
  opacity: 0;
  visibility: hidden;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  z-index: 99999;
}

/* Show tooltip on hover */
.sidebar-nav-btn[data-tooltip]:not([data-tooltip=""]):hover::after,
.sidebar-nav-btn[data-tooltip]:not([data-tooltip=""]):hover::before {
  opacity: 1;
  visibility: visible;
}

/* Tooltip enter animation */
.sidebar-nav-btn[data-tooltip]:not([data-tooltip=""]):hover::after {
  transform: translateY(-50%) translateX(0);
}

.sidebar-nav-btn[data-tooltip]:not([data-tooltip=""])::after {
  transform: translateY(-50%) translateX(-5px);
}
</style>
