<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import type { TeamComposition, BestTeam, TeammateOverride, Path, Character } from '../../../types';
import TeammateEditor from './TeammateEditor.vue';
import BestTeamEditor from './BestTeamEditor.vue';

// Auto-resize textareas
const descTextarea = ref<HTMLTextAreaElement | null>(null);
const mechanicTextarea = ref<HTMLTextAreaElement | null>(null);

function autoResize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

interface Props {
  modelValue: TeamComposition;
  allCharacters: Character[];
  isOnlyPrimary?: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: TeamComposition];
  delete: [];
}>();

// Collapsible states
const isExpanded = ref(true);
const showStructure = ref(false);
const showWeakModes = ref(false);
const showInvestmentNotes = ref(false);
const showCore = ref(false);
const showPathRequirements = ref(false);
const showLabelRequirements = ref(false);
const showTeammateOverrides = ref(false);
const showTeams = ref(false);

// Game modes for weak modes
const gameModes: ('moc' | 'pf' | 'as')[] = ['moc', 'pf', 'as'];
const gameModeLabels: Record<'moc' | 'pf' | 'as', string> = {
  moc: 'Memory of Chaos',
  pf: 'Pure Fiction',
  as: 'Apocalyptic Shadow',
};

// Eidolon levels for core requirements
const eidolonLevels: (0 | 1 | 2 | 3 | 4 | 5 | 6)[] = [0, 1, 2, 3, 4, 5, 6];

// Path options
const paths: Path[] = ['Destruction', 'Hunt', 'Erudition', 'Harmony', 'Nihility', 'Preservation', 'Abundance', 'Remembrance'];

// Role types for teammate overrides
const roleTypes = ['dps', 'amplifiers', 'sustains', 'subDPS'] as const;
type RoleType = typeof roleTypes[number];

// Structure sum validation
const structureSum = computed(() => {
  const s = props.modelValue.structure;
  if (!s) return 0;
  return (s.dps || 0) + (s.amplifier || 0) + (s.sustain || 0);
});

const structureValid = computed(() => structureSum.value === 4);

// Counts for section badges
const weakModesCount = computed(() => props.modelValue.weakModes?.length || 0);
const investmentNotesCount = computed(() => props.modelValue.investmentNotes?.length || 0);
const coreCount = computed(() => props.modelValue.core?.length || 0);
const pathRequirementsCount = computed(() => props.modelValue.pathRequirements?.length || 0);
const labelRequirementsCount = computed(() => props.modelValue.labelRequirements?.length || 0);
const teamsCount = computed(() => props.modelValue.teams?.length || 0);
const overridesCount = computed(() => {
  const o = props.modelValue.teammateOverrides;
  if (!o) return 0;
  return (o.dps?.length || 0) + (o.amplifiers?.length || 0) +
         (o.sustains?.length || 0) + (o.subDPS?.length || 0);
});

// Sorted characters for pickers
const sortedCharacters = computed(() => {
  return [...props.allCharacters].sort((a, b) => a.name.localeCompare(b.name));
});

// Auto-generate ID from name
watch(() => props.modelValue.name, (name) => {
  if (name && !props.modelValue.id) {
    const autoId = name.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    updateField('id', autoId);
  }
});

// Auto-resize on value change
watch(() => props.modelValue.description, () => {
  nextTick(() => autoResize(descTextarea.value));
});

watch(() => props.modelValue.coreMechanic, () => {
  nextTick(() => autoResize(mechanicTextarea.value));
});

onMounted(() => {
  nextTick(() => {
    autoResize(descTextarea.value);
    autoResize(mechanicTextarea.value);
  });
});

function updateField<K extends keyof TeamComposition>(field: K, value: TeamComposition[K]) {
  emit('update:modelValue', {
    ...props.modelValue,
    [field]: value,
  });
}

// Structure updates
function updateStructure(field: 'dps' | 'amplifier' | 'sustain', value: number) {
  const current = props.modelValue.structure || { dps: 1, amplifier: 2, sustain: 1 };
  updateField('structure', {
    dps: current.dps ?? 1,
    amplifier: current.amplifier ?? 2,
    sustain: current.sustain ?? 1,
    [field]: value,
  });
}

// Path requirements
function addPathRequirement() {
  const reqs = [...(props.modelValue.pathRequirements || [])];
  reqs.push({ path: 'Harmony', count: 1, reason: '' });
  updateField('pathRequirements', reqs);
}

