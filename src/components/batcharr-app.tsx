"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ConnectionTestResult,
  LookupCandidate,
  LookupItemResult,
  MediaHint,
  PublicSettings,
} from "@/lib/types";

type Tab = "import" | "history" | "settings";
type Decision = "pending" | "approved" | "skipped" | "added" | "failed" | "duplicate";

interface ReviewItem extends LookupItemResult {
  selectedToken: string | null;
  decision: Decision;
  message: string;
}

interface HistoryEntry {
  id: number;
  mediaType: "movie" | "series";
  title: string;
  year: number | null;
  externalId: number | null;
  status: string;
  message: string;
  createdAt: string;
}

interface SettingsForm {
  radarrUrl: string;
  radarrApiKey: string;
  radarrRootFolderPath: string;
  radarrQualityProfileId: number | null;
  radarrMinimumAvailability: string;
  radarrMonitored: boolean;
  radarrSearchOnAdd: boolean;
  sonarrUrl: string;
  sonarrApiKey: string;
  sonarrRootFolderPath: string;
  sonarrQualityProfileId: number | null;
  sonarrSeriesType: string;
  sonarrMonitor: string;
  sonarrSeasonFolder: boolean;
  sonarrSearchOnAdd: boolean;
}

const EMPTY_SETTINGS: SettingsForm = {
  radarrUrl: "",
  radarrApiKey: "",
  radarrRootFolderPath: "",
  radarrQualityProfileId: null,
  radarrMinimumAvailability: "released",
  radarrMonitored: true,
  radarrSearchOnAdd: true,
  sonarrUrl: "",
  sonarrApiKey: "",
  sonarrRootFolderPath: "",
  sonarrQualityProfileId: null,
  sonarrSeriesType: "standard",
  sonarrMonitor: "all",
  sonarrSeasonFolder: true,
  sonarrSearchOnAdd: true,
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `Request failed with HTTP ${response.status}.`);
  return payload;
}

function publicToForm(settings: PublicSettings): SettingsForm {
  return {
    radarrUrl: settings.radarr.url,
    radarrApiKey: "",
    radarrRootFolderPath: settings.radarr.rootFolderPath,
    radarrQualityProfileId: settings.radarr.qualityProfileId,
    radarrMinimumAvailability: settings.radarr.minimumAvailability,
    radarrMonitored: settings.radarr.monitored,
    radarrSearchOnAdd: settings.radarr.searchOnAdd,
    sonarrUrl: settings.sonarr.url,
    sonarrApiKey: "",
    sonarrRootFolderPath: settings.sonarr.rootFolderPath,
    sonarrQualityProfileId: settings.sonarr.qualityProfileId,
    sonarrSeriesType: settings.sonarr.seriesType,
    sonarrMonitor: settings.sonarr.monitor,
    sonarrSeasonFolder: settings.sonarr.seasonFolder,
    sonarrSearchOnAdd: settings.sonarr.searchOnAdd,
  };
}

function selectedCandidate(item: ReviewItem): LookupCandidate | null {
  return item.candidates.find((candidate) => candidate.token === item.selectedToken) ?? null;
}

function formatBytes(value?: number): string {
  if (typeof value !== "number" || value < 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount.toFixed(unit > 2 ? 1 : 0)} ${units[unit]} free`;
}

function Logo() {
  return (
    <div className="logo-mark" aria-hidden="true">
      <span>B</span>
    </div>
  );
}

function StatusPill({ status }: { status: Decision | string }) {
  const label: Record<string, string> = {
    pending: "Needs review",
    approved: "Approved",
    skipped: "Skipped",
    added: "Added",
    duplicate: "Already present",
    failed: "Failed",
  };
  return <span className={`status-pill status-${status}`}>{label[status] ?? status}</span>;
}

function Toggle({ checked, onChange, label, description }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="toggle-row">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`toggle ${checked ? "toggle-on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
      <span>
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
    </label>
  );
}

function Login({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ password }) });
      onAuthenticated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <Logo />
        <p className="eyebrow">Bulk media requests</p>
        <h1>Batcharr</h1>
        <p>Enter the server password to continue.</p>
        <label className="field">
          <span>Password</span>
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error ? <div className="alert alert-error">{error}</div> : null}
        <button className="button button-primary button-full" disabled={loading || !password}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

