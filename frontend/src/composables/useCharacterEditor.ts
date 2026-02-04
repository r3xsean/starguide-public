import { ref, computed, watch, type Ref } from 'vue';
import type {
  Character,
  Teammates,
  TeammateRec,
  TeamComposition,
  TeammateRating,
  Role,
  TierRating,
} from '../types';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

// ============================================
// Types
// ============================================

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface TierEdits {
  moc?: Record<Role, TierRating | undefined>;
  pf?: Record<Role, TierRating | undefined>;
  as?: Record<Role, TierRating | undefined>;
}

export interface SubmitResult {
  success: boolean;
  error?: string;
}

// ============================================
// Constants
// ============================================

const VALID_RATINGS: TeammateRating[] = ['S+', 'S', 'A', 'B', 'C', 'D'];
const VALID_TIERS: TierRating[] = ['T-1', 'T-0.5', 'T0', 'T0.5', 'T1', 'T1.5', 'T2', 'T3', 'T4', 'T5'];

const DESCRIPTION_MIN = 100;
const DESCRIPTION_MAX = 250;
const LABELS_MIN = 3;
const LABELS_MAX = 12;
const REASON_MIN = 40;
const REASON_MAX = 400;

// ============================================
// Utility Functions
// ============================================

/**
 * Deep clone an object using JSON parse/stringify.
 * Safe for plain objects without circular references or special types.
 */
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Compare two objects for deep equality.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Get the differences between two objects, returning paths of changed fields.
 */
function getChangedPaths(original: Record<string, unknown>, edited: Record<string, unknown>, prefix = ''): string[] {
  const changes: string[] = [];
  const allKeys = new Set([...Object.keys(original), ...Object.keys(edited)]);

  for (const key of allKeys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const origVal = original[key];
    const editVal = edited[key];

    if (origVal === editVal) continue;

    if (
      typeof origVal === 'object' &&
      typeof editVal === 'object' &&
      origVal !== null &&
      editVal !== null &&
      !Array.isArray(origVal) &&
      !Array.isArray(editVal)
    ) {
      changes.push(...getChangedPaths(
        origVal as Record<string, unknown>,
        editVal as Record<string, unknown>,
        path
      ));
    } else if (!deepEqual(origVal, editVal)) {
      changes.push(path);
    }
  }

  return changes;
}

/**
 * Get a value from an object at a dot-separated path.
 */
function getValueAtPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Compute field-level changes between original and edited character data.
 * Returns an object mapping field paths to their new values.
 */
function computeFieldChanges(
  original: Character,
  edited: Character
): Record<string, unknown> {
  const paths = getChangedPaths(
    original as unknown as Record<string, unknown>,
    edited as unknown as Record<string, unknown>
  );
  const changes: Record<string, unknown> = {};
  for (const path of paths) {
    changes[path] = getValueAtPath(edited, path);
  }
  return changes;
}

// ============================================
// Composable
// ============================================

