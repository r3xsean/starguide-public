<script setup lang="ts">
import { ref, computed, reactive } from 'vue';
import type { Character, TeammateRating } from '../types';
import CharacterCard from './CharacterCard.vue';
import type { PullVerdict, TeamAnalysis, DPSTeamBuildingAnalysis } from '../utils/characterUtils';
import { regenerateTeamAnalysisForComposition, regenerateDPSAnalysisForComposition } from '../utils/characterUtils';

// ==================
// PROPS
// ==================

interface WantedByEntry {
  name: string;
  rating: TeammateRating;
  reason?: string;
  asSubDPS?: boolean;
  eidolonRequirement?: number;
  currentEidolon?: number;
}

interface Props {
  // Character info
  character: Character | null;
  characterId: string;
  owned: boolean;
  isNew?: boolean;

  // Rating and ranking
  rating: string;
  rank: number;

  // Role info (for display tag)
  roleLabel: string;
  roleClass: string; // CSS class: 'support' | 'dps' | 'amplifier' | 'sustain' | 'subDPS'

  // Wanted by list
  wantedBy: WantedByEntry[];
  wantedByLabel: string; // e.g., "DPS", "supports", "characters"

  // Analysis results
  teamAnalysis: TeamAnalysis[];
  dpsTeamAnalysis?: DPSTeamBuildingAnalysis | null; // For DPS recommendations
  verdict: PullVerdict;

  // Reasoning for owned/no-data cases
  reasoning?: string[];

  // UI Variations
  showDismissButton?: boolean;
  showTooltips?: boolean;

  // Animation index
  index?: number;

  // For team analysis recomputation
  allCharacters?: Character[];
  ownedCharacterIds?: Set<string>;
}

const props = withDefaults(defineProps<Props>(), {
  isNew: false,
  reasoning: () => [],
  teamAnalysis: () => [],
  dpsTeamAnalysis: null,
  showDismissButton: false,
  showTooltips: false,
  index: 0,
  allCharacters: () => [],
  ownedCharacterIds: () => new Set(),
});

const emit = defineEmits<{
  'select-character': [characterId: string];
  'dismiss': [characterId: string];
  'show-tooltip': [key: string, reason: string, event: Event];
  'hide-tooltip': [];
  'toggle-tooltip': [key: string, reason: string, event: Event];
}>();

// ==================
// STATE
// ==================

const isExpanded = ref(false);

// Track selected composition per DPS (reactive map)
const selectedCompositions = reactive<Record<string, string>>({});

// Track dropdown open state per DPS
const dropdownOpen = reactive<Record<string, boolean>>({});

// Initialize selected compositions from team analysis
const initializeSelectedCompositions = () => {
  for (const team of props.teamAnalysis) {
    if (!selectedCompositions[team.dpsId]) {
      selectedCompositions[team.dpsId] = team.compositionId;
    }
  }
};
initializeSelectedCompositions();

const toggleDropdown = (dpsId: string, event: Event) => {
  event.stopPropagation();
  dropdownOpen[dpsId] = !dropdownOpen[dpsId];
};

const selectComposition = (dpsId: string, compositionId: string, event: Event) => {
  event.stopPropagation();
  handleCompositionChange(dpsId, compositionId);
  dropdownOpen[dpsId] = false;
};

// Computed team analysis with user-selected compositions
const displayedTeamAnalysis = computed(() => {
  return props.teamAnalysis.map(team => {
    const selectedCompId = selectedCompositions[team.dpsId] || team.compositionId;

    // If composition hasn't changed, return original
    if (selectedCompId === team.compositionId) {
      return team;
    }

    // Regenerate for new composition
    const regenerated = regenerateTeamAnalysisForComposition(
      team.dps,
      selectedCompId,
      props.characterId,
      team.recommendedRating,
      props.ownedCharacterIds,
      props.allCharacters
    );

    if (!regenerated) return team;

    return {
      ...team,
      ...regenerated,
    };
  });
});

const handleCompositionChange = (dpsId: string, newCompositionId: string) => {
  selectedCompositions[dpsId] = newCompositionId;
};

// DPS composition selection (for DPS recommendations)
const selectedDPSComposition = ref<string>('');

// Initialize DPS composition from analysis
const initializeDPSComposition = () => {
  if (props.dpsTeamAnalysis && !selectedDPSComposition.value) {
    selectedDPSComposition.value = props.dpsTeamAnalysis.compositionId;
  }
};
initializeDPSComposition();

// Track DPS dropdown open state
const dpsDropdownOpen = ref(false);

const toggleDPSDropdown = (event: Event) => {
  event.stopPropagation();
  dpsDropdownOpen.value = !dpsDropdownOpen.value;
};

const selectDPSComposition = (compositionId: string, event: Event) => {
  event.stopPropagation();
  selectedDPSComposition.value = compositionId;
  dpsDropdownOpen.value = false;
};

// Computed DPS analysis with user-selected composition
const displayedDPSAnalysis = computed(() => {
  if (!props.dpsTeamAnalysis || !props.character) return null;

  const selectedCompId = selectedDPSComposition.value || props.dpsTeamAnalysis.compositionId;

  // If composition hasn't changed, return original
  if (selectedCompId === props.dpsTeamAnalysis.compositionId) {
    return props.dpsTeamAnalysis;
  }

  // Regenerate for new composition
  const regenerated = regenerateDPSAnalysisForComposition(
    props.character,
    selectedCompId,
    props.ownedCharacterIds,
    props.allCharacters
  );

  if (!regenerated) return props.dpsTeamAnalysis;

  return {
    ...props.dpsTeamAnalysis,
    ...regenerated,
  };
});

