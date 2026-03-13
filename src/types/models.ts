export interface L2Race {
  id: number;
  name: string;
}

export interface L2Class {
  id: number;
  name: string;
  race_id?: number;
  race?: string;
  parent_class_id?: number;
  stats?: {
    base_int: number;
    base_str: number;
    base_con: number;
    base_men: number;
    base_dex: number;
    base_wit: number;
  };
}

export interface L2Skill {
  id: number;
  name: string;
  description?: string;
  icon?: string;
  levels: L2SkillLevel[];
}

export interface L2SkillLevel {
  level: number;
  power?: number;
  mp_consume?: number;
  cast_range?: number;
  effect_type?: string;
}

export interface L2Item {
  id: number;
  name: string;
  item_type: 'weapon' | 'armor' | 'etcitem';
  material?: string;
  weight?: number;
  price?: number;
  icon?: string;
  weapon_stats?: L2WeaponStats;
  armor_stats?: L2ArmorStats;
}

export interface L2WeaponStats {
  p_atk: number;
  m_atk: number;
  critical: number;
  atk_speed: number;
  weapon_type: string;
}

export interface L2ArmorStats {
  p_def: number;
  m_def: number;
  armor_type: string;
  slot: string;
}
