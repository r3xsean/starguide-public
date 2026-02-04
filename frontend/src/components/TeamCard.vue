<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Character, BestTeam, OwnershipStatus, TierRating, GranularRating, UserCharacterInvestment } from '../types';
import type { GeneratedTeam, ModeTeamRating, GameMode } from '../utils/teamGenerator';
import { calculateAllModeRatings, getTeamRankingScore, getRankingScoreRating } from '../utils/teamGenerator';
import { getCharacterById } from '../data';
import { getTeammatesForComposition } from '../utils/characterUtils';
import { getEffectiveScore, scoreToTier } from '../utils/scaleConverters';
import { getSignatureSuperimposition } from '../utils/investmentUtils';
import CharacterCard from './CharacterCard.vue';
import FeedbackButton from './FeedbackButton.vue';
import ContextualFeedbackModal from './ContextualFeedbackModal.vue';
import type { FeedbackContext } from './ContextualFeedbackModal.vue';

// ==================
// PROPS - Accepts either BestTeam or GeneratedTeam
// ==================

interface Props {
  // For BestTeam (pre-built teams from character data)
  bestTeam?: BestTeam;
  // For GeneratedTeam (auto-generated teams)
  generatedTeam?: GeneratedTeam;
  // Common props
  getOwnership: (id: string) => OwnershipStatus;
  getInvestment?: (id: string) => UserCharacterInvestment | undefined;
  focalCharacterId?: string;
  showModeRatings?: boolean;
  // Compact mode for side-by-side layout
  compact?: boolean;
  // Locked state (for Best Teams view)
  locked?: boolean;
  // Show lock button (only in Best Teams view)
  showLockButton?: boolean;
  // Favorited state (for Best Teams view)
  favorited?: boolean;
  // Show favorite button (only in Best Teams view)
  showFavoriteButton?: boolean;
  // Game mode for overall score-based rating (optional - uses synergy rating if not provided)
  gameMode?: GameMode;
  // Composition ID and name (for showing which composition this team belongs to)
  compositionId?: string;
  compositionName?: string;
}

const props = withDefaults(defineProps<Props>(), {
  focalCharacterId: '',
  showModeRatings: true,
  compact: false,
  locked: false,
  showLockButton: false,
  favorited: false,
  showFavoriteButton: false,
});

const emit = defineEmits<{
  lockToggle: [];
  favoriteToggle: [];
}>();

// Handle lock button click (prevent propagation to card click)
const handleLockClick = (event: Event) => {
  event.stopPropagation();
  emit('lockToggle');
};

// Handle favorite button click (prevent propagation to card click)
const handleFavoriteClick = (event: Event) => {
  event.stopPropagation();
  emit('favoriteToggle');
};

// ==================
// NORMALIZE DATA - Convert both types to common format
// ==================

// Get team characters (resolving IDs for BestTeam)
const teamCharacters = computed((): Character[] => {
  if (props.generatedTeam) {
    return props.generatedTeam.characters;
  }
  if (props.bestTeam) {
    return props.bestTeam.characters
      .map(id => getCharacterById(id))
      .filter((c): c is Character => c !== undefined);
  }
  return [];
});

// Get team name
const teamName = computed(() => {
  if (props.generatedTeam) {
    return props.generatedTeam.name || `${props.generatedTeam.structure} Team`;
  }
  if (props.bestTeam) {
    return props.bestTeam.name;
  }
  return 'Team';
});

// Get team rating (S/A/B/C)
// When gameMode is provided, uses overall ranking score (tier + synergy + bonus)
// Otherwise falls back to synergy-only rating
const teamRating = computed(() => {
  // Use overall ranking score when gameMode is provided
  if (props.gameMode && props.generatedTeam) {
    const score = getTeamRankingScore(props.generatedTeam, props.gameMode);
    return getRankingScoreRating(score);
  }

  // Fall back to synergy-based rating
  if (props.generatedTeam) {
    return props.generatedTeam.rating;
  }
  if (props.bestTeam) {
    return props.bestTeam.rating;
  }
  return 'C';
});

