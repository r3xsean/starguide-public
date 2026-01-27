<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted } from 'vue';
import type { Character, UserCharacterInvestment, TierRating } from '../types';
import {
  INVESTMENT_SCALING,
  getEffectiveScore,
  scoreToTier,
} from '../utils/scaleConverters';
import FeedbackButton from './FeedbackButton.vue';
import ContextualFeedbackModal from './ContextualFeedbackModal.vue';
import type { FeedbackContext } from './ContextualFeedbackModal.vue';
import { getCharacterById } from '../data';
import { useCommunityStats } from '../composables/useCommunityStats';

interface Props {
  character: Character;
  gameMode: 'avg' | 'moc' | 'pf' | 'as';
  currentInvestment?: UserCharacterInvestment;
}

const props = withDefaults(defineProps<Props>(), {
  currentInvestment: () => ({
    ownership: 'owned',
    eidolonLevel: 0,
    lightConeId: undefined,
    lightConeSuperimposition: undefined,
  }),
});

const emit = defineEmits<{
  'update:eidolon': [level: 0 | 1 | 2 | 3 | 4 | 5 | 6];
  'update:lightCone': [lightConeId: string | undefined, superimposition: 1 | 2 | 3 | 4 | 5 | undefined];
}>();

// Light cone selector state
const showLightConeSelector = ref(false);
const selectedLightConeForSuper = ref<string | undefined>(undefined);

// Refs for scrolling
const lightConeSelectorRef = ref<HTMLElement | null>(null);
const superimpositionSelectorRef = ref<HTMLElement | null>(null);

// Auto-scroll to light cone selector when it opens
watch(showLightConeSelector, (newValue) => {
  if (newValue) {
    nextTick(() => {
      lightConeSelectorRef.value?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'  // Center for optimal visibility
      });
    });
  }
});

// Auto-scroll to superimposition selector when it appears
watch(selectedLightConeForSuper, (newValue) => {
  if (newValue) {
    nextTick(() => {
      superimpositionSelectorRef.value?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'  // Center for optimal visibility
      });
    });
  }
});

// Check if character has investment data
const hasInvestmentData = computed(() => !!props.character.investment);

// Baseline constant for LC power calculations (no LC = 40 penalty)
// This matches the GENERIC_LC_PENALTY in investmentUtils.ts
const GENERIC_LC_PENALTY = 40;

// Investment-adjusted tier (handles 'avg' by averaging all modes)
const adjustedTier = computed(() => {
  if (props.gameMode === 'avg') {
    const mocScore = getEffectiveScore(props.character, 'moc', props.currentInvestment);
    const pfScore = getEffectiveScore(props.character, 'pf', props.currentInvestment);
    const asScore = getEffectiveScore(props.character, 'as', props.currentInvestment);
    const avgScore = (mocScore + pfScore + asScore) / 3;
    return scoreToTier(avgScore);
  }
  const score = getEffectiveScore(props.character, props.gameMode, props.currentInvestment);
  return scoreToTier(score);
});

// Eidolon data with impact calculations (actual effectiveness %)
const eidolonData = computed(() => {
  if (!props.character.investment?.eidolons) return [];

  return props.character.investment.eidolons.map((eid) => {
    const isOwned = props.currentInvestment && props.currentInvestment.eidolonLevel >= eid.level;
    const rawPenalty = Math.abs(eid.penalty);
    // Actual effectiveness impact (not normalized to 0-100% scale)
    const impactValue = rawPenalty * INVESTMENT_SCALING.EIDOLON;
    const impactLabel = getImpactLabel(rawPenalty);
    const impactColor = getImpactColor(rawPenalty);

    // Process synergy modifiers to include character names
    const synergyBoosts = eid.synergyModifiers?.map(mod => {
      const char = getCharacterById(mod.withCharacterId);
      return {
        characterId: mod.withCharacterId,
        characterName: char?.name || mod.withCharacterId,
        modifier: mod.modifier,
        reason: mod.reason,
        isPositive: mod.modifier > 0,
      };
    }).filter(mod => mod.modifier !== 0) || [];

    return {
      ...eid,
      isOwned,
      impactValue,
      impactLabel,
      impactColor,
      synergyBoosts,
    };
  });
});

// Light cone data with tier contribution comparisons
// Tier pts = (40 - penalty) * LC_SCALING, where 40 = no LC penalty baseline
const lightConeData = computed(() => {
  if (!props.character.investment?.lightCones) return [];

  const currentLCId = props.currentInvestment?.lightConeId;

  return props.character.investment.lightCones
    .map((lc) => {
      const isCurrent = lc.id === currentLCId;
      const s1Penalty = Math.abs(lc.penalties.s1);
      const s5Penalty = Math.abs(lc.penalties.s5);

      // Tier pts from baseline (No LC = 0 pts)
      const s1Power = (GENERIC_LC_PENALTY - s1Penalty) * INVESTMENT_SCALING.LIGHT_CONE;
      const s5Power = (GENERIC_LC_PENALTY - s5Penalty) * INVESTMENT_SCALING.LIGHT_CONE;

      // Process synergy modifiers to include character names
      const synergyBoosts = lc.synergyModifiers?.map(mod => {
        const char = getCharacterById(mod.withCharacterId);
        return {
          characterId: mod.withCharacterId,
          characterName: char?.name || mod.withCharacterId,
          modifier: mod.modifier,
          reason: mod.reason,
          isPositive: mod.modifier > 0,
        };
      }).filter(mod => mod.modifier !== 0) || [];

      return {
        ...lc,
        isCurrent,
        s1Power,  // Tier pts at S1
        s5Power,  // Tier pts at S5
        s1Penalty,
        s5Penalty,
        s1ImpactLabel: getImpactLabel(s1Penalty),
        s5ImpactLabel: getImpactLabel(s5Penalty),
        sourceLabel: getSourceLabel(lc.source),
        synergyBoosts,
      };
    })
    .sort((a, b) => b.s5Power - a.s5Power); // Sort by S5 tier pts descending (best LC first)
});

