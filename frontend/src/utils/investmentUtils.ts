// ========================================
// Investment Utilities for User Roster
// ========================================
// These utilities work with user investment data (eidolons, light cones)
// to calculate penalties, synergy modifiers, and scoring adjustments.

import type {
  Character,
  OwnershipStatus,
  UserCharacterInvestment,
  UserRosterMap,
} from '../types';
import { createDefaultInvestment, isLegacyOwnership } from '../types';
import type { InvestmentLevel, SynergyBreakdown } from './characterUtils';

// ========================================
// Roster Migration
// ========================================

/**
 * Migrate legacy roster format (Map<string, OwnershipStatus>) to new format (UserRosterMap).
 * Safe to call multiple times - will preserve existing investment data.
 */
export function migrateRoster(
  legacyEntries: [string, OwnershipStatus | UserCharacterInvestment][]
): [string, UserCharacterInvestment][] {
  return legacyEntries.map(([id, value]) => {
    if (isLegacyOwnership(value)) {
      // Legacy format: convert string to full investment object
      return [id, createDefaultInvestment(value)];
    }
    // Already new format
    return [id, value];
  });
}

/**
 * Check if roster data needs migration.
 */
export function needsMigration(
  entries: [string, unknown][]
): boolean {
  if (entries.length === 0) return false;
  // Check first entry - if it's a string, needs migration
  const firstEntry = entries[0];
  if (!firstEntry) return false;
  return typeof firstEntry[1] === 'string';
}

// ========================================
// User Investment Access
// ========================================

/**
 * Get user's investment for a character from roster.
 * Returns null if character not in roster.
 */
export function getUserInvestment(
  roster: UserRosterMap,
  characterId: string
): UserCharacterInvestment | null {
  return roster.get(characterId) || null;
}

/**
 * Get ownership status from user investment.
 * Convenience function for compatibility with existing code.
 */
export function getOwnershipFromInvestment(
  roster: UserRosterMap,
  characterId: string
): OwnershipStatus {
  const investment = roster.get(characterId);
  return investment?.ownership || 'none';
}

/**
 * Convert UserCharacterInvestment to InvestmentLevel (for use with characterUtils functions).
 */
export function toInvestmentLevel(investment: UserCharacterInvestment): InvestmentLevel {
  return {
    eidolonLevel: investment.eidolonLevel,
    lightConeId: investment.lightConeId,
    lightConeSuperimposition: investment.lightConeSuperimposition,
  };
}

/**
 * Build InvestmentLevel map from roster (for use with characterUtils functions).
 */
export function buildInvestmentMap(roster: UserRosterMap): Map<string, InvestmentLevel> {
  const map = new Map<string, InvestmentLevel>();
  for (const [id, investment] of roster) {
    if (investment.ownership !== 'none') {
      map.set(id, toInvestmentLevel(investment));
    }
  }
  return map;
}

// ========================================
// Investment Penalty Calculation
// ========================================

/**
 * Default penalty for using a generic/non-recommended light cone.
 * This is worse than the worst recommended LC because:
 * - No synergy with character kit
 * - Wrong stats or effects
 * - Missing path-specific bonuses
 */
const GENERIC_LC_PENALTY = -40;

/**
 * Calculate total penalty for a character based on user's investment.
 * Perfect investment (E6 + Signature S5) = 0 penalty.
 * Lower investment = cumulative penalties.
 *
 * @param character The character with investment data
 * @param userInvestment User's actual investment
 * @returns Total penalty (negative number, 0 = perfect)
 */
