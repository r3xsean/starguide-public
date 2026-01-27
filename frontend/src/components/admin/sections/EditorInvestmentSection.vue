<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { CharacterInvestment, EidolonDefinition, LightConeDefinition, Character } from '../../../types';
import EidolonEditor from '../editors/EidolonEditor.vue';
import LightConeEditor from '../editors/LightConeEditor.vue';

// ==================
// PROPS & EMITS
// ==================

interface Props {
  modelValue: CharacterInvestment;
  allCharacters: Character[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: CharacterInvestment];
}>();

// ==================
// STATE
// ==================

const isExpanded = ref(true);
const eidolonsExpanded = ref(false);
const lightConesExpanded = ref(true);

// ==================
// CONSTANTS
// ==================

const EIDOLON_LEVELS: (1 | 2 | 3 | 4 | 5 | 6)[] = [1, 2, 3, 4, 5, 6];

const DEFAULT_EIDOLON: (level: 1 | 2 | 3 | 4 | 5 | 6) => EidolonDefinition = (level) => ({
  level,
  penalty: -10,
  description: '',
});

const DEFAULT_LIGHT_CONE: (isSignature: boolean) => LightConeDefinition = (isSignature) => ({
  id: '',
  name: '',
  rarity: 5,
  isSignature,
  penalties: { s1: isSignature ? -12 : -20, s5: isSignature ? 0 : -15 },
  notes: '',
  source: isSignature ? 'signature' : 'standard',
});

// ==================
// COMPUTED
// ==================

// Ensure eidolons array always has 6 entries
const normalizedEidolons = computed(() => {
  const eidolons = [...(props.modelValue.eidolons || [])];

  // Fill missing eidolons with defaults
  for (const level of EIDOLON_LEVELS) {
    if (!eidolons.find(e => e.level === level)) {
      eidolons.push(DEFAULT_EIDOLON(level));
    }
  }

  // Sort by level
  return eidolons.sort((a, b) => a.level - b.level);
});

const lightCones = computed(() => props.modelValue.lightCones || []);

// Validation: exactly one signature light cone required
const signatureCount = computed(() => lightCones.value.filter(lc => lc.isSignature).length);

const signatureValidation = computed(() => {
  if (signatureCount.value === 0) {
    return { valid: false, message: 'At least one signature light cone is required' };
  }
  if (signatureCount.value > 1) {
    return { valid: false, message: 'Only one light cone should be marked as signature' };
  }
  return { valid: true, message: '' };
});

const totalPenalty = computed(() => {
  return normalizedEidolons.value.reduce((sum, e) => sum + e.penalty, 0);
});

// ==================
// HANDLERS
// ==================

function toggleExpanded() {
  isExpanded.value = !isExpanded.value;
}

function toggleEidolons() {
  eidolonsExpanded.value = !eidolonsExpanded.value;
}

function toggleLightCones() {
  lightConesExpanded.value = !lightConesExpanded.value;
}

function updatePriorityInfo(field: 'investmentPriority' | 'minimumViable', value: string) {
  emit('update:modelValue', {
    ...props.modelValue,
    [field]: value || undefined,
  });
}

function updateEidolon(index: number, value: EidolonDefinition) {
  const eidolons = [...normalizedEidolons.value];
  eidolons[index] = value;

  emit('update:modelValue', {
    ...props.modelValue,
    eidolons,
  });
}

function updateLightCone(index: number, value: LightConeDefinition) {
  const lightCones = [...(props.modelValue.lightCones || [])];
  lightCones[index] = value;

  emit('update:modelValue', {
    ...props.modelValue,
    lightCones,
  });
}

function addLightCone() {
  const lightCones = [...(props.modelValue.lightCones || [])];
  const isFirst = lightCones.length === 0;
  lightCones.push(DEFAULT_LIGHT_CONE(isFirst));

  emit('update:modelValue', {
    ...props.modelValue,
    lightCones,
  });
}

