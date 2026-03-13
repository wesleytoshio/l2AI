import * as fs from 'fs';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';
import { L2Item } from '../types/models';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
});

export const parseItems = (dirOrFile: string): L2Item[] => {
  const allItems: L2Item[] = [];
  
  const files = fs.statSync(dirOrFile).isDirectory() 
    ? fs.readdirSync(dirOrFile).filter(f => f.endsWith('.xml')).map(f => path.join(dirOrFile, f))
    : [dirOrFile];

  for (const filePath of files) {
    const xmlContent = fs.readFileSync(filePath, 'utf-8');
    const jsonObj = parser.parse(xmlContent);
    if (!jsonObj.list || !jsonObj.list.item) continue;

    const items: any[] = Array.isArray(jsonObj.list.item) ? jsonObj.list.item : [jsonObj.list.item];

    items.forEach((i: any) => {
      const itemType = i.type?.toLowerCase() || 'etcitem';
      const l2Item: L2Item = {
        id: parseInt(i.id),
        name: i.nameEn || i.name,
        item_type: itemType as any,
        icon: i.icon,
      };

      const sets = Array.isArray(i.set) ? i.set : [i.set].filter(Boolean);
      sets.forEach((set: any) => {
        if (set.name === 'material') l2Item.material = set.val;
        if (set.name === 'weight') l2Item.weight = parseInt(set.val);
        if (set.name === 'price') l2Item.price = parseInt(set.val);
      });

      if (itemType === 'weapon') {
          l2Item.weapon_stats = {
              p_atk: 0, m_atk: 0, critical: 0, atk_speed: 0,
              weapon_type: i.weapon_type || 'none'
          };
          sets.forEach((set: any) => {
              if (set.name === 'p_atk') l2Item.weapon_stats!.p_atk = parseInt(set.val);
              if (set.name === 'm_atk') l2Item.weapon_stats!.m_atk = parseInt(set.val);
              if (set.name === 'critical') l2Item.weapon_stats!.critical = parseInt(set.val);
              if (set.name === 'atk_speed') l2Item.weapon_stats!.atk_speed = parseInt(set.val);
          });
      }

      if (itemType === 'armor') {
          l2Item.armor_stats = {
              p_def: 0, m_def: 0, 
              armor_type: i.armor_type || 'none',
              slot: i.bodypart || 'none'
          };
          sets.forEach((set: any) => {
              if (set.name === 'p_def') l2Item.armor_stats!.p_def = parseInt(set.val);
              if (set.name === 'm_def') l2Item.armor_stats!.m_def = parseInt(set.val);
          });
      }

      allItems.push(l2Item);
    });
  }

  return allItems;
};
