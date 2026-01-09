// ========================================
// STARGUIDE - Team Generator (Re-export)
// ========================================
// This file re-exports from the new teammate-based team generator
// Uses bidirectional scoring to consider both "who DPS wants" and "who wants DPS"

export {
  generateTeams,
  generateTeamsForDPS,
  generateTeamsForSupport,
  calculateTeamSynergy,
  calculateModeTeamRating,
  calculateAllModeRatings,
  calculateBidirectionalScore,
  scoreToRating,
  getTeamRankingScore,
  getRankingScoreRating,
  getBestTierForMode,
  getMaxTeamsForTier,
  getCanonicalPrimaryDPS,
  isDualCarryTeam,
  orderTeamByRole,
  type GeneratedTeam,
  type SupportTeamResult,
  type TeamMemberContribution,
  type SynergyBreakdown,
  type TeamInsight,
  type GameMode,
  type BidirectionalScore,
  type ModeTeamRating,
} from './newTeamGenerator';

// Bidirectional scoring for slot recommendations
import type { Character, TeammateRating } from '../types';
import { TEAMMATE_RATING_SCORES } from '../types';
import type { SynergyTag } from '../types/synergy';
import { getCharactersWhoWant } from './relationshipLookup';

// Minimal legacy interface for getSynergyData
export interface CharacterSynergyData {
  id: string;
  provides: SynergyTag[];
  wants: SynergyTag[];
  antiSynergies: SynergyTag[];
}

/**
 * Legacy getSynergyData function - returns empty data
 * The new system uses character.teammates directly instead
 * @deprecated Use character.teammates directly
 */
export function getSynergyData(character: Character | string): CharacterSynergyData | undefined {
  if (typeof character === 'string') {
    return undefined;
  }

  // Return minimal structure from deprecated fields if they exist
  return {
    id: character.id,
    provides: (character.provides || []) as SynergyTag[],
    wants: (character.wants || []) as SynergyTag[],
    antiSynergies: (character.antiSynergies || []) as SynergyTag[],
  };
}


// For TeamBuilder.vue compatibility
export interface TeamStructureOption {
  id: 'hypercarry' | 'dual-carry';
  name: string;
  description: string;
  slots: ('DPS' | 'Amplifier' | 'Sustain')[];
  rating: 'S' | 'A' | 'B' | 'C';
  explanation: string;
}

export interface SlotRecommendation {
  character: Character;
  rating: 'Perfect' | 'Great' | 'Good' | 'Flex';
  explanation: string;
  score: number;
  // Bidirectional scoring info
  confidence?: 'mutual' | 'dps-only' | 'teammate-only';
  dpsRating?: TeammateRating;
  teammateRating?: TeammateRating;
}

/**
 * Calculate bidirectional score for slot recommendations
 * Uses the same formula as newTeamGenerator
 */
function calculateBidirectionalSlotScore(
  focalCharacter: Character,
  candidate: Character
): {
  score: number;
  dpsRating?: TeammateRating;
  teammateRating?: TeammateRating;
  dpsReason?: string;
  teammateReason?: string;
  confidence: 'mutual' | 'dps-only' | 'teammate-only';
} {
  // Get focal character's rating of candidate
  let dpsRating: TeammateRating | undefined;
  let dpsReason: string | undefined;

  if (focalCharacter.teammates) {
    const allRecs = [
      ...(focalCharacter.teammates.amplifiers || []),
      ...(focalCharacter.teammates.sustains || []),
      ...(focalCharacter.teammates.subDPS || []),
      ...(focalCharacter.teammates.supportDPS || []),
      ...(focalCharacter.teammates.dps || []),
    ];
    const rec = allRecs.find(r => r.id === candidate.id);
    if (rec) {
      dpsRating = rec.rating;
      dpsReason = rec.reason;
    }
  }

  // Get candidate's rating of focal (from runtime lookup)
  let teammateRating: TeammateRating | undefined;
  let teammateReason: string | undefined;

  if (candidate.teammates) {
    const allRecs = [
      ...(candidate.teammates.amplifiers || []),
      ...(candidate.teammates.sustains || []),
      ...(candidate.teammates.subDPS || []),
      ...(candidate.teammates.supportDPS || []),
      ...(candidate.teammates.dps || []),
    ];
    const rec = allRecs.find(r => r.id === focalCharacter.id);
    if (rec) {
      teammateRating = rec.rating;
      teammateReason = rec.reason;
    }
  }

  // Calculate score using bidirectional formula
  let score: number;
  let confidence: 'mutual' | 'dps-only' | 'teammate-only';

  if (dpsRating && teammateRating) {
    // Both directions - weighted average
    const dpsScore = TEAMMATE_RATING_SCORES[dpsRating];
    const tmScore = TEAMMATE_RATING_SCORES[teammateRating];
    score = (dpsScore * 0.7) + (tmScore * 0.3);
    confidence = 'mutual';
  } else if (dpsRating) {
    // Only focal rates candidate
    score = TEAMMATE_RATING_SCORES[dpsRating] * 0.9;
    confidence = 'dps-only';
  } else if (teammateRating) {
    // Only candidate rates focal
    score = TEAMMATE_RATING_SCORES[teammateRating] * 0.6;
    confidence = 'teammate-only';
  } else {
    score = 0;
    confidence = 'teammate-only';
  }

  return { score, dpsRating, teammateRating, dpsReason, teammateReason, confidence };
}

