<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { Character, TeammateRating, GranularRating, TierRating, UserCharacterInvestment } from '../types';
import RecommendationCard from './RecommendationCard.vue';
import CharacterFilterSelect from './CharacterFilterSelect.vue';
import { getTierData } from '../data/tierData';
import {
  getTeammatesForComposition,
  getEffectiveRating,
  findRoleOverlap,
  findSlotBasedGaps,
  analyzeTeamsForRecommendation,
  analyzeTeamBuildingForDPS,
  computePullVerdict,
  computeDPSPullVerdict,
  type InvestmentLevel,
  type RoleOverlap,
  type SlotBasedGapEntry,
  type TeamAnalysis,
  type DPSTeamBuildingAnalysis,
  type PullVerdict,
} from '../utils/characterUtils';
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
  wantedBy: { name: string; rating: TeammateRating; tier: TierRating; reason: string; coveragePenalty: number }[];
  investmentNotes: string[];
  accessibility: number;
}

const pullSubTab = ref<'for-dps' | 'for-supports'>('for-dps');

// DPS filter for "For Your DPS" tab
const selectedDPSIds = ref<Set<string>>(new Set());

const IGNORED_STORAGE_KEY = 'starguide_pull_advisor_ignored';
const ignoredCharacters = ref<Set<string>>(new Set());
const showIgnoredPanel = ref(false);

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

function saveIgnoredCharacters() {
  try {
    localStorage.setItem(IGNORED_STORAGE_KEY, JSON.stringify([...ignoredCharacters.value]));
  } catch (e) {
    console.error('Failed to save ignored characters:', e);
  }
}

function ignoreCharacter(id: string) {
  ignoredCharacters.value.add(id);
  ignoredCharacters.value = new Set(ignoredCharacters.value);
  saveIgnoredCharacters();
}

function restoreCharacter(id: string) {
  ignoredCharacters.value.delete(id);
  ignoredCharacters.value = new Set(ignoredCharacters.value);
  saveIgnoredCharacters();
}

function getCharacterName(id: string): string {
  const char = props.characters.find(c => c.id === id);
  return char?.name || id;
}

const activeTooltip = ref<{ key: string; reason: string; x: number; y: number; position: 'above' | 'below' } | null>(null);
const tooltipLockedByClick = ref(false);
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

function showTooltip(key: string, reason: string, event: Event) {
  if (isTouchDevice.value || tooltipLockedByClick.value) return;

  const target = event.currentTarget as HTMLElement;
  const { x, y, position } = calculateTooltipPosition(target);
  activeTooltip.value = { key, reason, x, y, position };
}

function hideTooltipOnLeave() {
  if (tooltipLockedByClick.value) return;
  activeTooltip.value = null;
}

function toggleTooltip(key: string, reason: string, event: Event) {
  event.stopPropagation();

  if (activeTooltip.value?.key === key) {
    activeTooltip.value = null;
    tooltipLockedByClick.value = false;
  } else {
    const target = event.currentTarget as HTMLElement;
    const { x, y, position } = calculateTooltipPosition(target);
    activeTooltip.value = { key, reason, x, y, position };
    tooltipLockedByClick.value = isTouchDevice.value;
  }
}

function closeTooltip() {
  activeTooltip.value = null;
  tooltipLockedByClick.value = false;
}

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

const TIER_WEIGHTS: Record<TierRating, number> = {
  'T-1': 3.5, 'T-0.5': 3.25, 'T0': 3.0, 'T0.5': 2.5, 'T1': 2.0, 'T1.5': 1.5,
  'T2': 1.2, 'T3': 0.9, 'T4': 0.6, 'T5': 0.3,
};

const SYNERGY_WEIGHTS: Record<TeammateRating, number> = { 'S+': 3.5, S: 3.0, A: 2.0, B: 1.2, C: 0.6, D: 0.2 };

const RECOMMENDED_TIER_MULTIPLIERS: Record<TierRating, number> = {
  'T-1': 1.35, 'T-0.5': 1.3, 'T0': 1.25, 'T0.5': 1.15, 'T1': 1.05, 'T1.5': 1.0,
  'T2': 0.95, 'T3': 0.85, 'T4': 0.7, 'T5': 0.55,
};

const COVERAGE_SCORES: Record<TeammateRating, number> = { 'S+': 3.5, S: 3, A: 2, B: 1, C: 0.5, D: 0.25 };
const COVERAGE_PENALTY_FACTOR = 0.15;

