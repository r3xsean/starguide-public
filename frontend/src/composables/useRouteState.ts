import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { Character } from '../types';
import { getCharacterById } from '../data/helpers';

/**
 * Composable that syncs app state with vue-router.
 * Replaces direct ref manipulation with URL-based navigation.
 */
export function useRouteState() {
  const route = useRoute();
  const router = useRouter();

  // Derive selectedCharacter from route params
  const selectedCharacter = computed<Character | null>(() => {
    if (route.name === 'character' && route.params.id) {
      const char = getCharacterById(route.params.id as string);
      return char || null;
    }
    return null;
  });

  // Derive viewMode from route name
  const viewMode = computed<'characters' | 'best-teams' | 'pull-advisor' | 'banner-advisor' | 'profile' | 'admin' | 'roster'>(() => {
    switch (route.name) {
      case 'best-teams':
        return 'best-teams';
      case 'pull-advisor':
        return 'pull-advisor';
      case 'banner-advisor':
        return 'banner-advisor';
      case 'roster':
        return 'roster';
      case 'user-profile':
      case 'profile-setup':
        return 'profile';
      case 'admin-dashboard':
      case 'admin-character':
      case 'admin-users':
      case 'admin-review':
      case 'admin-review-edit':
        return 'admin';
      case 'character':
      case 'home':
      default:
        return 'characters';
    }
  });

  // Navigation method to select a character
  function selectCharacter(character: Character | null) {
    if (character) {
      router.push({ name: 'character', params: { id: character.id } });
    } else {
      router.push({ name: 'home' });
    }
  }

  // Navigation method to change view mode
  // For profile mode, pass username to navigate to /u/:username, or null to go to setup
  function setViewMode(
    mode: 'characters' | 'best-teams' | 'pull-advisor' | 'banner-advisor' | 'profile' | 'admin' | 'roster',
    options?: { username?: string | null }
  ) {
    if (mode === 'profile') {
      if (options?.username) {
        router.push({ name: 'user-profile', params: { username: options.username } });
      } else {
        router.push({ name: 'profile-setup' });
      }
      return;
    }

    if (mode === 'admin') {
      router.push({ name: 'admin-dashboard' });
      return;
    }

    const routeMap: Record<string, string> = {
      'characters': 'home',
      'best-teams': 'best-teams',
      'pull-advisor': 'pull-advisor',
      'banner-advisor': 'banner-advisor',
      'roster': 'roster',
    };
    router.push({ name: routeMap[mode] });
  }

  // Check if we're on a character page
  const isCharacterPage = computed(() => route.name === 'character');

  // Get current character ID from route (useful for direct access)
  const currentCharacterId = computed(() => {
    if (route.name === 'character' && route.params.id) {
      return route.params.id as string;
    }
    return null;
  });

  // Profile state derived from route
  const profileUsername = computed<string | null>(() => {
    if (route.name === 'user-profile' && route.params.username) {
      return route.params.username as string;
    }
    return null;
  });

  const isUserProfilePage = computed(() => route.name === 'user-profile');
  const isProfileSetupPage = computed(() => route.name === 'profile-setup');
  const isProfilePage = computed(() => route.name === 'user-profile' || route.name === 'profile-setup');

  // Check if we're on an admin page
  const isAdminPage = computed(() => route.path.startsWith('/admin'));

  // Navigation to profile
  function navigateToProfile(username: string) {
    router.push({ name: 'user-profile', params: { username } });
  }

  // Navigate to profile setup
  function navigateToProfileSetup() {
    router.push({ name: 'profile-setup' });
  }

  return {
    selectedCharacter,
    viewMode,
    selectCharacter,
    setViewMode,
    isCharacterPage,
    currentCharacterId,
    profileUsername,
    isUserProfilePage,
    isProfileSetupPage,
    isProfilePage,
    isAdminPage,
    navigateToProfile,
    navigateToProfileSetup,
    route,
    router
  };
}
