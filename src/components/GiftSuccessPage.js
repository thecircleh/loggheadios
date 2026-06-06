import React, { useEffect, useState } from "react";
import axios from "axios";
import { useSearchParams } from "react-router-dom";

export default function GiftSuccessPage() {
  const [params] = useSearchParams();
  const [gift, setGift] = useState(null);
  const [copied, setCopied] = useState(null); // which code was just copied

  useEffect(() => {
    const sessionId = params.get("session_id");
    if (!sessionId) return;

    axios
      .get(`/api/gifts/checkout-result`, { params: { session_id: sessionId } })
      .then((res) => setGift(res.data))
      .catch(() => alert("Could not load gift code(s)."));
  }, [params]);

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const copyAll = () => {
    navigator.clipboard.writeText(gift.codes.join("\n"));
    setCopied("all");
    setTimeout(() => setCopied(null), 2000);
  };

  if (!gift) return <p>Loading gift...</p>;

  const multiple = gift.codes.length > 1;

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: 20 }}>
      <h1>🎁 Gift{multiple ? "s" : ""} Purchased</h1>
      <p>
        Send {multiple ? "these codes" : "this code"} to the recipient
        {multiple ? "s" : ""}:
      </p>

      {gift.codes.map((code) => (
        <div
          key={code}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <code
            style={{
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: 1,
              background: "#F2F2F7",
              padding: "8px 14px",
              borderRadius: 10,
              flex: 1,
            }}
          >
            {code}
          </code>
          <button onClick={() => copyCode(code)}>
            {copied === code ? "Copied!" : "Copy"}
          </button>
        </div>
      ))}

      {multiple && (
        <button onClick={copyAll} style={{ marginTop: 6 }}>
          {copied === "all" ? "Copied all!" : "Copy All Codes"}
        </button>
      )}

      <p style={{ marginTop: 16, fontSize: 14, color: "#6B7280" }}>
        Recipients can redeem {multiple ? "their code" : "it"} from the Profile page.
      </p>
    </div>
  );
}