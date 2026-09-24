import Image from "next/image";

export default function Home() {
  return (
    <div className="home-page stack">
      <section className="hero">
        <div className="hero-text">
          <span className="eyebrow">Your stay at YMR</span>
          <h1>Make yourself at home during the retreat.</h1>
          <p>Explore accommodation, choose the stay that suits you, and reserve your space in a few simple steps.</p>
          <div className="hero-actions">
            <a className="btn" href="/accommodation">Find accommodation</a>
            <a className="btn secondary" href="/check-booking">Manage a booking</a>
          </div>
          <div className="hero-trust"><span>Secure booking</span><span>Clear Naira pricing</span><span>Help when you need it</span></div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-art-glow" />
          <Image src="/ymr-mark.png" alt="" width={240} height={360} priority className="hero-mark" />
          <span className="hero-art-caption">Welcome to YMR</span>
        </div>
      </section>
      <section className="home-steps" aria-label="How booking works">
        <article className="home-step"><span>01</span><h2>Choose where to stay</h2><p>Browse lodges and accommodation options for the retreat.</p></article>
        <article className="home-step"><span>02</span><h2>Select your space</h2><p>Choose an available bedspace or private accommodation.</p></article>
        <article className="home-step"><span>03</span><h2>Confirm your booking</h2><p>Enter guest details and keep your booking reference handy.</p></article>
      </section>
      <section className="home-help">
        <div><span className="eyebrow">Need a hand?</span><h2>We&rsquo;re here to help with your stay.</h2></div>
        <a className="text-link" href="/support">Contact accommodation support <span aria-hidden="true">→</span></a>
      </section>
    </div>
  );
}