/**
 * Get structure options for the team builder
 */
export function getStructureOptions(
  focalCharacter: Character,
  _gameMode: 'moc' | 'pf' | 'as' = 'moc'
): TeamStructureOption[] {
  const preferred = focalCharacter.teamStructures?.preferred || 'hypercarry';
  const isDualPreferred = preferred.includes('dual') || preferred.includes('triple');

  return [
    {
      id: 'hypercarry',
      name: 'Hypercarry',
      description: '1 DPS + 2 Amplifiers + 1 Sustain',
      slots: ['DPS', 'Amplifier', 'Amplifier', 'Sustain'],
      rating: isDualPreferred ? 'B' : 'S',
      explanation: isDualPreferred
        ? `${focalCharacter.name} can work in hypercarry but prefers dual carry`
        : `Best structure for ${focalCharacter.name} - maximizes amplification`,
    },
    {
      id: 'dual-carry',
      name: 'Dual Carry',
      description: '2 DPS + 1 Amplifier + 1 Sustain',
      slots: ['DPS', 'DPS', 'Amplifier', 'Sustain'],
      rating: isDualPreferred ? 'S' : 'B',
      explanation: isDualPreferred
        ? `Best structure for ${focalCharacter.name} - pairs with complementary DPS`
        : `${focalCharacter.name} can work with a second DPS but prefers hypercarry`,
    },
  ];
}

/**
 * Get slot recommendations for the team builder
 * Uses bidirectional scoring: considers both focal's rating of candidate AND candidate's rating of focal
 */
export function getSlotRecommendations(
  focalCharacter: Character,
  slotRole: 'DPS' | 'Amplifier' | 'Sustain',
  alreadySelected: Character[],
  availableCharacters: Character[],
  _gameMode: 'moc' | 'pf' | 'as' = 'moc'
): SlotRecommendation[] {
  const recommendations: SlotRecommendation[] = [];
  const alreadyIds = new Set(alreadySelected.map(c => c.id));
  const seenIds = new Set<string>();

  // Filter candidates by role and exclude already selected
  const candidates = availableCharacters.filter(c => {
    if (alreadyIds.has(c.id)) return false;
    if (c.id === focalCharacter.id) return false;
    if (slotRole === 'DPS') return c.roles.includes('DPS') || c.roles.includes('Support DPS');
    return c.roles.includes(slotRole);
  });

  // 1. First, add characters that focal explicitly recommends
  if (focalCharacter.teammates) {
    const explicitRecs = slotRole === 'Amplifier' ? focalCharacter.teammates.amplifiers :
                 slotRole === 'Sustain' ? focalCharacter.teammates.sustains :
                 [...(focalCharacter.teammates.subDPS || []), ...(focalCharacter.teammates.supportDPS || [])];

    for (const rec of explicitRecs || []) {
      const char = candidates.find(c => c.id === rec.id);
      if (!char) continue;

      seenIds.add(char.id);

      // Calculate bidirectional score
      const biScore = calculateBidirectionalSlotScore(focalCharacter, char);

      // Determine rating from effective score
      const effectiveRating: 'Perfect' | 'Great' | 'Good' | 'Flex' =
        biScore.score >= 4.5 ? 'Perfect' :
        biScore.score >= 3.5 ? 'Great' :
        biScore.score >= 2.5 ? 'Good' : 'Flex';

      // Build explanation with confidence indicator
      let explanation = rec.reason;
      if (biScore.confidence === 'mutual') {
        explanation = `${rec.reason} (mutual synergy)`;
      }

      recommendations.push({
        character: char,
        rating: effectiveRating,
        explanation,
        score: biScore.score * 20, // Convert to 0-100 scale
        confidence: biScore.confidence,
        dpsRating: biScore.dpsRating,
        teammateRating: biScore.teammateRating,
      });
    }
  }

  // 2. Add characters who want the focal character (but focal didn't list them)
  const wantedBy = getCharactersWhoWant(focalCharacter.id);

  for (const entry of wantedBy) {
    if (seenIds.has(entry.character.id)) continue;

    const char = candidates.find(c => c.id === entry.character.id);
    if (!char) continue;

    seenIds.add(char.id);

    // Calculate bidirectional score
    const biScore = calculateBidirectionalSlotScore(focalCharacter, char);

    // Determine rating from effective score (will be lower since one-way)
    const effectiveRating: 'Perfect' | 'Great' | 'Good' | 'Flex' =
      biScore.score >= 4.5 ? 'Perfect' :
      biScore.score >= 3.5 ? 'Great' :
      biScore.score >= 2.5 ? 'Good' : 'Flex';

    // Build explanation from teammate's perspective
    const explanation = `${char.name} synergy: ${entry.reason} (one-way)`;

    recommendations.push({
      character: char,
      rating: effectiveRating,
      explanation,
      score: biScore.score * 20,
      confidence: biScore.confidence,
      dpsRating: biScore.dpsRating,
      teammateRating: biScore.teammateRating,
    });
  }

  // 3. Add remaining candidates as Flex options
  for (const char of candidates) {
    if (seenIds.has(char.id)) continue;

    recommendations.push({
      character: char,
      rating: 'Flex',
      explanation: `${char.name} can fill this ${slotRole} slot`,
      score: 30,
      confidence: 'teammate-only',
    });
  }

  return recommendations.sort((a, b) => b.score - a.score);
}

