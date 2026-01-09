<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { Character, TeammateRating, GranularRating, TierRating, UserCharacterInvestment } from '../types';
import CharacterCard from './CharacterCard.vue';
import { getTierData } from '../data/tierData';
import { getTeammatesForComposition, getEffectiveRating, type InvestmentLevel } from '../utils/characterUtils';
import { getInvestmentNotes, getInvestmentAccessibility } from '../utils/investmentUtils';

// ==================
// PROPS
// ==================

interface Props {
  characters: Character[];
  ownedCharacters: Character[];
  getOwnership: (id: string) => 'owned' | 'concept' | 'none';
  getInvestment: (id: string) => UserCharacterInvestment | undefined;
  gameMode: 'moc' | 'pf' | 'as';
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'select-character': [characterId: string];
}>();

// ==================
// STATE
// ==================

interface PullRecommendation {
  character: Character;
  rating: GranularRating;
  score: number;
  role: 'amplifier' | 'sustain' | 'subDPS' | 'dps';
  wantedBy: { name: string; rating: TeammateRating; tier: TierRating; reason: string; coveragePenalty: number; eidolonRequirement?: number; currentEidolon?: number }[];
  investmentNotes: string[];  // Investment info for the recommended character
  accessibility: number;      // 0-1 scale of how accessible at E0+F2P
}

// Sub-tab state for Pull Advisor
const pullSubTab = ref<'for-dps' | 'for-supports'>('for-dps');

// Ignored characters state
const IGNORED_STORAGE_KEY = 'starguide_pull_advisor_ignored';
const ignoredCharacters = ref<Set<string>>(new Set());
const showIgnoredPanel = ref(false);

// Load ignored characters from localStorage
function loadIgnoredCharacters() {
  try {
    const stored = localStorage.getItem(IGNORED_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        ignoredCharacters.value = new Set(parsed);
      }
    }
  } catch (e) {
    console.error('Failed to load ignored characters:', e);
  }
}

// Save ignored characters to localStorage
function saveIgnoredCharacters() {
  try {
    localStorage.setItem(IGNORED_STORAGE_KEY, JSON.stringify([...ignoredCharacters.value]));
  } catch (e) {
    console.error('Failed to save ignored characters:', e);
  }
}

// Ignore a character
function ignoreCharacter(id: string, event: Event) {
  event.stopPropagation();
  ignoredCharacters.value.add(id);
  ignoredCharacters.value = new Set(ignoredCharacters.value); // trigger reactivity
  saveIgnoredCharacters();
}

// Restore a character from ignore list
function restoreCharacter(id: string) {
  ignoredCharacters.value.delete(id);
  ignoredCharacters.value = new Set(ignoredCharacters.value); // trigger reactivity
  saveIgnoredCharacters();
}

// Get character name by ID
function getCharacterName(id: string): string {
  const char = props.characters.find(c => c.id === id);
  return char?.name || id;
}

// Active tooltip (tracks which wanted-by item is showing tooltip)
const activeTooltip = ref<{ key: string; reason: string; x: number; y: number; position: 'above' | 'below' } | null>(null);
const tooltipLockedByClick = ref(false); // Track if tooltip was opened by click (for mobile)

// Detect if device supports hover (desktop vs mobile)
const isTouchDevice = ref(false);

function calculateTooltipPosition(target: HTMLElement): { x: number; y: number; position: 'above' | 'below' } {
  const rect = target.getBoundingClientRect();
  const tooltipHeight = 80;
  const tooltipWidth = 300;

  let x = rect.left + rect.width / 2;
  const minX = tooltipWidth / 2 + 8;
  const maxX = window.innerWidth - tooltipWidth / 2 - 8;
  x = Math.max(minX, Math.min(maxX, x));

  const spaceAbove = rect.top;
  const spaceBelow = window.innerHeight - rect.bottom;
  const position = spaceAbove < tooltipHeight + 20 && spaceBelow > spaceAbove ? 'below' : 'above';
  const y = position === 'above' ? rect.top : rect.bottom;

  return { x, y, position };
}

// Show tooltip on hover (desktop only)
function showTooltip(key: string, reason: string, event: Event) {
  if (isTouchDevice.value || tooltipLockedByClick.value) return;

  const target = event.currentTarget as HTMLElement;
  const { x, y, position } = calculateTooltipPosition(target);
  activeTooltip.value = { key, reason, x, y, position };
}

// Hide tooltip on mouse leave (desktop only, if not locked by click)
function hideTooltipOnLeave() {
  if (tooltipLockedByClick.value) return;
  activeTooltip.value = null;
}

// Toggle tooltip on click/tap (works on both, but primarily for mobile)
function toggleTooltip(key: string, reason: string, event: Event) {
  event.stopPropagation();

  if (activeTooltip.value?.key === key) {
    activeTooltip.value = null;
    tooltipLockedByClick.value = false;
  } else {
    const target = event.currentTarget as HTMLElement;
    const { x, y, position } = calculateTooltipPosition(target);
    activeTooltip.value = { key, reason, x, y, position };
    tooltipLockedByClick.value = isTouchDevice.value; // Lock on touch devices
  }
}

function closeTooltip() {
  activeTooltip.value = null;
  tooltipLockedByClick.value = false;
}

// Close tooltip on scroll and load ignored characters
onMounted(() => {
  window.addEventListener('scroll', closeTooltip, true);
  loadIgnoredCharacters();
  isTouchDevice.value = window.matchMedia('(hover: none)').matches;
});

onUnmounted(() => {
  window.removeEventListener('scroll', closeTooltip, true);
});

// ==================
// HELPERS
// ==================