function updatePathRequirement(index: number, field: 'path' | 'count' | 'reason', value: Path | number | string) {
  const reqs = [...(props.modelValue.pathRequirements || [])];
  const current = reqs[index];
  if (!current) return;
  reqs[index] = {
    path: field === 'path' ? (value as Path) : current.path,
    count: field === 'count' ? (value as number) : current.count,
    reason: field === 'reason' ? (value as string) : current.reason,
  };
  updateField('pathRequirements', reqs);
}

function deletePathRequirement(index: number) {
  const reqs = [...(props.modelValue.pathRequirements || [])];
  reqs.splice(index, 1);
  updateField('pathRequirements', reqs.length > 0 ? reqs : undefined);
}

// Weak modes
function addWeakMode() {
  const modes = [...(props.modelValue.weakModes || [])];
  // Find first unused mode
  const usedModes = modes.map(m => m.mode);
  const availableMode = gameModes.find(m => !usedModes.includes(m)) || 'moc';
  modes.push({ mode: availableMode, reason: '' });
  updateField('weakModes', modes);
}

function updateWeakMode(index: number, field: 'mode' | 'reason', value: 'moc' | 'pf' | 'as' | string) {
  const modes = [...(props.modelValue.weakModes || [])];
  const current = modes[index];
  if (!current) return;
  modes[index] = {
    mode: field === 'mode' ? (value as 'moc' | 'pf' | 'as') : current.mode,
    reason: field === 'reason' ? (value as string) : current.reason,
  };
  updateField('weakModes', modes);
}

function deleteWeakMode(index: number) {
  const modes = [...(props.modelValue.weakModes || [])];
  modes.splice(index, 1);
  updateField('weakModes', modes.length > 0 ? modes : undefined);
}

// Investment notes
function addInvestmentNote() {
  const notes = [...(props.modelValue.investmentNotes || [])];
  notes.push('');
  updateField('investmentNotes', notes);
}

function updateInvestmentNote(index: number, value: string) {
  const notes = [...(props.modelValue.investmentNotes || [])];
  notes[index] = value;
  updateField('investmentNotes', notes);
}

function deleteInvestmentNote(index: number) {
  const notes = [...(props.modelValue.investmentNotes || [])];
  notes.splice(index, 1);
  updateField('investmentNotes', notes.length > 0 ? notes : undefined);
}

// Core requirements
function addCoreRequirement() {
  const core = [...(props.modelValue.core || [])];
  core.push({ characterId: '', reason: '' });
  updateField('core', core);
}

function updateCoreRequirement(index: number, field: string, value: string | number | string[] | undefined) {
  const core = [...(props.modelValue.core || [])];
  const current = core[index];
  if (!current) return;
  core[index] = {
    ...current,
    [field]: value,
  };
  updateField('core', core);
}

function deleteCoreRequirement(index: number) {
  const core = [...(props.modelValue.core || [])];
  core.splice(index, 1);
  updateField('core', core.length > 0 ? core : undefined);
}

// Label requirements
function addLabelRequirement() {
  const reqs = [...(props.modelValue.labelRequirements || [])];
  reqs.push({ label: '', count: 1, reason: '' });
  updateField('labelRequirements', reqs);
}

function updateLabelRequirement(index: number, field: 'label' | 'count' | 'reason', value: string | number) {
  const reqs = [...(props.modelValue.labelRequirements || [])];
  const current = reqs[index];
  if (!current) return;
  reqs[index] = {
    label: field === 'label' ? (value as string) : current.label,
    count: field === 'count' ? (value as number) : current.count,
    reason: field === 'reason' ? (value as string) : current.reason,
  };
  updateField('labelRequirements', reqs);
}

function deleteLabelRequirement(index: number) {
  const reqs = [...(props.modelValue.labelRequirements || [])];
  reqs.splice(index, 1);
  updateField('labelRequirements', reqs.length > 0 ? reqs : undefined);
}

// Teammate overrides
function getOverridesForRole(role: RoleType): TeammateOverride[] {
  return props.modelValue.teammateOverrides?.[role] || [];
}

function addTeammateOverride(role: RoleType) {
  const overrides = { ...props.modelValue.teammateOverrides };
  const roleOverrides = [...(overrides[role] || [])];
  roleOverrides.push({ id: '', rating: 'S', reason: '' });
  overrides[role] = roleOverrides;
  updateField('teammateOverrides', overrides);
}

