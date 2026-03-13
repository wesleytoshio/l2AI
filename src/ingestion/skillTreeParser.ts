import * as fs from 'fs';
import { XMLParser } from 'fast-xml-parser';
import * as path from 'path';

export interface L2ClassSkill {
    classId: number;
    skillId: number;
    minLevel: number;
    autoGet: boolean;
}

export function parseSkillTrees(filePath: string): L2ClassSkill[] {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
    const content = fs.readFileSync(filePath, 'utf-8');
    const jsonObj = parser.parse(content);

    const skillTrees: L2ClassSkill[] = [];
    const list = Array.isArray(jsonObj.list.skillTree) ? jsonObj.list.skillTree : [jsonObj.list.skillTree];

    for (const tree of list) {
        if (!tree) continue;
        const classId = parseInt(tree.classId);
        
        if (tree.skill) {
            const skillList = Array.isArray(tree.skill) ? tree.skill : [tree.skill];
            for (const s of skillList) {
                if (!s) continue;
                skillTrees.push({
                    classId,
                    skillId: parseInt(s.skillId),
                    minLevel: parseInt(s.getLevel || "1"),
                    autoGet: s.autoGet === 'true'
                });
            }
        }
    }

    return skillTrees;
}