// Calculate most significant eidolon requirement from investment modifiers
// Returns the eidolon level with the highest absolute modifier value
function getEidolonRequirement(theirInvestmentModifiers?: { level: 1 | 2 | 3 | 4 | 5 | 6; modifier: number; reason?: string }[]): number | undefined {
  if (!theirInvestmentModifiers || theirInvestmentModifiers.length === 0) return undefined;

  // Find the modifier with the highest absolute value (most significant impact)
  const mostSignificant = theirInvestmentModifiers
    .filter(mod => mod.modifier !== 0) // Exclude zero-impact modifiers
    .sort((a, b) => Math.abs(b.modifier) - Math.abs(a.modifier))[0];

  return mostSignificant?.level;
}

// Get best tier for a character
function getBestTier(characterId: string, gameMode: 'moc' | 'pf' | 'as'): TierRating {
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

// Tier weights - comparable scale to synergy ratings
const TIER_WEIGHTS: Record<TierRating, number> = {
  'T-1': 3.5, 'T-0.5': 3.25, 'T0': 3.0, 'T0.5': 2.5, 'T1': 2.0, 'T1.5': 1.5,
  'T2': 1.2, 'T3': 0.9, 'T4': 0.6, 'T5': 0.3,
};

// Synergy rating weights
const SYNERGY_WEIGHTS: Record<TeammateRating, number> = { 'S+': 3.5, S: 3.0, A: 2.0, B: 1.2, C: 0.6, D: 0.2 };

// Recommended character's own tier multiplier (higher tier = more valuable)
const RECOMMENDED_TIER_MULTIPLIERS: Record<TierRating, number> = {
  'T-1': 1.35, 'T-0.5': 1.3, 'T0': 1.25, 'T0.5': 1.15, 'T1': 1.05, 'T1.5': 1.0,
  'T2': 0.95, 'T3': 0.85, 'T4': 0.7, 'T5': 0.55,
};

// Coverage rating scores (for calculating how "covered" a slot is)
const COVERAGE_SCORES: Record<TeammateRating, number> = { 'S+': 3.5, S: 3, A: 2, B: 1, C: 0.5, D: 0.25 };

// Coverage penalty factor (higher = stronger penalty for already-covered slots)
const COVERAGE_PENALTY_FACTOR = 0.15;

// Calculate how much coverage a character already has in a specific teammate category
// Returns sum of rating scores for owned characters in that category
function calcCoverage(
  wantingChar: Character,
  category: 'dps' | 'subDPS' | 'amplifiers' | 'sustains',
  ownedIds: Set<string>,
  excludeId?: string // Exclude the recommended character from coverage calc
): number {
  // Use composition-aware teammate lookup (falls back to baseTeammates or legacy teammates)
  const allTeammates = getTeammatesForComposition(wantingChar);
  const teammates = allTeammates[category];
  if (!teammates) return 0;

  return teammates
    .filter(t => ownedIds.has(t.id) && t.id !== excludeId)
    .reduce((sum, t) => sum + (COVERAGE_SCORES[t.rating] || 0), 0);
}

// Calculate coverage penalty multiplier (1 = no penalty, lower = more penalty)
function getCoveragePenalty(coverage: number): number {
  return 1 / (1 + coverage * COVERAGE_PENALTY_FACTOR);
}

// Calculate pull rating with coverage penalties, recommended char tier, and eidolon multipliers
function calculatePullRating(
  wantedBy: { name: string; rating: TeammateRating; tier: TierRating; coveragePenalty: number; eidolonRequirement?: number; currentEidolon?: number }[],
  recommendedCharTier: TierRating
): { rating: GranularRating; score: number } {
  if (wantedBy.length === 0) return { rating: 'D', score: 0 };

  let weightedSum = 0;
  for (const w of wantedBy) {
    const tierWeight = TIER_WEIGHTS[w.tier] || 1.0;
    const synergyWeight = SYNERGY_WEIGHTS[w.rating] || 1.0;

    // Calculate eidolon multiplier based on pulls needed
    // Unowned (currentEidolon = 0): base character + all eidolons = (1 + eidolonRequirement)
    // Owned: only remaining eidolons = (eidolonRequirement - currentEidolon)
    // Example: Need E6 but have E2 → 6 - 2 = 4 pulls needed (E3,E4,E5,E6)
    let eidolonMultiplier = 1;
    if (w.eidolonRequirement) {
      const currentEidolon = w.currentEidolon ?? 0;
      if (currentEidolon === 0) {
        // Unowned: base character + all eidolons to requirement
        eidolonMultiplier = 1 + w.eidolonRequirement;
      } else {
        // Owned: only the remaining eidolons
        eidolonMultiplier = w.eidolonRequirement - currentEidolon;
      }
    }

    // Apply coverage penalty per wanting character
    weightedSum += tierWeight * synergyWeight * w.coveragePenalty * eidolonMultiplier;
  }

  const ratingOrder: TeammateRating[] = ['S+', 'S', 'A', 'B', 'C', 'D'];
  const bestRating = wantedBy.reduce((best, w) => {
    return ratingOrder.indexOf(w.rating) < ratingOrder.indexOf(best) ? w.rating : best;
  }, 'D' as TeammateRating);

  const qualityMultipliers: Record<TeammateRating, number> = { 'S+': 1.1, S: 1.0, A: 0.85, B: 0.65, C: 0.4, D: 0.2 };

  // Apply recommended character's own tier multiplier
  const tierMultiplier = RECOMMENDED_TIER_MULTIPLIERS[recommendedCharTier] || 1.0;
  const finalScore = weightedSum * qualityMultipliers[bestRating] * tierMultiplier;

  let rating: GranularRating;
  if (finalScore >= 16) rating = 'S';
  else if (finalScore >= 12) rating = 'S-';
  else if (finalScore >= 9) rating = 'A+';
  else if (finalScore >= 7) rating = 'A';
  else if (finalScore >= 5) rating = 'A-';
  else if (finalScore >= 3.5) rating = 'B+';
  else if (finalScore >= 2.5) rating = 'B';
  else if (finalScore >= 1.5) rating = 'B-';
  else if (finalScore >= 1.0) rating = 'C+';
  else if (finalScore >= 0.5) rating = 'C';
  else if (finalScore >= 0.25) rating = 'C-';
  else rating = 'D';

  return { rating, score: finalScore };
}

// Granular rating sort order
const RATING_ORDER: Record<GranularRating, number> = {
  'S+': 0, 'S': 1, 'S-': 2,
  'A+': 3, 'A': 4, 'A-': 5,
  'B+': 6, 'B': 7, 'B-': 8,
  'C+': 9, 'C': 10, 'C-': 11,
  'D': 12,
};

// Role label helper
const getRoleLabel = (role: 'amplifier' | 'sustain' | 'subDPS' | 'dps'): string => {
  switch (role) {
    case 'amplifier': return 'Amplifier';
    case 'sustain': return 'Sustain';
    case 'subDPS': return 'Sub-DPS';
    case 'dps': return 'DPS';
  }
};

// Rating badge colors
const ratingColors: Record<string, { bg: string; border: string }> = {
  'S': { bg: 'linear-gradient(135deg, #ff9500 0%, #ff6b00 100%)', border: '#ff9500' },
  'A': { bg: 'linear-gradient(135deg, #a855f7 0%, #8b5cf6 100%)', border: '#a855f7' },
  'B': { bg: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', border: '#3b82f6' },
  'C': { bg: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', border: '#22c55e' },
  'D': { bg: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)', border: '#6b7280' },
};

const defaultRatingStyle = { bg: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', border: '#22c55e' };
const getRatingStyle = (rating: string | undefined): { bg: string; border: string } => {
  const baseKey = (rating ?? 'C').charAt(0).toUpperCase();
  const style = ratingColors[baseKey];
  return style !== undefined ? style : defaultRatingStyle;
};

const getBaseRating = (rating: string): string => {
  return rating.charAt(0).toLowerCase();
};

// Build investment map for a single DPS character (for synergy modifier calculations)
function buildInvestmentMapForDPS(dpsId: string): Map<string, InvestmentLevel> {
  const map = new Map<string, InvestmentLevel>();
  const inv = props.getInvestment(dpsId);
  if (inv) {
    map.set(dpsId, {
      eidolonLevel: inv.eidolonLevel,
      lightConeId: inv.lightConeId,
      lightConeSuperimposition: inv.lightConeSuperimposition,
    });
  }
  return map;
}

// Get effective rating for a teammate considering DPS investment synergies
function getEffectiveTeammateRating(dps: Character, teammateId: string, baseRating: TeammateRating): TeammateRating {
  const investments = buildInvestmentMapForDPS(dps.id);
  if (investments.size === 0) return baseRating;
  return getEffectiveRating(dps, teammateId, { investments });
}

// ==================
// COMPUTED
// ==================

// TAB 1: "For Your DPS" - Supports/Sub-DPS that your owned DPS characters want
const supportsForDPS = computed((): PullRecommendation[] => {
  if (props.ownedCharacters.length < 4) return [];

  type RoleType = 'amplifier' | 'sustain' | 'subDPS' | 'dps';
  type CategoryKey = 'amplifiers' | 'sustains' | 'subDPS';

  interface WantedByEntry {
    name: string;
    rating: TeammateRating;
    tier: TierRating;
    reason: string;
    coveragePenalty: number;
    eidolonRequirement?: number; // Most significant eidolon level required (1-6)
    currentEidolon?: number; // Current eidolon level for owned characters
  }

  interface Accumulator {
    character: Character;
    roleCounts: Record<RoleType, number>;
    wantedBy: WantedByEntry[];
  }

  const recommendations = new Map<string, Accumulator>();
  const ownedIds = new Set(props.ownedCharacters.map(c => c.id));

  const ownedDPS = props.ownedCharacters.filter(c =>
    c.roles.includes('DPS') || c.roles.includes('Support DPS')
  );

  // Map role to category key for coverage calculation
  const roleToCategoryKey: Record<'amplifier' | 'sustain' | 'subDPS', CategoryKey> = {
    amplifier: 'amplifiers',
    sustain: 'sustains',
    subDPS: 'subDPS',
  };

  for (const dps of ownedDPS) {
    // Use composition-aware teammate lookup (falls back to baseTeammates or legacy teammates)
    const dpsTeammates = getTeammatesForComposition(dps);
    if (!dpsTeammates.amplifiers && !dpsTeammates.sustains && !dpsTeammates.subDPS) continue;
    const dpsTier = getBestTier(dps.id, props.gameMode);

    const categories: { items: typeof dpsTeammates.amplifiers; role: 'amplifier' | 'sustain' | 'subDPS' }[] = [
      { items: dpsTeammates.amplifiers, role: 'amplifier' },
      { items: dpsTeammates.sustains, role: 'sustain' },
      { items: dpsTeammates.subDPS, role: 'subDPS' },
    ];

    for (const { items, role } of categories) {
      if (!items) continue;

      // Calculate coverage for this DPS in this category
      const categoryKey = roleToCategoryKey[role];

      for (const teammate of items) {
        // Get effective rating considering DPS investment synergies (may be boosted to S+)
        const effectiveRating = getEffectiveTeammateRating(dps, teammate.id, teammate.rating);

        // Filter by effective rating (include S+, S, A, B)
        if (!['S+', 'S', 'A', 'B'].includes(effectiveRating)) continue;

        const char = props.characters.find(c => c.id === teammate.id);
        if (!char) continue;

        // Get current eidolon level if owned
        const isOwned = ownedIds.has(teammate.id);
        const currentEidolon = isOwned ? (props.getInvestment(teammate.id)?.eidolonLevel ?? 0) : 0;

        // Get eidolon requirement
        const eidolonRequirement = getEidolonRequirement(teammate.theirInvestmentModifiers);

        // Filter logic:
        // - If unowned: include if S+/S/A/B rated
        // - If owned: include ONLY if eidolon requirement exists AND current < requirement
        if (isOwned) {
          if (!eidolonRequirement || currentEidolon >= eidolonRequirement) {
            continue; // Already have the required eidolon, skip
          }
        }

        // Calculate coverage penalty for this specific (DPS, category) combination
        const coverage = calcCoverage(dps, categoryKey, ownedIds, teammate.id);
        const coveragePenalty = getCoveragePenalty(coverage);

        const existing = recommendations.get(teammate.id);
        if (existing) {
          if (!existing.wantedBy.some(w => w.name === dps.name)) {
            existing.wantedBy.push({
              name: dps.name,
              rating: effectiveRating, // Use effective rating
              tier: dpsTier,
              reason: teammate.reason,
              coveragePenalty,
              eidolonRequirement,
              currentEidolon,
            });
            existing.roleCounts[role]++;
          }
        } else {
          const roleCounts: Record<RoleType, number> = { amplifier: 0, sustain: 0, subDPS: 0, dps: 0 };
          roleCounts[role] = 1;
          recommendations.set(teammate.id, {
            character: char,
            roleCounts,
            wantedBy: [{
              name: dps.name,
              rating: effectiveRating, // Use effective rating
              tier: dpsTier,
              reason: teammate.reason,
              coveragePenalty,
              eidolonRequirement,
              currentEidolon,
            }],
          });
        }
      }
    }
  }

  return Array.from(recommendations.values())
    .map(acc => {
      // Get recommended character's own tier for the multiplier
      const recommendedCharTier = getBestTier(acc.character.id, props.gameMode);
      const { rating, score } = calculatePullRating(acc.wantedBy, recommendedCharTier);
      const roleEntries = Object.entries(acc.roleCounts) as [RoleType, number][];
      const mostCommonRole = roleEntries.reduce((a, b) => a[1] >= b[1] ? a : b)[0];

      // Get investment info for the recommended character
      const investmentNotes = getInvestmentNotes(acc.character);
      const accessibility = getInvestmentAccessibility(acc.character);

      return {
        character: acc.character,
        rating,
        score,
        role: mostCommonRole,
        wantedBy: acc.wantedBy.sort((a, b) => {
          const ratingOrder: TeammateRating[] = ['S+', 'S', 'A', 'B', 'C', 'D'];
          return ratingOrder.indexOf(a.rating) - ratingOrder.indexOf(b.rating);
        }),
        investmentNotes,
        accessibility,
      };
    })
    .filter(rec => RATING_ORDER[rec.rating] <= RATING_ORDER['B-'])
    .filter(rec => !ignoredCharacters.value.has(rec.character.id))
    .sort((a, b) => b.score - a.score);
});

// TAB 2: "For Your Supports" - DPS that your owned supports want
const dpsForSupports = computed((): PullRecommendation[] => {
  if (props.ownedCharacters.length < 4) return [];

  interface WantedByEntry {
    name: string;
    rating: TeammateRating;
    tier: TierRating;
    reason: string;
    coveragePenalty: number;
    eidolonRequirement?: number; // Most significant eidolon level required (1-6)
    currentEidolon?: number; // Current eidolon level for owned characters
  }

  interface Accumulator {
    character: Character;
    wantedBy: WantedByEntry[];
  }

  const recommendations = new Map<string, Accumulator>();
  const ownedIds = new Set(props.ownedCharacters.map(c => c.id));

  // Use composition-aware teammate lookup for filtering supports
  const ownedSupports = props.ownedCharacters.filter(c => {
    const supportTeammates = getTeammatesForComposition(c);
    return c.roles.includes('Amplifier') || c.roles.includes('Sustain') ||
      (supportTeammates.dps && supportTeammates.dps.length > 0);
  });

  for (const support of ownedSupports) {
    // Use composition-aware teammate lookup
    const supportTeammates = getTeammatesForComposition(support);
    if (!supportTeammates.dps) continue;
    const supportTier = getBestTier(support.id, props.gameMode);

    // Calculate coverage for this support's DPS category
    // (what other DPS does this support want that user already owns?)
    for (const teammate of supportTeammates.dps) {
      // Get effective rating considering support's investment synergies (may be boosted to S+)
      const effectiveRating = getEffectiveTeammateRating(support, teammate.id, teammate.rating);

      // Filter by effective rating (include S+, S, A, B)
      if (!['S+', 'S', 'A', 'B'].includes(effectiveRating)) continue;

      const char = props.characters.find(c => c.id === teammate.id);
      if (!char) continue;

      // Get current eidolon level if owned
      const isOwned = ownedIds.has(teammate.id);
      const currentEidolon = isOwned ? (props.getInvestment(teammate.id)?.eidolonLevel ?? 0) : 0;

      // Get eidolon requirement
      const eidolonRequirement = getEidolonRequirement(teammate.theirInvestmentModifiers);

      // Filter logic:
      // - If unowned: include if S+/S/A/B rated
      // - If owned: include ONLY if eidolon requirement exists AND current < requirement
      if (isOwned) {
        if (!eidolonRequirement || currentEidolon >= eidolonRequirement) {
          continue; // Already have the required eidolon, skip
        }
      }

      // Calculate coverage penalty: how many other DPS does this support want that user owns?
      const coverage = calcCoverage(support, 'dps', ownedIds, teammate.id);
      const coveragePenalty = getCoveragePenalty(coverage);

      const existing = recommendations.get(teammate.id);
      if (existing) {
        if (!existing.wantedBy.some(w => w.name === support.name)) {
          existing.wantedBy.push({
            name: support.name,
            rating: effectiveRating, // Use effective rating
            tier: supportTier,
            reason: teammate.reason,
            coveragePenalty,
            eidolonRequirement,
            currentEidolon,
          });
        }
      } else {
        recommendations.set(teammate.id, {
          character: char,
          wantedBy: [{
            name: support.name,
            rating: effectiveRating, // Use effective rating
            tier: supportTier,
            reason: teammate.reason,
            coveragePenalty,
            eidolonRequirement,
            currentEidolon,
          }],
        });
      }
    }
  }

  return Array.from(recommendations.values())
    .map(acc => {
      // Get recommended character's own tier for the multiplier
      const recommendedCharTier = getBestTier(acc.character.id, props.gameMode);
      const { rating, score } = calculatePullRating(acc.wantedBy, recommendedCharTier);

      // Get investment info for the recommended character
      const investmentNotes = getInvestmentNotes(acc.character);
      const accessibility = getInvestmentAccessibility(acc.character);

      return {
        character: acc.character,
        rating,
        score,
        role: 'dps' as const,
        wantedBy: acc.wantedBy.sort((a, b) => {
          const ratingOrder: TeammateRating[] = ['S+', 'S', 'A', 'B', 'C', 'D'];
          return ratingOrder.indexOf(a.rating) - ratingOrder.indexOf(b.rating);
        }),
        investmentNotes,
        accessibility,
      };
    })
    .filter(rec => RATING_ORDER[rec.rating] <= RATING_ORDER['B-'])
    .filter(rec => !ignoredCharacters.value.has(rec.character.id))
    .sort((a, b) => b.score - a.score);
});

// Ignored characters that would have been shown (for restore panel)
const ignoredInCurrentTab = computed(() => {
  return [...ignoredCharacters.value].filter(id => {
    const char = props.characters.find(c => c.id === id);
    return char !== undefined;
  });
});
</script>

<template>
  <div class="pull-advisor-view" @click="closeTooltip">
    <!-- Header -->
    <header class="view-header" data-onboarding="pull-advisor-header">
      <div class="header-content">
        <div class="radar-icon">
          <div class="radar-ring"></div>
          <div class="radar-sweep"></div>
          <span class="radar-dot">◎</span>
        </div>
        <div class="header-text">
          <h1 class="header-title">Pull Advisor</h1>
          <p class="header-subtitle">Characters that synergize with your {{ ownedCharacters.length }} roster</p>
        </div>
      </div>
    </header>

    <!-- Not Enough Characters State -->
    <div v-if="ownedCharacters.length < 4" class="empty-state">
      <div class="empty-orb">
        <div class="orb-ring orb-ring-1"></div>
        <div class="orb-ring orb-ring-2"></div>
        <div class="orb-ring orb-ring-3"></div>
        <span class="orb-icon">✦</span>
      </div>
      <h2 class="empty-title">Insufficient Data</h2>
      <p class="empty-desc">
        You need at least 4 owned characters to generate pull recommendations.<br />
        Right-click characters in the sidebar to mark them as owned.
      </p>
    </div>

    <!-- Main Content -->
    <div v-else class="pull-content">
      <!-- Sub-tabs -->
      <div class="pull-subtabs" data-onboarding="pull-advisor-subtabs">
        <button
          @click="pullSubTab = 'for-dps'"
          class="pull-subtab"
          :class="{ active: pullSubTab === 'for-dps' }"
        >
          <span class="subtab-icon">⚔️</span>
          <span class="subtab-label">For Your DPS</span>
          <span class="subtab-count">{{ supportsForDPS.length }}</span>
        </button>
        <button
          @click="pullSubTab = 'for-supports'"
          class="pull-subtab"
          :class="{ active: pullSubTab === 'for-supports' }"
        >
          <span class="subtab-icon">✨</span>
          <span class="subtab-label">For Your Supports</span>
          <span class="subtab-count">{{ dpsForSupports.length }}</span>
        </button>
      </div>

      <!-- For Your DPS Tab -->
      <div v-if="pullSubTab === 'for-dps'">
        <p class="pull-tab-desc">Supports and Sub-DPS that your owned DPS characters want. <span class="hint-text">Hover or tap names for details.</span></p>

        <div v-if="supportsForDPS.length === 0" class="pull-empty">
          <span class="empty-icon">✓</span>
          <p>Your DPS roster is well-supported! You own all recommended teammates.</p>
        </div>

        <div v-else class="pull-grid">
          <div
            v-for="(rec, index) in supportsForDPS"
            :key="rec.character.id"
            class="pull-card clickable"
            :class="{ 's-tier': getBaseRating(rec.rating) === 's', 'a-tier': getBaseRating(rec.rating) === 'a' }"
            :style="{ '--index': index }"
            @click="emit('select-character', rec.character.id)"
          >
            <button
              class="ignore-btn"
              title="Hide from recommendations"
              @click="ignoreCharacter(rec.character.id, $event)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="ignore-icon">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
            <div class="rating-accent" :style="{ background: getRatingStyle(rec.rating).bg }"></div>
            <div class="pull-card-content">
              <div class="pull-rank-rating">
                <div class="pull-rank" :class="{ top: index < 3 }">#{{ index + 1 }}</div>
                <div class="pull-rating-badge" :style="{ background: getRatingStyle(rec.rating).bg }">{{ rec.rating }}</div>
              </div>
              <div class="pull-mobile-row">
                <div class="pull-character-mobile">
                  <CharacterCard :character="rec.character" size="sm" :show-tier="true" />
                </div>
                <div class="pull-info">
                  <div class="pull-name">{{ rec.character.name }}</div>
                  <div class="pull-role" :class="rec.role">{{ getRoleLabel(rec.role) }}</div>
                </div>
              </div>
              <div class="pull-stats">
                <div class="wanted-by-section">
                  <span class="wanted-label">Wanted by {{ rec.wantedBy.length }} DPS:</span>
                  <div class="wanted-names">
                    <span
                      v-for="(w, i) in rec.wantedBy"
                      :key="i"
                      class="wanted-name"
                      :class="{ active: activeTooltip?.key === `dps-${rec.character.id}-${i}` }"
                      @mouseenter="showTooltip(`dps-${rec.character.id}-${i}`, w.reason, $event)"
                      @mouseleave="hideTooltipOnLeave"
                      @click="toggleTooltip(`dps-${rec.character.id}-${i}`, w.reason, $event)"
                    >
                      {{ w.name }}
                      <span v-if="w.eidolonRequirement" class="eidolon-badge" title="Eidolon requirement">E{{ w.eidolonRequirement }}+</span>
                      <span class="wanted-rating" :style="{ background: getRatingStyle(w.rating).bg }">{{ w.rating }}</span>
                    </span>
                  </div>
                </div>
                <!-- Investment Notes -->
                <div v-if="rec.investmentNotes.length > 0" class="investment-notes">
                  <span
                    v-for="(note, i) in rec.investmentNotes.slice(0, 2)"
                    :key="i"
                    class="investment-note"
                    :class="{ warning: note.includes('important') || note.includes('transformative') }"
                  >
                    {{ note }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- For Your Supports Tab -->
      <div v-if="pullSubTab === 'for-supports'">
        <p class="pull-tab-desc">DPS characters that your owned supports want to enable. <span class="hint-text">Hover or tap names for details.</span></p>

        <div v-if="dpsForSupports.length === 0" class="pull-empty">
          <span class="empty-icon">✓</span>
          <p>Your supports are well-utilized! You own all DPS they recommend.</p>
        </div>

        <div v-else class="pull-grid">
          <div
            v-for="(rec, index) in dpsForSupports"
            :key="rec.character.id"
            class="pull-card clickable"
            :class="{ 's-tier': getBaseRating(rec.rating) === 's', 'a-tier': getBaseRating(rec.rating) === 'a' }"
            :style="{ '--index': index }"
            @click="emit('select-character', rec.character.id)"
          >
            <button
              class="ignore-btn"
              title="Hide from recommendations"
              @click="ignoreCharacter(rec.character.id, $event)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="ignore-icon">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
            <div class="rating-accent" :style="{ background: getRatingStyle(rec.rating).bg }"></div>
            <div class="pull-card-content">
              <div class="pull-rank-rating">
                <div class="pull-rank" :class="{ top: index < 3 }">#{{ index + 1 }}</div>
                <div class="pull-rating-badge" :style="{ background: getRatingStyle(rec.rating).bg }">{{ rec.rating }}</div>
              </div>
              <div class="pull-mobile-row">
                <div class="pull-character-mobile">
                  <CharacterCard :character="rec.character" size="sm" :show-tier="true" />
                </div>
                <div class="pull-info">
                  <div class="pull-name">{{ rec.character.name }}</div>
                  <div class="pull-role" :class="rec.role">{{ getRoleLabel(rec.role) }}</div>
                </div>
              </div>
              <div class="pull-stats">
                <div class="wanted-by-section">
                  <span class="wanted-label">Wanted by {{ rec.wantedBy.length }} supports:</span>
                  <div class="wanted-names">
                    <span
                      v-for="(w, i) in rec.wantedBy"
                      :key="i"
                      class="wanted-name"
                      :class="{ active: activeTooltip?.key === `support-${rec.character.id}-${i}` }"
                      @mouseenter="showTooltip(`support-${rec.character.id}-${i}`, w.reason, $event)"
                      @mouseleave="hideTooltipOnLeave"
                      @click="toggleTooltip(`support-${rec.character.id}-${i}`, w.reason, $event)"
                    >
                      {{ w.name }}
                      <span v-if="w.eidolonRequirement" class="eidolon-badge" title="Eidolon requirement">E{{ w.eidolonRequirement }}+</span>
                      <span class="wanted-rating" :style="{ background: getRatingStyle(w.rating).bg }">{{ w.rating }}</span>
                    </span>
                  </div>
                </div>
                <!-- Investment Notes -->
                <div v-if="rec.investmentNotes.length > 0" class="investment-notes">
                  <span
                    v-for="(note, i) in rec.investmentNotes.slice(0, 2)"
                    :key="i"
                    class="investment-note"
                    :class="{ warning: note.includes('important') || note.includes('transformative') }"
                  >
                    {{ note }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Legend -->
      <div v-if="(pullSubTab === 'for-dps' && supportsForDPS.length > 0) || (pullSubTab === 'for-supports' && dpsForSupports.length > 0)" class="pull-legend">
        <div class="legend-item">
          <span class="legend-badge" :style="{ background: getRatingStyle('S').bg }">S</span>
          <span>Best in Slot</span>
        </div>
        <div class="legend-item">
          <span class="legend-badge" :style="{ background: getRatingStyle('A').bg }">A</span>
          <span>Excellent</span>
        </div>
        <div class="legend-item">
          <span class="legend-badge" :style="{ background: getRatingStyle('B').bg }">B</span>
          <span>Great</span>
        </div>
        <p class="pull-legend-note">Ratings weighted by character tier (T0 counts more than T4)</p>
      </div>

      <!-- Ignored Characters Section -->
      <div v-if="ignoredInCurrentTab.length > 0" class="ignored-section">
        <button
          class="ignored-toggle"
          @click="showIgnoredPanel = !showIgnoredPanel"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            class="ignored-toggle-icon"
            :class="{ rotated: showIgnoredPanel }"
          >
            <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
          </svg>
          <span>{{ ignoredInCurrentTab.length }} hidden character{{ ignoredInCurrentTab.length === 1 ? '' : 's' }}</span>
        </button>

        <Transition name="panel-slide">
          <div v-if="showIgnoredPanel" class="ignored-panel">
            <div class="ignored-list">
              <div
                v-for="id in ignoredInCurrentTab"
                :key="id"
                class="ignored-chip"
              >
                <span class="ignored-name">{{ getCharacterName(id) }}</span>
                <button
                  class="restore-btn"
                  title="Restore to recommendations"
                  @click="restoreCharacter(id)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="restore-icon">
                    <path fill-rule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clip-rule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </div>

    <!-- Fixed tooltip for mobile -->
    <Teleport to="body">
      <Transition name="tooltip-fade">
        <div
          v-if="activeTooltip"
          class="fixed-tooltip"
          :class="activeTooltip.position"
          :style="{ left: `${activeTooltip.x}px`, top: `${activeTooltip.y}px` }"
          @click.stop
        >
          {{ activeTooltip.reason }}
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* Header */
.view-header {
  margin-bottom: 1.5rem;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

@media (min-width: 480px) {
  .header-content {
    gap: 1rem;
  }
}

.radar-icon {
  position: relative;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}

@media (min-width: 480px) {
  .radar-icon {
    width: 48px;
    height: 48px;
  }
}

.radar-ring {
  position: absolute;
  inset: 0;
  border: 2px solid rgba(16, 185, 129, 0.3);
  border-radius: 50%;
}

.radar-sweep {
  position: absolute;
  inset: 0;
  background: conic-gradient(from 0deg, transparent 0deg, rgba(16, 185, 129, 0.3) 30deg, transparent 60deg);
  border-radius: 50%;
  animation: radar-spin 3s linear infinite;
}

@keyframes radar-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.radar-dot {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  color: rgb(16, 185, 129);
}

.header-text .header-title {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
  color: white;
}

@media (min-width: 480px) {
  .header-text .header-title {
    font-size: 1.25rem;
  }
}

.header-text .header-subtitle {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 0.25rem;
}

@media (min-width: 480px) {
  .header-text .header-subtitle {
    font-size: 0.875rem;
  }
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 5rem 2rem;
  text-align: center;
}

.empty-orb {
  position: relative;
  width: 120px;
  height: 120px;
  margin-bottom: 2rem;
}

.orb-ring {
  position: absolute;
  inset: 0;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 50%;
}

.orb-ring-1 { animation: orb-rotate 8s linear infinite; }
.orb-ring-2 { inset: 10px; animation: orb-rotate 12s linear infinite reverse; }
.orb-ring-3 { inset: 20px; animation: orb-rotate 6s linear infinite; }

@keyframes orb-rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.orb-icon {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.5rem;
  color: rgba(255, 255, 255, 0.2);
}

.empty-title {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 0.75rem;
}

.empty-desc {
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.4);
  line-height: 1.6;
  max-width: 400px;
}

/* Pull Content */
.pull-content {
  animation: section-enter 0.5s ease-out;
}

@keyframes section-enter {
  from { opacity: 0; transform: translateY(15px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Sub-tabs */
.pull-subtabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.pull-subtab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.75rem;
  cursor: pointer;
  transition: all 0.2s ease;
  color: rgba(255, 255, 255, 0.6);
}

.pull-subtab:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.15);
}

.pull-subtab.active {
  background: rgba(16, 185, 129, 0.15);
  border-color: rgba(16, 185, 129, 0.4);
  color: rgb(134, 239, 172);
}

.subtab-icon {
  font-size: 1rem;
}

.subtab-label {
  font-size: 0.8rem;
  font-weight: 600;
}

.subtab-count {
  font-size: 0.7rem;
  padding: 0.15rem 0.4rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  font-family: var(--font-mono);
}

.pull-subtab.active .subtab-count {
  background: rgba(16, 185, 129, 0.3);
}

@media (max-width: 480px) {
  .subtab-label {
    font-size: 0.7rem;
  }
  .subtab-icon {
    font-size: 0.9rem;
  }
}

.pull-tab-desc {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 1rem;
  text-align: center;
}

.pull-tab-desc .hint-text {
  color: rgba(255, 255, 255, 0.3);
  font-style: italic;
}

.pull-empty {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 2rem;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.2);
  border-radius: 1rem;
}

.pull-empty .empty-icon {
  font-size: 1.5rem;
  color: rgb(16, 185, 129);
}

.pull-empty p {
  color: rgba(255, 255, 255, 0.7);
}

.pull-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

@media (min-width: 768px) {
  .pull-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.pull-card {
  position: relative;
  background: rgba(20, 20, 40, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 1rem;
  overflow: hidden;
  animation: card-enter 0.4s ease-out both;
  animation-delay: calc(var(--index) * 0.05s);
  transition: all 0.3s;
}

@keyframes card-enter {
  from { opacity: 0; transform: translateY(15px); }
  to { opacity: 1; transform: translateY(0); }
}

.pull-card:hover {
  border-color: rgba(255, 255, 255, 0.15);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.pull-card.clickable {
  cursor: pointer;
}

.pull-card.s-tier {
  border-color: rgba(255, 149, 0, 0.2);
}

.pull-card.s-tier:hover {
  border-color: rgba(255, 149, 0, 0.4);
  box-shadow: 0 8px 24px rgba(255, 149, 0, 0.15);
}

.pull-card.a-tier {
  border-color: rgba(168, 85, 247, 0.2);
}

.pull-card.a-tier:hover {
  border-color: rgba(168, 85, 247, 0.4);
  box-shadow: 0 8px 24px rgba(168, 85, 247, 0.15);
}

.rating-accent {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  border-radius: 1rem 1rem 0 0;
}

.pull-card-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
}

@media (min-width: 480px) {
  .pull-card-content {
    flex-direction: row;
    align-items: flex-start;
    gap: 1rem;
  }
}

.pull-rank-rating {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
}

@media (min-width: 480px) {
  .pull-rank-rating {
    flex-direction: column;
    min-width: 40px;
  }
}

.pull-rank {
  font-size: 0.75rem;
  font-weight: 700;
  font-family: monospace;
  color: rgba(255, 255, 255, 0.3);
}

.pull-rank.top {
  color: rgb(249, 147, 7);
}

.pull-rating-badge {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  color: white;
}

.pull-character-mobile {
  flex-shrink: 0;
}

.pull-mobile-row {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  width: 100%;
}

@media (min-width: 480px) {
  .pull-mobile-row {
    display: contents;
  }
}

.pull-info {
  flex: 1;
  min-width: 0;
}

.pull-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: white;
  margin-bottom: 0.25rem;
}

.pull-role {
  display: inline-block;
  font-size: 0.6875rem;
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
  font-weight: 500;
  margin-bottom: 0.375rem;
}

.pull-role.amplifier {
  background: rgba(168, 85, 247, 0.15);
  color: rgb(196, 148, 255);
}

.pull-role.sustain {
  background: rgba(34, 197, 94, 0.15);
  color: rgb(74, 222, 128);
}

.pull-role.subDPS {
  background: rgba(245, 158, 11, 0.15);
  color: rgb(251, 191, 36);
}

.pull-role.dps {
  background: rgba(239, 68, 68, 0.15);
  color: rgb(248, 113, 113);
}

.pull-stats {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
}

@media (min-width: 480px) {
  .pull-stats {
    min-width: 120px;
    max-width: 200px;
    width: auto;
    flex-shrink: 0;
  }
}

.wanted-by-section {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.wanted-label {
  font-size: 0.625rem;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.wanted-names {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.wanted-name {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.05);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  cursor: help;
  transition: all 0.2s ease;
}

.wanted-name:hover {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.9);
}

.wanted-name.active {
  background: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.95);
}

.wanted-rating {
  font-size: 0.5625rem;
  font-weight: 700;
  padding: 0.125rem 0.25rem;
  border-radius: 3px;
  color: white;
}

.eidolon-badge {
  font-size: 0.5625rem;
  font-weight: 700;
  padding: 0.125rem 0.25rem;
  border-radius: 3px;
  background: rgba(245, 158, 11, 0.2);
  border: 1px solid rgba(245, 158, 11, 0.4);
  color: #fbbf24;
}

/* Investment Notes */
.investment-notes {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.investment-note {
  font-size: 0.625rem;
  color: rgba(255, 255, 255, 0.5);
  padding: 0.25rem 0.5rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 4px;
  border-left: 2px solid rgba(59, 130, 246, 0.5);
}

.investment-note.warning {
  color: rgba(251, 191, 36, 0.9);
  background: rgba(251, 191, 36, 0.08);
  border-left-color: rgba(251, 191, 36, 0.6);
}

/* Legend */
.pull-legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1rem;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

@media (min-width: 480px) {
  .pull-legend {
    gap: 2rem;
  }
}

.pull-legend .legend-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
}

.pull-legend .legend-badge {
  font-size: 0.625rem;
  font-weight: 700;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  color: white;
}

.pull-legend-note {
  width: 100%;
  text-align: center;
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.35);
  font-style: italic;
  margin-top: 0.5rem;
}

/* Ignore Button */
.ignore-btn {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  opacity: 0;
  transition: all 0.2s ease;
  z-index: 10;
}

.pull-card:hover .ignore-btn {
  opacity: 1;
}

.ignore-btn:hover {
  background: rgba(239, 68, 68, 0.3);
  border-color: rgba(239, 68, 68, 0.5);
  color: rgb(248, 113, 113);
}

.ignore-icon {
  width: 14px;
  height: 14px;
}

/* Mobile: always show ignore button */
@media (max-width: 768px) {
  .ignore-btn {
    opacity: 1;
  }
}

/* Ignored Section */
.ignored-section {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.ignored-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.ignored-toggle:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.7);
}

.ignored-toggle-icon {
  width: 16px;
  height: 16px;
  transition: transform 0.2s ease;
}

.ignored-toggle-icon.rotated {
  transform: rotate(180deg);
}

.ignored-panel {
  margin-top: 0.75rem;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 0.75rem;
}

.ignored-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.ignored-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.5rem 0.375rem 0.75rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 2rem;
  transition: all 0.2s ease;
}

.ignored-chip:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.12);
}

.ignored-name {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.7);
}