function updateTeammateOverride(role: RoleType, index: number, value: TeammateOverride) {
  const overrides = { ...props.modelValue.teammateOverrides };
  const roleOverrides = [...(overrides[role] || [])];
  roleOverrides[index] = value;
  overrides[role] = roleOverrides;
  updateField('teammateOverrides', overrides);
}

function deleteTeammateOverride(role: RoleType, index: number) {
  const overrides = { ...props.modelValue.teammateOverrides };
  const roleOverrides = [...(overrides[role] || [])];
  roleOverrides.splice(index, 1);

  if (roleOverrides.length > 0) {
    overrides[role] = roleOverrides;
  } else {
    delete overrides[role];
  }

  // Check if all roles are empty
  const hasAnyOverrides = Object.values(overrides).some(arr => arr && arr.length > 0);
  updateField('teammateOverrides', hasAnyOverrides ? overrides : undefined);
}

// Teams
function addTeam() {
  const teams = [...(props.modelValue.teams || [])];
  teams.push({
    name: '',
    characters: ['', '', '', ''],
    rating: 'A',
    structure: 'hypercarry',
  });
  updateField('teams', teams);
}

function updateTeam(index: number, value: BestTeam) {
  const teams = [...(props.modelValue.teams || [])];
  teams[index] = value;
  updateField('teams', teams);
}

function deleteTeam(index: number) {
  const teams = [...(props.modelValue.teams || [])];
  teams.splice(index, 1);
  updateField('teams', teams.length > 0 ? teams : undefined);
}

// Role display names
function getRoleDisplayName(role: RoleType): string {
  switch (role) {
    case 'dps': return 'DPS';
    case 'amplifiers': return 'Amplifiers';
    case 'sustains': return 'Sustains';
    case 'subDPS': return 'Sub-DPS';
    default: return role;
  }
}
</script>

