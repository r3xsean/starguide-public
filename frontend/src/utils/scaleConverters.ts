// ========================================
// INVESTMENT EFFECTIVENESS CALCULATION
// ========================================

import type {
  Character,
  TierRating,
  UserCharacterInvestment,
} from '../types';
import { getTierData } from '../data/tierData';

/**
 * Scaling factors for converting raw penalties to effective impact.
 * Based on Prydwen performance data and community analysis.
 */
export const INVESTMENT_SCALING = {
  /**
   * Eidolon scaling: 20% of raw penalty
   * Doubled to make eidolons significantly more impactful.
   * Typical swing: 1-2 tiers based on eidolon investment.
   */
  EIDOLON: 0.20,

  /**
   * Light cone scaling: 65% of raw penalty
   * Matches Prydwen data showing ~20-25% performance gap
   * between signature and F2P light cones.
   */
  LIGHT_CONE: 0.65,
} as const;

/**
 * Gets the penalty for a specific light cone at a given superimposition.
 * Returns 0 if no LC data available (assume baseline).
 */
export function getLCPenalty(
  character: Character,
  lightConeId?: string,
  superimposition?: 1 | 2 | 3 | 4 | 5
): number {
  if (!character.investment?.lightCones) return 0;
  if (!lightConeId) return -40; // Generic penalty for no recommended LC

  const lc = character.investment.lightCones.find((l) => l.id === lightConeId);
  if (!lc) return -40; // Unknown LC = generic penalty

  // Get penalty for the specified superimposition
  const si = superimposition || 1;
  if (si === 1) return lc.penalties.s1;
  if (si === 5) return lc.penalties.s5;

  // Interpolate for S2-S4
  const s1Penalty = lc.penalties.s1;
  const s5Penalty = lc.penalties.s5;
  const penaltyPerLevel = (s5Penalty - s1Penalty) / 4;
  return s1Penalty + penaltyPerLevel * (si - 1);
}

/**
 * Calculates the total eidolon penalty for missing eidolons.
 * Returns 0 if no investment data available.
 */
export function getEidolonPenalty(
  character: Character,
  eidolonLevel: number
): number {
  if (!character.investment?.eidolons) return 0;

  let totalPenalty = 0;
  for (const eid of character.investment.eidolons) {
    if (eidolonLevel < eid.level) {
      totalPenalty += eid.penalty; // Penalty is already negative
    }
  }

  return totalPenalty;
}

/**
 * Calculates investment effectiveness as a percentage.
 *
 * This represents how close the character is to their maximum potential:
 * - 100% = E6 + Signature S5 (perfect investment)
 * - Lower values indicate underinvestment
 *
 * Formula:
 * effectiveness = 100% + (eidolonPenalty × 20%) + (lcPenalty × 65%)
 * Capped at max 100% to ensure base tier is never exceeded.
 *
 * @returns Percentage value (0-100%, capped to never exceed 100%)
 */
export function calculateInvestmentEffectiveness(
  character: Character,
  investment?: UserCharacterInvestment
): number {
  // No investment data = assume baseline (E0 for 5★, no penalty applied)
  if (!character.investment || !investment) return 100;

  const eidolonPenalty = getEidolonPenalty(character, investment.eidolonLevel);
  const lcPenalty = getLCPenalty(
    character,
    investment.lightConeId,
    investment.lightConeSuperimposition
  );

  // Apply scaling factors
  const scaledEidolon = eidolonPenalty * INVESTMENT_SCALING.EIDOLON;
  const scaledLC = lcPenalty * INVESTMENT_SCALING.LIGHT_CONE;
  const totalPenalty = scaledEidolon + scaledLC;

  // Calculate effectiveness (penalties are negative, so adding reduces from 100)
  // CRITICAL: Clamp to max 100% to ensure base tier is never exceeded
  const effectiveness = 100 + totalPenalty;
  return Math.min(effectiveness, 100);
}

/**
 * Gets the best tier rating for a character in a specific game mode.
 * Falls back to generic tier if mode-specific not found.
 */
