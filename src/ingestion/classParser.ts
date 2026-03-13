import * as fs from 'fs';
import { XMLParser } from 'fast-xml-parser';
import { L2Race, L2Class } from '../types/models';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
});

export const parseClasses = (filePath: string): L2Class[] => {
  const xmlContent = fs.readFileSync(filePath, 'utf-8');
  const jsonObj = parser.parse(xmlContent);
  const classes: any[] = jsonObj.list.class;

  const races = getRaces();

  return classes.map((c: any) => {
    const classId = parseInt(c.classId);
    const raceId = mapClassToRace(classId);
    const race = races.find(r => r.id === raceId)?.name || 'Human';

    return {
      id: classId,
      name: c.name,
      race: race,
      parent_class_id: c.parentClassId ? parseInt(c.parentClassId) : undefined,
    };
  });
};

// Races are implicitly mapped by base classes in L2
// id 0-17: Human, 18-30: Elf, 31-43: Dark Elf, 44-52: Orc, 53-57: Dwarf, 123-136: Kamael
export const getRaces = (): L2Race[] => [
  { id: 0, name: 'Human' },
  { id: 1, name: 'Elf' },
  { id: 2, name: 'Dark Elf' },
  { id: 3, name: 'Orc' },
  { id: 4, name: 'Dwarf' },
  { id: 5, name: 'Kamael' },
];

export const mapClassToRace = (classId: number): number => {
  if (classId <= 17) return 0;
  if (classId <= 30) return 1;
  if (classId <= 43) return 2;
  if (classId <= 52) return 3;
  if (classId <= 57) return 4;
  if (classId >= 123 && classId <= 136) return 5;
  return 0; // Default to human or handle other cases
};
