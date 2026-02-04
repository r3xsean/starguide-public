<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Character } from '../types';
import { getCharacterById } from '../data';
import { getCharactersWhoAvoid } from '../utils/relationshipLookup';
import FeedbackButton from './FeedbackButton.vue';
import ContextualFeedbackModal from './ContextualFeedbackModal.vue';
import type { FeedbackContext } from './ContextualFeedbackModal.vue';

interface Props {
  character: Character;
}

const props = defineProps<Props>();

// ==================
// CONTEXTUAL FEEDBACK
// ==================

const showFeedbackModal = ref(false);

function handleFeedbackClick() {
  showFeedbackModal.value = true;
}

function closeFeedbackModal() {
  showFeedbackModal.value = false;
}

const feedbackContext = computed((): FeedbackContext => ({
  characterId: props.character.id,
  characterName: props.character.name,
}));

// Get restrictions from character
const restrictions = computed(() => props.character.restrictions);

// Get avoid characters with their data (who this character should avoid)
const avoidCharacters = computed(() => {
  if (!restrictions.value?.avoid) return [];

  return restrictions.value.avoid.map(avoid => ({
    character: getCharacterById(avoid.id),
    reason: avoid.reason,
  })).filter(a => a.character);
});

// Get characters who avoid this character (computed at runtime)
const avoidedByCharacters = computed(() => {
  return getCharactersWhoAvoid(props.character.id);
});

// Has any restrictions (including avoided-by)
const hasRestrictions = computed(() => {
  return (restrictions.value?.warnings?.length || 0) > 0 ||
         (restrictions.value?.avoid?.length || 0) > 0 ||
         avoidedByCharacters.value.length > 0;
});

// Categorize warnings by severity
const categorizedWarnings = computed(() => {
  const warnings = restrictions.value?.warnings || [];

  return warnings.map(warning => {
    // Check for severity keywords
    const isCritical = /non-functional|useless|required|mandatory/i.test(warning);
    const isModerate = /best|needs|high|specific/i.test(warning);

    return {
      text: warning,
      severity: isCritical ? 'critical' : isModerate ? 'moderate' : 'info',
    };
  });
});
</script>