// Get team structure
const teamStructure = computed(() => {
  if (props.generatedTeam) {
    return props.generatedTeam.structure;
  }
  if (props.bestTeam) {
    return props.bestTeam.structure;
  }
  return 'hypercarry';
});


// Get mode ratings (recalculate with investment ONLY for generated teams, not pre-built teams)
const modeRatings = computed((): ModeTeamRating[] => {
  if (teamCharacters.value.length === 4) {
    // Only use investment for generated teams - pre-built teams should use base tier
    const investmentGetter = props.generatedTeam && props.getInvestment
      ? (id: string) => props.getInvestment!(id) ?? undefined
      : undefined;
    return calculateAllModeRatings(teamCharacters.value, investmentGetter);
  }
  return [];
});

// Get synergy rating for a character in the team (returns granular rating)
const getSynergyRating = (charId: string): GranularRating | undefined => {
  // For GeneratedTeam, get from contributions (already granular)
  if (props.generatedTeam?.contributions) {
    const contrib = props.generatedTeam.contributions.find(c => c.characterId === charId);
    return contrib?.rating;
  }

  // For BestTeam, look up from the focal character's teammates data
  // These are source ratings (S/A/B/C/D), which are valid GranularRatings
  if (props.bestTeam && props.focalCharacterId) {
    const focalChar = getCharacterById(props.focalCharacterId);
    if (focalChar) {
      // Use composition-aware teammate lookup with compositionId
      const teammates = getTeammatesForComposition(focalChar, props.compositionId);
      // Search all teammate categories
      const allTeammates = [
        ...(teammates.amplifiers || []),
        ...(teammates.sustains || []),
        ...(teammates.subDPS || []),
        ...(teammates.dps || []),
      ];
      const teammate = allTeammates.find(t => t.id === charId);
      return teammate?.rating; // TeammateRating is a subset of GranularRating
    }
  }

  return undefined;
};

// Get base rating letter for CSS class (strips +/- modifiers)
const getBaseRating = (rating: string): string => {
  return rating.charAt(0).toLowerCase();
};

// Get eidolon level for display
// For BestTeam: show composition-required eidolons
// For GeneratedTeam: show user's actual eidolons (only if owned and E1+)
const getEidolonLevel = (charId: string): number | undefined => {
  // For BestTeam: look up composition eidolon requirements
  if (props.bestTeam && props.focalCharacterId && props.compositionId) {
    const focalChar = getCharacterById(props.focalCharacterId);
    if (focalChar) {
      const teammates = getTeammatesForComposition(focalChar, props.compositionId);
      const allTeammates = [
        ...(teammates.amplifiers || []),
        ...(teammates.sustains || []),
        ...(teammates.subDPS || []),
        ...(teammates.dps || []),
      ];
      const teammate = allTeammates.find(t => t.id === charId);
      if (teammate?.theirInvestmentModifiers) {
        // Find most significant eidolon requirement
        const mostSignificant = teammate.theirInvestmentModifiers
          .filter((mod: { level: number; modifier: number; reason?: string }) => mod.modifier !== 0)
          .sort((a: { modifier: number }, b: { modifier: number }) => Math.abs(b.modifier) - Math.abs(a.modifier))[0];
        return mostSignificant?.level;
      }
    }
  }

  // For GeneratedTeam: show user's actual eidolons (owned + E1+)
  if (props.generatedTeam && props.getInvestment) {
    const investment = props.getInvestment(charId);
    if (!investment || investment.ownership !== 'owned') return undefined;
    return investment.eidolonLevel > 0 ? investment.eidolonLevel : undefined;
  }

  return undefined;
};

// Get investment-adjusted tier for a character (ONLY for generated teams)
const getAdjustedTier = (charId: string): TierRating | undefined => {
  // Only calculate for generated teams, NOT pre-built teams
  if (!props.generatedTeam || !props.getInvestment || !props.gameMode) return undefined;

  const char = getCharacterById(charId);
  if (!char) return undefined;

  const investment = props.getInvestment(charId);
  if (!investment) return undefined;

  const score = getEffectiveScore(char, props.gameMode, investment);
  return scoreToTier(score);
};

