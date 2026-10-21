import Image from "next/image";

export default function Home() {
  return (
    <div className="home-page stack">
      <section className="hero">
        <div className="hero-text">
          <span className="eyebrow">Your stay at YMR 2026</span>
          <h1>Make yourself at home during the retreat.</h1>
          <p>Explore lodges, choose the apartments that suits you, and reserve your space in a few simple steps.</p>
          <div className="hero-actions">
            <a className="btn" href="/accommodation">Find accommodation</a>
            <a className="btn secondary" href="/check-booking">Manage a booking</a>
          </div>
          <div className="hero-trust"><span>Secure Your Accommodation</span><span>Real-Time 24/7 Support</span></div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-art-glow" />
          <Image src="/ymr-mark.png" alt="" width={240} height={360} priority className="hero-mark" />
          <span className="hero-art-caption">The City Takers!!!</span>
        </div>
      </section>
      <section className="home-steps" aria-label="How booking works">
        <article className="home-step"><span>01</span><h2>Choose an Apartment</h2><p>Browse available lodges for the retreat</p></article>
        <article className="home-step"><span>02</span><h2>Select your space</h2><p>Choose your desired shared or private apartment</p></article>
        <article className="home-step"><span>03</span><h2>Confirm your booking</h2><p>Enter your details to complete your reservation</p></article>
      </section>
      <section className="home-help">
        <div><span className="eyebrow">Need a hand?</span><h2>We&rsquo;re here to help with your stay.</h2></div>
        <a className="text-link" href="/support">Contact our team for real-time support <span aria-hidden="true">→</span></a>
      </section>
    </div>
  );
}
