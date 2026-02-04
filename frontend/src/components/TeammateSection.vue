<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Character, TeammateRec, OwnershipStatus, UserCharacterInvestment, TeammateRating } from '../types';
import TeammateCard from './TeammateCard.vue';
import FeedbackButton from './FeedbackButton.vue';
import ContextualFeedbackModal from './ContextualFeedbackModal.vue';
import type { FeedbackType, FeedbackContext } from './ContextualFeedbackModal.vue';
import { getCharactersWhoWant, groupWantedByRole, type WantedByEntry } from '../utils/relationshipLookup';
import { getTeammatesForComposition, getEffectiveRating, type InvestmentLevel } from '../utils/characterUtils';
import { characters } from '../data';

interface Props {
  character: Character;
  getOwnership: (id: string) => OwnershipStatus;
  getInvestment?: (id: string) => UserCharacterInvestment | undefined;
  // Composition is now controlled by parent (App.vue)
  selectedCompositionId?: string | null;
}

const props = defineProps<Props>();

// View mode: 'recommended' (explicit teammates) or 'wanted' (who wants this character)
type ViewMode = 'recommended' | 'wanted';
const viewMode = ref<ViewMode>('recommended');

type FilterOption = 'all' | 'owned' | 'unowned';
const filter = ref<FilterOption>('all');

type SectionKey = 'amplifiers' | 'sustains' | 'subDPS' | 'dps';
const activeSection = ref<SectionKey>('amplifiers');

// Get selected composition
const selectedComposition = computed(() => {
  if (!props.character.compositions || props.character.compositions.length === 0) return null;

  if (props.selectedCompositionId) {
    return props.character.compositions.find(c => c.id === props.selectedCompositionId) || null;
  }

  // Default to primary composition
  return props.character.compositions.find(c => c.isPrimary) || props.character.compositions[0] || null;
});

// Build section data using composition-aware lookup
const sections = computed(() => {
  // Use composition-aware function to get teammates (using prop from parent)
  const teammates = getTeammatesForComposition(props.character, props.selectedCompositionId || undefined);
  if (!teammates || Object.keys(teammates).length === 0) return [];

  const sectionConfigs: { key: SectionKey; label: string; icon: string; color: string }[] = [
    { key: 'amplifiers', label: 'Amplifiers', icon: '✨', color: '#a855f7' },
    { key: 'sustains', label: 'Sustains', icon: '💚', color: '#10b981' },
    { key: 'subDPS', label: 'Sub-DPS', icon: '🗡️', color: '#f59e0b' },
    { key: 'dps', label: 'DPS', icon: '⚔️', color: '#ef4444' },
  ];

  return sectionConfigs
    .filter(config => teammates[config.key] && teammates[config.key]!.length > 0)
    .map(config => ({
      ...config,
      items: teammates[config.key]!,
    }));
});

// Get active section items
const activeItems = computed((): TeammateRec[] => {
  const section = sections.value.find(s => s.key === activeSection.value);
  if (!section) {
    // Fall back to first available section
    if (sections.value.length > 0) {
      const firstSection = sections.value[0];
      if (firstSection) {
        activeSection.value = firstSection.key;
        return firstSection.items || [];
      }
    }
    return [];
  }
  return section.items || [];
});

// Build investments map for effective rating calculation
const investmentsMap = computed(() => {
  const map = new Map<string, InvestmentLevel>();
  if (props.getInvestment) {
    // Add focal character's investment (this is what drives synergy modifiers)
    const focalInv = props.getInvestment(props.character.id);
    if (focalInv) {
      map.set(props.character.id, {
        eidolonLevel: focalInv.eidolonLevel,
        lightConeId: focalInv.lightConeId,
        lightConeSuperimposition: focalInv.lightConeSuperimposition,
      });
    }
  }
  return map;
});