// Get signature LC superimposition (ONLY for generated teams, owned characters)
const getSignatureSuperimpositionLevel = (charId: string): 1 | 2 | 3 | 4 | 5 | undefined => {
  if (!props.generatedTeam || !props.getInvestment) return undefined;

  const investment = props.getInvestment(charId);
  if (!investment || investment.ownership !== 'owned') return undefined;

  const char = getCharacterById(charId);
  if (!char) return undefined;

  return getSignatureSuperimposition(char, investment);
};

// ==================
// OWNERSHIP STATUS
// ==================

const ownershipStatus = computed(() => {
  const owned = teamCharacters.value.filter(c => {
    const status = props.getOwnership(c.id);
    return status === 'owned' || status === 'concept';
  });

  return {
    allOwned: owned.length === teamCharacters.value.length,
    count: owned.length,
    total: teamCharacters.value.length,
    missing: teamCharacters.value.filter(c => props.getOwnership(c.id) === 'none'),
  };
});

// ==================
// STYLING
// ==================

const elementColors: Record<string, string> = {
  Physical: '#c4c4c4',
  Fire: '#f4634e',
  Ice: '#47c7fd',
  Lightning: '#d376f0',
  Wind: '#5fe8b6',
  Quantum: '#625afa',
  Imaginary: '#f3d86b',
};

// Get focal character's element color for glow effects
const focalElementColor = computed(() => {
  const focal = teamCharacters.value.find(c => c.id === props.focalCharacterId) || teamCharacters.value[0];
  return focal ? elementColors[focal.element] || '#f99307' : '#f99307';
});

// Rating configuration - uses base rating letter (S, A, B, C, D) for styling
const ratingConfig = computed(() => {
  const configs: Record<string, { gradient: string; glow: string; label: string; border: string }> = {
    S: {
      gradient: 'linear-gradient(135deg, #ff9500 0%, #ff6b00 100%)',
      glow: 'rgba(255, 149, 0, 0.5)',
      label: 'Premium',
      border: '#ff9500',
    },
    A: {
      gradient: 'linear-gradient(135deg, #a855f7 0%, #8b5cf6 100%)',
      glow: 'rgba(168, 85, 247, 0.4)',
      label: 'Excellent',
      border: '#a855f7',
    },
    B: {
      gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
      glow: 'rgba(59, 130, 246, 0.4)',
      label: 'Good',
      border: '#3b82f6',
    },
    C: {
      gradient: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
      glow: 'rgba(34, 197, 94, 0.3)',
      label: 'Viable',
      border: '#22c55e',
    },
    D: {
      gradient: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
      glow: 'rgba(107, 114, 128, 0.3)',
      label: 'Niche',
      border: '#6b7280',
    },
  };
  const defaultConfig = {
    gradient: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
    glow: 'rgba(34, 197, 94, 0.3)',
    label: 'Viable',
    border: '#22c55e',
  };
  // Get base rating letter (S from S-, A from A+, etc.)
  const baseRating = teamRating.value.charAt(0).toUpperCase();
  return configs[baseRating] || defaultConfig;
});

// Structure label formatting
const structureLabel = computed(() => {
  const labels: Record<string, string> = {
    'hypercarry': 'Hypercarry',
    'dual-carry': 'Dual Carry',
    'triple-carry': 'Triple Carry',
    'super-break': 'Super Break',
    'break-focused': 'Break Focused',
    'dot': 'DoT Stack',
    'follow-up': 'Follow-up',
    'memosprite': 'Memosprite',
  };
  return labels[teamStructure.value] || teamStructure.value;
});

// Tier gradient colors for mode ratings
const tierGradients: Record<TierRating, string> = {
  'T-1': 'linear-gradient(135deg, #ff4500 0%, #ff2200 100%)',
  'T-0.5': 'linear-gradient(135deg, #ff7700 0%, #ff5500 100%)',
  'T0': 'linear-gradient(135deg, #ff9500 0%, #ff6b00 100%)',
  'T0.5': 'linear-gradient(135deg, #ffd000 0%, #ffb800 100%)',
  'T1': 'linear-gradient(135deg, #a855f7 0%, #8b5cf6 100%)',
  'T1.5': 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
  'T2': 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
  'T3': 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
  'T4': 'linear-gradient(135deg, #64748b 0%, #475569 100%)',
  'T5': 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
};