const toggleExpanded = (event: Event) => {
  event.stopPropagation();
  isExpanded.value = !isExpanded.value;
  // Initialize compositions when expanding
  if (isExpanded.value) {
    initializeSelectedCompositions();
    initializeDPSComposition();
  }
};

// ==================
// HELPERS
// ==================

const getBaseRating = (rating: string): string => {
  return rating.charAt(0).toLowerCase();
};

const getVerdictEmoji = (level: string) => {
  switch (level) {
    // Support verdicts
    case 'critical': return '◆';
    case 'strong': return '◇';
    case 'flex': return '○';
    // DPS verdicts
    case 'ready': return '✓';
    case 'viable': return '◇';
    case 'weak': return '!';
    // Shared
    case 'skip': return '−';
    default: return '○';
  }
};

const getStatusClass = (type: string) => {
  switch (type) {
    case 'fills': return 'fills';
    case 'upgrades': return 'upgrades';
    case 'sidegrade': return 'sidegrade';
    case 'low': return 'low';
    default: return 'sidegrade';
  }
};

// Get status type for a character in the wantedBy list
const getStatusTypeForCharacter = (characterName: string): 'fills' | 'upgrades' | 'sidegrade' | 'low' | null => {
  const teamEntry = displayedTeamAnalysis.value.find(t => t.dpsName === characterName);
  return teamEntry?.status.type || null;
};

// Get arrow icon for status type
const getStatusArrow = (type: 'fills' | 'upgrades' | 'sidegrade' | 'low' | null): string => {
  if (!type) return '';
  if (type === 'fills' || type === 'upgrades') return '↑';
  if (type === 'sidegrade') return '↔';
  if (type === 'low') return '↓';
  return '';
};

// Get synergy reason for a character in the teamAnalysis
const getReasonForTeam = (dpsName: string): string | undefined => {
  const wantedByEntry = props.wantedBy.find(w => w.name === dpsName);
  return wantedByEntry?.reason;
};

// DPS status helpers
const getDPSStatusClass = (type: string) => {
  switch (type) {
    case 'ready': return 'ready';
    case 'almost': return 'almost';
    case 'partial': return 'partial';
    case 'hard': return 'hard';
    default: return 'partial';
  }
};

const getDPSStatusIcon = (type: string) => {
  switch (type) {
    case 'ready': return '✓';
    case 'almost': return '◐';
    case 'partial': return '◔';
    case 'hard': return '✗';
    default: return '◔';
  }
};

// Check if this is a DPS recommendation (has dpsTeamAnalysis)
const isDPSRecommendation = computed(() => {
  return props.dpsTeamAnalysis !== null && props.dpsTeamAnalysis !== undefined;
});

// Check if there's content to show in expanded panel
const hasExpandableContent = computed(() => {
  if (isDPSRecommendation.value) {
    return displayedDPSAnalysis.value !== null;
  }
  return props.teamAnalysis.length > 0;
});

const handleDismiss = (event: Event) => {
  event.stopPropagation();
  emit('dismiss', props.characterId);
};

const handleCharacterClick = () => {
  if (props.character) {
    emit('select-character', props.character.id);
  }
};

// Computed for card style
const cardStyle = computed(() => ({
  '--index': props.index
}));
</script>

