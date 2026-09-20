import { useEffect, useMemo, useState } from "react";
import {
  Box,
  CheckCircle2,
  Cloud,
  Code2,
  Database,
  FileImage,
  FlaskConical,
  Github,
  Globe2,
  KeyRound,
  Link2,
  Mail,
  Monitor,
  PackageCheck,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Settings,
  Shield,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  Wrench,
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
      // Local project metadata remains optional until VA persistence is wired.
    }
  }, [storageKey, value]);

  return [value, setValue];
}

function useSharedStorage(key, initialValue) {
  const storageKey = `viking-aries:personal:${key}`;
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
      // Shared integration metadata is temporary until VA's Convex persistence is wired.
    }
  }, [storageKey, value]);

  return [value, setValue];
}

const sharedIntegrationDefaults = [
  {
    id: "github",
    name: "GitHub",
    provider: "GitHub",
    account: "dakotawireless",
    status: "Needs connection",
    capabilities: "Read repositories, edit files, commit changes, branches, pull requests",
    purpose: "Shared source control connection for PERSONAL projects",
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    provider: "Cloudflare",
    account: "",
    status: "Needs connection",
    capabilities: "Deployments, builds, Workers, Pages, logs, bindings",
    purpose: "Shared hosting and deployment connection",
  },
  {
    id: "convex",
    name: "Convex",
    provider: "Convex",
    account: "",
    status: "Needs connection",
    capabilities: "Projects, deployments, functions, schema, data, environment configuration",
    purpose: "Shared backend and database connection",
  },
  {
    id: "drive",
    name: "Google Drive",
    provider: "Google",
    account: "",
    status: "Needs connection",
    capabilities: "Search, read, register, and upload project files",
    purpose: "Shared project files and durable document references",
  },
  {
    id: "gmail",
    name: "Gmail",
    provider: "Google",
    account: "",
    status: "Needs connection",
    capabilities: "Read and send mail when explicitly authorized",
    purpose: "Shared email connection for project workflows",
  },
];

function projectIntegrationDefaults(project) {
  return {
    github: {
      enabled: Boolean(project?.repository),
      repository: project?.repository || (project?.id === "viking-aries" ? "dakotawireless/VikingAries" : ""),
      branch: "main",
    },
    cloudflare: {
      enabled: Boolean(project?.deploymentUrl),
      project: "",
      worker: project?.id === "timekeeper" ? "timekeeper-app" : project?.id === "viking-aries" ? "vikingaries" : "",
      deploymentUrl: project?.deploymentUrl || "",
    },
    convex: {
      enabled: project?.backend === "Convex" || Boolean(project?.backendUrl),
      deployment: project?.id === "timekeeper" ? "aware-caiman-251" : "",
      url: project?.backendUrl || "",
      dashboardUrl: project?.convexDashboardUrl || "",
    },
    drive: {
      enabled: false,
      folderUrl: "",
    },
    gmail: {
      enabled: project?.id === "timekeeper",
      identity: "",
    },
  };
}

