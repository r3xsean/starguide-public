<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Role, TierRating } from '../../../types';

// ==================
// TYPES
// ==================

type GameMode = 'moc' | 'pf' | 'as';

interface TierEdits {
  moc?: { [role: string]: TierRating };
  pf?: { [role: string]: TierRating };
  as?: { [role: string]: TierRating };
}

// ==================
// PROPS & EMITS
// ==================

interface Props {
  characterRoles: Role[];
  modelValue: TierEdits;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: TierEdits];
}>();

// ==================
// STATE
// ==================

const isExpanded = ref(true);

// ==================
// CONSTANTS
// ==================

const TIER_OPTIONS: TierRating[] = [
  'T-1',
  'T-0.5',
  'T0',
  'T0.5',
  'T1',
  'T1.5',
  'T2',
  'T3',
  'T4',
  'T5',
];

const GAME_MODES: { id: GameMode; name: string; description: string }[] = [
  { id: 'moc', name: 'Memory of Chaos', description: 'MoC - Boss-focused endgame' },
  { id: 'pf', name: 'Pure Fiction', description: 'PF - Wave-clearing endgame' },
  { id: 'as', name: 'Apocalyptic Shadow', description: 'AS - Extended boss battles' },
];

const TIER_COLORS: Record<TierRating, string> = {
  'T-1': 'tier-legendary',
  'T-0.5': 'tier-mythic',
  'T0': 'tier-meta',
  'T0.5': 'tier-excellent',
  'T1': 'tier-great',
  'T1.5': 'tier-good',
  'T2': 'tier-decent',
  'T3': 'tier-low',
  'T4': 'tier-low',
  'T5': 'tier-low',
};

// ==================
// COMPUTED
// ==================

const hasRoles = computed(() => props.characterRoles.length > 0);

// ==================
// HANDLERS
// ==================

function toggleExpanded() {
  isExpanded.value = !isExpanded.value;
}

function getTierForRole(mode: GameMode, role: Role): TierRating | undefined {
  return props.modelValue[mode]?.[role];
}

function updateTier(mode: GameMode, role: Role, tier: TierRating | '') {
  const currentModeData: { [role: string]: TierRating } = { ...props.modelValue[mode] };

  if (tier === '') {
    delete currentModeData[role];
  } else {
    currentModeData[role] = tier;
  }

  emit('update:modelValue', {
    ...props.modelValue,
    [mode]: Object.keys(currentModeData).length > 0 ? currentModeData : undefined,
  });
}

function getTierColorClass(tier: TierRating | undefined): string {
  if (!tier) return '';
  return TIER_COLORS[tier] || '';
}
</script>

<template>
  <section class="editor-section">
    <!-- Section Header -->
    <button
      type="button"
      class="section-header"
      @click="toggleExpanded"
      :aria-expanded="isExpanded"
    >
      <div class="header-content">
        <svg
          class="chevron"
          :class="{ rotated: !isExpanded }"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fill-rule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clip-rule="evenodd"
          />
        </svg>
        <span class="header-title">Tier Ratings</span>
      </div>
    </button>

    <!-- Section Content -->
    <Transition name="section-expand">
      <div v-if="isExpanded" class="section-content">
        <!-- No roles warning -->
        <div v-if="!hasRoles" class="no-roles-warning">
          <svg viewBox="0 0 20 20" fill="currentColor" class="warning-icon">
            <path
              fill-rule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
              clip-rule="evenodd"
            />
          </svg>
          <span>Select at least one role in Classification to set tier ratings.</span>
        </div>

        <!-- Tier Note -->
        <div v-else class="tier-note">
          <svg viewBox="0 0 20 20" fill="currentColor" class="note-icon">
            <path
              fill-rule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
              clip-rule="evenodd"
            />
          </svg>
          <span>
            T-1 and T-0.5 are typically achieved through investment, rarely set directly.
            These tiers indicate peak performance with high investment.
          </span>
        </div>

        <!-- Game Mode Subsections -->
        <div v-if="hasRoles" class="game-modes">
          <div
            v-for="mode in GAME_MODES"
            :key="mode.id"
            class="mode-section"
          >
            <div class="mode-header">
              <h4 class="mode-title">{{ mode.name }}</h4>
              <span class="mode-description">{{ mode.description }}</span>
            </div>

            <div class="tier-grid">
              <div
                v-for="role in characterRoles"
                :key="`${mode.id}-${role}`"
                class="tier-row"
              >
                <label class="tier-role-label" :for="`tier-${mode.id}-${role}`">
                  {{ role }}
                </label>
                <select
                  :id="`tier-${mode.id}-${role}`"
                  class="tier-select"
                  :class="getTierColorClass(getTierForRole(mode.id, role))"
                  :value="getTierForRole(mode.id, role) || ''"
                  @change="updateTier(mode.id, role, ($event.target as HTMLSelectElement).value as TierRating | '')"
                >
                  <option value="">Not Set</option>
                  <option
                    v-for="tier in TIER_OPTIONS"
                    :key="tier"
                    :value="tier"
                  >
                    {{ tier }}
                  </option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
