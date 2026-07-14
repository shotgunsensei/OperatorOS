import { FormEvent, useMemo, useState } from "react";
import { ArrowRight, Bookmark, Bot, Check, CircleGauge, Heart, Home, LogOut, MessageCircle, MoreHorizontal, PackageSearch, Plus, ShieldCheck, Store, Wrench, X } from "lucide-react";

export type TorqueShedUser = {
  id: string;
  displayName: string;
  email: string;
  platformRole: string;
  tenant: { id: string; slug: string | null; name: string; role: string | null };
} | null;
type View = "community" | "diagnose" | "builds" | "market" | "garage";

const operatorOsLoginUrl = `https://auth.operatoros.net/login?next=${encodeURIComponent("https://app.operatoros.net/app")}`;

const buildPosts = [
  {
    id: 1,
    type: "BUILD LOG",
    author: "Maya R.",
    handle: "@boosted_maya",
    avatar: "MR",
    time: "24 min ago",
    title: "The $900 junkyard K24 finally made boost",
    excerpt:
      "First start, first leak, and the one fitting I should have replaced before dropping the subframe. Full parts list and base map notes inside.",
    vehicle: "1994 Honda Civic CX",
    meta: "K24A2 · 8 PSI · 287 WHP",
    likes: 418,
    replies: 63,
    color: "copper",
    image: "/marketplace/efi-controller-source.jpg",
    imageAlt: "Polished performance engine and intake hardware in a workshop",
  },
  {
    id: 2,
    type: "HOW-TO",
    author: "Derek Cole",
    handle: "@backyard_diesel",
    avatar: "DC",
    time: "1 hr ago",
    title: "Diagnosing rail-pressure drop without firing the parts cannon",
    excerpt:
      "A repeatable five-test workflow using scan data, a multimeter, and a $20 return-flow kit. Includes normal ranges and failure patterns.",
    vehicle: "2006 Ram 2500",
    meta: "5.9 Cummins · 312K miles",
    likes: 231,
    replies: 41,
    color: "steel",
    image: "/marketplace/ls-engine-mounts-source.jpg",
    imageAlt: "Mechanic working beside an exposed performance engine",
  },
  {
    id: 3,
    type: "PROJECT UPDATE",
    author: "Toni Alvarez",
    handle: "@garageghost",
    avatar: "TA",
    time: "3 hrs ago",
    title: "Long-travel Ranger: mockup day and three hard lessons",
    excerpt:
      "Cycling 17 inches of travel exposed a tie-rod problem nobody mentions. Here are the clearance photos and revised pickup points.",
    vehicle: "2001 Ford Ranger Edge",
    meta: "4.0 SOHC · 2WD · 17in travel",
    likes: 187,
    replies: 29,
    color: "sand",
    image: "/marketplace/high-steer-source.jpg",
    imageAlt: "Close-up of throttle body and intake components",
  },
];

const listings = [
  { id: 1, title: "Ported V8 cylinder head assembly", price: "$685", type: "SELL", seller: "Arc & Anvil", rating: "4.9", protected: true, image: "/marketplace/ls-engine-mounts-source.jpg", imageAlt: "Mechanic servicing a performance cylinder head in a garage", credit: "Febri Laksono / Pexels" },
  { id: 2, title: "Polished V8 intake & EFI setup", price: "$950", type: "TRADE", seller: "Nate's Garage", rating: "4.8", protected: true, image: "/marketplace/efi-controller-source.jpg", imageAlt: "Polished red and chrome V8 engine intake", credit: "David McElwee / Pexels" },
  { id: 3, title: "Timing service hardware set", price: "$142", type: "SELL", seller: "LayerShift", rating: "5.0", protected: false, image: "/marketplace/gauge-pod-source.jpg", imageAlt: "Close-up of automotive timing gears and chain", credit: "Herbert Santos / Pexels" },
  { id: 4, title: "LS throttle-body assembly", price: "$320", type: "BUY / TRADE", seller: "Trail Rat", rating: "4.7", protected: true, image: "/marketplace/high-steer-source.jpg", imageAlt: "Dark performance throttle-body and intake assembly", credit: "Laython Photos / Pexels" },
];