function timekeeperDefaults() {
  return {
    features: [
      { id: "time-clock", name: "Employee Time Clock", area: "Core", status: "Active", notes: "PIN clock-in/out, breaks, decimal hours, registered-browser enforcement." },
      { id: "time-records", name: "Time Records", area: "Admin", status: "Active", notes: "Admin edits, weekly summaries, labor cost, commission-inclusive totals." },
      { id: "employees", name: "Employee Management", area: "Admin", status: "Active", notes: "Contact, pay rate, POS access, commission mapping, direct-deposit fields." },
      { id: "payroll", name: "Payroll", area: "Admin", status: "Active", notes: "Weekly payroll processing, commission, deductions, history." },
      { id: "commission", name: "Dakota Wireless Commission Sync", area: "Integration", status: "Active", notes: "Server-side sync from Dakota Wireless POS with manual refresh and mapped POS user IDs." },
      { id: "portal", name: "Employee Self-Service Portal", area: "Employee", status: "Active", notes: "Email one-time code, timecards, pay-statement foundation, admin preview." },
      { id: "devices", name: "Registered Timeclock Devices", area: "Security", status: "Active", notes: "Employee clock-in/out is blocked on unregistered browsers." },
      { id: "bonus", name: "Friday Bonus Report", area: "Automation", status: "Active", notes: "Weekly Gmail report generated from clock-in records." },
    ],
    access: [
      { id: "owner", role: "Owner", method: "4-digit admin PIN", scope: "Full admin access", status: "Active" },
      { id: "manager", role: "Manager", method: "4-digit admin PIN", scope: "Admin dashboard", status: "Active" },
      { id: "employee-clock", role: "Employee — Clock", method: "4-digit employee PIN", scope: "Registered browser only", status: "Active" },
      { id: "employee-portal", role: "Employee — Portal", method: "Email + 6-digit one-time code", scope: "Own timecards / pay statements", status: "Active" },
    ],
    files: [
      { id: "bear-paw", name: "Bear Paw.png", type: "Brand asset", location: "TimeKeeper-App/public/Bear Paw.png", status: "In repository" },
      { id: "screenshots", name: "Project screenshots & mockups", type: "Shared working media", location: "Viking Aries Files & Media", status: "Ready for uploads" },
      { id: "exports", name: "Payroll / diagnostic exports", type: "Project documents", location: "Attach or register as needed", status: "Available" },
    ],
    integrations: [
      { id: "github", name: "GitHub", provider: "dakotawireless/TimeKeeper-App", purpose: "Source control", status: "Connected" },
      { id: "cloudflare", name: "Cloudflare", provider: "Workers", purpose: "Production hosting and builds", status: "Connected" },
      { id: "convex", name: "Convex", provider: "aware-caiman-251", purpose: "Database, functions, crons", status: "Connected" },
      { id: "gmail", name: "Gmail", provider: "SMTP", purpose: "Employee login codes and automated email", status: "Connected" },
      { id: "dakota-pos", name: "Dakota Wireless POS", provider: "Commission API", purpose: "Weekly employee commission sync", status: "Connected" },
      { id: "drive", name: "Google Drive", provider: "Google Drive", purpose: "Project files / documents when needed", status: "Available" },
      { id: "supabase", name: "Supabase", provider: "Supabase", purpose: "Not currently used by Timekeeper", status: "Not used" },
    ],
    tables: [
      { name: "employees", purpose: "Employees, contact details, payroll settings, POS mapping", indexes: "Primary collection" },
      { name: "registeredDevices", purpose: "Authorized timeclock browser registrations", indexes: "by_deviceId" },
      { name: "employeeLoginCodes", purpose: "Short-lived employee portal verification codes", indexes: "by_employee" },
      { name: "employeeSessions", purpose: "Employee self-service sessions", indexes: "by_token, by_employee" },
      { name: "deductions", purpose: "Employee payroll deduction rules", indexes: "by_employee" },
      { name: "timeEntries", purpose: "Clock-in/out records and break types", indexes: "by_employee, by_clockIn" },
      { name: "employeeNotes", purpose: "Employee notes to management", indexes: "by_employee" },
      { name: "commissionEntries", purpose: "Manual and POS-synced weekly commission", indexes: "by_employee, by_employee_and_week, by_week" },
      { name: "payrollRecords", purpose: "Processed payroll snapshots", indexes: "by_weekStart" },
    ],
    backend: [
      { name: "employees", type: "Convex module", responsibility: "Employee CRUD and admin data", status: "Active" },
      { name: "timeEntries", type: "Convex module", responsibility: "Clock-in/out and time history", status: "Active" },
      { name: "payroll", type: "Convex module", responsibility: "Weekly payroll processing", status: "Active" },
      { name: "commission", type: "Convex module", responsibility: "Manual commission records", status: "Active" },
      { name: "dakotaWirelessCommission", type: "Convex action", responsibility: "Server-side Dakota Wireless POS commission sync", status: "Active" },
      { name: "employeeAuth / employeeAuthActions", type: "Convex query/action", responsibility: "Email OTP employee portal login", status: "Active" },
      { name: "devices", type: "Convex module", responsibility: "Timeclock browser registration", status: "Active" },
      { name: "emails / lib/gmail", type: "Node action + SMTP", responsibility: "Gmail delivery", status: "Active" },
      { name: "crons", type: "Convex scheduler", responsibility: "Friday bonus report", status: "Active" },
    ],
    automations: [
      { id: "bonus-report", name: "Friday Bonus Report", trigger: "Friday · 4:00 PM Mountain", action: "Calculate bonus eligibility and email owner", enabled: true },
      { id: "commission-sync", name: "Commission Refresh", trigger: "Payroll week open/change + manual refresh", action: "Fetch Dakota Wireless POS commission", enabled: true },
    ],
    diagnostics: [
      { id: "clock-flow", name: "Physical clock-in/out path", result: "Passed", detail: "Employee clock-in/out tested against live Convex data." },
      { id: "device-gate", name: "Registered-device enforcement", result: "Passed", detail: "Unregistered Edge browser blocked; registered browser allowed." },
      { id: "data-retention", name: "Existing data retention", result: "Passed", detail: "Existing Timekeeper records remained in the same Convex deployment." },
      { id: "decimal-hours", name: "Decimal-hours display", result: "Passed", detail: "Time Records and Payroll use decimal hours." },
      { id: "commission-labor", name: "Commission in labor cost", result: "Passed", detail: "Employee and aggregate labor cost include commission." },
      { id: "email", name: "Gmail automation path", result: "Configured", detail: "GMAIL_USER and GMAIL_APP_PASSWORD remain provider-managed in Convex." },
    ],
    versions: [
      { id: "device-gate", label: "Registered-device enforcement", ref: "3fae5961", note: "Blocks employee punch on unregistered browsers." },
      { id: "hercules-free", label: "Hercules runtime removed", ref: "current main", note: "GitHub + Cloudflare + Convex + Gmail SMTP." },
      { id: "portal", label: "Employee portal restored", ref: "84e41528", note: "Email OTP portal plus admin employee preview." },
    ],
    deployments: [
      { id: "prod", environment: "Production", provider: "Cloudflare Workers", status: "Active", url: "https://timekeeper-app.erik-f2c.workers.dev" },
    ],
    domains: [
      { id: "worker", host: "timekeeper-app.erik-f2c.workers.dev", type: "Cloudflare Workers", status: "Active", notes: "Current production URL" },
    ],
    secrets: [
      { id: "convex-key", name: "CONVEX_DEPLOY_KEY", provider: "Cloudflare", purpose: "Deploy Convex during Cloudflare build", status: "Configured" },
      { id: "gmail-user", name: "GMAIL_USER", provider: "Convex", purpose: "Gmail SMTP sender", status: "Configured" },
      { id: "gmail-pass", name: "GMAIL_APP_PASSWORD", provider: "Convex", purpose: "Gmail SMTP authentication", status: "Configured" },
    ],
    settings: {
      displayName: "Timekeeper",
      repository: "dakotawireless/TimeKeeper-App",
      defaultBranch: "main",
      productionUrl: "https://timekeeper-app.erik-f2c.workers.dev",
      backendProvider: "Convex",
      backendDeployment: "aware-caiman-251",
      backendUrl: "https://aware-caiman-251.convex.cloud",
      notes: "Independent production app managed by Viking Aries. Preserve existing data and working behavior unless a change is explicitly requested.",
    },
  };
}

