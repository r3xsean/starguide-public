<script setup lang="ts">
import { computed } from 'vue';
import type { Character, OwnershipStatus, TierRating, GranularRating } from '../types';
import { getTierData } from '../data/tierData';

const props = defineProps<{
  character: Character;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  ownership?: OwnershipStatus;
  selected?: boolean;
  showTier?: boolean;
  showName?: boolean;
  showOwnership?: boolean;
  gameMode?: 'moc' | 'pf' | 'as';
  synergyRating?: GranularRating;
  eidolon?: number; // Eidolon level (0-6)
  signatureSuperimposition?: 1 | 2 | 3 | 4 | 5; // Signature LC superimposition level
  overrideTier?: TierRating; // Override tier (for investment-adjusted display)
  imageOverride?: string; // Custom image path (for joke characters)
}>();

const emit = defineEmits<{
  click: [character: Character];
}>();

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'xs': return 'w-9 h-9';     // 36px
    case 'sm': return 'w-14 h-14';   // 56px
    case 'lg': return 'w-24 h-24';   // 96px
    case 'xl': return 'w-[88px] h-[88px]';  // 88px - for composition best picks
    default: return 'w-18 h-18';     // 72px (md)
  }
});

const isXs = computed(() => props.size === 'xs');

const ringClass = computed(() => {
  return `portrait-ring-${props.character.element.toLowerCase()}`;
});

// Tier calculation helpers
const tierOrder: TierRating[] = ['T-1', 'T-0.5', 'T0', 'T0.5', 'T1', 'T1.5', 'T2', 'T3', 'T4', 'T5'];
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

// Get best tier for a specific mode
const getBestTierForMode = (mode: 'moc' | 'pf' | 'as'): TierRating => {
  const tierData = getTierData(props.character.id);
  if (!tierData) return 'T2';

  const modeData = tierData[mode];
  if (!modeData) return 'T2';

  const tiers = Object.values(modeData) as TierRating[];
  if (tiers.length === 0) return 'T2';

  return tiers.reduce((best, current) =>
    tierOrder.indexOf(current) < tierOrder.indexOf(best) ? current : best
  );
};

// Get tier - uses overrideTier if provided (for investment-adjusted display),
// otherwise uses mode-specific when gameMode provided, or averages all modes
const characterTier = computed((): TierRating => {
  // If override tier is provided, use it (for investment-adjusted display)
  if (props.overrideTier) {
    return props.overrideTier;
  }

  // If gameMode is provided, use mode-specific tier
  if (props.gameMode) {
    return getBestTierForMode(props.gameMode);
  }

  // Otherwise, calculate average across all game modes
  const mocTier = getBestTierForMode('moc');
  const pfTier = getBestTierForMode('pf');
  const asTier = getBestTierForMode('as');

  const avg = (tierToNumber(mocTier) + tierToNumber(pfTier) + tierToNumber(asTier)) / 3;
  return numberToTier(avg);
});

// Ownership ring class for outer glow effect
const ownershipRingClass = computed(() => {
  if (props.ownership === 'owned') return 'ownership-ring-owned';
  if (props.ownership === 'concept') return 'ownership-ring-concept';
  return '';
});

// Character icon URL based on character ID (or override for joke characters)
const iconUrl = computed(() => {
  return props.imageOverride || `/icons/${props.character.id}.webp`;
});

const elementGradient = computed(() => {
  const colors: Record<string, string> = {
    Physical: 'from-gray-400 to-gray-600',
    Fire: 'from-orange-400 to-red-600',
    Ice: 'from-cyan-300 to-blue-500',
    Lightning: 'from-purple-400 to-violet-600',
    Wind: 'from-emerald-300 to-teal-500',
    Quantum: 'from-indigo-400 to-purple-600',
    Imaginary: 'from-yellow-300 to-amber-500',
  };
  return colors[props.character.element] || 'from-gray-400 to-gray-600';
});

const elementColor = computed(() => {
  const colors: Record<string, string> = {
    Physical: '#c4c4c4',
    Fire: '#f4634e',
    Ice: '#47c7fd',
    Lightning: '#d376f0',
    Wind: '#5fe8b6',
    Quantum: '#625afa',
    Imaginary: '#f3d86b',
  };
  return colors[props.character.element] || '#c4c4c4';
});