const trending = [
  ["#fabrication", "2.8k posts"],
  ["#k-swap", "1.9k posts"],
  ["#obd2", "1.4k posts"],
  ["#trailbuild", "982 posts"],
];

function initials(value: string) {
  return value
    .split(/\s|@|\./)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function TorqueShedApp({ user, onSignOut }: { user: TorqueShedUser; onSignOut: () => Promise<void> }) {
  const [view, setView] = useState<View>("community");
  const [feedFilter, setFeedFilter] = useState("FOR YOU");
  const [marketFilter, setMarketFilter] = useState("ALL");
  const [liked, setLiked] = useState<number[]>([1]);
  const [showJoin, setShowJoin] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [showTokens, setShowTokens] = useState(false);
  const [showListing, setShowListing] = useState(false);
  const [notice, setNotice] = useState("");
  const [code, setCode] = useState("P0302");
  const [symptoms, setSymptoms] = useState("Rough idle, flashing CEL under load, fuel smell at startup");
  const [diagnosing, setDiagnosing] = useState(false);
  const [result, setResult] = useState(false);
  const [tokens, setTokens] = useState(0);
  const [chat, setChat] = useState([
    { name: "WrenchWitch", text: "Anybody have the torque spec for K24 cam caps?" },
    { name: "BoostedMaya", text: "Start at 9 lb-ft, final pass 16 lb-ft. Work from the center out." },
  ]);
  const [chatText, setChatText] = useState("");

  const displayName = user?.displayName.split("@")[0] ?? "Guest Builder";
  const visibleListings = useMemo(
    () => listings.filter((item) => marketFilter === "ALL" || item.type.includes(marketFilter)),
    [marketFilter],
  );

  function requireAccount(action: () => void) {
    if (!user) {
      setShowJoin(true);
      return;
    }
    action();
  }

  function navigate(next: View) {
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleLike(id: number) {
    requireAccount(() =>
      setLiked((current) =>
        current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
      ),
    );
  }

  function analyze() {
    requireAccount(() => {
      if (!code.trim()) return;
      if (tokens < 2) {
        setShowTokens(true);
        return;
      }
      setDiagnosing(true);
      setResult(false);
      window.setTimeout(() => {
        setDiagnosing(false);
        setResult(true);
        setTokens((value) => value - 2);
      }, 1200);
    });
  }

  async function publishPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: data.get("kind"),
          title: data.get("title"),
          vehicle: data.get("vehicle"),
          body: data.get("body"),
        }),
      });
      if (!response.ok) throw new Error("publish failed");
      form.reset();
      setShowComposer(false);
      setNotice("Build entry published to the community feed.");
    } catch {
      setNotice("Publishing is unavailable in this preview. Your form is still open so the draft is not lost.");
    }
  }

  async function publishListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await fetch("/api/listings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: data.get("type"),
          price: data.get("price"),
          title: data.get("title"),
          condition: data.get("condition"),
          description: data.get("description"),
          protectionEligible: data.get("protectionEligible") === "on",
        }),
      });
      if (!response.ok) throw new Error("listing failed");
      form.reset();
      setShowListing(false);
      setNotice("Listing draft saved. Payouts remain disabled until seller verification and Stripe Connect are configured.");
    } catch {
      setNotice("Listing storage is unavailable in this preview. Your form is still open so the draft is not lost.");
    }
  }

  function submitChat(event: FormEvent) {
    event.preventDefault();
    requireAccount(() => {
      const message = chatText.trim();
      if (!message) return;
      setChat((items) => [...items, { name: displayName, text: message }]);
      setChatText("");
    });
  }

  return (
    <div className="site-shell">
      <header className="topbar">
        <button className="brand-button" onClick={() => navigate("community")} aria-label="TorqueShed home">
          <img src="/torqueshed-logo.png" alt="TorqueShed" className="brand-logo" />
        </button>
        <nav className="desktop-nav" aria-label="Primary navigation">
          {([
            ["community", "Community"],
            ["diagnose", "Torque Assist"],
            ["builds", "Builds"],
            ["market", "Marketplace"],
          ] as [View, string][]).map(([id, label]) => (
            <button key={id} aria-current={view === id ? "page" : undefined} className={view === id ? "nav-link active" : "nav-link"} onClick={() => navigate(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <button className="token-chip" onClick={() => requireAccount(() => setShowTokens(true))}>
            <span className="token-mark">T</span>
            <span><b>{tokens}</b> tokens</span>
          </button>
          {user ? (
            <button className="profile-chip" onClick={() => navigate("garage")}>
              <span className="avatar small">{initials(displayName)}</span>
              <span className="profile-copy"><b>{displayName}</b><small>My Garage</small></span>
            </button>
          ) : (
            <button className="primary compact" onClick={() => setShowJoin(true)}>Sign in</button>
          )}
        </div>
      </header>

      <main>
        {user && (
          <div className="identity-ribbon" role="status">
            <span><ShieldCheck size={14} /> OperatorOS verified</span>
            <p>Welcome back, <b>{displayName}</b>. You&apos;re working in <b>{user.tenant.name}</b>.</p>
            <button onClick={() => navigate("garage")}>View garage <ArrowRight size={13} /></button>
          </div>
        )}
        {view === "community" && (
          <>
            <section className="hero">
              <img src="/torqueshed-feature.png" alt="TorqueShed engine logo surrounded by automotive parts on a workbench" className="hero-image" />
              <div className="hero-scrim" />
              <div className="hero-content">
                <p className="eyebrow"><span /> THE DIGITAL GARAGE IS OPEN</p>
                <h1>Built by wrenchers.<br /><em>Powered by the shed.</em></h1>
                <p className="hero-copy">Document the build. Diagnose the problem. Trade the parts. Find the people who have already broken—and fixed—what you&apos;re working on.</p>
                <div className="hero-actions">
                  <button className="primary" onClick={() => requireAccount(() => setShowComposer(true))}>Post your build <span>→</span></button>
                  <button className="secondary" onClick={() => navigate("diagnose")}>Try Torque Assist</button>
                </div>
                <div className="trust-row"><span>FREE COMMUNITY</span><i /> <span>NO PAYWALLED HOW-TOS</span><i /> <span>OPERATOROS VERIFIED ACCESS</span></div>
                <div className="garage-pulse" aria-label="TorqueShed community activity"><span><b>12.4k</b> active builders</span><span><b>38k</b> documented fixes</span><span><b>4.9/5</b> seller reputation</span></div>
              </div>
            </section>

            <section className="dashboard-grid section-wrap">
              <div className="feed-column">
                <div className="section-heading">
                  <div><p className="kicker">SHOP FEED</p><h2>What&apos;s happening in the garage</h2></div>
                  <button className="outline-button" onClick={() => requireAccount(() => setShowComposer(true))}><Plus size={15} /> New post</button>
                </div>
                <div className="filter-row" role="group" aria-label="Feed filters">
                  {["FOR YOU", "LATEST", "FOLLOWING", "NEARBY"].map((filter) => (
                    <button key={filter} aria-pressed={feedFilter === filter} className={feedFilter === filter ? "filter active" : "filter"} onClick={() => setFeedFilter(filter)}>{filter}</button>
                  ))}
                </div>
                <div className="post-list">
                  {buildPosts.map((post) => (
                    <article className="post-card" key={post.id}>
                      <div className={`post-visual ${post.color}`}>
                        <img src={post.image} alt={post.imageAlt} />
                        <div className="photo-scrim" />
                        <span className="post-type">{post.type}</span>
                        <div className="mechanical-mark"><b>{post.id === 1 ? "K24" : post.id === 2 ? "5.9" : "4×4"}</b><small>{post.vehicle}</small></div>
                        <span className="visual-index">0{post.id}</span>
                      </div>
                      <div className="post-body">
                        <div className="author-row">
                          <span className="avatar">{post.avatar}</span>
                          <div><b>{post.author}</b><small>{post.handle} · {post.time}</small></div>
                          <button className="more-button" aria-label={`More options for ${post.title}`}><MoreHorizontal size={18} /></button>
                        </div>
                        <h3>{post.title}</h3>
                        <p>{post.excerpt}</p>
                        <div className="vehicle-tag"><b>{post.vehicle}</b><span>{post.meta}</span></div>
                        <div className="post-stats">
                          <button aria-pressed={liked.includes(post.id)} aria-label={`Like ${post.title}`} className={liked.includes(post.id) ? "stat-button liked" : "stat-button"} onClick={() => toggleLike(post.id)}><Heart size={14} fill={liked.includes(post.id) ? "currentColor" : "none"} /> {post.likes + (liked.includes(post.id) ? 1 : 0)}</button>
                          <button className="stat-button" onClick={() => requireAccount(() => setNotice("Discussion opened. Replies will be persisted when the production database is connected."))}><MessageCircle size={14} /> {post.replies}</button>
                          <button className="stat-button save" onClick={() => requireAccount(() => setNotice("Saved to your garage reference shelf."))}><Bookmark size={14} /> Save</button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <aside className="rail">
                <section className="assist-card">
                  <div className="assist-top"><span className="assist-icon">TA</span><div><p>TORQUE ASSIST</p><h3>Know what the code <em>really</em> means.</h3></div></div>
                  <p>Submit OBD codes, symptoms, and live data for a step-by-step diagnostic plan—not a generic parts list.</p>
                  <div className="mini-code"><span>P0302</span><div><i style={{ width: "78%" }} /><i style={{ width: "53%" }} /><i style={{ width: "64%" }} /></div></div>
                  <button onClick={() => navigate("diagnose")}>Start a diagnosis <span>2 tokens →</span></button>
                </section>

                <section className="rail-card live-card">
                  <div className="rail-title"><div><span className="live-dot" /> LIVE BAY CHAT</div><small>{42 + chat.length} online</small></div>
                  <div className="chat-list">
                    {chat.slice(-4).map((item, index) => (
                      <div className="chat-message" key={`${item.name}-${index}`}><span className="avatar tiny">{initials(item.name)}</span><p><b>{item.name}</b>{item.text}</p></div>
                    ))}
                  </div>
                  <form className="chat-form" onSubmit={submitChat}><input value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder="Ask the bay..." aria-label="Chat message" /><button aria-label="Send message">→</button></form>
                </section>

                <section className="rail-card">
                  <div className="rail-title"><div>TRENDING IN THE SHED</div><small>24H</small></div>
                  <div className="trend-list">{trending.map(([tag, count], index) => <button key={tag}><span><b>0{index + 1}</b>{tag}</span><small>{count}</small></button>)}</div>
                </section>
              </aside>
            </section>
          </>
        )}

        {view === "diagnose" && (
          <section className="inner-page section-wrap diagnose-page">
            <div className="page-intro"><p className="kicker">TORQUE ASSIST / AI DIAGNOSTICS</p><h1>Evidence first. <em>Parts second.</em></h1><p>Turn scan data and symptoms into a prioritized test plan. Every result shows its reasoning, confidence, and next measurements.</p></div>
            <div className="diagnose-grid">
              <div className="diagnostic-form panel">
                <div className="panel-head"><span>01</span><div><h2>Tell us what the vehicle is doing</h2><p>One diagnosis uses 2 tokens.</p></div><button className="token-chip" onClick={() => requireAccount(() => setShowTokens(true))}><span className="token-mark">T</span>{tokens} available</button></div>
                <label>Vehicle<select defaultValue="civic"><option value="civic">1994 Honda Civic CX · K24A2</option><option value="ram">2006 Ram 2500 · 5.9 Cummins</option><option value="new">+ Add another vehicle</option></select></label>
                <div className="field-pair"><label>OBD-II / manufacturer code<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={12} /></label><label>Mileage<input defaultValue="142,860" inputMode="numeric" /></label></div>
                <label>Symptoms, conditions, and recent work<textarea value={symptoms} onChange={(event) => setSymptoms(event.target.value)} rows={5} /></label>
                <div className="upload-zone"><b>+ Add freeze-frame or live data</b><span>CSV, screenshot, or paste supported in production</span></div>
                <button className="primary full" disabled={diagnosing || !code.trim()} onClick={analyze}>{diagnosing ? "Analyzing evidence..." : "Build my diagnostic plan"}<span>{diagnosing ? "···" : "2 T →"}</span></button>
              </div>
              <div className={result ? "diagnostic-result panel visible" : "diagnostic-result panel"}>
                {!result && !diagnosing ? (
                  <div className="empty-diagnostic"><span>TA</span><h3>Your test plan will appear here</h3><p>Torque Assist weighs the code against your exact vehicle, symptoms, conditions, and recent work.</p><div><b>Not a replacement for safe shop practices.</b> Verify measurements before replacing parts.</div></div>
                ) : diagnosing ? (
                  <div className="scan-state"><span className="scan-ring">TA</span><h3>Comparing likely failure paths</h3><p>Reading code context · checking symptom conflicts · ordering confirmation tests</p></div>
                ) : (
                  <div className="result-content">
                    <div className="result-head"><span className="confidence">82% confidence</span><small>Analysis TS-24072</small><h2>Misfire detected on cylinder 2</h2><p>The fuel smell and load-dependent flashing CEL make ignition breakdown more likely than a mechanical fault, but the fastest path starts with a swap test.</p></div>
                    <div className="cause-list"><h3>LIKELY CAUSES</h3><div><span>01</span><p><b>Ignition coil breakdown</b><small>High probability · matches load condition</small></p><strong>48%</strong></div><div><span>02</span><p><b>Fouled or over-gapped plug</b><small>Medium probability · inspect before buying</small></p><strong>27%</strong></div><div><span>03</span><p><b>Injector leakage / flow issue</b><small>Possible · fuel smell supports follow-up</small></p><strong>15%</strong></div></div>
                    <div className="test-plan"><h3>CONFIRMATION PLAN</h3><ol><li><b>Swap coil 2 with coil 3.</b><span>Clear codes and reproduce the same loaded condition. If the misfire moves, replace the coil.</span></li><li><b>Inspect and measure plug gap.</b><span>Look for fuel fouling, cracked porcelain, and gap outside 0.028–0.032 in for this setup.</span></li><li><b>Run injector balance check.</b><span>Only if the misfire stays on cylinder 2 after ignition checks.</span></li></ol></div>
                    <button className="outline-button full" onClick={() => setNotice("Diagnostic saved to your 1994 Civic build timeline.")}>Save to build history</button>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {view === "builds" && (
          <section className="inner-page section-wrap">
            <div className="page-intro split"><div><p className="kicker">BUILD LIBRARY</p><h1>Real work. <em>Fully documented.</em></h1><p>Follow projects from first teardown to final shakedown, with parts, costs, mistakes, and proof attached.</p></div><button className="primary" onClick={() => requireAccount(() => setShowComposer(true))}>Start a build journal</button></div>
            <div className="build-library">
              {buildPosts.map((post) => <article className={`build-tile ${post.color}`} key={post.id}><div className="build-number">0{post.id}</div><span>{post.type}</span><h2>{post.title}</h2><p>{post.excerpt}</p><div><b>{post.vehicle}</b><small>{post.meta}</small></div><button onClick={() => setNotice(`Opening ${post.author}'s complete build journal.`)}>Open build journal →</button></article>)}
              <article className="build-tile blueprint"><div className="build-number">04</div><span>FEATURED COLLECTION</span><h2>First-time engine swap field guide</h2><p>Twenty-three member builds organized by chassis, powertrain, budget, and fabrication level.</p><div><b>Community collection</b><small>23 builds · 411 documented steps</small></div><button onClick={() => requireAccount(() => setNotice("Collection added to your reference shelf."))}>Browse collection →</button></article>
            </div>
          </section>
        )}

        {view === "market" && (
          <section className="inner-page section-wrap market-page">
            <div className="page-intro split"><div><p className="kicker">DIY MARKETPLACE</p><h1>Made in garages. <em>Backed by reputation.</em></h1><p>Buy, sell, or trade builder-made parts and used gear. Choose direct exchange or optional TorqueShed Protection at checkout.</p></div><button className="primary" onClick={() => requireAccount(() => setShowListing(true))}>List an item</button></div>
            <div className="protection-banner"><span className="shield">TS</span><div><b>Optional TorqueShed Protection</b><p>Protected checkout, shipment tracking, and a documented dispute window for a small 3% platform fee. Direct trades remain free.</p></div><button onClick={() => setNotice("Protection terms opened for review. Final processor and payout timing require Stripe Connect configuration.")}>How it works →</button></div>
            <div className="market-toolbar"><div>{["ALL", "SELL", "BUY", "TRADE"].map((filter) => <button key={filter} onClick={() => setMarketFilter(filter)} className={marketFilter === filter ? "filter active" : "filter"}>{filter}</button>)}</div><label>Sort<select><option>Recently listed</option><option>Price: low to high</option><option>Seller rating</option></select></label></div>
            <div className="listing-grid">{visibleListings.map((item) => <article className="listing-card" key={item.id}><div className="listing-visual"><img src={item.image} alt={item.imageAlt} /><div className="listing-scrim" /><span>{item.type}</span><small>PHOTO: {item.credit}</small></div><div className="listing-body"><div className="price-row"><span>{item.price}</span>{item.protected && <small><ShieldCheck size={11} /> TS PROTECTED</small>}</div><h2>{item.title}</h2><div className="seller-row"><span className="avatar tiny">{initials(item.seller)}</span><p><b>{item.seller}</b><small>★ {item.rating} · 36 sales</small></p></div><button onClick={() => requireAccount(() => setNotice(`${item.title} added to your marketplace watchlist.`))}>View listing <ArrowRight size={14} /></button></div></article>)}</div>
          </section>
        )}

        {view === "garage" && (
          <section className="inner-page section-wrap garage-page">
            <div className="garage-hero panel"><div className="avatar huge">{initials(displayName)}</div><div><p className="kicker">MY TORQUESHED GARAGE</p><h1>{displayName}</h1><p>{user?.email ?? "Sign in to build your permanent garage profile."}</p>{user && <div className="operator-badge"><ShieldCheck size={14} /> Verified by OperatorOS <span>{user.tenant.name}</span></div>}<div className="garage-stats"><span><b>2</b> vehicles</span><span><b>18</b> build entries</span><span><b>847</b> reputation</span></div></div><div className="garage-actions"><button className="outline-button" onClick={() => requireAccount(() => setNotice("Profile editor ready for your details, tools, specialties, and location privacy settings."))}>Edit profile</button>{user && <button className="quiet-button" onClick={() => void onSignOut()}><LogOut size={14} /> Sign out</button>}</div></div>
            <div className="garage-grid"><article className="vehicle-card copper"><div><span>PRIMARY BUILD</span><b>HC</b></div><h2>1994 Honda Civic CX</h2><p>K24A2 · Precision 5858 · 8 PSI</p><div className="progress"><span style={{ width: "72%" }} /></div><small>72% build completion · updated today</small><button onClick={() => setNotice("Opening the complete Civic build timeline.")}>Open build →</button></article><article className="vehicle-card steel"><div><span>DAILY / TOW</span><b>RAM</b></div><h2>2006 Ram 2500 SLT</h2><p>5.9 Cummins · G56 · 312K miles</p><div className="progress"><span style={{ width: "91%" }} /></div><small>19 service records · next due in 840 mi</small><button onClick={() => setNotice("Opening the Ram service and diagnostic history.")}>Open vehicle →</button></article><button className="add-vehicle" onClick={() => requireAccount(() => setNotice("Vehicle setup opened. VIN decoding will remain optional for privacy."))}><span>+</span><b>Add a vehicle or build</b><small>Track service, parts, diagnostics, and progress</small></button></div>
          </section>
        )}
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {([[
          "community", "Feed"], ["diagnose", "Assist"], ["builds", "Builds"], ["market", "Market"], ["garage", "Garage"],
        ] as [View, string][]).map(([id, label]) => <button key={id} aria-current={view === id ? "page" : undefined} className={view === id ? "active" : ""} onClick={() => navigate(id)}>{id === "community" ? <Home /> : id === "diagnose" ? <Bot /> : id === "builds" ? <Wrench /> : id === "market" ? <Store /> : <CircleGauge />}<span>{label}</span></button>)}
      </nav>

      {showJoin && <div className="modal-backdrop" onMouseDown={() => setShowJoin(false)}><section className="modal join-modal" role="dialog" aria-modal="true" aria-labelledby="join-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowJoin(false)} aria-label="Close"><X size={18} /></button><img src="/torqueshed-logo.png" alt="TorqueShed" /><p className="kicker">OPERATOROS SECURE ACCESS</p><h2 id="join-title">Bring your garage identity with you.</h2><p>Sign in through OperatorOS to launch TorqueShed with your verified account and organization. Your build history remains private to TorqueShed.</p><a className="primary full link-button" href={operatorOsLoginUrl}>Continue with OperatorOS <ArrowRight size={16} /></a><div className="join-points"><span><Check size={14} /> Free community access</span><span><ShieldCheck size={14} /> One-time secure handoff</span><span><PackageSearch size={14} /> Private garage history</span></div><small>OperatorOS authenticates your account; TorqueShed creates and controls its own session.</small></section></div>}

      {showComposer && <div className="modal-backdrop" onMouseDown={() => setShowComposer(false)}><form className="modal form-modal" onSubmit={publishPost} onMouseDown={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setShowComposer(false)} aria-label="Close">×</button><p className="kicker">NEW BUILD ENTRY</p><h2>Share what happened in the garage.</h2><label>Entry type<select name="kind"><option>Build update</option><option>How-to article</option><option>Question</option><option>Tool review</option></select></label><label>Title<input name="title" required maxLength={120} placeholder="What did you build, learn, or fix?" /></label><label>Vehicle<select name="vehicle"><option>1994 Honda Civic CX</option><option>2006 Ram 2500</option><option>General / no vehicle</option></select></label><label>Details<textarea name="body" required maxLength={12000} rows={6} placeholder="Parts, measurements, process, mistakes, and results..." /></label><button className="primary full" type="submit">Publish build entry <span>→</span></button></form></div>}

      {showTokens && <div className="modal-backdrop" onMouseDown={() => setShowTokens(false)}><section className="modal token-modal" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowTokens(false)} aria-label="Close">×</button><p className="kicker">TORQUE ASSIST TOKENS</p><h2>Pay for diagnostics, not membership.</h2><p>The community stays free. Tokens cover the cost of evidence-based AI analysis. Unused tokens never expire.</p><div className="token-packs"><button onClick={() => setNotice("Checkout is awaiting the production payment provider connection.")}><span>10 tokens</span><b>$5</b><small>5 diagnostic plans</small></button><button className="recommended" onClick={() => setNotice("Checkout is awaiting the production payment provider connection.")}><em>BEST VALUE</em><span>30 tokens</span><b>$12</b><small>15 diagnostic plans</small></button><button onClick={() => setNotice("Checkout is awaiting the production payment provider connection.")}><span>75 tokens</span><b>$25</b><small>37 diagnostic plans</small></button></div><small>Final pricing and checkout remain inactive until Stripe products and webhook verification are configured.</small></section></div>}

      {showListing && <div className="modal-backdrop" onMouseDown={() => setShowListing(false)}><form className="modal form-modal" onSubmit={publishListing} onMouseDown={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setShowListing(false)} aria-label="Close">×</button><p className="kicker">NEW MARKETPLACE LISTING</p><h2>List it clearly. Trade it safely.</h2><div className="field-pair"><label>Listing type<select name="type"><option>Sell</option><option>Trade</option><option>Buy / wanted</option></select></label><label>Price<input name="price" inputMode="decimal" placeholder="$0.00" /></label></div><label>Item title<input name="title" required maxLength={120} placeholder="Part, tool, or DIY product" /></label><label>Condition<select name="condition"><option>New / builder-made</option><option>Used — excellent</option><option>Used — working</option><option>For parts / repair</option></select></label><label>Description<textarea name="description" required maxLength={5000} rows={5} placeholder="Fitment, condition, measurements, what is included..." /></label><label className="check-row"><input name="protectionEligible" type="checkbox" defaultChecked /> Offer TorqueShed Protection (3% seller fee)</label><button className="primary full" type="submit">Save listing draft <span>→</span></button></form></div>}

      {notice && <div className="toast" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss">×</button></div>}
    </div>
  );
}