function projectDefaults(project) {
  if (project.id === "timekeeper") return timekeeperDefaults();
  return {
    features: [],
    access: [],
    files: [],
    integrations: [
      { id: "github", name: "GitHub", provider: "Not configured", purpose: "Source control", status: "Available" },
      { id: "cloudflare", name: "Cloudflare", provider: "Not configured", purpose: "Hosting / deployment", status: "Available" },
      { id: "supabase", name: "Supabase", provider: "Not configured", purpose: "Database / backend", status: "Available" },
      { id: "convex", name: "Convex", provider: "Not configured", purpose: "Database / backend", status: "Available" },
      { id: "drive", name: "Google Drive", provider: "Not configured", purpose: "Files / documents", status: "Available" },
      { id: "gmail", name: "Gmail", provider: "Not configured", purpose: "Email", status: "Available" },
    ],
    tables: [],
    backend: [],
    automations: [],
    diagnostics: [],
    versions: [],
    deployments: [],
    domains: [],
    secrets: [],
    settings: {
      displayName: project.name,
      repository: project.repository || "",
      defaultBranch: "main",
      productionUrl: project.deploymentUrl || "",
      backendProvider: project.backend || "",
      backendDeployment: "",
      backendUrl: project.backendUrl || "",
      notes: "",
    },
  };
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
  const good = ["connected", "active", "configured", "healthy", "success", "passed", "in repository"].includes(normalized);
  return (
    <span className={good ? "status-pill good" : "status-pill neutral"}>
      {good ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
      {status}
    </span>
  );
}

function EditableListView({ project, storageKey, title, description, icon: Icon, defaults, columns, addLabel = "Add item" }) {
  const [items, setItems] = useProjectStorage(project.id, storageKey, defaults);
  const [draft, setDraft] = useState(() => Object.fromEntries(columns.map((column) => [column.key, ""])));

  const add = () => {
    const first = String(draft[columns[0].key] || "").trim();
    if (!first) return;
    setItems((current) => [
      ...current,
      { id: `${storageKey}-${Date.now()}`, ...draft },
    ]);
    setDraft(Object.fromEntries(columns.map((column) => [column.key, ""])));
  };

  const update = (id, key, value) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, [key]: value } : item));
  };

  return (
    <WorkspacePage>
      <PageHeader icon={Icon} title={title} description={description} />
      <section className="workspace-card">
        <div className="va-data-table">
          <div className="va-data-row va-data-head">
            {columns.map((column) => <span key={column.key}>{column.label}</span>)}
            <span />
          </div>
          {items.length === 0 && <EmptyState text={`No ${title.toLowerCase()} recorded yet.`} />}
          {items.map((item) => (
            <div className="va-data-row" key={item.id || item.name}>
              {columns.map((column) => (
                <input
                  key={column.key}
                  value={item[column.key] ?? ""}
                  onChange={(e) => update(item.id, column.key, e.target.value)}
                  aria-label={column.label}
                />
              ))}
              <button type="button" className="icon-action danger" onClick={() => setItems((current) => current.filter((row) => row.id !== item.id))}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>

        <div className="va-entry-panel">
          <div className="va-entry-title">{addLabel}</div>
          <div className="va-entry-grid" style={{ "--entry-cols": columns.length }}>
            {columns.map((column) => (
              <label key={column.key}>
                <span>{column.label}</span>
                <input
                  value={draft[column.key] ?? ""}
                  onChange={(e) => setDraft({ ...draft, [column.key]: e.target.value })}
                  placeholder={column.placeholder || ""}
                />
              </label>
            ))}
          </div>
          <button type="button" className="primary-action" onClick={add}><Plus size={15} /> {addLabel}</button>
        </div>
      </section>
    </WorkspacePage>
  );
}

function FeaturesView({ project }) {
  const defaults = projectDefaults(project).features;
  return <EditableListView
    project={project}
    storageKey="features-v2"
    title="Features"
    description={`Track what ${project.name} does, its current status, and implementation notes.`}
    icon={PackageCheck}
    defaults={defaults}
    addLabel="Add feature"
    columns={[
      { key: "name", label: "Feature" },
      { key: "area", label: "Area" },
      { key: "status", label: "Status" },
      { key: "notes", label: "Notes" },
    ]}
  />;
}

function UsersAccessView({ project }) {
  const defaults = projectDefaults(project).access;
  return <EditableListView
    project={project}
    storageKey="access-v2"
    title="Users & Access"
    description="Document login methods, roles, permissions, and who can use each part of the app."
    icon={Shield}
    defaults={defaults}
    addLabel="Add access rule"
    columns={[
      { key: "role", label: "Role / user type" },
      { key: "method", label: "Login method" },
      { key: "scope", label: "Access scope" },
      { key: "status", label: "Status" },
    ]}
  />;
}

function FilesMediaView({ project }) {
  const defaults = projectDefaults(project).files;
  const [items, setItems] = useProjectStorage(project.id, "files-media-v2", defaults);
  const [draft, setDraft] = useState({ name: "", type: "Screenshot", location: "", status: "Reference" });

  const add = () => {
    if (!draft.name.trim()) return;
    setItems((current) => [...current, { id: `media-${Date.now()}`, ...draft }]);
    setDraft({ name: "", type: "Screenshot", location: "", status: "Reference" });
  };

  return (
    <WorkspacePage>
      <PageHeader icon={FileImage} title="Files & Media" description="The shared project library for screenshots, mockups, logos, documents, and other assets used while we build." />
      <InfoBanner text="This is the project catalog. Direct binary uploads/storage will be wired to Viking Aries storage; repository and Drive references can already be recorded here." />
      <div className="workspace-grid two-column">
        {items.map((item) => (
          <section className="workspace-card media-card" key={item.id}>
            <div className="media-icon"><FileImage size={20} /></div>
            <div>
              <div className="card-heading-row compact"><h2>{item.name}</h2><StatusPill status={item.status} /></div>
              <p>{item.type}</p>
              <input value={item.location || ""} onChange={(e) => setItems((current) => current.map((row) => row.id === item.id ? { ...row, location: e.target.value } : row))} placeholder="File, repo, Drive, or URL reference" />
            </div>
            <button className="icon-action danger" type="button" onClick={() => setItems((current) => current.filter((row) => row.id !== item.id))}><Trash2 size={15} /></button>
          </section>
        ))}
      </div>
      <section className="workspace-card va-entry-panel">
        <div className="va-entry-title"><Upload size={15} /> Register shared file or media</div>
        <div className="va-entry-grid">
          <label><span>Name</span><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label><span>Type</span><select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}><option>Screenshot</option><option>Mockup</option><option>Logo</option><option>Document</option><option>Export</option><option>Other</option></select></label>
          <label><span>Location / reference</span><input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} /></label>
          <label><span>Status</span><input value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} /></label>
        </div>
        <button type="button" className="primary-action" onClick={add}><Plus size={15} /> Add to project library</button>
      </section>
    </WorkspacePage>
  );
}

