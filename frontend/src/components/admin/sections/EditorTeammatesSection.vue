<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Teammates, TeammateRec, Character } from '../../../types';
import TeammateEditor from '../editors/TeammateEditor.vue';

// ==================
// TYPES
// ==================

type TeammateRole = 'dps' | 'subDPS' | 'amplifiers' | 'sustains';

interface RoleConfig {
  key: TeammateRole;
  label: string;
  description: string;
}

// ==================
// PROPS & EMITS
// ==================

interface Props {
  modelValue: Teammates;
  allCharacters: Character[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: Teammates];
}>();

// ==================
// STATE
// ==================

const isExpanded = ref(true);
const activeRole = ref<TeammateRole>('amplifiers');

// ==================
// CONSTANTS
// ==================

const ROLES: RoleConfig[] = [
  { key: 'dps', label: 'DPS', description: 'Main damage dealers this character works well with' },
  { key: 'amplifiers', label: 'Amplifiers', description: 'Buffers and debuffers that boost this character\'s performance' },
  { key: 'sustains', label: 'Sustains', description: 'Healers and shielders that keep this character alive' },
  { key: 'subDPS', label: 'Sub-DPS', description: 'Secondary damage dealers for dual-carry or off-field damage' },
];

const showRatingGuide = ref(false);

// ==================
// COMPUTED
// ==================

const roleTeammates = computed(() => {
  return props.modelValue[activeRole.value] || [];
});

const roleCounts = computed(() => {
  const counts: Record<TeammateRole, number> = {
    dps: props.modelValue.dps?.length || 0,
    amplifiers: props.modelValue.amplifiers?.length || 0,
    sustains: props.modelValue.sustains?.length || 0,
    subDPS: props.modelValue.subDPS?.length || 0,
  };
  return counts;
});

const totalCount = computed(() => {
  return Object.values(roleCounts.value).reduce((sum, count) => sum + count, 0);
});

// Check for duplicate character IDs within the active role
const duplicateIds = computed(() => {
  const teammates = roleTeammates.value;
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const tm of teammates) {
    if (tm.id && seen.has(tm.id)) {
      duplicates.add(tm.id);
    }
    seen.add(tm.id);
  }

  return duplicates;
});

// ==================
// HANDLERS
// ==================

function toggleExpanded() {
  isExpanded.value = !isExpanded.value;
}

function setActiveRole(role: TeammateRole) {
  activeRole.value = role;
}

function updateTeammate(index: number, value: TeammateRec) {
  const teammates = [...(props.modelValue[activeRole.value] || [])];
  teammates[index] = value;

  emit('update:modelValue', {
    ...props.modelValue,
    [activeRole.value]: teammates,
  });
}

function addTeammate() {
  const teammates = [...(props.modelValue[activeRole.value] || [])];
  teammates.push({
    id: '',
    rating: 'B',
    reason: '',
  });

  emit('update:modelValue', {
    ...props.modelValue,
    [activeRole.value]: teammates,
  });
}

function deleteTeammate(index: number) {
  const teammates = [...(props.modelValue[activeRole.value] || [])];
  teammates.splice(index, 1);

  emit('update:modelValue', {
    ...props.modelValue,
    [activeRole.value]: teammates.length > 0 ? teammates : undefined,
  });
}

// ==================
// EXPOSE FOR PARENT
// ==================

// Expose method to scroll to a specific teammate
function scrollToTeammate(role: TeammateRole, index: number) {
  // Expand section if collapsed
  isExpanded.value = true;

  // Switch to the correct role tab
  activeRole.value = role;

  // Wait for DOM update, then scroll
  setTimeout(() => {
    const element = document.querySelector(`[data-field-path="baseTeammates.${role}[${index}]"]`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Add highlight effect
      element.classList.add('highlight-error');
      setTimeout(() => element.classList.remove('highlight-error'), 2000);
    }
  }, 100);
}

