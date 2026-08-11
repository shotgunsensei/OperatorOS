import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight, Bookmark, Bot, Check, CircleGauge, Heart, Home, LogOut, MessageCircle, MoreHorizontal, PackageSearch, Plus, ShieldCheck, Store, Wrench, X } from "lucide-react";

export type TorqueShedUser = {
  id: string;
  displayName: string;
  email: string;
  platformRole: string;
  tenant: { id: string; slug: string | null; name: string; role: string | null };
} | null;
type View = "community" | "diagnose" | "builds" | "market" | "garage";

type ApiVehicle = {
  id: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  engine: string | null;
  transmission: string | null;
  drivetrain: string | null;
  mileage: number | null;
  nickname: string | null;
  updatedAt: string;
};

type VehicleRecord = { id: string; kind: string; title: string; description: string; mileage: number | null; costCents: number | null; laborMinutes: number | null; performedAt: string };
type VehicleReminder = { id: string; title: string; dueAt: string | null; dueMileage: number | null; status: string };
type VehicleDiagnostic = { id: string; title: string; customerConcern: string; status: string; updatedAt: string };
type VehicleDetail = {
  vehicle: ApiVehicle & { vin: string | null };
  profile: { summary: string; currentModifications: string[] } | null;
  records: VehicleRecord[];
  reminders: VehicleReminder[];
  diagnostics: VehicleDiagnostic[];
  builds: Array<{ id: string; title: string; status: string }>;
  attachments: Array<{ id: string; kind: string; originalName: string; contentType: string; createdAt: string }>;
};

type ApiPost = {
  post: { id: string; kind: string; title: string; body: string; createdAt: string };
  authorName: string;
  commentCount: number;
  reactionCount: number;
};

type ApiListing = {
  id: string;
  title: string;
  description: string;
  listingType: string;
  category: string;
  condition: string;
  price: string | null;
  locationLabel: string | null;
  status: string;
};

type AssistPlan = {
  summary: string;
  facts: string[];
  assumptions: string[];
  hypotheses: Array<{ rank: number; cause: string; confidence: number; supportingEvidence: string[] }>;
  followUpQuestions: string[];
  diagnosticPlan: Array<{ order: number; test: string; purpose: string; expectedResults: string[]; safety: string }>;
  safetyNotes: string[];
};

