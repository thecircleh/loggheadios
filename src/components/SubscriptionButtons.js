import React, { useMemo } from "react";
import axios from "axios";
import { useAuth } from "./AuthContext";
import stripePrices from "./stripePrices";
import { getApiUrl } from "../utils/getApiUrl";
import { useAppleIAP } from "../hooks/useAppleIAP";
import { APPLE_SUBSCRIPTION_PLANS, APPLE_ONETIME_PRODUCTS, APPLE_PRODUCT_IDS } from "../iap/appleProducts";

const PER_MATCH_PRICE = 1.29;

const subscriptionOptions = [
  ...(stripePrices?.daily
    ? [
        {
          key: "daily",
          label: "Daily",
          priceText: "$1.49",
          subText: "Recurring daily access for short bursts.",
          badge: "Try it",
          priceId: stripePrices.daily,
          mode: "subscription",
        },
      ]
    : []),
  ...(stripePrices?.weekly
    ? [
        {
          key: "weekly",
          label: "Weekly",
          priceText: "$2.49",
          subText: "Recurring weekly access. Best for club weekends.",
          badge: "Most popular",
          featured: true,
          priceId: stripePrices.weekly,
          mode: "subscription",
          highlight: "Recurring",
        },
      ]
    : []),
  ...(stripePrices?.monthly
    ? [
        {
          key: "monthly",
          label: "Monthly",
          priceText: "$7.99",
          subText: "Recurring monthly access for regular logging.",
          badge: "Flexible",
          priceId: stripePrices.monthly,
          mode: "subscription",
          highlight: "Recurring",
        },
      ]
    : []),
  ...(stripePrices?.sixMonth
    ? [
        {
          key: "sixMonth",
          label: "6 Month",
          priceText: "$39.99",
          subText: "Recurring season-style access with less hassle.",
          badge: "Season",
          priceId: stripePrices.sixMonth,
          mode: "subscription",
          highlight: "Recurring",
        },
      ]
    : []),
  ...(stripePrices?.annual
    ? [
        {
          key: "annual",
          label: "Annual",
          priceText: "$59.99",
          subText: "Recurring annual access. Lowest long-term cost.",
          badge: "Best value",
          priceId: stripePrices.annual,
          mode: "subscription",
          highlight: "Recurring",
        },
      ]
    : []),
];

const getWeeklyAnchor = (planKey) => {
  if (planKey === "daily") return "Costly Weekly";	
  if (planKey === "weekly") return "= $2.49/week";
  if (planKey === "monthly") return "≈ $1.99/week";
  if (planKey === "sixMonth") return "≈ $1.54/week";
  if (planKey === "annual") return "≈ $1.15/week";
  return "";
};

