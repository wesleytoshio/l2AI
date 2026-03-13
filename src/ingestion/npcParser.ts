import * as fs from 'fs';
import { XMLParser } from 'fast-xml-parser';
import * as path from 'path';

export interface L2NPC {
    id: number;
    name: string;
    level: number;
    type: string;
    hp_max: number;
    rewards: L2Reward[];
}

export interface L2Reward {
    itemId: number;
    min: number;
    max: number;
    chance: number;
    type: string;
}

export function parseNPCs(directory: string): L2NPC[] {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
    const npcs: L2NPC[] = [];

    const files = fs.readdirSync(directory).filter(f => f.endsWith('.xml'));

    for (const file of files) {
        const content = fs.readFileSync(path.join(directory, file), 'utf-8');
        const jsonObj = parser.parse(content);

        const npcList = Array.isArray(jsonObj.list.npc) ? jsonObj.list.npc : [jsonObj.list.npc];

        for (const n of npcList) {
            if (!n) continue;

            const rewards: L2Reward[] = [];
            
            const rewardLists = Array.isArray(n.rewardlist) ? n.rewardlist : (n.rewardlist ? [n.rewardlist] : []);
            
            for (const rl of rewardLists) {
                const type = rl.type;
                const groups = Array.isArray(rl.group) ? rl.group : (rl.group ? [rl.group] : []);
                
                for (const g of groups) {
                    const groupRewards = Array.isArray(g.reward) ? g.reward : (g.reward ? [g.reward] : []);
                    for (const r of groupRewards) {
                        rewards.push({
                            itemId: parseInt(r.itemId),
                            min: parseInt(r.min),
                            max: parseInt(r.max),
                            chance: parseFloat(r.chance),
                            type: type
                        });
                    }
                }
                
                // For types without groups (like SWEEP sometimes)
                const standaloneRewards = Array.isArray(rl.reward) ? rl.reward : (rl.reward ? [rl.reward] : []);
                for (const r of standaloneRewards) {
                     rewards.push({
                        itemId: parseInt(r.itemId),
                        min: parseInt(r.min),
                        max: parseInt(r.max),
                        chance: parseFloat(r.chance),
                        type: type
                    });
                }
            }

            // Extract set value
            const sets = Array.isArray(n.set) ? n.set : (n.set ? [n.set] : []);
            const levelSet = sets.find((s: any) => s.name === "level");
            const hpSet = sets.find((s: any) => s.name === "baseHpMax");
            const typeSet = sets.find((s: any) => s.name === "type");

            npcs.push({
                id: parseInt(n.id),
                name: n.nameEn || n.nameRu,
                level: levelSet ? parseInt(levelSet.value) : 0,
                hp_max: hpSet ? parseInt(hpSet.value) : 0,
                type: typeSet ? typeSet.value : 'Unknown',
                rewards: rewards
            });
        }
    }

    return npcs;
}
