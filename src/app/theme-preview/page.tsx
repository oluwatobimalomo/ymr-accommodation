import { BedspaceDemo } from "@/components/BedspaceDemo";

export const metadata = { title: "Theme preview" };

export default function ThemePreview() {
  return (
    <div className="stack">
      <h1>Theme preview</h1>
      <p>Internal page for checking tokens and components against the YMR brand. Remove before launch.</p>

      <section className="card stack" aria-labelledby="beds">
        <h2 id="beds">Bedspace states</h2>
        <p>Every state has its own icon and text label, so it stays clear without color.</p>
        <BedspaceDemo />
      </section>

      <section className="card stack" aria-labelledby="ctl">
        <h2 id="ctl">Controls</h2>
        <p><a className="btn" href="#ctl">Primary action</a> <a className="btn secondary" href="#ctl">Secondary action</a></p>
        <div className="field">
          <label htmlFor="demo">Full name</label>
          <input id="demo" name="demo" autoComplete="name" />
        </div>
      </section>
    </div>
  );
}
