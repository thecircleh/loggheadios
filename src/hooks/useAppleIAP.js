import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../components/AuthContext';
import { getApiUrl } from '../utils/getApiUrl';
import { APPLE_PRODUCT_IDS } from '../iap/appleProducts';

const isNativeApp = !!(window.Capacitor?.isNativePlatform?.());

// Wait for CdvPurchase (cordova-plugin-purchase) to be ready on the window
function waitForCdvPurchase(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      if (window.CdvPurchase?.store) return resolve(window.CdvPurchase);
      if (Date.now() > deadline) return reject(new Error('CdvPurchase not available'));
      setTimeout(check, 150);
    };
    check();
  });
}

export function useAppleIAP() {
  const { token, refreshUser } = useAuth();
  const [storeProducts, setStoreProducts] = useState({});
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const storeRef = useRef(null);
  const tokenRef = useRef(token);

  useEffect(() => { tokenRef.current = token; }, [token]);

  useEffect(() => {
    if (!isNativeApp) return;

    let cancelled = false;

    const init = async () => {
      let CdvPurchase;
      try {
        CdvPurchase = await waitForCdvPurchase();
      } catch (e) {
        if (!cancelled) setError('In-app purchases are not available on this device.');
        return;
      }

      const { store, ProductType, Platform } = CdvPurchase;
      storeRef.current = store;

      // Use string literals as fallbacks in case the plugin hasn't populated enums yet
      const APPSTORE   = Platform?.APPLE_APP_STORE   ?? 'ios-appstore';
      const SUB_TYPE   = ProductType?.PAID_SUBSCRIPTION ?? 'paid subscription';
      const CONS_TYPE  = ProductType?.CONSUMABLE        ?? 'consumable';

      // Register subscription products
      store.register([
        { id: APPLE_PRODUCT_IDS.weekly,      type: SUB_TYPE,  platform: APPSTORE },
        { id: APPLE_PRODUCT_IDS.monthly,     type: SUB_TYPE,  platform: APPSTORE },
        { id: APPLE_PRODUCT_IDS.sixMonth,    type: SUB_TYPE,  platform: APPSTORE },
        { id: APPLE_PRODUCT_IDS.annual,      type: SUB_TYPE,  platform: APPSTORE },
        { id: APPLE_PRODUCT_IDS.matchKey,    type: CONS_TYPE, platform: APPSTORE },
        { id: APPLE_PRODUCT_IDS.statbookKey, type: CONS_TYPE, platform: APPSTORE },
        { id: APPLE_PRODUCT_IDS.giftAnnual,  type: CONS_TYPE, platform: APPSTORE },
      ]);

      // Receipt validator — sends to our Node backend which calls Apple's API
      store.validator = async (receipt, callback) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        try {
          const res = await fetch(`${getApiUrl()}/api/billing/apple/verify-receipt`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${tokenRef.current}`,
            },
            body: JSON.stringify(receipt),
            signal: controller.signal,
          });
          if (!res.ok) {
            callback({ ok: false, code: CdvPurchase.ErrorCode.UNKNOWN, message: `HTTP ${res.status}` });
            return;
          }
          const data = await res.json();
          if (data.ok) {
            callback({ ok: true, data: data.data || {} });
          } else {
            callback({ ok: false, code: CdvPurchase.ErrorCode.PURCHASE_NOT_ALLOWED, message: data.error || 'Verification failed' });
          }
        } catch (err) {
          const msg = err.name === 'AbortError' ? 'Verification timed out' : `Network error: ${err.message}`;
          callback({ ok: false, code: CdvPurchase.ErrorCode.UNKNOWN, message: msg });
        } finally {
          clearTimeout(timeout);
        }
      };

      store.when()
        .approved((transaction) => {
          console.log('[IAP] approved', transaction.transactionId);
          transaction.verify();
        })
        .verified((receipt) => {
          console.log('[IAP] verified');
          receipt.finish();
          refreshUser();
          if (!cancelled) {
            setPurchasing(false);
            setRestoring(false);
            setError(null);
          }
        })
        .unverified((_receipt, err) => {
          console.warn('[IAP] unverified', err);
          const detail = err?.message || err?.code || JSON.stringify(err) || 'unknown';
          if (!cancelled) {
            setError(`Purchase verification failed: ${detail}`);
            setPurchasing(false);
            setRestoring(false);
          }
        });

      // Reflect loaded product prices in state
      store.when().productUpdated((product) => {
        if (cancelled) return;
        const offer = product.offers?.[0];
        const phase = offer?.pricingPhases?.[0];
        setStoreProducts(prev => ({
          ...prev,
          [product.id]: {
            id: product.id,
            title: product.title,
            description: product.description,
            price: phase?.price ?? null,
          },
        }));
      });

      try {
        await store.initialize([APPSTORE]);
        if (!cancelled) setInitialized(true);
      } catch (e) {
        if (!cancelled) setError('Failed to initialize the store: ' + e.message);
      }
    };

    init();
    return () => { cancelled = true; };
  }, []); // intentionally empty — only run once on mount

  const purchase = useCallback(async (productId) => {
    if (!storeRef.current || !initialized) return;
    setError(null);
    setPurchasing(true);
    try {
      const product = storeRef.current.get(productId, 'ios-appstore');
      if (!product) throw new Error('Product not found. Make sure it is registered in App Store Connect.');
      const offer = product.getOffer();
      if (!offer) throw new Error('No purchase offer available for this product.');
      await offer.order();
    } catch (err) {
      console.error('[IAP] purchase error', err);
      setError(err.message);
      setPurchasing(false);
    }
  }, [initialized]);

  const restore = useCallback(async () => {
    if (!storeRef.current || !initialized) return;
    setError(null);
    setRestoring(true);
    try {
      await storeRef.current.restorePurchases();
    } catch (err) {
      console.error('[IAP] restore error', err);
      setError(err.message);
      setRestoring(false);
    }
  }, [initialized]);

  return { storeProducts, purchase, restore, purchasing, restoring, error, initialized };
}