<template>
  <div class="composition-editor" :class="{ collapsed: !isExpanded }">
    <!-- Header -->
    <div class="editor-header" @click="isExpanded = !isExpanded">
      <button
        type="button"
        class="expand-btn"
      >
        <svg
          class="expand-icon"
          :class="{ expanded: isExpanded }"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      <div class="header-info">
        <span class="comp-name">{{ modelValue.name || 'New Composition' }}</span>
        <span v-if="modelValue.isPrimary" class="primary-badge">Primary</span>
      </div>

      <button
        type="button"
        class="delete-btn"
        title="Delete composition"
        @click.stop="emit('delete')"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
      </button>
    </div>

    <!-- Body (Collapsible) -->
    <div v-if="isExpanded" class="editor-body">
      <!-- Basic Info Section -->
      <div class="section basic-info">
        <div class="form-row">
          <div class="form-group flex-1">
            <label class="form-label">ID</label>
            <input
              :value="modelValue.id"
              class="form-input"
              placeholder="auto-generated-from-name"
              @input="updateField('id', ($event.target as HTMLInputElement).value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))"
            />
          </div>
          <div class="form-group flex-2">
            <label class="form-label">Name</label>
            <input
              :value="modelValue.name"
              class="form-input"
              placeholder="Composition Name"
              @input="updateField('name', ($event.target as HTMLInputElement).value)"
            />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea
            ref="descTextarea"
            :value="modelValue.description"
            class="form-textarea auto-resize"
            rows="2"
            placeholder="What is this composition about? When should it be used?"
            @input="updateField('description', ($event.target as HTMLTextAreaElement).value); autoResize($event.target as HTMLTextAreaElement)"
          ></textarea>
        </div>

        <div class="form-row align-center">
          <div class="form-group">
            <label class="form-label">Primary Composition</label>
            <label class="toggle-label">
              <input
                type="checkbox"
                :checked="modelValue.isPrimary"
                :disabled="isOnlyPrimary && modelValue.isPrimary"
                class="toggle-input"
                @change="updateField('isPrimary', ($event.target as HTMLInputElement).checked)"
              />
              <span class="toggle-slider"></span>
              <span class="toggle-text">{{ modelValue.isPrimary ? 'Yes' : 'No' }}</span>
            </label>
            <span v-if="isOnlyPrimary && modelValue.isPrimary" class="toggle-hint">
              At least one composition must be primary
            </span>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">
            Core Mechanic
            <span class="label-hint">(optional)</span>
          </label>
          <textarea
            ref="mechanicTextarea"
            :value="modelValue.coreMechanic || ''"
            class="form-textarea auto-resize"
            rows="2"
            placeholder="What core synergy makes this composition work?"
            @input="updateField('coreMechanic', ($event.target as HTMLTextAreaElement).value); autoResize($event.target as HTMLTextAreaElement)"
          ></textarea>
        </div>
      </div>

      <!-- Structure Section (Collapsible) -->
      <div class="section collapsible-section">
        <button
          type="button"
          class="section-toggle"
          @click="showStructure = !showStructure"
        >
          <svg
            class="toggle-icon"
            :class="{ expanded: showStructure }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span>Team Structure</span>
          <span v-if="modelValue.structure" class="section-badge">{{ structureSum }}/4</span>
        </button>

        <div v-if="showStructure" class="section-content">
          <p class="field-help">How many of each role in this team? Must total 4. Example: 1 DPS + 2 Amplifiers + 1 Sustain.</p>
          <div class="structure-inputs">
            <div class="structure-input-group">
              <label class="structure-label">DPS</label>
              <input
                type="number"
                :value="modelValue.structure?.dps ?? 1"
                class="form-input structure-input"
                min="0"
                max="4"
                @input="updateStructure('dps', parseInt(($event.target as HTMLInputElement).value) || 0)"
              />
            </div>
            <div class="structure-input-group">
              <label class="structure-label">Amplifier</label>
              <input
                type="number"
                :value="modelValue.structure?.amplifier ?? 2"
                class="form-input structure-input"
                min="0"
                max="4"
                @input="updateStructure('amplifier', parseInt(($event.target as HTMLInputElement).value) || 0)"
              />
            </div>
            <div class="structure-input-group">
              <label class="structure-label">Sustain</label>
              <input
                type="number"
                :value="modelValue.structure?.sustain ?? 1"
                class="form-input structure-input"
                min="0"
                max="4"
                @input="updateStructure('sustain', parseInt(($event.target as HTMLInputElement).value) || 0)"
              />
            </div>
            <div class="structure-validation" :class="{ valid: structureValid, invalid: !structureValid }">
              <span v-if="structureValid">Valid (4 slots)</span>
              <span v-else>Must equal 4 (currently {{ structureSum }})</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Weak Modes Section (Collapsible) -->
      <div class="section collapsible-section">
        <button
          type="button"
          class="section-toggle"
          @click="showWeakModes = !showWeakModes"
        >
          <svg
            class="toggle-icon"
            :class="{ expanded: showWeakModes }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span>Weak Modes</span>
          <span v-if="weakModesCount > 0" class="section-badge">{{ weakModesCount }}</span>
        </button>

        <div v-if="showWeakModes" class="section-content">
          <p class="section-hint">
            Modes where this composition struggles despite good teammates.
          </p>

          <div v-if="weakModesCount === 0" class="section-empty">
            No weak modes. Add one if this composition struggles in specific game modes.
          </div>

          <div
            v-for="(wm, index) in modelValue.weakModes"
            :key="index"
            class="weak-mode-item"
          >
            <select
              :value="wm.mode"
              class="form-select mode-select"
              @change="updateWeakMode(index, 'mode', ($event.target as HTMLSelectElement).value as 'moc' | 'pf' | 'as')"
            >
              <option
                v-for="mode in gameModes"
                :key="mode"
                :value="mode"
              >
                {{ gameModeLabels[mode] }}
              </option>
            </select>
            <input
              :value="wm.reason"
              class="form-input reason-input"
              placeholder="Why does this comp struggle in this mode?"
              @input="updateWeakMode(index, 'reason', ($event.target as HTMLInputElement).value)"
            />
            <button
              type="button"
              class="mini-delete-btn"
              @click="deleteWeakMode(index)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <button
            type="button"
            class="add-btn"
            @click="addWeakMode"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Weak Mode
          </button>
        </div>
      </div>

      <!-- Investment Notes Section (Collapsible) -->
      <div class="section collapsible-section">
        <button
          type="button"
          class="section-toggle"
          @click="showInvestmentNotes = !showInvestmentNotes"
        >
          <svg
            class="toggle-icon"
            :class="{ expanded: showInvestmentNotes }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span>Investment Notes</span>
          <span v-if="investmentNotesCount > 0" class="section-badge">{{ investmentNotesCount }}</span>
        </button>

        <div v-if="showInvestmentNotes" class="section-content">
          <p class="section-hint">
            Investment advice specific to this composition.
          </p>

          <div v-if="investmentNotesCount === 0" class="section-empty">
            No investment notes. Add tips about eidolons or light cones for this composition.
          </div>

          <div
            v-for="(note, index) in modelValue.investmentNotes"
            :key="index"
            class="investment-note-item"
          >
            <input
              :value="note"
              class="form-input note-input"
              placeholder="Investment tip for this composition..."
              @input="updateInvestmentNote(index, ($event.target as HTMLInputElement).value)"
            />
            <button
              type="button"
              class="mini-delete-btn"
              @click="deleteInvestmentNote(index)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <button
            type="button"
            class="add-btn"
            @click="addInvestmentNote"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Investment Note
          </button>
        </div>
      </div>

      <!-- Core Requirements Section (Collapsible) -->
      <div class="section collapsible-section">
        <button
          type="button"
          class="section-toggle"
          @click="showCore = !showCore"
        >
          <svg
            class="toggle-icon"
            :class="{ expanded: showCore }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span>Core Requirements</span>
          <span v-if="coreCount > 0" class="section-badge">{{ coreCount }}</span>
        </button>

        <div v-if="showCore" class="section-content">
          <p class="section-hint">
            Irreplaceable characters without which this composition doesn't function.
          </p>

          <div v-if="coreCount === 0" class="section-empty">
            No core requirements. Add characters that are absolutely essential for this composition.
          </div>

          <div
            v-for="(req, index) in modelValue.core"
            :key="index"
            class="core-requirement"
          >
            <div class="core-row">
              <div class="core-field">
                <label class="core-label">Character</label>
                <select
                  :value="req.characterId"
                  class="form-select char-select"
                  @change="updateCoreRequirement(index, 'characterId', ($event.target as HTMLSelectElement).value)"
                >
                  <option value="" disabled>Select...</option>
                  <option
                    v-for="char in sortedCharacters"
                    :key="char.id"
                    :value="char.id"
                  >
                    {{ char.name }}
                  </option>
                </select>
              </div>
              <div class="core-field">
                <label class="core-label">Min Eidolon</label>
                <select
                  :value="req.minEidolon ?? 0"
                  class="form-select eidolon-select"
                  @change="updateCoreRequirement(index, 'minEidolon', parseInt(($event.target as HTMLSelectElement).value) || undefined)"
                >
                  <option
                    v-for="e in eidolonLevels"
                    :key="e"
                    :value="e"
                  >
                    {{ e === 0 ? 'Any' : `E${e}+` }}
                  </option>
                </select>
              </div>
              <button
                type="button"
                class="mini-delete-btn"
                @click="deleteCoreRequirement(index)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <input
              :value="req.reason"
              class="form-input reason-input"
              placeholder="Why is this character irreplaceable?"
              @input="updateCoreRequirement(index, 'reason', ($event.target as HTMLInputElement).value)"
            />
          </div>

          <button
            type="button"
            class="add-btn"
            @click="addCoreRequirement"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Core Requirement
          </button>
        </div>
      </div>

      <!-- Path Requirements Section (Collapsible) -->
      <div class="section collapsible-section">
        <button
          type="button"
          class="section-toggle"
          @click="showPathRequirements = !showPathRequirements"
        >
          <svg
            class="toggle-icon"
            :class="{ expanded: showPathRequirements }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span>Path Requirements</span>
          <span v-if="pathRequirementsCount > 0" class="section-badge">{{ pathRequirementsCount }}</span>
        </button>

        <div v-if="showPathRequirements" class="section-content">
          <div v-if="pathRequirementsCount === 0" class="section-empty">
            No path requirements. Add one if this composition requires specific paths.
          </div>

          <div
            v-for="(req, index) in modelValue.pathRequirements"
            :key="index"
            class="path-requirement"
          >
            <select
              :value="req.path"
              class="form-select path-select"
              @change="updatePathRequirement(index, 'path', ($event.target as HTMLSelectElement).value as Path)"
            >
              <option
                v-for="p in paths"
                :key="p"
                :value="p"
              >
                {{ p }}
              </option>
            </select>
            <input
              type="number"
              :value="req.count"
              class="form-input count-input"
              min="1"
              max="4"
              @input="updatePathRequirement(index, 'count', parseInt(($event.target as HTMLInputElement).value) || 1)"
            />
            <input
              :value="req.reason"
              class="form-input reason-input"
              placeholder="Why is this path needed?"
              @input="updatePathRequirement(index, 'reason', ($event.target as HTMLInputElement).value)"
            />
            <button
              type="button"
              class="mini-delete-btn"
              @click="deletePathRequirement(index)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <button
            type="button"
            class="add-btn"
            @click="addPathRequirement"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Path Requirement
          </button>
        </div>
      </div>

      <!-- Label Requirements Section (Collapsible) -->
      <div class="section collapsible-section">
        <button
          type="button"
          class="section-toggle"
          @click="showLabelRequirements = !showLabelRequirements"
        >
          <svg
            class="toggle-icon"
            :class="{ expanded: showLabelRequirements }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span>Label Requirements</span>
          <span v-if="labelRequirementsCount > 0" class="section-badge">{{ labelRequirementsCount }}</span>
        </button>

        <div v-if="showLabelRequirements" class="section-content">
          <p class="section-hint">
            Require characters with specific labels (e.g., "Chrysos Heir", "Memosprite").
          </p>

          <div v-if="labelRequirementsCount === 0" class="section-empty">
            No label requirements. Add one if this composition requires characters with specific labels.
          </div>

          <div
            v-for="(req, index) in modelValue.labelRequirements"
            :key="index"
            class="label-requirement"
          >
            <input
              :value="req.label"
              class="form-input label-input"
              placeholder="Label name (e.g., Chrysos Heir)"
              @input="updateLabelRequirement(index, 'label', ($event.target as HTMLInputElement).value)"
            />
            <input
              type="number"
              :value="req.count"
              class="form-input count-input"
              min="1"
              max="4"
              @input="updateLabelRequirement(index, 'count', parseInt(($event.target as HTMLInputElement).value) || 1)"
            />
            <input
              :value="req.reason"
              class="form-input reason-input"
              placeholder="Why is this label needed?"
              @input="updateLabelRequirement(index, 'reason', ($event.target as HTMLInputElement).value)"
            />
            <button
              type="button"
              class="mini-delete-btn"
              @click="deleteLabelRequirement(index)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <button
            type="button"
            class="add-btn"
            @click="addLabelRequirement"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Label Requirement
          </button>
        </div>
      </div>

      <!-- Teammate Overrides Section (Collapsible) -->
      <div class="section collapsible-section">
        <button
          type="button"
          class="section-toggle"
          @click="showTeammateOverrides = !showTeammateOverrides"
        >
          <svg
            class="toggle-icon"
            :class="{ expanded: showTeammateOverrides }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span>Teammate Overrides</span>
          <span v-if="overridesCount > 0" class="section-badge">{{ overridesCount }}</span>
        </button>

        <div v-if="showTeammateOverrides" class="section-content">
          <p class="section-hint">
            Characters rated differently in THIS composition than in Base Teammates. For example, a character might be S-tier in Hypercarry but only B-tier in Dual DPS.
          </p>

          <div
            v-for="role in roleTypes"
            :key="role"
            class="role-section"
          >
            <div class="role-header">
              <span class="role-name">{{ getRoleDisplayName(role) }}</span>
              <button
                type="button"
                class="add-inline-btn"
                @click="addTeammateOverride(role)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add
              </button>
            </div>

            <div v-if="getOverridesForRole(role).length === 0" class="role-empty">
              No overrides for {{ getRoleDisplayName(role).toLowerCase() }}
            </div>

            <TeammateEditor
              v-for="(override, index) in getOverridesForRole(role)"
              :key="index"
              :model-value="{ id: override.id, rating: override.rating || 'S', reason: override.reason || '', excluded: override.excluded }"
              :all-characters="allCharacters"
              :is-override="true"
              @update:model-value="updateTeammateOverride(role, index, { ...override, id: $event.id, rating: $event.rating, reason: $event.reason, excluded: $event.excluded })"
              @delete="deleteTeammateOverride(role, index)"
            />
          </div>
        </div>
      </div>

      <!-- Pre-Built Teams Section (Collapsible) -->
      <div class="section collapsible-section">
        <button
          type="button"
          class="section-toggle"
          @click="showTeams = !showTeams"
        >
          <svg
            class="toggle-icon"
            :class="{ expanded: showTeams }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span>Pre-Built Teams</span>
          <span v-if="teamsCount > 0" class="section-badge">{{ teamsCount }}</span>
        </button>

        <div v-if="showTeams" class="section-content">
          <div v-if="teamsCount === 0" class="section-empty">
            No pre-built teams. Add example teams for this composition.
          </div>

          <BestTeamEditor
            v-for="(team, index) in modelValue.teams"
            :key="index"
            :model-value="team"
            :all-characters="allCharacters"
            @update:model-value="updateTeam(index, $event)"
            @delete="deleteTeam(index)"
          />

          <button
            type="button"
            class="add-btn"
            @click="addTeam"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Team
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.composition-editor {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(71, 85, 105, 0.5);
  border-radius: 0.75rem;
  overflow: hidden;
}