// Total eidolon penalty (sum of missing eidolons)
const totalEidolonPenalty = computed(() => {
  if (!props.character.investment?.eidolons) return 0;

  return props.character.investment.eidolons.reduce((total, eid) => {
    const isOwned = props.currentInvestment && props.currentInvestment.eidolonLevel >= eid.level;
    return isOwned ? total : total + Math.abs(eid.penalty);
  }, 0);
});

// Current light cone penalty
const currentLightConePenalty = computed(() => {
  if (!props.character.investment?.lightCones) return 0;

  // If no LC equipped, use the same fixed penalty as scaleConverters.ts
  // This ensures consistency with effectiveness calculation
  if (!props.currentInvestment?.lightConeId) {
    return 40; // Matches the -40 penalty in getLCPenalty()
  }

  const currentLC = props.character.investment.lightCones.find(
    lc => lc.id === props.currentInvestment.lightConeId
  );

  if (!currentLC) return 40; // Unknown LC = generic penalty

  const superimposition = props.currentInvestment.lightConeSuperimposition || 1;

  // Interpolate penalty for S2-S4 (matches scaleConverters.ts logic)
  let penalty: number;
  if (superimposition === 1) {
    penalty = currentLC.penalties.s1;
  } else if (superimposition === 5) {
    penalty = currentLC.penalties.s5;
  } else {
    // Linear interpolation for S2-S4
    const s1Penalty = currentLC.penalties.s1;
    const s5Penalty = currentLC.penalties.s5;
    const penaltyPerLevel = (s5Penalty - s1Penalty) / 4;
    penalty = s1Penalty + penaltyPerLevel * (superimposition - 1);
  }

  return Math.abs(penalty);
});

// Actual effectiveness totals for display
const totalEidolonPenaltyDisplay = computed(() => {
  return totalEidolonPenalty.value * INVESTMENT_SCALING.EIDOLON;
});

// ==================
// TIER CONTRIBUTION COMPUTED PROPERTIES (baseline = E0 + No LC)
// Values are tier points that contribute to effective tier calculation
// These are NOT direct damage increases - they affect tier rating
// ==================

// EIDOLONS: Tier contribution from owned eidolons (baseline = E0 = 0 pts)
const eidolonPowerGained = computed(() => {
  if (!props.character.investment?.eidolons) return 0;
  return props.character.investment.eidolons.reduce((total, eid) => {
    const isOwned = props.currentInvestment && props.currentInvestment.eidolonLevel >= eid.level;
    return isOwned ? total + Math.abs(eid.penalty) : total;
  }, 0);
});

// Tier pts from owned eidolons (scaled)
const eidolonPowerGainedDisplay = computed(() => {
  return eidolonPowerGained.value * INVESTMENT_SCALING.EIDOLON;
});

// Tier pts still available from unowned eidolons
const eidolonPowerAvailableDisplay = computed(() => totalEidolonPenaltyDisplay.value);

// LIGHT CONES: Tier contribution from current LC (baseline = No LC = 0 pts)
const lightConePowerGained = computed(() => {
  return GENERIC_LC_PENALTY - currentLightConePenalty.value;
});

// Tier pts from current LC (scaled)
const lightConePowerGainedDisplay = computed(() => {
  return lightConePowerGained.value * INVESTMENT_SCALING.LIGHT_CONE;
});

// Max possible LC tier pts (signature S5 = max)
const maxLCPower = computed(() => {
  return GENERIC_LC_PENALTY * INVESTMENT_SCALING.LIGHT_CONE;
});

// Total tier pts from all investment (effectiveness contribution)
// These are the larger numbers (0 to ~46) that users see
const totalPowerGained = computed(() => {
  return eidolonPowerGainedDisplay.value + lightConePowerGainedDisplay.value;
});

const totalPowerAvailable = computed(() => {
  const lcAvailable = maxLCPower.value - lightConePowerGainedDisplay.value;
  return eidolonPowerAvailableDisplay.value + lcAvailable;
});

// ==================
// TIER PROGRESSION INFO
// ==================

// Tier score thresholds (must exceed to reach tier)
const TIER_THRESHOLDS: Record<TierRating, number> = {
  'T-1': 110,
  'T-0.5': 103,
  'T0': 97.5,
  'T0.5': 90,
  'T1': 80,
  'T1.5': 70,
  'T2': 60,
  'T3': 50,
  'T4': 40,
  'T5': 0, // No threshold below T5
};

// Ordered tiers from best to worst
const TIER_ORDER: TierRating[] = ['T-1', 'T-0.5', 'T0', 'T0.5', 'T1', 'T1.5', 'T2', 'T3', 'T4', 'T5'];

// Get current effective score
const currentScore = computed(() => {
  if (props.gameMode === 'avg') {
    const mocScore = getEffectiveScore(props.character, 'moc', props.currentInvestment);
    const pfScore = getEffectiveScore(props.character, 'pf', props.currentInvestment);
    const asScore = getEffectiveScore(props.character, 'as', props.currentInvestment);
    return (mocScore + pfScore + asScore) / 3;
  }
  return getEffectiveScore(props.character, props.gameMode, props.currentInvestment);
});

// Get next tier and points needed (in tier pts scale)
const nextTierInfo = computed(() => {
  const current = adjustedTier.value;
  const currentIdx = TIER_ORDER.indexOf(current);

  // Already at T-1 (best tier) or invalid tier
  if (currentIdx <= 0) {
    return null;
  }

  const nextTier = TIER_ORDER[currentIdx - 1] as TierRating;
  const nextThreshold = TIER_THRESHOLDS[nextTier];
  const currentThreshold = TIER_THRESHOLDS[current];
  const scoreNeeded = Math.max(0, nextThreshold - currentScore.value + 0.1); // +0.1 to exceed threshold

  // Convert score space to tier pts space
  // Score bonus = tierPts * 0.35, so tier pts = score / 0.35 ≈ score * 2.86
  const SCORE_TO_TIERPTS = 1 / 0.35;
  const tierPtsNeeded = scoreNeeded * SCORE_TO_TIERPTS;

  // Calculate progress percentage toward next tier
  // Progress = how far we've come from current tier threshold toward next tier threshold
  const tierGap = nextThreshold - currentThreshold;
  const progressMade = currentScore.value - currentThreshold;
  const progressPercent = tierGap > 0 ? Math.max(0, Math.min(100, (progressMade / tierGap) * 100)) : 0;

  return {
    nextTier,
    pointsNeeded: Math.ceil(tierPtsNeeded * 10) / 10, // Round up to 1 decimal
    progressPercent,
  };
});

