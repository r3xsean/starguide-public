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
  UserCharacterInvestment,
} from '../types';
import { getCharacterById } from '../data';
import { generateTeams, type GeneratedTeam, type GameMode } from './newTeamGenerator';

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

// ========================================
// Pull Advisor Utilities
// ========================================

export interface RoleOverlapEntry {
  characterId: string;
  characterName: string;
  rating: TeammateRating;
  relationship: 'upgrade' | 'sidegrade' | 'downgrade';
}

export interface RoleOverlap {
  dpsId: string;
  dpsName: string;
  recommendedRating: TeammateRating;
  category: 'amplifiers' | 'sustains' | 'subDPS';
  alternatives: RoleOverlapEntry[];
}

/**
 * Find owned characters that fill similar roles to a recommended character.
 *
 * Logic:
 * 1. For each DPS that wants the recommended char
 * 2. Find which category (amplifiers/sustains/subDPS) the recommendation is in
 * 3. Find owned chars in THAT SAME category rated S or A
 * 4. Compare ratings to determine relationship
 */
export function findRoleOverlap(
  recommendedCharId: string,
  ownedIds: Set<string>,
  wantedByDPS: { dpsId: string; dpsChar: Character; rating: TeammateRating }[],
  allCharacters: Character[]
): RoleOverlap[] {
  const overlaps: RoleOverlap[] = [];
  const ratingOrder: TeammateRating[] = ['S+', 'S', 'A', 'B', 'C', 'D'];

  for (const { dpsId, dpsChar, rating: recommendedRating } of wantedByDPS) {
    const teammates = getTeammatesForComposition(dpsChar);

    // Find which category contains the recommended character
    const categories: Array<{ key: 'amplifiers' | 'sustains' | 'subDPS'; items: TeammateRec[] | undefined }> = [
      { key: 'amplifiers', items: teammates.amplifiers },
      { key: 'sustains', items: teammates.sustains },
      { key: 'subDPS', items: teammates.subDPS },
    ];

    for (const { key: category, items } of categories) {
      if (!items) continue;

      // Check if recommended char is in this category
      const recInCategory = items.find(t => t.id === recommendedCharId);
      if (!recInCategory) continue;

      // Find owned alternatives in same category rated S or A
      const alternatives: RoleOverlapEntry[] = [];
      for (const teammate of items) {
        if (teammate.id === recommendedCharId) continue;
        if (!ownedIds.has(teammate.id)) continue;
        if (!['S+', 'S', 'A'].includes(teammate.rating)) continue;

        const char = allCharacters.find(c => c.id === teammate.id);
        if (!char) continue;

        // Determine relationship
        const recIdx = ratingOrder.indexOf(recommendedRating);
        const altIdx = ratingOrder.indexOf(teammate.rating);
        let relationship: 'upgrade' | 'sidegrade' | 'downgrade';
        if (recIdx < altIdx) relationship = 'upgrade';
        else if (recIdx === altIdx) relationship = 'sidegrade';
        else relationship = 'downgrade';

        alternatives.push({
          characterId: teammate.id,
          characterName: char.name,
          rating: teammate.rating,
          relationship,
        });
      }

      if (alternatives.length > 0) {
        overlaps.push({
          dpsId,
          dpsName: dpsChar.name,
          recommendedRating,
          category,
          alternatives,
        });
      }
    }
  }

  return overlaps;
}

// ==================
// ROSTER GAP DETECTION
// ==================

/**
 * @deprecated Legacy gap analysis - use SlotBasedGapEntry instead
 */
export interface RosterGapEntry {
  dpsId: string;
  dpsName: string;
  category: 'amplifiers' | 'sustains' | 'subDPS';
  categoryLabel: string;
  recommendedRating: TeammateRating;
  bestOwnedRating: TeammateRating | null; // null means no owned options at all
  bestOwnedName: string | null;
}

/**
 * Slot-based gap analysis result for a single DPS composition.
 * Shows slot requirements and how the recommended character fills a gap.
 */
export interface SlotBasedGapEntry {
  dpsId: string;
  dpsName: string;
  compositionId: string;
  compositionName: string;
  category: 'amplifiers' | 'sustains' | 'subDPS';
  categoryLabel: string;  // "amplifier", "sustain", "sub-DPS"

  // Slot information
  slotsNeeded: number;
  slotsFilled: number;

  // Owned options filling slots (sorted by rating)
  ownedOptions: {
    id: string;
    name: string;
    rating: TeammateRating;
  }[];

  // The recommended character's rating for this DPS
  recommendedRating: TeammateRating;

  // Overall composition coverage (0-100%)
  coveragePercent: number;
}

/**
 * Result of composition selection for a DPS.
 * Internal helper type for selectBestComposition.
 */
export interface CompositionAnalysis {
  compositionId: string;
  compositionName: string;
  structure: { dps: number; amplifier: number; sustain: number };
  coveragePercent: number;
  slotAnalysis: {
    amplifiers: { needed: number; filled: number; owned: TeammateRec[] };
    sustains: { needed: number; filled: number; owned: TeammateRec[] };
    subDPS?: { needed: number; filled: number; owned: TeammateRec[] };
  };
  recommendedCategory: 'amplifiers' | 'sustains' | 'subDPS' | null;
}

/**
 * Select the best composition for a DPS where the recommended character fills a gap.
 *
 * Algorithm:
 * 1. For each composition, calculate current coverage (% of slots filled with S/A options)
 * 2. Filter to compositions where:
 *    - Recommended character is in the teammate list with S/A/B rating
 *    - Recommended character fills an UNFILLED slot (owned < needed in that category)
 * 3. Return composition with highest coverage among valid options
 *
 * @param dps - The DPS character to analyze
 * @param ownedIds - Set of owned character IDs
 * @param recommendedCharId - Character being recommended
 * @param allCharacters - All characters for lookups
 * @returns Best composition analysis or null if none valid
 */
