// ========================================
// STARGUIDE - New Team Generator
// ========================================
// Team generation using bidirectional teammate recommendations
// Considers both "who DPS wants" and "who wants DPS" for more options

import type { Character, TeammateRating, TierRating, GranularRating, TeamComposition, UserCharacterInvestment } from '../types';
import { TEAMMATE_RATING_SCORES, TIER_SCORES } from '../types';
import { getTierData } from '../data/tierData';
import { getCharactersWhoWant } from './relationshipLookup';
import {
  findTeammateRec,
  getTeammatesForComposition,
  getCompositionById,
  hasCompositions,
  getPrimaryComposition,
  getEffectiveRating,
  type InvestmentLevel,
} from './characterUtils';
import { getEffectiveScore } from './scaleConverters';

// ==================
// TYPES
// ==================

export type GameMode = 'moc' | 'pf' | 'as';

// Mode-specific team rating
export interface ModeTeamRating {
  mode: GameMode;
  tier: TierRating;
  score: number;
  label: string; // e.g., "Memory of Chaos"
}

// For backwards compatibility with old components
export interface SynergyBreakdown {
  source: string;
  target: string;
  score: number;
  reason: string;
  category: 'core' | 'amplify' | 'utility' | 'sustain';
}

export interface TeamInsight {
  title: string;
  description: string;
  category: 'core' | 'amplify' | 'utility' | 'sustain' | 'warning';
  characters: string[];
}

export interface GeneratedTeam {
  characters: Character[];
  name: string;
  rating: GranularRating;  // Now supports S, S-, A+, A, A-, B+, B, B-, C+, C, C-, D
  structure: string;
  score: number;
  reasoning: string[];
  contributions: TeamMemberContribution[];
  // For backwards compatibility
  roles: string[];
  breakdown: SynergyBreakdown[];
  insights: TeamInsight[];
  // Additional user-friendly fields
  teamSummary?: string;
  ratingDescription?: string;
  keySynergies?: string[];
  // Mode-specific team ratings
  modeRatings?: ModeTeamRating[];
  // Composition context (new)
  compositionId?: string;
  compositionName?: string;
}

/**
 * Return type for support team generation.
 * Separates teams where support is the focal character vs supporting a DPS.
 */
export interface SupportTeamResult {
  /** Teams from support's own compositions (support as focal character) */
  focalTeams: GeneratedTeam[];
  /** Teams from DPS compositions that include this support */
  supportingTeams: GeneratedTeam[];
}

export interface TeamMemberContribution {
  characterId: string;
  characterName: string;
  role: string;
  rating?: GranularRating;  // Calculated rating with +/- granularity
  sourceRating?: TeammateRating;  // Original rating from character data (S/A/B/C/D)
  reason: string;
  // For backwards compatibility with old CharacterContribution
  roleFit?: 'Perfect' | 'Great' | 'Good' | 'Flex';
  contribution?: string;
}

// ==================
// HELPER FUNCTIONS
// ==================

/**
 * Generate a descriptive team name based on actual team composition.
 * Analyzes the characters' roles to determine the team archetype.
 */
function generateTeamName(teamChars: Character[], focalDPS: Character): string {
  const dpsChars = teamChars.filter(c =>
    c.roles.includes('DPS') || c.roles.includes('Support DPS')
  );
  const hasSustain = teamChars.some(c => c.roles.includes('Sustain'));
  const amplifierCount = teamChars.filter(c => c.roles.includes('Amplifier')).length;

  // Determine team archetype
  if (dpsChars.length >= 2) {
    // Show both DPS names for dual carry teams
    const otherDPS = dpsChars.find(c => c.id !== focalDPS.id);
    if (otherDPS) {
      return `${focalDPS.name}/${otherDPS.name} Dual DPS`;
    }
    return `${focalDPS.name} Dual DPS`;
  }
  if (!hasSustain) {
    return `${focalDPS.name} Sustainless`;
  }
  if (amplifierCount >= 2) {
    return `${focalDPS.name} Hypercarry`;
  }

  // Default: simple team name
  return `${focalDPS.name} Team`;
}

/**
 * Get the base character ID for variant detection
 * Only Trailblazer variants are mutually exclusive (same character, different paths)
 * Other variants (March 7th, Dan Heng, Tingyun) are treated as separate characters
 */
function getBaseCharacterId(id: string): string {
  // Only Trailblazer variants are mutually exclusive
  if (id.startsWith('trailblazer-')) return 'trailblazer';
  return id;
}

/**
 * Get the best tier for a character across all roles in a game mode
 */
export function getBestTierForMode(characterId: string, gameMode: GameMode): TierRating {
  const tierData = getTierData(characterId);
  if (!tierData) return 'T2';

  const modeData = tierData[gameMode];
  if (!modeData) return 'T2';

  const tiers = Object.values(modeData).filter(Boolean) as TierRating[];
  if (tiers.length === 0) return 'T2';

  const tierOrder: TierRating[] = ['T-1', 'T-0.5', 'T0', 'T0.5', 'T1', 'T1.5', 'T2', 'T3', 'T4', 'T5'];
  return tiers.reduce((best, current) =>
    tierOrder.indexOf(current) < tierOrder.indexOf(best) ? current : best
  );
}

/**
 * Get tier value (0-5) for a character, accounting for investment if provided
 * Uses investment-adjusted score when getInvestment is provided, falls back to base tier
 * Returns granular value maintaining precision from investment calculations
 */
function getCharacterTierValue(
  char: Character,
  mode: GameMode,
  getInvestment?: (id: string) => UserCharacterInvestment | undefined
): number {
  if (getInvestment) {
    const investment = getInvestment(char.id);
    if (investment) {
      // Use investment-adjusted score DIRECTLY without converting to tier label
      // This preserves granular differences (e.g., 95.3 vs 91.0 instead of both becoming T0.5)
      const effectiveScore = getEffectiveScore(char, mode, investment); // 0-100 scale
      return (100 - effectiveScore) / 20; // Convert to 0-5 scale (0=best, 5=worst)
    }
  }
  // Fall back to base tier
  return tierToNumber(getBestTierForMode(char.id, mode));
}

/**
 * Get the maximum number of teams allowed for a DPS based on their tier
 * Higher tier DPS get more team slots to reflect their meta importance
 */
export function getMaxTeamsForTier(tier: TierRating): number {
  if (tier === 'T-1' || tier === 'T-0.5') return 5;  // Peak invested characters
  if (tier === 'T0' || tier === 'T0.5') return 4;
  if (tier === 'T1' || tier === 'T1.5') return 3;
  if (tier === 'T2') return 2;
  return 1; // T3, T4, T5
}

/**
 * Determine the canonical primary DPS for a team
 *
 * For hypercarry teams (1 DPS): that DPS is primary
 * For dual-carry teams (2+ DPS): highest tier DPS is primary, alphabetical tie-breaker
 *
 * This ensures consistent team ownership regardless of generation order
 */
export function getCanonicalPrimaryDPS(
  characters: Character[],
  gameMode: GameMode
): Character | null {
  // Get all DPS/Support DPS in the team
  const dpsCharacters = characters.filter(c =>
    c.roles.includes('DPS') || c.roles.includes('Support DPS')
  );

  if (dpsCharacters.length === 0) return null;
  if (dpsCharacters.length === 1) return dpsCharacters[0] ?? null;

  // Multiple DPS: sort by tier (best first), then alphabetically for consistency
  const sorted = [...dpsCharacters].sort((a, b) => {
    const aTier = getBestTierForMode(a.id, gameMode);
    const bTier = getBestTierForMode(b.id, gameMode);
    const tierOrder: TierRating[] = ['T-1', 'T-0.5', 'T0', 'T0.5', 'T1', 'T1.5', 'T2', 'T3', 'T4', 'T5'];
    const tierDiff = tierOrder.indexOf(aTier) - tierOrder.indexOf(bTier);
    if (tierDiff !== 0) return tierDiff;
    // Alphabetical tie-breaker for deterministic results
    return a.id.localeCompare(b.id);
  });

  return sorted[0] ?? null;
}

/**
 * Check if a team is dual-carry (has 2+ DPS characters)
 */
export function isDualCarryTeam(characters: Character[]): boolean {
  const dpsCount = characters.filter(c =>
    c.roles.includes('DPS') || c.roles.includes('Support DPS')
  ).length;
  return dpsCount >= 2;
}

/**
 * Order team characters by role in a consistent order:
 * 1. DPS (sorted alphabetically by name)
 * 2. Support DPS (sorted alphabetically by name)
 * 3. Amplifier (sorted alphabetically by name)
 * 4. Sustain (sorted alphabetically by name)
 *
 * This ensures consistent display across the entire app.
 */
export function orderTeamByRole(characters: Character[]): Character[] {
  // Separate by primary role (use first role in array)
  const dps: Character[] = [];
  const supportDps: Character[] = [];
  const amplifiers: Character[] = [];
  const sustains: Character[] = [];

  for (const char of characters) {
    if (char.roles.includes('DPS') && !char.roles.includes('Support DPS')) {
      dps.push(char);
    } else if (char.roles.includes('Support DPS')) {
      supportDps.push(char);
    } else if (char.roles.includes('Amplifier')) {
      amplifiers.push(char);
    } else if (char.roles.includes('Sustain')) {
      sustains.push(char);
    } else {
      // Fallback: treat as amplifier
      amplifiers.push(char);
    }
  }

  // Sort each category alphabetically by name
  const sortByName = (a: Character, b: Character) => a.name.localeCompare(b.name);
  dps.sort(sortByName);
  supportDps.sort(sortByName);
  amplifiers.sort(sortByName);
  sustains.sort(sortByName);

  // Return in canonical order: DPS → Support DPS → Amplifier → Sustain
  return [...dps, ...supportDps, ...amplifiers, ...sustains];
}

/**
 * Bidirectional teammate scoring
 *
 * NOTE: With the composition system, main team generation now uses direct ratings
 * from the focal DPS's composition data. This function is still used for:
 * - Dual-carry teams (where both DPS perspectives matter)
 * - Display purposes (showing mutual synergy info)
 * - Team analysis utilities
 *
 * Formula:
 * - If both directions exist: (DPS rating × 0.7) + (Teammate rating × 0.3)
 * - If only DPS rates teammate: DPS rating × 0.9
 * - If only teammate rates DPS: Teammate rating × 0.6 (lower confidence)
 *
 * Rating values: S=5, A=4, B=3, C=2, D=1
 */
export interface BidirectionalScore {
  score: number;
  dpsRating?: TeammateRating;
  teammateRating?: TeammateRating;
  dpsReason?: string;
  teammateReason?: string;
  confidence: 'mutual' | 'dps-only' | 'teammate-only';
}

export function calculateBidirectionalScore(
  focal: Character,
  teammate: Character,
  focalCompositionId?: string,
  teammateCompositionId?: string
): BidirectionalScore {
  // Get DPS's rating of teammate (with composition context)
  const dpsRec = findTeammateRec(focal, teammate.id, focalCompositionId);
  const dpsRating = dpsRec?.rating;
  const dpsReason = dpsRec?.reason;

  // Get teammate's rating of DPS (with their composition context if any)
  const teammateRec = findTeammateRec(teammate, focal.id, teammateCompositionId);
  const teammateRating = teammateRec?.rating;
  const teammateReason = teammateRec?.reason;

  let score: number;
  let confidence: 'mutual' | 'dps-only' | 'teammate-only';

  if (dpsRating && teammateRating) {
    // Both directions exist - weighted average (DPS perspective more important)
    const dpsScore = TEAMMATE_RATING_SCORES[dpsRating];
    const tmScore = TEAMMATE_RATING_SCORES[teammateRating];
    score = (dpsScore * 0.7) + (tmScore * 0.3);
    confidence = 'mutual';
  } else if (dpsRating) {
    // Only DPS rates teammate
    score = TEAMMATE_RATING_SCORES[dpsRating] * 0.9;
    confidence = 'dps-only';
  } else if (teammateRating) {
    // Only teammate rates DPS (from runtime lookup)
    score = TEAMMATE_RATING_SCORES[teammateRating] * 0.6;
    confidence = 'teammate-only';
  } else {
    // No rating in either direction
    score = 0;
    confidence = 'teammate-only';
  }

  return {
    score,
    dpsRating,
    teammateRating,
    dpsReason,
    teammateReason,
    confidence,
  };
}

/**
 * Get a combined reason from bidirectional data
 */
function getCombinedReason(biScore: BidirectionalScore, _focal: Character, teammate: Character): string {
  void _focal; // May use in future for more context
  if (biScore.dpsReason) {
    return biScore.dpsReason;
  }
  if (biScore.teammateReason) {
    // Invert the reason perspective
    return `${teammate.name} synergy: ${biScore.teammateReason}`;
  }
  return `${teammate.roles[0] || 'Support'} for the team`;
}

/**
 * Convert bidirectional score to a granular rating letter
 * Uses +/- modifiers for finer granularity
 */
