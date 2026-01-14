// Survey System Type Definitions
// This file defines the structure for surveys that can be easily created and managed

export type QuestionType = 'text' | 'textarea' | 'single-choice' | 'multi-choice' | 'rating';

export interface BaseQuestion {
  id: string;
  question: string;
  required: boolean;
}

export interface TextQuestion extends BaseQuestion {
  type: 'text';
  placeholder?: string;
  maxLength?: number;
}

export interface TextareaQuestion extends BaseQuestion {
  type: 'textarea';
  placeholder?: string;
  maxLength?: number;
  rows?: number;
}

export interface SingleChoiceQuestion extends BaseQuestion {
  type: 'single-choice';
  options: string[];
}

export interface MultiChoiceQuestion extends BaseQuestion {
  type: 'multi-choice';
  options: string[];
  minSelections?: number;
  maxSelections?: number;
}

export interface RatingQuestion extends BaseQuestion {
  type: 'rating';
  min: number;
  max: number;
  minLabel?: string;
  maxLabel?: string;
}

export type SurveyQuestion =
  | TextQuestion
  | TextareaQuestion
  | SingleChoiceQuestion
  | MultiChoiceQuestion
  | RatingQuestion;

export interface Survey {
  // Unique identifier for the survey (used in localStorage and Supabase)
  id: string;

  // Whether this survey should be shown to users
  active: boolean;

  // Display title shown at top of modal
  title: string;

  // Optional description shown below title
  description?: string;

  // Array of questions to ask
  questions: SurveyQuestion[];

  // Optional: only show to users who have visited at least this many times
  minVisits?: number;

  // Optional: only show after this date (ISO string)
  startDate?: string;

  // Optional: stop showing after this date (ISO string)
  endDate?: string;
}

// Response structure stored in Supabase
export interface SurveyResponse {
  survey_id: string;
  responses: Record<string, string | string[] | number>;
  skipped: boolean;
}