export function selectBestComposition(
  dps: Character,
  ownedIds: Set<string>,
  recommendedCharId: string,
  _allCharacters: Character[]
): CompositionAnalysis | null {
  const compositions = dps.compositions || [];

  let bestComposition: CompositionAnalysis | null = null;
  let bestCoverage = -1;

  for (const comp of compositions) {
    const structure = comp.structure || { dps: 1, amplifier: 2, sustain: 1 };
    const teammates = getTeammatesForComposition(dps, comp.id);

    // Calculate slots needed per role (exclude DPS slots)
    const amplifiersNeeded = structure.amplifier;
    const sustainsNeeded = structure.sustain;
    const subDPSNeeded = structure.dps > 1 ? structure.dps - 1 : 0;

    // Find owned S/A options in each category
    const ownedAmplifiers = (teammates.amplifiers || [])
      .filter(t => ownedIds.has(t.id) && ['S+', 'S', 'A'].includes(t.rating))
      .slice(0, amplifiersNeeded);

    const ownedSustains = (teammates.sustains || [])
      .filter(t => ownedIds.has(t.id) && ['S+', 'S', 'A'].includes(t.rating))
      .slice(0, sustainsNeeded);

    const ownedSubDPS = (teammates.subDPS || [])
      .filter(t => ownedIds.has(t.id) && ['S+', 'S', 'A'].includes(t.rating))
      .slice(0, subDPSNeeded);

    // Calculate coverage percentage
    const totalSlots = amplifiersNeeded + sustainsNeeded + subDPSNeeded;
    const filledSlots = ownedAmplifiers.length + ownedSustains.length + ownedSubDPS.length;
    const coveragePercent = totalSlots > 0 ? (filledSlots / totalSlots) * 100 : 100;

    // Find which category the recommended character belongs to
    const inAmplifiers = (teammates.amplifiers || []).find(t => t.id === recommendedCharId);
    const inSustains = (teammates.sustains || []).find(t => t.id === recommendedCharId);
    const inSubDPS = (teammates.subDPS || []).find(t => t.id === recommendedCharId);

    if (!inAmplifiers && !inSustains && !inSubDPS) continue;

    // Check if recommended char fills a gap
    let recommendedCategory: 'amplifiers' | 'sustains' | 'subDPS' | null = null;
    let fillsGap = false;

    if (inAmplifiers && ['S+', 'S', 'A', 'B'].includes(inAmplifiers.rating)) {
      recommendedCategory = 'amplifiers';
      fillsGap = ownedAmplifiers.length < amplifiersNeeded;
    } else if (inSustains && ['S+', 'S', 'A', 'B'].includes(inSustains.rating)) {
      recommendedCategory = 'sustains';
      fillsGap = ownedSustains.length < sustainsNeeded;
    } else if (inSubDPS && ['S+', 'S', 'A', 'B'].includes(inSubDPS.rating)) {
      recommendedCategory = 'subDPS';
      fillsGap = ownedSubDPS.length < subDPSNeeded;
    }

    // Skip if recommended char doesn't fill a gap AND composition is already viable
    if (!fillsGap && coveragePercent >= 40) continue;

    // Skip if coverage too low (unrealistic to build towards)
    if (coveragePercent < 40 && filledSlots > 0) continue;

    // Track best option (highest coverage where recommended helps)
    if (fillsGap && coveragePercent > bestCoverage) {
      bestCoverage = coveragePercent;
      bestComposition = {
        compositionId: comp.id,
        compositionName: comp.name,
        structure,
        coveragePercent,
        slotAnalysis: {
          amplifiers: {
            needed: amplifiersNeeded,
            filled: ownedAmplifiers.length,
            owned: ownedAmplifiers
          },
          sustains: {
            needed: sustainsNeeded,
            filled: ownedSustains.length,
            owned: ownedSustains
          },
          ...(subDPSNeeded > 0 ? {
            subDPS: {
              needed: subDPSNeeded,
              filled: ownedSubDPS.length,
              owned: ownedSubDPS
            }
          } : {}),
        },
        recommendedCategory,
      };
    }
  }

  return bestComposition;
}

/**
 * Find DPS where the user lacks good alternatives for the recommended character's role.
 * This is the inverse of findRoleOverlap - instead of "you have alternatives",
 * it shows "you DON'T have alternatives, making this character more valuable".
 *
 * Logic:
 * 1. For each DPS that wants the recommended char
 * 2. Find which category (amplifiers/sustains/subDPS) the recommendation is in
 * 3. Check what the user's BEST owned option is in that category
 * 4. If the best owned is worse than the recommended (or none exists), it's a gap
 *
 * @deprecated Use findSlotBasedGaps instead for slot-aware gap analysis
 */
export function findRosterGaps(
  recommendedCharId: string,
  _recommendedCharRating: TeammateRating, // Kept for API compatibility, but we use per-DPS ratings
  ownedIds: Set<string>,
  wantedByDPS: { dpsId: string; dpsChar: Character; rating: TeammateRating }[],
  allCharacters: Character[]
): RosterGapEntry[] {
  const gaps: RosterGapEntry[] = [];
  const ratingOrder: TeammateRating[] = ['S+', 'S', 'A', 'B', 'C', 'D'];
  const categoryLabels: { [key: string]: string } = {
    amplifiers: 'amplifier',
    sustains: 'sustain',
    subDPS: 'sub-DPS',
  };

  for (const { dpsId, dpsChar, rating: recRating } of wantedByDPS) {
    const teammates = getTeammatesForComposition(dpsChar);

    const categories: Array<{ key: 'amplifiers' | 'sustains' | 'subDPS'; items: TeammateRec[] | undefined }> = [
      { key: 'amplifiers', items: teammates.amplifiers },
      { key: 'sustains', items: teammates.sustains },
      { key: 'subDPS', items: teammates.subDPS },
    ];

    for (const { key: category, items } of categories) {
      if (!items) continue;

      // Check if recommended char is in this category
      const recInCategory = items.find(t => t.id === recommendedCharId);
      if (!recInCategory) continue;

      // Find the best owned alternative in this category (excluding the recommended char)
      let bestOwnedRating: TeammateRating | null = null;
      let bestOwnedName: string | null = null;

      for (const teammate of items) {
        if (teammate.id === recommendedCharId) continue;
        if (!ownedIds.has(teammate.id)) continue;

        // Only consider S or A rated options as "good"
        if (!['S+', 'S', 'A'].includes(teammate.rating)) continue;

        if (bestOwnedRating === null || ratingOrder.indexOf(teammate.rating) < ratingOrder.indexOf(bestOwnedRating)) {
          bestOwnedRating = teammate.rating;
          const char = allCharacters.find(c => c.id === teammate.id);
          bestOwnedName = char?.name || teammate.id;
        }
      }

      // It's a gap if:
      // 1. User has no S/A options at all, OR
      // 2. The recommended char is better than their best option
      const recRatingIdx = ratingOrder.indexOf(recRating);
      const bestOwnedIdx = bestOwnedRating ? ratingOrder.indexOf(bestOwnedRating) : 999;

      if (bestOwnedRating === null || recRatingIdx < bestOwnedIdx) {
        gaps.push({
          dpsId,
          dpsName: dpsChar.name,
          category,
          categoryLabel: categoryLabels[category] || category,
          recommendedRating: recRating,
          bestOwnedRating,
          bestOwnedName,
        });
      }
    }
  }

  return gaps;
}

/**
 * Find DPS where the recommended character fills a slot-based gap.
 *
 * NEW LOGIC (slot-aware):
 * 1. For each DPS that wants the recommended char, select best composition
 * 2. Analyze slot requirements vs owned options
 * 3. Report gap if: owned < needed AND recommended fills empty slot
 *
 * @param recommendedCharId - Character being recommended
 * @param ownedIds - Set of owned character IDs
 * @param wantedByDPS - List of DPS that want this character with ratings
 * @param allCharacters - All characters for name lookups
 * @returns Array of slot-based gap entries
 */
export function findSlotBasedGaps(
  recommendedCharId: string,
  ownedIds: Set<string>,
  wantedByDPS: { dpsId: string; dpsChar: Character; rating: TeammateRating }[],
  allCharacters: Character[]
): SlotBasedGapEntry[] {
  const gaps: SlotBasedGapEntry[] = [];
  const categoryLabels: Record<string, string> = {
    amplifiers: 'amplifier',
    sustains: 'sustain',
    subDPS: 'sub-DPS',
  };

  for (const { dpsId, dpsChar, rating: recRating } of wantedByDPS) {
    // Select best composition for this DPS where recommended char helps
    const compAnalysis = selectBestComposition(dpsChar, ownedIds, recommendedCharId, allCharacters);
    if (!compAnalysis) continue; // No valid composition found

    const { recommendedCategory, slotAnalysis, compositionId, compositionName, coveragePercent } = compAnalysis;
    if (!recommendedCategory) continue;

    const categoryData = slotAnalysis[recommendedCategory];
    if (!categoryData) continue;

    // Build owned options list with character names
    const ownedOptions = categoryData.owned.map(t => {
      const char = allCharacters.find(c => c.id === t.id);
      return {
        id: t.id,
        name: char?.name || t.id,
        rating: t.rating,
      };
    });

    gaps.push({
      dpsId,
      dpsName: dpsChar.name,
      compositionId,
      compositionName,
      category: recommendedCategory,
      categoryLabel: categoryLabels[recommendedCategory] || recommendedCategory,
      slotsNeeded: categoryData.needed,
      slotsFilled: categoryData.filled,
      ownedOptions,
      recommendedRating: recRating,
      coveragePercent,
    });
  }

  return gaps;
}

// ==================
// TEAM ANALYSIS (FULL ROSTER VIEW)
// ==================

/**
 * Analysis of a single DPS team showing all owned supports.
 */