export function getBestTierForMode(
  characterId: string,
  gameMode: 'moc' | 'pf' | 'as'
): TierRating {
  const charTiers = getTierData(characterId);
  if (!charTiers) return 'T5'; // Unknown character

  // Get mode-specific tiers
  const modeTiers = charTiers[gameMode];
  if (!modeTiers) return 'T5'; // No data for mode

  // Find the best tier across all roles
  const tiers = Object.values(modeTiers) as TierRating[];
  if (tiers.length === 0) return 'T5';

  // Return the highest tier (lowest number)
  const tierValues: Record<TierRating, number> = {
    'T-1': -1,
    'T-0.5': -0.5,
    'T0': 0,
    'T0.5': 0.5,
    'T1': 1,
    'T1.5': 1.5,
    'T2': 2,
    'T3': 3,
    'T4': 4,
    'T5': 5,
  };

  return tiers.reduce((best, current) =>
    tierValues[current] < tierValues[best] ? current : best
  );
}

/**
 * Calculates the effective score for a character based on their tier
 * and user's investment level.
 *
 * New model (E0 = Prydwen baseline):
 * - Prydwen tier = E0 + No LC baseline (no modifier)
 * - Investment ONLY improves score (never penalizes)
 * - Bonus directly reflects actual investment power gained
 *
 * @param character - The character to score
 * @param gameMode - Game mode for tier lookup (moc/pf/as)
 * @param investment - User's investment in this character
 * @returns Score value (can exceed 100 for max investment on T0 characters)
 */
export function getEffectiveScore(
  character: Character,
  gameMode: 'moc' | 'pf' | 'as',
  investment?: UserCharacterInvestment
): number {
  // Get base tier score from Prydwen (this is the E0 baseline)
  const baseTier = getBestTierForMode(character.id, gameMode);
  const TIER_SCORES_MAP: Record<TierRating, number> = {
    'T-1': 115,
    'T-0.5': 107,
    'T0': 100,
    'T0.5': 95,
    'T1': 85,
    'T1.5': 75,
    'T2': 65,
    'T3': 55,
    'T4': 45,
    'T5': 35,
  };
  const baseScore = TIER_SCORES_MAP[baseTier];

  // No investment data = return Prydwen baseline (E0, no bonus)
  if (!investment || !character.investment) {
    return baseScore;
  }

  // Calculate score bonus directly from owned investment (tier pts)
  // This ensures every eidolon/LC contributes proportionally to score

  // Eidolon contribution: sum of owned eidolon penalties * EIDOLON scaling
  let eidolonBonus = 0;
  if (character.investment.eidolons) {
    for (const eid of character.investment.eidolons) {
      if (investment.eidolonLevel >= eid.level) {
        eidolonBonus += Math.abs(eid.penalty) * INVESTMENT_SCALING.EIDOLON;
      }
    }
  }

  // LC contribution: (40 - penalty) * LC scaling, where 40 is no-LC penalty
  let lcBonus = 0;
  if (investment.lightConeId && character.investment.lightCones) {
    const lc = character.investment.lightCones.find(l => l.id === investment.lightConeId);
    if (lc) {
      const si = investment.lightConeSuperimposition || 1;
      let penalty: number;
      if (si === 1) {
        penalty = Math.abs(lc.penalties.s1);
      } else if (si === 5) {
        penalty = Math.abs(lc.penalties.s5);
      } else {
        // Interpolate for S2-S4
        const s1Penalty = Math.abs(lc.penalties.s1);
        const s5Penalty = Math.abs(lc.penalties.s5);
        const penaltyPerLevel = (s5Penalty - s1Penalty) / 4;
        penalty = s1Penalty + penaltyPerLevel * (si - 1);
      }
      lcBonus = (40 - penalty) * INVESTMENT_SCALING.LIGHT_CONE;
    }
  }

  // Total tier pts (0 at E0 no LC, ~46 at E6 Sig S5)
  const totalTierPts = eidolonBonus + lcBonus;

  // Convert tier pts to score bonus
  // Max tier pts ~46 should give ~16 score bonus
  // So scaling factor = 16/46 ≈ 0.35
  const TIERPTS_TO_SCORE = 0.35;
  const scoreBonus = totalTierPts * TIERPTS_TO_SCORE;

  return baseScore + scoreBonus;
}