// Get effective rating for a teammate (considers focal character's investment synergies)
const getTeammateEffectiveRating = (teammateId: string, baseRating: TeammateRating): TeammateRating => {
  if (!props.getInvestment || investmentsMap.value.size === 0) {
    return baseRating;
  }
  return getEffectiveRating(props.character, teammateId, {
    compositionId: props.selectedCompositionId || undefined,
    investments: investmentsMap.value,
  });
};

// Extended teammate rec with effective rating info
interface EnhancedTeammateRec extends TeammateRec {
  effectiveRating: TeammateRating;
  isBoosted: boolean;
}

// Filter and sort items with effective ratings
const filteredItems = computed((): EnhancedTeammateRec[] => {
  let items = activeItems.value.map(item => {
    const effectiveRating = getTeammateEffectiveRating(item.id, item.rating);
    return {
      ...item,
      effectiveRating,
      isBoosted: effectiveRating !== item.rating,
    };
  });

  // Filter by ownership
  if (filter.value === 'owned') {
    items = items.filter(item => {
      const ownership = props.getOwnership(item.id);
      return ownership === 'owned' || ownership === 'concept';
    });
  } else if (filter.value === 'unowned') {
    items = items.filter(item => props.getOwnership(item.id) === 'none');
  }

  // Sort by EFFECTIVE rating (S+ > S > A > B > C > D)
  const ratingOrder: Record<TeammateRating, number> = { 'S+': 0, S: 1, A: 2, B: 3, C: 4, D: 5 };
  items.sort((a, b) => ratingOrder[a.effectiveRating] - ratingOrder[b.effectiveRating]);

  return items;
});

// Stats for current section
const sectionStats = computed(() => {
  const items = activeItems.value;
  const ownedCount = items.filter(item => {
    const ownership = props.getOwnership(item.id);
    return ownership === 'owned' || ownership === 'concept';
  }).length;

  const sRated = items.filter(i => i.rating === 'S').length;

  return {
    total: items.length,
    owned: ownedCount,
    sRated,
  };
});

// Get active section config
const activeSectionConfig = computed(() => {
  return sections.value.find(s => s.key === activeSection.value);
});

// === "Characters Who Want Me" Section ===

// Get all characters who want this character
const wantedByEntries = computed(() => {
  return getCharactersWhoWant(props.character.id);
});

// Group by the role of characters who want this character
const wantedByGrouped = computed(() => {
  return groupWantedByRole(wantedByEntries.value);
});

// Active wanted-by section
type WantedBySection = 'dps' | 'supports' | 'sustains';
const activeWantedSection = ref<WantedBySection>('dps');

// Wanted-by section configs
const wantedBySections = computed(() => {
  const configs: { key: WantedBySection; label: string; icon: string; color: string; items: WantedByEntry[] }[] = [
    { key: 'dps', label: 'DPS', icon: '⚔️', color: '#ef4444', items: wantedByGrouped.value.dps },
    { key: 'supports', label: 'Supports', icon: '✨', color: '#a855f7', items: wantedByGrouped.value.supports },
    { key: 'sustains', label: 'Sustains', icon: '💚', color: '#10b981', items: wantedByGrouped.value.sustains },
  ];

  return configs.filter(c => c.items.length > 0);
});

// Get active wanted-by items with filtering
const activeWantedItems = computed((): WantedByEntry[] => {
  const section = wantedBySections.value.find(s => s.key === activeWantedSection.value);
  if (!section) {
    // Fall back to first available section
    if (wantedBySections.value.length > 0 && wantedBySections.value[0]) {
      activeWantedSection.value = wantedBySections.value[0].key;
      return wantedBySections.value[0].items;
    }
    return [];
  }
  return section.items;
});

// Filtered wanted-by items
const filteredWantedItems = computed(() => {
  let items = [...activeWantedItems.value];

  // Filter by ownership
  if (filter.value === 'owned') {
    items = items.filter(item => {
      const ownership = props.getOwnership(item.character.id);
      return ownership === 'owned' || ownership === 'concept';
    });
  } else if (filter.value === 'unowned') {
    items = items.filter(item => props.getOwnership(item.character.id) === 'none');
  }

  return items;
});