<template>
  <article
    class="rec-card"
    :class="{
      expanded: isExpanded,
      owned: owned,
      [`verdict-${verdict.level}`]: !owned
    }"
    :style="cardStyle"
  >
    <!-- Card Header -->
    <div class="rec-header">
      <div class="rec-rank">#{{ rank }}</div>
      <span v-if="isNew && !owned" class="new-badge">NEW</span>
      <div v-if="!owned && character" class="rec-verdict" :class="verdict.level">
        <span class="verdict-symbol">{{ getVerdictEmoji(verdict.level) }}</span>
        <span class="verdict-label">{{ verdict.level.toUpperCase() }}</span>
      </div>
      <span v-if="owned" class="owned-badge">OWNED</span>
      <button
        v-if="showDismissButton && !owned"
        class="rec-dismiss"
        title="Hide this recommendation"
        @click="handleDismiss"
      >
        <svg viewBox="0 0 20 20" fill="currentColor"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
      </button>
    </div>

    <!-- Character Zone -->
    <div class="rec-character" @click="handleCharacterClick">
      <CharacterCard
        v-if="character"
        :character="character"
        :ownership="owned ? 'owned' : 'none'"
        size="md"
        :show-tier="true"
      />
      <div v-else class="placeholder-portrait">
        <span class="placeholder-icon">?</span>
      </div>
      <div class="rec-char-info">
        <h3 class="rec-name">{{ character?.name || characterId }}</h3>
        <span class="rec-role" :class="roleClass">{{ roleLabel }}</span>
      </div>
    </div>

    <!-- Wanted By Section (only for supports, not DPS) -->
    <div v-if="wantedBy.length > 0 && !isDPSRecommendation" class="rec-wanted">
      <span class="rec-wanted-label">Wanted by {{ wantedBy.length }} {{ wantedByLabel }}:</span>
      <div class="rec-wanted-list">
        <span
          v-for="(w, i) in wantedBy"
          :key="i"
          class="wanted-chip"
          :class="{ subdps: w.asSubDPS, active: false }"
          @mouseenter="showTooltips && w.reason && emit('show-tooltip', `${characterId}-${i}`, w.reason, $event)"
          @mouseleave="showTooltips && emit('hide-tooltip')"
          @click.stop="showTooltips && w.reason && emit('toggle-tooltip', `${characterId}-${i}`, w.reason, $event)"
        >
          <span v-if="getStatusTypeForCharacter(w.name)" class="status-arrow" :class="getStatusClass(getStatusTypeForCharacter(w.name)!)">
            {{ getStatusArrow(getStatusTypeForCharacter(w.name)) }}
          </span>
          {{ w.name }}
          <span v-if="w.asSubDPS" class="subdps-tag">sub</span>
          <span v-if="w.eidolonRequirement" class="eidolon-req">E{{ w.eidolonRequirement }}+</span>
          <span class="wanted-badge" :class="`rating-${getBaseRating(w.rating)}`">{{ w.rating }}</span>
        </span>
      </div>
    </div>

    <!-- Reasoning (for owned or no-data) -->
    <ul v-if="(owned || !character) && reasoning.length > 0" class="reasoning-list">
      <li v-for="(reason, i) in reasoning" :key="i">{{ reason }}</li>
    </ul>

    <!-- Expand Button (only for supports, not DPS) -->
    <button
      v-if="!owned && character && hasExpandableContent && !isDPSRecommendation"
      class="rec-expand"
      @click="toggleExpanded"
    >
      <span v-if="!isExpanded">
        <svg viewBox="0 0 20 20" fill="currentColor" class="expand-icon"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" /></svg>
        Show details
      </span>
      <span v-else>
        <svg viewBox="0 0 20 20" fill="currentColor" class="expand-icon"><path fill-rule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 01-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clip-rule="evenodd" /></svg>
        Hide details
      </span>
    </button>

    <!-- DPS Recommendation: Always expanded inline -->
    <div v-if="isDPSRecommendation && displayedDPSAnalysis && !owned" class="rec-panel dps-always-expanded" @click.stop>
      <div class="dps-team-entry">
        <!-- Composition Header -->
        <div class="dps-composition-header">
          <!-- Composition Dropdown -->
          <div v-if="displayedDPSAnalysis.allCompositions.length > 1" class="composition-dropdown">
            <button
              class="composition-button"
              @click="toggleDPSDropdown($event)"
            >
              <span class="composition-name">{{ displayedDPSAnalysis.compositionName }}</span>
              <svg class="dropdown-icon" :class="{ 'dropdown-icon-open': dpsDropdownOpen }" width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>

            <Transition name="dropdown-fade">
              <div v-if="dpsDropdownOpen" class="composition-menu">
                <button
                  v-for="comp in displayedDPSAnalysis.allCompositions"
                  :key="comp.id"
                  class="composition-option"
                  :class="{ 'composition-option-selected': comp.id === (selectedDPSComposition || displayedDPSAnalysis.compositionId) }"
                  @click="selectDPSComposition(comp.id, $event)"
                >
                  <span class="composition-option-name">{{ comp.name }}</span>
                  <svg v-if="comp.id === (selectedDPSComposition || displayedDPSAnalysis.compositionId)" class="check-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M11.5 3.5L5.5 9.5L2.5 6.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
              </div>
            </Transition>
          </div>
          <p v-else class="team-composition">{{ displayedDPSAnalysis.compositionName }}</p>

          <p class="team-structure">
            Needs:
            <span v-if="displayedDPSAnalysis.additionalDPSCoverage.needed > 0">{{ displayedDPSAnalysis.additionalDPSCoverage.needed }} Sub-DPS</span>
            <span v-if="displayedDPSAnalysis.additionalDPSCoverage.needed > 0 && displayedDPSAnalysis.structure.amplifier > 0">, </span>
            <span v-if="displayedDPSAnalysis.structure.amplifier > 0">{{ displayedDPSAnalysis.structure.amplifier }} Amplifier{{ displayedDPSAnalysis.structure.amplifier > 1 ? 's' : '' }}</span>
            <span v-if="displayedDPSAnalysis.structure.amplifier > 0 && displayedDPSAnalysis.structure.sustain > 0">, </span>
            <span v-if="displayedDPSAnalysis.structure.sustain > 0">{{ displayedDPSAnalysis.structure.sustain }} Sustain{{ displayedDPSAnalysis.structure.sustain > 1 ? 's' : '' }}</span>
          </p>
        </div>

        <!-- Sub-DPS Section (when additional DPS slots needed) -->
        <div v-if="displayedDPSAnalysis.additionalDPSCoverage.needed > 0" class="role-section">
          <h6 class="role-header">
            Your Sub-DPS:
            <span class="coverage-badge" :class="{ 'coverage-full': displayedDPSAnalysis.ownedSubDPS.length >= displayedDPSAnalysis.additionalDPSCoverage.needed }">
              {{ displayedDPSAnalysis.ownedSubDPS.length >= displayedDPSAnalysis.additionalDPSCoverage.needed ? '✓' : '⚠' }}
              {{ displayedDPSAnalysis.ownedSubDPS.length }}/{{ displayedDPSAnalysis.additionalDPSCoverage.needed }}
            </span>
          </h6>

          <div v-if="displayedDPSAnalysis.ownedSubDPS.length > 0" class="role-cards">
            <CharacterCard
              v-for="sub in displayedDPSAnalysis.ownedSubDPS"
              :key="sub.character.id"
              :character="sub.character"
              size="sm"
              :synergy-rating="sub.rating"
            />
          </div>
          <p v-else class="no-supports">None owned</p>
        </div>

        <!-- Amplifiers Section -->
        <div v-if="displayedDPSAnalysis.structure.amplifier > 0" class="role-section">
          <h6 class="role-header">
            Your Amplifiers:
            <span class="coverage-badge" :class="{ 'coverage-full': displayedDPSAnalysis.ownedAmplifiers.length >= displayedDPSAnalysis.amplifierCoverage.needed }">
              {{ displayedDPSAnalysis.ownedAmplifiers.length >= displayedDPSAnalysis.amplifierCoverage.needed ? '✓' : '⚠' }}
              {{ displayedDPSAnalysis.ownedAmplifiers.length }}/{{ displayedDPSAnalysis.amplifierCoverage.needed }}
            </span>
          </h6>

          <div v-if="displayedDPSAnalysis.ownedAmplifiers.length > 0" class="role-cards">
            <CharacterCard
              v-for="amp in displayedDPSAnalysis.ownedAmplifiers"
              :key="amp.character.id"
              :character="amp.character"
              size="sm"
              :synergy-rating="amp.rating"
            />
          </div>
          <p v-else class="no-supports">None owned</p>
        </div>

        <!-- Sustains Section -->
        <div v-if="displayedDPSAnalysis.structure.sustain > 0" class="role-section">
          <h6 class="role-header">
            Your Sustains:
            <span class="coverage-badge" :class="{ 'coverage-full': displayedDPSAnalysis.ownedSustains.length >= displayedDPSAnalysis.sustainCoverage.needed }">
              {{ displayedDPSAnalysis.ownedSustains.length >= displayedDPSAnalysis.sustainCoverage.needed ? '✓' : '⚠' }}
              {{ displayedDPSAnalysis.ownedSustains.length }}/{{ displayedDPSAnalysis.sustainCoverage.needed }}
            </span>
          </h6>

          <div v-if="displayedDPSAnalysis.ownedSustains.length > 0" class="role-cards">
            <CharacterCard
              v-for="sus in displayedDPSAnalysis.ownedSustains"
              :key="sus.character.id"
              :character="sus.character"
              size="sm"
              :synergy-rating="sus.rating"
            />
          </div>
          <p v-else class="no-supports">None owned</p>
        </div>

        <!-- Status -->
        <p class="dps-status" :class="getDPSStatusClass(displayedDPSAnalysis.status.type)">
          {{ getDPSStatusIcon(displayedDPSAnalysis.status.type) }} {{ displayedDPSAnalysis.status.message }}
        </p>
      </div>
    </div>

    <!-- Support Recommendation: Expanded Panel (collapsible) -->
    <Transition name="panel-expand">
      <div v-if="isExpanded && !isDPSRecommendation" class="rec-panel" @click.stop>
        <!-- Teams That Want This Character Section -->
        <section v-if="displayedTeamAnalysis.length > 0" class="panel-section">
          <h4 class="panel-title">
            <span class="panel-icon">✦</span>
            Teams That Want This Character
          </h4>
          <div class="team-list">
            <div v-for="team in displayedTeamAnalysis" :key="team.dpsId" class="team-entry">
              <!-- Header -->
              <div class="team-header">
                <CharacterCard
                  :character="team.dps"
                  size="md"
                  @click="emit('select-character', team.dpsId)"
                />

                <div class="team-header-info">
                  <h5 class="team-name">{{ team.dpsName }}</h5>

                  <!-- Custom Composition Dropdown -->
                  <div v-if="team.allCompositions.length > 1" class="composition-dropdown">
                    <button
                      class="composition-button"
                      @click="toggleDropdown(team.dpsId, $event)"
                    >
                      <span class="composition-name">{{ team.compositionName }}</span>
                      <svg class="dropdown-icon" :class="{ 'dropdown-icon-open': dropdownOpen[team.dpsId] }" width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </button>

                    <!-- Dropdown Menu -->
                    <Transition name="dropdown-fade">
                      <div v-if="dropdownOpen[team.dpsId]" class="composition-menu">
                        <button
                          v-for="comp in team.allCompositions"
                          :key="comp.id"
                          class="composition-option"
                          :class="{ 'composition-option-selected': comp.id === (selectedCompositions[team.dpsId] || team.compositionId) }"
                          @click="selectComposition(team.dpsId, comp.id, $event)"
                        >
                          <span class="composition-option-name">{{ comp.name }}</span>
                          <svg v-if="comp.id === (selectedCompositions[team.dpsId] || team.compositionId)" class="check-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M11.5 3.5L5.5 9.5L2.5 6.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                        </button>
                      </div>
                    </Transition>
                  </div>

                  <p v-else class="team-composition">{{ team.compositionName }}</p>

                  <p class="team-structure">
                    Needs:
                    <span v-if="team.structure.amplifier > 0">{{ team.structure.amplifier }} Amplifier{{ team.structure.amplifier > 1 ? 's' : '' }}</span>
                    <span v-if="team.structure.amplifier > 0 && team.structure.sustain > 0">, </span>
                    <span v-if="team.structure.sustain > 0">{{ team.structure.sustain }} Sustain{{ team.structure.sustain > 1 ? 's' : '' }}</span>
                  </p>
                </div>
              </div>

              <!-- Synergy Reason -->
              <p v-if="getReasonForTeam(team.dpsName)" class="team-reason">
                "{{ getReasonForTeam(team.dpsName) }}"
              </p>

              <!-- Only show the role section for the recommended character's category -->
              <div v-if="team.recommendedCategory === 'amplifiers'" class="role-section">
                <h6 class="role-header">Your Amplifiers:</h6>

                <div class="role-cards">
                  <CharacterCard
                    v-for="amp in team.ownedAmplifiers"
                    :key="amp.character.id"
                    :character="amp.character"
                    size="sm"
                    :synergy-rating="amp.rating"
                    :class="{ 'recommended-highlight': amp.character.id === characterId }"
                  />
                </div>
              </div>

              <div v-else-if="team.recommendedCategory === 'sustains'" class="role-section">
                <h6 class="role-header">Your Sustains:</h6>

                <div class="role-cards">
                  <CharacterCard
                    v-for="sus in team.ownedSustains"
                    :key="sus.character.id"
                    :character="sus.character"
                    size="sm"
                    :synergy-rating="sus.rating"
                    :class="{ 'recommended-highlight': sus.character.id === characterId }"
                  />
                </div>
              </div>

              <div v-else-if="team.recommendedCategory === 'subDPS'" class="role-section">
                <h6 class="role-header">Your Sub-DPS:</h6>

                <div class="role-cards">
                  <CharacterCard
                    v-for="sub in team.ownedSubDPS"
                    :key="sub.character.id"
                    :character="sub.character"
                    size="sm"
                    :synergy-rating="sub.rating"
                    :class="{ 'recommended-highlight': sub.character.id === characterId }"
                  />
                </div>
              </div>

              <!-- Status -->
              <p class="team-status" :class="getStatusClass(team.status.type)">
                {{ getStatusArrow(team.status.type) }} {{ team.status.message }}
              </p>
            </div>
          </div>
        </section>
      </div>
    </Transition>
  </article>
