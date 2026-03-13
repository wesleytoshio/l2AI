import { L2Class, L2Item, L2Skill } from "../types/models";

export class KnowledgeGenerator {
  static generateClassSummary(l2Class: L2Class, skills: any[]) {
    const jobType = !l2Class.parent_class_id ? 'Base Class' : 
                   (l2Class.id < 50 ? '1st Job (Level 20)' : 
                   (l2Class.id < 100 ? '2nd Job (Level 40)' : '3rd Job (Level 76)'));

    let summary = `## Class Guide: ${l2Class.name}\n`;
    summary += `Role: ${jobType}\n`;
    summary += `Description: A class with deep mastery of its skills and a critical role in the game's progression path.\n\n`;

    summary += `### Skill Progression\n`;
    const sortedSkills = [...skills].sort((a, b) => (a.min_level || 0) - (b.min_level || 0));
    
    sortedSkills.forEach(s => {
      const levelInfo = s.min_level ? `[Learned at Level ${s.min_level}]` : '';
      summary += `- **${s.name}** ${levelInfo}: ${s.description || 'Action/Passive skill.'}\n`;
    });

    return summary;
  }

  static generateItemSummary(item: L2Item, drops: any[]) {
    let summary = `## Item Wiki: ${item.name}\n`;
    summary += `Type: ${item.item_type}\n`;
    if (item.material) summary += `Material: ${item.material}\n`;
    if (item.weight) summary += `Weight: ${item.weight}\n`;
    if (item.price) summary += `Price: ${item.price} Adena\n`;

    if (drops && drops.length > 0) {
      summary += `\n### Dropped/Spoiled By:\n`;
      drops.slice(0, 10).forEach(d => {
        summary += `- **${d.npc_name}** (Level ${d.npc_level}): ${d.chance}% chance\n`;
      });
    } else {
        summary += `\nThis item might be sold by NPCs or crafted. Check the luxury shop or recipe list.`;
    }

    return summary;
  }

  static generateSkillSummary(skill: any, classes: any[]) {
    let summary = `## Skill Wiki: ${skill.name}\n`;
    summary += `Description: ${skill.description || 'A powerful skill in Lineage 2 High Five.'}\n\n`;
    summary += `### Learned By:\n`;
    
    if (!classes || classes.length === 0) {
        summary += `- This skill is not directly learned by any player classes (might be an NPC or item skill).\n`;
    } else {
        classes.forEach(c => {
            summary += `- **${c.name}**: Learned at Level ${c.min_level}\n`;
        });
    }

    return summary;
  }
}
