import { prisma } from '../config/prisma.js';
import type { z } from 'zod';
import type { loadSettingsSchema } from '../validation/load-settings.validation.js';
export const readLoadSettings = () => prisma.loadSettings.upsert({ where:{id:'singleton'},create:{id:'singleton'},update:{} });
export function saveLoadSettings(input: z.infer<typeof loadSettingsSchema>) {
  const {prep_tiers, ...data} = input;
  return prisma.loadSettings.upsert({where:{id:'singleton'},create:{...data,id:'singleton',prep_tiers_json:JSON.stringify(prep_tiers)},update:{...data,prep_tiers_json:JSON.stringify(prep_tiers)}});
}