</template>

<style scoped>
/* ==========================================
   RECOMMENDATION CARD - SHARED COMPONENT
   ========================================== */

.rec-card {
  /* CRITICAL - bright green, highest priority */
  --color-critical: rgb(52, 211, 153);
  --color-critical-bg: rgba(52, 211, 153, 0.15);
  --color-critical-border: rgba(52, 211, 153, 0.4);
  /* STRONG - softer green, good value */
  --color-strong: rgb(110, 231, 183);
  --color-strong-bg: rgba(110, 231, 183, 0.12);
  --color-strong-border: rgba(110, 231, 183, 0.35);
  /* FLEX - yellow, optional */
  --color-flex: rgb(251, 191, 36);
  --color-flex-bg: rgba(251, 191, 36, 0.12);
  --color-flex-border: rgba(251, 191, 36, 0.35);
  /* SKIP - gray, low priority */
  --color-skip: rgb(148, 163, 184);
  --color-skip-bg: rgba(148, 163, 184, 0.1);
  --color-skip-border: rgba(148, 163, 184, 0.25);

  /* DPS Verdicts */
  /* READY - bright cyan, ready to build */
  --color-ready: rgb(34, 211, 238);
  --color-ready-bg: rgba(34, 211, 238, 0.15);
  --color-ready-border: rgba(34, 211, 238, 0.4);
  /* VIABLE - soft teal, can make it work */
  --color-viable: rgb(94, 234, 212);
  --color-viable-bg: rgba(94, 234, 212, 0.12);
  --color-viable-border: rgba(94, 234, 212, 0.35);
  /* WEAK - orange, support is lacking */
  --color-weak: rgb(251, 146, 60);
  --color-weak-bg: rgba(251, 146, 60, 0.12);
  --color-weak-border: rgba(251, 146, 60, 0.35);

  position: relative;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.8) 0%, rgba(30, 41, 59, 0.6) 100%);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 1rem;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  animation: card-slide-in 0.4s ease both;
  animation-delay: calc(var(--index) * 0.06s);
  transition: border-color 0.3s, box-shadow 0.3s;
}

