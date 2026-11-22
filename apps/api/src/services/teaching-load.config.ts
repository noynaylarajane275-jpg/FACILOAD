/**
 * Teaching-load engine configuration.
 *
 * The prep tiers are CHED-approved values supplied by the Chairman. They must
 * stay configurable (override `DEFAULT_LOAD_CONFIG` at the call site) so the
 * dean's office can re-run loads when the tiers change without a code deploy.
 */
export interface PrepTier {
  minPreps: number;
  maxPreps: number;
  ceiling: number;
}

export interface TeachingLoadConfig {
  /** Lab hours count this fraction toward teaching load. */
  labCoefficient: number;
  /** Weekly hours a full-time faculty member is expected to render. */
  facultyWeeklyHours: number;
  /** Prep tiers searched in order; the last entry is the extrapolation cap. */
  prepTiers: PrepTier[];
  /** Expected weekly consultation hours. */
  consultationHours: number;
  /** Minimum weekly hours per "other function" (imp = 0 means no minimum). */
  minFunctionHours: { research: number; extension: number; imp: number };
  /** Minimum session hours for a designation (used in Bite 2). */
  minDesignationSessionHours: number;
}

export const DEFAULT_LOAD_CONFIG: TeachingLoadConfig = {
  labCoefficient: 0.7,
  facultyWeeklyHours: 40,
  prepTiers: [
    { minPreps: 1, maxPreps: 2, ceiling: 21 },
    { minPreps: 3, maxPreps: 4, ceiling: 18 },
    { minPreps: 5, maxPreps: 6, ceiling: 15 },
  ],
  consultationHours: 4,
  minFunctionHours: { research: 1, extension: 1, imp: 0 },
  minDesignationSessionHours: 1,
};
