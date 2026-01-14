// ========================================
// Character Utilities for Overhaul System
// ========================================
// These utilities support the new investment, composition, and synergy systems.
// See CHARACTER_DATA_OVERHAUL.md for full specification.

import type {
  Character,
  Teammates,
  TeammateRec,
  TeammateRating,
  TeamComposition,
} from '../types';
import { getCharacterById } from '../data';

// ========================================
// Investment Level Type (for user tracking)
// ========================================

export interface InvestmentLevel {
  eidolonLevel: number; // 0-6
  lightConeId?: string;
  lightConeSuperimposition?: number; // 1-5
}

// ========================================
// Synergy Breakdown (for UI display)
// ========================================

export interface SynergyBreakdown {
  source: string;
  value: number;
  reason: string;
}

// ========================================
// Rating Score Mapping
// ========================================

const RATING_SCORES: Record<TeammateRating, number> = {
  'S+': 60,
  'S': 50,
  'A': 40,
  'B': 30,
  'C': 20,
  'D': 10,
};

/**
 * Convert numeric score back to TeammateRating
 * S+ is awarded when synergy modifiers boost score above S threshold (55+)
 */
function scoreToRating(score: number): TeammateRating {
  if (score >= 55) return 'S+';
  if (score >= 45) return 'S';
  if (score >= 35) return 'A';
  if (score >= 25) return 'B';
  if (score >= 15) return 'C';
  return 'D';
}

// ========================================
// Composition Utilities
// ========================================

/**
 * Get the primary composition for a character.
 * Returns the composition with isPrimary: true, or undefined if none.
 */
export function getPrimaryComposition(character: Character): TeamComposition | undefined {
  return character.compositions?.find(c => c.isPrimary);
}

/**
 * Get all composition IDs for a character.
 */
export function getCompositionIds(character: Character): string[] {
  return character.compositions?.map(c => c.id) || [];
}

/**
 * Get a specific composition by ID.
 */
export function getCompositionById(
  character: Character,
  compositionId: string
): TeamComposition | undefined {
  return character.compositions?.find(c => c.id === compositionId);
}

/**
 * Check if a character has any compositions defined.
 */
export function hasCompositions(character: Character): boolean {
  return (character.compositions?.length ?? 0) > 0;
}

// ========================================
// Teammate Resolution with Overrides
// ========================================

/**
 * Get teammates for a character, optionally applying composition overrides.
 *
 * If compositionId is provided and the character has compositions:
 * - Start with baseTeammates (or fall back to teammates for legacy)
 * - Apply overrides from the specified composition
 *
 * If no compositionId or no compositions:
 * - Return baseTeammates if available
 * - Fall back to legacy teammates field
 */
export function getTeammatesForComposition(
  character: Character,
  compositionId?: string
): Teammates {
  // Start with base teammates or fall back to legacy
  const base: Teammates = character.baseTeammates || character.teammates || {};

  // If no composition specified or no compositions exist, return base
  if (!compositionId || !character.compositions) {
    return base;
  }

  // Find the composition
  const comp = character.compositions.find(c => c.id === compositionId);
  if (!comp?.teammateOverrides) {
    return base;
  }

  // Deep clone base to avoid mutation
  const result: Teammates = {
    dps: base.dps ? [...base.dps] : undefined,
    subDPS: base.subDPS ? [...base.subDPS] : undefined,
    amplifiers: base.amplifiers ? [...base.amplifiers] : undefined,
    sustains: base.sustains ? [...base.sustains] : undefined,
  };

  // Apply overrides for each role
  const roles = ['dps', 'subDPS', 'amplifiers', 'sustains'] as const;

  for (const role of roles) {
    const overrides = comp.teammateOverrides[role];
    if (!overrides) continue;

    let roleList = result[role] || [];

    for (const override of overrides) {
      const idx = roleList.findIndex(t => t.id === override.id);

      if (override.excluded) {
        // Remove from list
        if (idx >= 0) {
          roleList = roleList.filter(t => t.id !== override.id);
        }
      } else if (idx >= 0) {
        // Update existing entry
        const existing = roleList[idx];
        if (existing) {
          roleList[idx] = {
            id: existing.id,
            rating: override.rating ?? existing.rating,
            reason: override.reason ?? existing.reason,
          };
        }
      } else if (override.rating) {
        // Add new entry (must have rating to add)
        roleList.push({
          id: override.id,
          rating: override.rating,
          reason: override.reason || '',
        });
      }
    }

    result[role] = roleList.length > 0 ? roleList : undefined;
  }

  return result;
}

/**
 * Find a specific teammate recommendation from a character's teammates.
 * Optionally uses composition-specific overrides.
 */