// Stats for wanted-by section
const wantedByStats = computed(() => {
  const items = activeWantedItems.value;
  const ownedCount = items.filter(item => {
    const ownership = props.getOwnership(item.character.id);
    return ownership === 'owned' || ownership === 'concept';
  }).length;

  const sRated = items.filter(i => i.rating === 'S').length;

  return {
    total: items.length,
    owned: ownedCount,
    sRated,
    totalAll: wantedByEntries.value.length,
  };
});

// Get active wanted section config
const activeWantedSectionConfig = computed(() => {
  return wantedBySections.value.find(s => s.key === activeWantedSection.value);
});

// ==================
// CONTEXTUAL FEEDBACK
// ==================

const showFeedbackModal = ref(false);
const feedbackType = ref<FeedbackType>('teammate-missing');
const feedbackContext = ref<FeedbackContext>({});

function openTeammateMissingFeedback() {
  feedbackType.value = 'teammate-missing';
  feedbackContext.value = {
    characterId: props.character.id,
    characterName: props.character.name,
    role: activeSection.value,
  };
  showFeedbackModal.value = true;
}

function closeFeedbackModal() {
  showFeedbackModal.value = false;
}
</script>

<template>
  <div class="teammate-section" v-if="sections.length > 0 || wantedByEntries.length > 0">
    <!-- View Mode Toggle -->
    <div class="view-mode-toggle">
      <button
        @click="viewMode = 'recommended'"
        class="view-mode-btn"
        :class="{ active: viewMode === 'recommended' }"
        :disabled="sections.length === 0"
      >
        <span class="btn-icon">◈</span>
        <span class="btn-text">Recommended For {{ character.name }}</span>
        <span v-if="sections.length > 0" class="btn-count">{{ sections.reduce((sum, s) => sum + s.items.length, 0) }}</span>
      </button>
      <button
        @click="viewMode = 'wanted'"
        class="view-mode-btn"
        :class="{ active: viewMode === 'wanted' }"
        :disabled="wantedByEntries.length === 0"
      >
        <span class="btn-icon">◇</span>
        <span class="btn-text">Characters Who Want {{ character.name }}</span>
        <span v-if="wantedByEntries.length > 0" class="btn-count">{{ wantedByEntries.length }}</span>
      </button>
    </div>

    <!-- ========== RECOMMENDED VIEW ========== -->
    <template v-if="viewMode === 'recommended' && sections.length > 0">
      <!-- Section Header with Holographic Effect -->
      <div class="section-header">
        <div class="header-left">
          <div class="header-icon">
            <span class="icon-glyph">◈</span>
            <div class="icon-ring"></div>
          </div>
          <div class="header-text">
            <h2 class="section-title">Recommended Teammates</h2>
            <p class="section-subtitle">
              {{ sectionStats.owned }}/{{ sectionStats.total }} {{ activeSectionConfig?.label || 'teammates' }} available
            </p>
          </div>
        </div>

        <!-- Filter Pills -->
        <div class="filter-pills">
          <button
            v-for="opt in ['all', 'owned', 'unowned'] as const"
            :key="opt"
            @click="filter = opt"
            class="filter-pill"
            :class="{ active: filter === opt }"
          >
            {{ opt === 'all' ? 'All' : opt === 'owned' ? 'Available' : 'Missing' }}
          </button>
        </div>

        <!-- Feedback Button -->
        <FeedbackButton
          label="Someone missing?"
          tooltip="Report a missing teammate recommendation"
          size="sm"
          @click="openTeammateMissingFeedback"
        />
      </div>

      <!-- Composition Requirements -->
      <div
        v-if="selectedComposition && (selectedComposition.core || selectedComposition.pathRequirements || selectedComposition.labelRequirements)"
        class="composition-requirements"
      >
        <!-- Core Requirements -->
        <div v-if="selectedComposition.core && selectedComposition.core.length > 0" class="requirement-section">
          <div class="requirement-header">
            <span class="requirement-icon">⚡</span>
            <span class="requirement-title">Core Requirements</span>
          </div>
          <div class="requirement-items">
            <div
              v-for="coreReq in selectedComposition.core"
              :key="coreReq.characterId"
              class="requirement-item core"
            >
              <span class="req-text">
                <strong>{{ characters.find(c => c.id === coreReq.characterId)?.name || coreReq.characterId }}</strong>
                <span v-if="coreReq.minEidolon" class="req-eidolon">E{{ coreReq.minEidolon }}+</span>
              </span>
              <span class="req-reason">{{ coreReq.reason }}</span>
            </div>
          </div>
        </div>

        <!-- Path Requirements -->
        <div v-if="selectedComposition.pathRequirements && selectedComposition.pathRequirements.length > 0" class="requirement-section">
          <div class="requirement-header">
            <span class="requirement-icon">🛤️</span>
            <span class="requirement-title">Path Requirements</span>
          </div>
          <div class="requirement-items">
            <div
              v-for="pathReq in selectedComposition.pathRequirements"
              :key="pathReq.path"
              class="requirement-item path"
            >
              <span class="req-text">
                <strong>{{ pathReq.count }}× {{ pathReq.path }}</strong>
              </span>
              <span class="req-reason">{{ pathReq.reason }}</span>
            </div>
          </div>
        </div>

        <!-- Label Requirements -->
        <div v-if="selectedComposition.labelRequirements && selectedComposition.labelRequirements.length > 0" class="requirement-section">
          <div class="requirement-header">
            <span class="requirement-icon">🏷️</span>
            <span class="requirement-title">Label Requirements</span>
          </div>
          <div class="requirement-items">
            <div
              v-for="labelReq in selectedComposition.labelRequirements"
              :key="labelReq.label"
              class="requirement-item label"
            >
              <span class="req-text">
                <strong>{{ labelReq.count }}× {{ labelReq.label }}</strong>
              </span>
              <span class="req-reason">{{ labelReq.reason }}</span>
            </div>
          </div>
        </div>
      </div>

    <!-- Category Tabs -->
    <div class="category-tabs">
      <button
        v-for="section in sections"
        :key="section.key"
        @click="activeSection = section.key"
        class="category-tab"
        :class="{ active: activeSection === section.key }"
        :style="{ '--tab-color': section.color }"
      >
        <span class="tab-icon">{{ section.icon }}</span>
        <span class="tab-label">{{ section.label }}</span>
        <span class="tab-count">{{ section.items.length }}</span>
        <div class="tab-indicator"></div>
      </button>
    </div>

    <!-- Teammate Grid -->
    <div class="teammate-grid">
      <div
        v-for="(item, index) in filteredItems"
        :key="item.id"
        :style="{ '--card-delay': `${index * 0.05}s` }"
        class="grid-item"
      >
        <TeammateCard
          :teammate-id="item.id"
          :rating="item.effectiveRating"
          :base-rating="item.rating"
          :is-boosted="item.isBoosted"
          :reason="item.reason"
          :ownership="getOwnership(item.id)"
          :their-investment-modifiers="item.theirInvestmentModifiers"
          :get-investment="getInvestment"
          :focal-character-id="character.id"
          :focal-character-name="character.name"
        />
      </div>

      <!-- Empty State -->
      <div v-if="filteredItems.length === 0" class="empty-state">
        <div class="empty-icon">◇</div>
        <p v-if="filter === 'owned'">No available {{ activeSectionConfig?.label?.toLowerCase() }} in your roster</p>
        <p v-else-if="filter === 'unowned'">You have all recommended {{ activeSectionConfig?.label?.toLowerCase() }}!</p>
        <p v-else>No teammates configured for this category</p>
      </div>
    </div>

    <!-- Rating Legend -->
    <div class="rating-legend">
      <div class="legend-title">Rating Guide</div>
      <div class="legend-items">
        <div class="legend-item s">
          <span class="legend-badge">S</span>
          <span class="legend-text">Best in Slot</span>
        </div>
        <div class="legend-item a">
          <span class="legend-badge">A</span>
          <span class="legend-text">Great Choice</span>
        </div>
        <div class="legend-item b">
          <span class="legend-badge">B</span>
          <span class="legend-text">Good Option</span>
        </div>
        <div class="legend-item c">
          <span class="legend-badge">C</span>
          <span class="legend-text">Viable</span>
        </div>
        <div class="legend-item d">
          <span class="legend-badge">D</span>
          <span class="legend-text">Last Resort</span>
        </div>
      </div>
    </div>
    </template>

    <!-- ========== WANTED BY VIEW ========== -->
    <template v-if="viewMode === 'wanted' && wantedByEntries.length > 0">
      <!-- Section Header -->
      <div class="section-header">
        <div class="header-left">
          <div class="header-icon wanted">
            <span class="icon-glyph">◇</span>
            <div class="icon-ring"></div>
          </div>
          <div class="header-text">
            <h2 class="section-title">Characters Who Want {{ character.name }}</h2>
            <p class="section-subtitle">
              {{ wantedByStats.owned }}/{{ wantedByStats.total }} {{ activeWantedSectionConfig?.label || 'characters' }} available
              <span class="subtitle-note">({{ wantedByStats.totalAll }} total)</span>
            </p>
          </div>
        </div>

        <!-- Filter Pills -->
        <div class="filter-pills">
          <button
            v-for="opt in ['all', 'owned', 'unowned'] as const"
            :key="opt"
            @click="filter = opt"
            class="filter-pill"
            :class="{ active: filter === opt }"
          >
            {{ opt === 'all' ? 'All' : opt === 'owned' ? 'Available' : 'Missing' }}
          </button>
        </div>
      </div>

      <!-- Category Tabs for Wanted By -->
      <div class="category-tabs" v-if="wantedBySections.length > 0">
        <button
          v-for="section in wantedBySections"
          :key="section.key"
          @click="activeWantedSection = section.key"
          class="category-tab"
          :class="{ active: activeWantedSection === section.key }"
          :style="{ '--tab-color': section.color }"
        >
          <span class="tab-icon">{{ section.icon }}</span>
          <span class="tab-label">{{ section.label }}</span>
          <span class="tab-count">{{ section.items.length }}</span>
          <div class="tab-indicator"></div>
        </button>
      </div>

      <!-- Wanted By Grid -->
      <div class="teammate-grid wanted-by-grid">
        <div
          v-for="(item, index) in filteredWantedItems"
          :key="item.character.id"
          :style="{ '--card-delay': `${index * 0.05}s` }"
          class="grid-item"
        >
          <div class="wanted-by-card">
            <TeammateCard
              :teammate-id="item.character.id"
              :rating="item.rating"
              :reason="item.reason"
              :ownership="getOwnership(item.character.id)"
              :get-investment="getInvestment"
              :focal-character-id="character.id"
              :focal-character-name="character.name"
            />
            <div class="wanted-by-context">
              <span class="context-label">As {{ item.category === 'dps' ? 'DPS' : item.category === 'subDPS' ? 'Sub-DPS' : item.category }}</span>
              <span v-if="item.compositionContext" class="composition-context-badge" :title="`Best in ${item.compositionContext.compositionName} composition`">
                {{ item.compositionContext.compositionName }}
              </span>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-if="filteredWantedItems.length === 0" class="empty-state">
          <div class="empty-icon">◇</div>
          <p v-if="filter === 'owned'">No available {{ activeWantedSectionConfig?.label?.toLowerCase() }} in your roster</p>
          <p v-else-if="filter === 'unowned'">You have all {{ activeWantedSectionConfig?.label?.toLowerCase() }} who want {{ character.name }}!</p>
          <p v-else>No characters in this category want {{ character.name }}</p>
        </div>
      </div>

      <!-- Info Note -->
      <div class="wanted-by-note">
        <span class="note-icon">ℹ️</span>
        <span class="note-text">
          These ratings are from each character's perspective &mdash; how good {{ character.name }} is for their team.
        </span>
      </div>
    </template>

    <!-- Contextual Feedback Modal -->
    <ContextualFeedbackModal
      :is-open="showFeedbackModal"
      :feedback-type="feedbackType"
      :context="feedbackContext"
      @close="closeFeedbackModal"
    />
  </div>