.composition-editor.collapsed {
  background: rgba(30, 41, 59, 0.5);
}

/* Header */
.editor-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  background: rgba(15, 23, 42, 0.4);
  cursor: pointer;
  transition: background 0.2s;
}

.editor-header:hover {
  background: rgba(15, 23, 42, 0.6);
}

.expand-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: rgba(148, 163, 184, 0.7);
  cursor: pointer;
  padding: 0;
}

.expand-icon {
  width: 18px;
  height: 18px;
  transition: transform 0.2s;
}

.expand-icon.expanded {
  transform: rotate(90deg);
}

.header-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.comp-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: white;
}

.primary-badge {
  padding: 0.125rem 0.5rem;
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  border-radius: 0.25rem;
  font-size: 0.6875rem;
  font-weight: 600;
  color: white;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.delete-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 0.375rem;
  color: rgba(248, 113, 113, 0.8);
  cursor: pointer;
  transition: all 0.2s;
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.5);
  color: rgb(248, 113, 113);
}

.delete-btn svg {
  width: 16px;
  height: 16px;
}

/* Body */
.editor-body {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* Sections */
.section {
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(71, 85, 105, 0.3);
}

.section:last-child {
  padding-bottom: 0;
  border-bottom: none;
}

.collapsible-section {
  padding-bottom: 0;
}

.section-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.625rem 0.5rem;
  background: transparent;
  border: none;
  color: rgba(203, 213, 225, 0.9);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border-radius: 0.375rem;
}