export function findTeammateRec(
  character: Character,
  teammateId: string,
  compositionId?: string
): TeammateRec | undefined {
  const teammates = getTeammatesForComposition(character, compositionId);

  // Search all categories
  const allCategories = [
    teammates.dps,
    teammates.subDPS,
    teammates.amplifiers,
    teammates.sustains,
  ];

  for (const category of allCategories) {
    const found = category?.find(t => t.id === teammateId);
    if (found) return found;
  }

  return undefined;
}

// ========================================
// Bidirectional Synergy Modifiers
// ========================================

/**
 * Get combined synergy modifier between two characters.
 * Looks at BOTH characters' investment and AVERAGES all applicable modifiers.
 * Result is automatically bidirectional.
 *
 * Modifiers come from two perspectives:
 * 1. Investment owner perspective (SynergyModifier on eidolons/LCs)
 *    - "My investment improves synergy with these characters"
 * 2. Teammate receiver perspective (theirInvestmentModifiers on TeammateRec)
 *    - "I value this teammate more at these investment levels"
 *
 * All modifiers are AVERAGED (not summed) to prevent inflation when both
 * sides define modifiers for the same synergy.
 *
 * @param charA First character
 * @param charB Second character
 * @param investments Map of character ID to their investment levels
 * @returns Averaged modifier and breakdown of sources
 */
export function getBidirectionalSynergyModifier(
  charA: Character,
  charB: Character,
  investments: Map<string, InvestmentLevel>
): { total: number; breakdown: SynergyBreakdown[] } {
  const breakdown: SynergyBreakdown[] = [];

  // Helper to check one character's investment for modifiers affecting the other
  // (Investment owner perspective - SynergyModifiers on eidolons/LCs)
  function checkInvestmentOwner(char: Character, targetId: string) {
    const inv = investments.get(char.id);
    if (!char.investment || !inv) return;

    // Check eidolons
    for (const eidolon of char.investment.eidolons) {
      if (inv.eidolonLevel >= eidolon.level && eidolon.synergyModifiers) {
        const mod = eidolon.synergyModifiers.find(m => m.withCharacterId === targetId);
        if (mod) {
          breakdown.push({
            source: `${char.name} E${eidolon.level}`,
            value: mod.modifier,
            reason: mod.reason,
          });
        }
      }
    }

    // Check light cone
    if (inv.lightConeId) {
      const lc = char.investment.lightCones.find(l => l.id === inv.lightConeId);
      if (lc?.synergyModifiers) {
        const mod = lc.synergyModifiers.find(m => m.withCharacterId === targetId);
        if (mod) {
          breakdown.push({
            source: `${char.name} + ${lc.name}`,
            value: mod.modifier,
            reason: mod.reason,
          });
        }
      }
    }
  }

  // Helper to check receiver's theirInvestmentModifiers
  // (Teammate receiver perspective - how much receiver values teammate at investment levels)
  function checkTeammateReceiver(receiver: Character, teammateId: string) {
    const teammateInv = investments.get(teammateId);
    if (!teammateInv) return;

    // Check all teammate categories for the teammate entry
    const allTeammates = [
      ...(receiver.baseTeammates?.dps || []),
      ...(receiver.baseTeammates?.subDPS || []),
      ...(receiver.baseTeammates?.amplifiers || []),
      ...(receiver.baseTeammates?.sustains || []),
      // Also check legacy teammates for backward compatibility
      ...(receiver.teammates?.dps || []),
      ...(receiver.teammates?.subDPS || []),
      ...(receiver.teammates?.amplifiers || []),
      ...(receiver.teammates?.sustains || []),
    ];

    const teammateRec = allTeammates.find(t => t.id === teammateId);
    if (!teammateRec?.theirInvestmentModifiers) return;

    for (const mod of teammateRec.theirInvestmentModifiers) {
      if (teammateInv.eidolonLevel >= mod.level) {
        breakdown.push({
          source: `${receiver.name} values ${teammateId} E${mod.level}`,
          value: mod.modifier,
          reason: mod.reason || '',
        });
      }
    }
  }

  // Investment owner perspective (existing SynergyModifiers)
  checkInvestmentOwner(charA, charB.id);
  checkInvestmentOwner(charB, charA.id);

  // Teammate receiver perspective (new theirInvestmentModifiers)
  checkTeammateReceiver(charA, charB.id);
  checkTeammateReceiver(charB, charA.id);

  // AVERAGE all modifiers (not sum) to prevent inflation
  const total = breakdown.length > 0
    ? breakdown.reduce((sum, b) => sum + b.value, 0) / breakdown.length
    : 0;

  return {
    total,
    breakdown,
  };
}

