import React, { useState } from "react";
import axios from "axios";

export default function GiftSubscriptionPage() {
  const [loading, setLoading] = useState(false);
  const [quantity, setQuantity] = useState(1);

  const buyGift = async (planType) => {
    setLoading(true);
    try {
      const res = await axios.post("/api/gifts/checkout", { planType, quantity });
      window.location.href = res.data.url;
    } catch (err) {
      alert(err.response?.data?.message || "Could not start checkout.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: 20 }}>
      <h1>Gift Loggerhead</h1>
      <p>Give a coach, parent, or player a year of Loggerhead.</p>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: 700, marginRight: 8 }}>Quantity</label>
        <select
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        {quantity > 1 && (
          <span style={{ marginLeft: 12, color: "#6B7280", fontSize: 14 }}>
            ${(59.99 * quantity).toFixed(2)} total
          </span>
        )}
      </div>

      <button disabled={loading} onClick={() => buyGift("loggerhead_annual")}>
        {loading
          ? "Redirecting…"
          : `Gift Loggerhead Annual${quantity > 1 ? ` ×${quantity}` : ""}`}
      </button>
    </div>
  );
}