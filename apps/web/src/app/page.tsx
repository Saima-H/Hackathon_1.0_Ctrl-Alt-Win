import Link from "next/link";

const signalPoints = [
  { label: "Banjara Hills", top: "18%", left: "64%", tone: "critical" },
  { label: "Ameerpet", top: "39%", left: "42%", tone: "warning" },
  { label: "HITEC City", top: "58%", left: "22%", tone: "safe" },
  { label: "Charminar", top: "72%", left: "68%", tone: "warning" },
];

export default function Page() {
  return (
    <main className="hero">
      <div className="hero-grid" aria-hidden="true" />
      <div className="hero-vehicle" aria-hidden="true">
        <span className="vehicle-shadow" />
        <span className="vehicle-body" />
        <span className="vehicle-cabin" />
        <span className="vehicle-scan" />
      </div>
      <nav className="hero-nav">
        <Link className="hero-brand" href="/">
          Civic<span>Safety</span>
        </Link>
        <div className="hero-nav-actions">
          <Link href="/login?portal=ghmc&force=1">GHMC</Link>
          <Link href="/login?force=1">Citizen</Link>
        </div>
      </nav>

      <section className="hero-main">
        <div className="hero-copy">
          <div className="overline">Civic safety intelligence / Hyderabad</div>
          <h1 className="display">
            Streets that
            <span> respond.</span>
          </h1>
          <p>
            Report civic hazards, route around risk, and give GHMC teams a live
            operating picture of the city.
          </p>
          <div className="hero-actions">
            <Link className="btn red" href="/login?force=1">
              Enter citizen portal
            </Link>
            <Link className="btn command" href="/login?portal=ghmc&force=1">
              <span />
              Open command center
            </Link>
            <Link className="btn ghost" href="/logout">
              Switch account
            </Link>
          </div>
        </div>

        <div className="city-cockpit" aria-label="CivicSafety city intelligence preview">
          <div className="drone-orbit" aria-hidden="true">
            <span />
          </div>
          <div className="cockpit-topline">
            <span>Live civic layer</span>
            <b>87%</b>
          </div>
          <div className="city-map-visual">
            <span className="route-line route-line-one" />
            <span className="route-line route-line-two" />
            <span className="route-line route-line-three" />
            {signalPoints.map((point) => (
              <span
                className={`signal signal-${point.tone}`}
                key={point.label}
                style={{ top: point.top, left: point.left }}
              >
                <i />
                <b>{point.label}</b>
              </span>
            ))}
          </div>
          <div className="cockpit-metrics">
            <div>
              <span>Reports</span>
              <b>1,284</b>
            </div>
            <div>
              <span>Avg. SLA</span>
              <b>18h</b>
            </div>
            <div>
              <span>Safe route</span>
              <b>+42%</b>
            </div>
          </div>
        </div>
      </section>

      <section className="hero-strip" aria-label="Platform highlights">
        <div>
          <span>01</span>
          <b>Citizen reporting</b>
        </div>
        <div>
          <span>02</span>
          <b>Ward safety scores</b>
        </div>
        <div>
          <span>03</span>
          <b>GHMC operations</b>
        </div>
        <div>
          <span>04</span>
          <b>Live route risk</b>
        </div>
      </section>
    </main>
  );
}
