/**
 * Shared utilities for computing diffs between character data
 * Used by ChangePreview.vue and ReviewEditor.vue
 */

import type { Character, TeammateRec, Role, BestTeam, TeamComposition } from '../types';
import type { TierEdits } from '../composables/useCharacterEditor';
import { getCharacterById } from '../data';

// ==================
// TYPES
// ==================

export type DiffItemType = 'added' | 'removed' | 'changed';

export interface DiffItem {
  path: string;
  label: string;
  type: DiffItemType;
  original?: unknown;
  edited?: unknown;
  // For granular display of specific field types
  fieldType?: 'text' | 'number' | 'boolean' | 'rating' | 'tier' | 'array' | 'teammate' | 'team' | 'composition' | 'object';
  // Nested changes for complex objects
  children?: DiffItem[];
}

export interface SectionDiff {
  section: string;
  items: DiffItem[];
}

// ==================
// DEEP EQUALITY
// ==================

/**
 * Deep equality check that ignores property order in objects.
 * Handles nested objects, arrays, and primitive values.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  // Same reference or both null/undefined
  if (a === b) return true;

  // If either is null/undefined but not both
  if (a == null || b == null) return false;

  // Different types
  if (typeof a !== typeof b) return false;

  // Arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  // If one is array and other is not
  if (Array.isArray(a) || Array.isArray(b)) return false;

  // Objects
  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a as object);
    const keysB = Object.keys(b as object);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (!keysB.includes(key)) return false;
      if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
        return false;
      }
    }
    return true;
  }

  // Primitives
  return a === b;
}

// ==================
// HELPER FUNCTIONS
// ==================

export function getChangeType(original: unknown, edited: unknown): 'added' | 'removed' | 'changed' {
  if (original === undefined || original === null || (Array.isArray(original) && original.length === 0)) {
    return 'added';
  }
  if (edited === undefined || edited === null || (Array.isArray(edited) && edited.length === 0)) {
    return 'removed';
  }
  return 'changed';
}

export function formatCharacterName(charId: string): string {
  const char = getCharacterById(charId);
  return char?.name || charId;
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && typeof value[0] === 'string';
}

export function getStringArrayDiff(original: string[] | undefined, edited: string[] | undefined): { added: string[]; removed: string[] } {
  const origSet = new Set(original || []);
  const editSet = new Set(edited || []);

  const removed = (original || []).filter(item => !editSet.has(item));
  const added = (edited || []).filter(item => !origSet.has(item));

  return { added, removed };
}

interface AvoidItem { id: string; reason: string }

export function getAvoidArrayDiff(original: AvoidItem[] | undefined, edited: AvoidItem[] | undefined): {
  added: AvoidItem[];
  removed: AvoidItem[];
  changed: { original: AvoidItem; edited: AvoidItem }[];
} {
  const origMap = new Map((original || []).map(item => [item.id, item]));
  const editMap = new Map((edited || []).map(item => [item.id, item]));

  const added: AvoidItem[] = [];
  const removed: AvoidItem[] = [];
  const changed: { original: AvoidItem; edited: AvoidItem }[] = [];

  // Find added and changed
  for (const [id, editItem] of editMap) {
    const origItem = origMap.get(id);
    if (!origItem) {
      added.push(editItem);
    } else if (origItem.reason !== editItem.reason) {
      changed.push({ original: origItem, edited: editItem });
    }
  }

  // Find removed
  for (const [id, origItem] of origMap) {
    if (!editMap.has(id)) {
      removed.push(origItem);
    }
  }

  return { added, removed, changed };
}

// ==================
// SECTION DIFF COMPUTERS
// ==================

export function computeTeammateDiffs(
  original: Character['baseTeammates'],
  edited: Character['baseTeammates'],
  prefix: string
): DiffItem[] {
  const items: DiffItem[] = [];
  const categories = ['dps', 'subDPS', 'amplifiers', 'sustains'] as const;
  const categoryLabels: Record<string, string> = {
    dps: 'DPS',
    subDPS: 'Sub DPS',
    amplifiers: 'Amplifiers',
    sustains: 'Sustains',
  };

  for (const category of categories) {
    const origList = original?.[category] || [];
    const editList = edited?.[category] || [];

    if (deepEqual(origList, editList)) continue;

    // Find added teammates
    for (const tm of editList) {
      const origTm = origList.find((o: TeammateRec) => o.id === tm.id);
      if (!origTm) {
        items.push({
          path: `${prefix}.${category}`,
          label: `${categoryLabels[category]}: + ${formatCharacterName(tm.id)} (${tm.rating})`,
          type: 'added',
          fieldType: 'teammate',
          edited: tm,
        });
      } else {
        // Check for rating change
        if (origTm.rating !== tm.rating) {
          items.push({
            path: `${prefix}.${category}.${tm.id}.rating`,
            label: `${categoryLabels[category]} > ${formatCharacterName(tm.id)}: Rating`,
            type: 'changed',
            fieldType: 'rating',
            original: origTm.rating,
            edited: tm.rating,
          });
        }
        // Check for reason change
        if (origTm.reason !== tm.reason) {
          items.push({
            path: `${prefix}.${category}.${tm.id}.reason`,
            label: `${categoryLabels[category]} > ${formatCharacterName(tm.id)}: Reason`,
            type: 'changed',
            fieldType: 'text',
            original: origTm.reason,
            edited: tm.reason,
          });
        }
      }
    }

    // Find removed teammates
    for (const tm of origList) {
      const editTm = editList.find((e: TeammateRec) => e.id === tm.id);
      if (!editTm) {
        items.push({
          path: `${prefix}.${category}`,
          label: `${categoryLabels[category]}: - ${formatCharacterName(tm.id)} (${tm.rating})`,
          type: 'removed',
          fieldType: 'teammate',
          original: tm,
        });
      }
    }
  }

  return items;
}

/**
 * Compare two BestTeam objects and return granular diffs
 */