export function scoreToRating(score: number): GranularRating {
  if (score >= 4.8) return 'S';
  if (score >= 4.3) return 'S-';
  if (score >= 4.0) return 'A+';
  if (score >= 3.5) return 'A';
  if (score >= 3.0) return 'A-';
  if (score >= 2.7) return 'B+';
  if (score >= 2.3) return 'B';
  if (score >= 2.0) return 'B-';
  if (score >= 1.7) return 'C+';
  if (score >= 1.3) return 'C';
  if (score >= 1.0) return 'C-';
  return 'D';
}

/**
 * Convert score to base rating (for compatibility with functions expecting TeammateRating)
 */
function scoreToBaseRating(score: number): TeammateRating {
  if (score >= 4.5) return 'S';
  if (score >= 3.5) return 'A';
  if (score >= 2.5) return 'B';
  if (score >= 1.5) return 'C';
  return 'D';
}

/**
 * Game mode labels
 */
const MODE_LABELS: Record<GameMode, string> = {
  moc: 'Memory of Chaos',
  pf: 'Pure Fiction',
  as: 'Apocalyptic Shadow',
};

// ==================
// COMPOSITION REQUIREMENTS & WEAK MODES
// ==================

/**
 * Weak mode penalty multiplier.
 * Applied when composition has a weakMode matching current game mode.
 * 0.85 = 15% penalty (avoids double-counting with teammate ratings)
 */
const WEAK_MODE_PENALTY = 0.85;

/**
 * Check if a composition has a weakness in the given game mode.
 */
function isWeakMode(composition: TeamComposition | undefined, gameMode: GameMode): boolean {
  if (!composition?.weakModes) return false;
  return composition.weakModes.some(wm => wm.mode === gameMode);
}

/**
 * Get the weak mode penalty multiplier for a composition in a game mode.
 * Returns 0.85 if weak, 1.0 otherwise.
 */
function getWeakModePenalty(composition: TeamComposition | undefined, gameMode: GameMode): number {
  return isWeakMode(composition, gameMode) ? WEAK_MODE_PENALTY : 1.0;
}

/**
 * Check if a composition's requirements are met by the owned roster.
 *
 * Requirements checked:
 * 1. core[] - Required characters (optionally at specific eidolon or with specific LC)
 * 2. pathRequirements[] - Required number of characters from specific paths
 *
 * Note: Investment-based requirements (minEidolon, lightConeIds) are currently
 * not checked since we don't track user investment levels yet. They will be
 * checked as "character owned" only.
 *
 * @returns true if all requirements are met, false otherwise
 */
