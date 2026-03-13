import * as fs from 'fs';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';
import { L2Skill, L2SkillLevel } from '../types/models';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
});

export const parseSkills = (dirOrFile: string): L2Skill[] => {
  const skills: L2Skill[] = [];
  
  const files = fs.statSync(dirOrFile).isDirectory() 
    ? fs.readdirSync(dirOrFile).filter(f => f.endsWith('.xml')).map(f => path.join(dirOrFile, f))
    : [dirOrFile];

  for (const filePath of files) {
    const xmlContent = fs.readFileSync(filePath, 'utf-8');
    const jsonObj = parser.parse(xmlContent);
    if (!jsonObj.list || !jsonObj.list.skill) continue;
    
    const skillList: any[] = Array.isArray(jsonObj.list.skill) ? jsonObj.list.skill : [jsonObj.list.skill];

    skillList.forEach((s: any) => {
      const levels: L2SkillLevel[] = [];
      const maxLvl = parseInt(s.levels || '1');
      for (let i = 1; i <= maxLvl; i++) {
          levels.push({ level: i });
      }

      skills.push({
        id: parseInt(s.id),
        name: s.nameEn || s.name,
        description: s.descEn,
        icon: s.icon,
        levels,
      });
    });
  }

  return skills;
};