export function BatcharrApp() {
  const [sessionLoading, setSessionLoading] = useState(true);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("import");
  const [publicSettings, setPublicSettings] = useState<PublicSettings | null>(null);
  const [settings, setSettings] = useState<SettingsForm>(EMPTY_SETTINGS);
  const [radarrOptions, setRadarrOptions] = useState<ConnectionTestResult | null>(null);
  const [sonarrOptions, setSonarrOptions] = useState<ConnectionTestResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [globalError, setGlobalError] = useState("");

  const loadSettings = useCallback(async () => {
    const loaded = await api<PublicSettings>("/api/settings");
    setPublicSettings(loaded);
    setSettings(publicToForm(loaded));
    return loaded;
  }, []);

  const loadHistory = useCallback(async () => {
    const result = await api<{ history: HistoryEntry[] }>("/api/history?limit=150");
    setHistory(result.history);
  }, []);

  const initialize = useCallback(async () => {
    setSessionLoading(true);
    try {
      const session = await api<{ authEnabled: boolean; authenticated: boolean }>("/api/auth/session");
      setAuthEnabled(session.authEnabled);
      setAuthenticated(session.authenticated);
      if (session.authenticated) {
        await Promise.all([loadSettings(), loadHistory()]);
      }
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "Batcharr could not initialize.");
    } finally {
      setSessionLoading(false);
    }
  }, [loadHistory, loadSettings]);

  useEffect(() => {
    // Initialization is intentionally driven by the external session API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void initialize();
  }, [initialize]);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    setAuthenticated(false);
  }

  if (sessionLoading) {
    return (
      <main className="loading-shell">
        <Logo />
        <p>Starting Batcharr…</p>
      </main>
    );
  }

  if (authEnabled && !authenticated) {
    return <Login onAuthenticated={() => void initialize()} />;
  }

  const configured = Boolean(
    (publicSettings?.radarr.url && publicSettings.radarr.hasApiKey) ||
    (publicSettings?.sonarr.url && publicSettings.sonarr.hasApiKey),
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <Logo />
          <div>
            <h1>Batcharr</h1>
            <p>Resolve once. Confirm clearly. Request in bulk.</p>
          </div>
        </div>
        <div className="header-actions">
          <span className={`connection-dot ${configured ? "connected" : ""}`} />
          <span>{configured ? "Arr services configured" : "Setup required"}</span>
          {authEnabled ? (
            <button className="button button-ghost button-small" onClick={() => void logout()}>Sign out</button>
          ) : null}
        </div>
      </header>

      <nav className="tab-bar" aria-label="Primary navigation">
        {(["import", "history", "settings"] as Tab[]).map((tab) => (
          <button
            key={tab}
            className={activeTab === tab ? "active" : ""}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "import" ? "Bulk Import" : tab === "history" ? "History" : "Settings"}
          </button>
        ))}
      </nav>

      {globalError ? <div className="global-alert alert alert-error">{globalError}</div> : null}

      <main className="content-shell">
        {!configured && activeTab !== "settings" ? (
          <section className="setup-banner">
            <div>
              <p className="eyebrow">Connection required</p>
              <h2>Connect Radarr or Sonarr first.</h2>
              <p>Batcharr resolves titles through your own Arr instances and submits only the matches you approve.</p>
            </div>
            <button className="button button-primary" onClick={() => setActiveTab("settings")}>Open settings</button>
          </section>
        ) : null}

        {activeTab === "import" ? (
          <ImportPanel configured={configured} onHistoryChanged={loadHistory} />
        ) : null}
        {activeTab === "history" ? (
          <HistoryPanel history={history} onRefresh={loadHistory} />
        ) : null}
        {activeTab === "settings" ? (
          <SettingsPanel
            settings={settings}
            setSettings={setSettings}
            publicSettings={publicSettings}
            radarrOptions={radarrOptions}
            setRadarrOptions={setRadarrOptions}
            sonarrOptions={sonarrOptions}
            setSonarrOptions={setSonarrOptions}
            onSaved={async () => {
              await loadSettings();
              setGlobalError("");
            }}
          />
        ) : null}
      </main>
    </div>
  );
}