<template>
  <div v-if="hasRestrictions" class="restrictions-panel">
    <!-- Holographic Border Effect -->
    <div class="holo-border"></div>

    <!-- Header -->
    <div class="panel-header">
      <div class="header-icon">
        <span class="icon-alert">⚠</span>
        <div class="icon-pulse"></div>
      </div>
      <div class="header-text">
        <h3 class="panel-title">Warnings & Restrictions</h3>
        <p class="panel-subtitle">Important considerations for team building</p>
      </div>
      <FeedbackButton
        label="Report issue"
        tooltip="Report restriction issue"
        size="sm"
        @click="handleFeedbackClick"
      />
    </div>

    <!-- Warnings List -->
    <div v-if="categorizedWarnings.length > 0" class="warnings-section">
      <div
        v-for="(warning, index) in categorizedWarnings"
        :key="index"
        class="warning-item"
        :class="warning.severity"
        :style="{ '--item-delay': `${index * 0.05}s` }"
      >
        <div class="warning-indicator">
          <div class="indicator-dot"></div>
        </div>
        <span class="warning-text">{{ warning.text }}</span>
      </div>
    </div>

    <!-- Avoid Characters (who this character should avoid) -->
    <div v-if="avoidCharacters.length > 0" class="avoid-section">
      <div class="avoid-header">
        <span class="avoid-icon">✕</span>
        <span class="avoid-title">Characters to Avoid</span>
      </div>

      <div class="avoid-list">
        <div
          v-for="(avoid, index) in avoidCharacters"
          :key="avoid.character!.id"
          class="avoid-item"
          :style="{ '--item-delay': `${index * 0.05}s` }"
        >
          <div class="avoid-portrait">
            <img
              :src="`/icons/${avoid.character!.id}.webp`"
              :alt="avoid.character!.name"
              class="portrait-img"
              @error="($event.target as HTMLImageElement).style.display = 'none'"
            />
            <div class="avoid-x">✕</div>
          </div>
          <div class="avoid-info">
            <span class="avoid-name">{{ avoid.character!.name }}</span>
            <span class="avoid-reason">"{{ avoid.reason }}"</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Avoided By (characters who avoid this character) -->
    <div v-if="avoidedByCharacters.length > 0" class="avoided-by-section">
      <div class="avoided-by-header">
        <span class="avoided-by-icon">◇</span>
        <span class="avoided-by-title">Characters Who Avoid {{ character.name }}</span>
      </div>

      <div class="avoided-by-list">
        <div
          v-for="(entry, index) in avoidedByCharacters"
          :key="entry.character.id"
          class="avoided-by-item"
          :style="{ '--item-delay': `${index * 0.05}s` }"
        >
          <div class="avoided-by-portrait">
            <img
              :src="`/icons/${entry.character.id}.webp`"
              :alt="entry.character.name"
              class="portrait-img"
              @error="($event.target as HTMLImageElement).style.display = 'none'"
            />
          </div>
          <div class="avoided-by-info">
            <span class="avoided-by-name">{{ entry.character.name }}</span>
            <span class="avoided-by-reason">"{{ entry.reason }}"</span>
          </div>
        </div>
      </div>

      <div class="avoided-by-note">
        <span class="note-text">These characters list {{ character.name }} in their avoid list</span>
      </div>
    </div>

    <!-- Decorative Corner Elements -->
    <div class="corner corner-tl"></div>
    <div class="corner corner-tr"></div>
    <div class="corner corner-bl"></div>
    <div class="corner corner-br"></div>

    <!-- Feedback Modal -->
    <ContextualFeedbackModal
      :is-open="showFeedbackModal"
      feedback-type="restriction-wrong"
      :context="feedbackContext"
      @close="closeFeedbackModal"
    />
  </div>
</template>

<style scoped>
.restrictions-panel {
  position: relative;
  background: linear-gradient(135deg, rgba(30, 20, 20, 0.8) 0%, rgba(20, 15, 25, 0.9) 100%);
  border-radius: 1rem;
  padding: 1.5rem;
  overflow: hidden;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

/* Holographic Border */
.holo-border {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  border: 1px solid transparent;
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, transparent 50%, rgba(245, 158, 11, 0.1) 100%);
  background-clip: border-box;
  -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
  mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}

/* Header */
.panel-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.header-icon {
  position: relative;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-alert {
  font-size: 1.5rem;
  color: #f59e0b;
  z-index: 1;
}

.icon-pulse {
  position: absolute;
  inset: 0;
  border: 2px solid rgba(245, 158, 11, 0.3);
  border-radius: 12px;
  animation: pulse-ring 2s ease-out infinite;
}

@keyframes pulse-ring {
  0% { transform: scale(1); opacity: 0.4; }
  100% { transform: scale(1.3); opacity: 0; }
}

.panel-title {
  font-family: var(--font-display);
  font-size: 1.125rem;
  font-weight: 700;
  color: #f59e0b;
  margin: 0;
}

.panel-subtitle {
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.4);
  margin: 0.25rem 0 0;
}

.panel-header :deep(.feedback-btn) {
  margin-left: auto;
  align-self: flex-start;
}

/* Warnings Section */
.warnings-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.warning-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 0.75rem;
  border-left: 3px solid;
  animation: warning-reveal 0.4s ease-out both;
  animation-delay: var(--item-delay, 0s);
  transition: all 0.2s;
}

@keyframes warning-reveal {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.warning-item:hover {
  background: rgba(0, 0, 0, 0.3);
}

.warning-item.critical {
  border-color: #ef4444;
  background: rgba(239, 68, 68, 0.05);
}

.warning-item.moderate {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.05);
}

