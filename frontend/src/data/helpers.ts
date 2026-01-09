import type { Character, Element, Path, Role, TierRating } from '../types';
import { getTierData } from './tierData';

// This will be populated by index.ts
let charactersRef: Character[] = [];

export function setCharactersRef(characters: Character[]) {
  charactersRef = characters;
}

// Helper function to get character by ID
export function getCharacterById(id: string): Character | undefined {
  return charactersRef.find(c => c.id === id);
}

// Helper function to get characters by tier (checks all game modes for the role)
export function getCharactersByTier(tier: TierRating): Character[] {
  return charactersRef.filter(c => {
    const tierData = getTierData(c.id);
    if (!tierData) return false;
    // Check if any role in any game mode matches the tier
    const allTiers = [tierData.moc, tierData.pf, tierData.as].filter(Boolean);
    return allTiers.some(modeTiers =>
      modeTiers && Object.values(modeTiers).includes(tier)
    );
  });
}

// Helper function to get characters by element
export function getCharactersByElement(element: Element): Character[] {
  return charactersRef.filter(c => c.element === element);
}

// Helper function to get characters by path
export function getCharactersByPath(path: Path): Character[] {
  return charactersRef.filter(c => c.path === path);
}

// Helper function to get characters by role
export function getCharactersByRole(role: Role): Character[] {
  return charactersRef.filter(c => c.roles.includes(role));
}

// Helper function to get characters by rarity
export function getCharactersByRarity(rarity: 4 | 5): Character[] {
  return charactersRef.filter(c => c.rarity === rarity);
}

// Helper function to search characters by name
export function searchCharacters(query: string): Character[] {
  const lowerQuery = query.toLowerCase();
  return charactersRef.filter(c =>
    c.name.toLowerCase().includes(lowerQuery) ||
    c.id.toLowerCase().includes(lowerQuery)
  );
}