</template>

<style scoped>
.teammate-section {
  position: relative;
}

/* View Mode Toggle */
.view-mode-toggle {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  padding: 0.375rem;
  background: rgba(12, 12, 28, 0.8);
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.view-mode-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;
  padding: 0.875rem 1rem;
  background: transparent;
  border: none;
  border-radius: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
}

.view-mode-btn:hover:not(:disabled) {
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.05);
}

.view-mode-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.view-mode-btn.active {
  color: white;
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(139, 92, 246, 0.15));
  box-shadow: 0 0 20px rgba(168, 85, 247, 0.15);
}

.view-mode-btn .btn-icon {
  font-size: 1.125rem;
  opacity: 0.8;
}

.view-mode-btn.active .btn-icon {
  opacity: 1;
  text-shadow: 0 0 10px rgba(168, 85, 247, 0.5);
}

.view-mode-btn .btn-text {
  font-weight: 500;
}

.view-mode-btn .btn-count {
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  padding: 0.125rem 0.5rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 9999px;
  color: rgba(255, 255, 255, 0.6);
}

.view-mode-btn.active .btn-count {
  background: rgba(168, 85, 247, 0.4);
  color: white;
}

/* Section Header */
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
  flex-wrap: wrap;
  gap: 0.75rem;
}

@media (min-width: 768px) {
  .section-header {
    margin-bottom: 1.5rem;
    gap: 1rem;
  }
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.header-icon {
  position: relative;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-glyph {
  font-size: 1.5rem;
  color: rgba(168, 85, 247, 0.9);
  text-shadow: 0 0 20px rgba(168, 85, 247, 0.5);
  z-index: 1;
}

.icon-ring {
  position: absolute;
  inset: 0;
  border: 2px solid rgba(168, 85, 247, 0.3);
  border-radius: 12px;
  animation: icon-pulse 3s ease-in-out infinite;
}

@keyframes icon-pulse {
  0%, 100% { transform: scale(1); opacity: 0.3; }
  50% { transform: scale(1.1); opacity: 0.15; }
}

.section-title {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
  color: white;
  margin: 0;
}

@media (min-width: 768px) {
  .section-title {
    font-size: 1.25rem;
  }
}

.section-subtitle {
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.5);
  margin: 0.25rem 0 0;
}

/* Filter Pills */
.filter-pills {
  display: flex;
  gap: 0.25rem;
  padding: 0.25rem;
  background: rgba(20, 20, 42, 0.6);
  border-radius: 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.05);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.filter-pills::-webkit-scrollbar {
  display: none;
}

@media (min-width: 768px) {
  .filter-pills {
    gap: 0.375rem;
    border-radius: 0.75rem;
  }
}

.filter-pill {
  padding: 0.375rem 0.75rem;
  font-size: 0.6875rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.5);
  background: transparent;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  flex-shrink: 0;
}

