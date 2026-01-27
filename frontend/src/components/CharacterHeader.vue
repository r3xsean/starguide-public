<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { Character, OwnershipStatus, TierRating } from '../types';
import { getTierData } from '../data/tierData';
import CharacterCard from './CharacterCard.vue';
import FeedbackButton from './FeedbackButton.vue';
import ContextualFeedbackModal from './ContextualFeedbackModal.vue';
import type { FeedbackContext } from './ContextualFeedbackModal.vue';
import { useCommunityStats } from '../composables/useCommunityStats';

interface Props {
  character: Character;
  ownership?: OwnershipStatus;
}

const props = withDefaults(defineProps<Props>(), {
  ownership: 'none',
});

// Element colors
const elementColors: Record<string, string> = {
  Physical: '#c4c4c4',
  Fire: '#f4634e',
  Ice: '#47c7fd',
  Lightning: '#d376f0',
  Wind: '#5fe8b6',
  Quantum: '#625afa',
  Imaginary: '#f3d86b',
};

const elementColor = computed(() => elementColors[props.character.element] || '#ffffff');

// Tier order for comparison
const tierOrder: TierRating[] = ['T-1', 'T-0.5', 'T0', 'T0.5', 'T1', 'T1.5', 'T2', 'T3', 'T4', 'T5'];

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

// Individual mode tiers
const mocTier = computed(() => getBestTierForMode('moc'));
const pfTier = computed(() => getBestTierForMode('pf'));
const asTier = computed(() => getBestTierForMode('as'));

// Tier gradients
const tierGradients: Record<string, string> = {
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
  return tierGradients[tier] ?? tierGradients['T5'] ?? '';
};

// Role icons
const roleConfig = computed(() => {
  const role = props.character.roles[0] || 'DPS';
  const configs: Record<string, { icon: string; label: string; color: string }> = {
    'DPS': { icon: '⚔️', label: 'Damage Dealer', color: '#ef4444' },
    'Support DPS': { icon: '🗡️', label: 'Support DPS', color: '#f59e0b' },
    'Amplifier': { icon: '✨', label: 'Amplifier', color: '#a855f7' },
    'Sustain': { icon: '💚', label: 'Sustain', color: '#10b981' },
  };
  return configs[role] || { icon: '✦', label: role, color: '#6b7280' };
});

// Composition count
const compositionCount = computed(() => {
  return props.character.compositions?.length || 0;
});

// Has multiple compositions
const hasCompositions = computed(() => {
  return compositionCount.value > 0;
});

// Team structure info - derived from compositions (new) or legacy teamStructures
const structureInfo = computed(() => {
  const labels: Record<string, string> = {
    'hypercarry': 'Hypercarry',
    'dual-carry': 'Dual Carry',
    'triple-carry': 'Triple Carry',
    'super-break': 'Super Break',
    'break-focused': 'Break Focused',
    'dot': 'DoT Stack',
    'follow-up': 'Follow-up',
    'memosprite': 'Memosprite',
    'chrysos-hypercarry': 'Chrysos Hypercarry',
  };

  // Try to get structure from compositions (new system)
  if (props.character.compositions && props.character.compositions.length > 0) {
    // Find primary composition
    const primary = props.character.compositions.find(c => c.isPrimary) || props.character.compositions[0];

    // Try to get structure from first team in primary composition
    const primaryTeam = primary?.teams?.[0];
    const preferredStructure = typeof primaryTeam?.structure === 'string' ? primaryTeam.structure : null;

    // Get all unique structures from all compositions' teams
    const allStructures = new Set<string>();
    for (const comp of props.character.compositions) {
      if (comp.teams) {
        for (const team of comp.teams) {
          if (typeof team.structure === 'string') {
            allStructures.add(team.structure);
          }
        }
      }
    }

    // Remove preferred from viable list
    if (preferredStructure) {
      allStructures.delete(preferredStructure);
    }

    if (preferredStructure || allStructures.size > 0) {
      return {
        preferred: preferredStructure ? (labels[preferredStructure] || preferredStructure) : primary?.name || '',
        viable: Array.from(allStructures).map(v => labels[v] || v),
        notes: primary?.coreMechanic || '',
      };
    }
  }

  // Fallback to legacy teamStructures if available
  const structures = props.character.teamStructures;
  if (!structures) return null;

  return {
    preferred: labels[structures.preferred] || structures.preferred,
    viable: structures.viable?.map(v => labels[v] || v) || [],
    notes: structures.notes,
  };
});

