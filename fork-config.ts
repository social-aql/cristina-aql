/**
 * FORK CONFIGURATION
 * ==================
 * This is the ONLY file you need to change when forking social-aql.
 *
 * Steps to create a new fork:
 * 1. Fork the social-aql repo on GitHub
 * 2. Edit THIS file with your brand settings
 * 3. Run `pnpm dev` and verify the app looks correct
 * 4. Deploy to Vercel
 *
 * To pull updates from social-aql:
 *   git remote add upstream https://github.com/your-org/social-aql.git
 *   git fetch upstream
 *   git merge upstream/main
 *   (resolve any conflicts in this file only)
 */

import type { ForkConfig } from './src/lib/fork-config-types';

const config: ForkConfig = {
  // ===================================================================
  // APP IDENTITY
  // ===================================================================
  app: {
    name: 'CRISTINA_aql',
    tagline: 'Smart travel friendly content.',
    handle: '@cristina.cicedea',
    locale: 'ro',
    defaultDateRangeDays: 30,
  },

  // ===================================================================
  // VISUAL THEME
  // Replace hex values with your brand colors.
  // accentPrimary: positive signals, active states, CTAs (currently lime)
  // accentSecondary: negative signals, warnings, errors (currently coral)
  // ===================================================================
  theme: {
    bgBase: '#fff3e7',
    bgElevated: '#f0f0f0',
    bgCard: '#f4f4f4',
    bgCardPositive: '#fff6d0',
    bgCardNegative: '#03265b',

    textPrimary: '#d2a062',
    textSecondary: '#181818',
    textMuted: '#5A5A5A',

    accentPrimary: '#ff8066',
    accentPrimaryDim: '#ac5645',
    accentSecondary: '#FF5A4E',
    accentSecondaryDim: '#8C2F28',

    borderDefault: '#262626',
    borderPositive: '#b6b096',
    borderNegative: '#5C1F1A',

    fontDisplay: 'League Spartan',
    fontBody: 'Inter',
    fontMono: 'JetBrains Mono',

    borderRadius: 6,
    borderRadiusSm: 4,
  },

  // ===================================================================
  // MODULES
  // Disabled modules are completely hidden from the UI.
  // ===================================================================
  modules: {
    metaInstagram: true,
    mockProvider: true,

    aiAnalyses: true,
    weeklySummary: true,
    contentPatterns: true,
    contentIdeation: true,

    diagnosticFlags: true,
    performanceTab: true,
    contentTab: true,
    aiInsightsTab: true,

    postDiagnosticChecklist: true,
  },

  // ===================================================================
  // AI CONFIGURATION
  // ===================================================================
  ai: {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    chatModel: 'gemini-2.5-flash',
    analysisLocale: 'ro',
  },

  // ===================================================================
  // CONTENT THEMES
  // ===================================================================
  contentNiche: {
    label: 'Travel & Lifestyle',
    description: 'Creator de conținut travel si lifestyle limba română.',
    themes: [
      'travel', 'lifestyle', 'stays', 'guides', 'motivational',
    ],
    themeLabels: {
      travel: 'TRAVEL',
      lifestyle: 'LIFESTYLE',
      stays: 'STAYS',
      guides: 'GUIDES',
      motivational: 'MOTIVATIONAL',
      other: 'OTHER',
    },
    themeLabelsVerbose: {
      travel: 'Travel · Călătorii',
      lifestyle: 'Lifestyle · Stil de Viață',
      stays: 'Stays · Cazări',
      guides: 'Guides · Ghiduri',
      motivational: 'Motivational · Mindset',
      other: 'Other',
    },
    keywords: [
      // travel
      'travel', 'călătorie', 'calatorie', 'vacanță', 'vacanta', 'trip', 'journey',
      'destinație', 'destinatie', 'zbor', 'flight', 'aeroport', 'airport',
      'cazare', 'hotel', 'hostel', 'airbnb', 'resort', 'pensiune',
      'bagaj', 'baggage', 'viza', 'viză', 'pașaport', 'pasaport', 'passport',
      'city break', 'weekend', 'escapadă', 'escapada',
      'traseu', 'itinerariu', 'itinerary', 'ghid', 'guide',
      'munte', 'mare', 'plajă', 'plaja', 'beach', 'ocean',
      'backpacking', 'solo travel', 'road trip',

      // stays / accommodation
      'check-in', 'check-out', 'rezervare', 'booking', 'suite',
      'cazat', 'locuiesc', 'stau', 'cameră', 'camera', 'room',

      // lifestyle
      'lifestyle', 'rutină', 'rutina', 'routine', 'obiceiuri', 'habits',
      'dimineață', 'dimineata', 'morning', 'wellness', 'sănătate', 'sanatate',
      'fitness', 'mindset', 'productivitate', 'productivity',
      'echilibru', 'balance', 'fericire', 'happiness',
      'fashion', 'outfit', 'stil', 'style',
      'cafea', 'coffee', 'restaurant', 'food', 'mâncare', 'mancare',

      // motivational
      'motivație', 'motivatie', 'motivation', 'inspirație', 'inspiratie', 'inspiration',
      'succes', 'success', 'vis', 'dream', 'obiectiv', 'goal',
      'schimbare', 'change', 'creștere', 'crestere', 'growth',
      'libertate', 'freedom', 'independență', 'independenta',
    ],
  },
};

export default config;