@media (min-width: 768px) {
  .filter-pill {
    padding: 0.5rem 1rem;
    font-size: 0.75rem;
    border-radius: 0.5rem;
  }
}

.filter-pill:hover {
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.05);
}

.filter-pill.active {
  color: white;
  background: rgba(168, 85, 247, 0.2);
  box-shadow: 0 0 10px rgba(168, 85, 247, 0.2);
}

/* Category Tabs */
.category-tabs {
  display: flex;
  gap: 0.375rem;
  margin-bottom: 1rem;
  padding: 0.25rem;
  background: rgba(15, 15, 35, 0.6);
  border-radius: 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.05);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.category-tabs::-webkit-scrollbar {
  display: none;
}

@media (min-width: 768px) {
  .category-tabs {
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    padding: 0.375rem;
    border-radius: 1rem;
  }
}

.category-tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.625rem 0.875rem;
  background: transparent;
  border: none;
  border-radius: 0.5rem;
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
  flex-shrink: 0;
}

@media (min-width: 768px) {
  .category-tab {
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    border-radius: 0.75rem;
    font-size: 0.875rem;
  }
}

.category-tab:hover {
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.05);
}

.category-tab.active {
  color: white;
  background: rgba(255, 255, 255, 0.08);
}

.tab-icon {
  font-size: 1rem;
}

