interface Props {
  paymentStatus: "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "CANCELLED";
  accommodationStatus: "UNALLOCATED" | "ALLOCATED" | "CHECKED_IN" | "CHECKED_OUT" | "CANCELLED";
}

const STEPS = ["Reserved", "Paid", "Allocated", "Checked in", "Checked out"] as const;

/** A plain-language "where is my booking" tracker, since payment/accommodation status as raw enum labels weren't clear on their own. */
export function BookingStatusTracker({ paymentStatus, accommodationStatus }: Props) {
  if (paymentStatus === "CANCELLED" || accommodationStatus === "CANCELLED") {
    return (
      <div className="badge" style={{ background: "var(--color-danger-soft)", color: "var(--color-danger)", borderColor: "var(--color-danger)" }}>
        Cancelled
      </div>
    );
  }

  let currentStep = 0; // Reserved
  if (paymentStatus === "PAID") currentStep = 1;
  if (accommodationStatus === "ALLOCATED") currentStep = 2;
  if (accommodationStatus === "CHECKED_IN") currentStep = 3;
  if (accommodationStatus === "CHECKED_OUT") currentStep = 4;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }} role="list" aria-label="Booking status">
      {STEPS.map((label, i) => {
        const done = i <= currentStep;
        return (
          <span key={label} style={{ display: "flex", alignItems: "center", gap: "8px" }} role="listitem">
            <span
              className="badge"
              style={
                done
                  ? { background: "#FDF0E4", color: "var(--color-brand-strong)", borderColor: "#F5D9BC" }
                  : undefined
              }
            >
              {done ? "✓ " : ""}
              {label}
            </span>
            {i < STEPS.length - 1 && <span style={{ color: "var(--color-line)" }}>&rarr;</span>}
          </span>
        );
      })}
    </div>
  );
}