export function useCharacterEditor(characterId: Ref<string>) {
  const { user } = useAuth();

  // State
  const originalData = ref<Character | null>(null);
  const editedData = ref<Character | null>(null);
  const tierEdits = ref<TierEdits | null>(null);
  const originalTiers = ref<TierEdits | null>(null);
  const validationErrors = ref<ValidationError[]>([]);
  const isLoading = ref(false);
  const isSaving = ref(false);
  const loadError = ref<string | null>(null);

  // ============================================
  // Computed Properties
  // ============================================

  const isDirty = computed(() => {
    if (!originalData.value || !editedData.value) return false;
    const dataChanged = !deepEqual(originalData.value, editedData.value);
    const tiersChanged = !deepEqual(originalTiers.value, tierEdits.value);
    return dataChanged || tiersChanged;
  });

  const changedFields = computed((): string[] => {
    if (!originalData.value || !editedData.value) return [];

    const changes: string[] = [];

    // Compare character data
    const charChanges = getChangedPaths(
      originalData.value as unknown as Record<string, unknown>,
      editedData.value as unknown as Record<string, unknown>
    );
    changes.push(...charChanges);

    // Compare tier data
    if (originalTiers.value && tierEdits.value) {
      const tierChanges = getChangedPaths(
        originalTiers.value as unknown as Record<string, unknown>,
        tierEdits.value as unknown as Record<string, unknown>,
        'tiers'
      );
      changes.push(...tierChanges);
    } else if (originalTiers.value !== tierEdits.value) {
      changes.push('tiers');
    }

    return changes;
  });

  const hasErrors = computed(() =>
    validationErrors.value.some(e => e.severity === 'error')
  );

  const hasWarnings = computed(() =>
    validationErrors.value.some(e => e.severity === 'warning')
  );

  // ============================================
  // Validation
  // ============================================

  // Helper to get role display name
  function getRoleDisplayName(role: string): string {
    const names: Record<string, string> = {
      dps: 'DPS',
      subDPS: 'Sub-DPS',
      amplifiers: 'Amplifiers',
      sustains: 'Sustains',
    };
    return names[role] || role;
  }

  // Helper to format character ID for display (fallback if name not available)
  function formatCharacterId(id: string): string {
    if (!id) return '(empty)';
    // Convert kebab-case to Title Case
    return id
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  function validateTeammates(
    teammates: Teammates | undefined,
    prefix: string,
    errors: ValidationError[]
  ): void {
    if (!teammates) return;

    const roles = ['dps', 'subDPS', 'amplifiers', 'sustains'] as const;

    for (const role of roles) {
      const list = teammates[role];
      if (!list) continue;

      const roleDisplay = getRoleDisplayName(role);

      list.forEach((tm: TeammateRec, i: number) => {
        const fieldPath = `${prefix}.${role}[${i}]`;
        const charDisplay = formatCharacterId(tm.id);

        // Validate reason length
        if (tm.reason.length < REASON_MIN) {
          errors.push({
            field: `${fieldPath}.reason`,
            message: `${roleDisplay} > ${charDisplay}: Add more detail about the synergy (${tm.reason.length}/${REASON_MIN} chars)`,
            severity: 'error',
          });
        }
        if (tm.reason.length > REASON_MAX) {
          errors.push({
            field: `${fieldPath}.reason`,
            message: `${roleDisplay} > ${charDisplay}: Reason is too long, please be more concise (${tm.reason.length}/${REASON_MAX} max)`,
            severity: 'error',
          });
        }


        // Validate rating
        if (!VALID_RATINGS.includes(tm.rating)) {
          errors.push({
            field: `${fieldPath}.rating`,
            message: `${roleDisplay} > ${charDisplay}: Invalid rating "${tm.rating}"`,
            severity: 'error',
          });
        }

        // Validate character ID is not empty
        if (!tm.id || tm.id.trim() === '') {
          errors.push({
            field: `${fieldPath}.id`,
            message: `${roleDisplay} > Entry #${i + 1}: Select a character from the dropdown`,
            severity: 'error',
          });
        }
      });

      // Check for duplicate character IDs
      const ids = list.map((tm: TeammateRec) => tm.id);
      const duplicates = ids.filter((id: string, index: number) => ids.indexOf(id) !== index);
      if (duplicates.length > 0) {
        const dupNames = [...new Set(duplicates)].map(formatCharacterId).join(', ');
        errors.push({
          field: `${prefix}.${role}`,
          message: `${roleDisplay}: ${dupNames} appears more than once - each character should only be listed once per role`,
          severity: 'error',
        });
      }
    }
  }

  function validateCompositions(
    compositions: TeamComposition[] | undefined,
    errors: ValidationError[]
  ): void {
    if (!compositions || compositions.length === 0) return;

    // Check for exactly one primary composition
    const primaryCount = compositions.filter(c => c.isPrimary).length;
    if (primaryCount === 0) {
      errors.push({
        field: 'compositions',
        message: 'Mark one composition as Primary - this will be shown to users by default',
        severity: 'error',
      });
    } else if (primaryCount > 1) {
      errors.push({
        field: 'compositions',
        message: `Only one composition can be Primary (${primaryCount} are currently marked). Uncheck the others.`,
        severity: 'error',
      });
    }

    // Check for duplicate composition IDs
    const compIds = compositions.map(c => c.id);
    const duplicateIds = compIds.filter((id, index) => compIds.indexOf(id) !== index);
    if (duplicateIds.length > 0) {
      errors.push({
        field: 'compositions',
        message: `Each composition needs a unique ID. Duplicates: ${[...new Set(duplicateIds)].join(', ')}`,
        severity: 'error',
      });
    }

    compositions.forEach((comp, i) => {
      const compName = comp.name || `Composition #${i + 1}`;

      // Validate structure sums to 4
      if (comp.structure) {
        const dps = comp.structure.dps || 0;
        const amp = comp.structure.amplifier || 0;
        const sustain = comp.structure.sustain || 0;
        const sum = dps + amp + sustain;
        if (sum !== 4) {
          errors.push({
            field: `compositions[${i}].structure`,
            message: `"${compName}": Team needs 4 characters. Currently: ${dps} DPS + ${amp} Amp + ${sustain} Sustain = ${sum}`,
            severity: 'error',
          });
        }
      }

      // Validate composition has a name
      if (!comp.name || comp.name.trim() === '') {
        errors.push({
          field: `compositions[${i}].name`,
          message: `Composition #${i + 1}: Give this composition a descriptive name (e.g., "Hypercarry", "Dual DPS")`,
          severity: 'error',
        });
      }

      // Validate composition has a description
      if (!comp.description || comp.description.trim() === '') {
        errors.push({
          field: `compositions[${i}].description`,
          message: `"${compName}": Add a description explaining when to use this team setup`,
          severity: 'error',
        });
      }


      // Validate teammate overrides (prefix includes composition name for context)
      if (comp.teammateOverrides) {
        // Create a wrapper that adds composition context to errors
        const overrideErrors: ValidationError[] = [];
        validateTeammates(
          comp.teammateOverrides as Teammates,
          `compositions[${i}].teammateOverrides`,
          overrideErrors
        );
        // Add composition context to each override error
        for (const err of overrideErrors) {
          errors.push({
            ...err,
            message: `"${compName}" Overrides > ${err.message}`,
          });
        }
      }

      // Validate teams
      if (comp.teams) {
        comp.teams.forEach((team, j) => {
          const teamName = team.name || `Team #${j + 1}`;

          if (team.characters.length !== 4) {
            errors.push({
              field: `compositions[${i}].teams[${j}].characters`,
              message: `"${compName}" > "${teamName}": Teams need exactly 4 characters (currently has ${team.characters.length})`,
              severity: 'error',
            });
          }

          // Check for empty character IDs
          team.characters.forEach((charId, k) => {
            if (!charId || charId.trim() === '') {
              errors.push({
                field: `compositions[${i}].teams[${j}].characters[${k}]`,
                message: `"${compName}" > "${teamName}": Select a character for slot ${k + 1}`,
                severity: 'error',
              });
            }
          });

          // Check team name
          if (!team.name || team.name.trim() === '') {
            errors.push({
              field: `compositions[${i}].teams[${j}].name`,
              message: `"${compName}" > Team #${j + 1}: Give this team a name (e.g., "Premium", "F2P Friendly")`,
              severity: 'error',
            });
          }
        });
      }
    });
  }

  function validateInvestment(
    data: Character,
    errors: ValidationError[]
  ): void {
    if (!data.investment) return;

    // Check eidolon penalties are negative
    data.investment.eidolons?.forEach((e, i) => {
      const eidolonLabel = `E${e.level}`;

      if (e.penalty >= 0) {
        errors.push({
          field: `investment.eidolons[${i}].penalty`,
          message: `${eidolonLabel}: Penalty should be negative (e.g., -25). This represents the impact of NOT having this eidolon.`,
          severity: 'error',
        });
      }

      // Check eidolon has description
      if (!e.description || e.description.trim() === '') {
        errors.push({
          field: `investment.eidolons[${i}].description`,
          message: `${eidolonLabel}: Describe what this eidolon does and why it matters`,
          severity: 'error',
        });
      }
    });

    // Check we have 6 eidolons
    if (data.investment.eidolons && data.investment.eidolons.length !== 6) {
      errors.push({
        field: 'investment.eidolons',
        message: `All characters have 6 eidolons (E1-E6). Currently have ${data.investment.eidolons.length}.`,
        severity: 'error',
      });
    }

    // Check exactly one signature light cone
    const sigCount = data.investment.lightCones?.filter(lc => lc.isSignature).length || 0;
    if (data.investment.lightCones && data.investment.lightCones.length > 0) {
      if (sigCount === 0) {
        errors.push({
          field: 'investment.lightCones',
          message: 'Mark one light cone as Signature - this is the character\'s dedicated 5★ light cone',
          severity: 'error',
        });
      } else if (sigCount > 1) {
        errors.push({
          field: 'investment.lightCones',
          message: `Only one light cone can be the Signature (${sigCount} are currently marked)`,
          severity: 'error',
        });
      }
    }

    // Validate light cone data
    data.investment.lightCones?.forEach((lc, i) => {
      const lcName = lc.name || `Light Cone #${i + 1}`;

      if (!lc.id || lc.id.trim() === '') {
        errors.push({
          field: `investment.lightCones[${i}].id`,
          message: `"${lcName}": Enter the light cone's ID (kebab-case, e.g., "night-on-the-milky-way")`,
          severity: 'error',
        });
      }

      if (!lc.name || lc.name.trim() === '') {
        errors.push({
          field: `investment.lightCones[${i}].name`,
          message: `Light Cone #${i + 1}: Enter the light cone's display name`,
          severity: 'error',
        });
      }

      // Check signature LC has s5 penalty of 0
      if (lc.isSignature && lc.penalties.s5 !== 0) {
        errors.push({
          field: `investment.lightCones[${i}].penalties.s5`,
          message: `"${lcName}": The Signature LC at S5 is the baseline (0). Other LCs are compared against it.`,
          severity: 'warning',
        });
      }

      // Check penalties are negative or zero
      if (lc.penalties.s1 > 0) {
        errors.push({
          field: `investment.lightCones[${i}].penalties.s1`,
          message: `"${lcName}": S1 penalty should be ≤0 (negative = worse than signature S5)`,
          severity: 'error',
        });
      }
      if (lc.penalties.s5 > 0) {
        errors.push({
          field: `investment.lightCones[${i}].penalties.s5`,
          message: `"${lcName}": S5 penalty should be ≤0 (negative = worse than signature S5)`,
          severity: 'error',
        });
      }
    });
  }

  function validateTiers(
    tiers: TierEdits | null,
    roles: Role[],
    errors: ValidationError[]
  ): void {
    if (!tiers) return;

    const modes = ['moc', 'pf', 'as'] as const;

    for (const mode of modes) {
      const modeTiers = tiers[mode];
      if (!modeTiers) continue;

      for (const [role, tier] of Object.entries(modeTiers)) {
        if (tier && !VALID_TIERS.includes(tier as TierRating)) {
          errors.push({
            field: `tiers.${mode}.${role}`,
            message: `Invalid tier: ${tier}`,
            severity: 'error',
          });
        }
      }
    }

    // Check that tiers exist for all character roles
    for (const role of roles) {
      for (const mode of modes) {
        const modeTiers = tiers[mode];
        if (!modeTiers || modeTiers[role] === undefined) {
          errors.push({
            field: `tiers.${mode}.${role}`,
            message: `Missing tier for ${role} in ${mode.toUpperCase()}`,
            severity: 'warning',
          });
        }
      }
    }
  }

  function validate(): ValidationError[] {
    const errors: ValidationError[] = [];
    if (!editedData.value) return errors;

    const data = editedData.value;

    // Validate description length
    if (data.description) {
      if (data.description.length < DESCRIPTION_MIN) {
        errors.push({
          field: 'description',
          message: `Description needs more detail - explain the character's playstyle (${data.description.length}/${DESCRIPTION_MIN} chars)`,
          severity: 'error',
        });
      }
      if (data.description.length > DESCRIPTION_MAX) {
        errors.push({
          field: 'description',
          message: `Description is too long - keep it concise (${data.description.length}/${DESCRIPTION_MAX} max)`,
          severity: 'error',
        });
      }
    } else {
      errors.push({
        field: 'description',
        message: 'Add a brief description of this character\'s playstyle and role',
        severity: 'error',
      });
    }

    // Validate labels count
    if (data.labels) {
      if (data.labels.length < LABELS_MIN) {
        errors.push({
          field: 'labels',
          message: `Add more labels to help users find this character (${data.labels.length}/${LABELS_MIN} minimum)`,
          severity: 'error',
        });
      }
      if (data.labels.length > LABELS_MAX) {
        errors.push({
          field: 'labels',
          message: `Too many labels - keep only the most relevant ones (${data.labels.length}/${LABELS_MAX} max)`,
          severity: 'error',
        });
      }

      // Check for empty labels
      data.labels.forEach((label, i) => {
        if (!label || label.trim() === '') {
          errors.push({
            field: `labels[${i}]`,
            message: `Label #${i + 1} is empty - remove it or add text`,
            severity: 'error',
          });
        }
      });
    } else {
      errors.push({
        field: 'labels',
        message: 'Add labels describing this character\'s key traits (e.g., "Break DPS", "SP Positive")',
        severity: 'error',
      });
    }

    // Validate base teammates
    validateTeammates(data.baseTeammates, 'baseTeammates', errors);

    // Validate compositions
    validateCompositions(data.compositions, errors);

    // Validate investment
    validateInvestment(data, errors);

    // Validate tier edits
    validateTiers(tierEdits.value, data.roles, errors);

    validationErrors.value = errors;
    return errors;
  }

  // ============================================
  // Data Loading
  // ============================================

  async function loadCharacter(): Promise<void> {
    if (!characterId.value) {
      loadError.value = 'No character ID provided';
      return;
    }

    isLoading.value = true;
    loadError.value = null;

    try {
      // Get session for API auth
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Fetch character data from GitHub main branch via API
      const response = await fetch(`/api/get-character?id=${characterId.value}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch character from GitHub');
      }

      const character = result.character as Character;

      // Deep clone to avoid reactivity issues
      originalData.value = deepClone(character);
      editedData.value = deepClone(character);

      // Load tier data (still from local - it's a separate file)
      const { getTierData } = await import('../data/tierData');
      const tiers = getTierData(characterId.value);

      if (tiers) {
        const tierData: TierEdits = {
          moc: tiers.moc ? { ...tiers.moc } as Record<Role, TierRating | undefined> : undefined,
          pf: tiers.pf ? { ...tiers.pf } as Record<Role, TierRating | undefined> : undefined,
          as: tiers.as ? { ...tiers.as } as Record<Role, TierRating | undefined> : undefined,
        };
        originalTiers.value = deepClone(tierData);
        tierEdits.value = deepClone(tierData);
      } else {
        // Initialize empty tier data for character's roles
        const emptyTiers: TierEdits = {
          moc: {} as Record<Role, TierRating | undefined>,
          pf: {} as Record<Role, TierRating | undefined>,
          as: {} as Record<Role, TierRating | undefined>,
        };
        originalTiers.value = deepClone(emptyTiers);
        tierEdits.value = deepClone(emptyTiers);
      }

      // Clear validation errors on fresh load
      validationErrors.value = [];
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      loadError.value = `Failed to load character: ${errorMessage}`;
      originalData.value = null;
      editedData.value = null;
      originalTiers.value = null;
      tierEdits.value = null;
    } finally {
      isLoading.value = false;
    }
  }

  // ============================================
  // Data Submission
  // ============================================

  async function submitForReview(changeSummary: string): Promise<SubmitResult> {
    if (!user.value) {
      return { success: false, error: 'Not authenticated' };
    }

    if (!editedData.value || !originalData.value) {
      return { success: false, error: 'No character data to submit' };
    }

    if (!changeSummary || changeSummary.trim() === '') {
      return { success: false, error: 'Change summary is required' };
    }

    // Run validation
    const errors = validate();
    if (errors.some(e => e.severity === 'error')) {
      return { success: false, error: 'Validation errors exist - please fix before submitting' };
    }

    if (!isDirty.value) {
      return { success: false, error: 'No changes to submit' };
    }

    isSaving.value = true;

    try {
      // Compute field-level changes
      const fieldChanges = computeFieldChanges(originalData.value, editedData.value);

      const { error } = await supabase.from('character_edits').insert({
        character_id: characterId.value,
        editor_id: user.value.id,
        field_changes: fieldChanges,
        tier_edits: tierEdits.value,
        change_summary: changeSummary.trim(),
        fields_changed: Object.keys(fieldChanges),
        status: 'pending',
      });

      if (error) {
        throw error;
      }

      // Update original data to match edited (no longer dirty)
      originalData.value = deepClone(editedData.value);
      originalTiers.value = deepClone(tierEdits.value);

      return { success: true };
    } catch (err: unknown) {
      let errorMessage: string;
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (err && typeof err === 'object' && 'message' in err) {
        errorMessage = String((err as { message: unknown }).message);
      } else {
        errorMessage = String(err);
      }
      return { success: false, error: errorMessage };
    } finally {
      isSaving.value = false;
    }
  }

  // ============================================
  // Utility Methods
  // ============================================

  function resetChanges(): void {
    if (originalData.value) {
      editedData.value = deepClone(originalData.value);
    }
    if (originalTiers.value) {
      tierEdits.value = deepClone(originalTiers.value);
    }
    validationErrors.value = [];
  }

  function getFieldError(field: string): ValidationError | undefined {
    return validationErrors.value.find(e => e.field === field);
  }

  function getFieldErrors(field: string): ValidationError[] {
    return validationErrors.value.filter(e => e.field.startsWith(field));
  }

  // ============================================
  // Watchers
  // ============================================

  watch(characterId, () => {
    loadCharacter();
  }, { immediate: true });

  // ============================================
  // Return
  // ============================================

  return {
    // State
    originalData,
    editedData,
    tierEdits,
    originalTiers,
    validationErrors,
    isLoading,
    isSaving,
    loadError,

    // Computed
    isDirty,
    changedFields,
    hasErrors,
    hasWarnings,

    // Methods
    validate,
    loadCharacter,
    submitForReview,
    resetChanges,
    getFieldError,
    getFieldErrors,
  };
}