function calcCoverage(
  wantingChar: Character,
  category: 'dps' | 'subDPS' | 'amplifiers' | 'sustains',
  ownedIds: Set<string>,
  excludeId?: string
): number {
  const allTeammates = getTeammatesForComposition(wantingChar);
  const teammates = allTeammates[category];
  if (!teammates) return 0;

  return teammates
    .filter(t => ownedIds.has(t.id) && t.id !== excludeId)
    .reduce((sum, t) => sum + (COVERAGE_SCORES[t.rating] || 0), 0);
}

function getCoveragePenalty(coverage: number): number {
  return 1 / (1 + coverage * COVERAGE_PENALTY_FACTOR);
}

function calculatePullRating(
  wantedBy: { name: string; rating: TeammateRating; tier: TierRating; coveragePenalty: number }[],
  recommendedCharTier: TierRating
): { rating: GranularRating; score: number } {
  if (wantedBy.length === 0) return { rating: 'D', score: 0 };

  let weightedSum = 0;
  for (const w of wantedBy) {
    const tierWeight = TIER_WEIGHTS[w.tier] || 1.0;
    const synergyWeight = SYNERGY_WEIGHTS[w.rating] || 1.0;
    weightedSum += tierWeight * synergyWeight * w.coveragePenalty;
  }

  const tierMultiplier = RECOMMENDED_TIER_MULTIPLIERS[recommendedCharTier] || 1.0;
  const finalScore = weightedSum * tierMultiplier;

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

const RATING_ORDER: Record<GranularRating, number> = {
  'S+': 0, 'S': 1, 'S-': 2,
  'A+': 3, 'A': 4, 'A-': 5,
  'B+': 6, 'B': 7, 'B-': 8,
  'C+': 9, 'C': 10, 'C-': 11,
  'D': 12,
};

const getRoleLabel = (role: 'amplifier' | 'sustain' | 'subDPS' | 'dps'): string => {
  switch (role) {
    case 'amplifier': return 'Amplifier';
    case 'sustain': return 'Sustain';
    case 'subDPS': return 'Sub-DPS';
    case 'dps': return 'DPS';
  }
};

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

function getEffectiveTeammateRating(dps: Character, teammateId: string, baseRating: TeammateRating): TeammateRating {
  const investments = buildInvestmentMapForDPS(dps.id);
  if (investments.size === 0) return baseRating;
  return getEffectiveRating(dps, teammateId, { investments });
}

// ==================
// COMPUTED
// ==================

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
  }

  interface Accumulator {
    character: Character;
    roleCounts: Record<RoleType, number>;
    wantedBy: WantedByEntry[];
  }

  const recommendations = new Map<string, Accumulator>();
  const ownedIds = new Set(props.ownedCharacters.map(c => c.id));

  let ownedDPS = props.ownedCharacters.filter(c =>
    c.roles.includes('DPS') || c.roles.includes('Support DPS')
  );

  // When DPS filter is active, only selected DPS contribute to scores
  if (selectedDPSIds.value.size > 0) {
    ownedDPS = ownedDPS.filter(c => selectedDPSIds.value.has(c.id));
  }

  const roleToCategoryKey: Record<'amplifier' | 'sustain' | 'subDPS', CategoryKey> = {
    amplifier: 'amplifiers',
    sustain: 'sustains',
    subDPS: 'subDPS',
  };

  for (const dps of ownedDPS) {
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
      const categoryKey = roleToCategoryKey[role];

      for (const teammate of items) {
        const effectiveRating = getEffectiveTeammateRating(dps, teammate.id, teammate.rating);
        if (!['S+', 'S', 'A', 'B'].includes(effectiveRating)) continue;

        const char = props.characters.find(c => c.id === teammate.id);
        if (!char) continue;

        // Skip owned characters entirely
        if (ownedIds.has(teammate.id)) continue;

        const coverage = calcCoverage(dps, categoryKey, ownedIds, teammate.id);
        const coveragePenalty = getCoveragePenalty(coverage);

        const existing = recommendations.get(teammate.id);
        if (existing) {
          if (!existing.wantedBy.some(w => w.name === dps.name)) {
            existing.wantedBy.push({
              name: dps.name,
              rating: effectiveRating,
              tier: dpsTier,
              reason: teammate.reason,
              coveragePenalty,
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
              rating: effectiveRating,
              tier: dpsTier,
              reason: teammate.reason,
              coveragePenalty,
            }],
          });
        }
      }
    }
  }

  return Array.from(recommendations.values())
    .map(acc => {
      const recommendedCharTier = getBestTier(acc.character.id, props.gameMode);
      const { rating, score } = calculatePullRating(acc.wantedBy, recommendedCharTier);
      const roleEntries = Object.entries(acc.roleCounts) as [RoleType, number][];
      const mostCommonRole = roleEntries.reduce((a, b) => a[1] >= b[1] ? a : b)[0];
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

const dpsForSupports = computed((): PullRecommendation[] => {
  if (props.ownedCharacters.length < 4) return [];

  interface WantedByEntry {
    name: string;
    rating: TeammateRating;
    tier: TierRating;
    reason: string;
    coveragePenalty: number;
  }

  interface Accumulator {
    character: Character;
    wantedBy: WantedByEntry[];
  }

  const recommendations = new Map<string, Accumulator>();
  const ownedIds = new Set(props.ownedCharacters.map(c => c.id));

  const ownedSupports = props.ownedCharacters.filter(c => {
    const supportTeammates = getTeammatesForComposition(c);
    return c.roles.includes('Amplifier') || c.roles.includes('Sustain') ||
      (supportTeammates.dps && supportTeammates.dps.length > 0);
  });

  for (const support of ownedSupports) {
    const supportTeammates = getTeammatesForComposition(support);
    if (!supportTeammates.dps) continue;
    const supportTier = getBestTier(support.id, props.gameMode);

    for (const teammate of supportTeammates.dps) {
      const effectiveRating = getEffectiveTeammateRating(support, teammate.id, teammate.rating);
      if (!['S+', 'S', 'A', 'B'].includes(effectiveRating)) continue;

      const char = props.characters.find(c => c.id === teammate.id);
      if (!char) continue;

      // Skip owned characters entirely
      if (ownedIds.has(teammate.id)) continue;

      const coverage = calcCoverage(support, 'dps', ownedIds, teammate.id);
      const coveragePenalty = getCoveragePenalty(coverage);

      const existing = recommendations.get(teammate.id);
      if (existing) {
        if (!existing.wantedBy.some(w => w.name === support.name)) {
          existing.wantedBy.push({
            name: support.name,
            rating: effectiveRating,
            tier: supportTier,
            reason: teammate.reason,
            coveragePenalty,
          });
        }
      } else {
        recommendations.set(teammate.id, {
          character: char,
          wantedBy: [{
            name: support.name,
            rating: effectiveRating,
            tier: supportTier,
            reason: teammate.reason,
            coveragePenalty,
          }],
        });
      }
    }
  }

  return Array.from(recommendations.values())
    .map(acc => {
      const recommendedCharTier = getBestTier(acc.character.id, props.gameMode);
      const { rating, score } = calculatePullRating(acc.wantedBy, recommendedCharTier);
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

// ==================
// ENRICHED RECOMMENDATIONS
// ==================

interface EnrichedRecommendation extends PullRecommendation {
  roleOverlap: RoleOverlap[];
  rosterGaps: SlotBasedGapEntry[];
  teamAnalysis: TeamAnalysis[];
  dpsTeamAnalysis: DPSTeamBuildingAnalysis | null; // For DPS recommendations
  verdict: PullVerdict;
}

// Helper to get DPS tier for verdict scoring
const getDpsTier = (characterId: string): string | undefined => {
  const tierData = getTierData(characterId);
  if (!tierData) return undefined;

  // Get DPS tier from current game mode
  const modeData = tierData[props.gameMode];
  if (!modeData) return undefined;

  // Return DPS tier, or Support DPS tier if no DPS
  return modeData['DPS'] || modeData['Support DPS'];
};

// Owned DPS characters (for filter)
const ownedDPS = computed(() => {
  return props.ownedCharacters.filter(c =>
    c.roles.includes('DPS') || c.roles.includes('Support DPS')
  );
});

const enrichedSupportsForDPS = computed((): EnrichedRecommendation[] => {
  const ownedIds = new Set(props.ownedCharacters.map(c => c.id));

  return supportsForDPS.value.map(rec => {
    const wantedByDPS = rec.wantedBy.map(w => {
      const dpsChar = props.ownedCharacters.find(c => c.name === w.name);
      return dpsChar ? { dpsId: dpsChar.id, dpsChar, rating: w.rating } : null;
    }).filter((x): x is { dpsId: string; dpsChar: Character; rating: TeammateRating } => x !== null);

    const roleOverlap = findRoleOverlap(
      rec.character.id,
      ownedIds,
      wantedByDPS,
      props.characters
    );

    const rosterGaps = findSlotBasedGaps(
      rec.character.id,
      ownedIds,
      wantedByDPS,
      props.characters
    );

    const teamAnalysis = analyzeTeamsForRecommendation(
      rec.character.id,
      ownedIds,
      wantedByDPS,
      props.characters
    );

    const isOwned = props.getOwnership(rec.character.id) === 'owned';
    const verdict = computePullVerdict(teamAnalysis, getDpsTier, isOwned);
    return { ...rec, roleOverlap, rosterGaps, teamAnalysis, dpsTeamAnalysis: null, verdict };
  }).sort((a, b) => b.verdict.score - a.verdict.score);
});

// When DPS filter is active, supportsForDPS already only includes selected DPS
const filteredEnrichedSupportsForDPS = computed((): EnrichedRecommendation[] => {
  return enrichedSupportsForDPS.value;
});

const enrichedDPSForSupports = computed((): EnrichedRecommendation[] => {
  const ownedIds = new Set(props.ownedCharacters.map(c => c.id));

  return dpsForSupports.value.map(rec => {
    // For DPS recommendations, analyze what supports the user has for this DPS
    const dpsTeamAnalysis = analyzeTeamBuildingForDPS(
      rec.character,
      ownedIds,
      props.characters
    );

    const isOwned = props.getOwnership(rec.character.id) === 'owned';
    const dpsTier = getDpsTier(rec.character.id);
    const verdict = computeDPSPullVerdict(dpsTeamAnalysis, dpsTier, isOwned);

    // Legacy fields (not used for DPS but needed for interface)
    const roleOverlap: RoleOverlap[] = [];
    const rosterGaps: SlotBasedGapEntry[] = [];
    const teamAnalysis: TeamAnalysis[] = [];

    return { ...rec, roleOverlap, rosterGaps, teamAnalysis, dpsTeamAnalysis, verdict };
  }).sort((a, b) => b.verdict.score - a.verdict.score);
});

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
          <p class="header-subtitle">Prioritized recommendations for your {{ ownedCharacters.length }}-character roster</p>
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
        Mark at least 4 characters as owned to generate recommendations.<br />
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
          <span class="subtab-icon">⚔</span>
          <span class="subtab-label">For Your DPS</span>
          <span class="subtab-count">{{ supportsForDPS.length }}</span>
        </button>
        <button
          @click="pullSubTab = 'for-supports'"
          class="pull-subtab"
          :class="{ active: pullSubTab === 'for-supports' }"
        >
          <span class="subtab-icon">✧</span>
          <span class="subtab-label">For Your Supports</span>
          <span class="subtab-count">{{ dpsForSupports.length }}</span>
        </button>
      </div>

      <!-- For Your DPS Tab -->
      <div v-if="pullSubTab === 'for-dps'" class="pull-tab-content">
        <p class="pull-tab-desc">Supports and Sub-DPS that would strengthen your team compositions</p>

        <!-- DPS Filter -->
        <CharacterFilterSelect
          :characters="ownedDPS"
          :selected-ids="selectedDPSIds"
          :get-ownership="getOwnership"
          :game-mode="gameMode"
          button-label="Filter by DPS"
          modal-title="Select DPS to Filter By"
          :show-tier="true"
          @update:selected-ids="selectedDPSIds = $event"
        />

        <div v-if="filteredEnrichedSupportsForDPS.length === 0 && enrichedSupportsForDPS.length > 0" class="pull-empty">
          <span class="empty-icon">⚔</span>
          <p>No supports found for the selected DPS.</p>
          <p class="pull-empty-hint">Try selecting different DPS or clear the filter.</p>
        </div>

        <div v-else-if="enrichedSupportsForDPS.length === 0" class="pull-empty">
          <span class="empty-icon">✓</span>
          <p>Your roster is well-supported! All recommended teammates are accounted for.</p>
        </div>

        <div v-else class="recommendation-list">
          <RecommendationCard
            v-for="(rec, index) in filteredEnrichedSupportsForDPS"
            :key="rec.character.id"
            :character="rec.character"
            :character-id="rec.character.id"
            :owned="false"
            :rating="rec.rating"
            :rank="index + 1"
            :role-label="getRoleLabel(rec.role)"
            :role-class="rec.role"
            :wanted-by="rec.wantedBy"
            wanted-by-label="DPS"
            :team-analysis="rec.teamAnalysis"
            :dps-team-analysis="rec.dpsTeamAnalysis"
            :verdict="rec.verdict"
            :all-characters="characters"
            :owned-character-ids="new Set(ownedCharacters.map(c => c.id))"
            :show-dismiss-button="true"
            :show-tooltips="true"
            :index="index"
            @select-character="emit('select-character', $event)"
            @dismiss="ignoreCharacter($event)"
            @show-tooltip="showTooltip"
            @hide-tooltip="hideTooltipOnLeave"
            @toggle-tooltip="toggleTooltip"
          />
        </div>
      </div>

      <!-- For Your Supports Tab -->
      <div v-if="pullSubTab === 'for-supports'" class="pull-tab-content">
        <p class="pull-tab-desc">DPS characters that your supports can enable effectively</p>

        <div v-if="enrichedDPSForSupports.length === 0" class="pull-empty">
          <span class="empty-icon">✓</span>
          <p>Your supports are well-utilized! All recommended DPS are accounted for.</p>
        </div>

        <div v-else class="recommendation-list">
          <RecommendationCard
            v-for="(rec, index) in enrichedDPSForSupports"
            :key="rec.character.id"
            :character="rec.character"
            :character-id="rec.character.id"
            :owned="false"
            :rating="rec.rating"
            :rank="index + 1"
            :role-label="getRoleLabel(rec.role)"
            :role-class="rec.role"
            :wanted-by="rec.wantedBy"
            wanted-by-label="supports"
            :team-analysis="rec.teamAnalysis"
            :dps-team-analysis="rec.dpsTeamAnalysis"
            :verdict="rec.verdict"
            :all-characters="characters"
            :owned-character-ids="new Set(ownedCharacters.map(c => c.id))"
            :show-dismiss-button="true"
            :show-tooltips="true"
            :index="index"
            @select-character="emit('select-character', $event)"
            @dismiss="ignoreCharacter($event)"
            @show-tooltip="showTooltip"
            @hide-tooltip="hideTooltipOnLeave"
            @toggle-tooltip="toggleTooltip"
          />
        </div>
      </div>

      <!-- Ignored Characters -->
      <div v-if="ignoredInCurrentTab.length > 0" class="ignored-section">
        <button class="ignored-toggle" @click="showIgnoredPanel = !showIgnoredPanel">
          <svg viewBox="0 0 20 20" fill="currentColor" class="ignored-icon" :class="{ rotated: showIgnoredPanel }">
            <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
          </svg>
          {{ ignoredInCurrentTab.length }} hidden recommendation{{ ignoredInCurrentTab.length === 1 ? '' : 's' }}
        </button>

        <Transition name="panel-slide">
          <div v-if="showIgnoredPanel" class="ignored-panel">
            <div class="ignored-list">
              <div v-for="id in ignoredInCurrentTab" :key="id" class="ignored-chip">
                <span>{{ getCharacterName(id) }}</span>
                <button class="restore-btn" @click="restoreCharacter(id)" title="Restore">
                  <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clip-rule="evenodd" /></svg>
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </div>

    <!-- Tooltip -->
    <Teleport to="body">
      <Transition name="tooltip-fade">
        <div
          v-if="activeTooltip"
          class="floating-tooltip"
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
/* ==========================================
   PULL ADVISOR V2 - STELLAR NEXUS DESIGN
   ========================================== */

/* Header */
.view-header {
  margin-bottom: 2rem;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.radar-icon {
  position: relative;
  width: 52px;
  height: 52px;
  flex-shrink: 0;
}

.radar-ring {
  position: absolute;
  inset: 0;
  border: 2px solid rgba(52, 211, 153, 0.25);
  border-radius: 50%;
}

.radar-sweep {
  position: absolute;
  inset: 0;
  background: conic-gradient(from 0deg, transparent 0deg, rgba(52, 211, 153, 0.35) 40deg, transparent 80deg);
  border-radius: 50%;
  animation: radar-spin 2.5s linear infinite;
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
  font-size: 1.5rem;
  color: rgb(52, 211, 153);
  text-shadow: 0 0 20px rgba(52, 211, 153, 0.6);
}

.header-title {
  font-family: var(--font-display, 'Orbitron', sans-serif);
  font-size: 1.375rem;
  font-weight: 700;
  color: white;
  letter-spacing: 0.02em;
  margin: 0;
}

.header-subtitle {
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.5);
  margin: 0.25rem 0 0 0;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4rem 2rem;
  text-align: center;
}

.empty-orb {
  position: relative;
  width: 100px;
  height: 100px;
  margin-bottom: 1.5rem;
}

.orb-ring {
  position: absolute;
  inset: 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 50%;
}

.orb-ring-1 { animation: orb-pulse 4s ease-in-out infinite; }
.orb-ring-2 { inset: 12px; animation: orb-pulse 4s ease-in-out infinite 0.5s; }
.orb-ring-3 { inset: 24px; animation: orb-pulse 4s ease-in-out infinite 1s; }

@keyframes orb-pulse {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.05); }
}

.orb-icon {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  color: rgba(255, 255, 255, 0.15);
}

.empty-title {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
  margin: 0 0 0.5rem 0;
}

.empty-desc {
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.4);
  line-height: 1.6;
  max-width: 380px;
}

/* Sub-tabs */
.pull-subtabs {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.pull-subtab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;
  padding: 0.875rem 1rem;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 0.875rem;
  cursor: pointer;
  transition: all 0.25s ease;
  color: rgba(255, 255, 255, 0.5);
}

.pull-subtab:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.7);
}

.pull-subtab.active {
  background: rgba(52, 211, 153, 0.1);
  border-color: rgba(52, 211, 153, 0.3);
  color: rgb(134, 239, 172);
}

.subtab-icon {
  font-size: 1.125rem;
}

.subtab-label {
  font-size: 0.875rem;
  font-weight: 600;
}

.subtab-count {
  font-size: 0.75rem;
  font-family: var(--font-mono);
  padding: 0.2rem 0.5rem;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 0.5rem;
}

.pull-subtab.active .subtab-count {
  background: rgba(52, 211, 153, 0.25);
}

@media (max-width: 480px) {
  .subtab-label { font-size: 0.75rem; }
  .subtab-icon { font-size: 1rem; }
  .pull-subtab { padding: 0.75rem 0.5rem; gap: 0.5rem; }
}

/* Tab Content */
.pull-tab-content {
  animation: fade-in 0.3s ease;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.pull-tab-desc {
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.4);
  text-align: center;
  margin-bottom: 1.5rem;
}

.pull-empty {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.5rem;
  background: rgba(52, 211, 153, 0.08);
  border: 1px solid rgba(52, 211, 153, 0.2);
  border-radius: 1rem;
}

.pull-empty .empty-icon {
  font-size: 1.25rem;
  color: rgb(52, 211, 153);
}

.pull-empty p {
  color: rgba(255, 255, 255, 0.7);
  margin: 0;
}

/* Recommendation Cards List */
.recommendation-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* Ignored Section */
.ignored-section {
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.ignored-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.875rem 1rem;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 0.75rem;
  color: rgba(255, 255, 255, 0.45);
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 0.2s;
}

.ignored-toggle:hover {
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.6);
}