const getTierGradient = (tier: TierRating): string => {
  return tierGradients[tier] || tierGradients['T5'];
};

const modeShortLabels: Record<string, string> = {
  moc: 'MoC',
  pf: 'PF',
  as: 'AS',
};

// ==================
// CONTEXTUAL FEEDBACK (Pre-built teams only)
// ==================

const isHovered = ref(false);
const showFeedbackModal = ref(false);

// Mobile detection for always-visible feedback button
const isMobile = computed(() => {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768 || 'ontouchstart' in window;
});

// Show feedback button only for pre-built teams
const showTeamFeedback = computed(() => {
  return props.bestTeam !== undefined && !props.generatedTeam;
});

const feedbackContext = computed((): FeedbackContext => {
  if (!props.bestTeam) return {};

  const focalChar = props.focalCharacterId
    ? getCharacterById(props.focalCharacterId)
    : undefined;

  return {
    characterId: props.focalCharacterId,
    characterName: focalChar?.name,
    teamName: props.bestTeam.name,
    teamCharacters: props.bestTeam.characters,
    teamRating: props.bestTeam.rating,
  };
});

function handleFeedbackClick() {
  showFeedbackModal.value = true;
}

function closeFeedbackModal() {
  showFeedbackModal.value = false;
}
</script>