export interface TeamAnalysis {
  dps: Character;
  dpsId: string;
  dpsName: string;

  // Composition info
  compositionId: string;
  compositionName: string;
  allCompositions: TeamComposition[]; // All available compositions for dropdown
  structure: { dps: number; amplifier: number; sustain: number };

  // Owned supports in each category (S/A/B rated)
  ownedAmplifiers: Array<{ character: Character; rating: TeammateRating }>;
  ownedSustains: Array<{ character: Character; rating: TeammateRating }>;
  ownedSubDPS: Array<{ character: Character; rating: TeammateRating }>;

  // Recommended character info
  recommendedCategory: 'amplifiers' | 'sustains' | 'subDPS' | null;
  recommendedRating: TeammateRating;

  // Status
  status: {
    type: 'fills' | 'upgrades' | 'sidegrade' | 'low';
    message: string;
  };
}

/**
 * Analyze teams that want a recommended character, showing full roster context.
 *
 * For each DPS that wants this character:
 * - Select best composition (or let user choose via dropdown)
 * - Show ALL owned S/A/B supports for that DPS
 * - Highlight recommended character
 * - Generate smart status message
 *
 * @param recommendedCharId - Character being recommended
 * @param ownedIds - Set of owned character IDs
 * @param wantedByDPS - List of DPS that want this character with ratings
 * @param allCharacters - All characters for lookups
 * @returns Array of team analyses
 */
export function analyzeTeamsForRecommendation(
  recommendedCharId: string,
  ownedIds: Set<string>,
  wantedByDPS: { dpsId: string; dpsChar: Character; rating: TeammateRating }[],
  allCharacters: Character[]
): TeamAnalysis[] {
  const analyses: TeamAnalysis[] = [];
  const ratingOrder: TeammateRating[] = ['S+', 'S', 'A', 'B', 'C', 'D'];

  for (const { dpsId, dpsChar, rating: recRating } of wantedByDPS) {
    // Select best composition for this DPS (highest coverage)
    const compAnalysis = selectBestComposition(dpsChar, ownedIds, recommendedCharId, allCharacters);

    // Fallback to primary composition if no gap found
    const composition = compAnalysis
      ? dpsChar.compositions?.find(c => c.id === compAnalysis.compositionId)
      : dpsChar.compositions?.find(c => c.isPrimary) || dpsChar.compositions?.[0];

    if (!composition) continue;

    const structure = composition.structure || { dps: 1, amplifier: 2, sustain: 1 };
    const teammates = getTeammatesForComposition(dpsChar, composition.id);

    // Find recommended character's category
    const inAmplifiers = teammates.amplifiers?.find(t => t.id === recommendedCharId);
    const inSustains = teammates.sustains?.find(t => t.id === recommendedCharId);
    const inSubDPS = teammates.subDPS?.find(t => t.id === recommendedCharId);

    let recommendedCategory: 'amplifiers' | 'sustains' | 'subDPS' | null = null;
    if (inAmplifiers) recommendedCategory = 'amplifiers';
    else if (inSustains) recommendedCategory = 'sustains';
    else if (inSubDPS) recommendedCategory = 'subDPS';

    if (!recommendedCategory) continue;

    // Get ALL S/A/B supports for this DPS in each category
    // Include BOTH owned AND the recommended character (even if not owned)
    const allAmplifiers = (teammates.amplifiers || [])
      .filter(t => ['S+', 'S', 'A', 'B'].includes(t.rating))
      .map(t => {
        const char = allCharacters.find(c => c.id === t.id);
        // Include if: (1) owned, OR (2) is the recommended character
        return char && (ownedIds.has(t.id) || t.id === recommendedCharId)
          ? { character: char, rating: t.rating }
          : null;
      })
      .filter((x): x is { character: Character; rating: TeammateRating } => x !== null)
      .sort((a, b) => ratingOrder.indexOf(a.rating) - ratingOrder.indexOf(b.rating));

    const allSustains = (teammates.sustains || [])
      .filter(t => ['S+', 'S', 'A', 'B'].includes(t.rating))
      .map(t => {
        const char = allCharacters.find(c => c.id === t.id);
        return char && (ownedIds.has(t.id) || t.id === recommendedCharId)
          ? { character: char, rating: t.rating }
          : null;
      })
      .filter((x): x is { character: Character; rating: TeammateRating } => x !== null)
      .sort((a, b) => ratingOrder.indexOf(a.rating) - ratingOrder.indexOf(b.rating));

    const allSubDPS = (teammates.subDPS || [])
      .filter(t => ['S+', 'S', 'A', 'B'].includes(t.rating))
      .map(t => {
        const char = allCharacters.find(c => c.id === t.id);
        return char && (ownedIds.has(t.id) || t.id === recommendedCharId)
          ? { character: char, rating: t.rating }
          : null;
      })
      .filter((x): x is { character: Character; rating: TeammateRating } => x !== null)
      .sort((a, b) => ratingOrder.indexOf(a.rating) - ratingOrder.indexOf(b.rating));

    // Calculate status message
    const ownedInCategory = recommendedCategory === 'amplifiers' ? allAmplifiers :
                           recommendedCategory === 'sustains' ? allSustains :
                           allSubDPS;

    const needed = structure[recommendedCategory === 'amplifiers' ? 'amplifier' :
                            recommendedCategory === 'sustains' ? 'sustain' : 'dps'] -
                  (recommendedCategory === 'subDPS' ? 1 : 0);

    const categoryLabel = recommendedCategory === 'amplifiers' ? 'amplifiers' :
                         recommendedCategory === 'sustains' ? 'sustains' : 'sub-DPS';

    const status = calculateTeamStatus(
      ownedInCategory,
      needed,
      recommendedCharId,
      recRating,
      categoryLabel,
      composition.name,
      ratingOrder,
      ownedIds
    );

    analyses.push({
      dps: dpsChar,
      dpsId,
      dpsName: dpsChar.name,
      compositionId: composition.id,
      compositionName: composition.name,
      allCompositions: dpsChar.compositions || [],
      structure,
      ownedAmplifiers: allAmplifiers,
      ownedSustains: allSustains,
      ownedSubDPS: allSubDPS,
      recommendedCategory,
      recommendedRating: recRating,
      status,
    });
  }

  return analyses;
}

/**
 * Regenerate team analysis for a specific DPS and composition.
 * Used when user changes composition dropdown.
 */