// Get impact label from numeric value (raw penalty thresholds)
function getImpactLabel(value: number): string {
  if (value >= 30) return 'Transformative';
  if (value >= 20) return 'Major';
  if (value >= 12) return 'Significant';
  if (value >= 6) return 'Minor';
  return 'Negligible';
}

// Get color for impact level (matches label thresholds)
function getImpactColor(value: number): string {
  if (value >= 30) return 'text-orange-400';
  if (value >= 20) return 'text-purple-400';
  if (value >= 12) return 'text-blue-400';
  if (value >= 6) return 'text-green-400';
  return 'text-gray-500';
}

// Get source label
function getSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    signature: 'Limited',
    standard: 'Standard',
    event: 'Event',
    'herta-store': 'Herta Store',
    'battle-pass': 'Battle Pass',
    craftable: 'Craftable',
  };
  return labels[source] || source;
}

// Handlers
function handleEidolonClick(level: 0 | 1 | 2 | 3 | 4 | 5 | 6) {
  emit('update:eidolon', level);
}

function handleLightConeSelect(lightConeId: string | undefined) {
  if (lightConeId === undefined) {
    // "None" selected - emit immediately and close
    emit('update:lightCone', undefined, undefined);
    showLightConeSelector.value = false;
    selectedLightConeForSuper.value = undefined;
  } else {
    // LC selected - show superimposition selector
    selectedLightConeForSuper.value = lightConeId;
  }
}

function handleSuperimpositionSelect(superimposition: 1 | 2 | 3 | 4 | 5) {
  if (selectedLightConeForSuper.value) {
    emit('update:lightCone', selectedLightConeForSuper.value, superimposition);
    showLightConeSelector.value = false;
    selectedLightConeForSuper.value = undefined;
  }
}

// ==================
// CONTEXTUAL FEEDBACK
// ==================

const showFeedbackModal = ref(false);

const feedbackContext = computed((): FeedbackContext => ({
  characterId: props.character.id,
  characterName: props.character.name,
}));

function openInvestmentFeedback() {
  showFeedbackModal.value = true;
}

function closeFeedbackModal() {
  showFeedbackModal.value = false;
}

// ==================
// TIER COLOR CLASSES
// ==================

function getTierColorClass(tier: TierRating): string {
  if (tier === 'T-1') return 'tier-legendary';
  if (tier === 'T-0.5') return 'tier-mythic';
  if (tier === 'T0') return 'tier-meta';
  if (tier === 'T0.5') return 'tier-excellent';
  if (tier === 'T1') return 'tier-great';
  if (tier === 'T1.5') return 'tier-good';
  if (tier === 'T2') return 'tier-decent';
  return 'tier-low';
}

const tierColorClass = computed(() => getTierColorClass(adjustedTier.value));
const nextTierColorClass = computed(() => {
  if (!nextTierInfo.value) return '';
  return getTierColorClass(nextTierInfo.value.nextTier);
});

// ==================
// COMMUNITY STATS
// ==================

const { fetchStats, getEidolonStats, getLightConeStats } = useCommunityStats();

// Fetch community stats on mount
onMounted(() => {
  fetchStats();
});

// Helper to get eidolon community stats for this character
function getEidolonCommunityStats(level: number) {
  return getEidolonStats(props.character.id, level);
}

// Helper to get light cone community stats for this character
function getLcCommunityStats(lcId: string) {
  return getLightConeStats(props.character.id, lcId);
}
</script>