// ==================
// CONTEXTUAL FEEDBACK
// ==================

const showFeedbackModal = ref(false);

function openTierFeedback() {
  showFeedbackModal.value = true;
}

function closeFeedbackModal() {
  showFeedbackModal.value = false;
}

const feedbackContext = computed((): FeedbackContext => ({
  characterId: props.character.id,
  characterName: props.character.name,
  allTiers: {
    moc: mocTier.value,
    pf: pfTier.value,
    as: asTier.value,
  },
}));

// ==================
// COMMUNITY STATS
// ==================

const { fetchStats, getOwnedPercentage, getPlanningPercentage, totalUsers } = useCommunityStats();

// Fetch community stats on mount
onMounted(() => {
  fetchStats();
});

// Community stats for this character
const communityOwned = computed(() => getOwnedPercentage(props.character.id));
const communityPlanning = computed(() => getPlanningPercentage(props.character.id));
</script>

<template>
  <div class="character-header" :style="{ '--element-color': elementColor }">
    <!-- Background Effects -->
    <div class="header-bg">
      <!-- Element Gradient Orb -->
      <div class="element-orb"></div>
      <!-- Grid Pattern -->
      <div class="grid-pattern"></div>
      <!-- Scanlines -->
      <div class="scanlines"></div>
    </div>

    <!-- Content -->
    <div class="header-content">
      <!-- Left: Portrait Section -->
      <div class="portrait-section">
        <div class="portrait-frame">
          <!-- Glow Ring -->
          <div class="glow-ring"></div>
          <div class="glow-ring glow-ring-2"></div>

          <!-- Character Card -->
          <CharacterCard
            :character="character"
            :ownership="ownership"
            size="lg"
            :show-tier="true"
          />
        </div>
      </div>

      <!-- Right: Info Section -->
      <div class="info-section">
        <!-- Name Row -->
        <div class="name-row">
          <h1 class="character-name">{{ character.name }}</h1>
          <div class="ownership-badge" v-if="ownership !== 'none'" :class="ownership">
            <span class="badge-icon">{{ ownership === 'owned' ? '✓' : '?' }}</span>
            <span class="badge-text">{{ ownership === 'owned' ? 'Owned' : 'Planning' }}</span>
          </div>
          <!-- Community stats: Owned -->
          <div
            v-if="communityOwned !== null && communityOwned > 0"
            class="community-stat-badge owned"
            :title="`${communityOwned}% of ${totalUsers.toLocaleString()} users own this character`"
          >
            <span class="stat-value">{{ communityOwned }}%</span>
            <span class="stat-label">own</span>
          </div>
          <!-- Community stats: Planning -->
          <div
            v-if="communityPlanning !== null && communityPlanning > 0"
            class="community-stat-badge planning"
            :title="`${communityPlanning}% of ${totalUsers.toLocaleString()} users are planning to pull`"
          >
            <span class="stat-value">{{ communityPlanning }}%</span>
            <span class="stat-label">planning</span>
          </div>
        </div>

        <!-- Meta Row -->
        <div class="meta-row">
          <!-- Element -->
          <div class="meta-tag element-tag">
            <span class="tag-dot" :style="{ background: elementColor }"></span>
            {{ character.element }}
          </div>

          <!-- Path -->
          <div class="meta-tag path-tag">
            {{ character.path }}
          </div>

          <!-- Role -->
          <div class="meta-tag role-tag" :style="{ borderColor: `${roleConfig.color}40` }">
            <span class="role-icon">{{ roleConfig.icon }}</span>
            {{ roleConfig.label }}
          </div>

          <!-- Rarity -->
          <div class="meta-tag rarity-tag" :class="`rarity-${character.rarity}`">
            {{ '★'.repeat(character.rarity) }}
          </div>

          <!-- Compositions Badge -->
          <div v-if="hasCompositions" class="meta-tag compositions-tag" title="Available team compositions">
            <span class="compositions-icon">⚙️</span>
            {{ compositionCount }} {{ compositionCount === 1 ? 'Composition' : 'Compositions' }}
          </div>
        </div>

        <!-- Tier Breakdown Row -->
        <div class="tier-breakdown-row">
          <div class="tier-mode" title="Memory of Chaos">
            <span class="tier-mode-label">MoC</span>
            <span class="tier-mode-badge" :style="{ background: getTierGradient(mocTier) }">{{ mocTier }}</span>
          </div>
          <div class="tier-mode" title="Pure Fiction">
            <span class="tier-mode-label">PF</span>
            <span class="tier-mode-badge" :style="{ background: getTierGradient(pfTier) }">{{ pfTier }}</span>
          </div>
          <div class="tier-mode" title="Apocalyptic Shadow">
            <span class="tier-mode-label">AS</span>
            <span class="tier-mode-badge" :style="{ background: getTierGradient(asTier) }">{{ asTier }}</span>
          </div>
          <FeedbackButton
            label="Tier wrong?"
            tooltip="Report incorrect tier rating"
            size="sm"
            @click="openTierFeedback"
          />
        </div>

        <!-- Tier Disclaimer -->
        <p class="tier-disclaimer">
          Tiers assume optimal teams. Your actual results depend on roster and content.
        </p>

        <!-- Description -->
        <p class="character-description">{{ character.description }}</p>

        <!-- Labels -->
        <div class="labels-row">
          <span
            v-for="label in (character.labels || []).slice(0, 6)"
            :key="label"
            class="label-chip"
          >
            {{ label }}
          </span>
        </div>

        <!-- Team Structure Info -->
        <div v-if="structureInfo" class="structure-info">
          <div class="structure-preferred">
            <span class="structure-label">Preferred:</span>
            <span class="structure-value">{{ structureInfo.preferred }}</span>
          </div>
          <div v-if="structureInfo.viable.length > 0" class="structure-viable">
            <span class="structure-label">Also viable:</span>
            <span
              v-for="(viable, i) in structureInfo.viable"
              :key="viable"
              class="structure-chip"
            >
              {{ viable }}{{ i < structureInfo.viable.length - 1 ? ',' : '' }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom Accent Line -->
    <div class="bottom-accent"></div>

    <!-- Feedback Modal -->
    <ContextualFeedbackModal
      :is-open="showFeedbackModal"
      feedback-type="tier-wrong"
      :context="feedbackContext"
      @close="closeFeedbackModal"
    />
  </div>
</template>

<style scoped>
.character-header {
  position: relative;
  border-radius: 1.5rem;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

/* Background Effects */
.header-bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(20, 20, 42, 0.95) 0%, rgba(15, 15, 35, 0.98) 100%);
}

