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

function IntegrationsView({ project }) {
  const defaults = projectDefaults(project).integrations;
  const [items, setItems] = useProjectStorage(project.id, "integrations-v2", defaults);

  const icons = { GitHub: Github, Cloudflare: Cloud, Convex: Box, Gmail: Mail, "Google Drive": FileImage, Supabase: Database, "Dakota Wireless POS": Link2 };

  return (
    <WorkspacePage>
      <PageHeader icon={Link2} title="Integrations" description="External services, APIs, and connected apps used by this project." />
      <div className="workspace-grid two-column">
        {items.map((item) => {
          const Icon = icons[item.name] || Link2;
          return (
            <section className="workspace-card integration-card" key={item.id}>
              <div className="integration-icon"><Icon size={19} /></div>
              <div className="integration-copy">
                <div className="card-heading-row compact"><h2>{item.name}</h2><StatusPill status={item.status} /></div>
                <p>{item.purpose}</p>
                <label className="compact-field"><span>Connection / provider</span><input value={item.provider} onChange={(e) => setItems((current) => current.map((row) => row.id === item.id ? { ...row, provider: e.target.value } : row))} /></label>
                <label className="compact-field"><span>Status</span><select value={item.status} onChange={(e) => setItems((current) => current.map((row) => row.id === item.id ? { ...row, status: e.target.value } : row))}><option>Connected</option><option>Configured</option><option>Available</option><option>Not configured</option><option>Not used</option></select></label>
              </div>
            </section>
          );
        })}
      </div>
      <InfoBanner text="Connection metadata is project-scoped. Secret values remain in the provider and are never displayed here." />
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

export default function WorkspaceView({ view, project }) {
  switch (view) {
    case "Features":
      return <FeaturesView project={project} />;
    case "Users & Access":
      return <UsersAccessView project={project} />;
    case "Files & Media":
      return <FilesMediaView project={project} />;
    case "Integrations":
      return <IntegrationsView project={project} />;
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