.warning-item.info {
  border-color: #3b82f6;
  background: rgba(59, 130, 246, 0.05);
}

.warning-indicator {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  margin-top: 0.375rem;
}

.indicator-dot {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  animation: dot-pulse 2s ease-in-out infinite;
}

.warning-item.critical .indicator-dot {
  background: #ef4444;
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.6);
}

.warning-item.moderate .indicator-dot {
  background: #f59e0b;
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.5);
}

.warning-item.info .indicator-dot {
  background: #3b82f6;
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.5);
}

@keyframes dot-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.warning-text {
  font-size: 0.875rem;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.8);
}

/* Avoid Section */
.avoid-section {
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.avoid-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.avoid-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: rgba(239, 68, 68, 0.2);
  border-radius: 50%;
  font-size: 0.625rem;
  font-weight: 700;
  color: #ef4444;
}

.avoid-title {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.5);
}

.avoid-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.avoid-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem;
  background: rgba(239, 68, 68, 0.05);
  border: 1px solid rgba(239, 68, 68, 0.15);
  border-radius: 0.75rem;
  animation: avoid-reveal 0.4s ease-out both;
  animation-delay: var(--item-delay, 0s);
  transition: all 0.2s;
}

@keyframes avoid-reveal {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.avoid-item:hover {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.25);
}

.avoid-portrait {
  position: relative;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}

.portrait-img {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  object-fit: cover;
  filter: grayscale(30%) brightness(0.8);
}

.avoid-x {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: 700;
  color: #ef4444;
  text-shadow: 0 0 10px rgba(239, 68, 68, 0.8);
  opacity: 0.7;
}

.avoid-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
  min-width: 0;
}

.avoid-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: white;
}

.avoid-reason {
  font-size: 0.75rem;
  font-style: italic;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.4;
}

/* Corner Decorations */
.corner {
  position: absolute;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(239, 68, 68, 0.3);
}

.corner-tl {
  top: 8px;
  left: 8px;
  border-right: none;
  border-bottom: none;
  border-top-left-radius: 4px;
}

.corner-tr {
  top: 8px;
  right: 8px;
  border-left: none;
  border-bottom: none;
  border-top-right-radius: 4px;
}

.corner-bl {
  bottom: 8px;
  left: 8px;
  border-right: none;
  border-top: none;
  border-bottom-left-radius: 4px;
}

.corner-br {
  bottom: 8px;
  right: 8px;
  border-left: none;
  border-top: none;
  border-bottom-right-radius: 4px;
}

/* Animation */
.restrictions-panel {
  animation: panel-reveal 0.5s ease-out;
}

@keyframes panel-reveal {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Avoided By Section */
.avoided-by-section {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.avoided-by-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.avoided-by-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: rgba(245, 158, 11, 0.2);
  border-radius: 50%;
  font-size: 0.625rem;
  font-weight: 700;
  color: #f59e0b;
}

.avoided-by-title {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.5);
}

.avoided-by-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.avoided-by-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem;
  background: rgba(245, 158, 11, 0.05);
  border: 1px solid rgba(245, 158, 11, 0.15);
  border-radius: 0.75rem;
  animation: avoid-reveal 0.4s ease-out both;
  animation-delay: var(--item-delay, 0s);
  transition: all 0.2s;
}

.avoided-by-item:hover {
  background: rgba(245, 158, 11, 0.1);
  border-color: rgba(245, 158, 11, 0.25);
}

.avoided-by-portrait {
  position: relative;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}

.avoided-by-portrait .portrait-img {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  object-fit: cover;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.avoided-by-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
  min-width: 0;
}

.avoided-by-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: white;
}

.avoided-by-reason {
  font-size: 0.75rem;
  font-style: italic;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.4;
}

.avoided-by-note {
  margin-top: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: rgba(245, 158, 11, 0.05);
  border-radius: 0.5rem;
}

.avoided-by-note .note-text {
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.4);
  font-style: italic;
}
</style>
