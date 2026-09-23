export default function Home() {
  return (
    <div className="hero">
      <div className="hero-text">
        <h1>YMR 2026 accommodation</h1>
        <p>Book your bed or private room for the Young Ministers Retreat. Booking opens soon.</p>
        <p>
          <a className="btn" href="/accommodation">See accommodation</a>{" "}
          <a className="btn secondary" href="/check-booking">Check my booking</a>
        </p>
      </div>
      <img src="/ymr-mark.png" alt="" className="hero-mark" aria-hidden="true" />
    </div>
  );
}
