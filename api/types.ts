// Shared types for API functions
// Copy of frontend/src/types/index.ts (types only, no runtime values)

export type Element =
  | 'Physical'
  | 'Fire'
  | 'Ice'
  | 'Lightning'
  | 'Wind'
  | 'Quantum'
  | 'Imaginary';

export type Path =
  | 'Destruction'
  | 'Hunt'
  | 'Erudition'
  | 'Harmony'
  | 'Nihility'
  | 'Preservation'
  | 'Abundance'
  | 'Remembrance';

export type Role = 'DPS' | 'Support DPS' | 'Amplifier' | 'Sustain';

export type TierRating = 'T-1' | 'T-0.5' | 'T0' | 'T0.5' | 'T1' | 'T1.5' | 'T2' | 'T3' | 'T4' | 'T5';

export type TeammateRating = 'S+' | 'S' | 'A' | 'B' | 'C' | 'D';

export type TeamRating = 'S' | 'A' | 'B' | 'C';

export type LightConeSource = 'signature' | 'standard' | 'event' | 'herta-store' | 'battle-pass' | 'craftable';

export interface SynergyModifier {
  withCharacterId: string;
  modifier: number;
  reason: string;
}

export interface EidolonDefinition {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  penalty: number;
  description: string;
  synergyModifiers?: SynergyModifier[];
}

export interface LightConeDefinition {
  id: string;
  name: string;
  rarity: 3 | 4 | 5;
  isSignature: boolean;
  penalties: { s1: number; s5: number };
  notes: string;
  playstyleNotes?: string;
  source: LightConeSource;
  synergyModifiers?: SynergyModifier[];
}

export interface CharacterInvestment {
  eidolons: EidolonDefinition[];
  lightCones: LightConeDefinition[];
  investmentPriority?: string;
  minimumViable?: string;
}

export interface TeammateOverride {
  id: string;
  rating?: TeammateRating;
  reason?: string;
  excluded?: boolean;
}

export interface TeammateRec {
  id: string;
  rating: TeammateRating;
  reason: string;
  theirInvestmentModifiers?: {
    level: 1 | 2 | 3 | 4 | 5 | 6;
    modifier: number;
    reason?: string;
  }[];
}

export interface BestTeam {
  name: string;
  characters: [string, string, string, string];
  rating: TeamRating;
  structure: string;
  notes?: string;
}

export interface TeamStructures {
  preferred: string;
  viable: string[];
  notes: string;
}

export interface Teammates {
  dps?: TeammateRec[];
  subDPS?: TeammateRec[];
  supportDPS?: TeammateRec[];
  amplifiers?: TeammateRec[];
  sustains?: TeammateRec[];
}

export interface Restrictions {
  avoid?: { id: string; reason: string }[];
  warnings?: string[];
}

export interface TeamComposition {
  id: string;
  name: string;
  description: string;
  isPrimary: boolean;
  coreMechanic: string;
  weakModes?: {
    mode: 'moc' | 'pf' | 'as';
    reason: string;
  }[];
  investmentNotes?: string[];
  structure?: {
    dps: number;
    amplifier: number;
    sustain: number;
  };
  core?: {
    characterId: string;
    minEidolon?: number;
    lightConeIds?: string[];
    reason: string;
  }[];
  pathRequirements?: {
    path: Path;
    count: number;
    reason: string;
  }[];
  labelRequirements?: {
    label: string;
    count: number;
    reason: string;
  }[];
  teammateOverrides?: {
    dps?: TeammateOverride[];
    subDPS?: TeammateOverride[];
    amplifiers?: TeammateOverride[];
    sustains?: TeammateOverride[];
  };
  teams?: BestTeam[];
}

export interface Character {
  id: string;
  name: string;
  element: Element;
  path: Path;
  rarity: 4 | 5;
  roles: Role[];
  description?: string;
  labels?: string[];
  investment?: CharacterInvestment;
  baseTeammates?: Teammates;
  compositions?: TeamComposition[];
  teamStructures?: TeamStructures;
  teammates?: Teammates;
  bestTeams?: BestTeam[];
  restrictions?: Restrictions;
}