@keyframes card-slide-in {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

.rec-card:hover {
  border-color: rgba(255, 255, 255, 0.12);
}

.rec-card.verdict-critical {
  border-left: 3px solid var(--color-critical);
}

.rec-card.verdict-critical:hover {
  box-shadow: 0 4px 24px rgba(52, 211, 153, 0.15);
}

.rec-card.verdict-strong {
  border-left: 3px solid var(--color-strong);
}

.rec-card.verdict-strong:hover {
  box-shadow: 0 4px 24px rgba(52, 211, 153, 0.1);
}

.rec-card.verdict-flex {
  border-left: 3px solid var(--color-flex);
}

.rec-card.verdict-flex:hover {
  box-shadow: 0 4px 24px rgba(251, 191, 36, 0.1);
}

.rec-card.verdict-skip {
  border-left: 3px solid var(--color-skip);
  opacity: 0.75;
}

/* DPS Verdict Card Borders */
.rec-card.verdict-ready {
  border-left: 3px solid var(--color-ready);
}

.rec-card.verdict-ready:hover {
  box-shadow: 0 4px 24px rgba(34, 211, 238, 0.15);
}

.rec-card.verdict-viable {
  border-left: 3px solid var(--color-viable);
}

.rec-card.verdict-viable:hover {
  box-shadow: 0 4px 24px rgba(94, 234, 212, 0.1);
}

.rec-card.verdict-weak {
  border-left: 3px solid var(--color-weak);
}

.rec-card.verdict-weak:hover {
  box-shadow: 0 4px 24px rgba(251, 146, 60, 0.1);
}

.rec-card.owned {
  border-left: 3px solid rgba(107, 114, 128, 0.4);
  opacity: 0.6;
}

/* Card Header */
.rec-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.rec-rank {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.35);
  min-width: 2rem;
}