function deleteLightCone(index: number) {
  const lightCones = [...(props.modelValue.lightCones || [])];
  lightCones.splice(index, 1);

  emit('update:modelValue', {
    ...props.modelValue,
    lightCones,
  });
}

// Initialize eidolons if empty
watch(
  () => props.modelValue,
  (newValue) => {
    if (!newValue.eidolons || newValue.eidolons.length === 0) {
      emit('update:modelValue', {
        ...newValue,
        eidolons: EIDOLON_LEVELS.map(DEFAULT_EIDOLON),
      });
    }
  },
  { immediate: true }
);
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
        <span class="header-title">Investment</span>
      </div>
    </button>

    <!-- Section Content -->
    <Transition name="section-expand">
      <div v-if="isExpanded" class="section-content">
        <!-- Section Description -->
        <p class="section-description">
          Define how eidolons and light cones affect this character's performance. <strong>Penalties are negative numbers</strong> — larger magnitude means bigger impact (e.g., -30 for game-changing eidolons, -15 for minor ones).
        </p>

        <!-- Priority Info Subsection -->
        <div class="subsection">
          <h3 class="subsection-title">Priority Information</h3>

          <div class="form-group">
            <label class="form-label" for="investment-priority">
              Investment Priority
              <span class="label-hint">(e.g., "E2 > S1 > E1")</span>
            </label>
            <input
              id="investment-priority"
              type="text"
              :value="modelValue.investmentPriority || ''"
              class="form-input"
              placeholder="E2 > S1 > E1"
              @input="updatePriorityInfo('investmentPriority', ($event.target as HTMLInputElement).value)"
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="minimum-viable">
              Minimum Viable
              <span class="label-hint">(e.g., "E0 + 4-star LC S5")</span>
            </label>
            <input
              id="minimum-viable"
              type="text"
              :value="modelValue.minimumViable || ''"
              class="form-input"
              placeholder="E0 + On the Fall of an Aeon S5"
              @input="updatePriorityInfo('minimumViable', ($event.target as HTMLInputElement).value)"
            />
          </div>
        </div>

        <!-- Eidolons Subsection -->
        <div class="subsection collapsible">
          <button
            type="button"
            class="subsection-header"
            @click="toggleEidolons"
          >
            <div class="subsection-header-content">
              <svg
                class="subsection-chevron"
                :class="{ rotated: !eidolonsExpanded }"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clip-rule="evenodd"
                />
              </svg>
              <span class="subsection-title">Eidolons</span>
              <span class="eidolon-count">6 entries</span>
            </div>
            <div class="total-penalty">
              Total: {{ totalPenalty }}
            </div>
          </button>

          <Transition name="subsection-expand">
            <div v-if="eidolonsExpanded" class="subsection-content">
              <div
                v-for="(eidolon, index) in normalizedEidolons"
                :key="eidolon.level"
                :data-field-path="`investment.eidolons[${index}]`"
                class="eidolon-wrapper"
              >
                <EidolonEditor
                  :model-value="eidolon"
                  :level="eidolon.level"
                  :all-characters="allCharacters"
                  @update:model-value="updateEidolon(index, $event)"
                />
              </div>
            </div>
          </Transition>
        </div>

        <!-- Light Cones Subsection -->
        <div class="subsection collapsible">
          <button
            type="button"
            class="subsection-header"
            @click="toggleLightCones"
          >
            <div class="subsection-header-content">
              <svg
                class="subsection-chevron"
                :class="{ rotated: !lightConesExpanded }"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clip-rule="evenodd"
                />
              </svg>
              <span class="subsection-title">Light Cones</span>
              <span class="lc-count">{{ lightCones.length }} entries</span>
            </div>
          </button>

          <Transition name="subsection-expand">
            <div v-if="lightConesExpanded" class="subsection-content">
              <!-- Validation Warning -->
              <div v-if="!signatureValidation.valid" class="validation-warning">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{{ signatureValidation.message }}</span>
              </div>

              <div v-if="lightCones.length === 0" class="empty-state">
                <span>No light cones defined.</span>
                <span class="empty-hint">Add at least one signature light cone.</span>
              </div>

              <div
                v-for="(lightCone, index) in lightCones"
                :key="index"
                :data-field-path="`investment.lightCones[${index}]`"
                class="lightcone-wrapper"
              >
                <LightConeEditor
                  :model-value="lightCone"
                  :all-characters="allCharacters"
                  @update:model-value="updateLightCone(index, $event)"
                  @delete="deleteLightCone(index)"
                />
              </div>

              <button
                type="button"
                class="add-btn"
                @click="addLightCone"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Add Light Cone</span>
              </button>
            </div>
          </Transition>
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