export function regenerateTeamAnalysisForComposition(
  dps: Character,
  compositionId: string,
  recommendedCharId: string,
  recommendedRating: TeammateRating,
  ownedIds: Set<string>,
  allCharacters: Character[]
): Omit<TeamAnalysis, 'dps' | 'dpsId' | 'dpsName' | 'allCompositions'> | null {
  const composition = dps.compositions?.find(c => c.id === compositionId);
  if (!composition) return null;

  const ratingOrder: TeammateRating[] = ['S+', 'S', 'A', 'B', 'C', 'D'];
  const structure = composition.structure || { dps: 1, amplifier: 2, sustain: 1 };
  const teammates = getTeammatesForComposition(dps, composition.id);

  // Find recommended character's category
  const inAmplifiers = teammates.amplifiers?.find(t => t.id === recommendedCharId);
  const inSustains = teammates.sustains?.find(t => t.id === recommendedCharId);
  const inSubDPS = teammates.subDPS?.find(t => t.id === recommendedCharId);

  let recommendedCategory: 'amplifiers' | 'sustains' | 'subDPS' | null = null;
  if (inAmplifiers) recommendedCategory = 'amplifiers';
  else if (inSustains) recommendedCategory = 'sustains';
  else if (inSubDPS) recommendedCategory = 'subDPS';

  if (!recommendedCategory) return null;

  // Get ALL S/A/B supports in each category (owned + recommended)
  const allAmplifiers = (teammates.amplifiers || [])
    .filter(t => ['S+', 'S', 'A', 'B'].includes(t.rating))
    .map(t => {
      const char = allCharacters.find(c => c.id === t.id);
      return char && (ownedIds.has(t.id) || t.id === recommendedCharId)
        ? { character: char, rating: t.rating }
        : null;
    })
    .filter((x): x is { character: Character; rating: TeammateRating } => x !== null)
    .sort((a, b) => ratingOrder.indexOf(a.rating) - ratingOrder.indexOf(b.rating));

  const allSustains = (teammates.sustains || [])
    .filter(t => ['S+', 'S', 'A', 'B'].includes(t.rating))
    .map(t => {
      const char = allCharacters.find(c => c.id === t.id);
      return char && (ownedIds.has(t.id) || t.id === recommendedCharId)
        ? { character: char, rating: t.rating }
        : null;
    })
    .filter((x): x is { character: Character; rating: TeammateRating } => x !== null)
    .sort((a, b) => ratingOrder.indexOf(a.rating) - ratingOrder.indexOf(b.rating));

  const allSubDPS = (teammates.subDPS || [])
    .filter(t => ['S+', 'S', 'A', 'B'].includes(t.rating))
    .map(t => {
      const char = allCharacters.find(c => c.id === t.id);
      return char && (ownedIds.has(t.id) || t.id === recommendedCharId)
        ? { character: char, rating: t.rating }
        : null;
    })
    .filter((x): x is { character: Character; rating: TeammateRating } => x !== null)
    .sort((a, b) => ratingOrder.indexOf(a.rating) - ratingOrder.indexOf(b.rating));

  // Calculate status message
  const ownedInCategory = recommendedCategory === 'amplifiers' ? allAmplifiers :
                         recommendedCategory === 'sustains' ? allSustains :
                         allSubDPS;

  const needed = structure[recommendedCategory === 'amplifiers' ? 'amplifier' :
                          recommendedCategory === 'sustains' ? 'sustain' : 'dps'] -
                (recommendedCategory === 'subDPS' ? 1 : 0);

  const categoryLabel = recommendedCategory === 'amplifiers' ? 'amplifiers' :
                       recommendedCategory === 'sustains' ? 'sustains' : 'sub-DPS';

  const status = calculateTeamStatus(
    ownedInCategory,
    needed,
    recommendedCharId,
    recommendedRating,
    categoryLabel,
    composition.name,
    ratingOrder,
    ownedIds
  );

  return {
    compositionId: composition.id,
    compositionName: composition.name,
    structure,
    ownedAmplifiers: allAmplifiers,
    ownedSustains: allSustains,
    ownedSubDPS: allSubDPS,
    recommendedCategory,
    recommendedRating,
    status,
  };
}

/**
 * Calculate smart status message for a team.
 */

function calculateTeamStatus(
  allInCategory: Array<{ character: Character; rating: TeammateRating }>,
  needed: number,
  recommendedCharId: string,
  recommendedRating: TeammateRating,
  categoryLabel: string,
  compositionName: string,
  ratingOrder: TeammateRating[],
  ownedIds: Set<string>
): { type: 'fills' | 'upgrades' | 'sidegrade' | 'low'; message: string } {
  // Count only OWNED characters (excluding recommended if not owned)
  const ownedCount = allInCategory.filter(c => ownedIds.has(c.character.id)).length;
  const recommendedIsOwned = ownedIds.has(recommendedCharId);

  // No owned options at all
  if (ownedCount === 0) {
    return {
      type: 'fills',
      message: `Fills critical gap (need ${needed} ${categoryLabel}, you have none)`,
    };
  }

  // Only owned option is the recommended one
  if (ownedCount === 1 && recommendedIsOwned) {
    return {
      type: 'fills',
      message: `Fills critical gap (need ${needed} ${categoryLabel}, this is your only one)`,
    };
  }

  // Owned less than needed - completes composition
  if (ownedCount < needed) {
    if (ownedCount === needed - 1) {
      return {
        type: 'fills',
        message: `Completes ${compositionName} (need ${needed} ${categoryLabel}, you have ${ownedCount})`,
      };
    }
    return {
      type: 'fills',
      message: `Fills critical gap (need ${needed} ${categoryLabel}, only have ${ownedCount})`,
    };
  }

  // Check if recommended upgrades someone (only compare against OWNED)
  const ownedOthers = allInCategory.filter(c => c.character.id !== recommendedCharId && ownedIds.has(c.character.id));
  if (ownedOthers.length > 0) {
    const bestOther = ownedOthers[0]; // Already sorted by rating
    if (!bestOther) {
      // Fallback (shouldn't happen but satisfies TypeScript)
      return {
        type: 'sidegrade',
        message: `Extra ${categoryLabel} slot (${ownedCount}/${needed} filled)`,
      };
    }

    const recRatingIdx = ratingOrder.indexOf(recommendedRating);
    const bestOtherIdx = ratingOrder.indexOf(bestOther.rating);

    // Recommended is BETTER than current best
    if (recRatingIdx < bestOtherIdx) {
      const tierGap = bestOtherIdx - recRatingIdx;

      if (tierGap >= 2) {
        return {
          type: 'upgrades',
          message: `Significant upgrade over ${bestOther.character.name} (${bestOther.rating} → ${recommendedRating})`,
        };
      } else {
        return {
          type: 'upgrades',
          message: `Upgrade over ${bestOther.character.name} (${bestOther.rating} → ${recommendedRating})`,
        };
      }
    }

    // Recommended is WORSE than current best
    if (recRatingIdx > bestOtherIdx) {
      // Already have exactly what you need with better options
      if (ownedCount === needed) {
        return {
          type: 'low',
          message: `Already covered (${bestOther.character.name} fills this role)`,
        };
      }

      // Have more than needed with better options
      if (ownedCount > needed) {
        return {
          type: 'low',
          message: `Not needed (you have ${ownedCount} options, only need ${needed})`,
        };
      }

      return {
        type: 'low',
        message: `${bestOther.character.name} is better (${bestOther.rating} vs ${recommendedRating})`,
      };
    }

    // Same rating as best option
    // Check if recommended would replace someone in the top N slots (where N = needed)
    const topNOwned = ownedOthers.slice(0, needed); // Best characters that would fill the slots
    const worstInTopN = topNOwned[topNOwned.length - 1];

    if (worstInTopN) {
      const worstInTopNIdx = ratingOrder.indexOf(worstInTopN.rating);

      if (recRatingIdx < worstInTopNIdx) {
        // Would upgrade one of the top N slots
        return {
          type: 'upgrades',
          message: `Upgrade over ${worstInTopN.character.name} (${worstInTopN.rating} → ${recommendedRating})`,
        };
      }
    }

    // Top N slots all filled with same or better rating
    if (ownedCount === needed) {
      return {
        type: 'sidegrade',
        message: `Alternative option (same tier as ${bestOther.character.name})`,
      };
    } else {
      return {
        type: 'sidegrade',
        message: `Extra ${categoryLabel} slot (${ownedCount}/${needed} filled)`,
      };
    }
  }

  // Fallback (no owned others, shouldn't happen often)
  return {
    type: 'sidegrade',
    message: `Extra ${categoryLabel} slot (${ownedCount}/${needed} filled)`,
  };
}

/**
 * Generate teams that would include a character if added to roster.
 *
 * Logic:
 * 1. Create simulated roster with character added
 * 2. For each owned DPS, generate best team with simulated roster
 * 3. Keep only teams where the new character appears
 * 4. Return top N teams
 */