defineExpose({ scrollToTeammate, setActiveRole });
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
        <span class="header-title">Base Teammates</span>
        <span v-if="totalCount > 0" class="header-count">{{ totalCount }}</span>
      </div>
    </button>

    <!-- Section Content -->
    <Transition name="section-expand">
      <div v-if="isExpanded" class="section-content">
        <!-- Section Description -->
        <p class="section-description">
          Rate how well other characters synergize with this one. These ratings appear on the character's Teammates tab and help users build teams.
        </p>

        <!-- Rating Guide Toggle -->
        <button type="button" class="rating-guide-toggle" @click="showRatingGuide = !showRatingGuide">
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
          </svg>
          <span>{{ showRatingGuide ? 'Hide' : 'Show' }} Rating Guide</span>
        </button>

        <!-- Rating Guide Panel -->
        <Transition name="guide-expand">
          <div v-if="showRatingGuide" class="rating-guide">
            <div class="guide-item"><span class="guide-rating rating-s">S</span> <span class="guide-text"><strong>Best in slot</strong> — Irreplaceable synergy, top recommendation</span></div>
            <div class="guide-item"><span class="guide-rating rating-a">A</span> <span class="guide-text"><strong>Excellent</strong> — Highly recommended, strong synergy</span></div>
            <div class="guide-item"><span class="guide-rating rating-b">B</span> <span class="guide-text"><strong>Good</strong> — Solid choice, works well</span></div>
            <div class="guide-item"><span class="guide-rating rating-c">C</span> <span class="guide-text"><strong>Situational</strong> — Works but not ideal, niche use</span></div>
            <div class="guide-item"><span class="guide-rating rating-d">D</span> <span class="guide-text"><strong>Not recommended</strong> — Poor synergy, better options exist</span></div>
          </div>
        </Transition>

        <!-- Role Tabs -->
        <div class="role-tabs">
          <button
            v-for="role in ROLES"
            :key="role.key"
            type="button"
            class="role-tab"
            :class="{ active: activeRole === role.key }"
            @click="setActiveRole(role.key)"
          >
            <span class="role-label">{{ role.label }}</span>
            <span v-if="roleCounts[role.key] > 0" class="role-count">
              {{ roleCounts[role.key] }}
            </span>
          </button>
        </div>

        <!-- Role Description -->
        <div class="role-description">
          {{ ROLES.find(r => r.key === activeRole)?.description }}
        </div>

        <!-- Duplicate Warning -->
        <div v-if="duplicateIds.size > 0" class="duplicate-warning">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>Duplicate character IDs detected: {{ Array.from(duplicateIds).join(', ') }}</span>
        </div>

        <!-- Teammates List -->
        <div class="teammates-list">
          <div v-if="roleTeammates.length === 0" class="empty-state">
            <span class="empty-title">No {{ ROLES.find(r => r.key === activeRole)?.label }} teammates yet</span>
            <span class="empty-hint">
              <template v-if="activeRole === 'dps'">Add main damage dealers this character supports or enables.</template>
              <template v-else-if="activeRole === 'amplifiers'">Add buffers, debuffers, and support characters that enhance this character.</template>
              <template v-else-if="activeRole === 'sustains'">Add healers and shielders that help this character survive.</template>
              <template v-else-if="activeRole === 'subDPS'">Add off-field damage dealers or secondary carries for dual-DPS teams.</template>
            </span>
          </div>

          <div
            v-for="(teammate, index) in roleTeammates"
            :key="`${activeRole}-${index}`"
            :data-field-path="`baseTeammates.${activeRole}[${index}]`"
            class="teammate-wrapper"
          >
            <TeammateEditor
              :model-value="teammate"
              :all-characters="allCharacters"
              @update:model-value="updateTeammate(index, $event)"
              @delete="deleteTeammate(index)"
            />
          </div>
        </div>

        <!-- Add Button -->
        <button
          type="button"
          class="add-btn"
          @click="addTeammate"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Add {{ ROLES.find(r => r.key === activeRole)?.label }} Teammate</span>
        </button>
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

.header-count {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 0.5rem;
  background: rgba(251, 146, 60, 0.2);
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(251, 146, 60, 0.9);
}

/* ==================
   SECTION CONTENT
   ================== */

.section-content {
  padding: 0 1.25rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* ==================
   SECTION DESCRIPTION
   ================== */

.section-description {
  margin: 0;
  font-size: 0.8125rem;
  color: rgba(148, 163, 184, 0.85);
  line-height: 1.5;
}

/* ==================
   RATING GUIDE
   ================== */

.rating-guide-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  background: rgba(71, 85, 105, 0.3);
  border: 1px solid rgba(71, 85, 105, 0.4);
  border-radius: 0.375rem;
  color: rgba(148, 163, 184, 0.9);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s ease;
  width: fit-content;
}

