import type { DiagnosticCheck, PostDiagnosticResult } from './types';

export interface PostDiagnosticInput {
  id: string;
  caption: string | null;
  mediaType: string;
  theme: string | null;
  themeSecondary: string | null;
  themeConfidence: string | null;
  hashtags: string[];
  publishedAt: string;

  hook: string | null;
  hookType: string | null;
  captionWordCount: number;
  hasSaveCta: boolean;
  hashtagCount: number;
  captionLength: 'short' | 'medium' | 'long';

  erByReach: number | null;
  savesPerReach: number | null;
  sendsPerReach: number | null;
  reach: number | null;
  likes: number | null;
  saves: number | null;
  shares: number | null;
  comments: number | null;
  videoViews: number | null;
  watchTimeSeconds: number | null;
  saveToLikeRatio: number | null;
  completionRate: number | null;
  reachRate: number | null;

  accountAvgErByReach: number | null;
  accountAvgSavesPerReach: number | null;
  accountAvgSendsPerReach: number | null;
  accountBestHookType: string | null;
}

export function runPostDiagnostics(input: PostDiagnosticInput): PostDiagnosticResult {
  const checks: DiagnosticCheck[] = [
    ...runHookChecks(input),
    ...runCaptionSeoChecks(input),
    ...runHashtagChecks(input),
    ...runEngagementChecks(input),
    ...runStrategyChecks(input),
    ...runFinancialCreatorChecks(input),
  ];

  const criticalCount = checks.filter(c => !c.passed && c.severity === 'critical').length;
  const warningCount = checks.filter(c => !c.passed && c.severity === 'warning').length;
  const infoCount = checks.filter(c => !c.passed && c.severity === 'info').length;
  const okCount = checks.filter(c => c.passed).length;

  const score = Math.max(0, Math.min(100,
    100 - (criticalCount * 20) - (warningCount * 8) - (infoCount * 3)
  ));

  return {
    postId: input.id,
    totalChecks: checks.length,
    criticalCount,
    warningCount,
    infoCount,
    okCount,
    score,
    checks,
  };
}

function runHookChecks(input: PostDiagnosticInput): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];
  const isVideo = input.mediaType === 'reel' || input.mediaType === 'video';

  if (input.hookType && input.accountBestHookType && input.hookType !== input.accountBestHookType) {
    checks.push({
      id: 'hook_type_suboptimal',
      category: 'hook',
      severity: 'warning',
      title: 'Tip hook sub-optimal',
      detail: `Acest post folosește hook tip "${input.hookType}". Pe contul tău, hook-urile tip "${input.accountBestHookType}" au ER mediu mai bun.`,
      action: `Reformulează deschiderea ca ${input.accountBestHookType === 'question' ? 'o întrebare' : input.accountBestHookType === 'command' ? 'un imperativ' : 'un citat sau cifră'}.`,
      benchmark: `Hook tip "${input.accountBestHookType}" = cel mai bun ER mediu pe contul tău`,
      passed: false,
    });
  } else if (input.hookType && input.accountBestHookType && input.hookType === input.accountBestHookType) {
    checks.push({
      id: 'hook_type_suboptimal',
      category: 'hook',
      severity: 'info',
      title: 'Tip hook',
      detail: `Hook tip "${input.hookType}" — corespunde cu tipul care performează cel mai bine pe contul tău.`,
      action: null,
      benchmark: null,
      passed: true,
    });
  }

  if (isVideo) {
    if (input.completionRate != null && input.completionRate < 35) {
      checks.push({
        id: 'completion_rate_low',
        category: 'hook',
        severity: 'critical',
        title: 'Completion rate scăzut',
        detail: `Completion rate ${input.completionRate.toFixed(1)}% — sub pragul de 35%. Publicul abandoneaza Reel-ul devreme.`,
        action: 'Testează să pui concluzia ÎNAINTE de explicație. Primele 3 secunde trebuie să creeze tensiune imediat.',
        benchmark: '>35% = acceptabil, >50% = bun, >65% = excelent',
        passed: false,
      });
    } else if (input.completionRate != null && input.completionRate >= 50) {
      checks.push({
        id: 'completion_rate_low',
        category: 'hook',
        severity: 'info',
        title: 'Completion rate',
        detail: `Completion rate ${input.completionRate.toFixed(1)}% — bun. Publicul vizionează până la final.`,
        action: null,
        benchmark: '>50% = bun',
        passed: true,
      });
    } else if (input.completionRate == null && input.watchTimeSeconds == null) {
      checks.push({
        id: 'completion_rate_low',
        category: 'hook',
        severity: 'info',
        title: 'Watch time nedisponibil',
        detail: 'Datele de watch time nu sunt disponibile pentru acest Reel via API. Verifică manual în Instagram Insights.',
        action: null,
        benchmark: null,
        passed: true,
      });
    }
  }

  return checks;
}