function computeBestTeamDiffs(
  origTeam: BestTeam | undefined,
  editTeam: BestTeam | undefined,
  teamName: string,
  basePath: string
): DiffItem[] {
  const items: DiffItem[] = [];

  if (!origTeam && editTeam) {
    items.push({
      path: basePath,
      label: `+ Team "${teamName}"`,
      type: 'added',
      fieldType: 'team',
      edited: editTeam,
    });
    return items;
  }

  if (origTeam && !editTeam) {
    items.push({
      path: basePath,
      label: `- Team "${teamName}"`,
      type: 'removed',
      fieldType: 'team',
      original: origTeam,
    });
    return items;
  }

  if (!origTeam || !editTeam) return items;

  // Compare individual fields
  if (origTeam.name !== editTeam.name) {
    items.push({
      path: `${basePath}.name`,
      label: `Team name`,
      type: 'changed',
      fieldType: 'text',
      original: origTeam.name,
      edited: editTeam.name,
    });
  }

  if (!deepEqual(origTeam.characters, editTeam.characters)) {
    items.push({
      path: `${basePath}.characters`,
      label: `Team characters`,
      type: 'changed',
      fieldType: 'array',
      original: origTeam.characters.map(c => formatCharacterName(c)),
      edited: editTeam.characters.map(c => formatCharacterName(c)),
    });
  }

  if (origTeam.rating !== editTeam.rating) {
    items.push({
      path: `${basePath}.rating`,
      label: `Team rating`,
      type: 'changed',
      fieldType: 'rating',
      original: origTeam.rating,
      edited: editTeam.rating,
    });
  }

  if (origTeam.structure !== editTeam.structure) {
    items.push({
      path: `${basePath}.structure`,
      label: `Team structure`,
      type: 'changed',
      fieldType: 'text',
      original: origTeam.structure,
      edited: editTeam.structure,
    });
  }

  if (origTeam.notes !== editTeam.notes) {
    items.push({
      path: `${basePath}.notes`,
      label: `Team notes`,
      type: 'changed',
      fieldType: 'text',
      original: origTeam.notes || '(none)',
      edited: editTeam.notes || '(none)',
    });
  }

  return items;
}

