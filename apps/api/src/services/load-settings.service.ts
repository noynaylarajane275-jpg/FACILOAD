import { readLoadSettings, saveLoadSettings } from '../repositories/load-settings.repository.js';
import { loadSettingsSchema } from '../validation/load-settings.validation.js';
import { ApiError } from '../errors/apiError.js';
import { DEFAULT_LOAD_CONFIG, type TeachingLoadConfig } from './teaching-load.config.js';
export async function getLoadSettings() {
  const {prep_tiers_json, ...row} = await readLoadSettings();
  return {...row,prep_tiers:JSON.parse(prep_tiers_json)};
}
export async function putLoadSettings(input: unknown) {
  const parsed = loadSettingsSchema.safeParse(input);
  if (!parsed.success) throw ApiError.badRequest('Invalid load settings',parsed.error.flatten());
  await saveLoadSettings(parsed.data);
  return getLoadSettings();
}
export async function getLoadConfig(): Promise<TeachingLoadConfig> {
  const s = await getLoadSettings();
  return {...DEFAULT_LOAD_CONFIG,labCoefficient:s.lab_coefficient,facultyWeeklyHours:s.weekly_hours,
    consultationHours:s.consultation_hours,minFunctionHours:{research:s.min_research,extension:s.min_extension,imp:s.min_imp},
    minDesignationSessionHours:s.min_session_hours,prepTiers:s.prep_tiers};
}
