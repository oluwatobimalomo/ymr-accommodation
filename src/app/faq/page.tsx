const FAQS: [string, string][] = [
  ["How do I book accommodation?", "Go to Accommodation, choose a lodge and category, select your bedspace or unit, and fill in occupant details."],
  ["I paid, but haven't received confirmation. What do I do?", "Use Check my booking with your reference and phone number, or contact Support with your reference."],
  ["Can I choose who I share a room with?", "If a category lets you pick your bedspace, coordinate with your group to each select spaces in the same room."],
  ["Can I change my booking after paying?", "Contact Support with your booking reference — reallocations are handled by the accommodation team."],
  ["What do I need at check-in?", "Your booking reference and a valid ID matching the occupant name on the booking."],
];

export const metadata = { title: "FAQ" };

export default function FaqPage() {
  return (
    <div className="stack">
      <h1>Frequently asked questions</h1>
      {FAQS.map(([q, a]) => (
        <div key={q} className="card stack">
          <h3 style={{ margin: 0 }}>{q}</h3>
          <p style={{ margin: 0 }}>{a}</p>
        </div>
      ))}
    </div>
  );
}