.rating-guide-toggle:hover {
  background: rgba(71, 85, 105, 0.5);
  color: rgba(226, 232, 240, 1);
}

.rating-guide-toggle svg {
  width: 14px;
  height: 14px;
}

.rating-guide {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.875rem 1rem;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(71, 85, 105, 0.4);
  border-radius: 0.5rem;
}

.guide-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  font-size: 0.8125rem;
}

.guide-rating {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 700;
  flex-shrink: 0;
}

.rating-s { background: rgba(251, 146, 60, 0.2); color: rgba(251, 146, 60, 0.95); }
.rating-a { background: rgba(168, 85, 247, 0.2); color: rgba(168, 85, 247, 0.95); }
.rating-b { background: rgba(59, 130, 246, 0.2); color: rgba(59, 130, 246, 0.95); }
.rating-c { background: rgba(34, 197, 94, 0.2); color: rgba(34, 197, 94, 0.95); }
.rating-d { background: rgba(107, 114, 128, 0.2); color: rgba(156, 163, 175, 0.95); }

.guide-text {
  color: rgba(203, 213, 225, 0.9);
  line-height: 1.4;
}

.guide-text strong {
  color: rgba(241, 245, 249, 1);
}

.guide-expand-enter-active,
.guide-expand-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.guide-expand-enter-from,
.guide-expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.guide-expand-enter-to,
.guide-expand-leave-from {
  opacity: 1;
  max-height: 300px;
}

/* ==================
   ROLE TABS
   ================== */

.role-tabs {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.role-tab {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.875rem;
  background: rgba(71, 85, 105, 0.4);
  border: 1px solid rgba(71, 85, 105, 0.5);
  border-radius: 0.5rem;
  color: rgba(203, 213, 225, 0.9);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.role-tab:hover {
  background: rgba(71, 85, 105, 0.6);
  border-color: rgba(100, 116, 139, 0.6);
}

.role-tab.active {
  background: rgba(251, 146, 60, 0.15);
  border-color: rgba(251, 146, 60, 0.5);
  color: rgba(251, 146, 60, 0.95);
}

.role-label {
  font-weight: 500;
}

.role-count {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 0.375rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  font-size: 0.6875rem;
  font-weight: 600;
}

.role-tab.active .role-count {
  background: rgba(251, 146, 60, 0.3);
}

/* ==================
   ROLE DESCRIPTION
   ================== */

.role-description {
  font-size: 0.8125rem;
  color: rgba(148, 163, 184, 0.8);
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(71, 85, 105, 0.3);
}

/* ==================
   DUPLICATE WARNING
   ================== */

.duplicate-warning {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 0.5rem;
  color: rgba(248, 113, 113, 0.95);
  font-size: 0.8125rem;
}

.duplicate-warning svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

/* ==================
   TEAMMATES LIST
   ================== */

.teammates-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.teammate-wrapper {
  border-radius: 0.5rem;
  transition: box-shadow 0.3s ease, outline 0.3s ease;
}

.teammate-wrapper.highlight-error {
  outline: 2px solid rgba(251, 146, 60, 0.8);
  box-shadow: 0 0 12px rgba(251, 146, 60, 0.4);
}

/* ==================
   EMPTY STATE
   ================== */

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2rem 1rem;
  background: rgba(15, 23, 42, 0.4);
  border: 1px dashed rgba(71, 85, 105, 0.5);
  border-radius: 0.5rem;
  text-align: center;
}

.empty-title {
  font-size: 0.875rem;
  font-weight: 500;
  color: rgba(148, 163, 184, 0.9);
}

.empty-hint {
  font-size: 0.8125rem;
  color: rgba(148, 163, 184, 0.7);
  line-height: 1.5;
  max-width: 320px;
}

/* ==================
   ADD BUTTON
   ================== */

.add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: transparent;
  border: 1px dashed rgba(71, 85, 105, 0.6);
  border-radius: 0.5rem;
  color: rgba(148, 163, 184, 0.8);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.add-btn:hover {
  background: rgba(251, 146, 60, 0.1);
  border-color: rgba(251, 146, 60, 0.5);
  color: rgba(251, 146, 60, 0.9);
}

.add-btn svg {
  width: 18px;
  height: 18px;
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
  max-height: 2000px;
}
</style>