function runCaptionSeoChecks(input: PostDiagnosticInput): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];

  if (input.captionWordCount < 30) {
    checks.push({
      id: 'caption_too_short',
      category: 'caption_seo',
      severity: 'warning',
      title: 'Caption prea scurt',
      detail: `${input.captionWordCount} cuvinte — sub minimul de 50 recomandat pentru SEO semantic. Algoritmul nu are suficient context.`,
      action: 'Adaugă 2-3 propoziții explicative după hook. Descrie contextul, impactul, și relevanța pentru audiența ta.',
      benchmark: '50-150 cuvinte = optimal pentru SEO + engagement',
      passed: false,
    });
  } else if (input.captionWordCount >= 50 && input.captionWordCount <= 200) {
    checks.push({
      id: 'caption_too_short',
      category: 'caption_seo',
      severity: 'info',
      title: 'Lungime caption',
      detail: `${input.captionWordCount} cuvinte — în range-ul optimal.`,
      action: null,
      benchmark: '50-200 cuvinte = optimal',
      passed: true,
    });
  }

  const preview = (input.caption ?? '').slice(0, 125).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  const themeKeywordInPreview = input.theme && input.theme !== 'other'
    ? themeAppearsInText(input.theme, preview)
    : true;
  if (!themeKeywordInPreview && input.theme && input.theme !== 'other') {
    checks.push({
      id: 'keyword_in_preview',
      category: 'caption_seo',
      severity: 'info',
      title: 'Keyword absent din preview',
      detail: `Tema "${input.theme}" nu apare în primele 125 caractere (zona vizibilă fără "Mai mult"). Algoritmul prioritizează primele cuvinte.`,
      action: `Mută un keyword relevant (${getThemeKeyword(input.theme)}) în prima propoziție.`,
      benchmark: 'Keyword principal în primele 125 caractere',
      passed: false,
    });
  } else {
    checks.push({
      id: 'keyword_in_preview',
      category: 'caption_seo',
      severity: 'info',
      title: 'Keyword în preview',
      detail: 'Tema principală apare în zona vizibilă a caption-ului.',
      action: null,
      benchmark: null,
      passed: true,
    });
  }

  const isEducational = input.theme === 'education' || input.theme === 'investing_principles';
  const isCarousel = input.mediaType === 'carousel';
  if ((isCarousel || isEducational) && !input.hasSaveCta) {
    checks.push({
      id: 'no_save_cta',
      category: 'caption_seo',
      severity: input.savesPerReach != null && input.savesPerReach < 0.5 ? 'warning' : 'info',
      title: 'Fără CTA de salvare',
      detail: `${isCarousel ? 'Carousel' : 'Postare educațională'} fără apel la salvare. Postările cu CTA explicit obțin 40-60% mai multe saves.`,
      action: 'Adaugă pe ultimul slide sau la finalul caption-ului: "Salvează pentru mai târziu 🔖" sau "Trimite cuiva care investește."',
      benchmark: 'Carouselurile și conținutul educațional beneficiază cel mai mult de CTA save',
      passed: false,
    });
  } else if (input.hasSaveCta) {
    checks.push({
      id: 'no_save_cta',
      category: 'caption_seo',
      severity: 'info',
      title: 'CTA de salvare prezent',
      detail: 'Caption-ul include un apel la salvare sau distribuire.',
      action: null,
      benchmark: null,
      passed: true,
    });
  }

  return checks;
}

