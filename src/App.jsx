import { useMemo, useState } from "react";
import {
  Activity,
  Archive,
  Bot,
  Boxes,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock3,
  Cloud,
  Code2,
  Database,
  Eye,
  EyeOff,
  Github,
  KeyRound,
  Laptop,
  Link2,
  Logs,
  Maximize2,
  MessageSquare,
  Minimize2,
  Monitor,
  MoreHorizontal,
  RefreshCw,
  Rocket,
  Send,
  Settings,
  ShieldCheck,
  Smartphone,
  Tablet,
  TerminalSquare,
  UserRound,
  Users,
  WandSparkles,
  Workflow,
  X,
  Zap,
} from "lucide-react";

const personalProjects = [
  { id: "timekeeper", name: "Timekeeper", icon: Clock3 },
  { id: "dw-pos", name: "Dakota Wireless POS", icon: Monitor },
  { id: "smoke-pos", name: "Smoke Signals POS", icon: TerminalSquare },
  { id: "dw-site", name: "DW Website", icon: Cloud },
  { id: "rez-lock", name: "Rez Lock & Key", icon: KeyRound },
  { id: "viking-aries", name: "Viking Aries", icon: Boxes },
];

const contractorProjects = [
  { id: "client-demo", name: "Client Project Example", icon: Archive },
];

const navItems = [
  { label: "Chats", icon: MessageSquare, active: true },
  { label: "Architecture", icon: Workflow },
  { label: "Integrations", icon: Link2 },
  { label: "Backend", icon: Database },
  { label: "Deployments", icon: Rocket },
  { label: "Logs", icon: Logs },
  { label: "Secrets", icon: KeyRound },
  { label: "Settings", icon: Settings },
];

const lowerNav = [
  { label: "Activity", icon: Activity },
  { label: "Automations", icon: Zap },
];

const chatTabs = ["Migration", "Payroll", "Commission Sync"];

function ToolButton({ icon: Icon, label }) {
  return (
    <button className="tool-button" type="button">
      <Icon size={16} />
      <span>{label}</span>
    </button>
  );
}