.new-badge {
  font-size: 0.5625rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  padding: 0.25rem 0.5rem;
  background: linear-gradient(135deg, rgb(251, 146, 60), rgb(249, 115, 22));
  color: white;
  border-radius: 0.25rem;
}

.owned-badge {
  font-size: 0.5625rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  padding: 0.25rem 0.5rem;
  background: rgba(107, 114, 128, 0.3);
  color: rgba(255, 255, 255, 0.5);
  border-radius: 0.25rem;
}

.rec-verdict {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border-radius: 2rem;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  margin-left: auto;
}

.rec-verdict.critical {
  background: var(--color-critical-bg);
  color: var(--color-critical);
  border: 1px solid var(--color-critical-border);
}

.rec-verdict.strong {
  background: var(--color-strong-bg);
  color: var(--color-strong);
  border: 1px solid var(--color-strong-border);
}

.rec-verdict.flex {
  background: var(--color-flex-bg);
  color: var(--color-flex);
  border: 1px solid var(--color-flex-border);
}

.rec-verdict.skip {
  background: var(--color-skip-bg);
  color: var(--color-skip);
  border: 1px solid var(--color-skip-border);
}

/* DPS Verdict Badges */
.rec-verdict.ready {
  background: var(--color-ready-bg);
  color: var(--color-ready);
  border: 1px solid var(--color-ready-border);
}

.rec-verdict.viable {
  background: var(--color-viable-bg);
  color: var(--color-viable);
  border: 1px solid var(--color-viable-border);
}

.rec-verdict.weak {
  background: var(--color-weak-bg);
  color: var(--color-weak);
  border: 1px solid var(--color-weak-border);
}

.verdict-symbol {
  font-size: 0.75rem;
}

.rec-dismiss {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 0.5rem;
  color: rgba(255, 255, 255, 0.25);
  cursor: pointer;
  transition: all 0.2s;
  opacity: 0;
}

.rec-card:hover .rec-dismiss {
  opacity: 1;
}

.rec-dismiss:hover {
  background: rgba(239, 68, 68, 0.15);
  color: rgb(248, 113, 113);
}

.rec-dismiss svg {
  width: 16px;
  height: 16px;
}

/* Character Zone */
.rec-character {
  display: flex;
  align-items: center;
  gap: 1rem;
  cursor: pointer;
  padding: 0.5rem;
  margin: -0.5rem;
  border-radius: 0.75rem;
  transition: background 0.2s;
}

.rec-character:hover {
  background: rgba(255, 255, 255, 0.03);
}

.placeholder-portrait {
  width: 72px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px dashed rgba(255, 255, 255, 0.2);
  border-radius: 1rem;
}

.placeholder-icon {
  font-size: 1.5rem;
  color: rgba(255, 255, 255, 0.3);
}

.rec-char-info {
  flex: 1;
  min-width: 0;
}

.rec-name {
  font-size: 1.0625rem;
  font-weight: 600;
  color: white;
  margin: 0 0 0.375rem 0;
}