// ========================================
// Effective Rating with Modifiers
// ========================================

export interface EffectiveRatingOptions {
  compositionId?: string;
  investments?: Map<string, InvestmentLevel>;
}

/**
 * Get effective synergy rating including investment modifiers.
 *
 * @param fromChar The character whose perspective we're rating from
 * @param toCharId The character being rated
 * @param options Optional composition and investment context
 * @returns Effective rating (may differ from base due to synergy modifiers)
 */
export function getEffectiveRating(
  fromChar: Character,
  toCharId: string,
  options?: EffectiveRatingOptions
): TeammateRating {
  // Get base rating from teammate rec (with composition overrides if specified)
  const baseRec = findTeammateRec(fromChar, toCharId, options?.compositionId);
  const baseScore = RATING_SCORES[baseRec?.rating ?? 'D'];

  // If no investments provided, return base rating
  if (!options?.investments) {
    return baseRec?.rating ?? 'D';
  }

  // Get the target character to check for synergy modifiers
  const toChar = getCharacterById(toCharId);
  if (!toChar) {
    return baseRec?.rating ?? 'D';
  }

  // Get bidirectional synergy modifier
  const { total: modifier } = getBidirectionalSynergyModifier(fromChar, toChar, options.investments);

  // Apply modifier and convert back to rating
  return scoreToRating(baseScore + modifier);
}

/**
 * Get effective rating with full breakdown for UI display.
 */
export function getEffectiveRatingWithBreakdown(
  fromChar: Character,
  toCharId: string,
  options?: EffectiveRatingOptions
): {
  baseRating: TeammateRating;
  effectiveRating: TeammateRating;
  baseScore: number;
  effectiveScore: number;
  synergyBreakdown: SynergyBreakdown[];
  reason: string;
} {
  const baseRec = findTeammateRec(fromChar, toCharId, options?.compositionId);
  const baseRating = baseRec?.rating ?? 'D';
  const baseScore = RATING_SCORES[baseRating];
  const reason = baseRec?.reason ?? '';

  let synergyBreakdown: SynergyBreakdown[] = [];
  let modifier = 0;

  if (options?.investments) {
    const toChar = getCharacterById(toCharId);
    if (toChar) {
      const result = getBidirectionalSynergyModifier(fromChar, toChar, options.investments);
      synergyBreakdown = result.breakdown;
      modifier = result.total;
    }
  }

  const effectiveScore = baseScore + modifier;
  const effectiveRating = scoreToRating(effectiveScore);

  return {
    baseRating,
    effectiveRating,
    baseScore,
    effectiveScore,
    synergyBreakdown,
    reason,
  };
}

// ========================================
// Investment Penalty Calculation
// ========================================

/**
 * Calculate total penalty for a character's investment level.
 * E6S5 = 0 (perfect), anything less = cumulative penalties.
 */
export function calculateInvestmentPenalty(
  character: Character,
  investment: InvestmentLevel
): { total: number; eidolonPenalty: number; lcPenalty: number } {
  if (!character.investment) {
    return { total: 0, eidolonPenalty: 0, lcPenalty: 0 };
  }

  // Calculate eidolon penalty (penalties for MISSING eidolons)
  let eidolonPenalty = 0;
  for (const eidolon of character.investment.eidolons) {
    if (investment.eidolonLevel < eidolon.level) {
      eidolonPenalty += eidolon.penalty; // penalty is negative
    }
  }

  // Calculate LC penalty
  let lcPenalty = 0;
  if (investment.lightConeId) {
    const lc = character.investment.lightCones.find(l => l.id === investment.lightConeId);
    if (lc) {
      const superimposition = investment.lightConeSuperimposition ?? 1;
      // Linear interpolation between S1 and S5
      lcPenalty = lc.penalties.s1 +
        (lc.penalties.s5 - lc.penalties.s1) * ((superimposition - 1) / 4);
    }
  } else {
    lcPenalty = -40; // No LC penalty
  }

  return {
    total: eidolonPenalty + lcPenalty,
    eidolonPenalty,
    lcPenalty,
  };
}

/**
 * Get LC penalty at a specific superimposition level.
 */
export function getLCPenalty(
  character: Character,
  lightConeId: string,
  superimposition: number
): number {
  const lc = character.investment?.lightCones.find(l => l.id === lightConeId);
  if (!lc) return -40; // Default penalty if LC not found

  const { s1, s5 } = lc.penalties;
  // Linear interpolation: S1=1, S2=2, S3=3, S4=4, S5=5
  return s1 + (s5 - s1) * ((superimposition - 1) / 4);
}