<template>
  <div v-if="!hasInvestmentData" class="p-6 bg-gray-800/30 rounded-lg border border-gray-700/50">
    <p class="text-gray-400 text-center">
      Investment data not yet available for this character.
    </p>
  </div>

  <div v-else class="space-y-6">
    <!-- Current Investment Summary -->
    <div class="investment-summary">
      <!-- Header -->
      <div class="flex items-center justify-between mb-5">
        <h3 class="text-lg font-bold text-gray-100 tracking-wide">Your Investment</h3>
        <FeedbackButton
          label="Report issue"
          tooltip="Investment info wrong?"
          size="sm"
          @click="openInvestmentFeedback"
        />
      </div>

      <!-- Investment Controls Row -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <!-- Eidolon Selector -->
        <div>
          <span class="text-xs text-gray-500 uppercase tracking-wider block mb-2">Eidolon</span>
          <div class="flex gap-1">
            <button
              v-for="level in [0, 1, 2, 3, 4, 5, 6]"
              :key="level"
              @click="handleEidolonClick(level as 0 | 1 | 2 | 3 | 4 | 5 | 6)"
              class="eidolon-btn"
              :class="{ active: currentInvestment?.eidolonLevel === level }"
              :title="`Set to E${level}`"
            >
              E{{ level }}
            </button>
          </div>
        </div>

        <!-- Light Cone Button -->
        <div>
          <span class="text-xs text-gray-500 uppercase tracking-wider block mb-2">Light Cone</span>
          <button
            @click="showLightConeSelector = !showLightConeSelector"
            class="lc-selector-btn"
            :class="{ 'has-lc': currentInvestment?.lightConeId }"
            title="Click to select light cone"
          >
            <div class="flex items-center justify-between">
              <span class="truncate">
                {{ currentInvestment?.lightConeId ? lightConeData.find(lc => lc.id === currentInvestment.lightConeId)?.name || 'Unknown' : 'Select Light Cone...' }}
              </span>
              <span class="text-xs opacity-60 ml-2">{{ showLightConeSelector ? '▲' : '▼' }}</span>
            </div>
            <div v-if="currentInvestment?.lightConeId" class="text-xs text-gray-400 mt-0.5">
              S{{ currentInvestment?.lightConeSuperimposition || 1 }}
            </div>
          </button>
        </div>
      </div>

      <!-- Tier Display + Progress Ring Row -->
      <div class="tier-display-row">
        <!-- Tier Badge - The Hero Element -->
        <div class="tier-badge-container" :class="tierColorClass">
          <!-- Animated background glow -->
          <div class="tier-glow" :class="tierColorClass"></div>

          <!-- Main tier content -->
          <div class="tier-badge-inner">
            <div class="tier-label">YOUR TIER</div>
            <div class="tier-value" :class="tierColorClass">{{ adjustedTier }}</div>

            <!-- Progress to next tier -->
            <div v-if="nextTierInfo" class="tier-progress-section">
              <div class="tier-progress-bar">
                <div
                  class="tier-progress-fill"
                  :class="tierColorClass"
                  :style="{ width: `${Math.max(2, nextTierInfo.progressPercent)}%` }"
                ></div>
              </div>
              <div class="tier-progress-text">
                <span class="tier-pts-needed">{{ nextTierInfo.pointsNeeded.toFixed(1) }} pts</span>
                <span class="tier-arrow">→</span>
                <span class="tier-next" :class="nextTierColorClass">{{ nextTierInfo.nextTier }}</span>
              </div>
            </div>
            <div v-else class="tier-max-reached">
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
              </svg>
              <span>Max tier reached</span>
            </div>
          </div>
        </div>

        <!-- Circular Progress Ring -->
        <div class="progress-ring-container">
          <div class="progress-ring">
            <svg class="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <!-- Background circle -->
              <circle
                cx="50" cy="50" r="42"
                fill="none"
                stroke="currentColor"
                stroke-width="6"
                class="text-gray-800"
              />
              <!-- Track circle -->
              <circle
                cx="50" cy="50" r="42"
                fill="none"
                stroke="currentColor"
                stroke-width="6"
                class="text-gray-700"
              />
              <!-- Progress circle -->
              <circle
                cx="50" cy="50" r="42"
                fill="none"
                stroke="url(#tierPtsGradient)"
                stroke-width="6"
                stroke-linecap="round"
                :stroke-dasharray="`${(totalPowerGained / (totalPowerGained + totalPowerAvailable + 0.01)) * 264} 264`"
                class="progress-ring-fill"
              />
              <defs>
                <linearGradient id="tierPtsGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#10b981" />
                  <stop offset="50%" stop-color="#34d399" />
                  <stop offset="100%" stop-color="#6ee7b7" />
                </linearGradient>
              </defs>
            </svg>
            <!-- Center text -->
            <div class="progress-ring-center">
              <span class="progress-ring-value">+{{ totalPowerGained.toFixed(1) }}</span>
              <span class="progress-ring-label">tier pts</span>
            </div>
          </div>

          <!-- Available points -->
          <div v-if="totalPowerAvailable > 0.1" class="progress-ring-available">
            <span class="available-value">+{{ totalPowerAvailable.toFixed(1) }}</span>
            <span class="available-label">available</span>
          </div>
        </div>
      </div>

      <!-- Investment Priority & Minimum Viable -->
      <div v-if="character.investment?.investmentPriority || character.investment?.minimumViable" class="investment-meta">
        <div v-if="character.investment?.investmentPriority" class="meta-item">
          <span class="meta-label">Priority</span>
          <span class="meta-value priority">{{ character.investment?.investmentPriority }}</span>
        </div>
        <div v-if="character.investment?.minimumViable" class="meta-item">
          <span class="meta-label">Minimum</span>
          <span class="meta-value minimum">{{ character.investment?.minimumViable }}</span>
        </div>
      </div>
    </div>

    <!-- Light Cone Selector Dropdown -->
    <Transition
      enter-active-class="transition-all duration-200"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-200"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div v-if="showLightConeSelector" ref="lightConeSelectorRef" class="p-6 bg-gray-800/50 rounded-lg border border-purple-500/30">
        <h3 class="text-lg font-bold text-gray-100 mb-4">Select Light Cone</h3>

        <div class="space-y-2 max-h-96 overflow-y-auto">
          <!-- None Option -->
          <button
            @click="handleLightConeSelect(undefined)"
            class="w-full p-3 rounded-lg text-left transition-all duration-200 border"
            :class="!currentInvestment?.lightConeId
              ? 'bg-gray-600/30 border-gray-500/50 text-gray-300'
              : 'bg-gray-800/30 border-gray-700/30 text-gray-400 hover:bg-gray-800/50 hover:border-gray-600/50'"
          >
            <span class="font-medium">No Light Cone</span>
          </button>

          <!-- Light Cone Options -->
          <button
            v-for="lc in lightConeData"
            :key="lc.id"
            @click="handleLightConeSelect(lc.id)"
            class="w-full p-3 rounded-lg text-left transition-all duration-200 border group"
            :class="selectedLightConeForSuper === lc.id
              ? 'bg-purple-500/30 border-purple-500/50 text-purple-300'
              : lc.isCurrent
              ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
              : 'bg-gray-800/30 border-gray-700/30 text-gray-300 hover:bg-gray-800/50 hover:border-gray-600/50'"
          >
            <div class="flex items-center gap-4">
              <!-- Light Cone Image -->
              <img
                :src="`/light-cones/${lc.id}.webp`"
                :alt="lc.name"
                class="w-24 h-24 object-contain flex-shrink-0"
                @error="($event.target as HTMLImageElement).style.display = 'none'"
              />
              <div class="flex-1 min-w-0">
                <span class="font-medium text-base block">{{ lc.name }}</span>
                <div class="flex items-center gap-2 flex-wrap mt-1">
                  <span class="text-xs text-gray-400">{{ '★'.repeat(lc.rarity) }}</span>
                  <span v-if="lc.isSignature" class="px-2 py-0.5 bg-orange-500/20 text-orange-400 text-xs rounded-full">
                    Signature
                  </span>
                  <span class="px-2 py-0.5 bg-gray-700/50 text-gray-400 text-xs rounded-full">
                    {{ lc.sourceLabel }}
                  </span>
                </div>
              </div>
            </div>
          </button>
        </div>

        <!-- Superimposition Selector (shown after selecting LC) -->
        <div v-if="selectedLightConeForSuper" ref="superimpositionSelectorRef" class="mt-4 pt-4 border-t border-gray-700/50">
          <div class="mb-3">
            <span class="text-sm font-semibold text-purple-300">
              {{ lightConeData.find(lc => lc.id === selectedLightConeForSuper)?.name }}
            </span>
          </div>
          <span class="text-sm text-gray-400 block mb-2">Select Superimposition:</span>
          <div class="flex gap-2">
            <button
              v-for="s in [1, 2, 3, 4, 5]"
              :key="s"
              @click="handleSuperimpositionSelect(s as 1 | 2 | 3 | 4 | 5)"
              class="flex-1 px-3 py-2 rounded-lg font-bold text-sm transition-all duration-200 border hover:bg-purple-500/20 hover:border-purple-500/50 bg-gray-700/30 text-gray-400 border-gray-600/30"
              :title="`Set to S${s}`"
            >
              S{{ s }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Eidolon Tier Contribution Summary -->
    <div class="p-6 bg-gradient-to-br from-green-900/20 to-gray-900/20 rounded-lg border border-green-500/30">
      <h3 class="text-sm font-semibold text-green-400/80 uppercase tracking-wide mb-4">Eidolon Contribution</h3>

      <div class="flex items-center justify-between">
        <!-- Contribution from owned eidolons -->
        <div>
          <div class="text-4xl font-bold text-green-400">
            +{{ eidolonPowerGainedDisplay.toFixed(1) }}
          </div>
          <div class="text-xs text-gray-400 mt-1 whitespace-normal">tier pts from eidolons</div>
        </div>

        <!-- Available (if any unowned) -->
        <div v-if="eidolonPowerAvailableDisplay > 0" class="text-right">
          <div class="text-lg text-orange-400/70">
            +{{ eidolonPowerAvailableDisplay.toFixed(1) }}
          </div>
          <div class="text-xs text-gray-500">still available</div>
        </div>
      </div>
    </div>

    <!-- Eidolon Breakdown -->
    <div class="p-6 bg-gray-800/30 rounded-lg border border-gray-700/50">
      <h3 class="text-lg font-bold text-gray-100 mb-4">Eidolon Breakdown</h3>

      <div class="space-y-3">
        <div
          v-for="eid in eidolonData"
          :key="eid.level"
          class="p-4 rounded-lg border transition-all"
          :class="eid.isOwned ? 'bg-green-500/10 border-green-500/30' : 'bg-gray-800/50 border-gray-700/30'"
        >
          <!-- Top Row: E# Badge + Tier Points (side by side) -->
          <div class="flex items-center gap-3 mb-3">
            <!-- Eidolon Badge -->
            <div
              class="w-12 h-12 rounded-lg flex items-center justify-center font-bold text-lg flex-shrink-0"
              :class="eid.isOwned ? 'bg-green-500/20 text-green-400' : 'bg-gray-700/50 text-gray-400'"
            >
              E{{ eid.level }}
            </div>

            <!-- Tier Points Badge -->
            <div class="flex items-center gap-2 flex-wrap">
              <template v-if="eid.isOwned">
                <span class="px-2 py-1 rounded-md text-xs font-bold bg-green-500/20 text-green-400">
                  +{{ eid.impactValue.toFixed(1) }} pts
                </span>
                <span class="text-xs text-green-500">{{ eid.impactLabel }}</span>
              </template>
              <template v-else>
                <span class="px-2 py-1 rounded-md text-xs font-bold bg-gray-700/50" :class="eid.impactColor">
                  +{{ eid.impactValue.toFixed(1) }} pts
                </span>
                <span class="text-xs text-gray-500">{{ eid.impactLabel }}</span>
              </template>

              <!-- Community stats inline -->
              <div v-if="getEidolonCommunityStats(eid.level)" class="flex items-center gap-1">
                <div
                  v-if="(getEidolonCommunityStats(eid.level)?.owned?.percentage ?? 0) > 0"
                  class="community-stat-inline owned"
                  :title="`${getEidolonCommunityStats(eid.level)?.owned?.count?.toLocaleString() ?? 0} owners have E${eid.level}`"
                >
                  <span class="stat-value">{{ getEidolonCommunityStats(eid.level)?.owned?.percentage ?? 0 }}%</span>
                  <span class="stat-label">own</span>
                </div>
                <div
                  v-if="(getEidolonCommunityStats(eid.level)?.planning?.percentage ?? 0) > 0"
                  class="community-stat-inline planning"
                  :title="`${getEidolonCommunityStats(eid.level)?.planning?.count?.toLocaleString() ?? 0} planning for E${eid.level}`"
                >
                  <span class="stat-value">{{ getEidolonCommunityStats(eid.level)?.planning?.percentage ?? 0 }}%</span>
                  <span class="stat-label">plan</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Description (full width) -->
          <p class="text-sm text-gray-300 leading-relaxed">{{ eid.description }}</p>

          <!-- Synergy Boosts -->
          <div v-if="eid.synergyBoosts.length > 0" class="mt-3 space-y-2">
            <div class="text-xs font-semibold text-amber-400/80 uppercase tracking-wide flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
              </svg>
              Synergy Boosts
            </div>
            <div
              v-for="boost in eid.synergyBoosts"
              :key="boost.characterId"
              class="pl-3 border-l-2 border-amber-500/30"
            >
              <div class="flex items-center gap-2 min-w-0">
                <span class="font-medium text-amber-300 text-sm truncate flex-1 min-w-0">{{ boost.characterName }}</span>
                <span
                  class="px-1.5 py-0.5 rounded text-xs font-bold flex-shrink-0"
                  :class="boost.isPositive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'"
                >
                  {{ boost.isPositive ? '+' : '' }}{{ boost.modifier }}
                </span>
              </div>
              <p class="text-xs text-gray-400 mt-0.5">{{ boost.reason }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Light Cone Tier Contribution Summary -->
    <div class="p-6 bg-gradient-to-br from-purple-900/20 to-gray-900/20 rounded-lg border border-purple-500/30">
      <h3 class="text-sm font-semibold text-purple-400/80 uppercase tracking-wide mb-2">Light Cone Contribution</h3>

      <p class="text-sm text-gray-300 mb-4">
        {{ currentInvestment?.lightConeId
          ? `${lightConeData.find(lc => lc.id === currentInvestment.lightConeId)?.name || 'Current LC'} S${currentInvestment?.lightConeSuperimposition || 1}`
          : 'No light cone equipped' }}
      </p>

      <div class="flex items-center justify-between">
        <!-- Contribution from LC -->
        <div>
          <div class="text-4xl font-bold" :class="lightConePowerGainedDisplay > 0 ? 'text-purple-400' : 'text-gray-500'">
            +{{ lightConePowerGainedDisplay.toFixed(1) }}
          </div>
          <div class="text-xs text-gray-400 mt-1 whitespace-normal">tier pts from light cone</div>
        </div>

        <!-- Room to improve (if not at max) -->
        <div v-if="lightConePowerGainedDisplay < maxLCPower" class="text-right">
          <div class="text-lg text-purple-400/70">
            +{{ (maxLCPower - lightConePowerGainedDisplay).toFixed(1) }}
          </div>
          <div class="text-xs text-gray-500">with signature S5</div>
        </div>
      </div>
    </div>

    <!-- Light Cone Comparison -->
    <div class="p-6 bg-gray-800/30 rounded-lg border border-gray-700/50">
      <h3 class="text-lg font-bold text-gray-100 mb-4">Light Cone Options</h3>

      <div class="space-y-3">
        <div
          v-for="lc in lightConeData"
          :key="lc.id"
          class="p-4 rounded-lg border transition-all"
          :class="lc.isCurrent ? 'bg-purple-500/10 border-purple-500/30' : 'bg-gray-800/50 border-gray-700/30'"
        >
          <!-- Header: Image + Name/Stats stacked -->
          <div class="flex gap-3 mb-3">
            <!-- Light Cone Image -->
            <img
              :src="`/light-cones/${lc.id}.webp`"
              :alt="lc.name"
              class="w-20 h-20 object-contain flex-shrink-0"
              @error="($event.target as HTMLImageElement).style.display = 'none'"
            />

            <!-- Name + S1/S5 (stacked vertically) -->
            <div class="flex-1 min-w-0">
              <h4 class="font-semibold text-gray-100 text-base">{{ lc.name }}</h4>

              <!-- Tags row -->
              <div class="flex items-center gap-2 flex-wrap mt-1">
                <span class="text-xs text-gray-400">{{ '★'.repeat(lc.rarity) }}</span>
                <span
                  v-if="lc.isSignature"
                  class="px-1.5 py-0.5 bg-orange-500/20 text-orange-400 text-xs rounded-full"
                >
                  Signature
                </span>
                <span class="px-1.5 py-0.5 bg-gray-700/50 text-gray-400 text-xs rounded-full">
                  {{ lc.sourceLabel }}
                </span>
              </div>

              <!-- S1/S5 tier points -->
              <div class="flex items-center gap-3 mt-2 flex-wrap">
                <span class="text-xs">
                  <span class="text-gray-500">S1:</span>
                  <span class="text-purple-400 font-medium ml-1">+{{ lc.s1Power.toFixed(1) }}</span>
                </span>
                <span class="text-xs">
                  <span class="text-gray-500">S5:</span>
                  <span class="font-medium ml-1" :class="lc.isSignature ? 'text-green-400' : 'text-purple-400'">+{{ lc.s5Power.toFixed(1) }}</span>
                  <span v-if="lc.isSignature" class="text-green-500 ml-1">(best)</span>
                </span>
              </div>

              <!-- Community stats -->
              <div v-if="getLcCommunityStats(lc.id)" class="flex items-center gap-1 mt-1.5 flex-wrap">
                <div
                  v-if="(getLcCommunityStats(lc.id)?.owned?.percentage ?? 0) > 0"
                  class="community-stat-inline owned"
                  :title="`${getLcCommunityStats(lc.id)?.owned?.count?.toLocaleString() ?? 0} owners use this LC`"
                >
                  <span class="stat-value">{{ getLcCommunityStats(lc.id)?.owned?.percentage ?? 0 }}%</span>
                  <span class="stat-label">own</span>
                  <span class="stat-divider">·</span>
                  <span class="stat-label">avg</span>
                  <span class="stat-value">S{{ getLcCommunityStats(lc.id)?.owned?.avgSuperimposition?.toFixed(1) ?? 0 }}</span>
                </div>
                <div
                  v-if="(getLcCommunityStats(lc.id)?.planning?.percentage ?? 0) > 0"
                  class="community-stat-inline planning"
                  :title="`${getLcCommunityStats(lc.id)?.planning?.count?.toLocaleString() ?? 0} planning this LC`"
                >
                  <span class="stat-value">{{ getLcCommunityStats(lc.id)?.planning?.percentage ?? 0 }}%</span>
                  <span class="stat-label">plan</span>
                  <span class="stat-divider">·</span>
                  <span class="stat-label">avg</span>
                  <span class="stat-value">S{{ getLcCommunityStats(lc.id)?.planning?.avgSuperimposition?.toFixed(1) ?? 0 }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Notes (full width) -->
          <p class="text-sm text-gray-300 leading-relaxed">{{ lc.notes }}</p>

            <!-- Playstyle Notes -->
            <p v-if="lc.playstyleNotes" class="text-sm text-purple-300/80 italic">
              ⚠️ {{ lc.playstyleNotes }}
            </p>

            <!-- Synergy Boosts -->
            <div v-if="lc.synergyBoosts.length > 0" class="mt-3 space-y-2">
              <div class="text-xs font-semibold text-amber-400/80 uppercase tracking-wide flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                </svg>
                Synergy Boosts
              </div>
              <div
                v-for="boost in lc.synergyBoosts"
                :key="boost.characterId"
                class="pl-3 border-l-2 border-amber-500/30"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <span class="font-medium text-amber-300 text-sm truncate flex-1 min-w-0">{{ boost.characterName }}</span>
                  <span
                    class="px-1.5 py-0.5 rounded text-xs font-bold"
                    :class="boost.isPositive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'"
                  >
                    {{ boost.isPositive ? '+' : '' }}{{ boost.modifier }}
                  </span>
                </div>
                <p class="text-xs text-gray-400 mt-0.5">{{ boost.reason }}</p>
              </div>
            </div>
        </div>
      </div>
    </div>

    <!-- Feedback Modal -->
    <ContextualFeedbackModal
      :is-open="showFeedbackModal"
      feedback-type="investment-wrong"
      :context="feedbackContext"
      @close="closeFeedbackModal"
    />
  </div>
</template>

<style scoped>
/* ==========================================
   INVESTMENT SUMMARY SECTION
   ========================================== */

.investment-summary {
  padding: 1.5rem;
  background: linear-gradient(135deg, rgba(17, 24, 39, 0.8) 0%, rgba(10, 15, 28, 0.9) 100%);
  border-radius: 1rem;
  border: 1px solid rgba(75, 85, 99, 0.3);
  position: relative;
  overflow: hidden;
}

.investment-summary::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
}

/* ==========================================
   EIDOLON BUTTONS
   ========================================== */

.eidolon-btn {
  flex: 1;
  padding: 0.5rem 0.25rem;
  border-radius: 0.5rem;
  font-weight: 700;
  font-size: 0.75rem;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  background: rgba(55, 65, 81, 0.3);
  color: rgba(156, 163, 175, 0.8);
  border: 1px solid rgba(75, 85, 99, 0.3);
}

.eidolon-btn:hover {
  background: rgba(75, 85, 99, 0.4);
  border-color: rgba(107, 114, 128, 0.5);
  transform: translateY(-1px);
}

.eidolon-btn.active {
  background: linear-gradient(135deg, rgba(251, 146, 60, 0.25) 0%, rgba(249, 115, 22, 0.2) 100%);
  color: #fb923c;
  border: 2px solid rgba(251, 146, 60, 0.5);
  box-shadow: 0 0 20px rgba(251, 146, 60, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

/* ==========================================
   LIGHT CONE SELECTOR
   ========================================== */

.lc-selector-btn {
  width: 100%;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  text-align: left;
  transition: all 0.2s;
  cursor: pointer;
  background: rgba(55, 65, 81, 0.3);
  color: rgba(156, 163, 175, 0.8);
  border: 1px solid rgba(75, 85, 99, 0.3);
  font-size: 0.875rem;
}

.lc-selector-btn:hover {
  background: rgba(75, 85, 99, 0.4);
  border-color: rgba(107, 114, 128, 0.5);
}

.lc-selector-btn.has-lc {
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(139, 92, 246, 0.1) 100%);
  color: #c4b5fd;
  border-color: rgba(168, 85, 247, 0.4);
}

/* ==========================================
   TIER DISPLAY ROW
   ========================================== */

.tier-display-row {
  display: flex;
  gap: 1.5rem;
  align-items: stretch;
  margin-top: 0.5rem;
}

@media (max-width: 500px) {
  .tier-display-row {
    flex-direction: column;
    gap: 1rem;
  }
}

/* ==========================================
   TIER BADGE - THE HERO ELEMENT
   ========================================== */

.tier-badge-container {
  flex: 1;
  min-width: 0;
  position: relative;
  border-radius: 0.875rem;
  padding: 1.25rem;
  background: linear-gradient(135deg, rgba(17, 24, 39, 0.9) 0%, rgba(10, 15, 28, 0.95) 100%);
  border: 1px solid rgba(75, 85, 99, 0.4);
  overflow: hidden;
}

.tier-glow {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  opacity: 0.15;
  pointer-events: none;
  animation: tier-glow-pulse 4s ease-in-out infinite;
}

@keyframes tier-glow-pulse {
  0%, 100% { opacity: 0.1; transform: scale(1); }
  50% { opacity: 0.2; transform: scale(1.05); }
}

/* Tier color variants for glow */
.tier-glow.tier-legendary { background: radial-gradient(circle, #ef4444 0%, transparent 70%); }
.tier-glow.tier-mythic { background: radial-gradient(circle, #f97316 0%, transparent 70%); }
.tier-glow.tier-meta { background: radial-gradient(circle, #eab308 0%, transparent 70%); }
.tier-glow.tier-excellent { background: radial-gradient(circle, #84cc16 0%, transparent 70%); }
.tier-glow.tier-great { background: radial-gradient(circle, #22c55e 0%, transparent 70%); }
.tier-glow.tier-good { background: radial-gradient(circle, #14b8a6 0%, transparent 70%); }
.tier-glow.tier-decent { background: radial-gradient(circle, #3b82f6 0%, transparent 70%); }
.tier-glow.tier-low { background: radial-gradient(circle, #6b7280 0%, transparent 70%); }

.tier-badge-inner {
  position: relative;
  z-index: 1;
}

.tier-label {
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: rgba(156, 163, 175, 0.7);
  margin-bottom: 0.25rem;
}

.tier-value {
  font-family: var(--font-display, 'Orbitron', system-ui);
  font-size: 2.5rem;
  font-weight: 900;
  line-height: 1;
  letter-spacing: -0.02em;
  text-shadow: 0 0 30px currentColor;
  margin-bottom: 0.75rem;
}

/* Tier color variants for value */
.tier-value.tier-legendary { color: #ef4444; text-shadow: 0 0 40px rgba(239, 68, 68, 0.6); }
.tier-value.tier-mythic { color: #f97316; text-shadow: 0 0 40px rgba(249, 115, 22, 0.6); }
.tier-value.tier-meta { color: #eab308; text-shadow: 0 0 40px rgba(234, 179, 8, 0.5); }
.tier-value.tier-excellent { color: #a3e635; text-shadow: 0 0 40px rgba(163, 230, 53, 0.5); }
.tier-value.tier-great { color: #4ade80; text-shadow: 0 0 40px rgba(74, 222, 128, 0.4); }
.tier-value.tier-good { color: #2dd4bf; text-shadow: 0 0 40px rgba(45, 212, 191, 0.4); }
.tier-value.tier-decent { color: #60a5fa; text-shadow: 0 0 40px rgba(96, 165, 250, 0.4); }
.tier-value.tier-low { color: #9ca3af; text-shadow: none; }

/* ==========================================
   TIER PROGRESS BAR
   ========================================== */

.tier-progress-section {
  margin-top: 0.5rem;
}

.tier-progress-bar {
  height: 4px;
  background: rgba(55, 65, 81, 0.5);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 0.5rem;
}

.tier-progress-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.tier-progress-fill.tier-legendary { background: linear-gradient(90deg, #ef4444, #f87171); }
.tier-progress-fill.tier-mythic { background: linear-gradient(90deg, #f97316, #fb923c); }
.tier-progress-fill.tier-meta { background: linear-gradient(90deg, #eab308, #facc15); }
.tier-progress-fill.tier-excellent { background: linear-gradient(90deg, #84cc16, #a3e635); }
.tier-progress-fill.tier-great { background: linear-gradient(90deg, #22c55e, #4ade80); }
.tier-progress-fill.tier-good { background: linear-gradient(90deg, #14b8a6, #2dd4bf); }
.tier-progress-fill.tier-decent { background: linear-gradient(90deg, #3b82f6, #60a5fa); }
.tier-progress-fill.tier-low { background: linear-gradient(90deg, #6b7280, #9ca3af); }

.tier-progress-text {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
}

.tier-pts-needed {
  color: rgba(156, 163, 175, 0.8);
  font-weight: 500;
}

.tier-arrow {
  color: rgba(107, 114, 128, 0.6);
}

.tier-next {
  font-weight: 700;
}

.tier-next.tier-legendary { color: #ef4444; }
.tier-next.tier-mythic { color: #f97316; }
.tier-next.tier-meta { color: #eab308; }
.tier-next.tier-excellent { color: #a3e635; }
.tier-next.tier-great { color: #4ade80; }
.tier-next.tier-good { color: #2dd4bf; }
.tier-next.tier-decent { color: #60a5fa; }
.tier-next.tier-low { color: #9ca3af; }

.tier-max-reached {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  color: #4ade80;
  font-size: 0.75rem;
  font-weight: 600;
}

/* ==========================================
   PROGRESS RING
   ========================================== */

.progress-ring-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 130px;
}

.progress-ring {
  position: relative;
  width: 100px;
  height: 100px;
}

.progress-ring-fill {
  transition: stroke-dasharray 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  filter: drop-shadow(0 0 6px rgba(16, 185, 129, 0.4));
}

.progress-ring-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.progress-ring-value {
  font-family: var(--font-display, 'Orbitron', system-ui);
  font-size: 1.25rem;
  font-weight: 700;
  color: #4ade80;
  line-height: 1;
}

.progress-ring-label {
  font-size: 0.625rem;
  color: rgba(156, 163, 175, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 0.125rem;
}

.progress-ring-available {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-top: 0.5rem;
}

.available-value {
  font-size: 0.8125rem;
  font-weight: 600;
  color: rgba(251, 146, 60, 0.8);
}

.available-label {
  font-size: 0.6875rem;
  color: rgba(107, 114, 128, 0.7);
}

/* ==========================================
   INVESTMENT META (Priority & Minimum)
   ========================================== */

.investment-meta {
  display: flex;
  gap: 1.5rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(75, 85, 99, 0.3);
  flex-wrap: wrap;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.meta-label {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(107, 114, 128, 0.7);
}

.meta-value {
  font-size: 0.8125rem;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
}

.meta-value.priority {
  color: #fb923c;
}

.meta-value.minimum {
  color: #4ade80;
}

/* ==========================================
   COMMUNITY STATS
   ========================================== */

.community-stats-row {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-wrap: wrap;
}

.community-stat-inline {
  display: flex;
  align-items: center;
  gap: 0.1875rem;
  padding: 0.1875rem 0.375rem;
  border-radius: 9999px;
  font-size: 0.5625rem;
  transition: all 0.2s;
}

.community-stat-inline.owned {
  background: rgba(249, 147, 7, 0.1);
  border: 1px solid rgba(249, 147, 7, 0.25);
}

.community-stat-inline.owned .stat-value {
  color: rgba(249, 147, 7, 0.9);
}

.community-stat-inline.owned .stat-label {
  color: rgba(249, 147, 7, 0.6);
}

.community-stat-inline.planning {
  background: rgba(168, 85, 247, 0.1);
  border: 1px solid rgba(168, 85, 247, 0.25);
}

.community-stat-inline.planning .stat-value {
  color: rgba(168, 85, 247, 0.9);
}

.community-stat-inline.planning .stat-label {
  color: rgba(168, 85, 247, 0.6);
}

.community-stat-inline:hover {
  filter: brightness(1.1);
}

.community-stat-inline .stat-value {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-weight: 600;
  font-size: 0.5625rem;
}

.community-stat-inline .stat-label {
  font-size: 0.5625rem;
}

.community-stat-inline .stat-divider {
  opacity: 0.3;
  margin: 0 0.0625rem;
}
</style>