.section-description {
  margin: 0;
  font-size: 0.8125rem;
  color: rgba(148, 163, 184, 0.85);
  line-height: 1.5;
}

.section-description strong {
  color: rgba(251, 191, 36, 0.95);
}

/* ==================
   SUBSECTIONS
   ================== */

.subsection {
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(71, 85, 105, 0.3);
  border-radius: 0.625rem;
  padding: 1rem;
}

.subsection.collapsible {
  padding: 0;
}

.subsection-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: rgba(203, 213, 225, 0.95);
  margin-bottom: 1rem;
}

.subsection.collapsible .subsection-title {
  margin-bottom: 0;
}

.subsection-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1rem;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s ease;
  border-radius: 0.625rem;
}

.subsection-header:hover {
  background: rgba(71, 85, 105, 0.2);
}

.subsection-header-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.subsection-chevron {
  width: 1rem;
  height: 1rem;
  color: rgba(148, 163, 184, 0.7);
  transition: transform 0.2s ease;
}

.subsection-chevron.rotated {
  transform: rotate(-90deg);
}

.eidolon-count,
.lc-count {
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.6);
  font-weight: 400;
}

.total-penalty {
  font-size: 0.8125rem;
  font-weight: 600;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  color: rgba(248, 113, 113, 0.9);
}

.subsection-content {
  padding: 0.5rem 1rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.eidolon-wrapper,
.lightcone-wrapper {
  border-radius: 0.5rem;
  transition: box-shadow 0.3s ease, outline 0.3s ease;
}

.eidolon-wrapper.highlight-error,
.lightcone-wrapper.highlight-error {
  outline: 2px solid rgba(251, 146, 60, 0.8);
  box-shadow: 0 0 12px rgba(251, 146, 60, 0.4);
}

/* ==================
   FORM ELEMENTS
   ================== */

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: rgba(148, 163, 184, 1);
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.label-hint {
  font-size: 0.75rem;
  font-weight: 400;
  color: rgba(148, 163, 184, 0.6);
}

.form-input {
  width: 100%;
  padding: 0.625rem 0.875rem;
  background: rgba(51, 65, 85, 0.5);
  border: 1px solid rgba(71, 85, 105, 0.6);
  border-radius: 0.5rem;
  color: rgba(226, 232, 240, 1);
  font-size: 0.9375rem;
  font-family: inherit;
  transition: all 0.2s ease;
}

.form-input:hover {
  border-color: rgba(100, 116, 139, 0.8);
}

.form-input:focus {
  outline: none;
  border-color: rgba(249, 115, 22, 0.6);
  box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.15);
}

.form-input::placeholder {
  color: rgba(148, 163, 184, 0.5);
}

/* ==================
   VALIDATION & EMPTY STATES
   ================== */

.validation-warning {
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

.validation-warning svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  padding: 2rem 1rem;
  background: rgba(15, 23, 42, 0.4);
  border: 1px dashed rgba(71, 85, 105, 0.5);
  border-radius: 0.5rem;
  text-align: center;
  color: rgba(148, 163, 184, 0.8);
  font-size: 0.875rem;
}

.empty-hint {
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.6);
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
  max-height: 3000px;
}

.subsection-expand-enter-active,
.subsection-expand-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.subsection-expand-enter-from,
.subsection-expand-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.subsection-expand-enter-to,
.subsection-expand-leave-from {
  opacity: 1;
  max-height: 2000px;
}
</style>
