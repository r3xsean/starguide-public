<script setup lang="ts">
import { ref, computed } from 'vue';
import type { TeammateRating, OwnershipStatus, UserCharacterInvestment } from '../types';
import { getCharacterById } from '../data';
import { getSignatureSuperimposition } from '../utils/investmentUtils';
import CharacterCard from './CharacterCard.vue';
import FeedbackButton from './FeedbackButton.vue';
import ContextualFeedbackModal from './ContextualFeedbackModal.vue';
import type { FeedbackContext } from './ContextualFeedbackModal.vue';

interface Props {
  teammateId: string;
  rating: TeammateRating;
  baseRating?: TeammateRating; // Original rating before synergy boost
  isBoosted?: boolean; // Whether rating was boosted by investment synergy
  reason: string;
  ownership?: OwnershipStatus;
  compact?: boolean;
  theirInvestmentModifiers?: {
    level: 1 | 2 | 3 | 4 | 5 | 6;
    modifier: number;
    reason?: string;
  }[];
  getInvestment?: (id: string) => UserCharacterInvestment | undefined;
  // For contextual feedback
  focalCharacterId?: string;
  focalCharacterName?: string;
}

const props = withDefaults(defineProps<Props>(), {
  ownership: 'none',
  compact: false,
  isBoosted: false,
});

const character = computed(() => getCharacterById(props.teammateId));

// Eidolon level for display
// Shows composition-required eidolons (from theirInvestmentModifiers)
// OR user's actual eidolons (from getInvestment, only if owned and E1+)
const eidolonLevel = computed((): number | undefined => {
  // First, check for composition requirements
  if (props.theirInvestmentModifiers && props.theirInvestmentModifiers.length > 0) {
    const mostSignificant = props.theirInvestmentModifiers
      .filter((mod: { level: number; modifier: number; reason?: string }) => mod.modifier !== 0)
      .sort((a: { modifier: number }, b: { modifier: number }) => Math.abs(b.modifier) - Math.abs(a.modifier))[0];
    if (mostSignificant) return mostSignificant.level;
  }

  // Otherwise, show user's actual eidolons (owned + E1+)
  if (props.getInvestment) {
    const investment = props.getInvestment(props.teammateId);
    if (investment && investment.ownership === 'owned' && investment.eidolonLevel > 0) {
      return investment.eidolonLevel;
    }
  }

  return undefined;
});

// Signature LC superimposition for display (only for user's owned characters)
const signatureSuperimpositionLevel = computed((): 1 | 2 | 3 | 4 | 5 | undefined => {
  if (!props.getInvestment) return undefined;

  const investment = props.getInvestment(props.teammateId);
  if (!investment || investment.ownership !== 'owned') return undefined;

  const char = character.value;
  if (!char) return undefined;

  return getSignatureSuperimposition(char, investment);
});

const ratingConfig = computed(() => {
  const configs: Record<TeammateRating, {
    gradient: string;
    glow: string;
    text: string;
    ring: string;
  }> = {
    'S+': {
      gradient: 'linear-gradient(135deg, #ffd700 0%, #ff9500 50%, #ff6b00 100%)',
      glow: 'rgba(255, 215, 0, 0.6)',
      text: '#fff',
      ring: '#ffd700',
    },
    S: {
      gradient: 'linear-gradient(135deg, #ff9500 0%, #ff6b00 100%)',
      glow: 'rgba(255, 149, 0, 0.5)',
      text: '#fff',
      ring: '#ff9500',
    },
    A: {
      gradient: 'linear-gradient(135deg, #a855f7 0%, #8b5cf6 100%)',
      glow: 'rgba(168, 85, 247, 0.4)',
      text: '#fff',
      ring: '#a855f7',
    },
    B: {
      gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
      glow: 'rgba(59, 130, 246, 0.4)',
      text: '#fff',
      ring: '#3b82f6',
    },
    C: {
      gradient: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
      glow: 'rgba(107, 114, 128, 0.3)',
      text: '#fff',
      ring: '#6b7280',
    },
    D: {
      gradient: 'linear-gradient(135deg, #374151 0%, #1f2937 100%)',
      glow: 'rgba(55, 65, 81, 0.3)',
      text: 'rgba(255,255,255,0.7)',
      ring: '#374151',
    },
  };
  return configs[props.rating];
});

const elementColors: Record<string, string> = {
  Physical: '#c4c4c4',
  Fire: '#f4634e',
  Ice: '#47c7fd',
  Lightning: '#d376f0',
  Wind: '#5fe8b6',
  Quantum: '#625afa',
  Imaginary: '#f3d86b',
};