.rec-role {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 0.25rem 0.625rem;
  border-radius: 0.375rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.rec-role.support {
  background: rgba(168, 85, 247, 0.15);
  color: rgb(196, 148, 255);
}

.rec-role.amplifier {
  background: rgba(168, 85, 247, 0.15);
  color: rgb(196, 148, 255);
}

.rec-role.sustain {
  background: rgba(34, 197, 94, 0.15);
  color: rgb(74, 222, 128);
}

.rec-role.subDPS {
  background: rgba(245, 158, 11, 0.15);
  color: rgb(251, 191, 36);
}

.rec-role.dps {
  background: rgba(239, 68, 68, 0.15);
  color: rgb(248, 113, 113);
}

/* Wanted By */
.rec-wanted {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.rec-wanted-label {
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.rec-wanted-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.wanted-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.75);
  background: rgba(255, 255, 255, 0.04);
  padding: 0.375rem 0.625rem;
  border-radius: 0.5rem;
  cursor: default;
  transition: all 0.2s;
}

.status-arrow {
  font-size: 0.875rem;
  font-weight: 700;
  flex-shrink: 0;
}

.status-arrow.fills,
.status-arrow.upgrades {
  color: rgb(134, 239, 172);
  text-shadow: 0 0 8px rgba(134, 239, 172, 0.6);
}

.status-arrow.sidegrade {
  color: rgb(253, 224, 71);
  text-shadow: 0 0 8px rgba(253, 224, 71, 0.6);
}

.status-arrow.low {
  color: rgba(255, 255, 255, 0.5);
  text-shadow: 0 0 6px rgba(255, 255, 255, 0.3);
}

.wanted-chip:hover, .wanted-chip.active {
  background: rgba(255, 255, 255, 0.08);
  color: white;
}

.wanted-chip.subdps {
  border: 1px dashed rgba(245, 158, 11, 0.4);
}

.subdps-tag {
  font-size: 0.5rem;
  font-weight: 600;
  padding: 0.05rem 0.2rem;
  background: rgba(245, 158, 11, 0.25);
  color: rgb(251, 191, 36);
  border-radius: 0.15rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.eidolon-req {
  font-size: 0.625rem;
  font-weight: 700;
  padding: 0.125rem 0.3rem;
  background: rgba(245, 158, 11, 0.2);
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: 0.25rem;
  color: rgb(251, 191, 36);
}

.wanted-badge {
  font-size: 0.625rem;
  font-weight: 700;
  padding: 0.125rem 0.3rem;
  border-radius: 0.25rem;
}

.wanted-badge.rating-s {
  background: rgba(255, 149, 0, 0.25);
  color: rgb(255, 200, 100);
}

.wanted-badge.rating-a {
  background: rgba(168, 85, 247, 0.25);
  color: rgb(196, 148, 255);
}

.wanted-badge.rating-b {
  background: rgba(59, 130, 246, 0.2);
  color: rgb(147, 197, 253);
}

.wanted-badge.rating-c {
  background: rgba(34, 197, 94, 0.2);
  color: rgb(134, 239, 172);
}

.wanted-badge.rating-d {
  background: rgba(107, 114, 128, 0.2);
  color: rgb(156, 163, 175);
}

/* Reasoning List */
.reasoning-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.reasoning-list li {
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.5);
  padding-left: 1rem;
  position: relative;
  margin-bottom: 0.25rem;
  line-height: 1.4;
}

.reasoning-list li::before {
  content: '•';
  position: absolute;
  left: 0;
  color: rgba(255, 255, 255, 0.3);
}

/* Expand Button */
.rec-expand {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.75rem;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 0.625rem;
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 0.2s;
}

.rec-expand:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.7);
}

.rec-expand span {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.expand-icon {
  width: 18px;
  height: 18px;
}

/* Expanded Panel */
.rec-panel {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.panel-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
}

.panel-icon {
  font-size: 0.875rem;
}

/* Teams That Want This Character Section */
.team-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.team-entry {
  padding: 1rem;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 0.625rem;
  border-left: 3px solid rgba(168, 85, 247, 0.4);
}

.team-entry + .team-entry {
  margin-top: 0.75rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.team-header {
  display: flex;
  gap: 0.875rem;
  margin-bottom: 1rem;
}

.team-header-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.team-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
  margin: 0;
}

.team-composition {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
  margin: 0;
}

/* Custom Composition Dropdown */
.composition-dropdown {
  position: relative;
  max-width: 280px;
}

.composition-button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.625rem;
  width: 100%;
  padding: 0.5rem 0.875rem;
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.15), rgba(124, 58, 237, 0.1));
  border: 1px solid rgba(168, 85, 247, 0.35);
  border-radius: 0.5rem;
  color: rgba(255, 255, 255, 0.95);
  font-size: 0.8125rem;
  font-family: var(--font-body);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow:
    0 2px 8px rgba(168, 85, 247, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.composition-button:hover {
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.22), rgba(124, 58, 237, 0.15));
  border-color: rgba(168, 85, 247, 0.5);
  box-shadow:
    0 4px 16px rgba(168, 85, 247, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
  transform: translateY(-1px);
}

.composition-button:active {
  transform: translateY(0);
}

.composition-name {
  flex: 1;
  text-align: left;
}

.dropdown-icon {
  transition: transform 0.2s;
  color: rgba(168, 85, 247, 0.8);
}

.dropdown-icon-open {
  transform: rotate(180deg);
}

.composition-menu {
  position: absolute;
  top: calc(100% + 0.375rem);
  left: 0;
  right: 0;
  background: rgba(17, 17, 27, 0.98);
  border: 1px solid rgba(168, 85, 247, 0.4);
  border-radius: 0.5rem;
  padding: 0.375rem;
  z-index: 100;
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(168, 85, 247, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(12px);
}

.composition-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0.625rem 0.75rem;
  background: transparent;
  border: none;
  border-radius: 0.375rem;
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.8125rem;
  font-family: var(--font-body);
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
}

.composition-option:hover {
  background: rgba(168, 85, 247, 0.15);
  color: rgba(255, 255, 255, 0.95);
}

.composition-option-selected {
  background: rgba(168, 85, 247, 0.2);
  color: rgb(196, 181, 253);
  font-weight: 600;
}

.composition-option-selected:hover {
  background: rgba(168, 85, 247, 0.25);
}

.composition-option-name {
  flex: 1;
}

.check-icon {
  color: rgb(196, 181, 253);
  flex-shrink: 0;
}

/* Dropdown Transition */
.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition: all 0.2s ease;
}

.dropdown-fade-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}

