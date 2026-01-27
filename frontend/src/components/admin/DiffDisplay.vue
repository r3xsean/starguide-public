<script setup lang="ts">
/**
 * Shared component for displaying diff sections
 * Used by both ChangePreview.vue and ReviewEditor.vue
 */
import { ref, computed } from 'vue';
import type { SectionDiff, DiffItem } from '../../utils/diffUtils';
import { formatCharacterName } from '../../utils/diffUtils';

// ==================
// PROPS
// ==================

const props = defineProps<{
  sections: SectionDiff[];
  // Mode: 'compact' shows collapsible sections, 'expanded' shows all inline
  mode?: 'compact' | 'expanded';
}>();

// ==================
// STATE
// ==================

const collapsedSections = ref<Set<string>>(new Set());

// ==================
// COMPUTED
// ==================

const totalChanges = computed(() => {
  return props.sections.reduce((total, section) => total + section.items.length, 0);
});

// ==================
// HELPERS
// ==================

function toggleSection(section: string) {
  if (collapsedSections.value.has(section)) {
    collapsedSections.value.delete(section);
  } else {
    collapsedSections.value.add(section);
  }
}

function isSectionCollapsed(section: string): boolean {
  return collapsedSections.value.has(section);
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '(none)';
  if (typeof value === 'string') return value || '(empty)';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    if (value.length === 0) return '(empty)';
    // Check for simple string array
    if (typeof value[0] === 'string') {
      return value.join(', ');
    }
    // For complex objects, format nicely
    return JSON.stringify(value, null, 2);
  }
  if (typeof value === 'object') {
    // Try to format nicely for common structures
    const obj = value as Record<string, unknown>;
    if ('id' in obj && 'reason' in obj) {
      // Avoid item
      return `${formatCharacterName(obj.id as string)}: ${obj.reason}`;
    }
    if ('name' in obj && 'characters' in obj) {
      // BestTeam
      const team = obj as { name: string; characters: string[]; rating?: string };
      return `${team.name} (${team.rating || 'N/A'}): ${team.characters.map(c => formatCharacterName(c)).join(', ')}`;
    }
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function isSimpleValue(item: DiffItem): boolean {
  const simpleTypes = ['text', 'number', 'boolean', 'rating', 'tier'];
  return item.fieldType ? simpleTypes.includes(item.fieldType) : (
    typeof item.original === 'string' ||
    typeof item.edited === 'string' ||
    typeof item.original === 'number' ||
    typeof item.edited === 'number'
  );
}

function isComplexValue(item: DiffItem): boolean {
  return !isSimpleValue(item);
}
</script>

<template>
  <div class="diff-display">
    <!-- Total Count -->
    <div class="changes-count">
      {{ totalChanges }} change{{ totalChanges !== 1 ? 's' : '' }}
    </div>

    <!-- Empty State -->
    <div v-if="sections.length === 0" class="no-changes">
      No changes detected
    </div>

    <!-- Sections -->
    <div v-else class="diff-sections">
      <div
        v-for="section in sections"
        :key="section.section"
        class="diff-section"
      >
        <!-- Section Header -->
        <button
          v-if="mode !== 'expanded'"
          class="section-header"
          @click="toggleSection(section.section)"
        >
          <div class="section-header-left">
            <svg
              :class="['section-chevron', { collapsed: isSectionCollapsed(section.section) }]"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                clip-rule="evenodd"
              />
            </svg>
            <span class="section-title">{{ section.section }}</span>
          </div>
          <span class="section-count">{{ section.items.length }}</span>
        </button>

        <div v-else class="section-header-expanded">
          <span class="section-title">{{ section.section }}</span>
          <span class="section-count">{{ section.items.length }}</span>
        </div>

        <!-- Section Content -->
        <div
          v-show="mode === 'expanded' || !isSectionCollapsed(section.section)"
          class="section-content"
        >
          <div
            v-for="(item, idx) in section.items"
            :key="`${item.path}-${idx}`"
            :class="['diff-item', `diff-${item.type}`]"
          >
            <!-- Header with label and badge -->
            <div class="diff-item-header">
              <span class="diff-label">{{ item.label }}</span>
              <span :class="['diff-badge', `badge-${item.type}`]">
                {{ item.type }}
              </span>
            </div>

            <!-- Content based on type -->
            <div class="diff-content">
              <!-- Simple value: show inline change -->
              <template v-if="isSimpleValue(item) && item.type === 'changed'">
                <div class="simple-change">
                  <span class="value-old">{{ formatValue(item.original) }}</span>
                  <svg class="arrow-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd" />
                  </svg>
                  <span class="value-new">{{ formatValue(item.edited) }}</span>
                </div>
              </template>

              <!-- Added value -->
              <template v-else-if="item.type === 'added'">
                <div class="value-added">
                  <span class="diff-prefix">+</span>
                  <span class="diff-value">{{ formatValue(item.edited) }}</span>
                </div>
              </template>

              <!-- Removed value -->
              <template v-else-if="item.type === 'removed'">
                <div class="value-removed">
                  <span class="diff-prefix">-</span>
                  <span class="diff-value">{{ formatValue(item.original) }}</span>
                </div>
              </template>

              <!-- Complex changed value: show side by side -->
              <template v-else-if="isComplexValue(item) && item.type === 'changed'">
                <div class="complex-change">
                  <div class="change-column change-original">
                    <div class="column-label">Original</div>
                    <pre class="column-value">{{ formatValue(item.original) }}</pre>
                  </div>
                  <div class="change-column change-proposed">
                    <div class="column-label">Proposed</div>
                    <pre class="column-value">{{ formatValue(item.edited) }}</pre>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.diff-display {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.changes-count {
  font-size: 0.875rem;
  font-weight: 500;
  color: rgba(148, 163, 184, 0.9);
}

.no-changes {
  padding: 2rem;
  text-align: center;
  color: rgba(148, 163, 184, 0.6);
  font-size: 0.9375rem;
}

/* ==================
   SECTIONS
   ================== */

.diff-sections {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.diff-section {
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(71, 85, 105, 0.4);
  border-radius: 0.5rem;
  overflow: hidden;
}

.section-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: rgba(30, 41, 59, 0.5);
  border: none;
  cursor: pointer;
  transition: background 0.15s ease;
}

.section-header:hover {
  background: rgba(51, 65, 85, 0.4);
}

.section-header-expanded {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: rgba(30, 41, 59, 0.5);
  border-bottom: 1px solid rgba(71, 85, 105, 0.3);
}

.section-header-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.section-chevron {
  width: 1rem;
  height: 1rem;
  color: rgba(148, 163, 184, 0.7);
  transition: transform 0.2s ease;
}

.section-chevron.collapsed {
  transform: rotate(-90deg);
}

.section-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: rgba(226, 232, 240, 1);
}

.section-count {
  font-size: 0.75rem;
  font-weight: 500;
  color: rgba(148, 163, 184, 0.8);
  background: rgba(71, 85, 105, 0.4);
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
}

.section-content {
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

/* ==================
   DIFF ITEMS
   ================== */

.diff-item {
  padding: 0.625rem 0.75rem;
  border-radius: 0.375rem;
  border: 1px solid transparent;
}

.diff-added {
  background: rgba(34, 197, 94, 0.05);
  border-color: rgba(34, 197, 94, 0.2);
}

.diff-removed {
  background: rgba(239, 68, 68, 0.05);
  border-color: rgba(239, 68, 68, 0.2);
}

.diff-changed {
  background: rgba(251, 191, 36, 0.05);
  border-color: rgba(251, 191, 36, 0.2);
}

.diff-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.375rem;
}

.diff-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: rgba(226, 232, 240, 1);
}