function ProjectSelector({ project, workspace, onWorkspaceChange, onProjectChange }) {
  const [open, setOpen] = useState(false);
  const projects = workspace === "Personal" ? personalProjects : contractorProjects;

  return (
    <div className="project-block">
      <div className="sidebar-kicker">Project</div>
      <button
        className="project-trigger"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="project-trigger-icon">
          <project.icon size={18} />
        </span>
        <span className="project-trigger-copy">
          <strong>{project.name}</strong>
          <small>{workspace}</small>
        </span>
        <ChevronDown size={17} className={open ? "rotate-180" : ""} />
      </button>

      {open && (
        <div className="project-menu">
          <div className="workspace-switch-row">
            {["Personal", "Contractor"].map((name) => (
              <button
                key={name}
                type="button"
                className={workspace === name ? "workspace-chip active" : "workspace-chip"}
                onClick={() => onWorkspaceChange(name)}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="project-menu-list">
            {projects.map((item) => {
              const Icon = item.icon;
              const selected = item.id === project.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={selected ? "project-option selected" : "project-option"}
                  onClick={() => {
                    onProjectChange(item);
                    setOpen(false);
                  }}
                >
                  <Icon size={17} />
                  <span>{item.name}</span>
                  {selected && <ShieldCheck size={16} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Sidebar({ project, workspace, onWorkspaceChange, onProjectChange }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">VA</div>
        <div>
          <div className="brand-name">Viking Aries</div>
          <div className="brand-tagline">BUILD. CONNECT. DEPLOY.</div>
        </div>
      </div>

      <ProjectSelector
        project={project}
        workspace={workspace}
        onWorkspaceChange={onWorkspaceChange}
        onProjectChange={onProjectChange}
      />

      <div className="sidebar-section">
        <div className="sidebar-kicker">Workspace</div>
        <nav className="sidebar-nav">
          {navItems.map(({ label, icon: Icon, active }) => (
            <button key={label} className={active ? "sidebar-link active" : "sidebar-link"} type="button">
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="sidebar-divider" />

      <nav className="sidebar-nav compact">
        {lowerNav.map(({ label, icon: Icon }) => (
          <button key={label} className="sidebar-link" type="button">
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button className="owner-card" type="button">
          <span className="avatar">EE</span>
          <span>
            <strong>Erik</strong>
            <small>Owner</small>
          </span>
          <ChevronRight size={16} />
        </button>
        <button className="logout-link" type="button">
          <X size={17} />
          Log Out
        </button>
      </div>
    </aside>
  );
}

function ProjectContext() {
  const steps = [
    { title: "Timekeeper", subtitle: "Employee Management", icon: Clock3 },
    { title: "Commission API", subtitle: "Sync & Calculate", icon: Code2 },
    { title: "Dakota Wireless POS", subtitle: "Sales Data Source", icon: Monitor },
  ];

  return (
    <section className="context-panel">
      <div className="section-heading-row">
        <div className="section-heading">
          <Database size={17} />
          <span>Project Context</span>
        </div>
        <div className="context-status">
          <span><CircleDot size={13} /> Connected</span>
          <button type="button">View Architecture <ChevronRight size={14} /></button>
        </div>
      </div>
      <div className="context-flow">
        {steps.map(({ title, subtitle, icon: Icon }, index) => (
          <div className="context-flow-fragment" key={title}>
            <div className="context-node">
              <div className="context-icon"><Icon size={18} /></div>
              <div>
                <strong>{title}</strong>
                <small>{subtitle}</small>
              </div>
            </div>
            {index < steps.length - 1 && <ChevronRight className="context-arrow" size={20} />}
          </div>
        ))}
      </div>
    </section>
  );
}

function ChatWorkspace({ project }) {
  const [activeTab, setActiveTab] = useState("Migration");
  const [draft, setDraft] = useState("");

  return (
    <main className="workspace">
      <div className="project-heading">
        <div>
          <div className="project-title-row">
            <h1>{project.name}</h1>
            <span className="active-project"><span /> Active Project</span>
          </div>
        </div>
      </div>

      <div className="chat-tab-row">
        {chatTabs.map((tab) => (
          <button
            type="button"
            key={tab}
            className={activeTab === tab ? "chat-tab active" : "chat-tab"}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
        <button className="chat-tab new-chat" type="button"><span>+</span> New Chat</button>
      </div>

      <div className="workspace-scroll">
        <ProjectContext />

        <section className="conversation">
          <article className="message-row">
            <div className="avatar">EE</div>
            <div className="message-stack">
              <div className="message-meta"><strong>Erik</strong><span>10:24 AM</span></div>
              <div className="user-message">
                I need to set up commission sync between Timekeeper and Dakota Wireless POS.
                <br />Use the existing API and map sales data to employees based on clerk ID.
              </div>
            </div>
          </article>

          <article className="message-row">
            <div className="assistant-avatar"><WandSparkles size={18} /></div>
            <div className="message-stack">
              <div className="message-meta"><strong>Viking Aries</strong><span>10:24 AM</span></div>
              <div className="assistant-message">
                <p>I’ll set up the commission sync integration. Here’s the plan:</p>
                <ol>
                  <li><span>1</span>Connect to Dakota Wireless POS API</li>
                  <li><span>2</span>Map clerk IDs to Timekeeper employees</li>
                  <li><span>3</span>Create commission calculation logic</li>
                  <li><span>4</span>Preserve the existing server-side secret handling</li>
                </ol>
                <p>I’ll start by inspecting the current integration points and shared project context.</p>

                <div className="task-status success">
                  <ShieldCheck size={18} />
                  <div><strong>Connected project located</strong><small>Dakota Wireless POS relationship is registered.</small></div>
                  <time>10:25 AM</time>
                </div>
                <div className="task-status working">
                  <RefreshCw size={18} />
                  <div><strong>Analyzing integration...</strong><small>Checking employee mapping and API contract.</small></div>
                  <time>10:25 AM</time>
                </div>
              </div>
            </div>
          </article>

          <article className="message-row">
            <div className="avatar">EE</div>
            <div className="message-stack">
              <div className="message-meta"><strong>Erik</strong><span>10:26 AM</span></div>
              <div className="user-message">Great. Also include a manual sync control in the Timekeeper admin panel.</div>
            </div>
          </article>
        </section>
      </div>

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          setDraft("");
        }}
      >
        <button className="attach-button" type="button"><Archive size={18} /></button>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Tell Viking Aries what to build, fix, connect, or deploy..."
        />
        <button className="send-button" type="submit"><Send size={17} /> Send</button>
        <span className="composer-hint">Shift + Enter for new line</span>
      </form>
    </main>
  );
}

function PreviewDashboard() {
  return (
    <div className="preview-app">
      <div className="preview-app-header">
        <div className="preview-app-brand"><Clock3 size={18} /> <strong>Timekeeper</strong></div>
        <nav>
          <span className="active">Dashboard</span><span>Employees</span><span>Time Cards</span><span>Reports</span>
        </nav>
        <Settings size={17} />
      </div>

      <div className="preview-dashboard">
        <div className="preview-welcome">
          <div><h2>Welcome back, Erik</h2><p>Here’s what’s happening with your team today.</p></div>
          <small>Saturday, September 19</small>
        </div>

        <div className="metrics-grid">
          <Metric icon={Users} value="24" label="Active Employees" />
          <Metric icon={Clock3} value="142" label="Hours This Week" />
          <Metric icon={Zap} value="$3,842" label="Total Commissions" />
          <Metric icon={Activity} value="98%" label="Sync Health" />
        </div>

        <section className="sync-card">
          <div className="sync-card-head">
            <div className="sync-badge"><ShieldCheck size={21} /></div>
            <div><strong>Dakota Wireless POS Commission Sync</strong><small>Last synced 12 minutes ago · 1,284 sales records processed</small></div>
            <span className="connected-pill">Connected</span>
          </div>
          <div className="sync-actions">
            <button type="button"><RefreshCw size={16} /> Sync Now</button>
            <button type="button"><Logs size={16} /> View Sync Logs</button>
          </div>
        </section>

        <div className="preview-bottom-grid">
          <section className="preview-list-card">
            <div className="preview-card-title"><strong>Recent Activity</strong><button type="button">View All</button></div>
            <ul>
              <li><span className="activity-dot green" />Commission sync completed <small>12 minutes ago</small></li>
              <li><span className="activity-dot blue" />Processed 1,284 sales records <small>12 minutes ago</small></li>
              <li><span className="activity-dot gray" />Employee data updated <small>2 hours ago</small></li>
            </ul>
          </section>
          <section className="preview-list-card">
            <div className="preview-card-title"><strong>Quick Actions</strong></div>
            <button type="button"><UserRound size={15} /> Add Employee</button>
            <button type="button"><RefreshCw size={15} /> Run Commission Sync</button>
            <button type="button"><Activity size={15} /> View Reports</button>
            <button type="button"><Link2 size={15} /> Manage Integrations</button>
          </section>
        </div>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, value, label }) {
  return (
    <div className="metric-card">
      <div className="metric-icon"><Icon size={18} /></div>
      <strong>{value}</strong>
      <small>{label}</small>
    </div>
  );
}

function PreviewPane({ mode, onModeChange, expanded, visible, onExpand, onToggleVisibility }) {
  const widths = { Desktop: "100%", Tablet: "760px", Mobile: "390px" };

  return (
    <aside className={expanded ? "preview-pane expanded" : "preview-pane"}>
      <div className="preview-toolbar">
        <div className="preview-title">
          <h2>Preview</h2>
          <p>Live view of your application</p>
        </div>

        <div className="preview-header-controls">
          <div className="preview-integrations">
            <ToolButton icon={Github} label="GitHub" />
            <ToolButton icon={Cloud} label="Cloudflare" />
            <ToolButton icon={Database} label="Supabase" />
            <ToolButton icon={Boxes} label="Convex" />
          </div>

          <div className="preview-control-strip">
            <div className="device-icon-switcher" aria-label="Preview device">
              {[
                ["Desktop", Laptop],
                ["Tablet", Tablet],
                ["Mobile", Smartphone],
              ].map(([label, Icon]) => (
                <button
                  key={label}
                  type="button"
                  title={label}
                  aria-label={label}
                  className={mode === label ? "active" : ""}
                  onClick={() => onModeChange(label)}
                >
                  <Icon size={16} />
                </button>
              ))}
            </div>

            <span className="toolbar-divider" />

            <div className="preview-toolbar-actions">
              <button type="button" title="Refresh"><RefreshCw size={17} /></button>
              <button type="button" title={expanded ? "Dock preview" : "Expand preview"} onClick={onExpand}>
                {expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
              </button>
              <button
                type="button"
                title={visible ? "Hide preview" : "Show preview"}
                onClick={onToggleVisibility}
              >
                {visible ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {visible && (
        <div className="preview-stage">
          <div className="preview-device" style={{ maxWidth: widths[mode] }}>
            <PreviewDashboard />
          </div>
        </div>
      )}
    </aside>
  );
}

export default function App() {
  const [workspace, setWorkspace] = useState("Personal");
  const [project, setProject] = useState(personalProjects[0]);
  const [previewMode, setPreviewMode] = useState("Desktop");
  const [previewVisible, setPreviewVisible] = useState(true);
  const [previewExpanded, setPreviewExpanded] = useState(false);

  const layoutClass = useMemo(() => {
    if (previewExpanded) return "app-shell preview-expanded";
    if (!previewVisible) return "app-shell preview-hidden";
    return "app-shell";
  }, [previewExpanded, previewVisible]);

  const changeWorkspace = (next) => {
    setWorkspace(next);
    setProject(next === "Personal" ? personalProjects[0] : contractorProjects[0]);
  };

  return (
    <div className={layoutClass}>
      <Sidebar
        project={project}
        workspace={workspace}
        onWorkspaceChange={changeWorkspace}
        onProjectChange={setProject}
      />

      <div className="main-column">
        <header className="mobile-topbar">
          <div className="mobile-brand"><span className="brand-mark">VA</span><strong>Viking Aries</strong></div>
          <div className="mobile-topbar-actions">
            {!previewVisible && (
              <button type="button" className="restore-preview" onClick={() => setPreviewVisible(true)}>
                <Monitor size={16} /> Preview
              </button>
            )}
            <button className="topbar-avatar" type="button">EE</button>
          </div>
        </header>

        <div className="content-shell">
          {!previewExpanded && <ChatWorkspace project={project} />}
          <PreviewPane
            mode={previewMode}
            onModeChange={setPreviewMode}
            expanded={previewExpanded}
            visible={previewVisible}
            onExpand={() => {
              if (!previewVisible) setPreviewVisible(true);
              setPreviewExpanded((value) => !value);
            }}
            onToggleVisibility={() => {
              if (previewVisible) setPreviewExpanded(false);
              setPreviewVisible((value) => !value);
            }}
          />
        </div>
      </div>
    </div>
  );
}
