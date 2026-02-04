/**
 * Runtime Relationship Lookups
 *
 * These utilities find inverse relationships at runtime:
 * - Who wants this character as a teammate?
 * - Who avoids this character?
 *
 * This avoids data duplication and shows relationships from
 * the original source's perspective.
 *
 * Updated for composition system: Shows highest rating across all compositions.
 */

import { characters } from '../data/index';
import type { Character, TeammateRating } from '../types';
import { getTeammatesForComposition, hasCompositions } from './characterUtils';

export interface WantedByEntry {
  character: Character;           // The character who wants this one
  category: 'dps' | 'amplifiers' | 'sustains' | 'subDPS' | 'supportDPS';
  rating: TeammateRating;
  reason: string;
  // NEW: Composition context when rating varies
  compositionContext?: {
    compositionId: string;
    compositionName: string;
    isHighestRating: boolean;    // True if this is from a specific comp with higher rating
  };
}

export interface AvoidedByEntry {
  character: Character;           // The character who avoids this one
  reason: string;
}

/**
 * Find all characters who list the given character as a teammate.
 * Returns entries grouped by how they categorize this character.
 *
 * Updated for composition system:
 * - Checks both legacy teammates and new baseTeammates/compositions
 * - Returns the HIGHEST rating found across any composition
 * - Includes composition context when rating varies between compositions
 */
export function getCharactersWhoWant(characterId: string): WantedByEntry[] {
  const results: WantedByEntry[] = [];
  const ratingOrder: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, D: 4 };

  for (const char of characters) {
    if (char.id === characterId) continue;

    const categories = ['dps', 'amplifiers', 'sustains', 'subDPS', 'supportDPS'] as const;

    for (const category of categories) {
      // Track best rating found across all compositions
      let bestRating: TeammateRating | null = null;
      let bestReason: string = '';
      let bestCompositionId: string | undefined;
      let bestCompositionName: string | undefined;
      let baseRating: TeammateRating | null = null;

      // Check if character has new composition system
      if (hasCompositions(char)) {
        // Get base rating first (no composition override)
        const baseTeammates = getTeammatesForComposition(char);
        const baseList = baseTeammates[category];
        const baseEntry = baseList?.find(t => t.id === characterId);
        if (baseEntry) {
          baseRating = baseEntry.rating;
          bestRating = baseEntry.rating;
          bestReason = baseEntry.reason;
        }

        // Check each composition for potentially higher ratings
        for (const comp of char.compositions || []) {
          const compTeammates = getTeammatesForComposition(char, comp.id);
          const compList = compTeammates[category];
          const compEntry = compList?.find(t => t.id === characterId);

          if (compEntry) {
            const currentBestOrder = bestRating ? (ratingOrder[bestRating] ?? 999) : 999;
            const compOrder = ratingOrder[compEntry.rating] ?? 999;

            // Use this composition's rating if it's better
            if (compOrder < currentBestOrder) {
              bestRating = compEntry.rating;
              bestReason = compEntry.reason;
              bestCompositionId = comp.id;
              bestCompositionName = comp.name;
            }
          }
        }
      } else {
        // Legacy: use teammates field directly
        const list = char.teammates?.[category];
        const entry = list?.find(t => t.id === characterId);
        if (entry) {
          bestRating = entry.rating;
          bestReason = entry.reason;
        }
      }

      // Add entry if we found any rating
      if (bestRating) {
        const entry: WantedByEntry = {
          character: char,
          category,
          rating: bestRating,
          reason: bestReason,
        };

        // Add composition context if rating came from a specific composition
        // and it's different from the base rating
        if (bestCompositionId && bestCompositionName && baseRating && bestRating !== baseRating) {
          entry.compositionContext = {
            compositionId: bestCompositionId,
            compositionName: bestCompositionName,
            isHighestRating: true,
          };
        }

        results.push(entry);
      }
    }
  }

  // Sort by rating (S > A > B > C > D), then by character name
  results.sort((a, b) => {
    const ratingDiff = (ratingOrder[a.rating] ?? 5) - (ratingOrder[b.rating] ?? 5);
    if (ratingDiff !== 0) return ratingDiff;
    return a.character.name.localeCompare(b.character.name);
  });

  return results;
}

/**
 * Find all characters who list the given character in their avoid list.
 */
export function getCharactersWhoAvoid(characterId: string): AvoidedByEntry[] {
  const results: AvoidedByEntry[] = [];

  for (const char of characters) {
    if (char.id === characterId) continue;
    if (!char.restrictions?.avoid) continue;

    const avoidEntry = char.restrictions.avoid.find(a => a.id === characterId);
    if (avoidEntry) {
      results.push({
        character: char,
        reason: avoidEntry.reason,
      });
    }
  }

  // Sort by character name
  results.sort((a, b) => a.character.name.localeCompare(b.character.name));

  return results;
}

/**
 * Group WantedByEntry results by the role of the character who wants them.
 * Useful for displaying "DPS characters who want you" vs "Supports who want you"
 */
export function groupWantedByRole(entries: WantedByEntry[]): {
  dps: WantedByEntry[];
  supports: WantedByEntry[];
  sustains: WantedByEntry[];
} {
  const result = {
    dps: [] as WantedByEntry[],
    supports: [] as WantedByEntry[],
    sustains: [] as WantedByEntry[],
  };

  for (const entry of entries) {
    const roles = entry.character.roles;
    if (roles.includes('DPS')) {
      result.dps.push(entry);
    } else if (roles.includes('Sustain')) {
      result.sustains.push(entry);
    } else {
      result.supports.push(entry);
    }
  }

  return result;
}

/**
 * Get a summary of how many characters want this one, by rating.
 */
export function getWantedBySummary(characterId: string): {
  total: number;
  byRating: Record<TeammateRating, number>;
} {
  const entries = getCharactersWhoWant(characterId);
  const byRating: Record<TeammateRating, number> = { 'S+': 0, S: 0, A: 0, B: 0, C: 0, D: 0 };

  for (const entry of entries) {
    byRating[entry.rating]++;
  }

  return {
    total: entries.length,
    byRating,
  };
}