function runHashtagChecks(input: PostDiagnosticInput): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];

  if (input.hashtagCount === 0) {
    checks.push({
      id: 'no_hashtags',
      category: 'hashtags',
      severity: 'warning',
      title: 'Fără hashtag-uri',
      detail: 'Niciun hashtag. Algoritmul folosește hashtag-urile ca etichete de categorizare pentru distribuție.',
      action: 'Adaugă 3-5 hashtag-uri: 1-2 broad (#finante, #economie) + 2-3 niche (#educatiefinanciara, #investitorromani, #' + (input.theme ?? 'macro') + ').',
      benchmark: '3-5 hashtag-uri relevante = optimal',
      passed: false,
    });
  } else if (input.hashtagCount > 20) {
    checks.push({
      id: 'too_many_hashtags',
      category: 'hashtags',
      severity: 'info',
      title: 'Prea multe hashtag-uri',
      detail: `${input.hashtagCount} hashtag-uri — poate părea spam. Calitatea bate cantitatea.`,
      action: 'Reduce la 5-10 hashtag-uri extrem de relevante. Elimină hashtag-urile generice cu milioane de postări.',
      benchmark: '5-10 = recomandat în 2026',
      passed: false,
    });
  } else if (input.hashtagCount >= 3 && input.hashtagCount <= 10) {
    checks.push({
      id: 'no_hashtags',
      category: 'hashtags',
      severity: 'info',
      title: 'Hashtag-uri',
      detail: `${input.hashtagCount} hashtag-uri — în range-ul optimal.`,
      action: null,
      benchmark: '3-10 = optimal',
      passed: true,
    });
  } else {
    checks.push({
      id: 'few_hashtags',
      category: 'hashtags',
      severity: 'info',
      title: 'Puține hashtag-uri',
      detail: `${input.hashtagCount} hashtag-uri — poți adăuga 2-3 în plus pentru mai multă acoperire.`,
      action: 'Adaugă hashtag-uri de nișă specifice temei postării.',
      benchmark: '3-10 = optimal',
      passed: false,
    });
  }

  return checks;
}

function runEngagementChecks(input: PostDiagnosticInput): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];

  if (input.erByReach != null && input.accountAvgErByReach != null) {
    const delta = ((input.erByReach - input.accountAvgErByReach) / input.accountAvgErByReach) * 100;
    if (delta < -30) {
      checks.push({
        id: 'er_below_average',
        category: 'engagement',
        severity: 'warning',
        title: 'ER sub media contului',
        detail: `ER ${input.erByReach.toFixed(2)}% vs media contului ${input.accountAvgErByReach.toFixed(2)}% (${delta.toFixed(0)}% sub medie).`,
        action: 'Analizează ce e diferit față de postările tale cu ER ridicat: hook, temă, format, timing.',
        benchmark: `Media contului tău: ${input.accountAvgErByReach.toFixed(2)}%`,
        passed: false,
      });
    } else if (delta > 30) {
      checks.push({
        id: 'er_below_average',
        category: 'engagement',
        severity: 'info',
        title: 'ER peste media contului',
        detail: `ER ${input.erByReach.toFixed(2)}% — cu ${delta.toFixed(0)}% peste media contului. Postare de top.`,
        action: null,
        benchmark: null,
        passed: true,
      });
    }
  }

  if (input.savesPerReach != null && input.savesPerReach < 0.3) {
    checks.push({
      id: 'save_rate_low',
      category: 'engagement',
      severity: input.mediaType === 'carousel' ? 'warning' : 'info',
      title: 'Save rate scăzut',
      detail: `Save rate ${input.savesPerReach.toFixed(2)}% — sub benchmark minim (0.5%). Conținutul e consumat, nu reținut.`,
      action: input.mediaType === 'carousel'
        ? 'Pentru carousel: adaugă un slide final cu recap + CTA save. Structurează conținutul ca "ghid de referință".'
        : 'Adaugă o listă sau structură clară pe care oamenii vor să o salveze. Evită conținut pur narativ.',
      benchmark: '0.5% = minim, 1% = bun, 3%+ = excelent',
      passed: false,
    });
  } else if (input.savesPerReach != null && input.savesPerReach >= 1) {
    checks.push({
      id: 'save_rate_low',
      category: 'engagement',
      severity: 'info',
      title: 'Save rate',
      detail: `Save rate ${input.savesPerReach.toFixed(2)}% — bun. Audiența salvează conținutul pentru referință.`,
      action: null,
      benchmark: null,
      passed: true,
    });
  }

  const isEducational = input.theme === 'education' || input.theme === 'investing_principles';
  if (isEducational && input.saveToLikeRatio != null && input.saveToLikeRatio < 0.1) {
    checks.push({
      id: 'edu_save_to_like',
      category: 'financial_creator',
      severity: 'warning',
      title: 'Conținut educațional perceput ca entertainment',
      detail: `Save-to-like ratio ${input.saveToLikeRatio.toFixed(3)} pe conținut educațional (benchmark: >0.2). Oamenii apreciază dar nu salvează.`,
      action: 'Adaugă elemente de "referință": liste numerotate, formule, pași clari. Conținutul educațional trebuie să fie util să revii la el.',
      benchmark: '>0.2 = conținut de referință, <0.1 = conținut de entertainment',
      passed: false,
    });
  }

  return checks;
}