export function calculateUserPenalty(
  character: Character,
  userInvestment: UserCharacterInvestment
): number {
  if (!character.investment) return 0;

  let penalty = 0;

  // Eidolon penalties: sum penalties for all eidolons user DOESN'T have
  for (const eidolon of character.investment.eidolons) {
    if (userInvestment.eidolonLevel < eidolon.level) {
      penalty += eidolon.penalty;
    }
  }

  // Light cone penalty - two cases:
  // 1. Has specific recommended LC - use that LC's penalty
  // 2. No LC tracked or 'generic' - apply generic penalty

  if (userInvestment.lightConeId && userInvestment.lightConeId !== 'generic') {
    // User has a specific recommended LC
    const userLC = character.investment.lightCones.find(lc => lc.id === userInvestment.lightConeId);

    if (userLC) {
      // Get penalty for their superimposition
      // Only s1 and s5 are defined, so interpolate for s2-s4
      const superimposition = userInvestment.lightConeSuperimposition || 1;
      if (superimposition === 5) {
        penalty += userLC.penalties.s5;
      } else if (superimposition === 1) {
        penalty += userLC.penalties.s1;
      } else {
        // Interpolate between s1 and s5 for s2, s3, s4
        const s1Penalty = userLC.penalties.s1;
        const s5Penalty = userLC.penalties.s5;
        const fraction = (superimposition - 1) / 4; // 0.25 for S2, 0.5 for S3, 0.75 for S4
        penalty += Math.round(s1Penalty + (s5Penalty - s1Penalty) * fraction);
      }
    } else {
      // LC ID doesn't match any known LC - treat as generic
      penalty += GENERIC_LC_PENALTY;
    }
  } else {
    // No LC tracked (undefined) or explicitly generic - apply generic penalty
    penalty += GENERIC_LC_PENALTY;
  }

  return penalty;
}

/**
 * Calculate penalty as a percentage (for display).
 * 0% = perfect, 100% = max penalty (E0 + no LC).
 */
export function calculatePenaltyPercentage(
  character: Character,
  userInvestment: UserCharacterInvestment
): number {
  if (!character.investment) return 0;

  // Calculate max possible penalty (E0 + worst LC)
  let maxPenalty = 0;
  for (const eidolon of character.investment.eidolons) {
    maxPenalty += eidolon.penalty;
  }
  // Add worst LC penalty
  const worstLC = character.investment.lightCones.reduce((worst, lc) =>
    lc.penalties.s1 < worst.penalties.s1 ? lc : worst
  );
  maxPenalty += worstLC.penalties.s1;

  const userPenalty = calculateUserPenalty(character, userInvestment);

  if (maxPenalty === 0) return 0;
  return Math.round((userPenalty / maxPenalty) * 100);
}

// ========================================
// Synergy Modifier Analysis
// ========================================

/**
 * Get ACTIVE synergy modifiers between two owned characters.
 * Only returns modifiers that are currently active based on user investment.
 */
export function getActiveSynergyModifiers(
  charA: Character,
  charB: Character,
  investmentA: UserCharacterInvestment,
  investmentB: UserCharacterInvestment
): SynergyBreakdown[] {
  const active: SynergyBreakdown[] = [];

  // Check charA's investment for modifiers affecting charB
  checkCharacterModifiers(charA, charB.id, investmentA, active);

  // Check charB's investment for modifiers affecting charA
  checkCharacterModifiers(charB, charA.id, investmentB, active);

  return active;
}

/**
 * Get POTENTIAL synergy modifiers that user could unlock with more investment.
 * Returns modifiers that aren't active yet, with info about what's needed.
 */
export function getPotentialSynergyModifiers(
  charA: Character,
  charB: Character,
  investmentA: UserCharacterInvestment,
  investmentB: UserCharacterInvestment
): { modifier: SynergyBreakdown; requires: string }[] {
  const potential: { modifier: SynergyBreakdown; requires: string }[] = [];

  // Check charA's potential modifiers for charB
  checkPotentialModifiers(charA, charB.id, investmentA, potential);

  // Check charB's potential modifiers for charA
  checkPotentialModifiers(charB, charA.id, investmentB, potential);

  return potential;
}

// Helper: Check a character's investment for active modifiers
function checkCharacterModifiers(
  char: Character,
  targetId: string,
  investment: UserCharacterInvestment,
  results: SynergyBreakdown[]
) {
  if (!char.investment) return;

  // Check eidolons
  for (const eidolon of char.investment.eidolons) {
    if (investment.eidolonLevel >= eidolon.level && eidolon.synergyModifiers) {
      const mod = eidolon.synergyModifiers.find(m => m.withCharacterId === targetId);
      if (mod) {
        results.push({
          source: `${char.name} E${eidolon.level}`,
          value: mod.modifier,
          reason: mod.reason || '',
        });
      }
    }
  }

  // Check light cone
  if (investment.lightConeId) {
    const lc = char.investment.lightCones.find(l => l.id === investment.lightConeId);
    if (lc?.synergyModifiers) {
      const mod = lc.synergyModifiers.find(m => m.withCharacterId === targetId);
      if (mod) {
        results.push({
          source: `${char.name} + ${lc.name}`,
          value: mod.modifier,
          reason: mod.reason || '',
        });
      }
    }
  }
}

