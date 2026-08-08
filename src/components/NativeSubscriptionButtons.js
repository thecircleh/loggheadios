import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { useAppleIAP } from '../hooks/useAppleIAP';
import { APPLE_SUBSCRIPTION_PLANS, APPLE_ONETIME_PRODUCTS, APPLE_PRODUCT_IDS } from '../iap/appleProducts';
import { ANDROID_SUBSCRIPTION_PLANS, ANDROID_ONETIME_PRODUCTS, ANDROID_PRODUCT_IDS } from '../iap/androidProducts';

// Detect platform — same logic as the hook
const isAndroid = window.Capacitor?.getPlatform?.() === 'android';

// Pick the right product lists/IDs for the current storefront
const PLANS       = isAndroid ? ANDROID_SUBSCRIPTION_PLANS : APPLE_SUBSCRIPTION_PLANS;
const ONE_TIME    = isAndroid ? ANDROID_ONETIME_PRODUCTS   : APPLE_ONETIME_PRODUCTS;
const PRODUCT_IDS = isAndroid ? ANDROID_PRODUCT_IDS        : APPLE_PRODUCT_IDS;

const NativeSubscriptionButtons = () => {
  const { hasPremium, user } = useAuth();
  const { storeProducts, purchase, restore, purchasing, restoring, error, initialized } = useAppleIAP();
  const [selected, setSelected] = useState('weekly');

  const giftPrice = storeProducts[PRODUCT_IDS.giftAnnual]?.price ?? '$59.99';

  const GiftSection = () => (
    <div style={s.giftSection}>
      <div style={s.giftTitle}>🎁 Give Loggerhead as a Gift</div>
      <div style={s.giftSub}>Buy a gift code and share it with a coach, parent, or player.</div>
      <button
        onClick={() => purchase(PRODUCT_IDS.giftAnnual)}
        disabled={purchasing || !initialized}
        style={s.giftBtn}
      >
        {purchasing ? 'Processing…' : !initialized ? 'Loading…' : `Gift Annual – ${giftPrice}`}
      </button>
    </div>
  );

  const getPrice = (plan) => {
    const sp = storeProducts[plan.productId];
    return sp?.price ?? plan.fallbackPrice;
  };

  const selectedPlan = PLANS.find(p => p.key === selected);

  // Legal text differs by platform
  const legalSubscribeText = isAndroid
    ? 'Payment will be charged to your Google account at confirmation. Subscriptions renew automatically unless cancelled at least 24 hours before the renewal date. Manage subscriptions in Google Play → Subscriptions.'
    : 'Payment will be charged to your Apple ID at confirmation. Subscription automatically renews unless cancelled at least 24 hours before the end of the current period. Manage or cancel in iPhone Settings → Apple ID → Subscriptions.';

  const restoreLabel = isAndroid ? 'Restore Purchases' : 'Restore Purchases';

  if (hasPremium) {
    return (
      <div style={s.wrap}>
        <div style={s.activeHeader}>
          <div style={s.checkCircle}>✓</div>
          <div style={s.activeTitle}>You're on Premium</div>
          <div style={s.activeSub}>All features are unlocked. Thank you for supporting Loggerhead!</div>
        </div>
        <button onClick={restore} disabled={restoring} style={s.restoreBtn}>
          {restoring ? 'Checking…' : restoreLabel}
        </button>
        <GiftSection />
        {error && <div style={s.errorText}>{error}</div>}
        <div style={s.legalText}>
          {isAndroid
            ? 'Manage your subscription in Google Play → Subscriptions.'
            : 'Subscriptions can be managed in your iPhone Settings → Apple ID → Subscriptions.'}
        </div>
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.badge}>LOGGERHEAD PRO</div>
        <div style={s.headline}>Unlimited Volleyball Analytics</div>
        <div style={s.subHeadline}>Unlimited matches, full dashboards, ad-free.</div>
      </div>

      {/* Plan selector */}
      <div style={s.planList}>
        {PLANS.map(plan => {
          const isSel = selected === plan.key;
          return (
            <button
              key={plan.key}
              onClick={() => setSelected(plan.key)}
              style={{
                ...s.planCard,
                ...(isSel ? s.planCardSelected : {}),
                ...(plan.featured && !isSel ? s.planCardFeatured : {}),
              }}
            >
              {plan.featured && <div style={s.featuredBadge}>MOST POPULAR</div>}
              <div style={s.planRow}>
                <div style={s.planLeft}>
                  <div style={{ ...s.planLabel, ...(isSel ? { color: '#007AFF' } : {}) }}>{plan.label}</div>
                  <div style={s.planPerWeek}>{plan.perWeek}</div>
                </div>
                <div style={s.planRight}>
                  <div style={{ ...s.planPrice, ...(isSel ? { color: '#007AFF' } : {}) }}>
                    {getPrice(plan)}
                  </div>
                  {isSel && <div style={s.selectedDot} />}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Subscribe CTA */}
      <button
        onClick={() => selectedPlan && purchase(selectedPlan.productId)}
        disabled={purchasing || !initialized}
        style={{
          ...s.subscribeBtn,
          ...(purchasing || !initialized ? s.subscribeBtnDisabled : {}),
        }}
      >
        {purchasing ? 'Processing…' : !initialized ? 'Loading…' : `Subscribe – ${getPrice(selectedPlan)}`}
      </button>

      {error && <div style={s.errorText}>{error}</div>}

      {/* Per-match one-time keys */}
      <div style={s.section}>
        <div style={s.sectionTitle}>One-Time Match Access</div>
        {ONE_TIME.filter(p => p.key !== 'giftAnnual').map(p => (
          <div key={p.key} style={s.oneTimeRow}>
            <div>
              <div style={s.oneTimeLabel}>{p.label}</div>
              <div style={s.oneTimeSub}>{p.subText}</div>
            </div>
            <button
              onClick={() => purchase(p.productId)}
              disabled={purchasing || !initialized}
              style={s.oneTimeBtn}
            >
              {storeProducts[p.productId]?.price ?? p.fallbackPrice}
            </button>
          </div>
        ))}
      </div>

      <GiftSection />

      {/* Restore + legal */}
      <button onClick={restore} disabled={restoring} style={s.restoreBtn}>
        {restoring ? 'Checking…' : restoreLabel}
      </button>

      <div style={s.legalText}>{legalSubscribeText}</div>
    </div>
  );
};

const s = {
  wrap: {
    padding: '20px 16px',
    maxWidth: 480,
    margin: '0 auto',
    fontFamily: "-apple-system, 'Helvetica Neue', sans-serif",
  },
  header: {
    textAlign: 'center',
    marginBottom: 20,
  },
  badge: {
    display: 'inline-block',
    backgroundColor: '#007AFF',
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1,
    padding: '4px 12px',
    borderRadius: 20,
    marginBottom: 10,
  },
  headline: {
    fontSize: 22,
    fontWeight: 700,
    color: '#111',
    marginBottom: 6,
  },
  subHeadline: {
    fontSize: 14,
    color: '#666',
  },
  planList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginBottom: 16,
  },
  planCard: {
    background: '#f8f8f8',
    border: '2px solid #e5e5e5',
    borderRadius: 12,
    padding: '12px 14px',
    cursor: 'pointer',
    textAlign: 'left',
    position: 'relative',
    overflow: 'hidden',
  },
  planCardSelected: {
    background: '#EBF4FF',
    border: '2px solid #007AFF',
  },
  planCardFeatured: {
    border: '2px solid #34C759',
  },
  featuredBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    background: '#34C759',
    color: '#fff',
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 0.5,
    padding: '2px 8px',
    borderBottomLeftRadius: 8,
  },
  planRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planLeft: {},
  planLabel: {
    fontSize: 16,
    fontWeight: 600,
    color: '#111',
    marginBottom: 2,
  },
  planPerWeek: {
    fontSize: 12,
    color: '#888',
  },
  planRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  planPrice: {
    fontSize: 17,
    fontWeight: 700,
    color: '#111',
  },
  selectedDot: {
    width: 18,
    height: 18,
    borderRadius: '50%',
    background: '#007AFF',
  },
  subscribeBtn: {
    width: '100%',
    padding: '16px',
    borderRadius: 14,
    background: '#007AFF',
    color: '#fff',
    fontSize: 17,
    fontWeight: 700,
    border: 'none',
    cursor: 'pointer',
    marginBottom: 10,
    boxShadow: '0 4px 12px rgba(0,122,255,0.3)',
  },
  subscribeBtnDisabled: {
    background: '#b0c4de',
    boxShadow: 'none',
    cursor: 'not-allowed',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 10,
    padding: '8px 12px',
    background: '#FFF0EE',
    borderRadius: 8,
  },
  section: {
    marginTop: 20,
    marginBottom: 12,
    borderTop: '1px solid #eee',
    paddingTop: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  oneTimeRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid #f0f0f0',
  },
  oneTimeLabel: {
    fontSize: 15,
    fontWeight: 600,
    color: '#111',
    marginBottom: 2,
  },
  oneTimeSub: {
    fontSize: 12,
    color: '#888',
  },
  oneTimeBtn: {
    background: '#34C759',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '8px 14px',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    flexShrink: 0,
  },
  restoreBtn: {
    width: '100%',
    padding: '12px',
    background: 'none',
    border: '1px solid #ccc',
    borderRadius: 10,
    color: '#007AFF',
    fontSize: 15,
    fontWeight: 500,
    cursor: 'pointer',
    marginTop: 8,
    marginBottom: 16,
  },
  legalText: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
    lineHeight: 1.5,
    padding: '0 8px',
  },
  giftSection: {
    marginTop: 20,
    padding: '14px',
    background: 'rgba(255,215,0,0.08)',
    border: '1px solid rgba(255,215,0,0.3)',
    borderRadius: 12,
    marginBottom: 12,
  },
  giftTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#111',
    marginBottom: 4,
  },
  giftSub: {
    fontSize: 12,
    color: '#666',
    marginBottom: 10,
  },
  giftBtn: {
    width: '100%',
    padding: '10px 12px',
    background: '#F5A623',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  },
  activeHeader: {
    textAlign: 'center',
    padding: '24px 0 16px',
  },
  checkCircle: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    background: '#34C759',
    color: '#fff',
    fontSize: 26,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 12px',
  },
  activeTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: '#111',
    marginBottom: 6,
  },
  activeSub: {
    fontSize: 14,
    color: '#666',
    lineHeight: 1.4,
  },
};

export default NativeSubscriptionButtons;