const styles = {
  wrap: {
    marginTop: 28,
    borderRadius: 18,
    backgroundColor: "#ffffff",
    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.08)",
    padding: 22,
    maxWidth: 560,
    marginLeft: "auto",
    marginRight: "auto",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
    color: "#1C1C1E",
  },

  header: { marginBottom: 14 },
  headline: { fontSize: 28, fontWeight: 900, margin: 0, letterSpacing: -0.2 },
  subHeadline: { fontSize: 16, color: "#3A3A3C", marginTop: 8, lineHeight: 1.35 },

  pillRow: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 },
  pill: {
    fontSize: 12,
    fontWeight: 800,
    padding: "6px 10px",
    borderRadius: 999,
    background: "#F2F2F7",
    color: "#1C1C1E",
    border: "1px solid rgba(0,0,0,0.06)",
  },
  pillBlue: {
    background: "rgba(0,122,255,0.10)",
    border: "1px solid rgba(0,122,255,0.25)",
    color: "#0A84FF",
  },
  pillGreen: {
    background: "rgba(52,199,89,0.12)",
    border: "1px solid rgba(52,199,89,0.22)",
    color: "#1F7A35",
  },
  pillOrange: {
    background: "rgba(255,149,0,0.12)",
    border: "1px solid rgba(255,149,0,0.22)",
    color: "#B45309",
  },

  sectionTitle: {
    fontSize: 13,
    fontWeight: 900,
    color: "#8E8E93",
    letterSpacing: 0.25,
    marginTop: 18,
    marginBottom: 10,
    textTransform: "uppercase",
  },

  banner: {
    borderRadius: 16,
    padding: 14,
    marginTop: 14,
    marginBottom: 14,
    fontSize: 14,
    lineHeight: 1.4,
    fontWeight: 700,
  },
  bannerUsed: {
    background: "rgba(255,149,0,0.10)",
    border: "1px solid rgba(255,149,0,0.28)",
    color: "#7C4A03",
  },
  bannerWarning: {
    background: "rgba(0,122,255,0.08)",
    border: "1px solid rgba(0,122,255,0.24)",
    color: "#0A84FF",
  },
  bannerSavings: {
    background: "rgba(52,199,89,0.10)",
    border: "1px solid rgba(52,199,89,0.22)",
    color: "#1F7A35",
  },

  heroCard: {
    borderRadius: 16,
    padding: 16,
    background: "rgba(0,122,255,0.06)",
    border: "1px solid rgba(0,122,255,0.22)",
    marginTop: 14,
    marginBottom: 14,
  },
  heroTitle: { fontSize: 16, fontWeight: 900, marginBottom: 8 },
  heroText: { fontSize: 14, color: "#1C1C1E", lineHeight: 1.35, marginBottom: 10 },
  heroList: { paddingLeft: 18, margin: 0, lineHeight: 1.65, fontSize: 13 },

  warningCard: {
    borderRadius: 16,
    padding: 16,
    background: "rgba(255,149,0,0.10)",
    border: "1px solid rgba(255,149,0,0.28)",
    marginTop: 14,
    marginBottom: 14,
  },
  warningTitle: { fontSize: 15, fontWeight: 900, marginBottom: 8 },
  warningText: { fontSize: 13, color: "#1C1C1E", lineHeight: 1.35, margin: 0 },

  planButton: {
    width: "100%",
    borderRadius: 16,
    padding: 14,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "#fff",
    textAlign: "left",
    cursor: "pointer",
    boxShadow: "0 6px 16px rgba(0,0,0,0.06)",
    transition: "transform 120ms ease, box-shadow 120ms ease",
  },
  featured: {
    border: "1px solid rgba(0,122,255,0.40)",
    background: "rgba(0,122,255,0.07)",
    boxShadow: "0 10px 22px rgba(0,122,255,0.14)",
  },
  oneTimeCard: {
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(0,0,0,0.02)",
    boxShadow: "0 6px 16px rgba(0,0,0,0.05)",
  },
  topRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 6,
  },
  planName: { fontSize: 16, fontWeight: 900, marginBottom: 2 },
  price: { fontSize: 18, fontWeight: 950 },
  metaRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  subText: { fontSize: 13, color: "#3A3A3C", lineHeight: 1.25 },
  badge: {
    fontSize: 12,
    fontWeight: 900,
    padding: "6px 10px",
    borderRadius: 999,
    background: "#E5E5EA",
    color: "#1C1C1E",
    whiteSpace: "nowrap",
  },
  badgeFeatured: { background: "#007AFF", color: "#fff" },

  anchor: { fontSize: 12, fontWeight: 800, color: "#6B7280" },

  primaryCTA: {
    width: "100%",
    padding: "12px 16px",
    fontSize: 16,
    fontWeight: 900,
    backgroundColor: "#007AFF",
    color: "#fff",
    border: "none",
    borderRadius: 14,
    cursor: "pointer",
    boxShadow: "0 10px 18px rgba(0,122,255,0.22)",
    marginTop: 10,
  },
  manageCTA: {
    width: "100%",
    padding: "12px 16px",
    fontSize: 16,
    fontWeight: 900,
    backgroundColor: "#34C759",
    color: "#fff",
    border: "none",
    borderRadius: 14,
    cursor: "pointer",
    boxShadow: "0 10px 18px rgba(52,199,89,0.22)",
    marginBottom: 14,
  },

  finePrint: { fontSize: 12, color: "#8E8E93", lineHeight: 1.35, marginTop: 12 },

  compareWrap: {
    borderRadius: 16,
    overflow: "hidden",
    border: "1px solid rgba(0,0,0,0.10)",
    background: "#fff",
    boxShadow: "0 6px 16px rgba(0,0,0,0.06)",
    marginBottom: 14,
  },
  compareHeaderRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    background: "rgba(0,0,0,0.03)",
    borderBottom: "1px solid rgba(0,0,0,0.08)",
  },
  compareHeaderCell: {
    padding: "12px 12px",
    fontSize: 13,
    fontWeight: 900,
    color: "#1C1C1E",
  },
  compareHeaderCellRight: {
    padding: "12px 12px",
    fontSize: 13,
    fontWeight: 900,
    color: "#0A84FF",
    textAlign: "right",
  },
  compareRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    borderBottom: "1px solid rgba(0,0,0,0.06)",
  },
  compareCellLeft: {
    padding: "12px 12px",
    fontSize: 13,
    color: "#3A3A3C",
  },
  compareCellRight: {
    padding: "12px 12px",
    fontSize: 13,
    color: "#1C1C1E",
    fontWeight: 700,
    textAlign: "right",
  },
  compareFoot: {
    padding: "12px 12px",
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 1.35,
    background: "rgba(0,0,0,0.02)",
  },
};