/**
 * Converts a numeric score to a tier rating.
 *
 * Maps scores to their tier boundaries:
 * - T-1: > 110 (peak performance, max invested meta)
 * - T-0.5: > 103 (excellent, well-invested strong character)
 * - T0: > 97.5 (great)
 * - T0.5: > 90
 * - T1: > 80
 * - T1.5: > 70
 * - T2: > 60
 * - T3: > 50
 * - T4: > 40
 * - T5: <= 40 (weakest)
 *
 * @param score - Numeric score (can exceed 100 with investment)
 * @returns Tier rating (T-1 to T5)
 */
export function scoreToTier(score: number): TierRating {
  // Check tiers in descending order (highest to lowest)
  if (score > 110) return 'T-1';      // Peak performance (115 is T-1)
  if (score > 103) return 'T-0.5';    // Excellent (107 is T-0.5)
  if (score > 97.5) return 'T0';      // Great (100 is T0)
  if (score > 90) return 'T0.5';      // Very good (95 is T0.5)
  if (score > 80) return 'T1';        // Good (85 is T1)
  if (score > 70) return 'T1.5';      // Decent (75 is T1.5)
  if (score > 60) return 'T2';        // Fair (65 is T2)
  if (score > 50) return 'T3';        // Functional (55 is T3)
  if (score > 40) return 'T4';        // Weak (45 is T4)
  return 'T5';                        // Weakest (35 is T5)
}

/**
 * Gets a human-readable description of investment effectiveness.
 *
 * @param effectiveness - Percentage value (60-100)
 * @returns Descriptive label
 */
export function effectivenessToLabel(effectiveness: number): string {
  if (effectiveness >= 98) return 'Near Perfect';
  if (effectiveness >= 95) return 'Excellent';
  if (effectiveness >= 90) return 'Very Good';
  if (effectiveness >= 85) return 'Good';
  if (effectiveness >= 80) return 'Decent';
  if (effectiveness >= 75) return 'Fair';
  if (effectiveness >= 70) return 'Functional';
  return 'Underinvested';
}

/**
 * Calculates the improvement potential from current to perfect investment.
 *
 * @param character - The character
 * @param currentInvestment - Current investment level
 * @returns Object with current effectiveness, max effectiveness, and potential gain
 */
export function calculateImprovementPotential(
  character: Character,
  currentInvestment?: UserCharacterInvestment
) {
  const currentEffectiveness = calculateInvestmentEffectiveness(
    character,
    currentInvestment
  );

  const perfectInvestment: UserCharacterInvestment = {
    ownership: 'owned',
    eidolonLevel: 6,
    lightConeId: character.investment?.lightCones.find((lc) => lc.isSignature)?.id,
    lightConeSuperimposition: 5,
  };

  const maxEffectiveness = calculateInvestmentEffectiveness(
    character,
    perfectInvestment
  );

  return {
    currentEffectiveness,
    maxEffectiveness,
    potentialGain: maxEffectiveness - currentEffectiveness,
    percentOfMax: (currentEffectiveness / maxEffectiveness) * 100,
  };
}

/**
 * Gets the best F2P light cone for a character.
 * Returns the highest-rated non-signature LC from accessible sources.
 */
export function getBestF2PLC(character: Character): string | undefined {
  if (!character.investment?.lightCones) return undefined;

  // F2P sources: herta-store, battle-pass, event, craftable
  const f2pSources = ['herta-store', 'battle-pass', 'event', 'craftable'];

  const f2pLCs = character.investment.lightCones
    .filter((lc) => !lc.isSignature && f2pSources.includes(lc.source))
    .sort((a, b) => {
      // Sort by S5 penalty (lower penalty = better)
      return b.penalties.s5 - a.penalties.s5;
    });

  return f2pLCs[0]?.id;
}