/**
 * Get DPS recommendations for when building around a support
 * Uses bidirectional scoring to show DPS characters that synergize with this support
 */
export function getDPSRecommendationsForSupport(
  supportCharacter: Character,
  availableCharacters: Character[],
  alreadySelected: Character[] = [],
  _gameMode: 'moc' | 'pf' | 'as' = 'moc'
): SlotRecommendation[] {
  const recommendations: SlotRecommendation[] = [];
  const seenIds = new Set<string>();
  const alreadyIds = new Set(alreadySelected.map(c => c.id));

  // Get DPS characters, excluding already selected ones
  const dpsCharacters = availableCharacters.filter(c =>
    (c.roles.includes('DPS') || c.roles.includes('Support DPS')) &&
    c.id !== supportCharacter.id &&
    !alreadyIds.has(c.id)
  );

  // 1. Check which DPS characters list this support in their teammates
  for (const dps of dpsCharacters) {
    if (!dps.teammates) continue;

    const allRecs = [
      ...(dps.teammates.amplifiers || []),
      ...(dps.teammates.sustains || []),
    ];

    const rec = allRecs.find(r => r.id === supportCharacter.id);
    if (rec) {
      seenIds.add(dps.id);

      // Calculate bidirectional score (support → DPS perspective)
      const biScore = calculateBidirectionalSlotScore(supportCharacter, dps);

      // Effective rating from bidirectional score
      const effectiveRating: 'Perfect' | 'Great' | 'Good' | 'Flex' =
        biScore.score >= 4.5 ? 'Perfect' :
        biScore.score >= 3.5 ? 'Great' :
        biScore.score >= 2.5 ? 'Good' : 'Flex';

      // Build explanation
      let explanation = `${dps.name} wants ${supportCharacter.name}: ${rec.reason}`;
      if (biScore.confidence === 'mutual') {
        explanation += ' (mutual synergy)';
      }

      recommendations.push({
        character: dps,
        rating: effectiveRating,
        explanation,
        score: biScore.score * 20,
        confidence: biScore.confidence,
        dpsRating: biScore.teammateRating, // The DPS's rating of support
        teammateRating: biScore.dpsRating, // The support's rating of DPS
      });
    }
  }

  // 2. Check if support lists any DPS characters as teammates (one-way from support side)
  if (supportCharacter.teammates?.dps) {
    for (const rec of supportCharacter.teammates.dps) {
      if (seenIds.has(rec.id)) continue;

      const dps = dpsCharacters.find(c => c.id === rec.id);
      if (!dps) continue;

      seenIds.add(dps.id);

      // Calculate bidirectional score
      const biScore = calculateBidirectionalSlotScore(supportCharacter, dps);

      const effectiveRating: 'Perfect' | 'Great' | 'Good' | 'Flex' =
        biScore.score >= 4.5 ? 'Perfect' :
        biScore.score >= 3.5 ? 'Great' :
        biScore.score >= 2.5 ? 'Good' : 'Flex';

      const explanation = `${supportCharacter.name} synergy: ${rec.reason} (one-way)`;

      recommendations.push({
        character: dps,
        rating: effectiveRating,
        explanation,
        score: biScore.score * 20,
        confidence: biScore.confidence,
        dpsRating: biScore.dpsRating,
        teammateRating: biScore.teammateRating,
      });
    }
  }

  // Sort by score
  return recommendations.sort((a, b) => b.score - a.score);
}

// Re-export TeamMemberContribution as CharacterContribution for backwards compatibility
export type { TeamMemberContribution as CharacterContribution } from './newTeamGenerator';