.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.team-structure {
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
}

.role-section {
  margin-bottom: 0.875rem;
}

.role-header {
  font-size: 0.6875rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.55);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 0.5rem 0;
}

.role-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.recommended-highlight {
  position: relative;
  box-shadow: 0 0 16px rgba(251, 191, 36, 0.4);
  border: 2px solid rgba(251, 191, 36, 0.6) !important;
}

.recommended-highlight::after {
  content: '✨';
  position: absolute;
  top: -8px;
  right: -8px;
  font-size: 1.125rem;
  filter: drop-shadow(0 0 4px rgba(251, 191, 36, 0.6));
}

.no-options {
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.35);
  font-style: italic;
  margin: 0;
}

.team-reason {
  font-size: 0.8125rem;
  font-style: italic;
  color: rgba(255, 255, 255, 0.65);
  margin: 0.75rem 0 0.875rem 0;
  padding: 0.625rem 0.875rem;
  background: rgba(168, 85, 247, 0.08);
  border-left: 2px solid rgba(168, 85, 247, 0.3);
  border-radius: 0.375rem;
  line-height: 1.5;
}

.team-status {
  font-size: 0.8125rem;
  font-weight: 600;
  margin: 0.625rem 0 0 0;
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.team-status.fills,
.team-status.upgrades {
  color: rgb(134, 239, 172);
}

.team-status.sidegrade {
  color: rgb(253, 224, 71);
}

.team-status.low {
  color: rgba(255, 255, 255, 0.5);
}

/* Overlap Section */
.panel-overlap {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.overlap-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.overlap-context {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.45);
  min-width: 110px;
}

.overlap-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.overlap-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.6875rem;
  padding: 0.3rem 0.5rem;
  border-radius: 0.375rem;
  color: rgba(255, 255, 255, 0.75);
}

.overlap-chip.upgrade {
  background: rgba(52, 211, 153, 0.1);
  border: 1px solid rgba(52, 211, 153, 0.25);
}

.overlap-chip.sidegrade {
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.25);
}

.overlap-chip.downgrade {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.overlap-badge {
  font-weight: 700;
  padding: 0.1rem 0.25rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 0.2rem;
}

.overlap-arrow {
  font-weight: 700;
}

.overlap-chip.upgrade .overlap-arrow { color: rgb(52, 211, 153); }
.overlap-chip.sidegrade .overlap-arrow { color: rgb(251, 191, 36); }
.overlap-chip.downgrade .overlap-arrow { color: rgb(248, 113, 113); }

/* Notes */
.panel-notes {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.panel-notes li {
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.55);
  padding: 0.625rem 0.875rem;
  background: rgba(255, 255, 255, 0.02);
  border-left: 2px solid rgba(99, 102, 241, 0.4);
  border-radius: 0 0.5rem 0.5rem 0;
}

/* Panel Expand Transition */
.panel-expand-enter-active,
.panel-expand-leave-active {
  transition: all 0.35s ease;
  overflow: hidden;
}

.panel-expand-enter-from,
.panel-expand-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  margin-top: 0;
}

.panel-expand-enter-to,
.panel-expand-leave-from {
  opacity: 1;
  max-height: 800px;
}

/* Mobile Adjustments */
@media (max-width: 768px) {
  .rec-dismiss {
    opacity: 1;
  }
}

@media (max-width: 480px) {
  .rec-card {
    padding: 1rem;
  }

  .rec-header {
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .rec-verdict {
    margin-left: 0;
    margin-top: 0.25rem;
  }

  .team-header {
    flex-direction: column;
    align-items: center;
  }

  .team-header-info {
    text-align: center;
    align-items: center;
  }

  .composition-dropdown {
    max-width: 100%;
  }

  .role-cards {
    justify-content: center;
  }

  .dps-composition-header {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
}

/* ==========================================
   DPS RECOMMENDATION STYLES
   ========================================== */

.dps-team-entry {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.dps-composition-header {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.coverage-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.125rem 0.5rem;
  border-radius: 0.375rem;
  margin-left: 0.5rem;
  background: rgba(251, 191, 36, 0.15);
  color: rgb(251, 191, 36);
}

.coverage-badge.coverage-full {
  background: rgba(52, 211, 153, 0.15);
  color: rgb(52, 211, 153);
}

.no-supports {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
  font-style: italic;
  margin: 0;
  padding: 0.5rem 0;
}

.dps-status {
  font-size: 0.875rem;
  font-weight: 600;
  margin: 0.5rem 0 0 0;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.dps-status.ready {
  background: rgba(52, 211, 153, 0.12);
  color: rgb(110, 231, 183);
  border: 1px solid rgba(52, 211, 153, 0.25);
}

.dps-status.almost {
  background: rgba(52, 211, 153, 0.08);
  color: rgb(134, 239, 172);
  border: 1px solid rgba(52, 211, 153, 0.2);
}

.dps-status.partial {
  background: rgba(251, 191, 36, 0.1);
  color: rgb(253, 224, 71);
  border: 1px solid rgba(251, 191, 36, 0.25);
}

.dps-status.hard {
  background: rgba(239, 68, 68, 0.1);
  color: rgb(252, 165, 165);
  border: 1px solid rgba(239, 68, 68, 0.2);
}

/* DPS always expanded (no animation) */
.dps-always-expanded {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
</style>