.ignored-icon {
  width: 18px;
  height: 18px;
  transition: transform 0.25s;
}

.ignored-icon.rotated {
  transform: rotate(180deg);
}

.ignored-panel {
  margin-top: 0.75rem;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.02);
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
  gap: 0.5rem;
  padding: 0.5rem 0.625rem 0.5rem 0.875rem;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 2rem;
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.65);
}

.restore-btn {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(52, 211, 153, 0.15);
  border: none;
  border-radius: 50%;
  color: rgb(52, 211, 153);
  cursor: pointer;
  transition: all 0.2s;
}

.restore-btn:hover {
  background: rgba(52, 211, 153, 0.25);
}

.restore-btn svg {
  width: 12px;
  height: 12px;
}

.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: all 0.25s ease;
}

.panel-slide-enter-from,
.panel-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>

<style>
/* Floating Tooltip (global) */
.floating-tooltip {
  position: fixed;
  background: rgba(15, 23, 42, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 0.625rem;
  padding: 0.75rem 1rem;
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.9);
  white-space: normal;
  min-width: 200px;
  max-width: 320px;
  text-align: center;
  z-index: 9999;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  pointer-events: none;
}

.floating-tooltip.above {
  transform: translate(-50%, calc(-100% - 10px));
}

.floating-tooltip.below {
  transform: translate(-50%, 10px);
}

.tooltip-fade-enter-active,
.tooltip-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.tooltip-fade-enter-from.above,
.tooltip-fade-leave-to.above {
  opacity: 0;
  transform: translate(-50%, calc(-100% - 6px));
}

.tooltip-fade-enter-from.below,
.tooltip-fade-leave-to.below {
  opacity: 0;
  transform: translate(-50%, 6px);
}
</style>