const roleLabel = computed(() => {
  if (!character.value) return '';
  const role = character.value.roles[0] || 'DPS';
  const roleMap: Record<string, string> = {
    'DPS': 'Damage',
    'Support DPS': 'Sub-DPS',
    'Amplifier': 'Buffer',
    'Sustain': 'Sustain',
  };
  return roleMap[role] || role;
});

// ==================
// CONTEXTUAL FEEDBACK
// ==================

const isHovered = ref(false);
const showFeedbackModal = ref(false);

// Mobile detection for always-visible feedback button
const isMobile = computed(() => {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768 || 'ontouchstart' in window;
});

const feedbackContext = computed((): FeedbackContext => ({
  characterId: props.focalCharacterId,
  characterName: props.focalCharacterName,
  teammateId: props.teammateId,
  teammateName: character.value?.name,
  currentRating: props.rating,
}));

function openRatingFeedback() {
  showFeedbackModal.value = true;
}

function closeFeedbackModal() {
  showFeedbackModal.value = false;
}
</script>

<template>
  <div
    v-if="character"
    class="teammate-card"
    :class="[
      `rating-${rating.toLowerCase()}`,
      { compact, owned: ownership === 'owned', concept: ownership === 'concept' }
    ]"
    :style="{ '--rating-glow': ratingConfig.glow, '--rating-ring': ratingConfig.ring }"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <!-- Holographic scanline effect -->
    <div class="holo-scanline"></div>

    <!-- Background glow for high ratings -->
    <div v-if="rating === 'S'" class="s-tier-glow"></div>

    <!-- Content Layout -->
    <div class="card-content">
      <!-- Portrait Section using CharacterCard -->
      <div class="portrait-section">
        <CharacterCard
          v-if="character"
          :character="character"
          :ownership="ownership"
          size="sm"
          :show-ownership="false"
          :eidolon="eidolonLevel"
          :signature-superimposition="signatureSuperimpositionLevel"
        />

        <!-- Rating Badge overlay -->
        <div
          class="rating-badge"
          :class="{ boosted: isBoosted }"
          :style="{ background: ratingConfig.gradient, boxShadow: `0 0 12px ${ratingConfig.glow}` }"
          :title="isBoosted ? `Boosted from ${baseRating} by your investment` : undefined"
        >
          {{ rating }}
          <span v-if="isBoosted" class="boost-indicator">★</span>
        </div>
      </div>

      <!-- Info Section -->
      <div class="info-section">
        <!-- Name Row with Ownership -->
        <div class="name-row">
          <span class="char-name">{{ character.name }}</span>
          <!-- Ownership indicator (inline) -->
          <span
            v-if="ownership === 'owned'"
            class="ownership-dot owned"
            title="Owned"
          >✓</span>
          <span
            v-else-if="ownership === 'concept'"
            class="ownership-dot concept"
            title="Planning to Pull"
          >?</span>
        </div>

        <!-- Meta Row -->
        <div class="meta-row">
          <span
            class="element-tag"
            :style="{ color: elementColors[character.element], borderColor: `${elementColors[character.element]}40` }"
          >
            {{ character.element }}
          </span>
          <span class="meta-separator">·</span>
          <span class="role-tag">{{ roleLabel }}</span>
        </div>

        <!-- Reason -->
        <div v-if="!compact" class="reason-text">
          "{{ reason }}"
        </div>
      </div>
    </div>

    <!-- Hover gradient overlay -->
    <div class="hover-overlay"></div>

    <!-- Feedback Button (appears on hover) -->
    <div v-if="(isHovered || isMobile) && focalCharacterId" class="feedback-btn-wrapper">
      <FeedbackButton
        tooltip="Rating wrong?"
        size="sm"
        @click="openRatingFeedback"
      />
    </div>

    <!-- Feedback Modal -->
    <ContextualFeedbackModal
      :is-open="showFeedbackModal"
      feedback-type="rating-wrong"
      :context="feedbackContext"
      @close="closeFeedbackModal"
    />
  </div>
</template>

<style scoped>
.teammate-card {
  position: relative;
  background: linear-gradient(135deg, rgba(20, 20, 42, 0.8) 0%, rgba(15, 15, 35, 0.9) 100%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 1rem;
  padding: 1rem;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
}

.teammate-card:hover {
  border-color: var(--rating-ring);
  transform: translateY(-4px);
  box-shadow:
    0 12px 40px rgba(0, 0, 0, 0.4),
    0 0 30px var(--rating-glow);
}

.teammate-card.compact {
  padding: 0.75rem;
}

/* Holographic scanline effect */
.holo-scanline {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    0deg,
    transparent 0%,
    transparent 50%,
    rgba(255, 255, 255, 0.02) 50%,
    rgba(255, 255, 255, 0.02) 100%
  );
  background-size: 100% 4px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s;
}