<template>
  <div
    class="team-card"
    :class="{
      compact,
      locked,
      favorited,
      'all-owned': ownershipStatus.allOwned,
      [`rating-${getBaseRating(teamRating)}`]: true,
    }"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <!-- Background Effects -->
    <div class="card-bg">
      <div class="bg-base"></div>
      <div v-if="teamRating.startsWith('S') && !compact" class="s-tier-particles">
        <div v-for="i in 6" :key="i" class="particle" :style="{ '--particle-delay': `${i * 0.3}s` }"></div>
      </div>
      <div class="bg-gradient" :style="{ '--focal-color': focalElementColor }"></div>
    </div>

    <!-- Content -->
    <div class="card-content">
      <!-- COMPACT MODE: Minimal with CharacterCard xs -->
      <template v-if="compact">
        <div class="compact-layout">
          <!-- Action Buttons (compact) - only shown in Best Teams view -->
          <div v-if="showFavoriteButton || showLockButton" class="action-buttons action-buttons-compact">
            <button
              v-if="showLockButton"
              class="lock-btn lock-btn-compact"
              :class="{ locked }"
              @click="handleLockClick"
              :title="locked ? 'Unlock team' : 'Lock team'"
            >
              {{ locked ? '🔒' : '🔓' }}
            </button>
            <button
              v-if="showFavoriteButton"
              class="favorite-btn favorite-btn-compact"
              :class="{ favorited }"
              @click="handleFavoriteClick"
              :title="favorited ? 'Remove from favorites' : 'Add to favorites'"
            >
              {{ favorited ? '♥' : '♡' }}
            </button>
          </div>

          <!-- Character cards (xs size) -->
          <div class="compact-portraits">
            <div
              v-for="char in teamCharacters"
              :key="char.id"
              class="compact-char"
              :class="{ focal: char.id === focalCharacterId }"
            >
              <CharacterCard
                :character="char"
                :ownership="getOwnership(char.id)"
                size="xs"
                :show-ownership="false"
                :synergy-rating="getSynergyRating(char.id)"
                :game-mode="gameMode"
              />
            </div>
          </div>

          <!-- Mode Ratings (compact horizontal) -->
          <div v-if="showModeRatings && modeRatings.length > 0" class="compact-mode-ratings">
            <div
              v-for="modeRating in modeRatings"
              :key="modeRating.mode"
              class="compact-mode-item"
              :title="modeRating.label"
            >
              <span class="compact-mode-abbr">{{ modeShortLabels[modeRating.mode] }}</span>
              <span
                class="compact-mode-tier"
                :style="{ background: getTierGradient(modeRating.tier) }"
              >{{ modeRating.tier }}</span>
            </div>
          </div>

        </div>
      </template>

      <!-- FULL MODE: Clean expanded layout with CharacterCards -->
      <template v-else>
        <!-- Header Row -->
        <div class="header-row">
          <!-- Action Buttons (full mode) - only shown in Best Teams view -->
          <div v-if="showFavoriteButton || showLockButton" class="action-buttons action-buttons-full">
            <button
              v-if="showLockButton"
              class="lock-btn lock-btn-full"
              :class="{ locked }"
              @click="handleLockClick"
              :title="locked ? 'Unlock team' : 'Lock team'"
            >
              {{ locked ? '🔒' : '🔓' }}
            </button>
            <button
              v-if="showFavoriteButton"
              class="favorite-btn favorite-btn-full"
              :class="{ favorited }"
              @click="handleFavoriteClick"
              :title="favorited ? 'Remove from favorites' : 'Add to favorites'"
            >
              {{ favorited ? '♥' : '♡' }}
            </button>
          </div>

          <!-- Team Info -->
          <div class="team-info">
            <div class="team-name">{{ teamName }}</div>
            <div class="team-badges">
              <span v-if="compositionName" class="composition-badge" title="Composition">{{ compositionName }}</span>
              <span class="structure-badge">{{ structureLabel }}</span>
            </div>
          </div>

          <!-- Mode Ratings (vertical stack on right) -->
          <div v-if="showModeRatings && modeRatings.length > 0" class="mode-ratings-stack">
            <div
              v-for="modeRating in modeRatings"
              :key="modeRating.mode"
              class="mode-rating-row"
              :title="modeRating.label"
            >
              <span class="mode-abbr">{{ modeShortLabels[modeRating.mode] }}</span>
              <span
                class="mode-tier-badge"
                :style="{ background: getTierGradient(modeRating.tier) }"
              >{{ modeRating.tier }}</span>
            </div>
          </div>

          <!-- Feedback Button (Pre-built teams only) -->
          <FeedbackButton
            v-if="showTeamFeedback && (isHovered || isMobile)"
            class="team-feedback-btn"
            tooltip="Team issue?"
            size="sm"
            @click="handleFeedbackClick"
          />
        </div>

        <!-- Character Formation using CharacterCards -->
        <div class="formation">
          <div
            v-for="char in teamCharacters"
            :key="char.id"
            class="formation-slot"
            :class="{ focal: char.id === focalCharacterId }"
          >
            <CharacterCard
              :character="char"
              :ownership="getOwnership(char.id)"
              size="sm"
              :show-ownership="false"
              :show-tier="true"
              :synergy-rating="getSynergyRating(char.id)"
              :game-mode="gameMode"
              :eidolon="getEidolonLevel(char.id)"
              :signature-superimposition="getSignatureSuperimpositionLevel(char.id)"
              :override-tier="getAdjustedTier(char.id)"
            />
          </div>
        </div>

        <!-- Missing Characters Warning (subtle) -->
        <div v-if="ownershipStatus.missing.length > 0" class="missing-warning">
          <span class="warning-text">
            Missing: {{ ownershipStatus.missing.map(c => c.name).join(', ') }}
          </span>
        </div>
      </template>
    </div>

    <!-- Bottom Border Accent -->
    <div
      class="bottom-accent"
      :style="{ background: `linear-gradient(90deg, transparent, ${ratingConfig.border}, transparent)` }"
    ></div>

    <!-- Feedback Modal -->
    <ContextualFeedbackModal
      :is-open="showFeedbackModal"
      feedback-type="team-issue"
      :context="feedbackContext"
      @close="closeFeedbackModal"
    />
  </div>
</template>

<style scoped>
.team-card {
  position: relative;
  border-radius: 1rem;
  overflow: hidden;
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

/* All owned special state */
.team-card.all-owned {
  border-color: rgba(16, 185, 129, 0.2);
}

.team-card.all-owned::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.02) 0%, transparent 50%);
  pointer-events: none;
}

/* === Background === */
.card-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

.bg-base {
  position: absolute;
  inset: 0;
  background: linear-gradient(145deg, rgba(18, 18, 38, 0.95) 0%, rgba(12, 12, 28, 0.98) 100%);
}

