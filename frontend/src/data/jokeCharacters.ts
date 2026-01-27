import type { TierRating, Element, Path, Role, Character } from '../types';

export interface JokeCharacter {
  id: string;
  name: string;
  tier: TierRating;
  image?: string; // Custom image path (relative to /public), falls back to /icons/{id}.webp
  element?: Element; // For ring color (defaults to Physical)
  isJoke: true; // Marker to identify joke characters
}

// Convert joke character to Character-like object for CharacterCard
export function toCharacterLike(joke: JokeCharacter): Character {
  return {
    id: joke.id,
    name: joke.name,
    element: joke.element || 'Physical',
    path: 'Destruction' as Path, // Doesn't matter, not displayed
    rarity: 5,
    roles: ['DPS' as Role],
  };
}

/**
 * Joke characters that appear in the character grid but are unclickable.
 * Add entries here with any name and tier you want!
 *
 * Each entry needs:
 * - id: unique identifier (should match image filename if using custom image)
 * - name: the display name (shown on hover)
 * - tier: any TierRating ('T-1', 'T-0.5', 'T0', 'T0.5', 'T1', 'T1.5', 'T2', 'T3', 'T4', 'T5')
 * - image (optional): custom image path like '/jokes/name.png'
 * - element (optional): for the colored ring (Physical, Fire, Ice, Lightning, Wind, Quantum, Imaginary)
 */
export const jokeCharacters: JokeCharacter[] = [
  // Add joke characters here, e.g.:
  // { id: 'joke-example', name: 'Example', tier: 'T5', image: '/jokes/example.png', element: 'Fire', isJoke: true },
];