.teammate-card:hover .holo-scanline {
  opacity: 1;
}

/* S-tier special glow */
.s-tier-glow {
  position: absolute;
  top: -50%;
  right: -30%;
  width: 150px;
  height: 150px;
  background: radial-gradient(circle, rgba(255, 149, 0, 0.15) 0%, transparent 70%);
  pointer-events: none;
  animation: s-pulse 3s ease-in-out infinite;
}

@keyframes s-pulse {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(1.1); }
}

/* Content layout */
.card-content {
  position: relative;
  display: flex;
  gap: 1rem;
  z-index: 1;
}

.compact .card-content {
  gap: 0.75rem;
}

/* Portrait Section */
.portrait-section {
  position: relative;
  flex-shrink: 0;
}

/* Rating Badge - overlays on top of CharacterCard */
.rating-badge {
  position: absolute;
  bottom: -6px;
  left: -6px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  font-family: var(--font-display);
  font-size: 0.75rem;
  font-weight: 800;
  color: white;
  z-index: 20;
  transition: transform 0.3s;
}

.compact .rating-badge {
  width: 20px;
  height: 20px;
  font-size: 0.625rem;
  bottom: -4px;
  left: -4px;
}

.teammate-card:hover .rating-badge {
  transform: scale(1.15);
}

/* Boosted rating indicator */
.rating-badge.boosted {
  animation: boost-pulse 2s ease-in-out infinite;
}

@keyframes boost-pulse {
  0%, 100% { box-shadow: 0 0 12px var(--glow-color, rgba(255, 215, 0, 0.5)); }
  50% { box-shadow: 0 0 20px var(--glow-color, rgba(255, 215, 0, 0.7)), 0 0 30px var(--glow-color, rgba(255, 215, 0, 0.3)); }
}

.boost-indicator {
  position: absolute;
  top: -4px;
  right: -4px;
  font-size: 0.5rem;
  color: #ffd700;
  text-shadow: 0 0 4px rgba(255, 215, 0, 0.8);
  animation: star-twinkle 1.5s ease-in-out infinite;
}

@keyframes star-twinkle {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.2); }
}

/* Info Section */
.info-section {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.name-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.char-name {
  font-family: var(--font-body);
  font-size: 0.9375rem;
  font-weight: 600;
  color: white;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.compact .char-name {
  font-size: 0.8125rem;
}

/* Meta Row */
.meta-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
}

.compact .meta-row {
  font-size: 0.6875rem;
}

.element-tag {
  font-weight: 500;
  padding: 0.125rem 0.375rem;
  border: 1px solid;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.03);
}

.meta-separator {
  color: rgba(255, 255, 255, 0.2);
}

.role-tag {
  color: rgba(255, 255, 255, 0.5);
}

/* Reason Text */
.reason-text {
  font-size: 0.75rem;
  font-style: italic;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.4;
  margin-top: 0.25rem;
}

/* Ownership Dot (inline with name) */
.ownership-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 9999px;
  font-size: 0.625rem;
  font-weight: 700;
  flex-shrink: 0;
}

.ownership-dot.owned {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
  border: 1px solid rgba(34, 197, 94, 0.4);
}

.ownership-dot.concept {
  background: rgba(168, 85, 247, 0.2);
  color: #a855f7;
  border: 1px solid rgba(168, 85, 247, 0.4);
}

/* Hover overlay */
.hover-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, transparent 0%, var(--rating-glow) 100%);
  opacity: 0;
  transition: opacity 0.3s;
  pointer-events: none;
}

.teammate-card:hover .hover-overlay {
  opacity: 0.05;
}

/* Rating-specific border accents */
.teammate-card.rating-s {
  border-left: 3px solid #ff9500;
}

.teammate-card.rating-a {
  border-left: 3px solid #a855f7;
}

.teammate-card.rating-b {
  border-left: 3px solid #3b82f6;
}

/* Animation entrance */
.teammate-card {
  animation: card-reveal 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

@keyframes card-reveal {
  from {
    opacity: 0;
    transform: translateY(15px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* Feedback Button Wrapper */
.feedback-btn-wrapper {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 15;
}
</style>