const tierGradient = computed(() => {
  const gradients: Record<string, string> = {
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
  return gradients[characterTier.value] || gradients['T5'];
});

// Synergy rating gradient - uses base rating letter for color
const synergyGradient = computed(() => {
  if (!props.synergyRating) return '';
  const gradients: Record<string, string> = {
    'S': 'linear-gradient(135deg, #ff9500 0%, #ff6b00 100%)',
    'A': 'linear-gradient(135deg, #a855f7 0%, #8b5cf6 100%)',
    'B': 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    'C': 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
    'D': 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
  };
  // Get base rating letter (S from S-, A from A+, etc.)
  const baseRating = props.synergyRating.charAt(0).toUpperCase();
  return gradients[baseRating] || gradients['D'];
});

// Investment badge - combines eidolon and signature LC
const investmentBadge = computed(() => {
  const parts: string[] = [];
  if (props.eidolon && props.eidolon > 0) parts.push(`E${props.eidolon}`);
  if (props.signatureSuperimposition) parts.push(`S${props.signatureSuperimposition}`);
  return parts.join('');
});

const investmentBadgeTitle = computed(() => {
  const parts: string[] = [];
  if (props.eidolon && props.eidolon > 0) parts.push(`Eidolon ${props.eidolon}`);
  if (props.signatureSuperimposition) parts.push(`Signature LC S${props.signatureSuperimposition}`);
  return parts.join(' + ');
});
</script>

<template>
  <div
    class="character-card-wrapper group relative cursor-pointer"
    :class="[
      sizeClasses,
      selected && 'is-selected',
      isXs && 'is-xs',
      ownershipRingClass
    ]"
    @click="emit('click', character)"
  >
    <!-- Glow effect on hover/select (skip for xs) -->
    <div
      v-if="!isXs"
      class="absolute -inset-1 rounded-xl opacity-0 blur-md transition-opacity duration-300 -z-10"
      :class="selected ? 'opacity-60' : 'group-hover:opacity-40'"
      :style="{ background: elementColor }"
    ></div>

    <!-- Ownership glow ring (outer) -->
    <div
      v-if="(ownership === 'owned' || ownership === 'concept') && !isXs"
      class="ownership-glow-ring"
      :class="ownership === 'owned' ? 'ownership-glow-owned' : 'ownership-glow-concept'"
    ></div>

    <!-- Portrait Container -->
    <div
      class="portrait-container w-full h-full transition-all duration-300"
      :class="[
        selected && !isXs && 'ring-2 ring-offset-2 ring-offset-void-900',
        ownership === 'none' && 'unowned-portrait'
      ]"
      :style="selected && !isXs ? { '--tw-ring-color': elementColor } : {}"
    >
      <!-- Character Icon -->
      <img
        :src="iconUrl"
        :alt="character.name"
        class="absolute inset-0 w-full h-full object-cover transition-transform duration-300"
        :class="!isXs && 'group-hover:scale-110'"
        @error="($event.target as HTMLImageElement).style.display = 'none'"
      />
      <!-- Fallback gradient when icon fails to load -->
      <div
        class="absolute inset-0 bg-gradient-to-br flex items-center justify-center text-white font-display font-bold -z-10"
        :class="elementGradient"
      >
        <span :class="isXs ? 'text-xs' : 'text-lg'" class="opacity-80">{{ character.name.charAt(0) }}</span>
      </div>

      <!-- Element Ring (skip for xs) -->
      <div v-if="!isXs" class="portrait-ring" :class="ringClass"></div>

      <!-- Shimmer effect on hover (skip for xs) -->
      <div
        v-if="!isXs"
        class="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent
               opacity-0 group-hover:opacity-100 transition-opacity duration-500
               translate-x-[-100%] group-hover:translate-x-[100%]"
        style="transition: transform 0.6s ease-out, opacity 0.3s;"
      ></div>
    </div>

    <!-- XS ownership indicator (small dot for compact view) -->
    <div
      v-if="(ownership === 'owned' || ownership === 'concept') && isXs && showOwnership !== false"
      class="ownership-dot"
      :class="ownership === 'owned' ? 'ownership-dot-owned' : 'ownership-dot-concept'"
    ></div>

    <!-- Synergy Rating Badge (top-left, outside portrait container) -->
    <div
      v-if="synergyRating"
      class="synergy-badge"
      :class="isXs && 'synergy-badge-xs'"
      :style="{ background: synergyGradient }"
    >
      {{ synergyRating }}
    </div>

    <!-- Tier Badge (skip for xs) -->
    <div
      v-if="showTier && !isXs"
      class="tier-badge"
      :style="{ background: tierGradient }"
    >
      {{ characterTier }}
    </div>

    <!-- Investment Badge (top-right) - shows eidolon and/or signature LC -->
    <div
      v-if="investmentBadge"
      class="investment-badge"
      :class="[
        isXs && 'investment-badge-xs',
        investmentBadge.length > 2 && 'investment-badge-wide'
      ]"
      :title="investmentBadgeTitle"
    >
      {{ investmentBadge }}
    </div>

    <!-- Name Tooltip - always show on hover -->
    <div class="character-name-tooltip">
      {{ character.name }}
    </div>
  </div>