const SubscriptionButtons = ({ isNative }) => {
  const auth = useAuth();
  const token = auth?.token;
  const { storeProducts, purchase, restore, purchasing, restoring, error: iapError, initialized, pendingGiftCodes, clearGiftCodes } = useAppleIAP();
  const user = auth?.user;
  const loading = auth?.loading;

  const derivedHasPremium =
    auth?.hasPremium ??
    ["active", "canceling"].includes(user?.subscription?.status) ??
    false;

  const hasPremium = !!derivedHasPremium;
  const volleyballRole = auth?.volleyballRole || user?.volleyballRole || "";

  const subStatus = user?.subscription?.status || null;
  const isActiveOrCanceling = ["active", "canceling"].includes(subStatus);

  const role = String(volleyballRole || "").toLowerCase();
  const showCoachTone = role === "coach" || role === "trainer";
  const showParentTone = role === "parent";
  const showPlayerTone = role === "player";

  const statbookUsage = Number(user?.dailyUsage?.statbook?.count || 0);
  const matchUsage = Number(user?.dailyUsage?.match?.count || 0);

  const statbookFreeUsed = statbookUsage >= 1;
  const matchFreeUsed = matchUsage >= 1;
  const allFreeUsed = statbookFreeUsed && matchFreeUsed;
  const oneFreeLeft = (statbookFreeUsed && !matchFreeUsed) || (!statbookFreeUsed && matchFreeUsed);

  const observedMatchesToday = Number(
    user?.matchesToday ??
      user?.usageToday ??
      user?.todayMatchCount ??
      0
  );

  const estimatedPerMatchSpend = observedMatchesToday > 0 ? observedMatchesToday * PER_MATCH_PRICE : 0;

  const cheapestRecurringPlan = useMemo(() => {
    if (stripePrices?.daily) return { price: 1.49, label: "Daily" };
    if (stripePrices?.weekly) return { price: 2.49, label: "Weekly" };
    if (stripePrices?.monthly) return { price: 7.99, label: "Monthly" };
    return null;
  }, []);

  const savingsVsPerMatch = useMemo(() => {
    if (!cheapestRecurringPlan || estimatedPerMatchSpend <= 0) return 0;
    return Math.max(0, estimatedPerMatchSpend - cheapestRecurringPlan.price);
  }, [estimatedPerMatchSpend, cheapestRecurringPlan]);

  const activePlanLabel = useMemo(() => {
    if (hasPremium) return "Premium";
    return "Subscription";
  }, [hasPremium]);

const headline = useMemo(() => {
  if (hasPremium) {
    if (showCoachTone) return "You’re on Premium. Coach without interruptions.";
    if (showParentTone) return "You’re on Premium. Watch more. Tap less.";
    if (showPlayerTone) return "You’re on Premium. Keep the full picture.";
    return "You’re on Premium.";
  }

  if (showCoachTone) return "Choose how you want to stay in the match.";
  if (showParentTone) return "Keep statting without missing the match.";
  if (showPlayerTone) return "Track more. Review more. Improve more.";
  return "Choose the access model that fits your day.";
}, [hasPremium, showCoachTone, showParentTone, showPlayerTone]);

const subHeadline = useMemo(() => {
  if (hasPremium) {
    if (showCoachTone) {
      return "Premium is your recurring subscription for unlimited matches. Manage or cancel anytime.";
    }
    if (showParentTone) {
      return "Premium is your recurring subscription for unlimited matches, so you never have to stop and decide mid-match.";
    }
    if (showPlayerTone) {
      return "Premium is your recurring subscription for unlimited matches and cleaner long-term tracking.";
    }
    return "Premium is a recurring subscription. Manage or cancel anytime.";
  }

  if (showCoachTone) {
    return "Coaches Corner is free. Buy one match at a time for $1.29, or choose a recurring Premium plan for unlimited logging.";
  }
  if (showParentTone) {
    return "Coaches Corner is free. Pay $1.29 only when you need one more match, or choose a recurring Premium plan so the day never gets interrupted.";
  }
  if (showPlayerTone) {
    return "Coaches Corner is free. Use one-time match access for $1.29, or choose recurring Premium for unlimited tracking.";
  }
  return "Coaches Corner is free. Choose recurring Premium for unlimited matches, or buy one-time match access for $1.29 when you need it.";
}, [hasPremium, showCoachTone, showParentTone, showPlayerTone]);

const lossAversionBlock = useMemo(() => {
  if (hasPremium) return null;

  if (showCoachTone) {
    return {
      title: "What coaches lose staying free",
      text:
        "The worst time to hit a limit is when the set gets tactical. Premium keeps your workflow alive when momentum is shifting.",
    };
  }

  if (showParentTone) {
    return {
      title: "What parents lose staying free",
      text:
        "The more often you stop to make a payment decision, the more of the match you miss. Premium keeps your eyes on the court.",
    };
  }

  if (showPlayerTone) {
    return {
      title: "What players lose staying free",
      text:
        "Incomplete match data leads to incomplete feedback. Premium helps you keep the whole story, not just part of it.",
    };
  }

  return {
    title: "What you lose staying free",
    text:
      "Free gets you started. Premium keeps the day moving when the schedule gets longer than expected.",
  };
}, [hasPremium, showCoachTone, showParentTone, showPlayerTone]);

const premiumValueStack = useMemo(() => {
  if (showCoachTone) {
    return [
      "Recurring subscription with unlimited Stat Book matches",
      "Recurring subscription with unlimited Match Tracking matches",
      "No mid-day paywall decisions",
      "Collaborative workflows when someone else is helping",
      "Full dashboards and breakdowns",
      "Ad-free experience",
    ];
  }

  if (showParentTone) {
    return [
      "Recurring subscription with unlimited matches",
      "Less stop-and-pay friction during long days",
      "Cleaner, faster logging",
      "Ad-free experience",
      "Collaborative help from another parent",
      "Better post-match visibility",
    ];
  }

  if (showPlayerTone) {
    return [
      "Recurring subscription with unlimited matches",
      "More complete tracking over time",
      "Cleaner review and trend visibility",
      "Ad-free experience",
      "Collaborative workflows",
      "Less interruption, more consistency",
    ];
  }

  return [
    "Recurring subscription with unlimited matches",
    "No per-match decisions",
    "Collaborative logging",
    "Full dashboards and breakdowns",
    "Ad-free experience",
    "Cleaner workflows all day",
  ];
}, [showCoachTone, showParentTone, showPlayerTone]);

  const handleSubscribe = async (priceId, mode) => {
    try {
      const res = await axios.post(
        `${getApiUrl()}/api/billing/create-checkout-session`,
        { priceId, mode },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      window.location.href = res.data.url;
    } catch (err) {
      console.error("Checkout error:", err.response?.data || err.message);
      alert(`Checkout failed: ${err.response?.data?.error || err.message}`);
    }
  };

  const handleMatchKeyPurchase = async (matchMode) => {
    try {
      const res = await axios.post(
        `${getApiUrl()}/api/billing/create-checkout-session`,
        {
          purchaseType: "match_key",
          matchMode,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      window.location.href = res.data.url;
    } catch (err) {
      console.error("Match key checkout error:", err.response?.data || err.message);
      alert(`Checkout failed: ${err.response?.data?.error || err.message}`);
    }
  };

  const redirectToBillingPortal = async () => {
    try {
      const res = await axios.post(
        `${getApiUrl()}/api/billing/customer-portal`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      window.location.href = res.data.url;
    } catch (err) {
      console.error("Portal redirect failed:", err.response?.data || err.message);
      alert(`Unable to open billing portal: ${err.response?.data?.error || err.message}`);
    }
  };
  
  const [giftQuantity, setGiftQuantity] = React.useState(1);

  const handleGiftPurchase = async (planType) => {
    try {
      const res = await axios.post(
        `${getApiUrl()}/api/gifts/checkout`,
        { planType, quantity: giftQuantity },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      window.location.href = res.data.url;
    } catch (err) {
      console.error("Gift checkout error:", err.response?.data || err.message);
      alert(`Gift checkout failed: ${err.response?.data?.message || err.message}`);
    }
  };

  const quickCtaPlan = useMemo(() => {
    return subscriptionOptions.find((p) => p.key === "weekly") || subscriptionOptions[0];
  }, []);

  if (loading) {
    return (
      <div style={styles.wrap}>
        <div style={styles.header}>
          <h2 style={styles.headline}>Loading…</h2>
          <div style={styles.subHeadline}>Checking your access.</div>
        </div>
      </div>
    );
  }

  if (isNative) {
    const busy = purchasing || restoring;
    const btnBase = {
      display: "block", width: "100%", padding: "14px 16px", borderRadius: 12,
      border: "none", fontSize: 16, fontWeight: 700, cursor: busy ? "default" : "pointer",
      marginBottom: 10, opacity: busy ? 0.6 : 1,
    };
    return (
      <div style={styles.wrap}>
        <div style={styles.header}>
          <h2 style={styles.headline}>{hasPremium ? "You're on Premium." : "Subscribe"}</h2>
          <div style={styles.subHeadline}>
            {hasPremium
              ? "Manage or cancel your subscription in iOS Settings → Apple ID → Subscriptions."
              : "Choose a plan. Billed through Apple. Cancel anytime in iOS Settings."}
          </div>
        </div>

        {iapError && (
          <div style={{ ...styles.banner, background: "rgba(255,59,48,0.08)", border: "1px solid rgba(255,59,48,0.25)", color: "#c00", marginBottom: 12 }}>
            {iapError}
          </div>
        )}

        {!hasPremium && (
          <>
            <div style={styles.sectionTitle}>Subscriptions</div>
            {APPLE_SUBSCRIPTION_PLANS.map(plan => {
              const live = storeProducts[plan.productId];
              return (
                <button
                  key={plan.key}
                  disabled={busy || !initialized}
                  onClick={() => purchase(plan.productId)}
                  style={{ ...btnBase, background: plan.featured ? "#34C759" : "#F2F2F7", color: plan.featured ? "#fff" : "#1C1C1E" }}
                >
                  {plan.label} — {live?.price ?? plan.fallbackPrice}
                  {plan.badge ? `  ·  ${plan.badge}` : ""}
                </button>
              );
            })}

            <div style={styles.sectionTitle}>One-Time Access</div>
            {APPLE_ONETIME_PRODUCTS.map(prod => {
              const live = storeProducts[prod.productId];
              return (
                <button
                  key={prod.key}
                  disabled={busy || !initialized}
                  onClick={() => purchase(prod.productId)}
                  style={{ ...btnBase, background: "#F2F2F7", color: "#1C1C1E" }}
                >
                  {prod.label} — {live?.price ?? prod.fallbackPrice}
                </button>
              );
            })}
          </>
        )}

        <button
          disabled={busy}
          onClick={restore}
          style={{ ...btnBase, background: "transparent", color: "#007AFF", border: "1px solid rgba(0,122,255,0.3)", marginTop: 8 }}
        >
          {restoring ? "Restoring…" : "Restore Purchases"}
        </button>

        {purchasing && (
          <div style={{ textAlign: "center", color: "#8E8E93", fontSize: 14, marginTop: 8 }}>
            Processing purchase…
          </div>
        )}

        {/* Gift codes revealed after IAP purchase */}
        {pendingGiftCodes.length > 0 && (
          <div style={{ marginTop: 20, padding: 14, background: "rgba(255,215,0,0.08)", border: "1px solid rgba(255,215,0,0.3)", borderRadius: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 4 }}>Gift Purchase Successful</div>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>
              Share {pendingGiftCodes.length > 1 ? "these codes" : "this code"} with the recipient{pendingGiftCodes.length > 1 ? "s" : ""}:
            </div>
            {pendingGiftCodes.map((code) => (
              <div key={code} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1, fontFamily: "monospace", fontSize: 15, fontWeight: 700, background: "#fff", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 8, padding: "8px 12px", letterSpacing: 1 }}>{code}</div>
                <button
                  onClick={() => navigator.clipboard?.writeText(code)}
                  style={{ padding: "8px 12px", background: "#007AFF", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                >Copy</button>
              </div>
            ))}
            {pendingGiftCodes.length > 1 && (
              <button
                onClick={() => navigator.clipboard?.writeText(pendingGiftCodes.join("\n"))}
                style={{ width: "100%", padding: "10px", background: "#34C759", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 8 }}
              >Copy All Codes</button>
            )}
            <button
              onClick={clearGiftCodes}
              style={{ width: "100%", padding: "10px", background: "none", border: "1px solid #ccc", borderRadius: 8, fontSize: 14, color: "#666", cursor: "pointer" }}
            >Done</button>
          </div>
        )}

        {/* Gift purchase via Apple IAP */}
        <div style={{ marginTop: 20, padding: 14, background: "rgba(255,215,0,0.08)", border: "1px solid rgba(255,215,0,0.3)", borderRadius: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 4 }}>Gift Loggerhead</div>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>
            Buy a gift code and share it with a coach, parent, or player.
          </div>
          <button
            disabled={purchasing || !initialized}
            onClick={() => purchase(APPLE_PRODUCT_IDS.giftAnnual)}
            style={{ width: "100%", padding: "12px 14px", background: "#F5A623", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: (purchasing || !initialized) ? "default" : "pointer", opacity: (purchasing || !initialized) ? 0.6 : 1 }}
          >
            {purchasing ? "Processing…" : !initialized ? "Loading…" : `Gift Annual — ${storeProducts[APPLE_PRODUCT_IDS.giftAnnual]?.price ?? "$59.99"}`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <h2 style={styles.headline}>{headline}</h2>
        <div style={styles.subHeadline}>{subHeadline}</div>

        <div style={styles.pillRow}>
          <div style={{ ...styles.pill, ...styles.pillGreen }}>
            Coaches Corner is free
          </div>
          <div style={{ ...styles.pill, ...styles.pillBlue }}>
            Premium plans are recurring
          </div>
          <div style={{ ...styles.pill, ...styles.pillOrange }}>
            Per match is one-time
          </div>
        </div>
      </div>

{!hasPremium && oneFreeLeft && (
  <div style={{ ...styles.banner, ...styles.bannerWarning }}>
    {showCoachTone && "You’re about to hit your free daily limit. If this turns into a long day, Premium removes the interruption."}
    {showParentTone && "You’re about to hit your free daily limit. If there’s one more match, Premium keeps you from stopping to decide."}
    {showPlayerTone && "You’re about to hit your free daily limit. Premium keeps your tracking complete if the day keeps going."}
    {showOtherTone && "You’re about to hit your free daily limit. Premium keeps the day moving without extra decisions."}
  </div>
)}

{!hasPremium && allFreeUsed && (
  <div style={{ ...styles.banner, ...styles.bannerUsed }}>
    {showCoachTone && "You’ve used today’s free matches. Buy one more for $1.29, or switch to recurring Premium for unlimited access."}
    {showParentTone && "You’ve used today’s free matches. Buy one more for $1.29, or switch to recurring Premium so the match never gets interrupted."}
    {showPlayerTone && "You’ve used today’s free matches. Buy one more for $1.29, or switch to recurring Premium for unlimited tracking."}
    {showOtherTone && "You’ve used today’s free matches. Buy one more for $1.29, or switch to recurring Premium for unlimited matches."}
  </div>
)}

      {!hasPremium && savingsVsPerMatch > 0 && cheapestRecurringPlan && (
        <div style={{ ...styles.banner, ...styles.bannerSavings }}>
          You’ve already spent the equivalent of ${estimatedPerMatchSpend.toFixed(2)} in per-match access today.
          {` ${cheapestRecurringPlan.label}`} would have been ${cheapestRecurringPlan.price.toFixed(2)}.
          {` You’d be ahead by $${savingsVsPerMatch.toFixed(2)}.`}
        </div>
      )}

      {isActiveOrCanceling && (
        <button onClick={redirectToBillingPortal} style={styles.manageCTA}>
          Manage {activePlanLabel}
        </button>
      )}

      {!hasPremium && quickCtaPlan && (
        <div style={styles.heroCard}>
          <div style={styles.heroTitle}>Premium is for people who do not want to think about limits.</div>
          <div style={styles.heroText}>
            Premium is a recurring subscription. It renews automatically until canceled. In return, you get unlimited access instead of paying one match at a time.
          </div>
          <ul style={styles.heroList}>
            <li>Unlimited Stat Book matches</li>
            <li>Unlimited Match Tracking matches</li>
            <li>No $1.29 decisions during the day</li>
            <li>Ad-free workflows</li>
          </ul>

          <button
            onClick={() => handleSubscribe(quickCtaPlan.priceId, quickCtaPlan.mode)}
            style={styles.primaryCTA}
          >
            Start Recurring Premium ({quickCtaPlan.label})
          </button>

          <div style={styles.finePrint}>
            These plans renew automatically until canceled.
          </div>
        </div>
      )}

      {!hasPremium && lossAversionBlock && (
        <div style={styles.warningCard}>
          <div style={styles.warningTitle}>{lossAversionBlock.title}</div>
          <p style={styles.warningText}>{lossAversionBlock.text}</p>
        </div>
      )}

      {!hasPremium && (
        <div style={styles.heroCard}>
          <div style={styles.heroTitle}>Premium gives you:</div>
          <div style={styles.heroText}>
            This is the recurring option for people who expect to log more than just a couple of matches.
          </div>
          <ul style={styles.heroList}>
            {premiumValueStack.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <div style={styles.finePrint}>
            Most people start weekly. Heavy users usually move to annual.
          </div>
        </div>
      )}

      {!hasPremium && (
        <>
          <div style={styles.sectionTitle}>Free vs Premium</div>

          <div style={styles.compareWrap}>
            <div style={styles.compareHeaderRow}>
              <div style={styles.compareHeaderCell}>Free / Per Match</div>
              <div style={styles.compareHeaderCellRight}>Recurring Premium</div>
            </div>

            <div style={styles.compareRow}>
              <div style={styles.compareCellLeft}>1 free Stat Book match per day</div>
              <div style={styles.compareCellRight}>Unlimited Stat Book matches</div>
            </div>

            <div style={styles.compareRow}>
              <div style={styles.compareCellLeft}>1 free Match Tracking match per day</div>
              <div style={styles.compareCellRight}>Unlimited Match Tracking matches</div>
            </div>

            <div style={styles.compareRow}>
              <div style={styles.compareCellLeft}>$1.29 one-time per extra match</div>
              <div style={styles.compareCellRight}>No per-match charges</div>
            </div>

            <div style={styles.compareRow}>
              <div style={styles.compareCellLeft}>One-time purchases do not renew</div>
              <div style={styles.compareCellRight}>Recurring subscription renews automatically</div>
            </div>

            <div style={styles.compareRow}>
              <div style={styles.compareCellLeft}>Manual choice each time</div>
              <div style={styles.compareCellRight}>Set it and forget it</div>
            </div>

            <div style={styles.compareFoot}>
              Free gets you started. Per match gets you through one more match. Premium is the recurring option for unlimited access.
            </div>
          </div>
        </>
      )}

      <div style={styles.sectionTitle}>
        {hasPremium ? "Your Premium Subscription" : "Recurring Premium Plans"}
      </div>

      {!hasPremium && (
        <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 10 }}>
          These plans renew automatically until canceled.
        </div>
      )}

      {subscriptionOptions.map((opt) => {
        const isFeatured = !!opt.featured;
        const anchor = getWeeklyAnchor(opt.key);

        const onClick = hasPremium
          ? redirectToBillingPortal
          : () => handleSubscribe(opt.priceId, opt.mode);

        return (
          <button
            key={opt.priceId}
            onClick={onClick}
            style={{
              ...styles.planButton,
              ...(isFeatured ? styles.featured : {}),
              marginBottom: 12,
            }}
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.99)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            <div style={styles.topRow}>
              <div>
                <div style={styles.planName}>{opt.label}</div>
                <div style={styles.anchor}>
                  {hasPremium
                    ? "Manage billing / change plan"
                    : `${anchor || opt.highlight} • Recurring`}
                </div>
              </div>

              <div style={styles.price}>{hasPremium ? "Manage" : opt.priceText}</div>
            </div>

            <div style={styles.metaRow}>
              <div style={styles.subText}>
                {hasPremium ? "Update billing, cancel, or switch plans." : opt.subText}
              </div>
              {opt.badge ? (
                <div style={{ ...styles.badge, ...(isFeatured ? styles.badgeFeatured : {}) }}>
                  {opt.badge}
                </div>
              ) : null}
            </div>
          </button>
        );
      })}

      {!hasPremium && (
        <>
          <div style={styles.sectionTitle}>One-Time Match Access</div>

          <div
            style={{
              ...styles.heroCard,
              background: "rgba(0,0,0,0.03)",
              border: "1px solid rgba(0,0,0,0.08)",
            }}
          >
            <div style={styles.heroTitle}>Buy only what you need.</div>
            <div style={styles.heroText}>
              Per-match access is a one-time purchase. It does not renew. It is for the days when you need just one more match.
            </div>

            <button
              onClick={() => handleMatchKeyPurchase("statbook")}
              style={{ ...styles.planButton, ...styles.oneTimeCard, marginBottom: 10 }}
            >
              <div style={styles.topRow}>
                <div>
                  <div style={styles.planName}>Stat Book Match (One-Time)</div>
                  <div style={styles.anchor}>No subscription • No renewal</div>
                </div>
                <div style={styles.price}>$1.29</div>
              </div>
              <div style={styles.subText}>
                One extra Stat Book match. Pay once. Done.
              </div>
            </button>

            <button
              onClick={() => handleMatchKeyPurchase("match")}
              style={{ ...styles.planButton, ...styles.oneTimeCard }}
            >
              <div style={styles.topRow}>
                <div>
                  <div style={styles.planName}>Match Tracking (One-Time)</div>
                  <div style={styles.anchor}>No subscription • No renewal</div>
                </div>
                <div style={styles.price}>$1.29</div>
              </div>
              <div style={styles.subText}>
                One extra Match Tracking session. Pay once. Done.
              </div>
            </button>

            <div style={styles.finePrint}>
              This is a one-time purchase. It does not renew.
              <br />
              Premium is a recurring subscription for unlimited matches.
            </div>
          </div>
        </>
      )}

<div style={styles.sectionTitle}>
  Gift Loggerhead
</div>

<div
  style={{
    ...styles.heroCard,
    background: "rgba(255,215,0,0.08)",
    border: "1px solid rgba(255,215,0,0.25)",
  }}
>
  <div style={styles.heroTitle}>
    🎁 Give Loggerhead as a Gift
  </div>

  <div style={styles.heroText}>
    Know a coach, parent, or player who would benefit from Loggerhead?
    Purchase a gift subscription and send them a redemption code.
  </div>

  <div style={{ marginBottom: 12 }}>
    <label style={{ fontSize: 13, fontWeight: 700, marginRight: 8, color: "#1C1C1E" }}>
      Quantity
    </label>
    <select
      value={giftQuantity}
      onChange={(e) => setGiftQuantity(Number(e.target.value))}
      style={{
        fontSize: 14,
        fontWeight: 700,
        padding: "4px 8px",
        borderRadius: 8,
        border: "1px solid rgba(0,0,0,0.15)",
        background: "#fff",
        cursor: "pointer",
      }}
    >
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
        <option key={n} value={n}>{n}</option>
      ))}
    </select>
    {giftQuantity > 1 && (
      <span style={{ marginLeft: 10, fontSize: 13, color: "#6B7280" }}>
        ${(59.99 * giftQuantity).toFixed(2)} total
      </span>
    )}
  </div>

  <button
    onClick={() => handleGiftPurchase("loggerhead_annual")}
    style={styles.planButton}
  >
    <div style={styles.topRow}>
      <div>
        <div style={styles.planName}>
          Gift Loggerhead Annual{giftQuantity > 1 ? ` ×${giftQuantity}` : ""}
        </div>
        <div style={styles.anchor}>
          One-time purchase • Gift code{giftQuantity > 1 ? "s" : ""}
        </div>
      </div>

      <div style={styles.price}>
        ${giftQuantity > 1 ? `${(59.99 * giftQuantity).toFixed(2)}` : "59.99"}
      </div>
    </div>
  </button>
</div>


      <div style={styles.finePrint}>
        Coaches Corner is free.
        <br />
        Premium plans are recurring subscriptions.
        <br />
        Per-match access is a one-time $1.29 purchase.
      </div>
    </div>
  );
};

export default SubscriptionButtons;