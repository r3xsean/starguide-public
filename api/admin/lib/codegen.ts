// TypeScript code generation for character files
// Generates code that EXACTLY matches the format of existing character files (e.g., cyrene.ts)

import type {
  Character,
  TeammateRec,
  BestTeam,
  EidolonDefinition,
  LightConeDefinition,
  TeamComposition,
  SynergyModifier,
  Role,
  TierRating,
} from '../../types.js';

// Tier edit structure from character_edits table
interface TierEdit {
  mode: 'moc' | 'pf' | 'as';
  role: Role;
  newTier: TierRating;
}

interface TierEdits {
  characterId: string;
  edits: TierEdit[];
}

/**
 * Convert kebab-case to camelCase for export variable name
 */
function toCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Escape single quotes in strings
 */
function escapeString(str: string): string {
  return str.replace(/'/g, "\\'");
}

/**
 * Format a string value with single quotes
 */
function formatString(value: string): string {
  return `'${escapeString(value)}'`;
}

/**
 * Format an array of strings
 */
function formatStringArray(arr: string[], indent: string): string {
  if (arr.length === 0) return '[]';
  if (arr.length <= 3 && arr.every(s => s.length < 20)) {
    return `[${arr.map(formatString).join(', ')}]`;
  }
  const items = arr.map(s => `${indent}  ${formatString(s)},`).join('\n');
  return `[\n${items}\n${indent}]`;
}

/**
 * Format a synergy modifier
 */
function formatSynergyModifier(mod: SynergyModifier, indent: string): string {
  const lines = [
    `${indent}{`,
    `${indent}  withCharacterId: ${formatString(mod.withCharacterId)},`,
    `${indent}  modifier: ${mod.modifier},`,
    `${indent}  reason: ${formatString(mod.reason)},`,
    `${indent}},`,
  ];
  return lines.join('\n');
}

/**
 * Format an eidolon definition
 */
function formatEidolon(eidolon: EidolonDefinition, indent: string): string {
  const lines = [
    `${indent}{`,
    `${indent}  level: ${eidolon.level},`,
    `${indent}  penalty: ${eidolon.penalty},`,
    `${indent}  description: ${formatString(eidolon.description)},`,
  ];

  if (eidolon.synergyModifiers && eidolon.synergyModifiers.length > 0) {
    lines.push(`${indent}  synergyModifiers: [`);
    eidolon.synergyModifiers.forEach(mod => {
      lines.push(formatSynergyModifier(mod, `${indent}    `));
    });
    lines.push(`${indent}  ],`);
  }

  lines.push(`${indent}},`);
  return lines.join('\n');
}

/**
 * Format a light cone definition
 */
function formatLightCone(lc: LightConeDefinition, indent: string): string {
  const lines = [
    `${indent}{`,
    `${indent}  id: ${formatString(lc.id)},`,
    `${indent}  name: ${formatString(lc.name)},`,
    `${indent}  rarity: ${lc.rarity},`,
    `${indent}  isSignature: ${lc.isSignature},`,
    `${indent}  penalties: { s1: ${lc.penalties.s1}, s5: ${lc.penalties.s5} },`,
  ];

  if (lc.notes) {
    lines.push(`${indent}  notes: ${formatString(lc.notes)},`);
  }

  if (lc.playstyleNotes) {
    lines.push(`${indent}  playstyleNotes: ${formatString(lc.playstyleNotes)},`);
  }

  lines.push(`${indent}  source: ${formatString(lc.source)},`);

  if (lc.synergyModifiers && lc.synergyModifiers.length > 0) {
    lines.push(`${indent}  synergyModifiers: [`);
    lc.synergyModifiers.forEach(mod => {
      lines.push(formatSynergyModifier(mod, `${indent}    `));
    });
    lines.push(`${indent}  ],`);
  }

  lines.push(`${indent}},`);
  return lines.join('\n');
}

/**
 * Format a teammate recommendation
 */
function formatTeammateRec(rec: TeammateRec, indent: string): string {
  const lines = [
    `${indent}{ id: ${formatString(rec.id)}, rating: ${formatString(rec.rating)}, reason: ${formatString(rec.reason)} },`,
  ];

  // Handle theirInvestmentModifiers if present
  if (rec.theirInvestmentModifiers && rec.theirInvestmentModifiers.length > 0) {
    // Need to rewrite as multi-line
    const fullLines = [
      `${indent}{`,
      `${indent}  id: ${formatString(rec.id)},`,
      `${indent}  rating: ${formatString(rec.rating)},`,
      `${indent}  reason: ${formatString(rec.reason)},`,
      `${indent}  theirInvestmentModifiers: [`,
    ];
    rec.theirInvestmentModifiers.forEach(mod => {
      fullLines.push(`${indent}    {`);
      fullLines.push(`${indent}      level: ${mod.level},`);
      fullLines.push(`${indent}      modifier: ${mod.modifier},`);
      if (mod.reason) {
        fullLines.push(`${indent}      reason: ${formatString(mod.reason)},`);
      }
      fullLines.push(`${indent}    },`);
    });
    fullLines.push(`${indent}  ],`);
    fullLines.push(`${indent}},`);
    return fullLines.join('\n');
  }

  return lines.join('\n');
}

/**
 * Format a best team
 */
function formatBestTeam(team: BestTeam, indent: string): string {
  const chars = team.characters.map(formatString).join(', ');
  const lines = [
    `${indent}{`,
    `${indent}  name: ${formatString(team.name)},`,
    `${indent}  characters: [${chars}],`,
    `${indent}  rating: ${formatString(team.rating)},`,
    `${indent}  structure: ${formatString(team.structure)},`,
  ];

  if (team.notes) {
    lines.push(`${indent}  notes: ${formatString(team.notes)},`);
  }

  lines.push(`${indent}},`);
  return lines.join('\n');
}

/**
 * Format teammate overrides section
 */
function formatTeammateOverrides(
  overrides: TeamComposition['teammateOverrides'],
  indent: string
): string {
  if (!overrides) return '';

  const sections: string[] = [];

  if (overrides.dps && overrides.dps.length > 0) {
    sections.push(`${indent}  dps: [`);
    overrides.dps.forEach(rec => {
      if ('excluded' in rec && rec.excluded) {
        sections.push(`${indent}    { id: ${formatString(rec.id)}, excluded: true },`);
      } else if (rec.rating && rec.reason) {
        sections.push(`${indent}    { id: ${formatString(rec.id)}, rating: ${formatString(rec.rating)}, reason: ${formatString(rec.reason)} },`);
      }
    });
    sections.push(`${indent}  ],`);
  }

  if (overrides.subDPS && overrides.subDPS.length > 0) {
    sections.push(`${indent}  subDPS: [`);
    overrides.subDPS.forEach(rec => {
      if ('excluded' in rec && rec.excluded) {
        sections.push(`${indent}    { id: ${formatString(rec.id)}, excluded: true },`);
      } else if (rec.rating && rec.reason) {
        sections.push(`${indent}    { id: ${formatString(rec.id)}, rating: ${formatString(rec.rating)}, reason: ${formatString(rec.reason)} },`);
      }
    });
    sections.push(`${indent}  ],`);
  }

  if (overrides.amplifiers && overrides.amplifiers.length > 0) {
    sections.push(`${indent}  amplifiers: [`);
    overrides.amplifiers.forEach(rec => {
      if ('excluded' in rec && rec.excluded) {
        sections.push(`${indent}    { id: ${formatString(rec.id)}, excluded: true },`);
      } else if (rec.rating && rec.reason) {
        sections.push(`${indent}    { id: ${formatString(rec.id)}, rating: ${formatString(rec.rating)}, reason: ${formatString(rec.reason)} },`);
      }
    });
    sections.push(`${indent}  ],`);
  }

  if (overrides.sustains && overrides.sustains.length > 0) {
    sections.push(`${indent}  sustains: [`);
    overrides.sustains.forEach(rec => {
      if ('excluded' in rec && rec.excluded) {
        sections.push(`${indent}    { id: ${formatString(rec.id)}, excluded: true },`);
      } else if (rec.rating && rec.reason) {
        sections.push(`${indent}    { id: ${formatString(rec.id)}, rating: ${formatString(rec.rating)}, reason: ${formatString(rec.reason)} },`);
      }
    });
    sections.push(`${indent}  ],`);
  }

  if (sections.length === 0) return '';

  return `${indent}teammateOverrides: {\n${sections.join('\n')}\n${indent}},`;
}

/**
 * Format a team composition
 */
function formatComposition(comp: TeamComposition, indent: string): string {
  const lines = [
    `${indent}{`,
    `${indent}  id: ${formatString(comp.id)},`,
    `${indent}  name: ${formatString(comp.name)},`,
    `${indent}  description: ${formatString(comp.description)},`,
    `${indent}  isPrimary: ${comp.isPrimary},`,
  ];

  if (comp.coreMechanic) {
    lines.push(`${indent}  coreMechanic: ${formatString(comp.coreMechanic)},`);
  }

  if (comp.structure) {
    lines.push(`${indent}  structure: { dps: ${comp.structure.dps}, amplifier: ${comp.structure.amplifier}, sustain: ${comp.structure.sustain} },`);
  }

  if (comp.weakModes && comp.weakModes.length > 0) {
    lines.push(`${indent}  weakModes: [`);
    comp.weakModes.forEach(wm => {
      lines.push(`${indent}    {`);
      lines.push(`${indent}      mode: ${formatString(wm.mode)},`);
      lines.push(`${indent}      reason: ${formatString(wm.reason)},`);
      lines.push(`${indent}    },`);
    });
    lines.push(`${indent}  ],`);
  }

  if (comp.investmentNotes && comp.investmentNotes.length > 0) {
    lines.push(`${indent}  investmentNotes: [`);
    comp.investmentNotes.forEach(note => {
      lines.push(`${indent}    ${formatString(note)},`);
    });
    lines.push(`${indent}  ],`);
  }

  if (comp.pathRequirements && comp.pathRequirements.length > 0) {
    lines.push(`${indent}  pathRequirements: [`);
    comp.pathRequirements.forEach(req => {
      lines.push(`${indent}    {`);
      lines.push(`${indent}      path: ${formatString(req.path)},`);
      lines.push(`${indent}      count: ${req.count},`);
      lines.push(`${indent}      reason: ${formatString(req.reason)},`);
      lines.push(`${indent}    },`);
    });
    lines.push(`${indent}  ],`);
  }

  if (comp.labelRequirements && comp.labelRequirements.length > 0) {
    lines.push(`${indent}  labelRequirements: [`);
    comp.labelRequirements.forEach(req => {
      lines.push(`${indent}    {`);
      lines.push(`${indent}      label: ${formatString(req.label)},`);
      lines.push(`${indent}      count: ${req.count},`);
      lines.push(`${indent}      reason: ${formatString(req.reason)},`);
      lines.push(`${indent}    },`);
    });
    lines.push(`${indent}  ],`);
  }

  if (comp.core && comp.core.length > 0) {
    lines.push(`${indent}  core: [`);
    comp.core.forEach(c => {
      lines.push(`${indent}    {`);
      lines.push(`${indent}      characterId: ${formatString(c.characterId)},`);
      if (c.minEidolon !== undefined) {
        lines.push(`${indent}      minEidolon: ${c.minEidolon},`);
      }
      if (c.lightConeIds && c.lightConeIds.length > 0) {
        lines.push(`${indent}      lightConeIds: [${c.lightConeIds.map(formatString).join(', ')}],`);
      }
      lines.push(`${indent}      reason: ${formatString(c.reason)},`);
      lines.push(`${indent}    },`);
    });
    lines.push(`${indent}  ],`);
  }

  const overridesStr = formatTeammateOverrides(comp.teammateOverrides, `${indent}  `);
  if (overridesStr) {
    lines.push(overridesStr);
  }

  if (comp.teams && comp.teams.length > 0) {
    lines.push(`${indent}  teams: [`);
    comp.teams.forEach(team => {
      lines.push(formatBestTeam(team, `${indent}    `));
    });
    lines.push(`${indent}  ],`);
  }

  lines.push(`${indent}},`);
  return lines.join('\n');
}

/**
 * Format the teammates section (baseTeammates or legacy teammates)
 */
function formatTeammates(
  teammates: Character['baseTeammates'],
  sectionName: 'baseTeammates' | 'teammates',
  indent: string
): string {
  if (!teammates) return '';

  const sections: string[] = [];

  if (teammates.dps && teammates.dps.length > 0) {
    sections.push(`${indent}  dps: [`);
    teammates.dps.forEach(rec => {
      sections.push(formatTeammateRec(rec, `${indent}    `));
    });
    sections.push(`${indent}  ],`);
  }

  if (teammates.subDPS && teammates.subDPS.length > 0) {
    sections.push(`${indent}  subDPS: [`);
    teammates.subDPS.forEach(rec => {
      sections.push(formatTeammateRec(rec, `${indent}    `));
    });
    sections.push(`${indent}  ],`);
  }

  if (teammates.supportDPS && teammates.supportDPS.length > 0) {
    sections.push(`${indent}  supportDPS: [`);
    teammates.supportDPS.forEach(rec => {
      sections.push(formatTeammateRec(rec, `${indent}    `));
    });
    sections.push(`${indent}  ],`);
  }

  if (teammates.amplifiers && teammates.amplifiers.length > 0) {
    sections.push(`${indent}  amplifiers: [`);
    teammates.amplifiers.forEach(rec => {
      sections.push(formatTeammateRec(rec, `${indent}    `));
    });
    sections.push(`${indent}  ],`);
  }

  if (teammates.sustains && teammates.sustains.length > 0) {
    sections.push(`${indent}  sustains: [`);
    teammates.sustains.forEach(rec => {
      sections.push(formatTeammateRec(rec, `${indent}    `));
    });
    sections.push(`${indent}  ],`);
  }

  if (sections.length === 0) return '';

  return `${indent}${sectionName}: {\n${sections.join('\n')}\n${indent}},`;
}

/**
 * Generate a complete character TypeScript file
 */
export function generateCharacterFile(data: Character): string {
  const varName = toCamelCase(data.id);
  const lines: string[] = [];

  // Header comment
  lines.push(`// frontend/src/data/characters/${data.id}.ts`);
  lines.push('');
  lines.push("import type { Character } from '../../types';");
  lines.push('');
  lines.push(`export const ${varName}: Character = {`);

  // Basic info
  lines.push(`  id: ${formatString(data.id)},`);
  lines.push(`  name: ${formatString(data.name)},`);
  lines.push(`  element: ${formatString(data.element)},`);
  lines.push(`  path: ${formatString(data.path)},`);
  lines.push(`  rarity: ${data.rarity},`);
  lines.push('');

  // Roles
  lines.push(`  roles: [${data.roles.map(formatString).join(', ')}],`);

  // Description
  if (data.description) {
    lines.push(`  description: ${formatString(data.description)},`);
  }

  // Labels
  if (data.labels && data.labels.length > 0) {
    lines.push(`  labels: ${formatStringArray(data.labels, '  ')},`);
  }

  // Investment section
  if (data.investment) {
    lines.push('');
    lines.push('  // ============================================');
    lines.push('  // INVESTMENT DATA');
    lines.push('  // ============================================');
    lines.push('  investment: {');

    if (data.investment.investmentPriority) {
      lines.push(`    investmentPriority: ${formatString(data.investment.investmentPriority)},`);
    }
    if (data.investment.minimumViable) {
      lines.push(`    minimumViable: ${formatString(data.investment.minimumViable)},`);
    }

    lines.push('');
    lines.push('    eidolons: [');
    data.investment.eidolons.forEach(eidolon => {
      lines.push(formatEidolon(eidolon, '      '));
    });
    lines.push('    ],');

    lines.push('');
    lines.push('    lightCones: [');
    data.investment.lightCones.forEach(lc => {
      lines.push(formatLightCone(lc, '      '));
    });
    lines.push('    ],');

    lines.push('  },');
  }

  // Base teammates section
  if (data.baseTeammates) {
    lines.push('');
    lines.push('  // ============================================');
    lines.push('  // BASE TEAMMATES (Apply to all compositions)');
    lines.push('  // ============================================');
    const teammatesStr = formatTeammates(data.baseTeammates, 'baseTeammates', '  ');
    if (teammatesStr) {
      lines.push(teammatesStr);
    }
  }

  // Compositions section
  if (data.compositions && data.compositions.length > 0) {
    lines.push('');
    lines.push('  // ============================================');
    lines.push('  // COMPOSITIONS');
    lines.push('  // ============================================');
    lines.push('  compositions: [');
    data.compositions.forEach(comp => {
      lines.push(formatComposition(comp, '    '));
    });
    lines.push('  ],');
  }

  // Restrictions section
  if (data.restrictions) {
    lines.push('');
    lines.push('  restrictions: {');
    if (data.restrictions.avoid && data.restrictions.avoid.length > 0) {
      lines.push('    avoid: [');
      data.restrictions.avoid.forEach(a => {
        lines.push(`      { id: ${formatString(a.id)}, reason: ${formatString(a.reason)} },`);
      });
      lines.push('    ],');
    }
    if (data.restrictions.warnings && data.restrictions.warnings.length > 0) {
      lines.push('    warnings: [');
      data.restrictions.warnings.forEach(w => {
        lines.push(`      ${formatString(w)},`);
      });
      lines.push('    ],');
    }
    lines.push('  },');
  }

  // Legacy teammates section (for backwards compatibility)
  if (data.teammates) {
    lines.push('');
    lines.push('  // ============================================');
    lines.push('  // LEGACY (populated for backwards compatibility)');
    lines.push('  // ============================================');
    const legacyTeammatesStr = formatTeammates(data.teammates, 'teammates', '  ');
    if (legacyTeammatesStr) {
      lines.push(legacyTeammatesStr);
    }
  }

  // Legacy bestTeams section
  if (data.bestTeams && data.bestTeams.length > 0) {
    lines.push('');
    lines.push('  bestTeams: [');
    data.bestTeams.forEach(team => {
      lines.push(formatBestTeam(team, '    '));
    });
    lines.push('  ],');
  }

  // Team structures (legacy)
  if (data.teamStructures) {
    lines.push('');
    lines.push('  teamStructures: {');
    lines.push(`    preferred: ${formatString(data.teamStructures.preferred)},`);
    lines.push(`    viable: [${data.teamStructures.viable.map(formatString).join(', ')}],`);
    lines.push(`    notes: ${formatString(data.teamStructures.notes)},`);
    lines.push('  },');
  }

  lines.push('};');
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate tier data patches for tierData.ts
 * Returns the patches needed to update MOC_TIERS, PF_TIERS, AS_TIERS
 */
export function generateTierDataPatches(tierEdits: TierEdits): {
  characterId: string;
  moc?: Record<Role, TierRating>;
  pf?: Record<Role, TierRating>;
  as?: Record<Role, TierRating>;
} {
  const result: {
    characterId: string;
    moc?: Record<Role, TierRating>;
    pf?: Record<Role, TierRating>;
    as?: Record<Role, TierRating>;
  } = { characterId: tierEdits.characterId };

  for (const edit of tierEdits.edits) {
    const mode = edit.mode;
    if (!result[mode]) {
      result[mode] = {} as Record<Role, TierRating>;
    }
    result[mode]![edit.role] = edit.newTier;
  }

  return result;
}

/**
 * Generate the line replacement for a tier entry in tierData.ts
 * This creates a string that can be used to replace an existing line
 */
export function generateTierEntryLine(
  characterId: string,
  roles: Record<string, string>,
  element: string
): string {
  const rolesStr = Object.entries(roles)
    .map(([role, tier]) => `'${role}': '${tier}'`)
    .join(', ');
  return `  '${characterId}': { roles: { ${rolesStr} }, element: '${element}' },`;
}

export type { TierEdit, TierEdits };