</template>

<style scoped>
.w-9 {
  width: 2.25rem;
}
.h-9 {
  height: 2.25rem;
}
.w-18 {
  width: 4.5rem;
}
.h-18 {
  height: 4.5rem;
}

.character-card-wrapper {
  z-index: 1;
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  /* Prevent mobile image save callout and text selection */
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  /* Allow scaling down when container is constrained */
  flex-shrink: 1;
  min-width: 0;
}

.character-card-wrapper:hover {
  z-index: 100;
  transform: translateY(-4px) scale(1.05);
}

.character-card-wrapper.is-selected {
  z-index: 101;
  transform: scale(1.1);
}

/* XS size - minimal styling */
.character-card-wrapper.is-xs {
  z-index: 1;
}

.character-card-wrapper.is-xs:hover {
  z-index: 100;
  transform: scale(1.08);
}

.character-card-wrapper.is-xs .portrait-container {
  border-radius: 6px;
}

.portrait-container {
  overflow: hidden;
  /* Prevent mobile image save callout */
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}

.portrait-container img {
  /* Prevent mobile image save callout */
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  pointer-events: none;
}

/* Unowned characters: dimmed and desaturated */
.unowned-portrait {
  filter: brightness(0.65) saturate(0.5);
  transition: filter 0.3s ease;
}

.character-card-wrapper:hover .unowned-portrait {
  filter: brightness(0.8) saturate(0.7);
}

.portrait-ring {
  transition: filter 0.3s ease;
}

.character-card-wrapper:hover .portrait-ring {
  filter: brightness(1.3);
}