/**
 * Compare teammate overrides and return granular diffs
 */
function computeTeammateOverrideDiffs(
  original: TeamComposition['teammateOverrides'],
  edited: TeamComposition['teammateOverrides'],
  basePath: string
): DiffItem[] {
  const items: DiffItem[] = [];
  const categories = ['dps', 'subDPS', 'amplifiers', 'sustains'] as const;
  const categoryLabels: Record<string, string> = {
    dps: 'DPS',
    subDPS: 'Sub DPS',
    amplifiers: 'Amplifiers',
    sustains: 'Sustains',
  };

  for (const category of categories) {
    const origList = (original as Record<string, TeammateRec[]>)?.[category] || [];
    const editList = (edited as Record<string, TeammateRec[]>)?.[category] || [];

    if (deepEqual(origList, editList)) continue;

    // Find added teammates
    for (const tm of editList) {
      const origTm = origList.find((o: TeammateRec) => o.id === tm.id);
      if (!origTm) {
        items.push({
          path: `${basePath}.${category}`,
          label: `+ ${formatCharacterName(tm.id)} (${tm.rating}) in ${categoryLabels[category]} override`,
          type: 'added',
          fieldType: 'teammate',
          edited: tm,
        });
      } else if (origTm.rating !== tm.rating || origTm.reason !== tm.reason) {
        if (origTm.rating !== tm.rating) {
          items.push({
            path: `${basePath}.${category}.${tm.id}.rating`,
            label: `${formatCharacterName(tm.id)} rating in ${categoryLabels[category]} override`,
            type: 'changed',
            fieldType: 'rating',
            original: origTm.rating,
            edited: tm.rating,
          });
        }
        if (origTm.reason !== tm.reason) {
          items.push({
            path: `${basePath}.${category}.${tm.id}.reason`,
            label: `${formatCharacterName(tm.id)} reason in ${categoryLabels[category]} override`,
            type: 'changed',
            fieldType: 'text',
            original: origTm.reason,
            edited: tm.reason,
          });
        }
      }
    }

    // Find removed teammates
    for (const tm of origList) {
      const editTm = editList.find((e: TeammateRec) => e.id === tm.id);
      if (!editTm) {
        items.push({
          path: `${basePath}.${category}`,
          label: `- ${formatCharacterName(tm.id)} (${tm.rating}) from ${categoryLabels[category]} override`,
          type: 'removed',
          fieldType: 'teammate',
          original: tm,
        });
      }
    }
  }

  return items;
}

