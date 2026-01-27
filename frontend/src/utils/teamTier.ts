import type { TeamTier, TierRating } from '../types';
import { TIER_SCORES } from '../types';
import { getTierData } from '../data/tierData';

/**
 * Calculate team tier based on average of main lineup (4 primary characters) tiers
 *
 * | Average Score Range | Team Tier |
 * |---------------------|-----------|
 * | 110+                | T-1       |
 * | 103-109             | T-0.5     |
 * | 90-102              | T0        |
 * | 80-89               | T0.5      |
 * | 70-79               | T1        |
 * | 60-69               | T1.5      |
 * | 50-59               | T2        |
 * | 40-49               | T3        |
 * | 30-39               | T4        |
 * | 0-29                | T5        |
 */
export function calculateTeamTier(
  characterIds: string[],
  gameMode: 'moc' | 'pf' | 'as' = 'moc'
): TeamTier {
  const scores = characterIds.map(id => {
    const tierData = getTierData(id);
    if (!tierData) return TIER_SCORES['T2'];

    const modeData = tierData[gameMode];
    if (!modeData) return TIER_SCORES['T2'];

    // Get the best tier across all roles
    const tiers = Object.values(modeData) as TierRating[];
    if (tiers.length === 0) return TIER_SCORES['T2'];

    const tierOrder: TierRating[] = ['T-1', 'T-0.5', 'T0', 'T0.5', 'T1', 'T1.5', 'T2', 'T3', 'T4', 'T5'];
    const bestTier = tiers.reduce((best, current) =>
      tierOrder.indexOf(current) < tierOrder.indexOf(best) ? current : best
    );
    return TIER_SCORES[bestTier];
  });

  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

  if (avg >= 110) return 'T-1';
  if (avg >= 103) return 'T-0.5';
  if (avg >= 90) return 'T0';
  if (avg >= 80) return 'T0.5';
  if (avg >= 70) return 'T1';
  if (avg >= 60) return 'T1.5';
  if (avg >= 50) return 'T2';
  if (avg >= 40) return 'T3';
  if (avg >= 30) return 'T4';
  return 'T5';
}

/**
 * Get tier color for styling
 */
export function getTierColor(tier: TeamTier | TierRating): string {
  switch (tier) {
    case 'T-1': return '#ff4500';    // Bright red-orange for peak performance
    case 'T-0.5': return '#ff7700';  // Orange-red for excellent
    case 'T0': return '#ff9500';
    case 'T0.5': return '#ffd000';
    case 'T1': return '#a855f7';
    case 'T1.5': return '#ec4899';
    case 'T2': return '#3b82f6';
    case 'T3': return '#22c55e';
    case 'T4': return '#64748b';
    case 'T5': return '#6b7280';
    default: return '#6b7280';
  }
}

/**
 * Get tier CSS class name
 */
export function getTierClass(tier: TeamTier | TierRating): string {
  return `tier-${tier.toLowerCase().replace('.', '-')}`;
}