function ImportPanel({ configured, onHistoryChanged }: {
  configured: boolean;
  onHistoryChanged: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [defaultHint, setDefaultHint] = useState<MediaHint>("auto");
  const [review, setReview] = useState<ReviewItem[]>([]);
  const [resolving, setResolving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const counts = useMemo(() => {
    return review.reduce(
      (total, item) => {
        total[item.decision] += 1;
        return total;
      },
      { pending: 0, approved: 0, skipped: 0, added: 0, failed: 0, duplicate: 0 } as Record<Decision, number>,
    );
  }, [review]);

  async function resolveList() {
    setResolving(true);
    setError("");
    try {
      const response = await api<{ results: LookupItemResult[] }>("/api/lookup", {
        method: "POST",
        body: JSON.stringify({ text, defaultHint }),
      });
      setReview(response.results.map((result) => {
        const firstAvailable = result.candidates.find((candidate) => !candidate.alreadyExists) ?? result.candidates[0] ?? null;
        return {
          ...result,
          selectedToken: firstAvailable?.token ?? null,
          decision: firstAvailable?.alreadyExists ? "duplicate" : "pending",
          message: firstAvailable?.alreadyExists ? "The best match is already in the target library." : "",
        };
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not resolve the list.");
    } finally {
      setResolving(false);
    }
  }

  function updateItem(id: string, patch: Partial<ReviewItem>) {
    setReview((current) => current.map((item) => item.item.id === id ? { ...item, ...patch } : item));
  }

  function approveHighConfidence() {
    setReview((current) => current.map((item) => {
      const candidate = selectedCandidate(item);
      if (
        item.decision === "pending" &&
        candidate &&
        candidate.confidence === "high" &&
        !candidate.alreadyExists
      ) {
        return { ...item, decision: "approved", message: "High-confidence match approved." };
      }
      return item;
    }));
  }

  async function addApproved() {
    setSubmitting(true);
    setError("");
    const approvedIds = review.filter((item) => item.decision === "approved" && item.selectedToken).map((item) => item.item.id);

    for (const id of approvedIds) {
      const current = review.find((item) => item.item.id === id);
      if (!current?.selectedToken) continue;
      try {
        const result = await api<{ status: "added" | "duplicate"; message: string }>("/api/add", {
          method: "POST",
          body: JSON.stringify({ token: current.selectedToken }),
        });
        updateItem(id, {
          decision: result.status,
          message: result.message,
        });
      } catch (caught) {
        updateItem(id, {
          decision: "failed",
          message: caught instanceof Error ? caught.message : "Request failed.",
        });
      }
    }

    await onHistoryChanged();
    setSubmitting(false);
  }

  return (
    <div className="panel-stack">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">New batch</p>
          <h2>Paste a movie and television list.</h2>
          <p>
            One title per line. Add a year when it matters. Prefix a line with <code>movie:</code> or <code>tv:</code> to force its type.
          </p>
        </div>
        <div className="format-example">
          <span>Accepted examples</span>
          <code>The Thing (1982)</code>
          <code>movie: Alien</code>
          <code>tv: The Expanse (2015)</code>
        </div>
      </section>

      <section className="card import-card">
        <div className="import-toolbar">
          <label className="field compact-field">
            <span>Unlabeled titles</span>
            <select value={defaultHint} onChange={(event) => setDefaultHint(event.target.value as MediaHint)}>
              <option value="auto">Search movies and TV</option>
              <option value="movie">Treat as movies</option>
              <option value="series">Treat as TV series</option>
            </select>
          </label>
          <span className="line-counter">{text.split(/\r?\n/).filter((line) => line.trim()).length} entered lines</span>
        </div>
        <textarea
          className="title-list"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={"The Thing (1982)\nAlien\ntv: The Expanse\nDark (2017)"}
          spellCheck={false}
        />
        {error ? <div className="alert alert-error">{error}</div> : null}
        <div className="card-actions">
          <button
            className="button button-primary"
            disabled={!configured || resolving || !text.trim()}
            onClick={() => void resolveList()}
          >
            {resolving ? "Resolving titles…" : "Resolve list"}
          </button>
          {review.length ? (
            <button className="button button-secondary" onClick={() => setReview([])}>Clear review</button>
          ) : null}
        </div>
      </section>

      {review.length ? (
        <>
          <section className="review-summary card">
            <div>
              <p className="eyebrow">Review queue</p>
              <h3>{review.length} unique titles resolved</h3>
            </div>
            <div className="summary-counts">
              <span><strong>{counts.pending}</strong> pending</span>
              <span><strong>{counts.approved}</strong> approved</span>
              <span><strong>{counts.added}</strong> added</span>
              <span><strong>{counts.duplicate}</strong> present</span>
              <span><strong>{counts.failed}</strong> failed</span>
            </div>
            <div className="summary-actions">
              <button className="button button-secondary" onClick={approveHighConfidence}>Approve high-confidence</button>
              <button
                className="button button-primary"
                disabled={!counts.approved || submitting}
                onClick={() => void addApproved()}
              >
                {submitting ? "Adding approved titles…" : `Add approved (${counts.approved})`}
              </button>
            </div>
          </section>

          <section className="review-grid">
            {review.map((item) => {
              const candidate = selectedCandidate(item);
              return (
                <article className="review-card" key={item.item.id}>
                  <div className="review-card-topline">
                    <div>
                      <span className="submitted-label">Submitted</span>
                      <strong>{item.item.original}</strong>
                    </div>
                    <StatusPill status={item.decision} />
                  </div>

                  {candidate ? (
                    <div className="candidate-layout">
                      <div className="poster-frame">
                        {candidate.posterUrl ? <img src={candidate.posterUrl} alt="" /> : <span>No poster</span>}
                      </div>
                      <div className="candidate-details">
                        <div className="candidate-heading">
                          <div>
                            <span className={`media-badge media-${candidate.type}`}>
                              {candidate.type === "movie" ? "Movie" : "TV series"}
                            </span>
                            <h3>{candidate.title}</h3>
                            <p>{candidate.year ?? "Year unknown"}</p>
                          </div>
                          <div className={`confidence confidence-${candidate.confidence}`}>
                            <strong>{candidate.score}</strong>
                            <span>{candidate.confidence} match</span>
                          </div>
                        </div>
                        <p className="overview">{candidate.overview || "No overview was returned by the Arr lookup."}</p>
                        {item.candidates.length > 1 ? (
                          <label className="field">
                            <span>Selected match</span>
                            <select
                              value={item.selectedToken ?? ""}
                              disabled={["added", "duplicate"].includes(item.decision)}
                              onChange={(event) => {
                                const next = item.candidates.find((entry) => entry.token === event.target.value) ?? null;
                                updateItem(item.item.id, {
                                  selectedToken: event.target.value,
                                  decision: next?.alreadyExists ? "duplicate" : "pending",
                                  message: next?.alreadyExists ? "This match already exists in the target library." : "",
                                });
                              }}
                            >
                              {item.candidates.map((entry) => (
                                <option key={entry.token} value={entry.token}>
                                  {entry.type === "movie" ? "Movie" : "TV"} · {entry.title} {entry.year ? `(${entry.year})` : ""} · {entry.score}%{entry.alreadyExists ? " · already present" : ""}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        {candidate.alreadyExists ? <div className="alert alert-neutral">Already present in {candidate.type === "movie" ? "Radarr" : "Sonarr"}.</div> : null}
                        {item.message ? <div className={`alert ${item.decision === "failed" ? "alert-error" : "alert-neutral"}`}>{item.message}</div> : null}
                        <div className="candidate-actions">
                          <button
                            className="button button-primary"
                            disabled={candidate.alreadyExists || ["added", "duplicate"].includes(item.decision)}
                            onClick={() => updateItem(item.item.id, { decision: "approved", message: "Match approved." })}
                          >
                            Yes, request this
                          </button>
                          <button
                            className="button button-ghost"
                            disabled={["added", "duplicate"].includes(item.decision)}
                            onClick={() => updateItem(item.item.id, { decision: "skipped", message: "Skipped by reviewer." })}
                          >
                            Skip
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="no-match">
                      <strong>No usable match</strong>
                      <p>{item.error || "The configured Arr services returned no candidates."}</p>
                      <button className="button button-ghost" onClick={() => updateItem(item.item.id, { decision: "skipped" })}>Skip</button>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        </>
      ) : null}
    </div>
  );
}

function HistoryPanel({ history, onRefresh }: {
  history: HistoryEntry[];
  onRefresh: () => Promise<void>;
}) {
  return (
    <section className="card history-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Audit trail</p>
          <h2>Request history</h2>
          <p>Successful additions, duplicates, and failures are retained in the Batcharr database.</p>
        </div>
        <button className="button button-secondary" onClick={() => void onRefresh()}>Refresh</button>
      </div>
      {history.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Status</th>
                <th>Result</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => (
                <tr key={entry.id}>
                  <td><strong>{entry.title}</strong>{entry.year ? <span> ({entry.year})</span> : null}</td>
                  <td>{entry.mediaType === "movie" ? "Movie" : "TV series"}</td>
                  <td><StatusPill status={entry.status} /></td>
                  <td>{entry.message}</td>
                  <td>{new Date(`${entry.createdAt.replace(" ", "T")}Z`).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <strong>No requests yet.</strong>
          <p>Approved items will appear here after Batcharr submits them.</p>
        </div>
      )}
    </section>
  );
}

function SettingsPanel({
  settings,
  setSettings,
  publicSettings,
  radarrOptions,
  setRadarrOptions,
  sonarrOptions,
  setSonarrOptions,
  onSaved,
}: {
  settings: SettingsForm;
  setSettings: React.Dispatch<React.SetStateAction<SettingsForm>>;
  publicSettings: PublicSettings | null;
  radarrOptions: ConnectionTestResult | null;
  setRadarrOptions: (value: ConnectionTestResult | null) => void;
  sonarrOptions: ConnectionTestResult | null;
  setSonarrOptions: (value: ConnectionTestResult | null) => void;
  onSaved: () => Promise<void>;
}) {
  const [testing, setTesting] = useState<"radarr" | "sonarr" | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function test(service: "radarr" | "sonarr") {
    setTesting(service);
    setMessage("");
    setError("");
    try {
      const result = await api<ConnectionTestResult>("/api/connections/test", {
        method: "POST",
        body: JSON.stringify({
          service,
          url: service === "radarr" ? settings.radarrUrl : settings.sonarrUrl,
          apiKey: service === "radarr" ? settings.radarrApiKey : settings.sonarrApiKey,
        }),
      });
      if (service === "radarr") {
        setRadarrOptions(result);
        setSettings((current) => ({
          ...current,
          radarrRootFolderPath: current.radarrRootFolderPath || result.rootFolders[0]?.path || "",
          radarrQualityProfileId: current.radarrQualityProfileId ?? result.qualityProfiles[0]?.id ?? null,
        }));
      } else {
        setSonarrOptions(result);
        setSettings((current) => ({
          ...current,
          sonarrRootFolderPath: current.sonarrRootFolderPath || result.rootFolders[0]?.path || "",
          sonarrQualityProfileId: current.sonarrQualityProfileId ?? result.qualityProfiles[0]?.id ?? null,
        }));
      }
      setMessage(`${result.instanceName} ${result.version} connected through ${result.apiVersion}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Connection test failed.");
    } finally {
      setTesting(null);
    }
  }

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await api("/api/settings", { method: "PUT", body: JSON.stringify(settings) });
      await onSaved();
      setSettings((current) => ({ ...current, radarrApiKey: "", sonarrApiKey: "" }));
      setMessage("Settings saved. API keys remain server-side and are not returned to this page.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Settings could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel-stack">
      <section className="section-heading settings-heading">
        <div>
          <p className="eyebrow">Server configuration</p>
          <h2>Arr connections and request defaults</h2>
          <p>Use the URLs visible to the Batcharr container, not necessarily the URLs used by your desktop browser.</p>
        </div>
      </section>

      {message ? <div className="alert alert-success">{message}</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="settings-grid">
        <section className="card service-card">
          <div className="service-heading">
            <div className="service-icon radarr-icon">R</div>
            <div>
              <p className="eyebrow">Movies</p>
              <h3>Radarr</h3>
            </div>
            {radarrOptions ? <span className="connected-label">Connected</span> : null}
          </div>

          <label className="field">
            <span>Radarr URL</span>
            <input
              value={settings.radarrUrl}
              onChange={(event) => setSettings((current) => ({ ...current, radarrUrl: event.target.value }))}
              placeholder="http://radarr:7878"
            />
          </label>
          <label className="field">
            <span>API key</span>
            <input
              type="password"
              value={settings.radarrApiKey}
              onChange={(event) => setSettings((current) => ({ ...current, radarrApiKey: event.target.value }))}
              placeholder={publicSettings?.radarr.hasApiKey ? "Saved — leave blank to keep" : "Paste Radarr API key"}
              autoComplete="off"
            />
          </label>
          <button
            className="button button-secondary button-full"
            disabled={testing !== null || !settings.radarrUrl || (!settings.radarrApiKey && !publicSettings?.radarr.hasApiKey)}
            onClick={() => void test("radarr")}
          >
            {testing === "radarr" ? "Testing Radarr…" : "Test and load Radarr options"}
          </button>

          <div className="divider" />

          <label className="field">
            <span>Root folder</span>
            {radarrOptions ? (
              <select
                value={settings.radarrRootFolderPath}
                onChange={(event) => setSettings((current) => ({ ...current, radarrRootFolderPath: event.target.value }))}
              >
                <option value="">Select a root folder</option>
                {radarrOptions.rootFolders.map((folder) => (
                  <option key={folder.id} value={folder.path}>{folder.path} {formatBytes(folder.freeSpace) ? `— ${formatBytes(folder.freeSpace)}` : ""}</option>
                ))}
              </select>
            ) : (
              <input
                value={settings.radarrRootFolderPath}
                onChange={(event) => setSettings((current) => ({ ...current, radarrRootFolderPath: event.target.value }))}
                placeholder="Test the connection to load folders"
              />
            )}
          </label>
          <label className="field">
            <span>Quality profile</span>
            {radarrOptions ? (
              <select
                value={settings.radarrQualityProfileId ?? ""}
                onChange={(event) => setSettings((current) => ({ ...current, radarrQualityProfileId: Number(event.target.value) || null }))}
              >
                <option value="">Select a profile</option>
                {radarrOptions.qualityProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
              </select>
            ) : (
              <input
                type="number"
                value={settings.radarrQualityProfileId ?? ""}
                onChange={(event) => setSettings((current) => ({ ...current, radarrQualityProfileId: Number(event.target.value) || null }))}
                placeholder="Profile ID"
              />
            )}
          </label>
          <label className="field">
            <span>Minimum availability</span>
            <select
              value={settings.radarrMinimumAvailability}
              onChange={(event) => setSettings((current) => ({ ...current, radarrMinimumAvailability: event.target.value }))}
            >
              <option value="announced">Announced</option>
              <option value="inCinemas">In cinemas</option>
              <option value="released">Released</option>
              <option value="preDB">PreDB</option>
            </select>
          </label>
          <Toggle
            checked={settings.radarrMonitored}
            onChange={(checked) => setSettings((current) => ({ ...current, radarrMonitored: checked }))}
            label="Monitor added movies"
          />
          <Toggle
            checked={settings.radarrSearchOnAdd}
            onChange={(checked) => setSettings((current) => ({ ...current, radarrSearchOnAdd: checked }))}
            label="Search immediately"
            description="Starts an interactive search after the movie is added."
          />
        </section>

        <section className="card service-card">
          <div className="service-heading">
            <div className="service-icon sonarr-icon">S</div>
            <div>
              <p className="eyebrow">Television</p>
              <h3>Sonarr</h3>
            </div>
            {sonarrOptions ? <span className="connected-label">Connected · {sonarrOptions.apiVersion}</span> : null}
          </div>

          <label className="field">
            <span>Sonarr URL</span>
            <input
              value={settings.sonarrUrl}
              onChange={(event) => setSettings((current) => ({ ...current, sonarrUrl: event.target.value }))}
              placeholder="http://sonarr:8989"
            />
          </label>
          <label className="field">
            <span>API key</span>
            <input
              type="password"
              value={settings.sonarrApiKey}
              onChange={(event) => setSettings((current) => ({ ...current, sonarrApiKey: event.target.value }))}
              placeholder={publicSettings?.sonarr.hasApiKey ? "Saved — leave blank to keep" : "Paste Sonarr API key"}
              autoComplete="off"
            />
          </label>
          <button
            className="button button-secondary button-full"
            disabled={testing !== null || !settings.sonarrUrl || (!settings.sonarrApiKey && !publicSettings?.sonarr.hasApiKey)}
            onClick={() => void test("sonarr")}
          >
            {testing === "sonarr" ? "Testing Sonarr…" : "Test and load Sonarr options"}
          </button>

          <div className="divider" />

          <label className="field">
            <span>Root folder</span>
            {sonarrOptions ? (
              <select
                value={settings.sonarrRootFolderPath}
                onChange={(event) => setSettings((current) => ({ ...current, sonarrRootFolderPath: event.target.value }))}
              >
                <option value="">Select a root folder</option>
                {sonarrOptions.rootFolders.map((folder) => (
                  <option key={folder.id} value={folder.path}>{folder.path} {formatBytes(folder.freeSpace) ? `— ${formatBytes(folder.freeSpace)}` : ""}</option>
                ))}
              </select>
            ) : (
              <input
                value={settings.sonarrRootFolderPath}
                onChange={(event) => setSettings((current) => ({ ...current, sonarrRootFolderPath: event.target.value }))}
                placeholder="Test the connection to load folders"
              />
            )}
          </label>
          <label className="field">
            <span>Quality profile</span>
            {sonarrOptions ? (
              <select
                value={settings.sonarrQualityProfileId ?? ""}
                onChange={(event) => setSettings((current) => ({ ...current, sonarrQualityProfileId: Number(event.target.value) || null }))}
              >
                <option value="">Select a profile</option>
                {sonarrOptions.qualityProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
              </select>
            ) : (
              <input
                type="number"
                value={settings.sonarrQualityProfileId ?? ""}
                onChange={(event) => setSettings((current) => ({ ...current, sonarrQualityProfileId: Number(event.target.value) || null }))}
                placeholder="Profile ID"
              />
            )}
          </label>
          <div className="two-column-fields">
            <label className="field">
              <span>Series type</span>
              <select
                value={settings.sonarrSeriesType}
                onChange={(event) => setSettings((current) => ({ ...current, sonarrSeriesType: event.target.value }))}
              >
                <option value="standard">Standard</option>
                <option value="daily">Daily</option>
                <option value="anime">Anime</option>
              </select>
            </label>
            <label className="field">
              <span>Monitor</span>
              <select
                value={settings.sonarrMonitor}
                onChange={(event) => setSettings((current) => ({ ...current, sonarrMonitor: event.target.value }))}
              >
                <option value="all">All episodes</option>
                <option value="future">Future episodes</option>
                <option value="missing">Missing episodes</option>
                <option value="existing">Existing episodes</option>
                <option value="firstSeason">First season</option>
                <option value="lastSeason">Latest season</option>
                <option value="pilot">Pilot only</option>
                <option value="none">None</option>
              </select>
            </label>
          </div>
          <Toggle
            checked={settings.sonarrSeasonFolder}
            onChange={(checked) => setSettings((current) => ({ ...current, sonarrSeasonFolder: checked }))}
            label="Use season folders"
          />
          <Toggle
            checked={settings.sonarrSearchOnAdd}
            onChange={(checked) => setSettings((current) => ({ ...current, sonarrSearchOnAdd: checked }))}
            label="Search missing episodes immediately"
          />
        </section>
      </div>

      <section className="save-bar">
        <div>
          <strong>Credentials are encrypted at rest.</strong>
          <span>Keep the same BATCHARR_SECRET when moving or restoring the container.</span>
        </div>
        <button className="button button-primary" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save settings"}
        </button>
      </section>
    </div>
  );
}