export function computeCompositionDiffs(
  original: Character['compositions'],
  edited: Character['compositions']
): DiffItem[] {
  const items: DiffItem[] = [];

  if (deepEqual(original, edited)) return items;

  const origComps = original || [];
  const editComps = edited || [];

  // Find added/changed compositions
  for (const comp of editComps) {
    const origComp = origComps.find(o => o.id === comp.id);
    if (!origComp) {
      // Entire composition added
      items.push({
        path: `compositions.${comp.id}`,
        label: `+ Composition "${comp.name}"`,
        type: 'added',
        fieldType: 'composition',
        edited: comp,
      });
    } else if (!deepEqual(origComp, comp)) {
      // Composition exists in both - compute granular diffs
      const compPath = `compositions.${comp.id}`;

      // Name
      if (origComp.name !== comp.name) {
        items.push({
          path: `${compPath}.name`,
          label: `${comp.name}: Name`,
          type: 'changed',
          fieldType: 'text',
          original: origComp.name,
          edited: comp.name,
        });
      }

      // Description
      if (origComp.description !== comp.description) {
        items.push({
          path: `${compPath}.description`,
          label: `${comp.name}: Description`,
          type: 'changed',
          fieldType: 'text',
          original: origComp.description,
          edited: comp.description,
        });
      }

      // isPrimary
      if (origComp.isPrimary !== comp.isPrimary) {
        items.push({
          path: `${compPath}.isPrimary`,
          label: `${comp.name}: Primary status`,
          type: 'changed',
          fieldType: 'boolean',
          original: origComp.isPrimary ? 'Primary' : 'Not primary',
          edited: comp.isPrimary ? 'Primary' : 'Not primary',
        });
      }

      // coreMechanic
      if (origComp.coreMechanic !== comp.coreMechanic) {
        items.push({
          path: `${compPath}.coreMechanic`,
          label: `${comp.name}: Core mechanic`,
          type: 'changed',
          fieldType: 'text',
          original: origComp.coreMechanic || '(none)',
          edited: comp.coreMechanic || '(none)',
        });
      }

      // structure
      if (!deepEqual(origComp.structure, comp.structure)) {
        items.push({
          path: `${compPath}.structure`,
          label: `${comp.name}: Structure`,
          type: 'changed',
          fieldType: 'object',
          original: origComp.structure,
          edited: comp.structure,
        });
      }

      // pathRequirements
      if (!deepEqual(origComp.pathRequirements, comp.pathRequirements)) {
        items.push({
          path: `${compPath}.pathRequirements`,
          label: `${comp.name}: Path requirements`,
          type: getChangeType(origComp.pathRequirements, comp.pathRequirements),
          fieldType: 'array',
          original: origComp.pathRequirements,
          edited: comp.pathRequirements,
        });
      }

      // weakModes
      if (!deepEqual(origComp.weakModes, comp.weakModes)) {
        items.push({
          path: `${compPath}.weakModes`,
          label: `${comp.name}: Weak modes`,
          type: getChangeType(origComp.weakModes, comp.weakModes),
          fieldType: 'array',
          original: origComp.weakModes,
          edited: comp.weakModes,
        });
      }

      // investmentNotes
      if (!deepEqual(origComp.investmentNotes, comp.investmentNotes)) {
        items.push({
          path: `${compPath}.investmentNotes`,
          label: `${comp.name}: Investment notes`,
          type: getChangeType(origComp.investmentNotes, comp.investmentNotes),
          fieldType: 'array',
          original: origComp.investmentNotes,
          edited: comp.investmentNotes,
        });
      }

      // core requirements
      if (!deepEqual(origComp.core, comp.core)) {
        items.push({
          path: `${compPath}.core`,
          label: `${comp.name}: Core requirements`,
          type: getChangeType(origComp.core, comp.core),
          fieldType: 'array',
          original: origComp.core,
          edited: comp.core,
        });
      }

      // labelRequirements
      if (!deepEqual(origComp.labelRequirements, comp.labelRequirements)) {
        items.push({
          path: `${compPath}.labelRequirements`,
          label: `${comp.name}: Label requirements`,
          type: getChangeType(origComp.labelRequirements, comp.labelRequirements),
          fieldType: 'array',
          original: origComp.labelRequirements,
          edited: comp.labelRequirements,
        });
      }

      // teammateOverrides - granular comparison
      if (!deepEqual(origComp.teammateOverrides, comp.teammateOverrides)) {
        const overrideDiffs = computeTeammateOverrideDiffs(
          origComp.teammateOverrides,
          comp.teammateOverrides,
          `${compPath}.teammateOverrides`
        );
        // Prefix labels with composition name
        overrideDiffs.forEach(diff => {
          diff.label = `${comp.name}: ${diff.label}`;
        });
        items.push(...overrideDiffs);
      }

      // teams - granular comparison of pre-built teams
      if (!deepEqual(origComp.teams, comp.teams)) {
        const origTeams = origComp.teams || [];
        const editTeams = comp.teams || [];

        // Find changes to existing teams and added teams
        for (let i = 0; i < editTeams.length; i++) {
          const editTeam = editTeams[i];
          if (!editTeam) continue;

          // Try to find matching team by name first, then by position
          let origTeam = origTeams.find(t => t.name === editTeam.name);
          if (!origTeam && i < origTeams.length) {
            // Fall back to position-based matching
            origTeam = origTeams[i];
          }

          const teamDiffs = computeBestTeamDiffs(
            origTeam,
            editTeam,
            editTeam.name,
            `${compPath}.teams[${i}]`
          );
          // Prefix labels with composition name
          teamDiffs.forEach(diff => {
            diff.label = `${comp.name}: ${diff.label}`;
          });
          items.push(...teamDiffs);
        }

        // Find removed teams
        for (const origTeam of origTeams) {
          const stillExists = editTeams.some(t => t.name === origTeam.name);
          if (!stillExists) {
            items.push({
              path: `${compPath}.teams`,
              label: `${comp.name}: - Team "${origTeam.name}"`,
              type: 'removed',
              fieldType: 'team',
              original: origTeam,
            });
          }
        }
      }
    }
  }

  // Find removed compositions
  for (const comp of origComps) {
    const editComp = editComps.find(e => e.id === comp.id);
    if (!editComp) {
      items.push({
        path: `compositions.${comp.id}`,
        label: `- Composition "${comp.name}"`,
        type: 'removed',
        fieldType: 'composition',
        original: comp,
      });
    }
  }

  return items;
}

