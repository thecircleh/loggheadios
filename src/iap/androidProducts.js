// Google Play product IDs — must match exactly what is registered in Play Console
// Bundle ID: com.loggerheadstat.app

export const ANDROID_PRODUCT_IDS = {
  weekly:     'com.loggerheadstat.app.sub.weekly',
  monthly:    'com.loggerheadstat.app.sub.monthly',
  sixMonth:   'com.loggerheadstat.app.sub.sixmonth',
  annual:     'com.loggerheadstat.app.sub.annual',
  matchKey:   'com.loggerheadstat.app.matchkey',
  statbookKey:'com.loggerheadstat.app.statbookkey',
  giftAnnual: 'com.loggerheadstat.app.giftcode',
};

export const ANDROID_SUBSCRIPTION_PLANS = [
  {
    key: 'weekly',
    productId: ANDROID_PRODUCT_IDS.weekly,
    label: 'Weekly',
    fallbackPrice: '$2.49',
    perWeek: '= $2.49/week',
    subText: 'Best for club weekends.',
    badge: 'Most popular',
    featured: true,
  },
  {
    key: 'monthly',
    productId: ANDROID_PRODUCT_IDS.monthly,
    label: 'Monthly',
    fallbackPrice: '$7.99',
    perWeek: '≈ $1.99/week',
    subText: 'Regular monthly access.',
    badge: 'Flexible',
  },
  {
    key: 'sixMonth',
    productId: ANDROID_PRODUCT_IDS.sixMonth,
    label: '6 Month',
    fallbackPrice: '$39.99',
    perWeek: '≈ $1.54/week',
    subText: 'Season-style access.',
    badge: 'Season',
  },
  {
    key: 'annual',
    productId: ANDROID_PRODUCT_IDS.annual,
    label: 'Annual',
    fallbackPrice: '$59.99',
    perWeek: '≈ $1.15/week',
    subText: 'Lowest long-term cost.',
    badge: 'Best value',
  },
];

export const ANDROID_ONETIME_PRODUCTS = [
  {
    key: 'matchKey',
    productId: ANDROID_PRODUCT_IDS.matchKey,
    label: 'Match Tracking Key',
    fallbackPrice: '$1.29',
    subText: 'One-time unlock for a single match.',
    mode: 'match',
  },
  {
    key: 'statbookKey',
    productId: ANDROID_PRODUCT_IDS.statbookKey,
    label: 'Stat Book Key',
    fallbackPrice: '$1.29',
    subText: 'One-time unlock for a single stat book match.',
    mode: 'statbook',
  },
  {
    key: 'giftAnnual',
    productId: ANDROID_PRODUCT_IDS.giftAnnual,
    label: 'Buy a Gift — Annual',
    fallbackPrice: '$59.99',
    subText: 'Gift one year of Premium to someone else.',
  },
];