.restore-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: rgba(16, 185, 129, 0.15);
  border: none;
  border-radius: 50%;
  color: rgb(52, 211, 153);
  cursor: pointer;
  transition: all 0.2s ease;
}

.restore-btn:hover {
  background: rgba(16, 185, 129, 0.3);
  color: rgb(110, 231, 183);
}

.restore-icon {
  width: 12px;
  height: 12px;
}

/* Panel slide transition */
.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: all 0.2s ease;
}

.panel-slide-enter-from,
.panel-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>

<style>
/* Global styles for teleported tooltip */
.fixed-tooltip {
  position: fixed;
  background: rgba(15, 15, 35, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 8px;
  padding: 0.625rem 0.875rem;
  font-size: 0.8125rem;
  font-style: italic;
  color: rgba(255, 255, 255, 0.9);
  white-space: normal;
  min-width: 200px;
  max-width: 300px;
  text-align: center;
  z-index: 9999;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  pointer-events: none;
}

/* Position above (default) */
.fixed-tooltip.above {
  transform: translate(-50%, calc(-100% - 8px));
}

/* Position below */
.fixed-tooltip.below {
  transform: translate(-50%, 8px);
}

/* Tooltip transition - above */
.tooltip-fade-enter-active,
.tooltip-fade-leave-active {
  transition: opacity 0.15s ease-out, transform 0.15s ease-out;
}

.tooltip-fade-enter-from.above,
.tooltip-fade-leave-to.above {
  opacity: 0;
  transform: translate(-50%, calc(-100% - 4px));
}

.tooltip-fade-enter-from.below,
.tooltip-fade-leave-to.below {
  opacity: 0;
  transform: translate(-50%, 4px);
}
</style>