export function getTeamsWithCharacter(
  characterId: string,
  ownedCharacters: Character[],
  allCharacters: Character[],
  options: { maxTeams?: number; gameMode?: GameMode; getInvestment?: (id: string) => UserCharacterInvestment | undefined } = {}
): GeneratedTeam[] {
  const { maxTeams = 3, gameMode = 'moc', getInvestment } = options;

  // Get the character to add
  const charToAdd = allCharacters.find(c => c.id === characterId);
  if (!charToAdd) return [];

  // Create simulated roster
  const simulatedRoster = [...ownedCharacters];
  if (!simulatedRoster.some(c => c.id === characterId)) {
    simulatedRoster.push(charToAdd);
  }

  // Find owned DPS characters
  const ownedDPS = ownedCharacters.filter(c =>
    c.roles.includes('DPS') || c.roles.includes('Support DPS')
  );

  // Generate best team for each DPS
  const teams: GeneratedTeam[] = [];
  for (const dps of ownedDPS) {
    const dpsTeams = generateTeams(dps, simulatedRoster, {
      maxTeams: 1,
      gameMode,
      getInvestment
    });

    // Only include if the new character appears in the team
    for (const team of dpsTeams) {
      if (team.characters.some(c => c.id === characterId)) {
        teams.push(team);
      }
    }
  }

  // Sort by score and return top N
  teams.sort((a, b) => b.score - a.score);
  return teams.slice(0, maxTeams);
}

export interface PullVerdict {
  // Support verdicts: critical, strong, flex, skip
  // DPS verdicts: ready, viable, weak, skip
  level: 'critical' | 'strong' | 'flex' | 'skip' | 'ready' | 'viable' | 'weak';
  reason: string;
  score: number; // Raw score for sorting
}

/**
 * Convert tier string (T0, T0.5, T1, etc.) to numeric weight.
 * Higher tier DPS = higher weight for scoring.
 */
function getTierWeight(tierStr: string | undefined): number {
  if (!tierStr) return 0.5;
  switch (tierStr) {
    case 'T0': return 2.0;
    case 'T0.5': return 1.75;
    case 'T1': return 1.5;
    case 'T1.5': return 1.25;
    case 'T2': return 1.0;
    case 'T3': return 0.6;
    case 'T4': return 0.4;
    case 'T5': return 0.3;
    default: return 0.5;
  }
}

/**
 * Convert teammate rating to numeric weight.
 */
function getRatingWeight(rating: TeammateRating): number {
  switch (rating) {
    case 'S+': return 1.5;
    case 'S': return 1.2;
    case 'A': return 1.0;
    case 'B': return 0.7;
    case 'C': return 0.5;
    case 'D': return 0.3;
    default: return 0.5;
  }
}

/**
 * Calculate coverage percentage for a team based on structure and owned supports.
 */
function calculateCoverage(
  structure: { dps: number; amplifier: number; sustain: number },
  ownedAmplifiers: number,
  ownedSustains: number,
  ownedSubDPS: number,
  isRecommendedOwned: boolean
): number {
  const totalSlots = structure.amplifier + structure.sustain + (structure.dps > 1 ? structure.dps - 1 : 0);
  if (totalSlots === 0) return 100;

  // Count filled slots (excluding the recommended character if not owned)
  let filledSlots = 0;

  // Amplifiers
  filledSlots += Math.min(ownedAmplifiers, structure.amplifier);

  // Sustains
  filledSlots += Math.min(ownedSustains, structure.sustain);

  // Sub-DPS (if structure.dps > 1)
  if (structure.dps > 1) {
    filledSlots += Math.min(ownedSubDPS, structure.dps - 1);
  }

  // If recommended is not owned, they're not actually filling a slot yet
  if (!isRecommendedOwned) {
    filledSlots = Math.max(0, filledSlots - 1);
  }

  return (filledSlots / totalSlots) * 100;
}

/**
 * Unified scoring system for pull recommendations.
 *
 * Uses TeamAnalysis[] to calculate a score based on:
 * - Status type (fills/upgrades/sidegrade/low)
 * - DPS tier (T0 worth more than T3)
 * - Recommended rating (S worth more than B)
 * - Coverage (near-complete teams worth more)
 *
 * Returns verdict: CRITICAL (≥20), STRONG (≥12), FLEX (≥5), SKIP (<5)
 */
export function computePullVerdict(
  teamAnalysis: TeamAnalysis[],
  getDpsTier: (characterId: string) => string | undefined,
  isRecommendedOwned: boolean = false
): PullVerdict {
  if (teamAnalysis.length === 0) {
    return {
      level: 'skip',
      reason: 'No teams benefit from this character',
      score: 0,
    };
  }

  // Base scores by status type
  const statusBaseScore: Record<string, number> = {
    fills: 10,
    upgrades: 6,
    sidegrade: 2,
    low: 0,
  };

  // Calculate score per team
  interface TeamScore {
    dpsName: string;
    score: number;
    statusType: string;
    tier: string | undefined;
  }

  const teamScores: TeamScore[] = [];

  for (const team of teamAnalysis) {
    const baseScore = statusBaseScore[team.status.type] || 0;
    if (baseScore === 0) continue; // Skip "low" status teams

    const dpsTier = getDpsTier(team.dpsId);
    const dpsWeight = getTierWeight(dpsTier);
    const ratingWeight = getRatingWeight(team.recommendedRating);

    // Calculate coverage (how complete is the team?)
    const ownedAmpsCount = team.ownedAmplifiers.filter(a => a.character.id !== team.dpsId).length;
    const ownedSustainsCount = team.ownedSustains.length;
    const ownedSubDPSCount = team.ownedSubDPS?.length || 0;

    const coverage = calculateCoverage(
      team.structure,
      ownedAmpsCount,
      ownedSustainsCount,
      ownedSubDPSCount,
      isRecommendedOwned
    );

    // Coverage bonus: 80%+ = 1.3, 60-80% = 1.1, <60% = 1.0
    const coverageBonus = coverage >= 80 ? 1.3 : coverage >= 60 ? 1.1 : 1.0;

    const teamScore = baseScore * dpsWeight * ratingWeight * coverageBonus;

    teamScores.push({
      dpsName: team.dpsName,
      score: teamScore,
      statusType: team.status.type,
      tier: dpsTier,
    });
  }

  // Sort by score descending
  teamScores.sort((a, b) => b.score - a.score);

  // Aggregate with diminishing returns
  // First team: 100%, second: 50%, third: 25%, etc.
  let totalScore = 0;
  for (const [i, team] of teamScores.entries()) {
    const diminishingFactor = 1 / Math.pow(2, i);
    totalScore += team.score * diminishingFactor;
  }

  // Breadth bonus: reward supports wanted by multiple DPS with good ratings
  // Count S+/S/A rated entries from the original teamAnalysis
  const highRatingCount = teamAnalysis.filter(t =>
    ['S+', 'S', 'A'].includes(t.recommendedRating)
  ).length;

  // Bonus: +10% per S/A entry, capped at +50%
  const breadthBonus = Math.min(1 + (highRatingCount * 0.1), 1.5);
  totalScore *= breadthBonus;

  // Generate reason based on top contributors
  const reason = generateVerdictReason(teamScores);

  // Determine verdict level
  let level: 'critical' | 'strong' | 'flex' | 'skip';
  if (totalScore >= 20) {
    level = 'critical';
  } else if (totalScore >= 12) {
    level = 'strong';
  } else if (totalScore >= 5) {
    level = 'flex';
  } else {
    level = 'skip';
  }

  return { level, reason, score: totalScore };
}

/**
 * Generate a human-readable reason for the verdict.
 */