export function computeInvestmentDiffs(
  original: Character['investment'],
  edited: Character['investment']
): DiffItem[] {
  const items: DiffItem[] = [];

  if (deepEqual(original, edited)) return items;

  // Eidolons - granular comparison
  const origEidolons = original?.eidolons || [];
  const editEidolons = edited?.eidolons || [];

  for (let i = 0; i < Math.max(origEidolons.length, editEidolons.length); i++) {
    const orig = origEidolons[i];
    const edit = editEidolons[i];
    const eidolonLabel = `E${i + 1}`;

    if (!orig && edit) {
      items.push({
        path: `investment.eidolons[${i}]`,
        label: `+ ${eidolonLabel}`,
        type: 'added',
        fieldType: 'object',
        edited: edit,
      });
    } else if (orig && !edit) {
      items.push({
        path: `investment.eidolons[${i}]`,
        label: `- ${eidolonLabel}`,
        type: 'removed',
        fieldType: 'object',
        original: orig,
      });
    } else if (orig && edit && !deepEqual(orig, edit)) {
      // Granular comparison of eidolon fields
      if (orig.penalty !== edit.penalty) {
        items.push({
          path: `investment.eidolons[${i}].penalty`,
          label: `${eidolonLabel}: Penalty`,
          type: 'changed',
          fieldType: 'number',
          original: orig.penalty,
          edited: edit.penalty,
        });
      }
      if (orig.description !== edit.description) {
        items.push({
          path: `investment.eidolons[${i}].description`,
          label: `${eidolonLabel}: Description`,
          type: 'changed',
          fieldType: 'text',
          original: orig.description,
          edited: edit.description,
        });
      }
      if (!deepEqual(orig.synergyModifiers, edit.synergyModifiers)) {
        items.push({
          path: `investment.eidolons[${i}].synergyModifiers`,
          label: `${eidolonLabel}: Synergy Modifiers`,
          type: getChangeType(orig.synergyModifiers, edit.synergyModifiers),
          fieldType: 'array',
          original: orig.synergyModifiers,
          edited: edit.synergyModifiers,
        });
      }
    }
  }

  // Light Cones - granular comparison
  const origLCs = original?.lightCones || [];
  const editLCs = edited?.lightCones || [];

  for (const lc of editLCs) {
    const origLC = origLCs.find(o => o.id === lc.id);
    if (!origLC) {
      items.push({
        path: `investment.lightCones.${lc.id}`,
        label: `+ Light Cone "${lc.name}"`,
        type: 'added',
        fieldType: 'object',
        edited: lc,
      });
    } else if (!deepEqual(origLC, lc)) {
      // Granular comparison of light cone fields
      const lcPath = `investment.lightCones.${lc.id}`;

      if (origLC.name !== lc.name) {
        items.push({
          path: `${lcPath}.name`,
          label: `${lc.name}: Name`,
          type: 'changed',
          fieldType: 'text',
          original: origLC.name,
          edited: lc.name,
        });
      }
      if (origLC.rarity !== lc.rarity) {
        items.push({
          path: `${lcPath}.rarity`,
          label: `${lc.name}: Rarity`,
          type: 'changed',
          fieldType: 'number',
          original: `${origLC.rarity}★`,
          edited: `${lc.rarity}★`,
        });
      }
      if (origLC.isSignature !== lc.isSignature) {
        items.push({
          path: `${lcPath}.isSignature`,
          label: `${lc.name}: Signature status`,
          type: 'changed',
          fieldType: 'boolean',
          original: origLC.isSignature ? 'Signature' : 'Not signature',
          edited: lc.isSignature ? 'Signature' : 'Not signature',
        });
      }
      if (!deepEqual(origLC.penalties, lc.penalties)) {
        if (origLC.penalties?.s1 !== lc.penalties?.s1) {
          items.push({
            path: `${lcPath}.penalties.s1`,
            label: `${lc.name}: S1 Penalty`,
            type: 'changed',
            fieldType: 'number',
            original: origLC.penalties?.s1,
            edited: lc.penalties?.s1,
          });
        }
        if (origLC.penalties?.s5 !== lc.penalties?.s5) {
          items.push({
            path: `${lcPath}.penalties.s5`,
            label: `${lc.name}: S5 Penalty`,
            type: 'changed',
            fieldType: 'number',
            original: origLC.penalties?.s5,
            edited: lc.penalties?.s5,
          });
        }
      }
      if (origLC.source !== lc.source) {
        items.push({
          path: `${lcPath}.source`,
          label: `${lc.name}: Source`,
          type: 'changed',
          fieldType: 'text',
          original: origLC.source || '(none)',
          edited: lc.source || '(none)',
        });
      }
      if (origLC.notes !== lc.notes) {
        items.push({
          path: `${lcPath}.notes`,
          label: `${lc.name}: Notes`,
          type: 'changed',
          fieldType: 'text',
          original: origLC.notes || '(none)',
          edited: lc.notes || '(none)',
        });
      }
      if (origLC.playstyleNotes !== lc.playstyleNotes) {
        items.push({
          path: `${lcPath}.playstyleNotes`,
          label: `${lc.name}: Playstyle Notes`,
          type: 'changed',
          fieldType: 'text',
          original: origLC.playstyleNotes || '(none)',
          edited: lc.playstyleNotes || '(none)',
        });
      }
      if (!deepEqual(origLC.synergyModifiers, lc.synergyModifiers)) {
        items.push({
          path: `${lcPath}.synergyModifiers`,
          label: `${lc.name}: Synergy Modifiers`,
          type: getChangeType(origLC.synergyModifiers, lc.synergyModifiers),
          fieldType: 'array',
          original: origLC.synergyModifiers,
          edited: lc.synergyModifiers,
        });
      }
    }
  }

  for (const lc of origLCs) {
    const editLC = editLCs.find(e => e.id === lc.id);
    if (!editLC) {
      items.push({
        path: `investment.lightCones.${lc.id}`,
        label: `- Light Cone "${lc.name}"`,
        type: 'removed',
        fieldType: 'object',
        original: lc,
      });
    }
  }

  // Priority strings
  if (original?.investmentPriority !== edited?.investmentPriority) {
    items.push({
      path: 'investment.investmentPriority',
      label: 'Investment Priority',
      type: 'changed',
      fieldType: 'text',
      original: original?.investmentPriority || '(none)',
      edited: edited?.investmentPriority || '(none)',
    });
  }

  if (original?.minimumViable !== edited?.minimumViable) {
    items.push({
      path: 'investment.minimumViable',
      label: 'Minimum Viable',
      type: 'changed',
      fieldType: 'text',
      original: original?.minimumViable || '(none)',
      edited: edited?.minimumViable || '(none)',
    });
  }

  return items;
}