function IntegrationsView({ project, projects = [], workspace = "Personal" }) {
  const [providers, setProviders] = useSharedStorage("integrations-v1", sharedIntegrationDefaults);
  const [mappings, setMappings] = useProjectStorage(project.id, "integration-mappings-v1", projectIntegrationDefaults(project));
  const [runtimeStatus, setRuntimeStatus] = useState(null);
  const [providerMessage, setProviderMessage] = useState("");
  const [providerBusy, setProviderBusy] = useState("");

  const icons = {
    GitHub: Github,
    Cloudflare: Cloud,
    Convex: Box,
    Gmail: Mail,
    "Google Drive": FileImage,
  };

  const refreshRuntimeStatus = async () => {
    try {
      const response = await fetch(`/api/integrations/status?projectId=${encodeURIComponent(project.id)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) setRuntimeStatus(payload);
    } catch {
      setRuntimeStatus(null);
    }
  };

  useEffect(() => {
    refreshRuntimeStatus();
  }, []);

  const verifyProvider = async (providerId) => {
    if (!["github", "cloudflare", "convex"].includes(providerId)) return;

    setProviderBusy(providerId);
    setProviderMessage("");
    try {
      const endpoint =
        providerId === "github"
          ? "/api/github/verify"
          : providerId === "cloudflare"
            ? "/api/cloudflare/verify"
            : "/api/convex/verify";
      const response = await fetch(endpoint, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload.error ||
          (providerId === "github"
            ? "Could not verify GitHub."
            : providerId === "cloudflare"
              ? "Could not verify Cloudflare."
              : "Could not verify Convex.")
        );
      }

      if (providerId === "github") {
        updateProvider("github", {
          account: payload.login || payload.name || "Connected GitHub account",
          status: "Connected",
        });
        setProviderMessage(`GitHub verified as ${payload.login || payload.name || "connected account"}.`);
      } else if (providerId === "cloudflare") {
        updateProvider("cloudflare", {
          account: `Account ${String(payload.accountId || "").slice(0, 8)}…`,
          status: payload.status === "active" ? "Connected" : "Needs attention",
        });
        setProviderMessage(
          payload.status === "active"
            ? "Cloudflare API token verified. Runtime tools are ready for registered Workers."
            : `Cloudflare token status: ${payload.status || "unknown"}.`
        );
      } else {
        updateProvider("convex", {
          account:
            payload.teamId || payload.projectId
              ? `Team ${payload.teamId || "connected"}`
              : "Connected Convex account",
          status: "Connected",
        });
        setProviderMessage("Convex personal access token verified. Runtime deployment tools are ready for registered Convex projects.");
      }

      await refreshRuntimeStatus();
    } catch (error) {
      setProviderMessage(error.message || `Could not verify ${providerId}.`);
      updateProvider(providerId, { status: "Needs attention" });
    } finally {
      setProviderBusy("");
    }
  };

  const providerUsage = (providerId) => {
    const names = [];
    for (const candidate of projects) {
      try {
        const saved = window.localStorage.getItem(`viking-aries:${candidate.id}:integration-mappings-v1`);
        const candidateMappings = saved ? JSON.parse(saved) : projectIntegrationDefaults(candidate);
        if (candidateMappings?.[providerId]?.enabled) names.push(candidate.name);
      } catch {
        const fallback = projectIntegrationDefaults(candidate);
        if (fallback?.[providerId]?.enabled) names.push(candidate.name);
      }
    }
    return names;
  };

  const updateProvider = (id, patch) => {
    setProviders((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const updateMapping = (providerId, patch) => {
    setMappings((current) => ({
      ...current,
      [providerId]: { ...(current[providerId] || {}), ...patch },
    }));
  };

  const projectUsage = providers.filter((provider) => mappings?.[provider.id]?.enabled);

  return (
    <WorkspacePage>
      <PageHeader
        icon={Link2}
        title="Integrations"
        description={
          workspace === "Personal"
            ? "One PERSONAL connection per provider, with a separate destination mapping for each project."
            : "Contractor integrations remain isolated from PERSONAL connections."
        }
      />

      <InfoBanner text="Shared authentication and project destinations are separate. Connecting GitHub once does not make every project use the same repository." />

      <section className="workspace-card">
        <div className="card-heading-row">
          <div>
            <h2>PERSONAL provider connections</h2>
            <p>These records are shared across all PERSONAL projects. Credentials will move into the secure vault when the VA backend is connected.</p>
          </div>
          <span className="count-badge">{providers.length}</span>
        </div>

        <div className="shared-integration-grid">
          {providers.map((item) => {
            const Icon = icons[item.name] || Link2;
            const usage = providerUsage(item.id);
            return (
              <div className="shared-integration-card" key={item.id}>
                <div className="shared-integration-head">
                  <span className="integration-icon"><Icon size={19} /></span>
                  <div>
                    <strong>{item.name}</strong>
                    <small>{item.purpose}</small>
                  </div>
                  <StatusPill
                    status={
                      runtimeStatus?.providers?.[item.id]?.usable
                        ? "Connected"
                        : item.status
                    }
                  />
                </div>

                <div className="shared-integration-fields">
                  <label className="compact-field">
                    <span>Connected account / workspace</span>
                    <input
                      value={item.account || ""}
                      placeholder="Not connected"
                      onChange={(e) => updateProvider(item.id, { account: e.target.value })}
                    />
                  </label>
                  <label className="compact-field">
                    <span>Connection status</span>
                    <select
                      value={item.status}
                      onChange={(e) => updateProvider(item.id, { status: e.target.value })}
                    >
                      <option>Needs connection</option>
                      <option>Connected</option>
                      <option>Needs attention</option>
                      <option>Disconnected</option>
                    </select>
                  </label>
                </div>

                <div className="integration-capabilities">
                  <strong>Enabled capabilities</strong>
                  <span>{item.capabilities}</span>
                </div>

                <div className="integration-usage">
                  <strong>Projects using it</strong>
                  <span>{usage.length ? usage.join(", ") : "No project mappings yet"}</span>
                </div>

                <div className="integration-actions">
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={() => updateProvider(item.id, { status: item.status === "Connected" ? "Needs attention" : "Needs connection" })}
                  >
                    Configure
                  </button>
                  <button
                    type="button"
                    className="secondary-action"
                    disabled={providerBusy === item.id || !["github", "cloudflare", "convex"].includes(item.id)}
                    title={
                      item.id === "github"
                        ? "Verify the GitHub credential configured in the Viking Aries runtime"
                        : item.id === "cloudflare"
                          ? "Verify the Cloudflare API token configured in the Viking Aries runtime"
                          : item.id === "convex"
                            ? "Verify the Convex personal access token configured in the Viking Aries runtime"
                            : "This provider runtime connection is not wired yet"
                    }
                    onClick={() => verifyProvider(item.id)}
                  >
                    {providerBusy === item.id
                      ? "Checking…"
                      : runtimeStatus?.providers?.[item.id]?.usable
                        ? "Reconnect"
                        : "Connect"}
                  </button>
                  <button
                    type="button"
                    className="secondary-action danger-action"
                    disabled
                    title={
                      usage.length > 1
                        ? `${usage.length} projects depend on this connection`
                        : "Disconnect will be enabled after the secure provider registry is persisted server-side"
                    }
                  >
                    Disconnect
                  </button>
                </div>
                {["github", "cloudflare", "convex"].includes(item.id) && runtimeStatus && (
                  <div className="integration-runtime-state">
                    <strong>Runtime:</strong>
                    <span>
                      {!runtimeStatus.ownerAuth?.configured
                        ? " Owner security setup required"
                        : !runtimeStatus.ownerAuth?.authenticated
                          ? " Owner login required"
                          : !runtimeStatus.providers?.[item.id]?.configured
                            ? item.id === "github"
                              ? " GITHUB_TOKEN not configured"
                              : item.id === "cloudflare"
                                ? " CLOUDFLARE_API_TOKEN not configured"
                                : " CONVEX_PERSONAL_ACCESS_TOKEN not configured"
                            : runtimeStatus.providers?.[item.id]?.usable
                              ? item.id === "github"
                                ? " GitHub tools available to VA"
                                : item.id === "cloudflare"
                                  ? " Cloudflare tools available to VA"
                                  : " Convex tools available to VA"
                              : item.id === "github"
                                ? " GitHub needs attention"
                                : item.id === "cloudflare"
                                  ? " Cloudflare needs attention"
                                  : " Convex needs attention"}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="workspace-card">
        <div className="card-heading-row">
          <div>
            <h2>{project.name} provider mappings</h2>
            <p>This is where Viking Aries learns the exact repository, deployment, backend, Drive folder, and mail identity for this project.</p>
          </div>
          <span className="count-badge">{projectUsage.length}</span>
        </div>

        <div className="project-integration-mappings">
          <div className="project-mapping-card">
            <div className="project-mapping-title"><Github size={18} /><strong>GitHub repository</strong></div>
            <label className="mapping-toggle">
              <input type="checkbox" checked={Boolean(mappings.github?.enabled)} onChange={(e) => updateMapping("github", { enabled: e.target.checked })} />
              Use shared GitHub connection for this project
            </label>
            <div className="mapping-field-grid">
              <label className="compact-field"><span>Repository</span><input value={mappings.github?.repository || ""} placeholder="owner/repository" onChange={(e) => updateMapping("github", { repository: e.target.value })} /></label>
              <label className="compact-field"><span>Default branch</span><input value={mappings.github?.branch || "main"} onChange={(e) => updateMapping("github", { branch: e.target.value })} /></label>
            </div>
          </div>

          <div className="project-mapping-card">
            <div className="project-mapping-title"><Cloud size={18} /><strong>Cloudflare destination</strong></div>
            <label className="mapping-toggle">
              <input type="checkbox" checked={Boolean(mappings.cloudflare?.enabled)} onChange={(e) => updateMapping("cloudflare", { enabled: e.target.checked })} />
              Use shared Cloudflare connection for this project
            </label>
            <div className="mapping-field-grid">
              <label className="compact-field"><span>Worker / project</span><input value={mappings.cloudflare?.worker || ""} placeholder="Worker or Pages project" onChange={(e) => updateMapping("cloudflare", { worker: e.target.value })} /></label>
              <label className="compact-field"><span>Production / preview URL</span><input value={mappings.cloudflare?.deploymentUrl || ""} onChange={(e) => updateMapping("cloudflare", { deploymentUrl: e.target.value })} /></label>
            </div>
          </div>

          <div className="project-mapping-card">
            <div className="project-mapping-title"><Box size={18} /><strong>Convex deployment</strong></div>
            <label className="mapping-toggle">
              <input type="checkbox" checked={Boolean(mappings.convex?.enabled)} onChange={(e) => updateMapping("convex", { enabled: e.target.checked })} />
              Use shared Convex connection for this project
            </label>
            <div className="mapping-field-grid three">
              <label className="compact-field"><span>Deployment</span><input value={mappings.convex?.deployment || ""} placeholder="deployment-name" onChange={(e) => updateMapping("convex", { deployment: e.target.value })} /></label>
              <label className="compact-field"><span>Deployment URL</span><input value={mappings.convex?.url || ""} onChange={(e) => updateMapping("convex", { url: e.target.value })} /></label>
              <label className="compact-field"><span>Dashboard URL</span><input value={mappings.convex?.dashboardUrl || ""} onChange={(e) => updateMapping("convex", { dashboardUrl: e.target.value })} /></label>
            </div>
          </div>

          <div className="project-mapping-card">
            <div className="project-mapping-title"><FileImage size={18} /><strong>Google Drive folder</strong></div>
            <label className="mapping-toggle">
              <input type="checkbox" checked={Boolean(mappings.drive?.enabled)} onChange={(e) => updateMapping("drive", { enabled: e.target.checked })} />
              Use shared Drive connection for this project
            </label>
            <label className="compact-field"><span>Project folder URL or durable reference</span><input value={mappings.drive?.folderUrl || ""} placeholder="https://drive.google.com/..." onChange={(e) => updateMapping("drive", { folderUrl: e.target.value })} /></label>
          </div>

          <div className="project-mapping-card">
            <div className="project-mapping-title"><Mail size={18} /><strong>Gmail identity</strong></div>
            <label className="mapping-toggle">
              <input type="checkbox" checked={Boolean(mappings.gmail?.enabled)} onChange={(e) => updateMapping("gmail", { enabled: e.target.checked })} />
              Use shared Gmail connection for this project
            </label>
            <label className="compact-field"><span>Project mail identity / purpose</span><input value={mappings.gmail?.identity || ""} placeholder="Sender address, alias, or workflow purpose" onChange={(e) => updateMapping("gmail", { identity: e.target.value })} /></label>
          </div>
        </div>
      </section>

      {providerMessage && <div className="integration-feedback">{providerMessage}</div>}
      <InfoBanner text={
        runtimeStatus?.project?.registered
          ? `This project is server-registered for runtime tools. GitHub is locked to ${runtimeStatus.project.repository || "its registered repository"} on ${runtimeStatus.project.defaultBranch || "main"}.`
          : "This project's editable mapping is saved in the browser, but write-capable runtime tools stay disabled until the project is registered server-side. Provider credentials are never stored in localStorage or GitHub."
      } />
    </WorkspacePage>
  );
}

function DatabaseView({ project }) {
  const defaults = projectDefaults(project).tables;
  return <EditableListView
    project={project}
    storageKey="database-v2"
    title="Database"
    description={`Tables and data structures currently used by ${project.name}.`}
    icon={Database}
    defaults={defaults.map((row, i) => ({ id: `table-${i}`, ...row }))}
    addLabel="Add table"
    columns={[
      { key: "name", label: "Table / collection" },
      { key: "purpose", label: "Purpose" },
      { key: "indexes", label: "Indexes / keys" },
    ]}
  />;
}

function BackendView({ project }) {
  const defaults = projectDefaults(project).backend;
  return <EditableListView
    project={project}
    storageKey="backend-v2"
    title="Backend"
    description="Server-side modules, functions, APIs, and business logic behind the application."
    icon={Code2}
    defaults={defaults.map((row, i) => ({ id: `backend-${i}`, ...row }))}
    addLabel="Add backend component"
    columns={[
      { key: "name", label: "Component" },
      { key: "type", label: "Type" },
      { key: "responsibility", label: "Responsibility" },
      { key: "status", label: "Status" },
    ]}
  />;
}

function AutomationsView({ project }) {
  const defaults = projectDefaults(project).automations;
  const [items, setItems] = useProjectStorage(project.id, "automations-v2", defaults);
  const [draft, setDraft] = useState({ name: "", trigger: "", action: "" });

  const add = () => {
    if (!draft.name.trim()) return;
    setItems((current) => [...current, { id: `automation-${Date.now()}`, ...draft, enabled: true }]);
    setDraft({ name: "", trigger: "", action: "" });
  };

  return (
    <WorkspacePage>
      <PageHeader icon={Zap} title="Automations" description="Recurring, scheduled, and event-driven work performed for this project." />
      <section className="workspace-card automation-list">
        {items.length === 0 && <EmptyState text="No automations configured yet." />}
        {items.map((item) => (
          <div className="automation-row va-auto-row" key={item.id}>
            <span className="automation-icon"><Zap size={16} /></span>
            <div><strong>{item.name}</strong><small>{item.trigger} · {item.action}</small></div>
            <label className="mini-toggle"><input type="checkbox" checked={item.enabled} onChange={(e) => setItems((current) => current.map((row) => row.id === item.id ? { ...row, enabled: e.target.checked } : row))} /><span /></label>
            <button type="button" className="icon-action danger" onClick={() => setItems((current) => current.filter((row) => row.id !== item.id))}><Trash2 size={15} /></button>
          </div>
        ))}
      </section>
      <section className="workspace-card va-entry-panel">
        <div className="va-entry-title">Add automation</div>
        <div className="va-entry-grid">
          <label><span>Name</span><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label><span>Trigger</span><input value={draft.trigger} onChange={(e) => setDraft({ ...draft, trigger: e.target.value })} /></label>
          <label><span>Action</span><input value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} /></label>
        </div>
        <button type="button" className="primary-action" onClick={add}><Plus size={15} /> Add automation</button>
      </section>
    </WorkspacePage>
  );
}

function DiagnosticsView({ project }) {
  const defaults = projectDefaults(project).diagnostics;
  const [items, setItems] = useProjectStorage(project.id, "diagnostics-v2", defaults);

  return (
    <WorkspacePage>
      <PageHeader
        icon={FlaskConical}
        title="Tests & Diagnostics"
        description="Record what has been tested, current health checks, and problems that still need investigation."
        action={<button type="button" className="secondary-action" onClick={() => setItems(projectDefaults(project).diagnostics)}><RefreshCw size={14} /> Reset known checks</button>}
      />
      <section className="workspace-card">
        <div className="diagnostic-grid">
          {items.map((item) => (
            <div className="diagnostic-card" key={item.id}>
              <div className="card-heading-row compact"><h2>{item.name}</h2><StatusPill status={item.result} /></div>
              <p>{item.detail}</p>
              <select value={item.result} onChange={(e) => setItems((current) => current.map((row) => row.id === item.id ? { ...row, result: e.target.value } : row))}>
                <option>Passed</option><option>Configured</option><option>Needs review</option><option>Failed</option>
              </select>
            </div>
          ))}
        </div>
      </section>
    </WorkspacePage>
  );
}

function VersionsView({ project }) {
  const defaults = projectDefaults(project).versions;
  return <EditableListView
    project={project}
    storageKey="versions-v2"
    title="Versions"
    description="Important checkpoints, releases, and known-good milestones for this project."
    icon={RefreshCw}
    defaults={defaults}
    addLabel="Add checkpoint"
    columns={[
      { key: "label", label: "Checkpoint" },
      { key: "ref", label: "Commit / version" },
      { key: "note", label: "What changed" },
    ]}
  />;
}

function DeploymentsView({ project }) {
  const defaults = projectDefaults(project).deployments;
  return <EditableListView
    project={project}
    storageKey="deployments-v2"
    title="Deployments"
    description="Production, staging, and preview environments for the selected project."
    icon={Rocket}
    defaults={defaults}
    addLabel="Add environment"
    columns={[
      { key: "environment", label: "Environment" },
      { key: "provider", label: "Provider" },
      { key: "status", label: "Status" },
      { key: "url", label: "URL" },
    ]}
  />;
}

function DomainsView({ project }) {
  const defaults = projectDefaults(project).domains;
  return <EditableListView
    project={project}
    storageKey="domains-v2"
    title="Domains"
    description="Public hostnames and URLs associated with this project."
    icon={Globe2}
    defaults={defaults}
    addLabel="Add domain"
    columns={[
      { key: "host", label: "Hostname" },
      { key: "type", label: "Type" },
      { key: "status", label: "Status" },
      { key: "notes", label: "Notes" },
    ]}
  />;
}

function SecretsView({ project }) {
  const defaults = projectDefaults(project).secrets;
  const [items, setItems] = useProjectStorage(project.id, "secrets-v2", defaults);
  const [draft, setDraft] = useState({ name: "", provider: "", purpose: "", status: "Configured" });

  const add = () => {
    if (!draft.name.trim()) return;
    setItems((current) => [...current, { id: `secret-${Date.now()}`, ...draft }]);
    setDraft({ name: "", provider: "", purpose: "", status: "Configured" });
  };

  return (
    <WorkspacePage>
      <PageHeader icon={KeyRound} title="Secrets" description="Track required secret names and where they are stored without exposing the secret values." />
      <InfoBanner text="Viking Aries should never display or store actual secret values in chat or local project metadata. Only names, purpose, provider, and configuration status belong here." />
      <section className="workspace-card secret-list">
        {items.map((item) => (
          <div className="secret-row" key={item.id}>
            <span className="secret-icon"><KeyRound size={16} /></span>
            <div><strong>{item.name}</strong><small>{item.provider} · {item.purpose}</small></div>
            <StatusPill status={item.status} />
            <button type="button" className="icon-action danger" onClick={() => setItems((current) => current.filter((row) => row.id !== item.id))}><Trash2 size={15} /></button>
          </div>
        ))}
      </section>
      <section className="workspace-card va-entry-panel">
        <div className="va-entry-title">Register secret metadata</div>
        <div className="va-entry-grid">
          <label><span>Secret name</span><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label><span>Stored in</span><input value={draft.provider} onChange={(e) => setDraft({ ...draft, provider: e.target.value })} /></label>
          <label><span>Purpose</span><input value={draft.purpose} onChange={(e) => setDraft({ ...draft, purpose: e.target.value })} /></label>
          <label><span>Status</span><input value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} /></label>
        </div>
        <button type="button" className="primary-action" onClick={add}><Plus size={15} /> Register secret name</button>
      </section>
    </WorkspacePage>
  );
}

function SettingsView({ project }) {
  const defaults = projectDefaults(project).settings;
  const [settings, setSettings] = useProjectStorage(project.id, "settings-v2", defaults);
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSettings({ ...settings });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <WorkspacePage>
      <PageHeader icon={Settings} title="Settings" description={`Core project configuration for ${project.name}.`} />
      <section className="workspace-card settings-form">
        <label><span>Display name</span><input value={settings.displayName} onChange={(e) => setSettings({ ...settings, displayName: e.target.value })} /></label>
        <label><span>GitHub repository</span><input value={settings.repository} onChange={(e) => setSettings({ ...settings, repository: e.target.value })} /></label>
        <label><span>Default branch</span><input value={settings.defaultBranch} onChange={(e) => setSettings({ ...settings, defaultBranch: e.target.value })} /></label>
        <label><span>Production URL</span><input value={settings.productionUrl} onChange={(e) => setSettings({ ...settings, productionUrl: e.target.value })} /></label>
        <div className="workspace-grid two-column settings-inline-grid">
          <label><span>Backend provider</span><input value={settings.backendProvider} onChange={(e) => setSettings({ ...settings, backendProvider: e.target.value })} /></label>
          <label><span>Backend deployment</span><input value={settings.backendDeployment} onChange={(e) => setSettings({ ...settings, backendDeployment: e.target.value })} /></label>
        </div>
        <label><span>Backend URL</span><input value={settings.backendUrl} onChange={(e) => setSettings({ ...settings, backendUrl: e.target.value })} /></label>
        <label><span>Project notes / guardrails</span><textarea value={settings.notes} onChange={(e) => setSettings({ ...settings, notes: e.target.value })} /></label>
        <div className="form-actions">
          <button type="button" className="primary-action" onClick={save}><Save size={15} /> Save settings</button>
          {saved && <span className="save-confirmation"><CheckCircle2 size={14} /> Saved</span>}
        </div>
      </section>
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

export default function WorkspaceView({ view, project, projects = [], workspace = "Personal" }) {
  switch (view) {
    case "Features":
      return <FeaturesView project={project} />;
    case "Users & Access":
      return <UsersAccessView project={project} />;
    case "Files & Media":
      return <FilesMediaView project={project} />;
    case "Integrations":
      return <IntegrationsView project={project} projects={projects} workspace={workspace} />;
    case "Database":
      return <DatabaseView project={project} />;
    case "Backend":
      return <BackendView project={project} />;
    case "Automations":
      return <AutomationsView project={project} />;
    case "Tests & Diagnostics":
      return <DiagnosticsView project={project} />;
    case "Versions":
      return <VersionsView project={project} />;
    case "Deployments":
      return <DeploymentsView project={project} />;
    case "Domains":
      return <DomainsView project={project} />;
    case "Secrets":
      return <SecretsView project={project} />;
    case "Settings":
      return <SettingsView project={project} />;
    default:
      return <WorkspacePage><EmptyState text="Select a project workspace section." /></WorkspacePage>;
  }
}