// Helper: Check a character's potential modifiers (not yet active)
function checkPotentialModifiers(
  char: Character,
  targetId: string,
  investment: UserCharacterInvestment,
  results: { modifier: SynergyBreakdown; requires: string }[]
) {
  if (!char.investment) return;

  // Check eidolons user doesn't have yet
  for (const eidolon of char.investment.eidolons) {
    if (investment.eidolonLevel < eidolon.level && eidolon.synergyModifiers) {
      const mod = eidolon.synergyModifiers.find(m => m.withCharacterId === targetId);
      if (mod) {
        results.push({
          modifier: {
            source: `${char.name} E${eidolon.level}`,
            value: mod.modifier,
            reason: mod.reason || '',
          },
          requires: `${char.name} E${eidolon.level}`,
        });
      }
    }
  }

  // Check light cones user doesn't have
  for (const lc of char.investment.lightCones) {
    if (investment.lightConeId !== lc.id && lc.synergyModifiers) {
      const mod = lc.synergyModifiers.find(m => m.withCharacterId === targetId);
      if (mod) {
        results.push({
          modifier: {
            source: `${char.name} + ${lc.name}`,
            value: mod.modifier,
            reason: mod.reason || '',
          },
          requires: `${char.name} with ${lc.name}`,
        });
      }
    }
  }
}

// ========================================
// Investment Info Helpers
// ========================================

/**
 * Get key investment notes for a character (for Pull Advisor display).
 * Returns strings describing important investment considerations.
 */
export function getInvestmentNotes(character: Character): string[] {
  if (!character.investment) return [];

  const notes: string[] = [];

  // Add minimum viable
  if (character.investment.minimumViable) {
    notes.push(`Minimum: ${character.investment.minimumViable}`);
  }

  // Find transformative eidolons (penalty >= 30)
  const transformative = character.investment.eidolons.filter(e => Math.abs(e.penalty) >= 30);
  for (const e of transformative) {
    notes.push(`E${e.level} is transformative`);
  }

  // Check signature LC importance
  const sigLC = character.investment.lightCones.find(lc => lc.isSignature);
  if (sigLC) {
    const sigGap = Math.abs(sigLC.penalties.s1);
    if (sigGap >= 20) {
      notes.push(`Signature LC important (-${sigGap} without)`);
    } else if (sigGap >= 10) {
      notes.push(`Signature LC recommended`);
    } else {
      notes.push(`F2P LC works well`);
    }
  }

  return notes;
}

/**
 * Get summary of a character's investment accessibility.
 * Returns a score from 0-1 where 1 = very accessible (E0 works fine),
 * 0 = very investment-dependent (needs E2+ or signature).
 */
export function getInvestmentAccessibility(character: Character): number {
  if (!character.investment) return 1;

  // Calculate how much penalty E0 + F2P has
  let e0Penalty = 0;
  for (const eidolon of character.investment.eidolons) {
    e0Penalty += eidolon.penalty;
  }

  // Best F2P LC
  const f2pLCs = character.investment.lightCones.filter(
    lc => !lc.isSignature && lc.source !== 'signature'
  );
  const bestF2P = f2pLCs.length > 0
    ? f2pLCs.reduce((best, lc) => lc.penalties.s5 > best.penalties.s5 ? lc : best)
    : null;
  const f2pPenalty = bestF2P?.penalties.s5 || -30;

  // Total penalty at E0 + F2P S5
  const totalPenalty = Math.abs(e0Penalty + f2pPenalty);

  // Convert to 0-1 scale (0 penalty = 1.0, 150 penalty = 0.0)
  return Math.max(0, 1 - totalPenalty / 150);
}

// ========================================
// Signature Light Cone Detection
// ========================================

/**
 * Get the superimposition level of user's equipped signature light cone.
 * Returns undefined if user doesn't have a signature LC equipped.
 */
export function getSignatureSuperimposition(
  character: Character,
  investment: UserCharacterInvestment | undefined
): 1 | 2 | 3 | 4 | 5 | undefined {
  if (!investment?.lightConeId || !character.investment?.lightCones) return undefined;

  const equippedLC = character.investment.lightCones.find(lc => lc.id === investment.lightConeId);
  if (!equippedLC?.isSignature) return undefined;

  return investment.lightConeSuperimposition || 1;
}