.section-toggle:hover {
  background: rgba(255, 255, 255, 0.05);
}

.toggle-icon {
  width: 16px;
  height: 16px;
  color: rgba(148, 163, 184, 0.7);
  transition: transform 0.2s;
}

.toggle-icon.expanded {
  transform: rotate(90deg);
}

.section-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 0.375rem;
  background: rgba(251, 146, 60, 0.2);
  border-radius: 10px;
  font-size: 0.6875rem;
  font-weight: 600;
  color: rgba(251, 146, 60, 0.9);
}

.section-content {
  padding: 0.75rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.field-help {
  margin: 0;
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.75);
  line-height: 1.4;
}

.section-empty {
  font-size: 0.8125rem;
  color: rgba(148, 163, 184, 0.6);
  font-style: italic;
  padding: 0.5rem;
}

.section-hint {
  font-size: 0.8125rem;
  color: rgba(148, 163, 184, 0.7);
  margin-bottom: 0.5rem;
}

/* Form Elements */
.form-row {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.form-row.align-center {
  align-items: center;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.form-group.flex-1 {
  flex: 1;
  min-width: 120px;
}

.form-group.flex-2 {
  flex: 2;
  min-width: 180px;
}

.form-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: rgba(203, 213, 225, 0.9);
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.label-hint {
  font-size: 0.6875rem;
  font-weight: 400;
  color: rgba(148, 163, 184, 0.7);
}

.form-input,
.form-select,
.form-textarea {
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(71, 85, 105, 0.5);
  border-radius: 0.375rem;
  color: white;
  font-size: 0.875rem;
  font-family: inherit;
  transition: all 0.2s;
}

.form-input:focus,
.form-select:focus,
.form-textarea:focus {
  outline: none;
  border-color: rgba(251, 146, 60, 0.6);
  box-shadow: 0 0 0 2px rgba(251, 146, 60, 0.15);
}

.form-select {
  cursor: pointer;
}

.form-select option {
  background: #1e293b;
  color: white;
}

.form-textarea {
  resize: vertical;
  min-height: 60px;
}

.form-textarea.auto-resize {
  resize: none;
  overflow: hidden;
}

/* Toggle Switch */
.toggle-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.toggle-input {
  display: none;
}

.toggle-slider {
  position: relative;
  width: 40px;
  height: 22px;
  background: rgba(71, 85, 105, 0.6);
  border-radius: 11px;
  transition: all 0.2s;
}

.toggle-slider::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  background: white;
  border-radius: 50%;
  transition: all 0.2s;
}

.toggle-input:checked + .toggle-slider {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
}

.toggle-input:checked + .toggle-slider::after {
  transform: translateX(18px);
}

.toggle-input:disabled + .toggle-slider {
  opacity: 0.5;
  cursor: not-allowed;
}

.toggle-text {
  font-size: 0.8125rem;
  color: rgba(203, 213, 225, 0.9);
}

.toggle-hint {
  font-size: 0.6875rem;
  color: rgba(148, 163, 184, 0.6);
  margin-top: 0.25rem;
}

/* Structure Section */
.structure-inputs {
  display: flex;
  align-items: flex-end;
  gap: 1rem;
  flex-wrap: wrap;
}

.structure-input-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.structure-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(148, 163, 184, 0.8);
}