.element-orb {
  position: absolute;
  top: -30%;
  left: -10%;
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, var(--element-color) 0%, transparent 70%);
  opacity: 0.15;
  filter: blur(60px);
  animation: orb-drift 8s ease-in-out infinite;
}

@keyframes orb-drift {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(20px, -10px) scale(1.05); }
}

.grid-pattern {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
  background-size: 40px 40px;
  opacity: 0.5;
}

.scanlines {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent 0px,
    transparent 2px,
    rgba(0, 0, 0, 0.03) 2px,
    rgba(0, 0, 0, 0.03) 4px
  );
  pointer-events: none;
}

/* Content */
.header-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
}

@media (min-width: 768px) {
  .header-content {
    flex-direction: row;
    align-items: flex-start;
    gap: 2rem;
    padding: 2rem;
  }
}

/* Portrait Section */
.portrait-section {
  position: relative;
  flex-shrink: 0;
}

.portrait-frame {
  position: relative;
}

.glow-ring {
  position: absolute;
  inset: -8px;
  border: 2px solid var(--element-color);
  border-radius: 1.25rem;
  opacity: 0.3;
  animation: ring-pulse 3s ease-in-out infinite;
}

.glow-ring-2 {
  inset: -16px;
  opacity: 0.15;
  animation-delay: 0.5s;
}

@keyframes ring-pulse {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 0.15; transform: scale(1.02); }
}

/* Info Section */
.info-section {
  flex: 1;
  min-width: 0;
  max-width: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  text-align: center;
  align-items: center;
}

/* Ensure all info-section children don't overflow on mobile */
.info-section > * {
  max-width: 100%;
  box-sizing: border-box;
}

@media (min-width: 768px) {
  .info-section {
    gap: 1rem;
    text-align: left;
    align-items: flex-start;
  }
}

/* Name Row */
.name-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

@media (min-width: 768px) {
  .name-row {
    justify-content: flex-start;
    gap: 1rem;
  }
}

.character-name {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 800;
  color: white;
  margin: 0;
  text-shadow: 0 0 40px var(--element-color);
  letter-spacing: -0.02em;
  word-break: break-word;
  overflow-wrap: break-word;
}

@media (min-width: 768px) {
  .character-name {
    font-size: 2rem;
  }
}