.bg-gradient {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at top left, var(--focal-color, #f99307)08, transparent 50%);
  opacity: 0;
  transition: opacity 0.4s ease;
}

.team-card:hover .bg-gradient {
  opacity: 1;
}

/* S-tier particles */
.s-tier-particles {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.particle {
  position: absolute;
  width: 3px;
  height: 3px;
  background: rgba(255, 149, 0, 0.6);
  border-radius: 50%;
  animation: float-up 4s ease-in-out infinite;
  animation-delay: var(--particle-delay, 0s);
}

.particle:nth-child(1) { left: 10%; top: 80%; }
.particle:nth-child(2) { left: 25%; top: 90%; }
.particle:nth-child(3) { left: 50%; top: 85%; }
.particle:nth-child(4) { left: 70%; top: 88%; }
.particle:nth-child(5) { left: 85%; top: 82%; }
.particle:nth-child(6) { left: 95%; top: 92%; }

@keyframes float-up {
  0% { transform: translateY(0) scale(1); opacity: 0; }
  20% { opacity: 0.6; }
  80% { opacity: 0.6; }
  100% { transform: translateY(-60px) scale(0.5); opacity: 0; }
}

/* === Content === */
.card-content {
  position: relative;
  z-index: 1;
  padding: 0.75rem;
}

@media (min-width: 480px) {
  .card-content {
    padding: 1rem;
  }
}

/* === Header Row === */
.header-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}

@media (min-width: 480px) {
  .header-row {
    gap: 0.75rem;
    margin-bottom: 0.875rem;
    flex-wrap: nowrap;
  }
}

/* Team Info */
.team-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.team-name {
  font-size: 0.8125rem;
  font-weight: 600;
  color: white;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}

@media (min-width: 480px) {
  .team-name {
    font-size: 0.9375rem;
  }
}

.team-badges {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.composition-badge {
  font-size: 0.625rem;
  padding: 0.1875rem 0.5rem;
  background: rgba(139, 92, 246, 0.15);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 0.25rem;
  color: #a78bfa;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  font-weight: 600;
}

.structure-badge {
  font-size: 0.625rem;
  color: rgba(255, 255, 255, 0.45);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

/* Mode Ratings Stack */
.mode-ratings-stack {
  display: flex;
  flex-direction: column;
  gap: 0.1875rem;
  flex-shrink: 0;
}

@media (min-width: 480px) {
  .mode-ratings-stack {
    /* Already column, just ensure consistency */
    flex-wrap: nowrap;
  }
}

.mode-rating-row {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.mode-abbr {
  font-size: 0.5rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.35);
  text-transform: uppercase;
  min-width: 1.25rem;
  text-align: right;
}

@media (min-width: 480px) {
  .mode-abbr {
    width: 1.5rem;
    min-width: auto;
  }
}

.mode-tier-badge {
  font-size: 0.5625rem;
  font-weight: 700;
  color: white;
  padding: 0.0625rem 0.3125rem;
  border-radius: 3px;
  min-width: 1.75rem;
  text-align: center;
}

/* === Formation === */
.formation {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  justify-items: center;
  gap: 0.5rem;
}

@media (min-width: 480px) {
  .formation {
    display: flex;
    justify-content: center;
    gap: 0.625rem;
  }
}

.formation-slot {
  position: relative;
  animation: slot-reveal 0.3s ease-out both;
  animation-delay: var(--slot-delay, 0s);
}

.formation-slot.focal {
  z-index: 2;
}

.formation-slot.focal::before {
  content: '';
  position: absolute;
  inset: -3px;
  border: 2px solid var(--color-stellar-500, #f99307);
  border-radius: 14px;
  opacity: 0.6;
  pointer-events: none;
}

/* Missing Warning */
.missing-warning {
  margin-top: 0.625rem;
  padding-top: 0.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.warning-text {
  font-size: 0.6875rem;
  color: rgba(245, 158, 11, 0.8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* === Bottom Accent === */
.bottom-accent {
  position: absolute;
  bottom: 0;
  left: 15%;
  right: 15%;
  height: 2px;
  opacity: 0;
  transition: opacity 0.3s;
}

.team-card:hover .bottom-accent {
  opacity: 1;
}

/* === Rating-specific left accents === */
.team-card.rating-s {
  border-left: 3px solid #ff9500;
}

.team-card.rating-a {
  border-left: 3px solid #a855f7;
}

.team-card.rating-b {
  border-left: 3px solid #3b82f6;
}

.team-card.rating-c {
  border-left: 3px solid #22c55e;
}

/* ======================================
   COMPACT MODE STYLES - Ultra condensed
   ====================================== */

.team-card.compact {
  border-radius: 0.5rem;
  border-left-width: 2px;
  width: fit-content;
  height: fit-content;
  overflow: visible;
}

.team-card.compact .card-content {
  padding: 0.375rem 0.5rem;
}

.team-card.compact:hover {
  transform: translateX(3px);
}

/* Compact Layout - Tight single row */
.compact-layout {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

/* Character cards in compact mode */
.compact-portraits {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}

/* Compact mode ratings */
.compact-mode-ratings {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  flex-shrink: 0;
  margin-left: 0.25rem;
}

.compact-mode-item {
  display: flex;
  align-items: center;
  gap: 0.1875rem;
}

.compact-mode-abbr {
  font-size: 0.5rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  width: 1.25rem;
  text-align: right;
}

.compact-mode-tier {
  font-family: var(--font-display);
  font-size: 0.5rem;
  font-weight: 700;
  color: white;
  padding: 0.0625rem 0.25rem;
  border-radius: 2px;
  min-width: 1.5rem;
  text-align: center;
}

.compact-char {
  position: relative;
}

.compact-char.focal::after {
  content: '';
  position: absolute;
  inset: -2px;
  border: 1.5px solid var(--color-stellar-500, #f99307);
  border-radius: 8px;
  pointer-events: none;
}

/* ======================================
   LOCK BUTTON STYLES
   ====================================== */

.lock-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.lock-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
  transform: scale(1.05);
}

.lock-btn.locked {
  background: rgba(249, 147, 7, 0.15);
  border-color: rgba(249, 147, 7, 0.4);
}

.lock-btn.locked:hover {
  background: rgba(249, 147, 7, 0.25);
  border-color: rgba(249, 147, 7, 0.6);
}

/* Full mode lock button */
.lock-btn-full {
  width: 2rem;
  height: 2rem;
  font-size: 0.875rem;
  margin-right: 0.5rem;
}

/* Compact mode lock button */
.lock-btn-compact {
  width: 1.5rem;
  height: 1.5rem;
  font-size: 0.6875rem;
}

/* Locked card styling */
.team-card.locked {
  border-color: rgba(249, 147, 7, 0.3);
}

.team-card.locked::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(249, 147, 7, 0.05) 0%, transparent 50%);
  pointer-events: none;
}

/* ======================================
   ACTION BUTTONS CONTAINER
   ====================================== */

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex-shrink: 0;
}

.action-buttons-full {
  margin-right: 0.5rem;
}

.action-buttons-compact {
  /* No extra margin needed */
}

/* ======================================
   FAVORITE BUTTON STYLES
   ====================================== */

.favorite-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.4);
}

.favorite-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
  transform: scale(1.05);
  color: rgba(239, 68, 68, 0.8);
}

.favorite-btn.favorited {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.4);
  color: rgb(239, 68, 68);
}

.favorite-btn.favorited:hover {
  background: rgba(239, 68, 68, 0.25);
  border-color: rgba(239, 68, 68, 0.6);
}

/* Full mode favorite button */
.favorite-btn-full {
  width: 2rem;
  height: 2rem;
  font-size: 1rem;
}

/* Compact mode favorite button */
.favorite-btn-compact {
  width: 1.5rem;
  height: 1.5rem;
  font-size: 0.75rem;
}

/* Favorited card styling */
.team-card.favorited {
  border-color: rgba(239, 68, 68, 0.25);
}

.team-card.favorited::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.03) 0%, transparent 50%);
  pointer-events: none;
  border-radius: inherit;
}

/* When both locked and favorited, favorited takes visual priority */
.team-card.locked.favorited {
  border-color: rgba(239, 68, 68, 0.3);
}

/* ======================================
   FEEDBACK BUTTON
   ====================================== */

.team-feedback-btn {
  flex-shrink: 0;
  margin-left: 0.5rem;
}
</style>