function runStrategyChecks(input: PostDiagnosticInput): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];

  if (input.theme === 'other' || input.themeConfidence === 'low') {
    checks.push({
      id: 'theme_unclear',
      category: 'strategy',
      severity: 'info',
      title: 'Temă neclară',
      detail: input.theme === 'other'
        ? 'Postarea nu a putut fi clasificată tematic. Caption-ul poate fi prea abstract sau pe un subiect nou.'
        : `Tema "${input.theme}" detectată cu confidence scăzut. Caption-ul poate fi ambiguu tematic.`,
      action: 'Adaugă cuvinte cheie specifice temei în caption. Algoritmul construiește "niche authority" prin claritate tematică repetată.',
      benchmark: 'High confidence = algoritmul înțelege și distribuie corect',
      passed: input.theme !== 'other' && input.themeConfidence !== 'low',
    });
  }

  return checks;
}

function runFinancialCreatorChecks(input: PostDiagnosticInput): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];

  const isMacroOrEdu = ['macro', 'education', 'investing_principles', 'economy_eu'].includes(input.theme ?? '');
  const hookIsAbstract = input.hookType === 'statement' &&
    input.hook != null &&
    !/(portofoliu|bani tăi|banii tăi|investiție|pierdere|câștig|dobândă|\d+%|\d+ lei|\$\d+)/i.test(input.hook);

  if (isMacroOrEdu && hookIsAbstract && input.erByReach != null &&
      input.accountAvgErByReach != null &&
      input.erByReach < input.accountAvgErByReach) {
    checks.push({
      id: 'hook_too_abstract',
      category: 'financial_creator',
      severity: 'info',
      title: 'Hook abstract fără implicație personală',
      detail: `Hook: "${input.hook}". Pe conținut ${input.theme}, hook-urile cu implicație directă pentru portofoliu sau banii personali performează mai bine.`,
      action: 'Adaugă implicația personală în hook: "Când X se întâmplă, banii tăi Y. Iată ce faci concret."',
      benchmark: 'Hook financiar acționabil > hook filozofic pentru retail investors',
      passed: false,
    });
  }

  return checks;
}

function themeAppearsInText(theme: string, text: string): boolean {
  const themeKeywords: Record<string, string[]> = {
    fed: ['fed', 'powell', 'fomc', 'rezerva federala', 'federal reserve'],
    crypto: ['bitcoin', 'btc', 'ethereum', 'crypto', 'cripto'],
    stocks_us: ['sp500', 's&p', 'nasdaq', 'nvidia', 'apple', 'wall street'],
    gold: ['aur', 'xau', 'gold', 'argint'],
    forex: ['dxy', 'dolar', 'dollar', 'usd', 'forex', 'valuta'],
    real_estate: ['imobiliar', 'real estate', 'locuinte', 'ipoteca'],
    economy_eu: ['bce', 'ecb', 'lagarde', 'europa', 'eurozona'],
    macro: ['inflatie', 'inflation', 'pib', 'gdp', 'recesiune', 'recession'],
    education: ['compound', 'dobanda', 'dobânda', 'educatie', 'minune'],
    investing_principles: ['diversifica', 'ouale', 'portofoliu', 'risc', 'alocare', 'dca'],
    trading_strategy: ['trading', 'algoritm', 'weekly', 'piata saptamanii'],
    emerging_markets: ['emergente', 'brics', 'china', 'india'],
  };
  const keywords = themeKeywords[theme] ?? [];
  return keywords.some(kw => text.includes(kw.normalize('NFD').replace(/[̀-ͯ]/g, '')));
}

function getThemeKeyword(theme: string): string {
  const primaryKeywords: Record<string, string> = {
    fed: 'FED / Federal Reserve',
    crypto: 'Bitcoin / crypto',
    stocks_us: 'S&P 500 / Wall Street',
    gold: 'aur / XAU',
    forex: 'dolar / DXY',
    real_estate: 'imobiliare',
    economy_eu: 'BCE / Europa',
    macro: 'inflație / PIB',
    education: 'concept financiar',
    investing_principles: 'diversificare / portofoliu',
    trading_strategy: 'strategie / piață',
    emerging_markets: 'piețe emergente',
  };
  return primaryKeywords[theme] ?? theme;
}