function generateVerdictReason(
  teamScores: Array<{ dpsName: string; score: number; statusType: string; tier: string | undefined }>
): string {
  if (teamScores.length === 0) {
    return 'Low priority for your roster';
  }

  // Group by status type
  const fillsTeams = teamScores.filter(t => t.statusType === 'fills');
  const upgradesTeams = teamScores.filter(t => t.statusType === 'upgrades');
  const sidegradeTeams = teamScores.filter(t => t.statusType === 'sidegrade');

  const parts: string[] = [];

  // Highlight fills (critical gaps)
  if (fillsTeams.length > 0) {
    const topFills = fillsTeams.slice(0, 2);
    const firstFill = topFills[0];
    if (topFills.length === 1 && firstFill) {
      parts.push(`Critical for ${firstFill.dpsName}`);
    } else {
      parts.push(`Critical for ${topFills.map(t => t.dpsName).join(' & ')}`);
    }
  }

  // Highlight upgrades
  if (upgradesTeams.length > 0 && parts.length < 2) {
    const topUpgrades = upgradesTeams.slice(0, 2 - parts.length);
    const firstUpgrade = topUpgrades[0];
    if (topUpgrades.length === 1 && firstUpgrade) {
      parts.push(`Upgrades ${firstUpgrade.dpsName}`);
    } else {
      parts.push(`Upgrades ${topUpgrades.length} teams`);
    }
  }

  // If only sidegrades
  if (parts.length === 0 && sidegradeTeams.length > 0) {
    const firstSidegrade = sidegradeTeams[0];
    if (sidegradeTeams.length === 1 && firstSidegrade) {
      parts.push(`Adds flexibility for ${firstSidegrade.dpsName}`);
    } else {
      parts.push(`Adds flexibility for ${sidegradeTeams.length} teams`);
    }
  }

  // Fallback
  if (parts.length === 0) {
    return 'Low priority for your roster';
  }

  return parts.join(', ');
}

// ==================
// DPS TEAM BUILDING ANALYSIS
// ==================

/**
 * Analysis of what supports a user has for a recommended DPS.
 * Used in "For Your Supports" tab when recommending DPS characters.
 */
export interface DPSTeamBuildingAnalysis {
  // DPS info
  dps: Character;
  dpsId: string;
  dpsName: string;

  // Composition info
  compositionId: string;
  compositionName: string;
  allCompositions: TeamComposition[];
  structure: { dps: number; amplifier: number; sustain: number };

  // Owned supports in each category (that this DPS wants, S/A/B rated)
  ownedAmplifiers: Array<{ character: Character; rating: TeammateRating }>;
  ownedSustains: Array<{ character: Character; rating: TeammateRating }>;
  ownedSubDPS: Array<{ character: Character; rating: TeammateRating }>;

  // Coverage info (additional DPS = structure.dps - 1, since main DPS takes one slot)
  amplifierCoverage: { filled: number; needed: number };
  sustainCoverage: { filled: number; needed: number };
  additionalDPSCoverage: { filled: number; needed: number }; // Sub-DPS or second DPS slots
  totalCoverage: number; // 0-100 percentage

  // Quality score (0-1) based on ratings of top N characters filling each role
  // S+ = 1.0, S = 0.9, A = 0.8, B = 0.6
  qualityScore: number;

  // Status
  status: {
    type: 'ready' | 'almost' | 'partial' | 'hard';
    message: string;
  };

  // Missing recommendations (top S/A rated supports user doesn't own)
  missingRecommendations: Array<{ name: string; rating: TeammateRating; category: string }>;
}

/**
 * Analyze what supports a user has for a recommended DPS.
 *
 * For the recommended DPS:
 * - Look at their teammate requirements (amplifiers, sustains)
 * - Check which S/A/B rated supports the user owns
 * - Calculate coverage and generate status message
 *
 * @param dpsCharacter - The DPS character being recommended
 * @param ownedIds - Set of owned character IDs
 * @param allCharacters - All characters for lookups
 * @returns DPS team building analysis
 */
export function analyzeTeamBuildingForDPS(
  dpsCharacter: Character,
  ownedIds: Set<string>,
  allCharacters: Character[]
): DPSTeamBuildingAnalysis | null {
  const ratingOrder: TeammateRating[] = ['S+', 'S', 'A', 'B', 'C', 'D'];

  // Get all compositions for the DPS
  const allCompositions = dpsCharacter.compositions || [];
  if (allCompositions.length === 0) return null;

  // Find best composition (highest coverage)
  let bestComposition = allCompositions.find(c => c.isPrimary) || allCompositions[0];
  let bestCoverage = -1;

  for (const comp of allCompositions) {
    const teammates = getTeammatesForComposition(dpsCharacter, comp.id);
    const structure = comp.structure || { dps: 1, amplifier: 2, sustain: 1 };

    // Count owned S/A/B rated supports for this composition
    const ownedAmps = (teammates.amplifiers || [])
      .filter(t => ['S+', 'S', 'A', 'B'].includes(t.rating) && ownedIds.has(t.id))
      .length;
    const ownedSus = (teammates.sustains || [])
      .filter(t => ['S+', 'S', 'A', 'B'].includes(t.rating) && ownedIds.has(t.id))
      .length;

    const ampCoverage = Math.min(ownedAmps, structure.amplifier) / Math.max(structure.amplifier, 1);
    const susCoverage = Math.min(ownedSus, structure.sustain) / Math.max(structure.sustain, 1);
    const totalCoverage = (ampCoverage + susCoverage) / 2;

    if (totalCoverage > bestCoverage) {
      bestCoverage = totalCoverage;
      bestComposition = comp;
    }
  }

  if (!bestComposition) return null;

  const composition = bestComposition;
  const structure = composition.structure || { dps: 1, amplifier: 2, sustain: 1 };
  const teammates = getTeammatesForComposition(dpsCharacter, composition.id);

  // Collect owned S/A/B supports for each category
  const ownedAmplifiers = (teammates.amplifiers || [])
    .filter(t => ['S+', 'S', 'A', 'B'].includes(t.rating))
    .map(t => {
      const char = allCharacters.find(c => c.id === t.id);
      return char && ownedIds.has(t.id) ? { character: char, rating: t.rating } : null;
    })
    .filter((x): x is { character: Character; rating: TeammateRating } => x !== null)
    .sort((a, b) => ratingOrder.indexOf(a.rating) - ratingOrder.indexOf(b.rating));

  const ownedSustains = (teammates.sustains || [])
    .filter(t => ['S+', 'S', 'A', 'B'].includes(t.rating))
    .map(t => {
      const char = allCharacters.find(c => c.id === t.id);
      return char && ownedIds.has(t.id) ? { character: char, rating: t.rating } : null;
    })
    .filter((x): x is { character: Character; rating: TeammateRating } => x !== null)
    .sort((a, b) => ratingOrder.indexOf(a.rating) - ratingOrder.indexOf(b.rating));

  const ownedSubDPS = (teammates.subDPS || [])
    .filter(t => ['S+', 'S', 'A', 'B'].includes(t.rating))
    .map(t => {
      const char = allCharacters.find(c => c.id === t.id);
      return char && ownedIds.has(t.id) ? { character: char, rating: t.rating } : null;
    })
    .filter((x): x is { character: Character; rating: TeammateRating } => x !== null)
    .sort((a, b) => ratingOrder.indexOf(a.rating) - ratingOrder.indexOf(b.rating));

  // Calculate coverage
  // Additional DPS slots = structure.dps - 1 (main DPS takes one slot)
  const additionalDPSNeeded = Math.max(0, structure.dps - 1);
  const additionalDPSFilled = Math.min(ownedSubDPS.length, additionalDPSNeeded);

  const ampFilled = Math.min(ownedAmplifiers.length, structure.amplifier);
  const susFilled = Math.min(ownedSustains.length, structure.sustain);
  const ampNeeded = structure.amplifier;
  const susNeeded = structure.sustain;

  const totalNeeded = ampNeeded + susNeeded + additionalDPSNeeded;
  const totalFilled = ampFilled + susFilled + additionalDPSFilled;
  const totalCoverage = totalNeeded > 0 ? Math.round((totalFilled / totalNeeded) * 100) : 100;

  // Calculate quality score based on top N characters per role (N = slots needed)
  // S+ = 1.0, S = 0.9, A = 0.8, B = 0.6
  const ratingToQuality: Record<TeammateRating, number> = {
    'S+': 1.0, 'S': 0.9, 'A': 0.8, 'B': 0.6, 'C': 0.4, 'D': 0.2,
  };

  // Take top N characters by rating for each role
  const topAmplifiers = ownedAmplifiers.slice(0, ampNeeded);
  const topSustains = ownedSustains.slice(0, susNeeded);
  const topSubDPS = ownedSubDPS.slice(0, additionalDPSNeeded);

  // Collect quality values from filled slots only
  const qualityValues: number[] = [
    ...topAmplifiers.map(t => ratingToQuality[t.rating] || 0.5),
    ...topSustains.map(t => ratingToQuality[t.rating] || 0.5),
    ...topSubDPS.map(t => ratingToQuality[t.rating] || 0.5),
  ];

  // Average quality of filled slots (0-1), default to 0 if no slots filled
  const qualityScore = qualityValues.length > 0
    ? qualityValues.reduce((sum, q) => sum + q, 0) / qualityValues.length
    : 0;

  // Find missing recommendations (S/A rated supports user doesn't own)
  const missingRecommendations: Array<{ name: string; rating: TeammateRating; category: string }> = [];

  if (ampFilled < ampNeeded) {
    const missingAmps = (teammates.amplifiers || [])
      .filter(t => ['S+', 'S', 'A'].includes(t.rating) && !ownedIds.has(t.id))
      .slice(0, 3);
    for (const t of missingAmps) {
      const char = allCharacters.find(c => c.id === t.id);
      if (char) {
        missingRecommendations.push({ name: char.name, rating: t.rating, category: 'amplifier' });
      }
    }
  }

  if (susFilled < susNeeded) {
    const missingSus = (teammates.sustains || [])
      .filter(t => ['S+', 'S', 'A'].includes(t.rating) && !ownedIds.has(t.id))
      .slice(0, 3);
    for (const t of missingSus) {
      const char = allCharacters.find(c => c.id === t.id);
      if (char) {
        missingRecommendations.push({ name: char.name, rating: t.rating, category: 'sustain' });
      }
    }
  }

  if (additionalDPSFilled < additionalDPSNeeded) {
    const missingDPS = (teammates.subDPS || [])
      .filter(t => ['S+', 'S', 'A'].includes(t.rating) && !ownedIds.has(t.id))
      .slice(0, 3);
    for (const t of missingDPS) {
      const char = allCharacters.find(c => c.id === t.id);
      if (char) {
        missingRecommendations.push({ name: char.name, rating: t.rating, category: 'sub-DPS' });
      }
    }
  }

  // Generate status
  const status = calculateDPSBuildStatus(
    totalCoverage,
    qualityScore,
    ampFilled,
    ampNeeded,
    susFilled,
    susNeeded,
    additionalDPSFilled,
    additionalDPSNeeded,
    missingRecommendations
  );

  return {
    dps: dpsCharacter,
    dpsId: dpsCharacter.id,
    dpsName: dpsCharacter.name,
    compositionId: composition.id,
    compositionName: composition.name,
    allCompositions,
    structure,
    ownedAmplifiers,
    ownedSustains,
    ownedSubDPS,
    amplifierCoverage: { filled: ampFilled, needed: ampNeeded },
    sustainCoverage: { filled: susFilled, needed: susNeeded },
    additionalDPSCoverage: { filled: additionalDPSFilled, needed: additionalDPSNeeded },
    totalCoverage,
    qualityScore,
    status,
    missingRecommendations,
  };
}