.structure-input {
  width: 70px;
  text-align: center;
}

.structure-validation {
  font-size: 0.75rem;
  padding: 0.375rem 0.75rem;
  border-radius: 0.25rem;
  align-self: center;
}

.structure-validation.valid {
  background: rgba(34, 197, 94, 0.1);
  color: rgba(34, 197, 94, 0.9);
}

.structure-validation.invalid {
  background: rgba(239, 68, 68, 0.1);
  color: rgba(248, 113, 113, 0.9);
}

/* Path Requirements */
.path-requirement {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.path-select {
  width: 140px;
}

.count-input {
  width: 60px;
  text-align: center;
}

.reason-input {
  flex: 1;
  min-width: 160px;
}

.mini-delete-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 0.375rem;
  color: rgba(248, 113, 113, 0.8);
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.mini-delete-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.5);
}

.mini-delete-btn svg {
  width: 14px;
  height: 14px;
}

/* Role Sections */
.role-section {
  background: rgba(15, 23, 42, 0.3);
  border: 1px solid rgba(71, 85, 105, 0.3);
  border-radius: 0.5rem;
  padding: 0.75rem;
}

.role-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.role-name {
  font-size: 0.8125rem;
  font-weight: 600;
  color: rgba(203, 213, 225, 0.9);
}

