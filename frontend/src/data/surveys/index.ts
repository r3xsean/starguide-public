/**
 * Survey System - Central Export
 *
 * HOW TO CREATE A NEW SURVEY:
 * 1. Create a new file in this folder (e.g., my-survey.ts)
 * 2. Export a Survey object with your questions
 * 3. Import it below and set it as activeSurvey
 * 4. Push to deploy - users will see it on their next visit
 *
 * HOW TO DISABLE A SURVEY:
 * - Set activeSurvey to null below
 * - Or set the survey's active: false
 *
 * SURVEY FILES:
 * - test-survey.ts - Test survey for verification
 */

import type { Survey } from './types';
import { testSurvey } from './test-survey';

// ============================================
// ACTIVE SURVEY CONFIGURATION
// ============================================
// Set this to the survey you want to show, or null to disable
// Only one survey can be active at a time

export const activeSurvey: Survey | null = testSurvey.active ? testSurvey : null;

// ============================================
// EXPORTS
// ============================================

export type { Survey, SurveyQuestion, SurveyResponse } from './types';
export { testSurvey };