/**
 * Calculate status message for DPS team building.
 * Takes into account both coverage and quality of teammates.
 */
function calculateDPSBuildStatus(
  coverage: number,
  qualityScore: number,
  ampFilled: number,
  ampNeeded: number,
  susFilled: number,
  susNeeded: number,
  additionalDPSFilled: number,
  additionalDPSNeeded: number,
  missingRecs: Array<{ name: string; rating: TeammateRating; category: string }>
): { type: 'ready' | 'almost' | 'partial' | 'hard'; message: string } {
  // Helper to build missing list
  const buildMissingList = (): string[] => {
    const missing: string[] = [];
    if (ampFilled < ampNeeded) {
      const count = ampNeeded - ampFilled;
      missing.push(`${count} amplifier${count > 1 ? 's' : ''}`);
    }
    if (susFilled < susNeeded) {
      const count = susNeeded - susFilled;
      missing.push(`${count} sustain${count > 1 ? 's' : ''}`);
    }
    if (additionalDPSFilled < additionalDPSNeeded) {
      const count = additionalDPSNeeded - additionalDPSFilled;
      missing.push(`${count} sub-DPS`);
    }
    return missing;
  };

  // Quality thresholds: high ≥ 0.85 (mostly S/S+), medium ≥ 0.7 (mostly A or mixed S/B)
  const highQuality = qualityScore >= 0.85;
  const mediumQuality = qualityScore >= 0.7;

  // 100% coverage - ready to build (quality affects message)
  if (coverage >= 100) {
    if (highQuality) {
      return {
        type: 'ready',
        message: 'Ready to build with strong teammates!',
      };
    } else if (mediumQuality) {
      return {
        type: 'ready',
        message: 'Ready to build with decent teammates.',
      };
    } else {
      // Low quality (< 0.7) - can build but teammates are weak
      return {
        type: 'partial',
        message: 'Can build, but your teammates are weak. Consider upgrading.',
      };
    }
  }

  // 80%+ coverage - almost ready
  if (coverage >= 80) {
    const missing = buildMissingList();
    return {
      type: 'almost',
      message: `Almost ready — need ${missing.join(', ')}`,
    };
  }

  // 50-80% coverage - partial
  if (coverage >= 50) {
    const missing = buildMissingList();
    const recNames = missingRecs.slice(0, 2).map(r => r.name).join(', ');
    const recSuffix = recNames ? ` (${recNames} recommended)` : '';

    return {
      type: 'partial',
      message: `Partially ready — need ${missing.join(', ')}${recSuffix}`,
    };
  }

  // <50% coverage - hard to build
  const recNames = missingRecs.slice(0, 3).map(r => r.name).join(', ');
  const recSuffix = recNames ? ` Consider pulling ${recNames}.` : '';

  return {
    type: 'hard',
    message: `Missing key teammates.${recSuffix}`,
  };
}

/**
 * Regenerate DPS team building analysis for a specific composition.
 * Used when user changes composition dropdown.
 */