.role-empty {
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.5);
  font-style: italic;
  padding: 0.25rem 0;
}

.add-inline-btn {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  background: rgba(251, 146, 60, 0.1);
  border: 1px solid rgba(251, 146, 60, 0.3);
  border-radius: 0.25rem;
  color: rgba(251, 146, 60, 0.9);
  font-size: 0.6875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.add-inline-btn:hover {
  background: rgba(251, 146, 60, 0.15);
  border-color: rgba(251, 146, 60, 0.5);
}

.add-inline-btn svg {
  width: 12px;
  height: 12px;
}

/* Add Buttons */
.add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  background: rgba(251, 146, 60, 0.1);
  border: 1px dashed rgba(251, 146, 60, 0.4);
  border-radius: 0.375rem;
  color: rgba(251, 146, 60, 0.9);
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.add-btn:hover {
  background: rgba(251, 146, 60, 0.15);
  border-color: rgba(251, 146, 60, 0.6);
}

.add-btn svg {
  width: 16px;
  height: 16px;
}

/* Weak Modes */
.weak-mode-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.mode-select {
  width: 180px;
}

/* Investment Notes */
.investment-note-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.note-input {
  flex: 1;
}

/* Core Requirements */
.core-requirement {
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(71, 85, 105, 0.4);
  border-radius: 0.375rem;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.core-row {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.core-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.core-label {
  font-size: 0.6875rem;
  font-weight: 600;
  color: rgba(148, 163, 184, 0.8);
}

.char-select {
  width: 160px;
}

.eidolon-select {
  width: 100px;
}

/* Label Requirements */
.label-requirement {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.label-input {
  width: 160px;
}
</style>