.character-name-tooltip {
  position: absolute;
  bottom: -1.75rem;
  left: 50%;
  transform: translateX(-50%) translateY(5px);
  white-space: nowrap;
  font-size: 0.75rem;
  font-family: var(--font-body);
  color: white;
  background: rgba(3, 3, 8, 0.95);
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
  opacity: 0;
  pointer-events: none;
  transition: all 0.2s ease;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.character-card-wrapper:hover .character-name-tooltip {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

/* ========================================
   OWNERSHIP GLOW RING SYSTEM
   Replaces badge with visible outer glow
   ======================================== */

.ownership-glow-ring {
  position: absolute;
  inset: -4px;
  border-radius: calc(var(--radius-portrait) + 4px);
  pointer-events: none;
  z-index: 0;
  transition: opacity 0.3s ease, box-shadow 0.3s ease;
}

/* Owned: Bold gold outer ring */
.ownership-glow-owned {
  background: transparent;
  box-shadow:
    0 0 10px rgba(249, 147, 7, 0.7),
    0 0 20px rgba(249, 147, 7, 0.4),
    0 0 30px rgba(249, 147, 7, 0.2);
  border: 2.5px solid rgba(249, 147, 7, 0.85);
}

/* Concept: Vivid purple dashed ring (dashed for colorblind differentiation) */
.ownership-glow-concept {
  background: transparent;
  box-shadow:
    0 0 10px rgba(217, 70, 239, 0.6),
    0 0 20px rgba(168, 85, 247, 0.35),
    0 0 30px rgba(168, 85, 247, 0.15);
  border: 2.5px dashed rgba(217, 70, 239, 0.85);
}

/* Intensify glow on hover */
.character-card-wrapper:hover .ownership-glow-owned {
  box-shadow:
    0 0 14px rgba(249, 147, 7, 0.9),
    0 0 28px rgba(249, 147, 7, 0.5),
    0 0 40px rgba(249, 147, 7, 0.25);
  border-color: rgba(249, 147, 7, 1);
}

.character-card-wrapper:hover .ownership-glow-concept {
  box-shadow:
    0 0 14px rgba(217, 70, 239, 0.8),
    0 0 28px rgba(168, 85, 247, 0.45),
    0 0 40px rgba(168, 85, 247, 0.2);
  border-color: rgba(217, 70, 239, 1);
  border-style: dashed;
}

/* Wrapper-level class for additional portrait effects */
.ownership-ring-owned .portrait-container {
  box-shadow: inset 0 0 12px rgba(249, 147, 7, 0.25);
}

.ownership-ring-concept .portrait-container {
  box-shadow: inset 0 0 12px rgba(217, 70, 239, 0.2);
}

/* XS ownership: corner dot for compact view */
.ownership-dot {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  z-index: 10;
  border: 1.5px solid rgba(0, 0, 0, 0.6);
}

.ownership-dot-owned {
  background: linear-gradient(135deg, #f99307 0%, #dd6d02 100%);
  box-shadow: 0 0 6px rgba(249, 147, 7, 0.8);
}

.ownership-dot-concept {
  background: transparent;
  border-color: rgba(217, 70, 239, 0.9);
  border-width: 2.5px;
  box-shadow: 0 0 6px rgba(217, 70, 239, 0.7);
}

/* Synergy Rating Badge (top-left) */
.synergy-badge {
  position: absolute;
  top: -4px;
  left: -4px;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  font-size: 0.6875rem;
  font-weight: 700;
  color: white;
  border: 1.5px solid rgba(0, 0, 0, 0.4);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.synergy-badge-xs {
  width: 16px;
  height: 16px;
  font-size: 0.5625rem;
  border-radius: 4px;
  top: -4px;
  left: -4px;
  border-width: 1px;
}

/* Investment Badge (top-right) - Shows eidolon and/or signature LC */
.investment-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 4px;
  border-radius: 6px;
  font-size: 0.6875rem;
  font-weight: 800;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  border: 1.5px solid rgba(245, 158, 11, 0.8);
  color: white;
  box-shadow:
    0 0 8px rgba(245, 158, 11, 0.6),
    0 2px 6px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.3);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  letter-spacing: -0.02em;
  transition: all 0.2s ease;
}

.investment-badge:hover {
  transform: scale(1.1);
  box-shadow:
    0 0 12px rgba(245, 158, 11, 0.8),
    0 4px 12px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
}

/* Wide variant for 4+ char text (e.g., "E1S1") */
.investment-badge-wide {
  font-size: 0.5625rem;
  letter-spacing: -0.03em;
}

.investment-badge-xs {
  min-width: 16px;
  height: 16px;
  padding: 0 3px;
  font-size: 0.5625rem;
  border-radius: 4px;
  top: -4px;
  right: -4px;
  border-width: 1px;
  box-shadow:
    0 0 6px rgba(245, 158, 11, 0.5),
    0 2px 6px rgba(0, 0, 0, 0.4);
}

.investment-badge-xs.investment-badge-wide {
  font-size: 0.5rem;
}

/* Portrait ring animation on select */
.is-selected .portrait-ring {
  animation: ringPulse 2s ease-in-out infinite;
}

@keyframes ringPulse {
  0%, 100% {
    filter: brightness(1);
  }
  50% {
    filter: brightness(1.4);
  }
}

/* Owned glow subtle pulse animation */
.ownership-ring-owned .ownership-glow-ring {
  animation: ownershipPulse 3s ease-in-out infinite;
}

.ownership-ring-concept .ownership-glow-ring {
  animation: ownershipPulseConcept 4s ease-in-out infinite;
}

@keyframes ownershipPulse {
  0%, 100% {
    opacity: 0.6;
  }
  50% {
    opacity: 0.85;
  }
}

@keyframes ownershipPulseConcept {
  0%, 100% {
    opacity: 0.5;
  }
  50% {
    opacity: 0.75;
  }
}

/* Tier Badge - consistent styling with synergy badges */
.tier-badge {
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%);
  padding: 2px 8px;
  font-size: 0.625rem;
  font-weight: 700;
  color: white;
  border-radius: 4px;
  border: 1.5px solid rgba(0, 0, 0, 0.4);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  z-index: 10;
  white-space: nowrap;
  min-width: 32px;
  text-align: center;
}
</style>