export function meetsCompositionRequirements(
  composition: TeamComposition,
  ownedCharacters: Character[]
): boolean {
  const ownedIds = new Set(ownedCharacters.map(c => c.id));

  // Check core requirements
  if (composition.core) {
    for (const req of composition.core) {
      // Must own the required character
      if (!ownedIds.has(req.characterId)) {
        return false;
      }

      // Note: minEidolon and lightConeIds checks would go here
      // when we implement investment tracking. For now, just check ownership.
      // Future: check if user's eidolon >= req.minEidolon
      // Future: check if user has one of req.lightConeIds equipped
    }
  }

  // Check path requirements
  if (composition.pathRequirements) {
    for (const req of composition.pathRequirements) {
      const matchingCount = ownedCharacters.filter(c => c.path === req.path).length;
      if (matchingCount < req.count) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Check if a composition is "accessible" (has no requirements).
 * Per the accessibility rule, every character must have at least one such composition.
 */
function isAccessibleComposition(composition: TeamComposition): boolean {
  const hasCore = composition.core && composition.core.length > 0;
  const hasPathReqs = composition.pathRequirements && composition.pathRequirements.length > 0;
  return !hasCore && !hasPathReqs;
}

/**
 * Find the best accessible composition for a character based on owned roster.
 *
 * Priority:
 * 1. Primary composition if requirements are met
 * 2. First composition whose requirements are met
 * 3. First composition with no requirements (accessible)
 * 4. null (fall back to baseTeammates)
 */
export function findAccessibleComposition(
  character: Character,
  ownedCharacters: Character[]
): TeamComposition | null {
  if (!character.compositions || character.compositions.length === 0) {
    return null;
  }

  // Try primary composition first
  const primary = getPrimaryComposition(character);
  if (primary && meetsCompositionRequirements(primary, ownedCharacters)) {
    return primary;
  }

  // Try any composition that meets requirements
  for (const comp of character.compositions) {
    if (meetsCompositionRequirements(comp, ownedCharacters)) {
      return comp;
    }
  }

  // Fall back to any accessible composition (no requirements)
  const accessible = character.compositions.find(isAccessibleComposition);
  if (accessible) {
    return accessible;
  }

  // No accessible composition found - will use baseTeammates
  return null;
}

/**
 * Tier value helpers for averaging
 * Scale: -1 (T-1 best) to 5 (T5 worst)
 */
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

/**
 * Calculate team rating for a specific game mode
 *
 * Formula (weighted hybrid):
 * - DPS characters: weighted 60% of total
 * - Support characters: weighted 40% of total
 * - Synergy penalty: (5 - avgSynergy) * 0.35 tier steps
 *
 * For dual-carry teams, both DPS are weighted equally within the 60% DPS portion.
 *
 * Synergy affects team tier as a PENALTY only:
 * - S synergy (5.0): No penalty
 * - A synergy (4.0): ~0.35 tier penalty
 * - B synergy (3.0): ~0.7 tier penalty
 * - C synergy (2.0): ~1.05 tier penalty
 * - D synergy (1.0): ~1.4 tier penalty
 *
 * @param team - Team characters
 * @param mode - Game mode
 * @param getInvestment - Optional function to get investment data for character IDs
 */
export function calculateModeTeamRating(
  team: Character[],
  mode: GameMode,
  getInvestment?: (id: string) => UserCharacterInvestment | undefined
): ModeTeamRating {
  if (team.length === 0) {
    return { mode, tier: 'T5', score: 0, label: MODE_LABELS[mode] };
  }

  // Separate DPS and support characters
  const dpsCharacters = team.filter(c =>
    c.roles.includes('DPS') || c.roles.includes('Support DPS')
  );
  const supportCharacters = team.filter(c =>
    !c.roles.includes('DPS') && !c.roles.includes('Support DPS')
  );

  // Helper to get tier value for a character, accounting for investment
  const getCharacterTierValue = (char: Character): number => {
    if (getInvestment) {
      const investment = getInvestment(char.id);
      if (investment) {
        // Use investment-adjusted score DIRECTLY without converting to tier label
        // This preserves granular differences for more accurate team ratings
        const effectiveScore = getEffectiveScore(char, mode, investment); // 0-100 scale
        return (100 - effectiveScore) / 20; // Convert to 0-5 scale (0=best, 5=worst)
      }
    }
    // Fall back to base tier
    return tierToNumber(getBestTierForMode(char.id, mode));
  };

  // Get tier values for each
  const dpsTiers = dpsCharacters.map(c => getCharacterTierValue(c));
  const supportTiers = supportCharacters.map(c => getCharacterTierValue(c));

  // Calculate averages (handle empty arrays)
  const dpsAvg = dpsTiers.length > 0
    ? dpsTiers.reduce((a, b) => a + b, 0) / dpsTiers.length
    : 2.5; // Default to T2.5 equivalent if no DPS

  const supportAvg = supportTiers.length > 0
    ? supportTiers.reduce((a, b) => a + b, 0) / supportTiers.length
    : 2.5; // Default to T2.5 equivalent if no supports

  // Base weighted average: DPS 60%, Supports 40%
  const baseWeightedAvg = (dpsAvg * 0.6) + (supportAvg * 0.4);

  // Calculate synergy penalty based on team composition
  const synergyPenalty = calculateSynergyPenalty(team, dpsCharacters, supportCharacters);

  // Apply penalty (capped at T5 = 5)
  const penalizedAvg = Math.min(5, baseWeightedAvg + synergyPenalty);
  const tier = numberToTier(penalizedAvg);

  // Score for sorting (inverse of tier number, so T0 = highest)
  // Use penalized average for consistent sorting
  const score = 100 - (penalizedAvg * 20);

  return {
    mode,
    tier,
    score,
    label: MODE_LABELS[mode],
  };
}

/**
 * Calculate synergy penalty for team tier rating
 * Penalty = (5 - avgSynergy) * 0.35
 *
 * For dual-carry teams: averages synergy from both DPS perspectives
 * For single-carry: uses primary DPS perspective
 */
function calculateSynergyPenalty(
  team: Character[],
  dpsCharacters: Character[],
  supportCharacters: Character[]
): number {
  if (team.length < 2) return 0;

  const SYNERGY_PENALTY_FACTOR = 0.35;
  let avgSynergy = 0;

  const isDualCarry = dpsCharacters.length >= 2;

  if (isDualCarry && dpsCharacters[0] && dpsCharacters[1]) {
    // Dual-carry: Average synergy from both DPS perspectives
    const dps1 = dpsCharacters[0];
    const dps2 = dpsCharacters[1];
    let totalScore = 0;
    let scoreCount = 0;

    // DPS1 <-> DPS2 synergy
    const dps1ToDps2 = calculateBidirectionalScore(dps1, dps2);
    totalScore += dps1ToDps2.score;
    scoreCount++;

    // Average support synergies from both DPS perspectives
    for (const support of supportCharacters) {
      const score1 = calculateBidirectionalScore(dps1, support);
      const score2 = calculateBidirectionalScore(dps2, support);
      const avgScore = (score1.score + score2.score) / 2;
      totalScore += avgScore;
      scoreCount++;
    }

    avgSynergy = scoreCount > 0 ? totalScore / scoreCount : 0;
  } else {
    // Single-carry: Use primary DPS perspective
    const dps = dpsCharacters[0] || team[0];
    if (!dps) return 0;

    let totalScore = 0;
    let teammateCount = 0;

    for (const c of team) {
      if (c.id !== dps.id) {
        const biScore = calculateBidirectionalScore(dps, c);
        totalScore += biScore.score;
        teammateCount++;
      }
    }

    avgSynergy = teammateCount > 0 ? totalScore / teammateCount : 0;
  }

  // Calculate penalty: (5 - avgSynergy) * factor
  // S(5) = 0 penalty, A(4) = 0.35, B(3) = 0.7, C(2) = 1.05, D(1) = 1.4
  const penalty = (5 - avgSynergy) * SYNERGY_PENALTY_FACTOR;

  return Math.max(0, penalty); // Ensure no negative penalty
}

/**
 * Calculate team ratings for all game modes
 *
 * @param team - Team characters
 * @param getInvestment - Optional function to get investment data for character IDs
 */
export function calculateAllModeRatings(
  team: Character[],
  getInvestment?: (id: string) => UserCharacterInvestment | undefined
): ModeTeamRating[] {
  return [
    calculateModeTeamRating(team, 'moc', getInvestment),
    calculateModeTeamRating(team, 'pf', getInvestment),
    calculateModeTeamRating(team, 'as', getInvestment),
  ];
}

/**
 * Calculate team ranking score for sorting teams
 * This is the centralized scoring function used by both Best Teams and My Teams views
 *
 * The score is simply the mode-specific tier score, which already includes:
 * - Character tier weighted average (DPS 60%, supports 40%)
 * - Synergy penalty (0 to ~1.4 tier steps based on team synergy quality)
 *
 * This ensures what you see (tier) = what determines sort order.
 * A small bonus is added for S-rated curated bestTeams.
 *
 * Score range: 0-100 (+ small prebuilt bonus)
 * - T0 team with perfect synergy: ~100
 * - T0 team with D synergy: ~72 (penalized ~1.4 tiers)
 * - T5 team: ~0
 */
export function getTeamRankingScore(team: GeneratedTeam, mode: GameMode): number {
  // Mode-specific tier score (already includes synergy penalty)
  const modeRating = team.modeRatings?.find(r => r.mode === mode);
  const modeTierScore = modeRating?.score ?? 50;

  // Small bonus for S-rated curated bestTeams (not generated teams)
  const isPrebuilt = team.name && !team.name.includes('hypercarry') && !team.name.includes('dual-carry');
  const sPrebuiltBonus = (isPrebuilt && team.rating === 'S') ? 5 : 0;

  return modeTierScore + sPrebuiltBonus;
}

/**
 * Convert overall ranking score to a display rating (S/A/B/C/D)
 * Score range: 0-105 (tier score 0-100 + prebuilt bonus 0-5)
 *
 * Thresholds based on tier scores:
 * - S: 90+ (T0-T0.5 with good synergy)
 * - A: 75+ (T1-T1.5 range)
 * - B: 60+ (T2 range)
 * - C: 40+ (T3 range)
 * - D: Below 40 (T4-T5 range)
 */
export function getRankingScoreRating(score: number): 'S' | 'A' | 'B' | 'C' | 'D' {
  if (score >= 90) return 'S';
  if (score >= 75) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  return 'D';
}

/**
 * Calculate a team score based on teammate ratings and character tiers.
 * Uses direct composition-specific ratings (no bidirectional scoring).
 */
function calculateTeamScore(
  focal: Character,
  teammates: { char: Character; rating?: TeammateRating; role: string }[],
  gameMode: GameMode,
  compositionId?: string,
  getInvestment?: (id: string) => UserCharacterInvestment | undefined
): number {
  let score = 0;

  // Focal character tier (investment-aware)
  // tierToNumber returns 0-5 (0=T0 best, 5=T5 worst), so invert it (5-tierValue)
  const focalTierValue = getCharacterTierValue(focal, gameMode, getInvestment);
  score += (5 - focalTierValue) * 20; // Invert so T0=100, T5=0

  // Teammate scores - direct ratings from composition data
  for (const tm of teammates) {
    const tmTierValue = getCharacterTierValue(tm.char, gameMode, getInvestment);
    score += (5 - tmTierValue) * 20; // Invert so T0=100, T5=0

    // Use the rating directly from composition data
    if (tm.rating) {
      score += TEAMMATE_RATING_SCORES[tm.rating] * 20;
    } else {
      // Fallback: check if DPS has explicit rating for this teammate
      const rec = findTeammateRec(focal, tm.char.id, compositionId);
      if (rec) {
        score += TEAMMATE_RATING_SCORES[rec.rating] * 20;
      }
    }
  }

  return score;
}

// ==================
// MAIN TEAM GENERATION
// ==================

/**
 * Generate teams for a DPS character using their explicit teammate data.
 *
 * Updated for composition system:
 * - If compositionId is provided, generates teams within that composition's context
 * - Uses composition-specific teammate ratings and structure constraints
 * - Applies weakModes penalty to scoring (15% penalty for weak modes)
 * - If no compositionId, uses legacy teammates or baseTeammates
 */
export function generateTeamsForDPS(
  dps: Character,
  ownedCharacters: Character[],
  options: { maxTeams?: number; gameMode?: GameMode; compositionId?: string; getInvestment?: (id: string) => UserCharacterInvestment | undefined } = {}
): GeneratedTeam[] {
  const { maxTeams = 10, gameMode = 'moc', compositionId, getInvestment } = options;
  const ownedIds = new Set(ownedCharacters.map(c => c.id));
  const teams: GeneratedTeam[] = [];

  // Get composition context if specified
  const composition = compositionId ? getCompositionById(dps, compositionId) : undefined;
  const weakModePenalty = getWeakModePenalty(composition, gameMode);

  // Check composition requirements - return empty if not met
  if (composition && !meetsCompositionRequirements(composition, ownedCharacters)) {
    return [];
  }

  // 1. First, check composition-specific teams if a composition is specified
  if (composition?.teams) {
    for (const compTeam of composition.teams) {
      const canBuild = compTeam.characters.every(id => ownedIds.has(id));
      if (canBuild) {
        const teamCharsRaw = compTeam.characters
          .map(id => ownedCharacters.find(c => c.id === id))
          .filter((c): c is Character => c !== undefined);

        if (teamCharsRaw.length === 4) {
          const focalIndex = teamCharsRaw.findIndex(c => c.id === dps.id);
          const teamChars = focalIndex > 0
            ? [teamCharsRaw[focalIndex]!, ...teamCharsRaw.slice(0, focalIndex), ...teamCharsRaw.slice(focalIndex + 1)]
            : teamCharsRaw;

          const contributions: TeamMemberContribution[] = teamChars.map((c) => {
            let sourceRating: TeammateRating | undefined;
            let rating: GranularRating | undefined;
            let reason = c.id === dps.id ? 'Main DPS' : c.roles.join(', ');
            let roleFit: 'Perfect' | 'Great' | 'Good' | 'Flex' = 'Flex';

            if (c.id !== dps.id) {
              const rec = findTeammateRec(dps, c.id, compositionId);
              if (rec) {
                sourceRating = rec.rating;
                // Use direct rating instead of bidirectional scoring
                rating = scoreToRating(TEAMMATE_RATING_SCORES[rec.rating]);
                reason = rec.reason;
                roleFit = sourceRating === 'S' ? 'Perfect' :
                         sourceRating === 'A' ? 'Great' :
                         sourceRating === 'B' ? 'Good' : 'Flex';
              }
            } else {
              roleFit = 'Perfect';
            }

            return {
              characterId: c.id,
              characterName: c.name,
              role: c.id === dps.id ? 'Main DPS' : c.roles[0] || 'Support',
              rating,
              sourceRating,
              reason,
              roleFit,
              contribution: reason,
            };
          });

          const roles: string[] = teamChars.map(c =>
            c.id === dps.id ? 'DPS' : c.roles[0] || 'Amplifier'
          );

          const breakdown: SynergyBreakdown[] = contributions
            .filter(c => c.characterId !== dps.id)
            .map(c => ({
              source: c.characterName,
              target: dps.name,
              score: c.sourceRating ? TEAMMATE_RATING_SCORES[c.sourceRating] * 20 : 50,
              reason: c.reason,
              category: c.role === 'Sustain' ? 'sustain' as const :
                        c.role === 'Amplifier' ? 'amplify' as const : 'core' as const,
            }));

          const insights: TeamInsight[] = [
            {
              title: composition.name,
              description: `${compTeam.name} - ${composition.coreMechanic || compTeam.structure}`,
              category: 'core',
              characters: teamChars.map(c => c.name),
            },
          ];

          // Calculate base score then apply weakMode penalty if applicable
          const baseScore = calculateTeamScore(dps, contributions.slice(1).map(c => ({
            char: teamChars.find(tc => tc.id === c.characterId)!,
            rating: c.sourceRating,
            role: c.role,
          })), gameMode, compositionId, getInvestment);

          teams.push({
            characters: orderTeamByRole(teamChars),
            name: generateTeamName(teamChars, dps),
            rating: compTeam.rating,
            structure: compTeam.structure,
            score: baseScore * weakModePenalty,
            reasoning: [
              `${composition.name} composition`,
              ...contributions.filter(c => c.reason && c.characterId !== dps.id).map(c => `${c.characterName}: ${c.reason}`),
            ],
            contributions,
            roles,
            breakdown,
            insights,
            modeRatings: calculateAllModeRatings(teamChars),
            compositionId,
            compositionName: composition.name,
          });
        }
      }
    }
  }

  // 2. If no composition specified AND character has no compositions, fall back to legacy bestTeams
  // Skip legacy data entirely for migrated characters (those with compositions)
  if (!compositionId && !hasCompositions(dps) && dps.bestTeams) {
    for (const best of dps.bestTeams) {
      const canBuild = best.characters.every(id => ownedIds.has(id));
      if (canBuild) {
        const teamCharsRaw = best.characters
          .map(id => ownedCharacters.find(c => c.id === id))
          .filter((c): c is Character => c !== undefined);

        if (teamCharsRaw.length === 4) {
          // Ensure focal DPS is always in the first slot
          const focalIndex = teamCharsRaw.findIndex(c => c.id === dps.id);
          const teamChars = focalIndex > 0
            ? [teamCharsRaw[focalIndex]!, ...teamCharsRaw.slice(0, focalIndex), ...teamCharsRaw.slice(focalIndex + 1)]
            : teamCharsRaw;
          const contributions: TeamMemberContribution[] = teamChars.map((c) => {
            // Find teammate rating from focal's data
            let sourceRating: TeammateRating | undefined;
            let rating: GranularRating | undefined;
            let reason = c.id === dps.id ? 'Main DPS' : c.roles.join(', ');
            let roleFit: 'Perfect' | 'Great' | 'Good' | 'Flex' = 'Flex';

            if (c.id !== dps.id) {
              const rec = findTeammateRec(dps, c.id);
              if (rec) {
                sourceRating = rec.rating;
                // Use direct rating instead of bidirectional scoring
                rating = scoreToRating(TEAMMATE_RATING_SCORES[rec.rating]);
                reason = rec.reason;
                roleFit = sourceRating === 'S' ? 'Perfect' :
                         sourceRating === 'A' ? 'Great' :
                         sourceRating === 'B' ? 'Good' : 'Flex';
              }
            } else {
              roleFit = 'Perfect';
            }

            return {
              characterId: c.id,
              characterName: c.name,
              role: c.id === dps.id ? 'Main DPS' : c.roles[0] || 'Support',
              rating,
              sourceRating,
              reason,
              roleFit,
              contribution: reason,
            };
          });

          // Build roles array
          const roles: string[] = teamChars.map(c =>
            c.id === dps.id ? 'DPS' : c.roles[0] || 'Amplifier'
          );

          // Build synergy breakdowns for backwards compatibility
          const breakdown: SynergyBreakdown[] = contributions
            .filter(c => c.characterId !== dps.id)
            .map(c => ({
              source: c.characterName,
              target: dps.name,
              score: c.sourceRating ? TEAMMATE_RATING_SCORES[c.sourceRating] * 20 : 50,
              reason: c.reason,
              category: c.role === 'Sustain' ? 'sustain' as const :
                        c.role === 'Amplifier' ? 'amplify' as const : 'core' as const,
            }));

          // Build insights
          const insights: TeamInsight[] = [
            {
              title: best.structure,
              description: `${best.name} - ${best.structure} composition`,
              category: 'core',
              characters: teamChars.map(c => c.name),
            },
          ];

          teams.push({
            characters: orderTeamByRole(teamChars),
            name: generateTeamName(teamChars, dps),
            rating: best.rating,
            structure: best.structure,
            score: calculateTeamScore(dps, contributions.slice(1).map(c => ({
              char: teamChars.find(tc => tc.id === c.characterId)!,
              rating: c.sourceRating,  // Use source rating for score calculation
              role: c.role,
            })), gameMode, undefined, getInvestment),
            reasoning: [
              `${best.structure} composition`,
              ...contributions.filter(c => c.reason && c.characterId !== dps.id).map(c => `${c.characterName}: ${c.reason}`),
            ],
            contributions,
            roles,
            breakdown,
            insights,
            modeRatings: calculateAllModeRatings(teamChars),
          });
        }
      }
    }
  }

  // 3. Generate teams from teammate recommendations if not enough curated teams
  const teammates = getTeammatesForComposition(dps, compositionId);
  const hasTeammateData = teammates.amplifiers?.length || teammates.sustains?.length;
  if (teams.length < maxTeams && hasTeammateData) {
    const generatedTeams = generateFromTeammateData(dps, ownedCharacters, gameMode, maxTeams - teams.length, compositionId, composition, getInvestment);
    teams.push(...generatedTeams);
  }

  // 3. Sort by score and limit
  teams.sort((a, b) => b.score - a.score);
  return teams.slice(0, maxTeams);
}

// findTeammateRec is now imported from characterUtils with composition support

/**
 * Enriched teammate data with direct composition-specific ratings.
 * Simplified from bidirectional scoring - now uses focal DPS's rating directly.
 */
interface EnrichedTeammate {
  id: string;
  char: Character;
  rating: TeammateRating;  // Direct rating from DPS's composition data (S/A/B/C/D)
  reason: string;
  score: number;  // Numeric score from rating (S=5, A=4, B=3, C=2, D=1)
}

/**
 * Check if a character should be avoided (either DPS avoids them or they avoid DPS)
 */
function shouldAvoid(dps: Character, teammate: Character): boolean {
  // Check if DPS avoids this teammate
  if (dps.restrictions?.avoid?.some(a => a.id === teammate.id)) {
    return true;
  }
  // Check if teammate avoids this DPS
  if (teammate.restrictions?.avoid?.some(a => a.id === dps.id)) {
    return true;
  }
  return false;
}

/**
 * Get all potential teammates for a role, combining explicit and runtime data
 * Falls back to highest-tier characters of that role if no recommendations available
 *
 * Updated for composition system: uses composition-specific teammate data.
 * Now supports investment-aware ratings via getEffectiveRating.
 */
function getEnrichedTeammates(
  dps: Character,
  ownedCharacters: Character[],
  role: 'Amplifier' | 'Sustain' | 'Support DPS',
  gameMode: GameMode = 'moc',
  compositionId?: string,
  investments?: Map<string, InvestmentLevel>
): EnrichedTeammate[] {
  const ownedIds = new Set(ownedCharacters.map(c => c.id));
  const result: EnrichedTeammate[] = [];
  const seenIds = new Set<string>();
  // Track base character IDs to prevent Trailblazer variants from being added together
  const seenBaseIds = new Set<string>();
  seenBaseIds.add(getBaseCharacterId(dps.id)); // DPS's base ID is already "used"

  // 1. Get explicit teammates from DPS's data (composition-aware)
  // For 'Support DPS' role, check BOTH 'dps' and 'subDPS' categories
  // since character data might use either for dual-carry partners
  const teammates = getTeammatesForComposition(dps, compositionId);

  let explicitRecs: typeof teammates.amplifiers = [];
  if (role === 'Amplifier') {
    explicitRecs = teammates.amplifiers || [];
  } else if (role === 'Sustain') {
    explicitRecs = teammates.sustains || [];
  } else {
    // 'Support DPS' - check both subDPS and dps categories
    explicitRecs = [
      ...(teammates.subDPS || []),
      ...(teammates.dps || []),
    ];
  }

  for (const rec of explicitRecs) {
    if (!ownedIds.has(rec.id)) continue;
    const char = ownedCharacters.find(c => c.id === rec.id);
    if (!char) continue;

    // Skip if should avoid
    if (shouldAvoid(dps, char)) continue;

    // Skip if base character already used (prevents multiple Trailblazer paths)
    const baseId = getBaseCharacterId(rec.id);
    if (seenBaseIds.has(baseId)) continue;

    seenIds.add(rec.id);
    seenBaseIds.add(baseId);

    // Use investment-aware rating if investments provided
    const effectiveRating = investments
      ? getEffectiveRating(dps, rec.id, { compositionId, investments })
      : rec.rating;

    result.push({
      id: rec.id,
      char,
      rating: effectiveRating,
      reason: rec.reason,
      score: TEAMMATE_RATING_SCORES[effectiveRating],
    });
  }

  // 2. Add characters from runtime lookup who want this DPS (but DPS didn't list them)
  // These get a lower rating since DPS doesn't explicitly recommend them
  // Skip this for composition-specific generation (rely on curated data)
  if (!compositionId) {
    const wantedBy = getCharactersWhoWant(dps.id);

    for (const entry of wantedBy) {
      if (seenIds.has(entry.character.id)) continue;
      if (!ownedIds.has(entry.character.id)) continue;

      // Check if this character matches the requested role
      if (!entry.character.roles.includes(role)) continue;

      const char = ownedCharacters.find(c => c.id === entry.character.id);
      if (!char) continue;

      // Skip if should avoid
      if (shouldAvoid(dps, char)) continue;

      // Skip if base character already used (prevents multiple Trailblazer paths)
      const baseId = getBaseCharacterId(entry.character.id);
      if (seenBaseIds.has(baseId)) continue;

      seenIds.add(entry.character.id);
      seenBaseIds.add(baseId);

      // Use a moderate rating since they want DPS but DPS doesn't explicitly rate them
      const fallbackRating: TeammateRating = 'C';

      result.push({
        id: entry.character.id,
        char,
        rating: fallbackRating,
        reason: `${char.name} wants ${dps.name}: ${entry.reason}`,
        score: TEAMMATE_RATING_SCORES[fallbackRating],
      });
    }
  }

  // 3. ALWAYS add highest-tier characters of this role (after explicit recommendations)
  // Get all owned characters of this role that aren't already added and aren't avoided
  const roleCharacters = ownedCharacters.filter(c => {
    if (c.id === dps.id) return false; // Can't teammate with self
    if (seenIds.has(c.id)) return false; // Already added
    if (seenBaseIds.has(getBaseCharacterId(c.id))) return false; // Base character already used
    if (!c.roles.includes(role)) return false; // Must match role
    if (shouldAvoid(dps, c)) return false; // Must not be avoided
    return true;
  });

  // Sort by tier (best first)
  const tierOrder: TierRating[] = ['T-1', 'T-0.5', 'T0', 'T0.5', 'T1', 'T1.5', 'T2', 'T3', 'T4', 'T5'];
  roleCharacters.sort((a, b) => {
    const aTier = getBestTierForMode(a.id, gameMode);
    const bTier = getBestTierForMode(b.id, gameMode);
    return tierOrder.indexOf(aTier) - tierOrder.indexOf(bTier);
  });

  // Add top characters as tier-based teammates (appended after explicit recommendations)
  // Skip this for composition-specific generation (rely on curated data only)
  if (!compositionId) {
    for (const char of roleCharacters.slice(0, 5)) {
      seenIds.add(char.id);
      seenBaseIds.add(getBaseCharacterId(char.id));
      const tier = getBestTierForMode(char.id, gameMode);
      const tierIdx = tierOrder.indexOf(tier);

      // Map tier to rating - DPS roles are stricter (less generalist)
      // DPS/Support DPS: All get D (need specific synergies)
      // Amplifier/Sustain: T-1 through T0.5 = C, rest = D
      const isDPSRole = role === 'Support DPS';
      let tierRating: TeammateRating;
      if (isDPSRole) {
        tierRating = 'D'; // All DPS get D - they need specific synergies
      } else {
        tierRating = tierIdx <= 3 ? 'C' : 'D'; // T-1/T-0.5/T0/T0.5 get C for Amp/Sustain
      }
      const tierScore = TEAMMATE_RATING_SCORES[tierRating] * 0.5; // Lower confidence for fallback

      result.push({
        id: char.id,
        char,
        rating: tierRating,
        reason: `${tier} ${role} (general pick)`,
        score: tierScore,
      });
    }
  }

  // Sort by score (highest first)
  result.sort((a, b) => b.score - a.score);

  return result;
}

/**
 * Generate teams from explicit teammate data + runtime lookups
 *
 * Updated for composition system:
 * - Uses composition-specific teammate ratings
 * - Respects composition structure (e.g., sustainless = no sustain slot)
 * - Applies weakModes penalty to scoring (15% penalty for weak modes)
 */
function generateFromTeammateData(
  dps: Character,
  ownedCharacters: Character[],
  gameMode: GameMode,
  maxTeams: number,
  compositionId?: string,
  composition?: TeamComposition,
  getInvestment?: (id: string) => UserCharacterInvestment | undefined
): GeneratedTeam[] {
  const teams: GeneratedTeam[] = [];

  // Build investments map for investment-aware ratings
  const investments = new Map<string, InvestmentLevel>();
  if (getInvestment) {
    for (const char of ownedCharacters) {
      const inv = getInvestment(char.id);
      if (inv) {
        investments.set(char.id, {
          eidolonLevel: inv.eidolonLevel,
          lightConeId: inv.lightConeId,
          lightConeSuperimposition: inv.lightConeSuperimposition,
        });
      }
    }
    // Also add DPS investment
    const dpsInv = getInvestment(dps.id);
    if (dpsInv) {
      investments.set(dps.id, {
        eidolonLevel: dpsInv.eidolonLevel,
        lightConeId: dpsInv.lightConeId,
        lightConeSuperimposition: dpsInv.lightConeSuperimposition,
      });
    }
  }

  // Get enriched teammates by role (includes runtime lookups and fallback)
  // Pass investments for investment-aware ratings (S+ when synergy modifiers apply)
  const availableAmplifiers = getEnrichedTeammates(dps, ownedCharacters, 'Amplifier', gameMode, compositionId, investments.size > 0 ? investments : undefined);
  const availableSustains = getEnrichedTeammates(dps, ownedCharacters, 'Sustain', gameMode, compositionId, investments.size > 0 ? investments : undefined);
  const availableSubDPS = getEnrichedTeammates(dps, ownedCharacters, 'Support DPS', gameMode, compositionId, investments.size > 0 ? investments : undefined);

  // Check composition structure requirements
  const requiredStructure = composition?.structure;

  // Determine what structures to generate based on composition requirements
  const shouldGenerateSustainless = !requiredStructure
    ? (composition?.teammateOverrides?.sustains?.every(s => s.excluded) ?? false)
    : (requiredStructure.sustain === 0 && requiredStructure.amplifier === 3);

  const shouldGenerateHypercarry = !requiredStructure
    ? !shouldGenerateSustainless
    : (requiredStructure.dps === 1 && requiredStructure.amplifier === 2 && requiredStructure.sustain === 1);

  const shouldGenerateDualCarry = !requiredStructure
    ? !shouldGenerateSustainless
    : (requiredStructure.dps === 2 && requiredStructure.amplifier === 1 && requiredStructure.sustain === 1);

  // Preferred structure for tie-breaking (only used when no required structure)
  const preferredStructure = dps.teamStructures?.preferred || 'hypercarry';

  // Generate sustainless teams (1 DPS + 3 Amp)
  if (shouldGenerateSustainless) {
    for (let i = 0; i < Math.min(4, availableAmplifiers.length); i++) {
      for (let j = i + 1; j < Math.min(5, availableAmplifiers.length); j++) {
        for (let k = j + 1; k < Math.min(6, availableAmplifiers.length); k++) {
          const amp1 = availableAmplifiers[i];
          const amp2 = availableAmplifiers[j];
          const amp3 = availableAmplifiers[k];

          if (!amp1 || !amp2 || !amp3) continue;

          const baseIds = [dps, amp1.char, amp2.char, amp3.char].map(c => getBaseCharacterId(c.id));
          if (new Set(baseIds).size !== baseIds.length) continue;

          const teamChars = [dps, amp1.char, amp2.char, amp3.char];

          teams.push(createTeamFromEnriched(
            dps, teamChars,
            [amp1, amp2, amp3],
            'sustainless',
            gameMode,
            compositionId,
            composition,
            getInvestment
          ));
        }
      }
    }
  }

  // Generate hypercarry teams (1 DPS + 2 Amp + 1 Sus)
  if (shouldGenerateHypercarry) {
    for (let i = 0; i < Math.min(4, availableAmplifiers.length); i++) {
      for (let j = i + 1; j < Math.min(5, availableAmplifiers.length); j++) {
        for (let k = 0; k < Math.min(3, availableSustains.length); k++) {
          const amp1 = availableAmplifiers[i];
          const amp2 = availableAmplifiers[j];
          const sus = availableSustains[k];

          if (!amp1 || !amp2 || !sus) continue;

          // Check for base character conflicts (e.g., multiple Trailblazer paths)
          const baseIds = [dps, amp1.char, amp2.char, sus.char].map(c => getBaseCharacterId(c.id));
          if (new Set(baseIds).size !== baseIds.length) continue;

          const teamChars = [dps, amp1.char, amp2.char, sus.char];

          teams.push(createTeamFromEnriched(
            dps, teamChars,
            [amp1, amp2, sus],
            'hypercarry',
            gameMode,
            compositionId,
            composition,
            getInvestment
          ));
        }
      }
    }
  }

  // Generate dual-carry teams (2 DPS + 1 Amp + 1 Sus)
  if (shouldGenerateDualCarry) {
    for (let i = 0; i < Math.min(4, availableSubDPS.length); i++) {
      for (let j = 0; j < Math.min(3, availableAmplifiers.length); j++) {
        for (let k = 0; k < Math.min(3, availableSustains.length); k++) {
          const subDps = availableSubDPS[i];
          const amp = availableAmplifiers[j];
          const sus = availableSustains[k];

          if (!subDps || !amp || !sus) continue;

          // Check for base character conflicts (e.g., multiple Trailblazer paths)
          const baseIds = [dps, subDps.char, amp.char, sus.char].map(c => getBaseCharacterId(c.id));
          if (new Set(baseIds).size !== baseIds.length) continue;

          const teamChars = [dps, subDps.char, amp.char, sus.char];

          teams.push(createTeamFromEnriched(
            dps, teamChars,
            [subDps, amp, sus],
            'dual-carry',
            gameMode,
            compositionId,
            composition,
            getInvestment
          ));
        }
      }
    }
  }

  // Sort teams by score (best first), with preferred structure as tie-breaker
  teams.sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (scoreDiff !== 0) return scoreDiff;

    // Tie-breaker: preferred structure wins
    const aIsPreferred = a.structure === preferredStructure ||
                         (preferredStructure.includes('dual') && a.structure === 'dual-carry') ||
                         (preferredStructure.includes('triple') && a.structure === 'dual-carry');
    const bIsPreferred = b.structure === preferredStructure ||
                         (preferredStructure.includes('dual') && b.structure === 'dual-carry') ||
                         (preferredStructure.includes('triple') && b.structure === 'dual-carry');

    if (aIsPreferred && !bIsPreferred) return -1;
    if (bIsPreferred && !aIsPreferred) return 1;
    return 0;
  });
  return teams.slice(0, maxTeams);
}

/**
 * Create a team object from enriched teammate data (with bidirectional scoring)
 * For dual-carry teams, delegates to calculateTeamSynergy for proper dual-focal averaging
 *
 * Updated for composition system: includes composition context and applies weakModes penalty.
 */
function createTeamFromEnriched(
  focal: Character,
  teamChars: Character[],
  teammates: EnrichedTeammate[],
  structure: string,
  gameMode: GameMode,
  compositionId?: string,
  composition?: TeamComposition,
  getInvestment?: (id: string) => UserCharacterInvestment | undefined
): GeneratedTeam {
  const weakModePenalty = getWeakModePenalty(composition, gameMode);
  // Detect if this is a dual-carry team
  const isDualCarry = structure === 'dual-carry' &&
                      teamChars.filter(c => c.roles.includes('DPS') || c.roles.includes('Support DPS')).length === 2;

  if (isDualCarry) {
    // Use calculateTeamSynergy for dual-carry teams to get proper dual-focal averaging
    const synergy = calculateTeamSynergy(teamChars, gameMode);

    // Calculate team rating from synergy score
    const teamRating = scoreToRating(synergy.score / (teamChars.length * 100) * 5); // Normalize to 0-5 scale

    // Build team name based on actual team structure
    const teamName = generateTeamName(teamChars, focal);

    // Override name and structure for consistency
    return {
      ...synergy,
      characters: orderTeamByRole(teamChars),
      name: teamName,
      rating: teamRating,
      structure,
      roles: teamChars.map(c => c.roles[0] || 'DPS'),
      teamSummary: `Dual-carry composition`,
      ratingDescription: `${teamRating}-tier ${structure} composition`,
      compositionId,
      compositionName: composition?.name,
    };
  }

  // Single-carry or other structures: use simplified direct rating logic
  const contributions: TeamMemberContribution[] = [
    {
      characterId: focal.id,
      characterName: focal.name,
      role: 'Main DPS',
      reason: focal.description || 'Primary damage dealer',
      roleFit: 'Perfect',
      contribution: focal.description || 'Primary damage dealer',
    },
    ...teammates.map(tm => {
      // Use direct rating from composition data
      const granularRating = scoreToRating(tm.score);
      const roleFit: 'Perfect' | 'Great' | 'Good' | 'Flex' =
        tm.rating === 'S' ? 'Perfect' :
        tm.rating === 'A' ? 'Great' :
        tm.rating === 'B' ? 'Good' : 'Flex';

      return {
        characterId: tm.char.id,
        characterName: tm.char.name,
        role: tm.char.roles[0] || 'Support',
        rating: granularRating,
        sourceRating: tm.rating,  // Direct rating from composition data
        reason: tm.reason,
        roleFit,
        contribution: tm.reason,
      };
    }),
  ];

  // Calculate average score for team rating
  const avgScore = teammates.reduce((sum, tm) => sum + tm.score, 0) / teammates.length;
  const teamRating = scoreToRating(avgScore);

  // Build key synergies from top-rated teammates
  const keySynergies: string[] = teammates
    .filter(tm => tm.rating === 'S' || tm.rating === 'A')
    .slice(0, 2)
    .map(tm => `${tm.char.name}: ${tm.reason}`);

  // Build team summary based on rating quality
  const highRatedCount = teammates.filter(tm => tm.rating === 'S' || tm.rating === 'A').length;
  const teamSummary = highRatedCount === teammates.length
    ? 'All top-rated teammates'
    : highRatedCount > 0
      ? `${highRatedCount} top-rated teammate${highRatedCount > 1 ? 's' : ''}`
      : 'Mixed team';

  // Build roles array
  const roles: string[] = [
    'DPS',
    ...teammates.map(tm => tm.char.roles[0] || 'Amplifier'),
  ];

  // Build synergy breakdowns for backwards compatibility
  const breakdown: SynergyBreakdown[] = teammates.map(tm => ({
    source: tm.char.name,
    target: focal.name,
    score: tm.score * 20,  // Scale up for display
    reason: tm.reason,
    category: tm.char.roles.includes('Sustain') ? 'sustain' as const :
              tm.char.roles.includes('Amplifier') ? 'amplify' as const : 'core' as const,
  }));

  // Build insights for backwards compatibility
  const insights: TeamInsight[] = [
    {
      title: structure,
      description: `${structure} team built around ${focal.name}`,
      category: 'core',
      characters: teamChars.map(c => c.name),
    },
    ...teammates.slice(0, 2).map(tm => ({
      title: tm.char.name,
      description: tm.reason,
      category: tm.char.roles.includes('Sustain') ? 'sustain' as const :
                tm.char.roles.includes('Amplifier') ? 'amplify' as const : 'core' as const,
      characters: [tm.char.name],
    })),
  ];

  // Calculate team score with composition context and apply weakMode penalty if applicable
  const baseScore = calculateTeamScore(focal, teammates.map(t => ({
    char: t.char,
    rating: t.rating,
    role: t.char.roles[0] || 'Support',
  })), gameMode, compositionId, getInvestment);

  const score = baseScore * weakModePenalty;

  // Build team name based on actual team structure
  const teamName = generateTeamName(teamChars, focal);

  return {
    characters: orderTeamByRole(teamChars),
    name: teamName,
    rating: teamRating,
    structure,
    score,
    reasoning: [
      `${structure} team built around ${focal.name}`,
      ...teammates.map(tm => `${tm.char.name}: ${tm.reason}`),
    ],
    contributions,
    roles,
    breakdown,
    insights,
    teamSummary,
    ratingDescription: `${teamRating}-tier ${structure} composition`,
    keySynergies,
    modeRatings: calculateAllModeRatings(teamChars),
    compositionId,
    compositionName: composition?.name,
  };
}

/**
 * Main entry point - generate teams for DPS characters
 *
 * Strategy:
 * 1. If compositionId specified and character has compositions, use composition teams
 * 2. If DPS has bestTeams, try to build those first
 * 3. Generate teams from teammate recommendations using bidirectional scoring
 * 4. Use DPS's preferred team structure
 *
 * Note: Team generation is only for DPS/Support DPS characters.
 * Support characters (Amplifier/Sustain) use the Teammates tab instead.
 *
 * Updated for composition system: accepts optional compositionId parameter.
 */
export function generateTeams(
  dps: Character,
  ownedCharacters: Character[],
  options: { maxTeams?: number; gameMode?: GameMode; compositionId?: string; getInvestment?: (id: string) => UserCharacterInvestment | undefined } = {}
): GeneratedTeam[] {
  // Only generate teams for DPS characters
  const isDPS = dps.roles.includes('DPS') || dps.roles.includes('Support DPS');
  if (!isDPS) {
    return [];
  }

  return generateTeamsForDPS(dps, ownedCharacters, options);
}

/**
 * Calculate synergy for a manually assembled team
 * Now uses bidirectional scoring
 */
export function calculateTeamSynergy(
  team: Character[],
  gameMode: GameMode = 'moc'
): { score: number; contributions: TeamMemberContribution[]; reasoning: string[]; breakdown: SynergyBreakdown[]; insights: TeamInsight[]; keySynergies?: string[]; modeRatings?: ModeTeamRating[] } {
  if (team.length < 2) {
    return { score: 0, contributions: [], reasoning: [], breakdown: [], insights: [] };
  }

  // Detect dual-carry teams (2 DPS characters)
  const dpsCharacters = team.filter(c => c.roles.includes('DPS') || c.roles.includes('Support DPS'));
  const isDualCarry = dpsCharacters.length === 2;
  const supportCharacters = team.filter(c => !dpsCharacters.includes(c));

  // Fallback to first DPS or first character
  const primaryDPS = dpsCharacters[0] || team[0];
  if (!primaryDPS) {
    return { score: 0, contributions: [], reasoning: [], breakdown: [], insights: [] };
  }

  const keySynergies: string[] = [];
  const contributions: TeamMemberContribution[] = [];

  if (isDualCarry && dpsCharacters[0] && dpsCharacters[1]) {
    // ===== DUAL-CARRY MODE: Average synergy from both DPS perspectives =====
    const dps1 = dpsCharacters[0];
    const dps2 = dpsCharacters[1];

    // Calculate bidirectional synergy between the two DPS (already accounts for both directions)
    const dpsSynergy = calculateBidirectionalScore(dps1, dps2);
    const synergyRating = scoreToRating(dpsSynergy.score);
    const synergyBaseRating = scoreToBaseRating(dpsSynergy.score);

    // Add main DPS without synergy rating (focal point, like in hypercarry)
    contributions.push({
      characterId: dps1.id,
      characterName: dps1.name,
      role: 'Main DPS',
      reason: dps1.description || 'Primary damage dealer',
      roleFit: 'Perfect' as const,
      contribution: dps1.description || 'Primary damage dealer',
    });

    // Add sub DPS with synergy rating (shows how well they pair)
    contributions.push({
      characterId: dps2.id,
      characterName: dps2.name,
      role: 'Sub DPS',
      rating: synergyRating,
      sourceRating: synergyBaseRating,
      reason: dpsSynergy.teammateReason || dpsSynergy.dpsReason || getCombinedReason(dpsSynergy, dps1, dps2),
      roleFit: synergyBaseRating === 'S' ? 'Perfect' :
               synergyBaseRating === 'A' ? 'Great' :
               synergyBaseRating === 'B' ? 'Good' : 'Flex',
      contribution: dps2.description || 'Secondary damage dealer',
    });

    // Evaluate each support from BOTH DPS perspectives, then average
    for (const support of supportCharacters) {
      const score1 = calculateBidirectionalScore(dps1, support);
      const score2 = calculateBidirectionalScore(dps2, support);

      // Average the scores from both perspectives
      const avgScore = (score1.score + score2.score) / 2;
      const effectiveRating = scoreToRating(avgScore);
      const baseRating = scoreToBaseRating(avgScore);

      // Build combined reason showing both perspectives
      let reason = '';
      if (score1.dpsReason && score2.dpsReason) {
        // Both DPS have explicit ratings
        reason = `${dps1.name}: ${score1.dpsReason} | ${dps2.name}: ${score2.dpsReason}`;
      } else if (score1.dpsReason) {
        reason = `${dps1.name}: ${score1.dpsReason}`;
      } else if (score2.dpsReason) {
        reason = `${dps2.name}: ${score2.dpsReason}`;
      } else {
        reason = getCombinedReason(score1, dps1, support);
      }

      // Track mutual synergies
      if (score1.confidence === 'mutual' || score2.confidence === 'mutual') {
        keySynergies.push(`${support.name}: ${reason}`);
      }

      contributions.push({
        characterId: support.id,
        characterName: support.name,
        role: support.roles[0] || 'Support',
        rating: effectiveRating,
        sourceRating: baseRating,
        reason,
        roleFit: baseRating === 'S' ? 'Perfect' :
                 baseRating === 'A' ? 'Great' :
                 baseRating === 'B' ? 'Good' : 'Flex',
        contribution: reason,
      });
    }

    // Calculate score: tier scores + averaged synergy scores
    let score = 0;
    for (const c of team) {
      const tier = getBestTierForMode(c.id, gameMode);
      score += TIER_SCORES[tier];
    }

    // Add DPS-to-DPS synergy
    score += dpsSynergy.score * 20;

    // Add averaged support synergies
    for (const support of supportCharacters) {
      const score1 = calculateBidirectionalScore(dps1, support);
      const score2 = calculateBidirectionalScore(dps2, support);
      const avgScore = (score1.score + score2.score) / 2;
      score += avgScore * 20;
    }

    const reasoning = contributions
      .filter(c => c.reason && c.characterId !== dps1.id)
      .map(c => `${c.characterName}: ${c.reason}`);

    // Build breakdown showing averaged scores
    const breakdown: SynergyBreakdown[] = supportCharacters.map(support => {
      const score1 = calculateBidirectionalScore(dps1, support);
      const score2 = calculateBidirectionalScore(dps2, support);
      const avgScore = (score1.score + score2.score) / 2;

      return {
        source: support.name,
        target: `${dps1.name} + ${dps2.name}`,
        score: avgScore * 20,
        reason: contributions.find(c => c.characterId === support.id)?.reason || '',
        category: support.roles.includes('Sustain') ? 'sustain' as const :
                  support.roles.includes('Amplifier') ? 'amplify' as const : 'core' as const,
      };
    });

    // Build insights
    const insights: TeamInsight[] = contributions
      .filter(c => c.characterId !== dps1.id && c.characterId !== dps2.id && c.reason)
      .slice(0, 3)
      .map(c => ({
        title: c.characterName,
        description: c.reason,
        category: c.role === 'Sustain' ? 'sustain' as const :
                  c.role === 'Amplifier' ? 'amplify' as const : 'core' as const,
        characters: [c.characterName],
      }));

    return {
      score,
      contributions,
      reasoning,
      breakdown,
      insights,
      keySynergies,
      modeRatings: calculateAllModeRatings(team),
    };

  } else {
    // ===== SINGLE-CARRY MODE: Original logic =====
    const dps = primaryDPS;

    const contributions: TeamMemberContribution[] = team.map(c => {
      if (c.id === dps.id) {
        return {
          characterId: c.id,
          characterName: c.name,
          role: 'Main DPS',
          reason: c.description || 'Primary damage dealer',
          roleFit: 'Perfect' as const,
          contribution: c.description || 'Primary damage dealer',
        };
      }

      // Use bidirectional scoring
      const biScore = calculateBidirectionalScore(dps, c);
      const effectiveRating = scoreToRating(biScore.score);
      const baseRating = scoreToBaseRating(biScore.score);
      const roleFit: 'Perfect' | 'Great' | 'Good' | 'Flex' =
        baseRating === 'S' ? 'Perfect' :
        baseRating === 'A' ? 'Great' :
        baseRating === 'B' ? 'Good' : 'Flex';

      // Build reason from bidirectional data
      let reason = getCombinedReason(biScore, dps, c);
      if (biScore.confidence === 'mutual') {
        keySynergies.push(`${c.name}: ${biScore.dpsReason || reason}`);
      }

      return {
        characterId: c.id,
        characterName: c.name,
        role: c.roles[0] || 'Support',
        rating: effectiveRating,
        sourceRating: baseRating,
        reason,
        roleFit,
        contribution: reason,
      };
    });

    // Calculate score using bidirectional formula
    let score = 0;
    for (const c of team) {
      const tier = getBestTierForMode(c.id, gameMode);
      score += TIER_SCORES[tier];

      if (c.id !== dps.id) {
        const biScore = calculateBidirectionalScore(dps, c);
        score += biScore.score * 20;
      }
    }

    const reasoning = contributions
      .filter(c => c.reason && c.characterId !== dps.id)
      .map(c => `${c.characterName}: ${c.reason}`);

    // Build breakdown for backwards compatibility
    const breakdown: SynergyBreakdown[] = contributions
      .filter(c => c.characterId !== dps.id)
      .map(c => {
        const biScore = calculateBidirectionalScore(dps, team.find(t => t.id === c.characterId)!);
        return {
          source: c.characterName,
          target: dps.name,
          score: biScore.score * 20,
          reason: c.reason,
          category: c.role === 'Sustain' ? 'sustain' as const :
                    c.role === 'Amplifier' ? 'amplify' as const : 'core' as const,
        };
      });

    // Build insights
    const insights: TeamInsight[] = contributions
      .filter(c => c.characterId !== dps.id && c.reason)
      .slice(0, 3)
      .map(c => ({
        title: c.characterName,
        description: c.reason,
        category: c.role === 'Sustain' ? 'sustain' as const :
                  c.role === 'Amplifier' ? 'amplify' as const : 'core' as const,
        characters: [c.characterName],
      }));

    return {
      score,
      contributions,
      reasoning,
      breakdown,
      insights,
      keySynergies,
      modeRatings: calculateAllModeRatings(team),
    };
  }
}

/**
 * Generate teams for a Support character (Amplifier/Sustain)
 *
 * Returns TWO categories of teams:
 * 1. focalTeams: Teams from support's own compositions (support as focal character)
 * 2. supportingTeams: Teams from DPS compositions where support is included
 *
 * Strategy:
 * Part A (Focal Teams):
 *   - Generate teams from support's own compositions
 *   - Support is the organizing principle, similar to DPS generation
 *
 * Part B (Supporting Teams):
 *   - For each owned DPS with compositions, check if support is included
 *   - Generate teams with support forced in from DPS's perspective
 *   - Also handle legacy DPS (no compositions) using bidirectional scoring
 */
export function generateTeamsForSupport(
  support: Character,
  ownedCharacters: Character[],
  _allCharacters: Character[],
  options: { maxTeams?: number; gameMode?: GameMode; getInvestment?: (id: string) => UserCharacterInvestment | undefined } = {}
): SupportTeamResult {
  const { maxTeams = 12, gameMode = 'moc', getInvestment } = options;
  const ownedIds = new Set(ownedCharacters.map(c => c.id));

  // Track seen team keys globally to avoid duplicates between sections
  const globalSeenKeys = new Set<string>();

  // ========================================
  // PART A: Focal Teams (Support's Own Compositions)
  // ========================================
  const focalTeams: GeneratedTeam[] = [];

  if (hasCompositions(support)) {
    for (const composition of support.compositions!) {
      // Check composition requirements
      if (!meetsCompositionRequirements(composition, ownedCharacters)) {
        continue;
      }

      const weakModePenalty = getWeakModePenalty(composition, gameMode);

      // A1. Pre-built teams from composition
      if (composition.teams) {
        for (const compTeam of composition.teams) {
          const canBuild = compTeam.characters.every(id => ownedIds.has(id));
          if (!canBuild) continue;

          const teamCharsRaw = compTeam.characters
            .map(id => ownedCharacters.find(c => c.id === id))
            .filter((c): c is Character => c !== undefined);

          if (teamCharsRaw.length !== 4) continue;

          // Reorder to put support first
          const focalIndex = teamCharsRaw.findIndex(c => c.id === support.id);
          const teamChars = focalIndex > 0
            ? [teamCharsRaw[focalIndex]!, ...teamCharsRaw.slice(0, focalIndex), ...teamCharsRaw.slice(focalIndex + 1)]
            : teamCharsRaw;

          // Create contributions
          const contributions: TeamMemberContribution[] = teamChars.map((c) => {
            let sourceRating: TeammateRating | undefined;
            let rating: GranularRating | undefined;
            let reason = c.id === support.id ? `${support.roles[0]} (Focal)` : c.roles.join(', ');
            const roleFit: 'Perfect' | 'Great' | 'Good' | 'Flex' = 'Perfect';

            if (c.id !== support.id) {
              const rec = findTeammateRec(support, c.id, composition.id);
              if (rec) {
                sourceRating = rec.rating;
                rating = scoreToRating(TEAMMATE_RATING_SCORES[rec.rating]);
                reason = rec.reason;
              }
            }

            return {
              characterId: c.id,
              characterName: c.name,
              role: c.roles[0] || 'Support',
              sourceRating,
              rating,
              reason,
              roleFit,
            };
          });

          // Calculate score
          const baseScore = calculateTeamScore(support, contributions.slice(1).map(c => ({
            char: teamChars.find(tc => tc.id === c.characterId)!,
            rating: c.sourceRating,
            role: c.role,
          })), gameMode, composition.id, getInvestment);

          const teamKey = [...teamChars.map(c => c.id)].sort().join(',');
          if (globalSeenKeys.has(teamKey)) continue;
          globalSeenKeys.add(teamKey);

          // Find DPS for team naming (or use support as focal)
          const teamDPS = teamChars.find(c => c.roles.includes('DPS') || c.roles.includes('Support DPS')) || support;

          focalTeams.push({
            characters: orderTeamByRole(teamChars),
            name: generateTeamName(teamChars, teamDPS),
            rating: compTeam.rating,
            structure: compTeam.structure,
            score: baseScore * weakModePenalty,
            reasoning: [compTeam.notes || composition.coreMechanic],
            contributions,
            roles: teamChars.map(c => c.roles[0] || 'Support'),
            breakdown: [],
            insights: [],
            keySynergies: [composition.coreMechanic],
            modeRatings: calculateAllModeRatings(teamChars),
            compositionId: composition.id,
            compositionName: composition.name,
          });
        }
      }

      // A2. Generate dynamic teams from support's teammates
      const teammates = getTeammatesForComposition(support, composition.id);
      const structure = composition.structure;

      if (structure && teammates.dps && teammates.dps.length > 0) {
        // Get available teammates
        const availableDPS = (teammates.dps || [])
          .filter(rec => ownedIds.has(rec.id) && rec.id !== support.id)
          .map(rec => {
            const char = ownedCharacters.find(c => c.id === rec.id);
            return char ? { ...rec, char } : null;
          })
          .filter((x): x is { id: string; rating: TeammateRating; reason: string; char: Character } => x !== null);

        const availableAmplifiers = (teammates.amplifiers || [])
          .filter(rec => ownedIds.has(rec.id) && rec.id !== support.id)
          .map(rec => {
            const char = ownedCharacters.find(c => c.id === rec.id);
            return char ? { ...rec, char } : null;
          })
          .filter((x): x is { id: string; rating: TeammateRating; reason: string; char: Character } => x !== null);

        const availableSustains = (teammates.sustains || [])
          .filter(rec => ownedIds.has(rec.id) && rec.id !== support.id)
          .map(rec => {
            const char = ownedCharacters.find(c => c.id === rec.id);
            return char ? { ...rec, char } : null;
          })
          .filter((x): x is { id: string; rating: TeammateRating; reason: string; char: Character } => x !== null);

        // Generate teams based on structure
        const supportIsAmplifier = support.roles.includes('Amplifier');
        const supportIsSustain = support.roles.includes('Sustain');

        // Calculate how many of each role we still need (excluding support)
        const needDPS = structure.dps;
        const needAmplifier = structure.amplifier - (supportIsAmplifier ? 1 : 0);
        const needSustain = structure.sustain - (supportIsSustain ? 1 : 0);

        // Generate team combinations
        for (let d = 0; d < Math.min(3, availableDPS.length); d++) {
          if (needDPS < 1) continue;
          const dpsChar = availableDPS[d];
          if (!dpsChar) continue;

          for (let a = 0; a < Math.max(1, Math.min(3, availableAmplifiers.length)); a++) {
            const ampChar = needAmplifier > 0 ? availableAmplifiers[a] : null;
            if (needAmplifier > 0 && !ampChar) continue;

            for (let s = 0; s < Math.max(1, Math.min(3, availableSustains.length)); s++) {
              const susChar = needSustain > 0 ? availableSustains[s] : null;
              if (needSustain > 0 && !susChar) continue;

              // Build team
              const teamChars: Character[] = [support];
              const usedIds = new Set([support.id]);

              if (dpsChar && !usedIds.has(dpsChar.id)) {
                teamChars.push(dpsChar.char);
                usedIds.add(dpsChar.id);
              }
              if (ampChar && !usedIds.has(ampChar.id)) {
                teamChars.push(ampChar.char);
                usedIds.add(ampChar.id);
              }
              if (susChar && !usedIds.has(susChar.id)) {
                teamChars.push(susChar.char);
                usedIds.add(susChar.id);
              }

              if (teamChars.length !== 4) continue;

              // Check for base ID conflicts (Trailblazer variants)
              const baseIds = teamChars.map(c => getBaseCharacterId(c.id));
              if (new Set(baseIds).size !== 4) continue;

              const teamKey = [...teamChars.map(c => c.id)].sort().join(',');
              if (globalSeenKeys.has(teamKey)) continue;
              globalSeenKeys.add(teamKey);

              // Create team
              const contributions: TeamMemberContribution[] = teamChars.map((c) => {
                if (c.id === support.id) {
                  return {
                    characterId: c.id,
                    characterName: c.name,
                    role: c.roles[0] || 'Support',
                    reason: `${support.roles[0]} (Focal)`,
                    roleFit: 'Perfect' as const,
                  };
                }
                const rec = findTeammateRec(support, c.id, composition.id);
                return {
                  characterId: c.id,
                  characterName: c.name,
                  role: c.roles[0] || 'Support',
                  sourceRating: rec?.rating,
                  rating: rec ? scoreToRating(TEAMMATE_RATING_SCORES[rec.rating]) : undefined,
                  reason: rec?.reason || c.roles.join(', '),
                  roleFit: 'Good' as const,
                };
              });

              const avgScore = contributions
                .filter(c => c.sourceRating)
                .reduce((sum, c) => sum + TEAMMATE_RATING_SCORES[c.sourceRating!], 0) /
                Math.max(1, contributions.filter(c => c.sourceRating).length);

              // Build team name based on actual team structure
              const focalChar = dpsChar?.char || support;
              const teamName = generateTeamName(teamChars, focalChar);

              focalTeams.push({
                characters: orderTeamByRole(teamChars),
                name: teamName,
                rating: scoreToRating(avgScore),
                structure: structure.dps >= 2 ? 'dual-carry' : 'hypercarry',
                score: avgScore * 20 * weakModePenalty,
                reasoning: [composition.coreMechanic],
                contributions,
                roles: teamChars.map(c => c.roles[0] || 'Support'),
                breakdown: [],
                insights: [],
                modeRatings: calculateAllModeRatings(teamChars),
                compositionId: composition.id,
                compositionName: composition.name,
              });
            }
          }
        }
      }
    }
  }

  // Sort focal teams by score
  focalTeams.sort((a, b) => b.score - a.score);

  // ========================================
  // PART B: Supporting Teams (DPS Compositions)
  // ========================================
  const supportingTeams: GeneratedTeam[] = [];

  // Find owned DPS characters
  const ownedDPS = ownedCharacters.filter(c =>
    c.roles.includes('DPS') || c.roles.includes('Support DPS')
  );

  // B1. Check DPS with compositions
  for (const dps of ownedDPS) {
    if (!hasCompositions(dps)) continue;

    for (const composition of dps.compositions!) {
      // Check if support is included in this composition
      const supportIncluded = isSupportInComposition(support, dps, composition);
      if (!supportIncluded) continue;

      // Check composition requirements
      if (!meetsCompositionRequirements(composition, ownedCharacters)) {
        continue;
      }

      const weakModePenalty = getWeakModePenalty(composition, gameMode);

      // B1a. Pre-built teams that include support
      if (composition.teams) {
        for (const compTeam of composition.teams) {
          if (!compTeam.characters.includes(support.id)) continue;

          const canBuild = compTeam.characters.every(id => ownedIds.has(id));
          if (!canBuild) continue;

          const teamCharsRaw = compTeam.characters
            .map(id => ownedCharacters.find(c => c.id === id))
            .filter((c): c is Character => c !== undefined);

          if (teamCharsRaw.length !== 4) continue;

          // Reorder to put DPS first
          const focalIndex = teamCharsRaw.findIndex(c => c.id === dps.id);
          const teamChars = focalIndex > 0
            ? [teamCharsRaw[focalIndex]!, ...teamCharsRaw.slice(0, focalIndex), ...teamCharsRaw.slice(focalIndex + 1)]
            : teamCharsRaw;

          const teamKey = [...teamChars.map(c => c.id)].sort().join(',');
          if (globalSeenKeys.has(teamKey)) continue;
          globalSeenKeys.add(teamKey);

          // Create contributions
          const contributions: TeamMemberContribution[] = teamChars.map((c) => {
            let sourceRating: TeammateRating | undefined;
            let rating: GranularRating | undefined;
            let reason = c.id === dps.id ? 'Main DPS' : c.roles.join(', ');

            if (c.id !== dps.id) {
              const rec = findTeammateRec(dps, c.id, composition.id);
              if (rec) {
                sourceRating = rec.rating;
                rating = scoreToRating(TEAMMATE_RATING_SCORES[rec.rating]);
                reason = rec.reason;
              }
            }

            return {
              characterId: c.id,
              characterName: c.name,
              role: c.roles[0] || 'Support',
              sourceRating,
              rating,
              reason,
              roleFit: 'Perfect' as const,
            };
          });

          const baseScore = calculateTeamScore(dps, contributions.slice(1).map(c => ({
            char: teamChars.find(tc => tc.id === c.characterId)!,
            rating: c.sourceRating,
            role: c.role,
          })), gameMode, composition.id, getInvestment);

          supportingTeams.push({
            characters: orderTeamByRole(teamChars),
            name: `${dps.name}: ${compTeam.name}`,
            rating: compTeam.rating,
            structure: compTeam.structure,
            score: baseScore * weakModePenalty,
            reasoning: [compTeam.notes || composition.coreMechanic],
            contributions,
            roles: teamChars.map(c => c.roles[0] || 'Support'),
            breakdown: [],
            insights: [],
            keySynergies: [composition.coreMechanic],
            modeRatings: calculateAllModeRatings(teamChars),
            compositionId: composition.id,
            compositionName: composition.name,
          });
        }
      }

      // B1b. Generate teams with support forced in
      const forcedTeams = generateTeamsWithRequiredSupportInComposition(
        dps, support, composition, ownedCharacters, gameMode, globalSeenKeys
      );
      supportingTeams.push(...forcedTeams);
    }
  }

  // B2. Legacy DPS (no compositions) - use bidirectional scoring
  for (const dps of ownedDPS) {
    if (hasCompositions(dps)) continue; // Already handled above

    const biScore = calculateBidirectionalScore(dps, support);
    if (biScore.score <= 0) continue;

    const reason = biScore.dpsReason || biScore.teammateReason ||
                   `${support.roles[0]} for ${dps.name}`;

    // Check legacy bestTeams
    if (dps.bestTeams) {
      for (const best of dps.bestTeams) {
        if (!best.characters.includes(support.id)) continue;

        const canBuild = best.characters.every(id => ownedIds.has(id));
        if (!canBuild) continue;

        const teamChars = best.characters
          .map(id => ownedCharacters.find(c => c.id === id))
          .filter((c): c is Character => c !== undefined);

        if (teamChars.length !== 4) continue;

        const teamKey = [...teamChars.map(c => c.id)].sort().join(',');
        if (globalSeenKeys.has(teamKey)) continue;
        globalSeenKeys.add(teamKey);

        // Reorder to put DPS first
        const focalIndex = teamChars.findIndex(c => c.id === dps.id);
        const orderedChars = focalIndex > 0
          ? [teamChars[focalIndex]!, ...teamChars.slice(0, focalIndex), ...teamChars.slice(focalIndex + 1)]
          : teamChars;

        const team = createBestTeamEntry(dps, orderedChars, best, gameMode);
        supportingTeams.push(team);
      }
    }

    // Generate teams with forced support inclusion
    const forcedTeams = generateTeamsWithRequiredSupport(
      dps, support, biScore, reason, ownedCharacters, gameMode, getInvestment
    );

    for (const team of forcedTeams) {
      const teamKey = [...team.characters.map(c => c.id)].sort().join(',');
      if (globalSeenKeys.has(teamKey)) continue;
      globalSeenKeys.add(teamKey);
      supportingTeams.push(team);
    }
  }

  // Sort supporting teams by ranking score
  supportingTeams.sort((a, b) => getTeamRankingScore(b, gameMode) - getTeamRankingScore(a, gameMode));

  // Apply limits
  return {
    focalTeams: focalTeams.slice(0, maxTeams),
    supportingTeams: supportingTeams.slice(0, maxTeams),
  };
}

/**
 * Check if a support character is included in a DPS composition
 * (either in pre-built teams or rated in teammates)
 */
function isSupportInComposition(
  support: Character,
  dps: Character,
  composition: TeamComposition
): boolean {
  // Check pre-built teams
  if (composition.teams) {
    for (const team of composition.teams) {
      if (team.characters.includes(support.id)) return true;
    }
  }

  // Check teammate ratings (base + overrides)
  const teammates = getTeammatesForComposition(dps, composition.id);
  const allRecs = [
    ...(teammates.amplifiers || []),
    ...(teammates.sustains || []),
    ...(teammates.subDPS || []),
    ...(teammates.dps || []),
  ];

  return allRecs.some(rec => rec.id === support.id);
}

/**
 * Generate teams with a required support within a specific DPS composition context
 */
function generateTeamsWithRequiredSupportInComposition(
  dps: Character,
  requiredSupport: Character,
  composition: TeamComposition,
  ownedCharacters: Character[],
  gameMode: GameMode,
  globalSeenKeys: Set<string>
): GeneratedTeam[] {
  const teams: GeneratedTeam[] = [];
  const ownedIds = new Set(ownedCharacters.map(c => c.id));
  const usedBaseIds = new Set([getBaseCharacterId(dps.id), getBaseCharacterId(requiredSupport.id)]);
  const weakModePenalty = getWeakModePenalty(composition, gameMode);

  // Get teammates for this composition
  const teammates = getTeammatesForComposition(dps, composition.id);

  // Determine support's role
  const supportRole: 'Amplifier' | 'Sustain' | 'Support DPS' =
    requiredSupport.roles.includes('Amplifier') ? 'Amplifier' :
    requiredSupport.roles.includes('Sustain') ? 'Sustain' : 'Support DPS';

  // Get available teammates (excluding DPS and required support)
  const getAvailable = (category: 'amplifiers' | 'sustains' | 'subDPS' | 'dps') => {
    const recs = category === 'subDPS'
      ? [...(teammates.subDPS || []), ...(teammates.dps || [])]
      : teammates[category] || [];

    return recs
      .filter(rec => ownedIds.has(rec.id) && rec.id !== requiredSupport.id && rec.id !== dps.id)
      .filter(rec => !usedBaseIds.has(getBaseCharacterId(rec.id)))
      .map(rec => {
        const char = ownedCharacters.find(c => c.id === rec.id);
        return char ? { rec, char } : null;
      })
      .filter((x): x is { rec: { id: string; rating: TeammateRating; reason: string }; char: Character } => x !== null);
  };

  const availableAmplifiers = getAvailable('amplifiers');
  const availableSustains = getAvailable('sustains');

  // Get support's rating from DPS's perspective
  const supportRec = findTeammateRec(dps, requiredSupport.id, composition.id);
  const supportRating = supportRec?.rating || 'B';
  const supportReason = supportRec?.reason || `${requiredSupport.roles[0]} for ${dps.name}`;

  // Generate teams based on support's role
  if (supportRole === 'Amplifier') {
    // Hypercarry: DPS + Amp(required) + Amp + Sustain
    for (let i = 0; i < Math.min(3, availableAmplifiers.length); i++) {
      for (let j = 0; j < Math.min(3, availableSustains.length); j++) {
        const amp2 = availableAmplifiers[i];
        const sus = availableSustains[j];
        if (!amp2 || !sus) continue;

        const teamChars = [dps, requiredSupport, amp2.char, sus.char];
        const baseIds = teamChars.map(c => getBaseCharacterId(c.id));
        if (new Set(baseIds).size !== 4) continue;

        const teamKey = [...teamChars.map(c => c.id)].sort().join(',');
        if (globalSeenKeys.has(teamKey)) continue;
        globalSeenKeys.add(teamKey);

        const contributions: TeamMemberContribution[] = [
          { characterId: dps.id, characterName: dps.name, role: 'DPS', reason: 'Main DPS', roleFit: 'Perfect' },
          { characterId: requiredSupport.id, characterName: requiredSupport.name, role: 'Amplifier', sourceRating: supportRating, rating: scoreToRating(TEAMMATE_RATING_SCORES[supportRating]), reason: supportReason, roleFit: 'Perfect' },
          { characterId: amp2.char.id, characterName: amp2.char.name, role: 'Amplifier', sourceRating: amp2.rec.rating, rating: scoreToRating(TEAMMATE_RATING_SCORES[amp2.rec.rating]), reason: amp2.rec.reason, roleFit: 'Great' },
          { characterId: sus.char.id, characterName: sus.char.name, role: 'Sustain', sourceRating: sus.rec.rating, rating: scoreToRating(TEAMMATE_RATING_SCORES[sus.rec.rating]), reason: sus.rec.reason, roleFit: 'Great' },
        ];

        const avgScore = (TEAMMATE_RATING_SCORES[supportRating] + TEAMMATE_RATING_SCORES[amp2.rec.rating] + TEAMMATE_RATING_SCORES[sus.rec.rating]) / 3;

        teams.push({
          characters: orderTeamByRole(teamChars),
          name: generateTeamName(teamChars, dps),
          rating: scoreToRating(avgScore),
          structure: 'hypercarry',
          score: avgScore * 20 * weakModePenalty,
          reasoning: [composition.coreMechanic],
          contributions,
          roles: teamChars.map(c => c.roles[0] || 'Support'),
          breakdown: [],
          insights: [],
          modeRatings: calculateAllModeRatings(teamChars),
          compositionId: composition.id,
          compositionName: composition.name,
        });
      }
    }
  } else if (supportRole === 'Sustain') {
    // Hypercarry: DPS + Amp + Amp + Sustain(required)
    for (let i = 0; i < Math.min(3, availableAmplifiers.length); i++) {
      for (let j = i + 1; j < Math.min(4, availableAmplifiers.length); j++) {
        const amp1 = availableAmplifiers[i];
        const amp2 = availableAmplifiers[j];
        if (!amp1 || !amp2) continue;

        const teamChars = [dps, amp1.char, amp2.char, requiredSupport];
        const baseIds = teamChars.map(c => getBaseCharacterId(c.id));
        if (new Set(baseIds).size !== 4) continue;

        const teamKey = [...teamChars.map(c => c.id)].sort().join(',');
        if (globalSeenKeys.has(teamKey)) continue;
        globalSeenKeys.add(teamKey);

        const contributions: TeamMemberContribution[] = [
          { characterId: dps.id, characterName: dps.name, role: 'DPS', reason: 'Main DPS', roleFit: 'Perfect' },
          { characterId: amp1.char.id, characterName: amp1.char.name, role: 'Amplifier', sourceRating: amp1.rec.rating, rating: scoreToRating(TEAMMATE_RATING_SCORES[amp1.rec.rating]), reason: amp1.rec.reason, roleFit: 'Great' },
          { characterId: amp2.char.id, characterName: amp2.char.name, role: 'Amplifier', sourceRating: amp2.rec.rating, rating: scoreToRating(TEAMMATE_RATING_SCORES[amp2.rec.rating]), reason: amp2.rec.reason, roleFit: 'Great' },
          { characterId: requiredSupport.id, characterName: requiredSupport.name, role: 'Sustain', sourceRating: supportRating, rating: scoreToRating(TEAMMATE_RATING_SCORES[supportRating]), reason: supportReason, roleFit: 'Perfect' },
        ];

        const avgScore = (TEAMMATE_RATING_SCORES[amp1.rec.rating] + TEAMMATE_RATING_SCORES[amp2.rec.rating] + TEAMMATE_RATING_SCORES[supportRating]) / 3;

        teams.push({
          characters: orderTeamByRole(teamChars),
          name: generateTeamName(teamChars, dps),
          rating: scoreToRating(avgScore),
          structure: 'hypercarry',
          score: avgScore * 20 * weakModePenalty,
          reasoning: [composition.coreMechanic],
          contributions,
          roles: teamChars.map(c => c.roles[0] || 'Support'),
          breakdown: [],
          insights: [],
          modeRatings: calculateAllModeRatings(teamChars),
          compositionId: composition.id,
          compositionName: composition.name,
        });
      }
    }
  } else {
    // Support DPS - dual carry
    for (let i = 0; i < Math.min(3, availableAmplifiers.length); i++) {
      for (let j = 0; j < Math.min(3, availableSustains.length); j++) {
        const amp = availableAmplifiers[i];
        const sus = availableSustains[j];
        if (!amp || !sus) continue;

        const teamChars = [dps, requiredSupport, amp.char, sus.char];
        const baseIds = teamChars.map(c => getBaseCharacterId(c.id));
        if (new Set(baseIds).size !== 4) continue;

        const teamKey = [...teamChars.map(c => c.id)].sort().join(',');
        if (globalSeenKeys.has(teamKey)) continue;
        globalSeenKeys.add(teamKey);

        const contributions: TeamMemberContribution[] = [
          { characterId: dps.id, characterName: dps.name, role: 'DPS', reason: 'Main DPS', roleFit: 'Perfect' },
          { characterId: requiredSupport.id, characterName: requiredSupport.name, role: 'Support DPS', sourceRating: supportRating, rating: scoreToRating(TEAMMATE_RATING_SCORES[supportRating]), reason: supportReason, roleFit: 'Perfect' },
          { characterId: amp.char.id, characterName: amp.char.name, role: 'Amplifier', sourceRating: amp.rec.rating, rating: scoreToRating(TEAMMATE_RATING_SCORES[amp.rec.rating]), reason: amp.rec.reason, roleFit: 'Great' },
          { characterId: sus.char.id, characterName: sus.char.name, role: 'Sustain', sourceRating: sus.rec.rating, rating: scoreToRating(TEAMMATE_RATING_SCORES[sus.rec.rating]), reason: sus.rec.reason, roleFit: 'Great' },
        ];

        const avgScore = (TEAMMATE_RATING_SCORES[supportRating] + TEAMMATE_RATING_SCORES[amp.rec.rating] + TEAMMATE_RATING_SCORES[sus.rec.rating]) / 3;

        teams.push({
          characters: orderTeamByRole(teamChars),
          name: generateTeamName(teamChars, dps),
          rating: scoreToRating(avgScore),
          structure: 'dual-carry',
          score: avgScore * 20 * weakModePenalty,
          reasoning: [composition.coreMechanic],
          contributions,
          roles: teamChars.map(c => c.roles[0] || 'Support'),
          breakdown: [],
          insights: [],
          modeRatings: calculateAllModeRatings(teamChars),
          compositionId: composition.id,
          compositionName: composition.name,
        });
      }
    }
  }

  return teams.slice(0, 4); // Limit per composition
}

/**
 * Generate multiple team variations for a DPS with a REQUIRED support locked in.
 * This guarantees the support appears in all generated teams.
 */
function generateTeamsWithRequiredSupport(
  dps: Character,
  requiredSupport: Character,
  supportBiScore: BidirectionalScore,
  supportReason: string,
  ownedCharacters: Character[],
  gameMode: GameMode,
  getInvestment?: (id: string) => UserCharacterInvestment | undefined
): GeneratedTeam[] {
  const teams: GeneratedTeam[] = [];
  const usedBaseIds = new Set([getBaseCharacterId(dps.id), getBaseCharacterId(requiredSupport.id)]);

  // Build investments map for investment-aware ratings
  const investments = new Map<string, InvestmentLevel>();
  if (getInvestment) {
    for (const char of ownedCharacters) {
      const inv = getInvestment(char.id);
      if (inv) {
        investments.set(char.id, {
          eidolonLevel: inv.eidolonLevel,
          lightConeId: inv.lightConeId,
          lightConeSuperimposition: inv.lightConeSuperimposition,
        });
      }
    }
    const dpsInv = getInvestment(dps.id);
    if (dpsInv) {
      investments.set(dps.id, {
        eidolonLevel: dpsInv.eidolonLevel,
        lightConeId: dpsInv.lightConeId,
        lightConeSuperimposition: dpsInv.lightConeSuperimposition,
      });
    }
  }

  // Determine support's role for slot allocation
  const supportRole: 'Amplifier' | 'Sustain' | 'Support DPS' =
    requiredSupport.roles.includes('Amplifier') ? 'Amplifier' :
    requiredSupport.roles.includes('Sustain') ? 'Sustain' : 'Support DPS';

  // Get available teammates by role (excluding DPS and required support)
  const getAvailable = (role: 'Amplifier' | 'Sustain' | 'Support DPS'): EnrichedTeammate[] => {
    return getEnrichedTeammates(dps, ownedCharacters, role, gameMode, undefined, investments.size > 0 ? investments : undefined)
      .filter(tm => tm.id !== requiredSupport.id && !usedBaseIds.has(getBaseCharacterId(tm.id)));
  };

  const availableAmplifiers = getAvailable('Amplifier');
  const availableSustains = getAvailable('Sustain');
  const availableSubDPS = getAvailable('Support DPS');

  // Create enriched entry for required support (using direct rating)
  const supportRating = scoreToBaseRating(supportBiScore.score);
  const supportEntry: EnrichedTeammate = {
    id: requiredSupport.id,
    char: requiredSupport,
    rating: supportRating,
    reason: supportReason,
    score: TEAMMATE_RATING_SCORES[supportRating],
  };

  // Determine what slots we need to fill based on support's role
  if (supportRole === 'Support DPS') {
    // Support is a subDPS - build dual-carry teams
    // Structure: DPS + SubDPS(required) + Amp + Sustain
    for (let i = 0; i < Math.min(4, availableAmplifiers.length); i++) {
      for (let j = 0; j < Math.min(3, availableSustains.length); j++) {
        const amp = availableAmplifiers[i];
        const sus = availableSustains[j];
        if (!amp || !sus) continue;

        // Check base ID conflicts
        const baseIds = [dps, requiredSupport, amp.char, sus.char].map(c => getBaseCharacterId(c.id));
        if (new Set(baseIds).size !== 4) continue;

        const teamChars = [dps, requiredSupport, amp.char, sus.char];
        teams.push(createTeamFromEnriched(
          dps, teamChars,
          [supportEntry, amp, sus],
          'dual-carry',
          gameMode,
          undefined,
          undefined,
          getInvestment
        ));
      }
    }
  } else if (supportRole === 'Amplifier') {
    // Support is Amplifier - can build hypercarry or dual-carry

    // Hypercarry: DPS + Amp(required) + Amp + Sustain
    for (let i = 0; i < Math.min(4, availableAmplifiers.length); i++) {
      for (let j = 0; j < Math.min(3, availableSustains.length); j++) {
        const amp2 = availableAmplifiers[i];
        const sus = availableSustains[j];
        if (!amp2 || !sus) continue;

        const baseIds = [dps, requiredSupport, amp2.char, sus.char].map(c => getBaseCharacterId(c.id));
        if (new Set(baseIds).size !== 4) continue;

        const teamChars = [dps, requiredSupport, amp2.char, sus.char];
        teams.push(createTeamFromEnriched(
          dps, teamChars,
          [supportEntry, amp2, sus],
          'hypercarry',
          gameMode,
          undefined,
          undefined,
          getInvestment
        ));
      }
    }

    // Dual-carry: DPS + SubDPS + Amp(required) + Sustain
    for (let i = 0; i < Math.min(3, availableSubDPS.length); i++) {
      for (let j = 0; j < Math.min(3, availableSustains.length); j++) {
        const subDps = availableSubDPS[i];
        const sus = availableSustains[j];
        if (!subDps || !sus) continue;

        const baseIds = [dps, subDps.char, requiredSupport, sus.char].map(c => getBaseCharacterId(c.id));
        if (new Set(baseIds).size !== 4) continue;

        const teamChars = [dps, subDps.char, requiredSupport, sus.char];
        teams.push(createTeamFromEnriched(
          dps, teamChars,
          [subDps, supportEntry, sus],
          'dual-carry',
          gameMode,
          undefined,
          undefined,
          getInvestment
        ));
      }
    }
  } else {
    // Support is Sustain - can build hypercarry or dual-carry

    // Hypercarry: DPS + Amp + Amp + Sustain(required)
    for (let i = 0; i < Math.min(4, availableAmplifiers.length); i++) {
      for (let j = i + 1; j < Math.min(5, availableAmplifiers.length); j++) {
        const amp1 = availableAmplifiers[i];
        const amp2 = availableAmplifiers[j];
        if (!amp1 || !amp2) continue;

        const baseIds = [dps, amp1.char, amp2.char, requiredSupport].map(c => getBaseCharacterId(c.id));
        if (new Set(baseIds).size !== 4) continue;

        const teamChars = [dps, amp1.char, amp2.char, requiredSupport];
        teams.push(createTeamFromEnriched(
          dps, teamChars,
          [amp1, amp2, supportEntry],
          'hypercarry',
          gameMode,
          undefined,
          undefined,
          getInvestment
        ));
      }
    }

    // Dual-carry: DPS + SubDPS + Amp + Sustain(required)
    for (let i = 0; i < Math.min(3, availableSubDPS.length); i++) {
      for (let j = 0; j < Math.min(3, availableAmplifiers.length); j++) {
        const subDps = availableSubDPS[i];
        const amp = availableAmplifiers[j];
        if (!subDps || !amp) continue;

        const baseIds = [dps, subDps.char, amp.char, requiredSupport].map(c => getBaseCharacterId(c.id));
        if (new Set(baseIds).size !== 4) continue;

        const teamChars = [dps, subDps.char, amp.char, requiredSupport];
        teams.push(createTeamFromEnriched(
          dps, teamChars,
          [subDps, amp, supportEntry],
          'dual-carry',
          gameMode,
          undefined,
          undefined,
          getInvestment
        ));
      }
    }
  }

  // Sort by score and return top teams
  teams.sort((a, b) => b.score - a.score);
  return teams.slice(0, 6); // Return up to 6 teams per DPS
}

/**
 * Create a GeneratedTeam from a bestTeams entry
 */
function createBestTeamEntry(
  dps: Character,
  teamChars: Character[],
  best: { name: string; characters: string[]; rating: 'S' | 'A' | 'B' | 'C'; structure: string },
  gameMode: GameMode
): GeneratedTeam {
  const contributions: TeamMemberContribution[] = teamChars.map((c) => {
    let sourceRating: TeammateRating | undefined;
    let rating: GranularRating | undefined;
    let reason = c.id === dps.id ? 'Main DPS' : c.roles.join(', ');
    let roleFit: 'Perfect' | 'Great' | 'Good' | 'Flex' = 'Flex';

    if (c.id !== dps.id && dps.teammates) {
      const rec = findTeammateRec(dps, c.id);
      if (rec) {
        sourceRating = rec.rating;
        const biScore = calculateBidirectionalScore(dps, c);
        rating = scoreToRating(biScore.score);
        reason = rec.reason;
        roleFit = sourceRating === 'S' ? 'Perfect' :
                 sourceRating === 'A' ? 'Great' :
                 sourceRating === 'B' ? 'Good' : 'Flex';
      }
    } else if (c.id === dps.id) {
      roleFit = 'Perfect';
    }

    return {
      characterId: c.id,
      characterName: c.name,
      role: c.id === dps.id ? 'Main DPS' : c.roles[0] || 'Support',
      rating,
      sourceRating,
      reason,
      roleFit,
      contribution: reason,
    };
  });

  const roles = teamChars.map(c => c.id === dps.id ? 'DPS' : c.roles[0] || 'Amplifier');

  const breakdown: SynergyBreakdown[] = contributions
    .filter(c => c.characterId !== dps.id)
    .map(c => ({
      source: c.characterName,
      target: dps.name,
      score: c.sourceRating ? TEAMMATE_RATING_SCORES[c.sourceRating] * 20 : 50,
      reason: c.reason,
      category: c.role === 'Sustain' ? 'sustain' as const :
                c.role === 'Amplifier' ? 'amplify' as const : 'core' as const,
    }));

  const insights: TeamInsight[] = [{
    title: best.structure,
    description: `${best.name} - ${best.structure} composition`,
    category: 'core',
    characters: teamChars.map(c => c.name),
  }];

  // Calculate score
  let score = 0;
  score += TIER_SCORES[getBestTierForMode(dps.id, gameMode)];
  for (const c of contributions.filter(c => c.characterId !== dps.id)) {
    const char = teamChars.find(tc => tc.id === c.characterId);
    if (char) {
      score += TIER_SCORES[getBestTierForMode(char.id, gameMode)];
      if (c.sourceRating) {
        score += TEAMMATE_RATING_SCORES[c.sourceRating] * 20;
      }
    }
  }
  // Bonus for being a curated bestTeam
  score += 50;

  return {
    characters: orderTeamByRole(teamChars),
    name: generateTeamName(teamChars, dps),
    rating: best.rating,
    structure: best.structure,
    score,
    reasoning: [
      `${best.structure} composition`,
      ...contributions.filter(c => c.reason && c.characterId !== dps.id).map(c => `${c.characterName}: ${c.reason}`),
    ],
    contributions,
    roles,
    breakdown,
    insights,
    teamSummary: `${best.structure} composition`,
    ratingDescription: `${best.rating}-tier ${best.structure} composition`,
    keySynergies: contributions
      .filter(c => c.sourceRating && ['S', 'A'].includes(c.sourceRating) && c.characterId !== dps.id)
      .map(c => `${c.characterName}: ${c.reason}`),
    modeRatings: calculateAllModeRatings(teamChars),
  };
}