.diff-badge {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 0.125rem 0.375rem;
  border-radius: 0.1875rem;
}

.badge-added {
  background: rgba(34, 197, 94, 0.15);
  color: rgba(34, 197, 94, 0.9);
}

.badge-removed {
  background: rgba(239, 68, 68, 0.15);
  color: rgba(239, 68, 68, 0.9);
}

.badge-changed {
  background: rgba(251, 191, 36, 0.15);
  color: rgba(251, 191, 36, 0.9);
}

/* ==================
   DIFF VALUES
   ================== */

.diff-content {
  font-size: 0.8125rem;
}

/* Simple change: old → new */
.simple-change {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.value-old {
  color: rgba(239, 68, 68, 0.9);
  background: rgba(239, 68, 68, 0.1);
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-weight: 500;
}

.value-new {
  color: rgba(34, 197, 94, 0.9);
  background: rgba(34, 197, 94, 0.1);
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-weight: 500;
}

.arrow-icon {
  width: 1rem;
  height: 1rem;
  color: rgba(148, 163, 184, 0.6);
  flex-shrink: 0;
}

/* Added/Removed values */
.value-added,
.value-removed {
  display: flex;
  gap: 0.375rem;
  padding: 0.375rem 0.5rem;
  border-radius: 0.25rem;
}

.value-added {
  background: rgba(34, 197, 94, 0.08);
  color: rgba(34, 197, 94, 0.9);
}

.value-removed {
  background: rgba(239, 68, 68, 0.08);
  color: rgba(239, 68, 68, 0.9);
}

.diff-prefix {
  flex-shrink: 0;
  font-weight: 600;
}

.diff-value {
  line-height: 1.4;
  word-break: break-word;
  white-space: pre-wrap;
}

/* Complex change: side by side */
.complex-change {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.change-column {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.5rem;
  border-radius: 0.375rem;
}

.change-original {
  background: rgba(239, 68, 68, 0.05);
  border: 1px solid rgba(239, 68, 68, 0.15);
}

.change-proposed {
  background: rgba(34, 197, 94, 0.05);
  border: 1px solid rgba(34, 197, 94, 0.15);
}

.column-label {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(148, 163, 184, 0.7);
}

.column-value {
  font-size: 0.75rem;
  color: rgba(203, 213, 225, 0.9);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  line-height: 1.5;
}

/* ==================
   RESPONSIVE
   ================== */

@media (max-width: 640px) {
  .complex-change {
    grid-template-columns: 1fr;
  }

  .diff-item-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.375rem;
  }

  .simple-change {
    flex-direction: column;
    align-items: flex-start;
  }

  .arrow-icon {
    transform: rotate(90deg);
    margin: 0.25rem 0;
  }
}
</style>