.ownership-badge {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
}

.ownership-badge.owned {
  background: rgba(249, 147, 7, 0.15);
  color: #f99307;
  border: 1px solid rgba(249, 147, 7, 0.3);
}

.ownership-badge.concept {
  background: rgba(168, 85, 247, 0.15);
  color: #a855f7;
  border: 1px solid rgba(168, 85, 247, 0.3);
}

/* Community Stats Badge */
.community-stat-badge {
  display: flex;
  align-items: center;
  gap: 0.1875rem;
  padding: 0.1875rem 0.375rem;
  border-radius: 9999px;
  font-size: 0.5625rem;
  transition: all 0.2s;
}

.community-stat-badge.owned {
  background: rgba(249, 147, 7, 0.1);
  border: 1px solid rgba(249, 147, 7, 0.25);
}

.community-stat-badge.owned .stat-value {
  color: rgba(249, 147, 7, 0.9);
}

.community-stat-badge.owned .stat-label {
  color: rgba(249, 147, 7, 0.6);
}

.community-stat-badge.planning {
  background: rgba(168, 85, 247, 0.1);
  border: 1px solid rgba(168, 85, 247, 0.25);
}

.community-stat-badge.planning .stat-value {
  color: rgba(168, 85, 247, 0.9);
}

.community-stat-badge.planning .stat-label {
  color: rgba(168, 85, 247, 0.6);
}

.community-stat-badge:hover {
  filter: brightness(1.1);
}

.community-stat-badge .stat-value {
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: 0.5625rem;
}

.community-stat-badge .stat-label {
  font-size: 0.5625rem;
}

/* Meta Row */
.meta-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

@media (min-width: 768px) {
  .meta-row {
    justify-content: flex-start;
    gap: 0.75rem;
  }
}

.meta-tag {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.8);
}

.tag-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.element-tag {
  border-color: var(--element-color);
  background: color-mix(in srgb, var(--element-color) 10%, transparent);
}

.role-icon {
  font-size: 1rem;
}

.rarity-tag {
  font-size: 0.75rem;
  letter-spacing: -1px;
}

.rarity-tag.rarity-5 {
  color: #ffd700;
  background: rgba(255, 215, 0, 0.1);
  border-color: rgba(255, 215, 0, 0.3);
}

.rarity-tag.rarity-4 {
  color: #a855f7;
  background: rgba(168, 85, 247, 0.1);
  border-color: rgba(168, 85, 247, 0.3);
}

.compositions-tag {
  color: #8b5cf6;
  background: rgba(139, 92, 246, 0.1);
  border-color: rgba(139, 92, 246, 0.3);
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.compositions-icon {
  font-size: 0.875rem;
}

/* Tier Breakdown Row */
.tier-breakdown-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

@media (min-width: 768px) {
  .tier-breakdown-row {
    justify-content: flex-start;
    gap: 1rem;
    flex-wrap: nowrap;
  }
}

.tier-mode {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.tier-mode-label {
  font-size: 0.6875rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  min-width: 2rem;
}

.tier-mode-badge {
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.625rem;
  font-weight: 700;
  color: white;
  min-width: 2.5rem;
  text-align: center;
}

/* Tier Disclaimer */
.tier-disclaimer {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
  margin: 0;
  line-height: 1.4;
  max-width: 100%;
  padding: 0 0.5rem;
}

/* Description */
.character-description {
  font-size: 0.875rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.7);
  margin: 0;
  max-width: 100%;
  word-break: break-word;
  overflow-wrap: break-word;
  padding: 0 0.5rem;
}

@media (min-width: 768px) {
  .character-description {
    font-size: 0.9375rem;
    max-width: 600px;
    padding: 0;
  }
}

/* Labels */
.labels-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.375rem;
}

@media (min-width: 768px) {
  .labels-row {
    justify-content: flex-start;
    gap: 0.5rem;
  }
}

.label-chip {
  padding: 0.25rem 0.625rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 9999px;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
  transition: all 0.2s;
}

.label-chip:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.15);
  color: white;
}

/* Structure Info */
.structure-info {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.structure-preferred,
.structure-viable {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.structure-label {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.structure-value {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--element-color);
}

.structure-chip {
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.7);
}

/* Bottom Accent */
.bottom-accent {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--element-color) 20%,
    var(--element-color) 80%,
    transparent 100%
  );
  opacity: 0.5;
}

/* Animation */
.character-header {
  animation: header-reveal 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes header-reveal {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
