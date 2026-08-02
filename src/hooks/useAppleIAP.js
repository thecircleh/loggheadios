import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../components/AuthContext';
import { getApiUrl } from '../utils/getApiUrl';
import { APPLE_PRODUCT_IDS } from '../iap/appleProducts';

const isNativeApp = !!(window.Capacitor?.isNativePlatform?.());

const lsKey = (userId) => `lh_native_gift_codes_${userId}`;

function loadFromStorage(userId) {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(lsKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveToStorage(userId, codes) {
  if (!userId) return;
  try {
    if (codes.length === 0) localStorage.removeItem(lsKey(userId));
    else localStorage.setItem(lsKey(userId), JSON.stringify(codes));
  } catch {}
}

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
  const { token, refreshUser, user } = useAuth();
  const [storeProducts, setStoreProducts] = useState({});
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const [pendingGiftCodes, setPendingGiftCodes] = useState([]);
  const storeRef = useRef(null);
  const tokenRef = useRef(token);
  const userIdRef = useRef(null);
  const hangGuardRef = useRef(null);

  useEffect(() => { tokenRef.current = token; }, [token]);
  useEffect(() => { userIdRef.current = user?.id ?? null; }, [user?.id]);

  // Load persisted codes when user logs in; clear state on logout (localStorage untouched)
  useEffect(() => {
    if (!user?.id) {
      setPendingGiftCodes([]);
      return;
    }
    const stored = loadFromStorage(user.id);
    if (stored.length > 0) setPendingGiftCodes(stored);
  }, [user?.id]);

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
          console.log('[IAP] validator server response:', JSON.stringify(data));
          if (data.ok) {
            if (data.data?.giftCodes?.length > 0) {
              const newCodes = data.data.giftCodes;
              setPendingGiftCodes(prev => {
                const updated = [...new Set([...prev, ...newCodes])];
                saveToStorage(userIdRef.current, updated);
                return updated;
              });
            }
            callback({ ok: true, data: data.data || {} });
          } else {
            console.error('[IAP] verification failed:', data.error);
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
          clearTimeout(hangGuardRef.current);
          receipt.finish();
          refreshUser();
          if (!cancelled) {
            setPurchasing(false);
            setRestoring(false);
            setError(null);
          }
        })
        .unverified((unverified, err) => {
          console.warn('[IAP] unverified full object:', JSON.stringify(unverified), err);
          clearTimeout(hangGuardRef.current);
          const detail = unverified?.payload?.message || err?.message || err?.code || JSON.stringify(err) || 'unknown';
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
    hangGuardRef.current = setTimeout(() => {
      setPurchasing(false);
      setError('Purchase timed out. If you were charged, tap Restore Purchases.');
    }, 90000);
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
      clearTimeout(hangGuardRef.current);
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

  const clearGiftCodes = useCallback(() => {
    saveToStorage(userIdRef.current, []);
    setPendingGiftCodes([]);
  }, []);

  return { storeProducts, purchase, restore, purchasing, restoring, error, initialized, pendingGiftCodes, clearGiftCodes };
}