type TokenPackage = { id: string; name: string; tokenAmount: number; priceCents: number; checkoutConfigured: boolean };
type LedgerEntry = { id: string; delta: number; entryType: string; description: string; createdAt: string };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    ...init,
    headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

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
  const [view, setView] = useState<View>(user ? "garage" : "community");
  const [feedFilter, setFeedFilter] = useState("FOR YOU");
  const [marketFilter, setMarketFilter] = useState("ALL");
  const [liked, setLiked] = useState<number[]>([1]);
  const [showJoin, setShowJoin] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [showTokens, setShowTokens] = useState(false);
  const [showListing, setShowListing] = useState(false);
  const [showVehicle, setShowVehicle] = useState(false);
  const [showRecord, setShowRecord] = useState(false);
  const [showVehicleDetail, setShowVehicleDetail] = useState(false);
  const [notice, setNotice] = useState("");
  const [code, setCode] = useState("P0302");
  const [symptoms, setSymptoms] = useState("Rough idle, flashing CEL under load, fuel smell at startup");
  const [diagnosing, setDiagnosing] = useState(false);
  const [result, setResult] = useState(false);
  const [tokens, setTokens] = useState(0);
  const [vehicles, setVehicles] = useState<ApiVehicle[]>([]);
  const [persistedPosts, setPersistedPosts] = useState<ApiPost[]>([]);
  const [persistedListings, setPersistedListings] = useState<ApiListing[]>([]);
  const [tokenPackages, setTokenPackages] = useState<TokenPackage[]>([]);
  const [tokenLedger, setTokenLedger] = useState<LedgerEntry[]>([]);
  const [vehicleDetail, setVehicleDetail] = useState<VehicleDetail | null>(null);
  const [loadingVehicleDetail, setLoadingVehicleDetail] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [marketSearch, setMarketSearch] = useState("");
  const [assistPlan, setAssistPlan] = useState<AssistPlan | null>(null);
  const [loadingProduct, setLoadingProduct] = useState(Boolean(user));
  const [chat, setChat] = useState([
    { name: "WrenchWitch", text: "Anybody have the torque spec for K24 cam caps?" },
    { name: "BoostedMaya", text: "Start at 9 lb-ft, final pass 16 lb-ft. Work from the center out." },
  ]);
  const [chatText, setChatText] = useState("");

  const displayName = user?.displayName.split("@")[0] ?? "Guest Builder";
  const feedPosts = useMemo(() => persistedPosts.map((row, index) => ({
    id: index + 100,
    apiId: row.post.id,
    type: row.post.kind.replaceAll("_", " ").toUpperCase(),
    author: row.authorName,
    handle: "OperatorOS verified",
    avatar: initials(row.authorName),
    time: new Date(row.post.createdAt).toLocaleDateString(),
    title: row.post.title,
    excerpt: row.post.body,
    vehicle: "TorqueShed community",
    meta: "Documented build entry",
    likes: row.reactionCount,
    replies: row.commentCount,
    color: index % 2 ? "steel" : "copper",
    image: index % 2 ? "/marketplace/ls-engine-mounts-source.jpg" : "/marketplace/efi-controller-source.jpg",
    imageAlt: "Automotive work documented in TorqueShed",
  })), [persistedPosts]);
  const activePosts = user ? feedPosts : buildPosts;
  const dynamicListings = useMemo(() => persistedListings.map((item, index) => ({
    id: index + 100,
    apiId: item.id,
    title: item.title,
    price: item.price ? `$${Number(item.price).toLocaleString()}` : item.listingType === "trade" ? "Trade" : "Wanted",
    type: item.listingType.toUpperCase(),
    seller: "OperatorOS verified seller",
    rating: "New",
    protected: false,
    image: ["/marketplace/ls-engine-mounts-source.jpg", "/marketplace/efi-controller-source.jpg", "/marketplace/gauge-pod-source.jpg"][index % 3]!,
    imageAlt: item.description,
    credit: item.locationLabel || "Location shared by seller",
  })), [persistedListings]);
  const activeListings = user ? dynamicListings : listings.map((item) => ({ ...item, protected: false }));
  const visibleListings = useMemo(
    () => activeListings.filter((item) =>
      (marketFilter === "ALL" || item.type.includes(marketFilter)) &&
      (!marketSearch.trim() || item.title.toLowerCase().includes(marketSearch.trim().toLowerCase())),
    ),
    [activeListings, marketFilter, marketSearch],
  );

  async function loadProduct() {
    if (!user) return;
    try {
      const [dashboard, postsPayload, listingsPayload, packagesPayload] = await Promise.all([
        api<{ vehicles: ApiVehicle[]; tokens: { available: number } }>("/dashboard"),
        api<{ posts: ApiPost[] }>("/posts"),
        api<{ listings: ApiListing[] }>("/listings"),
        api<{ packages: TokenPackage[] }>("/billing/packages"),
      ]);
      setVehicles(dashboard.vehicles);
      setSelectedVehicleId((current) => current || dashboard.vehicles[0]?.id || "");
      setTokens(dashboard.tokens.available);
      setPersistedPosts(postsPayload.posts);
      setPersistedListings(listingsPayload.listings);
      setTokenPackages(packagesPayload.packages);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "TorqueShed data could not be loaded.");
    } finally {
      setLoadingProduct(false);
    }
  }

  useEffect(() => {
    void loadProduct();
  }, [user?.id]);

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

  function toggleLike(id: number, apiId?: string) {
    requireAccount(() => void (async () => {
      const alreadyLiked = liked.includes(id);
      setLiked((current) => alreadyLiked ? current.filter((item) => item !== id) : [...current, id]);
      if (!apiId || alreadyLiked) return;
      try {
        await api(`/posts/${apiId}/reactions/like`, { method: "PUT" });
      } catch (error) {
        setLiked((current) => current.filter((item) => item !== id));
        setNotice(error instanceof Error ? error.message : "The reaction could not be saved.");
      }
    })());
  }

  async function openVehicle(vehicleId: string) {
    setSelectedVehicleId(vehicleId);
    setShowVehicleDetail(true);
    setLoadingVehicleDetail(true);
    try {
      setVehicleDetail(await api<VehicleDetail>(`/vehicles/${vehicleId}`));
    } catch (error) {
      setShowVehicleDetail(false);
      setNotice(error instanceof Error ? error.message : "Vehicle history could not be loaded.");
    } finally {
      setLoadingVehicleDetail(false);
    }
  }

  function openTokens() {
    requireAccount(() => void (async () => {
      setShowTokens(true);
      try {
        const payload = await api<{ available: number; ledger: LedgerEntry[] }>("/token-balance");
        setTokens(payload.available);
        setTokenLedger(payload.ledger);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Token history could not be loaded.");
      }
    })());
  }

  async function favoriteListing(listingId: string | undefined, title: string) {
    if (!listingId) {
      setNotice("Sign in to save live marketplace listings.");
      return;
    }
    try {
      await api(`/listings/${listingId}/favorite`, { method: "PUT" });
      setNotice(`${title} saved to your marketplace favorites.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The listing could not be saved.");
    }
  }

  async function updateVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!vehicleDetail) return;
    const data = new FormData(event.currentTarget);
    try {
      await api(`/vehicles/${vehicleDetail.vehicle.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          nickname: data.get("nickname"),
          engine: data.get("engine"),
          transmission: data.get("transmission"),
          drivetrain: data.get("drivetrain"),
          mileage: data.get("mileage") || null,
        }),
      });
      await Promise.all([openVehicle(vehicleDetail.vehicle.id), loadProduct()]);
      setNotice("Vehicle profile updated.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The vehicle could not be updated.");
    }
  }

  function analyze() {
    requireAccount(() => void (async () => {
      if (!code.trim()) return;
      if (!selectedVehicleId) {
        setShowVehicle(true);
        setNotice("Add a vehicle before starting a diagnostic session.");
        return;
      }
      if (tokens < 2) {
        openTokens();
        return;
      }
      setDiagnosing(true);
      setResult(false);
      setAssistPlan(null);
      try {
        const created = await api<{ session: { id: string } }>("/diagnostics", {
          method: "POST",
          body: JSON.stringify({
            vehicleId: selectedVehicleId,
            title: `${code.trim().toUpperCase()} diagnostic`,
            customerConcern: symptoms,
            symptoms,
            conditions: {},
          }),
        });
        await api(`/diagnostics/${created.session.id}/codes`, {
          method: "POST",
          body: JSON.stringify({ code: code.trim().toUpperCase(), status: "active" }),
        });
        const analyzed = await api<{ analysis: { result: AssistPlan }; tokens: { available: number } }>(`/diagnostics/${created.session.id}/assist`, {
          method: "POST",
          headers: { "idempotency-key": crypto.randomUUID() },
          body: JSON.stringify({}),
        });
        setAssistPlan(analyzed.analysis.result);
        setTokens(analyzed.tokens.available);
        setResult(true);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Torque Assist could not complete the analysis.");
      } finally {
        setDiagnosing(false);
      }
    })());
  }

  async function publishPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await api("/posts", {
        method: "POST",
        body: JSON.stringify({
          kind: data.get("kind"),
          title: data.get("title"),
          vehicleId: data.get("vehicleId") || null,
          body: data.get("body"),
        }),
      });
      form.reset();
      setShowComposer(false);
      setNotice("Build entry published to the community feed.");
      await loadProduct();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The build entry could not be published.");
    }
  }

  async function publishListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const price = String(data.get("price") || "").replace(/[$,]/g, "");
      await api("/listings", {
        method: "POST",
        body: JSON.stringify({
          listingType: data.get("type"),
          category: data.get("category"),
          price: price ? Number(price) : null,
          title: data.get("title"),
          condition: data.get("condition"),
          description: data.get("description"),
          locationLabel: data.get("locationLabel"),
          status: "published",
        }),
      });
      form.reset();
      setShowListing(false);
      setNotice("Listing published. Buyers can contact you through TorqueShed; payment protection is not offered.");
      await loadProduct();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The listing could not be saved.");
    }
  }

  async function addVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const payload = await api<{ vehicle: ApiVehicle }>("/vehicles", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(data.entries())),
      });
      setSelectedVehicleId(payload.vehicle.id);
      form.reset();
      setShowVehicle(false);
      setNotice(`${payload.vehicle.year} ${payload.vehicle.make} ${payload.vehicle.model} added to your garage.`);
      await loadProduct();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The vehicle could not be added.");
    }
  }

  async function addMaintenance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedVehicleId) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await api(`/vehicles/${selectedVehicleId}/records`, {
        method: "POST",
        body: JSON.stringify({
          kind: data.get("kind"),
          title: data.get("title"),
          description: data.get("description"),
          mileage: data.get("mileage") || null,
          costCents: data.get("cost") ? Math.round(Number(data.get("cost")) * 100) : null,
          performedAt: data.get("performedAt") || new Date().toISOString(),
        }),
      });
      form.reset();
      setShowRecord(false);
      setNotice("Vehicle history updated.");
      await Promise.all([loadProduct(), showVehicleDetail ? openVehicle(selectedVehicleId) : Promise.resolve()]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The history entry could not be saved.");
    }
  }

  async function startCheckout(packageId: string) {
    try {
      const payload = await api<{ checkoutUrl: string }>("/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ packageId }),
      });
      window.location.assign(payload.checkoutUrl);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Checkout could not be started.");
    }
  }

  function submitChat(event: FormEvent) {
    event.preventDefault();
    requireAccount(() => {
      const message = chatText.trim();
      if (!message) return;
      setChat((items) => [...items, { name: displayName, text: message }]);
      setChatText("");
      setNotice("Bay Q&A preview messages remain in this browser session; use post comments for persisted discussion.");
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
          <button className="token-chip" onClick={openTokens}>
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
                <div className="garage-pulse" aria-label="TorqueShed activity"><span><b>{user ? vehicles.length : "FREE"}</b> {user ? "garage vehicles" : "community access"}</span><span><b>{user ? persistedPosts.length : "AI"}</b> {user ? "tenant posts" : "evidence-led plans"}</span><span><b>{user ? persistedListings.length : "DIRECT"}</b> {user ? "active listings" : "market exchanges"}</span></div>
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
                  {activePosts.map((post) => (
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
                          <button aria-pressed={liked.includes(post.id)} aria-label={`Like ${post.title}`} className={liked.includes(post.id) ? "stat-button liked" : "stat-button"} onClick={() => toggleLike(post.id, "apiId" in post && typeof post.apiId === "string" ? post.apiId : undefined)}><Heart size={14} fill={liked.includes(post.id) ? "currentColor" : "none"} /> {post.likes + (liked.includes(post.id) ? 1 : 0)}</button>
                          <button className="stat-button" onClick={() => requireAccount(() => setNotice("Comments are available through the persisted community API; the focused thread view is the next UI surface."))}><MessageCircle size={14} /> {post.replies}</button>
                          <button className="stat-button save" onClick={() => requireAccount(() => setNotice("Saved to your garage reference shelf."))}><Bookmark size={14} /> Save</button>
                        </div>
                      </div>
                    </article>
                  ))}
                  {activePosts.length === 0 && <div className="product-loading">No community entries yet. Publish the first documented build, repair, or diagnostic result for this organization.</div>}
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
                  <div className="rail-title"><div><span className="live-dot" /> BAY Q&amp;A PREVIEW</div><small>LOCAL SESSION</small></div>
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
                <div className="panel-head"><span>01</span><div><h2>Tell us what the vehicle is doing</h2><p>One diagnosis uses 2 tokens.</p></div><button className="token-chip" onClick={openTokens}><span className="token-mark">T</span>{tokens} available</button></div>
                <label>Vehicle<select value={selectedVehicleId} onChange={(event) => setSelectedVehicleId(event.target.value)}>{vehicles.length === 0 && <option value="">Add a vehicle first</option>}{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.year} {vehicle.make} {vehicle.model}{vehicle.engine ? ` · ${vehicle.engine}` : ""}</option>)}</select></label>
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
                    <div className="result-head"><span className="confidence">Evidence-led plan</span><small>Charged only after successful analysis</small><h2>Torque Assist diagnostic plan</h2><p>{assistPlan?.summary}</p></div>
                    <div className="evidence-columns"><div><h3>KNOWN FACTS</h3>{assistPlan?.facts.map((fact) => <p key={fact}>✓ {fact}</p>)}</div><div><h3>ASSUMPTIONS</h3>{assistPlan?.assumptions.map((assumption) => <p key={assumption}>? {assumption}</p>)}</div></div>
                    <div className="cause-list"><h3>RANKED HYPOTHESES</h3>{assistPlan?.hypotheses.map((hypothesis) => <div key={`${hypothesis.rank}-${hypothesis.cause}`}><span>{String(hypothesis.rank).padStart(2, "0")}</span><p><b>{hypothesis.cause}</b><small>{hypothesis.supportingEvidence.join(" · ")}</small></p><strong>{Math.round(hypothesis.confidence * 100)}%</strong></div>)}</div>
                    <div className="test-plan"><h3>CONFIRMATION PLAN</h3><ol>{assistPlan?.diagnosticPlan.map((step) => <li key={`${step.order}-${step.test}`}><b>{step.test}</b><span>{step.purpose} {step.safety}</span></li>)}</ol></div>
                    {assistPlan?.followUpQuestions.length ? <div className="follow-up"><h3>FOLLOW-UP QUESTIONS</h3>{assistPlan.followUpQuestions.map((question) => <p key={question}>{question}</p>)}</div> : null}
                    <button className="outline-button full" onClick={() => setNotice("Diagnostic and usage event are saved in your vehicle history.")}>Saved to diagnostic history</button>
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
              {activePosts.map((post) => <article className={`build-tile ${post.color}`} key={post.id}><div className="build-number">{String(post.id).padStart(2, "0")}</div><span>{post.type}</span><h2>{post.title}</h2><p>{post.excerpt}</p><div><b>{post.vehicle}</b><small>{post.meta}</small></div><button onClick={() => setNotice(`Opening ${post.author}'s documented build entry.`)}>Open build entry →</button></article>)}
              {!user && <article className="build-tile blueprint"><div className="build-number">04</div><span>FEATURED COLLECTION</span><h2>First-time engine swap field guide</h2><p>Explore how build journals can be organized by chassis, powertrain, budget, and fabrication level.</p><div><b>Guest preview</b><small>Sign in to view persisted organization builds</small></div><button onClick={() => setShowJoin(true)}>Sign in to browse →</button></article>}
              {user && activePosts.length === 0 && <div className="product-loading">No build journals have been published in this organization yet.</div>}
            </div>
          </section>
        )}

        {view === "market" && (
          <section className="inner-page section-wrap market-page">
            <div className="page-intro split"><div><p className="kicker">DIY MARKETPLACE</p><h1>Made in garages. <em>Documented clearly.</em></h1><p>Buy, sell, or trade builder-made parts and used gear through direct community contact. Review the listing and seller before arranging any transaction.</p></div><button className="primary" onClick={() => requireAccount(() => setShowListing(true))}>List an item</button></div>
            <div className="protection-banner"><span className="shield">TS</span><div><b>Community marketplace</b><p>Search parts, tools, and vehicles, save favorites, and contact sellers. TorqueShed does not currently provide escrow, shipping, tax handling, or payment protection.</p></div><button onClick={() => setNotice("Review every listing and seller before arranging a transaction.")}>Safety guidance →</button></div>
            <div className="market-toolbar"><div>{["ALL", "SELL", "BUY", "TRADE"].map((filter) => <button key={filter} onClick={() => setMarketFilter(filter)} className={marketFilter === filter ? "filter active" : "filter"}>{filter}</button>)}</div><label>Search<input value={marketSearch} onChange={(event) => setMarketSearch(event.target.value)} placeholder="Parts, tools, vehicles" /></label></div>
            <div className="listing-grid">{visibleListings.map((item) => <article className="listing-card" key={item.id}><div className="listing-visual"><img src={item.image} alt={item.imageAlt} /><div className="listing-scrim" /><span>{item.type}</span><small>{item.credit}</small></div><div className="listing-body"><div className="price-row"><span>{item.price}</span></div><h2>{item.title}</h2><div className="seller-row"><span className="avatar tiny">{initials(item.seller)}</span><p><b>{item.seller}</b><small>{item.rating} seller profile</small></p></div><button onClick={() => requireAccount(() => void favoriteListing("apiId" in item && typeof item.apiId === "string" ? item.apiId : undefined, item.title))}>Save listing <Bookmark size={14} /></button></div></article>)}{visibleListings.length === 0 && <div className="product-loading marketplace-empty">No active listings match this view. Publish a part, tool, or vehicle listing to start the marketplace.</div>}</div>
          </section>
        )}

        {view === "garage" && (
          <section className="inner-page section-wrap garage-page">
            <div className="garage-hero panel"><div className="avatar huge">{initials(displayName)}</div><div><p className="kicker">MY TORQUESHED GARAGE</p><h1>{displayName}</h1><p>{user?.email ?? "Sign in to build your permanent garage profile."}</p>{user && <div className="operator-badge"><ShieldCheck size={14} /> Verified by OperatorOS <span>{user.tenant.name}</span></div>}<div className="garage-stats"><span><b>{vehicles.length}</b> vehicles</span><span><b>{tokens}</b> available tokens</span><span><b>{persistedPosts.length}</b> community entries</span></div></div><div className="garage-actions"><button className="outline-button" onClick={() => setShowRecord(true)} disabled={!selectedVehicleId}>Add history</button>{user && <button className="quiet-button" onClick={() => void onSignOut()}><LogOut size={14} /> Sign out</button>}</div></div>
            {loadingProduct ? <div className="product-loading">Loading your garage history…</div> : <div className="garage-grid">{vehicles.map((vehicle, index) => <article className={`vehicle-card ${index % 2 ? "steel" : "copper"}`} key={vehicle.id}><div><span>{vehicle.nickname || "GARAGE VEHICLE"}</span><b>{vehicle.make.slice(0, 3).toUpperCase()}</b></div><h2>{vehicle.year} {vehicle.make} {vehicle.model}</h2><p>{[vehicle.trim, vehicle.engine, vehicle.transmission, vehicle.drivetrain].filter(Boolean).join(" · ") || "Add specifications"}</p><small>{vehicle.mileage == null ? "Mileage not recorded" : `${vehicle.mileage.toLocaleString()} miles`} · updated {new Date(vehicle.updatedAt).toLocaleDateString()}</small><button onClick={() => void openVehicle(vehicle.id)}>Open vehicle dashboard →</button></article>)}<button className="add-vehicle" onClick={() => requireAccount(() => setShowVehicle(true))}><span>+</span><b>Add a vehicle or build</b><small>Track service, parts, diagnostics, and progress</small></button></div>}
          </section>
        )}
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {([[
          "community", "Feed"], ["diagnose", "Assist"], ["builds", "Builds"], ["market", "Market"], ["garage", "Garage"],
        ] as [View, string][]).map(([id, label]) => <button key={id} aria-current={view === id ? "page" : undefined} className={view === id ? "active" : ""} onClick={() => navigate(id)}>{id === "community" ? <Home /> : id === "diagnose" ? <Bot /> : id === "builds" ? <Wrench /> : id === "market" ? <Store /> : <CircleGauge />}<span>{label}</span></button>)}
      </nav>

      {showJoin && <div className="modal-backdrop" onMouseDown={() => setShowJoin(false)}><section className="modal join-modal" role="dialog" aria-modal="true" aria-labelledby="join-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowJoin(false)} aria-label="Close"><X size={18} /></button><img src="/torqueshed-logo.png" alt="TorqueShed" /><p className="kicker">OPERATOROS SECURE ACCESS</p><h2 id="join-title">Bring your garage identity with you.</h2><p>Sign in through OperatorOS to launch TorqueShed with your verified account and organization. Your build history remains private to TorqueShed.</p><a className="primary full link-button" href={operatorOsLoginUrl}>Continue with OperatorOS <ArrowRight size={16} /></a><div className="join-points"><span><Check size={14} /> Free community access</span><span><ShieldCheck size={14} /> One-time secure handoff</span><span><PackageSearch size={14} /> Private garage history</span></div><small>OperatorOS authenticates your account; TorqueShed creates and controls its own session.</small></section></div>}

      {showComposer && <div className="modal-backdrop" onMouseDown={() => setShowComposer(false)}><form className="modal form-modal" onSubmit={publishPost} onMouseDown={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setShowComposer(false)} aria-label="Close">×</button><p className="kicker">NEW BUILD ENTRY</p><h2>Share what happened in the garage.</h2><label>Entry type<select name="kind"><option value="build_update">Build update</option><option value="how_to">How-to article</option><option value="question">Question</option><option value="tool_review">Tool review</option></select></label><label>Title<input name="title" required maxLength={120} placeholder="What did you build, learn, or fix?" /></label><label>Vehicle<select name="vehicleId"><option value="">General / no vehicle</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.year} {vehicle.make} {vehicle.model}</option>)}</select></label><label>Details<textarea name="body" required maxLength={12000} rows={6} placeholder="Parts, measurements, process, mistakes, and results..." /></label><button className="primary full" type="submit">Publish build entry <span>→</span></button></form></div>}

      {showTokens && <div className="modal-backdrop" onMouseDown={() => setShowTokens(false)}><section className="modal token-modal" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowTokens(false)} aria-label="Close">×</button><p className="kicker">TORQUE ASSIST TOKENS</p><h2>{tokens} tokens available.</h2><p>The community stays free. The ledger records every purchase, successful AI analysis, refund, and reversal.</p><div className="token-packs">{tokenPackages.map((pack, index) => <button key={pack.id} className={index === 1 ? "recommended" : undefined} disabled={!pack.checkoutConfigured} onClick={() => void startCheckout(pack.id)}>{index === 1 && <em>BEST VALUE</em>}<span>{pack.tokenAmount} tokens</span><b>${(pack.priceCents / 100).toFixed(0)}</b><small>{pack.checkoutConfigured ? `${Math.floor(pack.tokenAmount / 2)} diagnostic plans` : "Stripe price not configured"}</small></button>)}</div><div className="ledger-panel"><div><b>USAGE HISTORY</b><small>Ledger-derived balance</small></div>{tokenLedger.length ? tokenLedger.slice(0, 12).map((entry) => <div className="ledger-row" key={entry.id}><span><b>{entry.description}</b><small>{entry.entryType.replaceAll("_", " ")} · {new Date(entry.createdAt).toLocaleString()}</small></span><strong className={entry.delta < 0 ? "debit" : "credit"}>{entry.delta > 0 ? "+" : ""}{entry.delta}</strong></div>) : <p>No token activity has been recorded yet.</p>}</div><small>Tokens are credited only by the signed Stripe webhook after payment succeeds.</small></section></div>}

      {showVehicleDetail && <div className="modal-backdrop" onMouseDown={() => setShowVehicleDetail(false)}><section className="modal vehicle-detail-modal" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowVehicleDetail(false)} aria-label="Close">×</button>{loadingVehicleDetail || !vehicleDetail ? <div className="product-loading">Loading vehicle dashboard…</div> : <><p className="kicker">VEHICLE DASHBOARD</p><h2>{vehicleDetail.vehicle.year} {vehicleDetail.vehicle.make} {vehicleDetail.vehicle.model}</h2><div className="vehicle-facts"><span><b>{vehicleDetail.vehicle.mileage?.toLocaleString() ?? "—"}</b> miles</span><span><b>{vehicleDetail.records.length}</b> history entries</span><span><b>{vehicleDetail.diagnostics.length}</b> diagnostics</span><span><b>{vehicleDetail.reminders.filter((item) => item.status === "open").length}</b> reminders</span></div><form className="vehicle-edit" onSubmit={updateVehicle}><div className="field-pair"><label>Garage nickname<input name="nickname" defaultValue={vehicleDetail.vehicle.nickname ?? ""} maxLength={80} /></label><label>Mileage<input name="mileage" defaultValue={vehicleDetail.vehicle.mileage ?? ""} inputMode="numeric" /></label></div><div className="field-pair"><label>Engine<input name="engine" defaultValue={vehicleDetail.vehicle.engine ?? ""} maxLength={120} /></label><label>Transmission<input name="transmission" defaultValue={vehicleDetail.vehicle.transmission ?? ""} maxLength={120} /></label></div><label>Drivetrain<input name="drivetrain" defaultValue={vehicleDetail.vehicle.drivetrain ?? ""} maxLength={80} /></label><button className="outline-button" type="submit">Update vehicle profile</button></form><div className="vehicle-timeline-grid"><section><div className="detail-heading"><b>HISTORY & COSTS</b><button onClick={() => setShowRecord(true)}>+ Add entry</button></div>{vehicleDetail.records.length ? vehicleDetail.records.map((record) => <article className="timeline-row" key={record.id}><span>{record.kind.replaceAll("_", " ")}</span><div><b>{record.title}</b><p>{record.description || "No additional notes"}</p><small>{new Date(record.performedAt).toLocaleDateString()}{record.mileage != null ? ` · ${record.mileage.toLocaleString()} mi` : ""}{record.costCents != null ? ` · $${(record.costCents / 100).toFixed(2)}` : ""}</small></div></article>) : <p className="detail-empty">No maintenance, repair, modification, inspection, or mileage entries yet.</p>}</section><section><div className="detail-heading"><b>DIAGNOSTICS & SERVICE</b></div>{vehicleDetail.diagnostics.map((item) => <article className="timeline-row" key={item.id}><span>{item.status}</span><div><b>{item.title}</b><p>{item.customerConcern}</p><small>{new Date(item.updatedAt).toLocaleDateString()}</small></div></article>)}{vehicleDetail.reminders.map((item) => <article className="timeline-row reminder" key={item.id}><span>{item.status}</span><div><b>{item.title}</b><small>{item.dueMileage ? `Due at ${item.dueMileage.toLocaleString()} mi` : item.dueAt ? `Due ${new Date(item.dueAt).toLocaleDateString()}` : "No due threshold"}</small></div></article>)}{vehicleDetail.diagnostics.length === 0 && vehicleDetail.reminders.length === 0 && <p className="detail-empty">No diagnostics or service reminders yet.</p>}</section></div><div className="vehicle-supporting"><span>VIN <b>{vehicleDetail.vehicle.vin || "Not recorded"}</b></span><span>Builds <b>{vehicleDetail.builds.length}</b></span><span>Photos & documents <b>{vehicleDetail.attachments.length}</b></span></div></>}</section></div>}

      {showListing && <div className="modal-backdrop" onMouseDown={() => setShowListing(false)}><form className="modal form-modal" onSubmit={publishListing} onMouseDown={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setShowListing(false)} aria-label="Close">×</button><p className="kicker">NEW MARKETPLACE LISTING</p><h2>List it clearly. Trade it safely.</h2><div className="field-pair"><label>Listing type<select name="type"><option value="sell">Sell</option><option value="trade">Trade</option><option value="wanted">Buy / wanted</option></select></label><label>Category<select name="category"><option value="parts">Parts</option><option value="tools">Tools</option><option value="vehicles">Vehicles</option></select></label></div><label>Item title<input name="title" required maxLength={120} placeholder="Part, tool, or vehicle" /></label><div className="field-pair"><label>Condition<select name="condition"><option>New / builder-made</option><option>Used — excellent</option><option>Used — working</option><option>For parts / repair</option></select></label><label>Price<input name="price" inputMode="decimal" placeholder="$0.00" /></label></div><label>Location<input name="locationLabel" maxLength={120} placeholder="City / region only — no street address" /></label><label>Description<textarea name="description" required maxLength={5000} rows={5} placeholder="Fitment, condition, measurements, what is included..." /></label><p className="form-disclaimer">TorqueShed does not provide escrow, shipping, tax handling, or payment protection.</p><button className="primary full" type="submit">Publish listing <span>→</span></button></form></div>}

      {showVehicle && <div className="modal-backdrop" onMouseDown={() => setShowVehicle(false)}><form className="modal form-modal" onSubmit={addVehicle} onMouseDown={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setShowVehicle(false)} aria-label="Close">×</button><p className="kicker">ADD VEHICLE</p><h2>Start a permanent vehicle record.</h2><div className="field-pair"><label>Year<input name="year" type="number" min="1886" max={new Date().getFullYear() + 2} required /></label><label>Make<input name="make" required maxLength={80} /></label></div><div className="field-pair"><label>Model<input name="model" required maxLength={80} /></label><label>Trim<input name="trim" maxLength={80} /></label></div><label>VIN (optional)<input name="vin" maxLength={17} autoCapitalize="characters" /></label><div className="field-pair"><label>Engine<input name="engine" maxLength={120} /></label><label>Transmission<input name="transmission" maxLength={120} /></label></div><div className="field-pair"><label>Drivetrain<input name="drivetrain" maxLength={80} /></label><label>Mileage<input name="mileage" inputMode="numeric" /></label></div><label>Garage nickname<input name="nickname" maxLength={80} /></label><button className="primary full" type="submit">Add to garage <span>→</span></button></form></div>}

      {showRecord && <div className="modal-backdrop" onMouseDown={() => setShowRecord(false)}><form className="modal form-modal" onSubmit={addMaintenance} onMouseDown={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setShowRecord(false)} aria-label="Close">×</button><p className="kicker">VEHICLE HISTORY</p><h2>Add maintenance, repair, or modification.</h2><label>Vehicle<select value={selectedVehicleId} onChange={(event) => setSelectedVehicleId(event.target.value)}>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.year} {vehicle.make} {vehicle.model}</option>)}</select></label><div className="field-pair"><label>Record type<select name="kind"><option value="maintenance">Maintenance</option><option value="repair">Repair</option><option value="modification">Modification</option><option value="inspection">Inspection</option><option value="mileage">Mileage</option></select></label><label>Date<input name="performedAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label></div><label>Title<input name="title" required maxLength={160} placeholder="Oil change, brake repair, turbo install…" /></label><label>Details<textarea name="description" maxLength={10000} rows={4} /></label><div className="field-pair"><label>Mileage<input name="mileage" inputMode="numeric" /></label><label>Cost (USD)<input name="cost" inputMode="decimal" /></label></div><button className="primary full" type="submit">Save history entry <span>→</span></button></form></div>}

      {notice && <div className="toast" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss">×</button></div>}
    </div>
  );
}