export function computeTierDiffs(
  original: TierEdits | null,
  edited: TierEdits | null
): DiffItem[] {
  const items: DiffItem[] = [];

  if (deepEqual(original, edited)) return items;

  const modes = ['moc', 'pf', 'as'] as const;
  const modeLabels: Record<string, string> = { moc: 'MoC', pf: 'PF', as: 'AS' };

  type RoleTierMap = Partial<Record<Role, string | undefined>>;

  for (const mode of modes) {
    const origTiers: RoleTierMap = original?.[mode] ?? {};
    const editTiers: RoleTierMap = edited?.[mode] ?? {};

    const allRoles = new Set([
      ...Object.keys(origTiers),
      ...Object.keys(editTiers),
    ]);

    for (const role of allRoles) {
      const origTier = origTiers[role as Role];
      const editTier = editTiers[role as Role];

      if (origTier !== editTier) {
        items.push({
          path: `tiers.${mode}.${role}`,
          label: `${modeLabels[mode]} ${role}`,
          type: 'changed',
          fieldType: 'tier',
          original: origTier || '(none)',
          edited: editTier || '(none)',
        });
      }
    }
  }

  return items;
}

export function computeRestrictionDiffs(
  original: Character['restrictions'],
  edited: Character['restrictions']
): DiffItem[] {
  const items: DiffItem[] = [];

  if (deepEqual(original, edited)) return items;

  // Avoid list - granular comparison
  if (!deepEqual(original?.avoid, edited?.avoid)) {
    const origAvoid = original?.avoid || [];
    const editAvoid = edited?.avoid || [];

    // Find added avoid entries
    for (const av of editAvoid) {
      const origAv = origAvoid.find(o => o.id === av.id);
      if (!origAv) {
        items.push({
          path: `restrictions.avoid.${av.id}`,
          label: `Avoid: + ${formatCharacterName(av.id)}`,
          type: 'added',
          fieldType: 'object',
          edited: av,
        });
      } else if (origAv.reason !== av.reason) {
        items.push({
          path: `restrictions.avoid.${av.id}.reason`,
          label: `Avoid > ${formatCharacterName(av.id)}: Reason`,
          type: 'changed',
          fieldType: 'text',
          original: origAv.reason,
          edited: av.reason,
        });
      }
    }

    // Find removed avoid entries
    for (const av of origAvoid) {
      const editAv = editAvoid.find(e => e.id === av.id);
      if (!editAv) {
        items.push({
          path: `restrictions.avoid.${av.id}`,
          label: `Avoid: - ${formatCharacterName(av.id)}`,
          type: 'removed',
          fieldType: 'object',
          original: av,
        });
      }
    }
  }

  // Warnings - granular comparison
  if (!deepEqual(original?.warnings, edited?.warnings)) {
    const origWarnings = original?.warnings || [];
    const editWarnings = edited?.warnings || [];

    const removed = origWarnings.filter(w => !editWarnings.includes(w));
    const added = editWarnings.filter(w => !origWarnings.includes(w));

    for (const warning of removed) {
      items.push({
        path: 'restrictions.warnings',
        label: `Warning: - "${warning.slice(0, 50)}${warning.length > 50 ? '...' : ''}"`,
        type: 'removed',
        fieldType: 'text',
        original: warning,
      });
    }

    for (const warning of added) {
      items.push({
        path: 'restrictions.warnings',
        label: `Warning: + "${warning.slice(0, 50)}${warning.length > 50 ? '...' : ''}"`,
        type: 'added',
        fieldType: 'text',
        edited: warning,
      });
    }
  }

  return items;
}