/* ==================
   SECTION CONTAINER
   ================== */

.editor-section {
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(71, 85, 105, 0.5);
  border-radius: 0.75rem;
  overflow: hidden;
}

/* ==================
   SECTION HEADER
   ================== */

.section-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.section-header:hover {
  background: rgba(71, 85, 105, 0.2);
}

.header-content {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.chevron {
  width: 1.25rem;
  height: 1.25rem;
  color: rgba(148, 163, 184, 0.8);
  transition: transform 0.2s ease;
}

.chevron.rotated {
  transform: rotate(-90deg);
}

.header-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: rgba(226, 232, 240, 1);
}

/* ==================
   SECTION CONTENT
   ================== */

.section-content {
  padding: 0 1.25rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* ==================
   NO ROLES WARNING
   ================== */

.no-roles-warning {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-radius: 0.5rem;
  color: rgba(251, 191, 36, 0.9);
  font-size: 0.875rem;
}

.warning-icon {
  width: 1.25rem;
  height: 1.25rem;
  flex-shrink: 0;
}

/* ==================
   TIER NOTE
   ================== */

.tier-note {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.25);
  border-radius: 0.5rem;
  color: rgba(165, 180, 252, 0.9);
  font-size: 0.8125rem;
  line-height: 1.5;
}

.note-icon {
  width: 1.125rem;
  height: 1.125rem;
  flex-shrink: 0;
  margin-top: 0.125rem;
}

/* ==================
   GAME MODES
   ================== */

.game-modes {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.mode-section {
  padding: 1rem;
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(71, 85, 105, 0.3);
  border-radius: 0.625rem;
}

.mode-header {
  margin-bottom: 0.875rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid rgba(71, 85, 105, 0.3);
}

.mode-title {
  font-size: 1rem;
  font-weight: 600;
  color: rgba(241, 245, 249, 1);
  margin: 0 0 0.25rem 0;
}

.mode-description {
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.7);
}

/* ==================
   TIER GRID
   ================== */

.tier-grid {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.tier-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.tier-role-label {
  flex: 0 0 100px;
  font-size: 0.875rem;
  font-weight: 500;
  color: rgba(203, 213, 225, 0.9);
}

.tier-select {
  flex: 1;
  max-width: 140px;
  padding: 0.5rem 0.75rem;
  background: rgba(51, 65, 85, 0.5);
  border: 1px solid rgba(71, 85, 105, 0.6);
  border-radius: 0.5rem;
  color: rgba(226, 232, 240, 1);
  font-size: 0.875rem;
  font-family: var(--font-display, 'Orbitron', system-ui);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.5rem center;
  background-size: 1.125rem;
  padding-right: 2rem;
}

.tier-select:hover {
  border-color: rgba(100, 116, 139, 0.8);
}

.tier-select:focus {
  outline: none;
  border-color: rgba(249, 115, 22, 0.6);
  box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.15);
}

.tier-select option {
  background: rgb(30, 41, 59);
  color: rgba(226, 232, 240, 1);
  font-family: var(--font-display, 'Orbitron', system-ui);
}

/* ==================
   TIER COLORS
   ================== */

.tier-select.tier-legendary {
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.5);
  background-color: rgba(239, 68, 68, 0.1);
}

.tier-select.tier-mythic {
  color: #f97316;
  border-color: rgba(249, 115, 22, 0.5);
  background-color: rgba(249, 115, 22, 0.1);
}

.tier-select.tier-meta {
  color: #eab308;
  border-color: rgba(234, 179, 8, 0.4);
  background-color: rgba(234, 179, 8, 0.1);
}

.tier-select.tier-excellent {
  color: #a3e635;
  border-color: rgba(163, 230, 53, 0.4);
  background-color: rgba(163, 230, 53, 0.1);
}

.tier-select.tier-great {
  color: #4ade80;
  border-color: rgba(74, 222, 128, 0.4);
  background-color: rgba(74, 222, 128, 0.1);
}

.tier-select.tier-good {
  color: #2dd4bf;
  border-color: rgba(45, 212, 191, 0.4);
  background-color: rgba(45, 212, 191, 0.1);
}

.tier-select.tier-decent {
  color: #60a5fa;
  border-color: rgba(96, 165, 250, 0.4);
  background-color: rgba(96, 165, 250, 0.1);
}

.tier-select.tier-low {
  color: #9ca3af;
  border-color: rgba(156, 163, 175, 0.3);
  background-color: rgba(156, 163, 175, 0.05);
}

/* ==================
   TRANSITIONS
   ================== */

.section-expand-enter-active,
.section-expand-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.section-expand-enter-from,
.section-expand-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.section-expand-enter-to,
.section-expand-leave-from {
  opacity: 1;
  max-height: 1000px;
}

/* ==================
   RESPONSIVE
   ================== */

@media (max-width: 480px) {
  .tier-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.375rem;
  }

  .tier-role-label {
    flex: none;
    font-size: 0.8125rem;
  }

  .tier-select {
    width: 100%;
    max-width: none;
  }
}
</style>
