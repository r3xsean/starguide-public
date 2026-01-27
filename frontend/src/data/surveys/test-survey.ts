import type { Survey } from './types';

// Test survey to verify the survey system is working
// To activate: set active to true and import in index.ts
export const testSurvey: Survey = {
  id: 'test-survey-2024',
  active: false,
  title: 'Quick Feedback',
  description: 'Help us improve StarGuide! This takes less than 30 seconds.',
  questions: [
    {
      id: 'favorite-feature',
      type: 'single-choice',
      question: 'Which feature do you use most?',
      options: [
        'Character Browser',
        'Best Teams',
        'Pull Advisor',
        'Banner Advisor',
      ],
      required: true,
    },
    {
      id: 'satisfaction',
      type: 'rating',
      question: 'How satisfied are you with StarGuide?',
      min: 1,
      max: 5,
      minLabel: 'Not satisfied',
      maxLabel: 'Very satisfied',
      required: true,
    },
    {
      id: 'missing-feature',
      type: 'textarea',
      question: 'What feature would you like to see added?',
      placeholder: 'Tell us what would make StarGuide better...',
      rows: 3,
      required: false,
    },
  ],
};