.tab-count {
  font-size: 0.6875rem;
  font-family: var(--font-mono);
  padding: 0.125rem 0.375rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.6);
}

.category-tab.active .tab-count {
  background: var(--tab-color);
  background: linear-gradient(135deg, var(--tab-color), color-mix(in srgb, var(--tab-color), black 20%));
  color: white;
}

.tab-indicator {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 2px;
  background: var(--tab-color);
  border-radius: 1px;
  transition: width 0.3s;
  box-shadow: 0 0 8px var(--tab-color);
}

.category-tab.active .tab-indicator {
  width: 60%;
}

/* Teammate Grid */
.teammate-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.75rem;
}

@media (min-width: 768px) {
  .teammate-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }
}

.grid-item {
  animation: grid-reveal 0.4s ease-out both;
  animation-delay: var(--card-delay, 0s);
}

@keyframes grid-reveal {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Empty State */
.empty-state {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  text-align: center;
  color: rgba(255, 255, 255, 0.4);
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.3;
}

.empty-state p {
  margin: 0;
  font-size: 0.9375rem;
}

/* Rating Legend */
.rating-legend {
  margin-top: 2rem;
  padding: 1rem 1.25rem;
  background: rgba(15, 15, 35, 0.5);
  border-radius: 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.legend-title {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 0.75rem;
}

.legend-items {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.legend-badge {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  font-family: var(--font-display);
  font-size: 0.6875rem;
  font-weight: 800;
  color: white;
}

.legend-item.s .legend-badge {
  background: linear-gradient(135deg, #ff9500, #ff6b00);
  box-shadow: 0 0 10px rgba(255, 149, 0, 0.4);
}

.legend-item.a .legend-badge {
  background: linear-gradient(135deg, #a855f7, #8b5cf6);
}

.legend-item.b .legend-badge {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
}

.legend-item.c .legend-badge {
  background: linear-gradient(135deg, #6b7280, #4b5563);
}

.legend-item.d .legend-badge {
  background: linear-gradient(135deg, #374151, #1f2937);
}

.legend-text {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
}

/* Wanted By View Styles */
.header-icon.wanted .icon-glyph {
  color: rgba(16, 185, 129, 0.9);
  text-shadow: 0 0 20px rgba(16, 185, 129, 0.5);
}

.header-icon.wanted .icon-ring {
  border-color: rgba(16, 185, 129, 0.3);
}

.subtitle-note {
  color: rgba(255, 255, 255, 0.35);
  font-size: 0.75rem;
}

.wanted-by-card {
  position: relative;
}

.wanted-by-context {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
}

.context-label {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.25rem 0.5rem;
  background: rgba(16, 185, 129, 0.2);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 4px;
  color: rgba(16, 185, 129, 0.9);
}

.composition-context-badge {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.25rem 0.5rem;
  background: rgba(139, 92, 246, 0.2);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 4px;
  color: rgba(168, 85, 247, 0.9);
}

.wanted-by-note {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 1.5rem;
  padding: 1rem 1.25rem;
  background: rgba(16, 185, 129, 0.05);
  border: 1px solid rgba(16, 185, 129, 0.15);
  border-radius: 0.75rem;
}

.note-icon {
  font-size: 1rem;
  flex-shrink: 0;
}

.note-text {
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.5;
}

/* ========== COMPOSITION SELECTOR ========== */
.composition-selector {
  margin-bottom: 1.5rem;
  padding: 1rem 1.25rem;
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.08), rgba(139, 92, 246, 0.04));
  border: 1px solid rgba(168, 85, 247, 0.2);
  border-radius: 1rem;
}

.composition-header {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}

.composition-label {
  font-family: var(--font-display);
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(168, 85, 247, 0.9);
}

.composition-hint {
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.4);
}

.composition-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.composition-tab {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  background: rgba(20, 20, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.composition-tab:hover {
  background: rgba(168, 85, 247, 0.1);
  border-color: rgba(168, 85, 247, 0.3);
  color: rgba(255, 255, 255, 0.9);
}

.composition-tab.active {
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(139, 92, 246, 0.2));
  border-color: rgba(168, 85, 247, 0.5);
  color: white;
  box-shadow: 0 0 15px rgba(168, 85, 247, 0.2);
}

.composition-tab .comp-name {
  white-space: nowrap;
}

.composition-tab .primary-badge {
  color: #fbbf24;
  font-size: 0.75rem;
}

.composition-info {
  padding-top: 0.75rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.comp-description {
  margin: 0 0 0.75rem;
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.5;
}

/* Weak Modes Warning Styles */
.comp-weak-modes {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 0.5rem;
  margin-top: 0.5rem;
}

.weak-label {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(239, 68, 68, 0.9);
}

.weak-modes-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.weak-badge {
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.25rem 0.625rem;
  border-radius: 4px;
  background: rgba(239, 68, 68, 0.1);
  color: rgba(239, 68, 68, 0.9);
  border: 1px solid rgba(239, 68, 68, 0.25);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 640px) {
  .composition-selector {
    padding: 0.875rem 1rem;
  }

  .composition-header {
    flex-direction: column;
    gap: 0.25rem;
  }

  .composition-tabs {
    gap: 0.375rem;
  }

  .composition-tab {
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
  }

  .comp-weak-modes {
    padding: 0.5rem;
  }

  .weak-badge {
    font-size: 0.6875rem;
    padding: 0.1875rem 0.5rem;
  }

  .composition-requirements {
    padding: 0.75rem;
  }

  .requirement-section {
    margin-bottom: 0.75rem;
  }

  .requirement-header {
    font-size: 0.75rem;
    margin-bottom: 0.375rem;
  }

  .requirement-items {
    gap: 0.375rem;
  }

  .requirement-item {
    padding: 0.5rem;
    font-size: 0.75rem;
  }

  .req-text {
    font-size: 0.75rem;
  }

  .req-eidolon {
    font-size: 0.6875rem;
  }

  .req-reason {
    font-size: 0.6875rem;
  }
}

/* Composition Requirements Styles */
.composition-requirements {
  background: rgba(20, 20, 42, 0.4);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 0.75rem;
  padding: 1rem;
  margin: 1rem 0;
}

.requirement-section {
  margin-bottom: 1rem;
}

.requirement-section:last-child {
  margin-bottom: 0;
}

.requirement-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.requirement-icon {
  font-size: 1rem;
}

.requirement-title {
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.requirement-items {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.requirement-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 0.5rem;
  border-left: 3px solid;
}

.requirement-item.core {
  border-left-color: #f59e0b;
}

.requirement-item.path {
  border-left-color: #3b82f6;
}

.requirement-item.label {
  border-left-color: #10b981;
}

.req-text {
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.95);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.req-eidolon {
  padding: 0.125rem 0.375rem;
  background: rgba(245, 158, 11, 0.2);
  border-radius: 0.25rem;
  font-size: 0.75rem;
  color: #fbbf24;
  font-weight: 600;
}

.req-reason {
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.6);
  font-style: italic;
}
</style>
