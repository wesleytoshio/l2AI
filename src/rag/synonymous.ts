/**
 * Lineage 2 High Five Synonym Mapping
 * This system helps the RAG bridge the gap between Portuguese queries and English/Technical database terms.
 */

export interface SynonymMap {
  [language: string]: Record<string, string[]>;
}

export const SYNONYMS: SynonymMap = {
  pt: {
    // --- Combat & Stats ---
    'poder': ['skill', 'patk', 'power', 'p.atk', 'attack', 'matk', 'm.atk', 'magic power'],
    'ataque': ['attack', 'p.atk', 'patk', 'damage', 'physical attack'],
    'defesa': ['defense', 'p.def', 'pdef', 'm.def', 'mdef', 'protection'],
    'patk': ['p.atk', 'physical attack', 'attack power'],
    'matk': ['m.atk', 'magic attack', 'magic power'],
    'pdef': ['p.def', 'physical defense'],
    'mdef': ['m.def', 'magic defense'],
    'vida': ['hp', 'hit points', 'health'],
    'sangue': ['hp', 'hit points'],
    'mana': ['mp', 'mana points'],
    'critico': ['critical', 'crit'],
    'esquiva': ['evasion', 'dodge'],
    'precisao': ['accuracy', 'hit rate'],
    'velocidade': ['speed', 'atk.spd', 'cast.spd', 'run speed'],
    'elemento': ['element', 'attribute', 'fire', 'water', 'wind', 'earth', 'holy', 'dark'],
    'gelo': ['freya', 'ice', 'water attribute'],
    'fogo': ['fire', 'valakas', 'blazing'],
    'vento': ['wind', 'air', 'wind attribute'],
    'terra': ['earth', 'ground', 'earth attribute'],
    'santo': ['holy', 'divine', 'holy attribute'],
    'trevas': ['dark', 'shadow', 'dark attribute'],

    // --- Skills & Magic ---
    'habilidade': ['skill', 'ability', 'spell', 'active skill', 'passive skill'],
    'magia': ['magic', 'spell', 'matk', 'm.atk'],
    'feitico': ['spell', 'skill', 'magic'],
    'encantar': ['enchant', 'upgrade', 'enhance', 'enchant skill'],
    'enchantar': ['enchant', 'upgrade', 'enhance', 'enchant skill'],
    'encantamento': ['enchant', 'enchanting', 'upgrade'],
    'pegar': ['learn', 'acquire', 'obtain', 'drop', 'loot'],
    'aprende': ['learn', 'acquire', 'learns'],
    'aprender': ['learn', 'acquire'],

    // --- Items & Equipment ---
    'arma': ['weapon', 'sword', 'bow', 'dagger', 'blunt', 'pole', 'fist', 'dual', 'rapier', 'crossbow'],
    'armadura': ['armor', 'armour', 'chest', 'helmet', 'boots', 'gloves', 'shield', 'sigil'],
    'set': ['armor set', 'chest', 'legs', 'boots', 'gloves', 'helmet'],
    'item': ['item', 'equipment', 'material', 'consume'],
    'moeda': ['adena', 'coin', 'money'],
    'ouro': ['adena'],
    'grade': ['grade', 'weapon grade', 'armor grade', 's-grade', 'a-grade', 's80', 's84'],
    'joia': ['jewelry', 'accessory', 'ring', 'earring', 'necklace'],
    'pedra': ['stone', 'gem', 'ore'],
    'cristal': ['crystal', 'shard'],
    'pergaminho': ['scroll', 'recipe', 'paper'],

    // --- NPCs & Monsters ---
    'mob': ['monster', 'npc', 'creature', 'enemy', 'spawn'],
    'monstro': ['monster', 'mob', 'creature', 'npc'],
    'bicho': ['monster', 'mob', 'creature'],
    'npc': ['npc', 'non-player character', 'merchant', 'gatekeeper'],
    'vendedor': ['merchant', 'trader', 'shop'],
    'mata': ['kill', 'slay', 'defeat'],
    'matar': ['kill', 'slay'],
    'chefe': ['boss', 'raid boss', 'grand boss'],
    'boss': ['raid boss', 'grand boss', 'epic boss'],
    'rainha': ['freya', 'queen'],

    // --- Locations & Travel ---
    'onde': ['location', 'spawn', 'zone', 'map', 'area'],
    'cidade': ['town', 'city', 'village', 'settlement'],
    'vila': ['village', 'town'],
    'town': ['town', 'city', 'village'],
    'castelo': ['castle', 'residence'],
    'fortaleza': ['fortress'],
    'zona': ['zone', 'area', 'territory', 'region'],

    // --- Progression ---
    'level': ['lvl', 'level'],
    'nivel': ['level', 'lvl'],
    'niveis': ['levels', 'level'],
    'upar': ['leveling', 'level up', 'grind', 'experience zone', 'exp'],
    'levar': ['leveling', 'grind', 'experience'],
    'subir': ['level up', 'leveling'],
    'xp': ['exp', 'experience'],
    'experiencia': ['exp', 'experience'],
    'quest': ['quest', 'mission', 'task'],
    'missao': ['quest', 'mission'],
    'classe': ['class', 'job', 'profession'],
    'profissao': ['class', 'job', 'profession'],

    // --- Economy & Drops ---
    'dropa': ['drop', 'drops', 'loot', 'reward'],
    'dropar': ['drop', 'drops', 'loot'],
    'cai': ['drop', 'drops', 'loot'],
    'cair': ['drop', 'drops', 'loot'],
    'consigo': ['drop', 'obtain', 'loot', 'acquire'],
    'farmar': ['farm', 'grind', 'drop'],
    'craftar': ['craft', 'recipe', 'manufacture'],
    'spoilar': ['spoil', 'sweeper', 'reward'],
  }
};

/**
 * Helper to get synonyms for a given language
 */
export function getSynonyms(lang: string = 'pt'): Record<string, string[]> {
  return SYNONYMS[lang] || SYNONYMS['pt'];
}
