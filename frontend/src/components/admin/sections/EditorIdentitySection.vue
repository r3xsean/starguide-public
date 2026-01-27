<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Element, Path } from '../../../types';

// ==================
// TYPES
// ==================

interface IdentityData {
  id: string;
  name: string;
  element: Element;
  path: Path;
  rarity: 4 | 5;
}

// ==================
// PROPS & EMITS
// ==================

interface Props {
  modelValue: IdentityData;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: IdentityData];
}>();

// ==================
// STATE
// ==================

const isExpanded = ref(true);

// ==================
// CONSTANTS
// ==================

const ELEMENTS: Element[] = [
  'Physical',
  'Fire',
  'Ice',
  'Lightning',
  'Wind',
  'Quantum',
  'Imaginary',
];

const PATHS: Path[] = [
  'Destruction',
  'Hunt',
  'Erudition',
  'Harmony',
  'Nihility',
  'Preservation',
  'Abundance',
  'Remembrance',
];

const ELEMENT_COLORS: Record<Element, string> = {
  Physical: '#c4c4c4',
  Fire: '#f4634e',
  Ice: '#47c7fd',
  Lightning: '#d376f0',
  Wind: '#5fe8b6',
  Quantum: '#625afa',
  Imaginary: '#f3d86b',
};

// ==================
// COMPUTED
// ==================

const iconUrl = computed(() => `/icons/${props.modelValue.id}.webp`);

const elementColor = computed(() => ELEMENT_COLORS[props.modelValue.element]);

// ==================
// HANDLERS
// ==================

function updateField<K extends keyof IdentityData>(field: K, value: IdentityData[K]) {
  emit('update:modelValue', {
    ...props.modelValue,
    [field]: value,
  });
}

function toggleExpanded() {
  isExpanded.value = !isExpanded.value;
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
        <span class="header-title">Identity</span>
      </div>
    </button>

    <!-- Section Content -->
    <Transition name="section-expand">
      <div v-if="isExpanded" class="section-content">
        <!-- Character Display (Readonly) -->
        <div class="character-display">
          <div class="character-icon-wrapper" :style="{ '--element-color': elementColor }">
            <img
              :src="iconUrl"
              :alt="modelValue.name"
              class="character-icon"
              @error="($event.target as HTMLImageElement).src = '/icons/placeholder.webp'"
            />
          </div>
          <div class="character-info">
            <div class="character-name">{{ modelValue.name }}</div>
            <div class="character-id">ID: {{ modelValue.id }}</div>
          </div>
        </div>

        <!-- Element Dropdown -->
        <div class="form-group">
          <label class="form-label" for="element-select">Element</label>
          <select
            id="element-select"
            class="form-select"
            :value="modelValue.element"
            @change="updateField('element', ($event.target as HTMLSelectElement).value as Element)"
          >
            <option v-for="el in ELEMENTS" :key="el" :value="el">
              {{ el }}
            </option>
          </select>
        </div>

        <!-- Path Dropdown -->
        <div class="form-group">
          <label class="form-label" for="path-select">Path</label>
          <select
            id="path-select"
            class="form-select"
            :value="modelValue.path"
            @change="updateField('path', ($event.target as HTMLSelectElement).value as Path)"
          >
            <option v-for="p in PATHS" :key="p" :value="p">
              {{ p }}
            </option>
          </select>
        </div>

        <!-- Rarity Radio Buttons -->
        <div class="form-group">
          <label class="form-label">Rarity</label>
          <div class="rarity-options">
            <label class="rarity-option">
              <input
                type="radio"
                name="rarity"
                :value="4"
                :checked="modelValue.rarity === 4"
                @change="updateField('rarity', 4)"
                class="rarity-input"
              />
              <span class="rarity-label rarity-4">4-Star</span>
            </label>
            <label class="rarity-option">
              <input
                type="radio"
                name="rarity"
                :value="5"
                :checked="modelValue.rarity === 5"
                @change="updateField('rarity', 5)"
                class="rarity-input"
              />
              <span class="rarity-label rarity-5">5-Star</span>
            </label>
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
   CHARACTER DISPLAY
   ================== */

.character-display {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(71, 85, 105, 0.3);
  border-radius: 0.625rem;
}

.character-icon-wrapper {
  width: 64px;
  height: 64px;
  border-radius: 0.5rem;
  overflow: hidden;
  border: 2px solid var(--element-color, rgba(71, 85, 105, 0.5));
  box-shadow: 0 0 12px color-mix(in srgb, var(--element-color) 30%, transparent);
  flex-shrink: 0;
}

.character-icon {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.character-info {
  flex: 1;
  min-width: 0;
}

.character-name {
  font-size: 1.125rem;
  font-weight: 600;
  color: rgba(241, 245, 249, 1);
  margin-bottom: 0.25rem;
}

.character-id {
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.7);
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
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
}

.form-select {
  width: 100%;
  padding: 0.625rem 0.875rem;
  background: rgba(51, 65, 85, 0.5);
  border: 1px solid rgba(71, 85, 105, 0.6);
  border-radius: 0.5rem;
  color: rgba(226, 232, 240, 1);
  font-size: 0.9375rem;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s ease;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.75rem center;
  background-size: 1.25rem;
  padding-right: 2.5rem;
}

.form-select:hover {
  border-color: rgba(100, 116, 139, 0.8);
}

.form-select:focus {
  outline: none;
  border-color: rgba(249, 115, 22, 0.6);
  box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.15);
}

.form-select option {
  background: rgb(30, 41, 59);
  color: rgba(226, 232, 240, 1);
}

/* ==================
   RARITY OPTIONS
   ================== */

.rarity-options {
  display: flex;
  gap: 1rem;
}

.rarity-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.rarity-input {
  appearance: none;
  width: 1.125rem;
  height: 1.125rem;
  border: 2px solid rgba(71, 85, 105, 0.6);
  border-radius: 50%;
  background: rgba(30, 41, 59, 0.5);
  cursor: pointer;
  transition: all 0.2s ease;
}

.rarity-input:checked {
  border-color: rgba(249, 115, 22, 0.8);
  background: rgba(249, 115, 22, 0.8);
  box-shadow: inset 0 0 0 3px rgba(30, 41, 59, 1);
}

.rarity-input:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.2);
}

.rarity-label {
  font-size: 0.9375rem;
  font-weight: 500;
  transition: color 0.2s ease;
}

.rarity-4 {
  color: rgba(168, 85, 247, 0.9);
}

.rarity-5 {
  color: rgba(251, 191, 36, 0.9);
}

.rarity-option:hover .rarity-label {
  opacity: 0.8;
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
  max-height: 500px;
}
</style>