export function regenerateDPSAnalysisForComposition(
  dps: Character,
  compositionId: string,
  ownedIds: Set<string>,
  allCharacters: Character[]
): Omit<DPSTeamBuildingAnalysis, 'dps' | 'dpsId' | 'dpsName' | 'allCompositions'> | null {
  const composition = dps.compositions?.find(c => c.id === compositionId);
  if (!composition) return null;

  const ratingOrder: TeammateRating[] = ['S+', 'S', 'A', 'B', 'C', 'D'];
  const structure = composition.structure || { dps: 1, amplifier: 2, sustain: 1 };
  const teammates = getTeammatesForComposition(dps, composition.id);

  // Collect owned S/A/B supports for each category
  const ownedAmplifiers = (teammates.amplifiers || [])
    .filter(t => ['S+', 'S', 'A', 'B'].includes(t.rating))
    .map(t => {
      const char = allCharacters.find(c => c.id === t.id);
      return char && ownedIds.has(t.id) ? { character: char, rating: t.rating } : null;
    })
    .filter((x): x is { character: Character; rating: TeammateRating } => x !== null)
    .sort((a, b) => ratingOrder.indexOf(a.rating) - ratingOrder.indexOf(b.rating));

  const ownedSustains = (teammates.sustains || [])
    .filter(t => ['S+', 'S', 'A', 'B'].includes(t.rating))
    .map(t => {
      const char = allCharacters.find(c => c.id === t.id);
      return char && ownedIds.has(t.id) ? { character: char, rating: t.rating } : null;
    })
    .filter((x): x is { character: Character; rating: TeammateRating } => x !== null)
    .sort((a, b) => ratingOrder.indexOf(a.rating) - ratingOrder.indexOf(b.rating));

  const ownedSubDPS = (teammates.subDPS || [])
    .filter(t => ['S+', 'S', 'A', 'B'].includes(t.rating))
    .map(t => {
      const char = allCharacters.find(c => c.id === t.id);
      return char && ownedIds.has(t.id) ? { character: char, rating: t.rating } : null;
    })
    .filter((x): x is { character: Character; rating: TeammateRating } => x !== null)
    .sort((a, b) => ratingOrder.indexOf(a.rating) - ratingOrder.indexOf(b.rating));

  // Calculate coverage
  // Additional DPS slots = structure.dps - 1 (main DPS takes one slot)
  const additionalDPSNeeded = Math.max(0, structure.dps - 1);
  const additionalDPSFilled = Math.min(ownedSubDPS.length, additionalDPSNeeded);

  const ampFilled = Math.min(ownedAmplifiers.length, structure.amplifier);
  const susFilled = Math.min(ownedSustains.length, structure.sustain);
  const ampNeeded = structure.amplifier;
  const susNeeded = structure.sustain;

  const totalNeeded = ampNeeded + susNeeded + additionalDPSNeeded;
  const totalFilled = ampFilled + susFilled + additionalDPSFilled;
  const totalCoverage = totalNeeded > 0 ? Math.round((totalFilled / totalNeeded) * 100) : 100;

  // Calculate quality score based on top N characters per role (N = slots needed)
  const ratingToQuality: Record<TeammateRating, number> = {
    'S+': 1.0, 'S': 0.9, 'A': 0.8, 'B': 0.6, 'C': 0.4, 'D': 0.2,
  };

  const topAmplifiers = ownedAmplifiers.slice(0, ampNeeded);
  const topSustains = ownedSustains.slice(0, susNeeded);
  const topSubDPS = ownedSubDPS.slice(0, additionalDPSNeeded);

  const qualityValues: number[] = [
    ...topAmplifiers.map(t => ratingToQuality[t.rating] || 0.5),
    ...topSustains.map(t => ratingToQuality[t.rating] || 0.5),
    ...topSubDPS.map(t => ratingToQuality[t.rating] || 0.5),
  ];

  const qualityScore = qualityValues.length > 0
    ? qualityValues.reduce((sum, q) => sum + q, 0) / qualityValues.length
    : 0;

  // Find missing recommendations
  const missingRecommendations: Array<{ name: string; rating: TeammateRating; category: string }> = [];

  if (ampFilled < ampNeeded) {
    const missingAmps = (teammates.amplifiers || [])
      .filter(t => ['S+', 'S', 'A'].includes(t.rating) && !ownedIds.has(t.id))
      .slice(0, 3);
    for (const t of missingAmps) {
      const char = allCharacters.find(c => c.id === t.id);
      if (char) {
        missingRecommendations.push({ name: char.name, rating: t.rating, category: 'amplifier' });
      }
    }
  }

  if (susFilled < susNeeded) {
    const missingSus = (teammates.sustains || [])
      .filter(t => ['S+', 'S', 'A'].includes(t.rating) && !ownedIds.has(t.id))
      .slice(0, 3);
    for (const t of missingSus) {
      const char = allCharacters.find(c => c.id === t.id);
      if (char) {
        missingRecommendations.push({ name: char.name, rating: t.rating, category: 'sustain' });
      }
    }
  }

  if (additionalDPSFilled < additionalDPSNeeded) {
    const missingDPS = (teammates.subDPS || [])
      .filter(t => ['S+', 'S', 'A'].includes(t.rating) && !ownedIds.has(t.id))
      .slice(0, 3);
    for (const t of missingDPS) {
      const char = allCharacters.find(c => c.id === t.id);
      if (char) {
        missingRecommendations.push({ name: char.name, rating: t.rating, category: 'sub-DPS' });
      }
    }
  }

  const status = calculateDPSBuildStatus(
    totalCoverage,
    qualityScore,
    ampFilled,
    ampNeeded,
    susFilled,
    susNeeded,
    additionalDPSFilled,
    additionalDPSNeeded,
    missingRecommendations
  );

  return {
    compositionId: composition.id,
    compositionName: composition.name,
    structure,
    ownedAmplifiers,
    ownedSustains,
    ownedSubDPS,
    amplifierCoverage: { filled: ampFilled, needed: ampNeeded },
    sustainCoverage: { filled: susFilled, needed: susNeeded },
    additionalDPSCoverage: { filled: additionalDPSFilled, needed: additionalDPSNeeded },
    totalCoverage,
    qualityScore,
    status,
    missingRecommendations,
  };
}

/**
 * Compute pull verdict for a DPS character based on team building analysis.
 *
 * INVERTED LOGIC vs support verdict:
 * - High coverage = High score (you CAN build for this DPS)
 * - Low coverage = Low score (you CAN'T build for this DPS)
 *
 * @param analysis - DPS team building analysis
 * @param dpsTier - Tier of the DPS (T0, T1, etc.)
 * @param isOwned - Whether the DPS is already owned
 * @returns Pull verdict with level, reason, and score
 */
export function computeDPSPullVerdict(
  analysis: DPSTeamBuildingAnalysis | null,
  dpsTier: string | undefined,
  isOwned: boolean = false
): PullVerdict {
  if (!analysis) {
    return {
      level: 'skip',
      reason: 'No team data available',
      score: 0,
    };
  }

  if (isOwned) {
    return {
      level: 'skip',
      reason: 'Already owned',
      score: 0,
    };
  }

  // Base score from coverage (0-10) × quality (0-1)
  // This means 100% coverage with S-tier teammates = 10
  // 100% coverage with B-tier teammates = 6
  // 50% coverage with any quality = max 5
  const coverageRatio = analysis.totalCoverage / 100; // 0-1
  const baseScore = coverageRatio * analysis.qualityScore * 10;

  // DPS tier weight
  const tierWeight = getTierWeight(dpsTier);

  // Calculate final score
  const totalScore = baseScore * tierWeight;

  // Generate reason
  const reason = generateDPSVerdictReason(analysis, dpsTier);

  // Determine verdict level (DPS-specific labels)
  // With quality factored in, max score for T0 DPS with 100% S-tier coverage = 10 * 2.0 = 20
  // T0 with 100% B-tier coverage = 6 * 2.0 = 12
  // T0 with 50% S-tier coverage = 5 * 2.0 = 10
  let level: 'ready' | 'viable' | 'weak' | 'skip';
  if (totalScore >= 16) {
    level = 'ready'; // Strong teammates ready, pull with confidence
  } else if (totalScore >= 10) {
    level = 'viable'; // Decent team possible, can make it work
  } else if (totalScore >= 5) {
    level = 'weak'; // Support is lacking, team would struggle
  } else {
    level = 'skip'; // Can't build for this DPS
  }

  return { level, reason, score: totalScore };
}

/**
 * Generate a human-readable reason for DPS verdict.
 */
function generateDPSVerdictReason(
  analysis: DPSTeamBuildingAnalysis,
  dpsTier: string | undefined
): string {
  const tierLabel = dpsTier ? ` (${dpsTier})` : '';

  if (analysis.status.type === 'ready') {
    return `Ready to build${tierLabel}`;
  }

  if (analysis.status.type === 'almost') {
    return `Almost ready${tierLabel}`;
  }

  if (analysis.status.type === 'partial') {
    const missing = analysis.missingRecommendations.slice(0, 2).map(r => r.name).join(', ');
    return missing ? `Need ${missing}` : `Partially ready${tierLabel}`;
  }

  return 'Missing key supports';
}