// ==================
// MAIN DIFF FUNCTION
// ==================

/**
 * Compute all section diffs between original and edited character data
 */
export function computeAllSectionDiffs(
  original: Character,
  edited: Character,
  originalTiers?: TierEdits | null,
  editedTiers?: TierEdits | null
): SectionDiff[] {
  const sections: SectionDiff[] = [];

  // Classification section
  const classificationItems: DiffItem[] = [];

  if (original.description !== edited.description) {
    classificationItems.push({
      path: 'description',
      label: 'Description',
      type: getChangeType(original.description, edited.description),
      fieldType: 'text',
      original: original.description || '(none)',
      edited: edited.description || '(none)',
    });
  }

  if (!deepEqual(original.labels, edited.labels)) {
    // Granular labels comparison
    const origLabels = original.labels || [];
    const editLabels = edited.labels || [];

    const removed = origLabels.filter(l => !editLabels.includes(l));
    const added = editLabels.filter(l => !origLabels.includes(l));

    for (const label of removed) {
      classificationItems.push({
        path: 'labels',
        label: `Label: - "${label}"`,
        type: 'removed',
        fieldType: 'text',
        original: label,
      });
    }

    for (const label of added) {
      classificationItems.push({
        path: 'labels',
        label: `Label: + "${label}"`,
        type: 'added',
        fieldType: 'text',
        edited: label,
      });
    }
  }

  if (!deepEqual(original.roles, edited.roles)) {
    // Granular roles comparison
    const origRoles = original.roles || [];
    const editRoles = edited.roles || [];

    const removed = origRoles.filter(r => !editRoles.includes(r));
    const added = editRoles.filter(r => !origRoles.includes(r));

    for (const role of removed) {
      classificationItems.push({
        path: 'roles',
        label: `Role: - "${role}"`,
        type: 'removed',
        fieldType: 'text',
        original: role,
      });
    }

    for (const role of added) {
      classificationItems.push({
        path: 'roles',
        label: `Role: + "${role}"`,
        type: 'added',
        fieldType: 'text',
        edited: role,
      });
    }
  }

  if (classificationItems.length > 0) {
    sections.push({ section: 'Classification', items: classificationItems });
  }

  // Base Teammates section
  const teammateItems = computeTeammateDiffs(
    original.baseTeammates,
    edited.baseTeammates,
    'baseTeammates'
  );
  if (teammateItems.length > 0) {
    sections.push({ section: 'Base Teammates', items: teammateItems });
  }

  // Compositions section
  const compositionItems = computeCompositionDiffs(
    original.compositions,
    edited.compositions
  );
  if (compositionItems.length > 0) {
    sections.push({ section: 'Compositions', items: compositionItems });
  }

  // Investment section
  const investmentItems = computeInvestmentDiffs(
    original.investment,
    edited.investment
  );
  if (investmentItems.length > 0) {
    sections.push({ section: 'Investment', items: investmentItems });
  }

  // Tier Changes section (if tier data provided)
  if (originalTiers !== undefined || editedTiers !== undefined) {
    const tierItems = computeTierDiffs(originalTiers ?? null, editedTiers ?? null);
    if (tierItems.length > 0) {
      sections.push({ section: 'Tier Changes', items: tierItems });
    }
  }

  // Restrictions section
  const restrictionItems = computeRestrictionDiffs(
    original.restrictions,
    edited.restrictions
  );
  if (restrictionItems.length > 0) {
    sections.push({ section: 'Restrictions', items: restrictionItems });
  }

  return sections;
}
