import * as fs from 'fs';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
const filePath = 'f:/L2 extract/game/data/stats/skills/skillTrees/classSkillTree.xml';

try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const jsonObj = parser.parse(content);
    
    console.log('List keys:', Object.keys(jsonObj.list));
    console.log('SkillTree count:', jsonObj.list.skillTree?.length);
    
    if (jsonObj.list.skillTree && jsonObj.list.skillTree.length > 0) {
        console.log('First SkillTree ClassId:', jsonObj.list.skillTree[0].classId);
        console.log('First SkillTree Skills count:', jsonObj.list.skillTree[0].skill?.length);
    }
} catch (e) {
    console.error('XML Debug Error:', e);
}
