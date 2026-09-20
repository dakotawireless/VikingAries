import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Boxes,
  CheckCircle2,
  Cloud,
  Database,
  Github,
  KeyRound,
  Link2,
  Logs,
  Plus,
  Rocket,
  Save,
  Settings,
  ShieldCheck,
  Trash2,
  Workflow,
  XCircle,
  Zap,
} from "lucide-react";

function useProjectStorage(projectId, key, initialValue) {
  const storageKey = `viking-aries:${projectId}:${key}`;
  const [value, setValue] = useState(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Browser storage is optional; keep the UI usable without it.
    }
  }, [storageKey, value]);

  return [value, setValue];
}

function PageHeader({ icon: Icon, title, description, action }) {
  return (
    <div className="workspace-page-header">
      <div className="workspace-page-heading">
        <span className="workspace-page-icon"><Icon size={18} /></span>
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

function StatusPill({ status }) {
  const normalized = String(status || "").toLowerCase();
  const good = ["connected", "active", "configured", "healthy", "success"].includes(normalized);
  return (
    <span className={good ? "status-pill good" : "status-pill neutral"}>
      {good ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
      {status}
    </span>
  );
}

function ArchitectureView({ project }) {
  const defaultLinks =
    project.id === "timekeeper"
      ? [
          { id: "timekeeper-pos", from: "Timekeeper", relation: "reads commissions from", to: "Dakota Wireless POS" },
          { id: "timekeeper-cloudflare", from: "Timekeeper", relation: "deployed through", to: "Cloudflare" },
        ]
      : [];

  const [links, setLinks] = useProjectStorage(project.id, "architecture-links", defaultLinks);
  const [draft, setDraft] = useState({ from: project.name, relation: "connects to", to: "" });

  const addLink = () => {
    if (!draft.to.trim()) return;
    setLinks((current) => [
      ...current,
      {
        id: `rel-${Date.now()}`,
        from: draft.from.trim() || project.name,
        relation: draft.relation.trim() || "connects to",
        to: draft.to.trim(),
      },
    ]);
    setDraft({ from: project.name, relation: "connects to", to: "" });
  };

  return (
    <WorkspacePage>
      <PageHeader
        icon={Workflow}
        title="Architecture"
        description={`Map how ${project.name} connects to the rest of your workspace.`}
      />

      <section className="workspace-card">
        <div className="card-heading-row">
          <div>
            <h2>Project relationships</h2>
            <p>These relationships become part of Viking Aries' shared project context.</p>
          </div>
          <span className="count-badge">{links.length}</span>
        </div>

        <div className="relationship-list">
          {links.length === 0 && <EmptyState text="No project relationships recorded yet." />}
          {links.map((link) => (
            <div className="relationship-row" key={link.id}>
              <strong>{link.from}</strong>
              <span>{link.relation}</span>
              <strong>{link.to}</strong>
              <button type="button" className="icon-action danger" onClick={() => setLinks((items) => items.filter((item) => item.id !== link.id))}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>

        <div className="inline-form architecture-form">
          <input value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} aria-label="From project" />
          <input value={draft.relation} onChange={(e) => setDraft({ ...draft, relation: e.target.value })} aria-label="Relationship" />
          <input value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} placeholder="Target project or service" aria-label="Target" />
          <button type="button" className="primary-action" onClick={addLink}><Plus size={15} /> Add</button>
        </div>
      </section>
    </WorkspacePage>
  );
}

function IntegrationsView({ project }) {
  const [integrations, setIntegrations] = useProjectStorage(project.id, "integrations", [
    { id: "github", name: "GitHub", icon: "github", status: "Connected", detail: "Source control and code changes" },
    { id: "cloudflare", name: "Cloudflare", icon: "cloud", status: "Connected", detail: "Builds, Worker runtime, and deployment" },
    { id: "supabase", name: "Supabase", icon: "database", status: "Not configured", detail: "Viking Aries relational application data" },
    { id: "convex", name: "Convex", icon: "boxes", status: "Available", detail: "Existing migrated app backends" },
  ]);

  const icons = { github: Github, cloud: Cloud, database: Database, boxes: Boxes };

  const toggle = (id) => {
    setIntegrations((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, status: item.status === "Connected" ? "Not configured" : "Connected" }
          : item
      )
    );
  };

  return (
    <WorkspacePage>
      <PageHeader icon={Link2} title="Integrations" description={`External services available to ${project.name}.`} />
      <div className="workspace-grid two-column">
        {integrations.map((integration) => {
          const Icon = icons[integration.icon] || Link2;
          return (
            <section className="workspace-card integration-card" key={integration.id}>
              <div className="integration-icon"><Icon size={19} /></div>
              <div className="integration-copy">
                <div className="card-heading-row compact">
                  <h2>{integration.name}</h2>
                  <StatusPill status={integration.status} />
                </div>
                <p>{integration.detail}</p>
                <button type="button" className="secondary-action" onClick={() => toggle(integration.id)}>
                  {integration.status === "Connected" ? "Disconnect locally" : "Mark connected"}
                </button>
              </div>
            </section>
          );
        })}
      </div>
      <InfoBanner text="These controls currently store project integration metadata. Live OAuth/account connection flows are the next wiring step." />
    </WorkspacePage>
  );
}

function BackendView({ project }) {
  const [backend, setBackend] = useProjectStorage(project.id, "backend", {
    provider: project.backend || (project.id === "viking-aries" ? "Supabase" : "Convex"),
    productionUrl: project.backendUrl || "",
    notes: project.repository ? `Source: ${project.repository}` : "",
  });

  return (
    <WorkspacePage>
      <PageHeader icon={Database} title="Backend" description={`Choose and document the backend used by ${project.name}.`} />
      <section className="workspace-card settings-form">
        <label>
          <span>Provider</span>
          <select value={backend.provider} onChange={(e) => setBackend({ ...backend, provider: e.target.value })}>
            <option>Convex</option>
            <option>Supabase</option>
            <option>Cloudflare</option>
            <option>None</option>
          </select>
        </label>
        <label>
          <span>Production URL / deployment</span>
          <input value={backend.productionUrl} onChange={(e) => setBackend({ ...backend, productionUrl: e.target.value })} placeholder="Backend endpoint or deployment name" />
        </label>
        <label>
          <span>Notes</span>
          <textarea value={backend.notes} onChange={(e) => setBackend({ ...backend, notes: e.target.value })} placeholder="Schema notes, migration status, API conventions..." />
        </label>
        <div className="form-status"><CheckCircle2 size={15} /> Saved automatically in this browser</div>
      </section>
    </WorkspacePage>
  );
}

function DeploymentsView({ project }) {
  const [deployments, setDeployments] = useProjectStorage(project.id, "deployments", [
    {
      id: "prod",
      environment: "Production",
      provider: "Cloudflare",
      status: project.status || "Active",
      url: project.deploymentUrl || (project.id === "viking-aries" ? "https://vikingaries.dakotawireless.net" : ""),
    },
  ]);

  const addDeployment = () => {
    setDeployments((current) => [
      ...current,
      { id: `deploy-${Date.now()}`, environment: "Preview", provider: "Cloudflare", status: "Configured", url: "" },
    ]);
  };

  return (
    <WorkspacePage>
      <PageHeader
        icon={Rocket}
        title="Deployments"
        description={`Track production and preview environments for ${project.name}.`}
        action={<button type="button" className="primary-action" onClick={addDeployment}><Plus size={15} /> Add environment</button>}
      />
      <section className="workspace-card">
        <div className="deployment-list">
          {deployments.map((deployment) => (
            <div className="deployment-row" key={deployment.id}>
              <span className="deployment-icon"><Rocket size={17} /></span>
              <div>
                <strong>{deployment.environment}</strong>
                <small>{deployment.provider}{deployment.url ? ` · ${deployment.url}` : ""}</small>
              </div>
              <StatusPill status={deployment.status} />
              <button type="button" className="icon-action danger" onClick={() => setDeployments((items) => items.filter((item) => item.id !== deployment.id))}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      </section>
      <InfoBanner text="The next deployment step is live Cloudflare build history and one-click preview/production deploy actions." />
    </WorkspacePage>
  );
}

function LogsView({ project }) {
  const [logs, setLogs] = useProjectStorage(project.id, "logs", [
    { id: "log-1", time: "Now", level: "info", message: `${project.name} workspace loaded` },
    { id: "log-2", time: "Earlier", level: "success", message: "Project context initialized" },
  ]);
  const [filter, setFilter] = useState("");

  const visible = useMemo(
    () => logs.filter((item) => item.message.toLowerCase().includes(filter.toLowerCase())),
    [logs, filter]
  );

  return (
    <WorkspacePage>
      <PageHeader
        icon={Logs}
        title="Logs"
        description={`Local Viking Aries event log for ${project.name}.`}
        action={<button type="button" className="secondary-action" onClick={() => setLogs([])}>Clear</button>}
      />
      <section className="workspace-card">
        <input className="log-search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter logs..." />
        <div className="log-list">
          {visible.length === 0 && <EmptyState text="No log entries match this filter." />}
          {visible.map((log) => (
            <div className="log-row" key={log.id}>
              <span className={`log-level ${log.level}`}>{log.level}</span>
              <span className="log-time">{log.time}</span>
              <span>{log.message}</span>
            </div>
          ))}
        </div>
      </section>
    </WorkspacePage>
  );
}

function SecretsView({ project }) {
  const [secrets, setSecrets] = useProjectStorage(project.id, "secret-metadata", [
    ...(project.id === "viking-aries" ? [{ id: "openai", name: "OPENAI_API_KEY", scope: "Cloudflare Secrets Store", status: "Configured" }] : []),
  ]);
  const [name, setName] = useState("");

  const addSecretMetadata = () => {
    if (!name.trim()) return;
    setSecrets((current) => [
      ...current,
      { id: `secret-${Date.now()}`, name: name.trim(), scope: "Runtime", status: "Not configured" },
    ]);
    setName("");
  };

  return (
    <WorkspacePage>
      <PageHeader icon={KeyRound} title="Secrets" description="Track secret names and status without exposing secret values to the AI." />
      <InfoBanner text="Viking Aries stores only secret metadata here. Raw secret values belong in the provider's secure secret store and are never added to chat context." />
      <section className="workspace-card">
        <div className="secret-list">
          {secrets.length === 0 && <EmptyState text="No secret metadata has been registered for this project." />}
          {secrets.map((secret) => (
            <div className="secret-row" key={secret.id}>
              <span className="secret-icon"><KeyRound size={16} /></span>
              <div><strong>{secret.name}</strong><small>{secret.scope}</small></div>
              <StatusPill status={secret.status} />
              <button type="button" className="icon-action danger" onClick={() => setSecrets((items) => items.filter((item) => item.id !== secret.id))}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
        <div className="inline-form secret-form">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Secret name, e.g. API_TOKEN" />
          <button type="button" className="primary-action" onClick={addSecretMetadata}><Plus size={15} /> Register name</button>
        </div>
      </section>
    </WorkspacePage>
  );
}

function SettingsView({ project }) {
  const [settings, setSettings] = useProjectStorage(project.id, "settings", {
    displayName: project.name,
    defaultBranch: "main",
    previewUrl: project.id === "viking-aries" ? "https://vikingaries.dakotawireless.net" : "",
    allowCrossProjectRead: true,
    requireCrossProjectWriteApproval: true,
  });
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSettings({ ...settings });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <WorkspacePage>
      <PageHeader icon={Settings} title="Settings" description={`Project-level behavior for ${project.name}.`} />
      <section className="workspace-card settings-form">
        <label><span>Display name</span><input value={settings.displayName} onChange={(e) => setSettings({ ...settings, displayName: e.target.value })} /></label>
        <label><span>Default branch</span><input value={settings.defaultBranch} onChange={(e) => setSettings({ ...settings, defaultBranch: e.target.value })} /></label>
        <label><span>Preview URL</span><input value={settings.previewUrl} onChange={(e) => setSettings({ ...settings, previewUrl: e.target.value })} placeholder="https://..." /></label>
        <label className="toggle-setting">
          <input type="checkbox" checked={settings.allowCrossProjectRead} onChange={(e) => setSettings({ ...settings, allowCrossProjectRead: e.target.checked })} />
          <span><strong>Allow shared project awareness</strong><small>AI may read registered relationships and metadata from related projects.</small></span>
        </label>
        <label className="toggle-setting">
          <input type="checkbox" checked={settings.requireCrossProjectWriteApproval} onChange={(e) => setSettings({ ...settings, requireCrossProjectWriteApproval: e.target.checked })} />
          <span><strong>Require approval for cross-project writes</strong><small>Changes outside the selected project must be explicitly approved.</small></span>
        </label>
        <div className="form-actions">
          <button type="button" className="primary-action" onClick={save}><Save size={15} /> Save settings</button>
          {saved && <span className="save-confirmation"><CheckCircle2 size={14} /> Saved</span>}
        </div>
      </section>
    </WorkspacePage>
  );
}

function ActivityView({ project }) {
  const activity = [
    { icon: Activity, title: "Workspace opened", detail: project.name, time: "Now" },
    { icon: Link2, title: "Project context available", detail: "Shared project awareness enabled", time: "Today" },
    { icon: ShieldCheck, title: "Runtime secret binding verified", detail: "Sensitive values remain provider-managed", time: "Today" },
  ];

  return (
    <WorkspacePage>
      <PageHeader icon={Activity} title="Activity" description={`Recent Viking Aries activity for ${project.name}.`} />
      <section className="workspace-card activity-feed">
        {activity.map(({ icon: Icon, title, detail, time }) => (
          <div className="activity-feed-row" key={title}>
            <span className="activity-feed-icon"><Icon size={16} /></span>
            <div><strong>{title}</strong><small>{detail}</small></div>
            <time>{time}</time>
          </div>
        ))}
      </section>
    </WorkspacePage>
  );
}

function AutomationsView({ project }) {
  const [items, setItems] = useProjectStorage(project.id, "automations", []);
  const [name, setName] = useState("");
  const [cadence, setCadence] = useState("On demand");

  const add = () => {
    if (!name.trim()) return;
    setItems((current) => [...current, { id: `auto-${Date.now()}`, name: name.trim(), cadence, enabled: true }]);
    setName("");
  };

  return (
    <WorkspacePage>
      <PageHeader icon={Zap} title="Automations" description={`Define recurring or event-driven work for ${project.name}.`} />
      <section className="workspace-card">
        <div className="automation-list">
          {items.length === 0 && <EmptyState text="No automations configured yet." />}
          {items.map((item) => (
            <div className="automation-row" key={item.id}>
              <span className="automation-icon"><Zap size={16} /></span>
              <div><strong>{item.name}</strong><small>{item.cadence}</small></div>
              <label className="mini-toggle">
                <input type="checkbox" checked={item.enabled} onChange={(e) => setItems((current) => current.map((row) => row.id === item.id ? { ...row, enabled: e.target.checked } : row))} />
                <span />
              </label>
              <button type="button" className="icon-action danger" onClick={() => setItems((current) => current.filter((row) => row.id !== item.id))}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
        <div className="inline-form automation-form">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Automation name" />
          <select value={cadence} onChange={(e) => setCadence(e.target.value)}>
            <option>On demand</option>
            <option>Every login</option>
            <option>Daily</option>
            <option>Weekly</option>
          </select>
          <button type="button" className="primary-action" onClick={add}><Plus size={15} /> Add</button>
        </div>
      </section>
      <InfoBanner text="Scheduling/execution is scaffolded here; actual background runs will be wired through the Viking Aries backend later." />
    </WorkspacePage>
  );
}

function WorkspacePage({ children }) {
  return <main className="workspace utility-workspace"><div className="utility-scroll">{children}</div></main>;
}

function EmptyState({ text }) {
  return <div className="utility-empty">{text}</div>;
}

function InfoBanner({ text }) {
  return <div className="info-banner"><ShieldCheck size={15} /><span>{text}</span></div>;
}

export default function WorkspaceView({ view, project }) {
  switch (view) {
    case "Architecture":
      return <ArchitectureView project={project} />;
    case "Integrations":
      return <IntegrationsView project={project} />;
    case "Backend":
      return <BackendView project={project} />;
    case "Deployments":
      return <DeploymentsView project={project} />;
    case "Logs":
      return <LogsView project={project} />;
    case "Secrets":
      return <SecretsView project={project} />;
    case "Settings":
      return <SettingsView project={project} />;
    case "Activity":
      return <ActivityView project={project} />;
    case "Automations":
      return <AutomationsView project={project} />;
    default:
      return <WorkspacePage><EmptyState text="Select a workspace section." /></WorkspacePage>;
  }
}
