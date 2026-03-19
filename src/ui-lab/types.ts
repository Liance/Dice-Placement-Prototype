export type LabSlotKind = 'open' | 'odd' | 'even' | 'exact' | 'min' | 'max';
export type LabModuleState = 'active' | 'ready' | 'queued' | 'blocked';

export interface LabSlot {
  id: string;
  label: string;
  kind: LabSlotKind;
  requirement: string;
  die: number | null;
  exactValue?: number;
  minValue?: number;
  maxValue?: number;
}

export interface LabModule {
  id: string;
  title: string;
  ruleText: string;
  effectText: string;
  state: LabModuleState;
  progress: number;
  queue: number[];
  slots: LabSlot[];
}

export interface LabScenario {
  id: string;
  name: string;
  description: string;
  enemy: {
    name: string;
    hp: number;
    hpMax: number;
    intent: string;
    note: string;
  };
  player: {
    hp: number;
    hpMax: number;
    turn: number;
  };
  tray: number[];
  modules: LabModule[];
}
