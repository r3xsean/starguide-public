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
  const viewMode = computed<'characters' | 'best-teams' | 'pull-advisor' | 'banner-advisor'>(() => {
    switch (route.name) {
      case 'best-teams':
        return 'best-teams';
      case 'pull-advisor':
        return 'pull-advisor';
      case 'banner-advisor':
        return 'banner-advisor';
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
  function setViewMode(mode: 'characters' | 'best-teams' | 'pull-advisor' | 'banner-advisor') {
    const routeMap: Record<string, string> = {
      'characters': 'home',
      'best-teams': 'best-teams',
      'pull-advisor': 'pull-advisor',
      'banner-advisor': 'banner-advisor'
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

  return {
    selectedCharacter,
    viewMode,
    selectCharacter,
    setViewMode,
    isCharacterPage,
    currentCharacterId,
    route,
    router
  };
}
