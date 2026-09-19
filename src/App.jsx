import WorkspaceView from "./WorkspaceViews.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
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
  GripVertical,
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

const defaultContractors = [
  {
    id: "example-contractor",
    name: "Example Contractor",
    projects: [
      { id: "client-demo", name: "Client Project Example", icon: Archive },
    ],
  },
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

function ProjectSelector({
  project,
  workspace,
  onWorkspaceChange,
  onProjectChange,
  personalProjectsState,
  onAddPersonalProject,
  contractorsState,
  onAddContractor,
  onAddContractorProject,
}) {
  const [open, setOpen] = useState(false);
  const [selectedContractorId, setSelectedContractorId] = useState(contractorsState[0]?.id || null);
  const [contractorOpen, setContractorOpen] = useState(false);

  useEffect(() => {
    if (!contractorsState.some((contractor) => contractor.id === selectedContractorId)) {
      setSelectedContractorId(contractorsState[0]?.id || null);
    }
  }, [contractorsState, selectedContractorId]);

  const selectedContractor =
    contractorsState.find((contractor) => contractor.id === selectedContractorId) || contractorsState[0];

  const projects =
    workspace === "Personal"
      ? personalProjectsState
      : selectedContractor?.projects || [];

  const handleWorkspaceChange = (name) => {
    onWorkspaceChange(name);
    setContractorOpen(name === "Contractor");
  };

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
          <small>
            {workspace === "Contractor" && selectedContractor
              ? `${workspace} · ${selectedContractor.name}`
              : workspace}
          </small>
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
                onClick={() => handleWorkspaceChange(name)}
              >
                {name}
              </button>
            ))}
          </div>

          {workspace === "Contractor" && (
            <div className="contractor-selector">
              <button
                type="button"
                className="contractor-trigger"
                onClick={() => setContractorOpen((value) => !value)}
                aria-expanded={contractorOpen}
              >
                <span>
                  <small>Contractor / Client</small>
                  <strong>{selectedContractor?.name || "Select contractor"}</strong>
                </span>
                <ChevronDown size={16} className={contractorOpen ? "rotate-180" : ""} />
              </button>

              {contractorOpen && (
                <div className="contractor-list">
                  {contractorsState.map((contractor) => (
                    <button
                      key={contractor.id}
                      type="button"
                      className={
                        contractor.id === selectedContractor?.id
                          ? "contractor-option selected"
                          : "contractor-option"
                      }
                      onClick={() => {
                        setSelectedContractorId(contractor.id);
                        setContractorOpen(false);
                        if (contractor.projects[0]) onProjectChange(contractor.projects[0]);
                      }}
                    >
                      <span>{contractor.name}</span>
                      <small>{contractor.projects.length} project{contractor.projects.length === 1 ? "" : "s"}</small>
                    </button>
                  ))}

                  <button
                    type="button"
                    className="contractor-add-button"
                    onClick={() => {
                      const created = onAddContractor();
                      if (created?.id) {
                        setSelectedContractorId(created.id);
                        setContractorOpen(false);
                      }
                    }}
                  >
                    <Plus size={14} />
                    Add New Contractor
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="project-menu-list">
            <div className="project-menu-label">
              {workspace === "Personal" ? "Projects" : `${selectedContractor?.name || "Contractor"} projects`}
            </div>

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

            <button
              type="button"
              className="project-add-button"
              onClick={() => {
                const created =
                  workspace === "Personal"
                    ? onAddPersonalProject()
                    : onAddContractorProject(selectedContractor?.id);

                if (created) {
                  onProjectChange(created);
                  setOpen(false);
                }
              }}
              disabled={workspace === "Contractor" && !selectedContractor}
            >
              <Plus size={14} />
              Add New Project
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Sidebar({
  project,
  workspace,
  onWorkspaceChange,
  onProjectChange,
  activeView,
  onViewChange,
  personalProjectsState,
  onAddPersonalProject,
  contractorsState,
  onAddContractor,
  onAddContractorProject,
}) {
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
        personalProjectsState={personalProjectsState}
        onAddPersonalProject={onAddPersonalProject}
        contractorsState={contractorsState}
        onAddContractor={onAddContractor}
        onAddContractorProject={onAddContractorProject}
      />

      <div className="sidebar-section">
        <div className="sidebar-kicker">Workspace</div>
        <nav className="sidebar-nav">
          {navItems.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={activeView === label ? "sidebar-link active" : "sidebar-link"}
              type="button"
              onClick={() => onViewChange(label)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="sidebar-divider" />

      <nav className="sidebar-nav compact">
        {lowerNav.map(({ label, icon: Icon }) => (
          <button
            key={label}
            className={activeView === label ? "sidebar-link active" : "sidebar-link"}
            type="button"
            onClick={() => onViewChange(label)}
          >
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

function createSeedThreads() {
  return [
    {
      id: "migration",
      title: "Migration",
      messages: [
        {
          id: "seed-user-1",
          role: "user",
          content: "I need to set up commission sync between Timekeeper and Dakota Wireless POS. Use the existing API and map sales data to employees based on clerk ID.",
          timestamp: "10:24 AM",
        },
        {
          id: "seed-assistant-1",
          role: "assistant",
          content: "I’ll set up the commission sync integration. I’ll inspect the existing API, confirm the employee mapping, preserve server-side secret handling, and keep the current cross-project relationship intact.",
          timestamp: "10:24 AM",
        },
        {
          id: "seed-user-2",
          role: "user",
          content: "Great. Also include a manual sync control in the Timekeeper admin panel.",
          timestamp: "10:26 AM",
        },
      ],
    },
    { id: "payroll", title: "Payroll", messages: [] },
    { id: "commission-sync", title: "Commission Sync", messages: [] },
  ];
}

function formatChatTime() {
  return new Intl.DateTimeFormat([], {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}

function loadProjectThreads(projectId) {
  try {
    const saved = window.localStorage.getItem(`viking-aries-chats:${projectId}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {
    // Fall back to starter threads if browser storage is unavailable.
  }
  return createSeedThreads();
}

function ChatWorkspace({ project }) {
  const [threads, setThreads] = useState(() => loadProjectThreads(project.id));
  const [activeThreadId, setActiveThreadId] = useState(() => loadProjectThreads(project.id)[0]?.id || "migration");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [statusText, setStatusText] = useState("Ready");
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);

  const activeThread = threads.find((thread) => thread.id === activeThreadId) || threads[0];

  useEffect(() => {
    window.localStorage.setItem(`viking-aries-chats:${project.id}`, JSON.stringify(threads));
  }, [project.id, threads]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [activeThreadId, activeThread?.messages?.length, sending]);

  const updateThread = (threadId, updater) => {
    setThreads((current) =>
      current.map((thread) => (thread.id === threadId ? updater(thread) : thread))
    );
  };

  const createNewChat = () => {
    const id = `chat-${Date.now()}`;
    setThreads((current) => [
      ...current,
      { id, title: "New Chat", messages: [] },
    ]);
    setActiveThreadId(id);
    setDraft("");
    setStatusText("New chat");
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const sendMessage = async () => {
    const content = draft.trim();
    if (!content || sending || !activeThread) return;

    const threadId = activeThread.id;
    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
      timestamp: formatChatTime(),
    };

    const requestMessages = [...activeThread.messages, userMessage].map(({ role, content: text }) => ({
      role,
      content: text,
    }));

    updateThread(threadId, (thread) => ({
      ...thread,
      title:
        thread.title === "New Chat"
          ? content.length > 28
            ? `${content.slice(0, 28)}…`
            : content
          : thread.title,
      messages: [...thread.messages, userMessage],
    }));

    setDraft("");
    setSending(true);
    setStatusText("Viking Aries is thinking…");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: {
            id: project.id,
            name: project.name,
          },
          thread: {
            id: threadId,
            title: activeThread.title,
          },
          messages: requestMessages,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || "The AI service did not return a response.");
      }

      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: payload.text || "I’m connected, but I didn’t receive any text back.",
        timestamp: formatChatTime(),
      };

      updateThread(threadId, (thread) => ({
        ...thread,
        messages: [...thread.messages, assistantMessage],
      }));
      setStatusText(payload.model ? `Connected · ${payload.model}` : "Connected");
    } catch (error) {
      const errorMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `I couldn’t complete that request. ${error.message}`,
        timestamp: formatChatTime(),
        error: true,
      };

      updateThread(threadId, (thread) => ({
        ...thread,
        messages: [...thread.messages, errorMessage],
      }));
      setStatusText("Connection needs attention");
    } finally {
      setSending(false);
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    }
  };

  const handleComposerKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  return (
    <main className="workspace">
      <div className="project-heading">
        <div className="project-title-row">
          <h1>{project.name}</h1>
          <span className="active-project"><span /> Active Project</span>
          <span className="chat-connection-status">{statusText}</span>
        </div>
      </div>

      <div className="chat-tab-row">
        {threads.map((thread) => (
          <button
            type="button"
            key={thread.id}
            className={activeThreadId === thread.id ? "chat-tab active" : "chat-tab"}
            onClick={() => {
              setActiveThreadId(thread.id);
              setStatusText("Ready");
            }}
            title={thread.title}
          >
            {thread.title}
          </button>
        ))}
        <button className="chat-tab new-chat" type="button" onClick={createNewChat}>
          <span>+</span> New Chat
        </button>
      </div>

      <div className="workspace-scroll" ref={scrollRef}>
        <ProjectContext />

        <section className="conversation live-conversation">
          {activeThread?.messages.length === 0 && (
            <div className="empty-chat-state">
              <div className="empty-chat-icon"><Bot size={22} /></div>
              <h3>Start a conversation</h3>
              <p>
                Ask Viking Aries to build, fix, inspect, connect, or deploy something in {project.name}.
              </p>
            </div>
          )}

          {activeThread?.messages.map((message) => (
            <article className="message-row" key={message.id}>
              {message.role === "user" ? (
                <div className="avatar">EE</div>
              ) : (
                <div className="assistant-avatar"><WandSparkles size={18} /></div>
              )}

              <div className="message-stack">
                <div className="message-meta">
                  <strong>{message.role === "user" ? "Erik" : "Viking Aries"}</strong>
                  <span>{message.timestamp}</span>
                </div>
                <div
                  className={
                    message.role === "user"
                      ? "user-message"
                      : message.error
                        ? "assistant-message error-message"
                        : "assistant-message"
                  }
                >
                  {message.content}
                </div>
              </div>
            </article>
          ))}

          {sending && (
            <article className="message-row">
              <div className="assistant-avatar"><WandSparkles size={18} /></div>
              <div className="message-stack">
                <div className="message-meta"><strong>Viking Aries</strong><span>now</span></div>
                <div className="assistant-message typing-message" aria-label="Viking Aries is typing">
                  <span /><span /><span />
                </div>
              </div>
            </article>
          )}
        </section>
      </div>

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          sendMessage();
        }}
      >
        <button className="attach-button" type="button" title="Attachments coming next">
          <Archive size={18} />
        </button>
        <textarea
          ref={textareaRef}
          value={draft}
          disabled={sending}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder="Tell Viking Aries what to build, fix, connect, or deploy..."
          rows={1}
        />
        <button className="send-button" type="submit" disabled={sending || !draft.trim()}>
          <Send size={17} /> {sending ? "Working" : "Send"}
        </button>
        <span className="composer-hint">Enter to send · Shift + Enter for new line</span>
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
  const widths = { Desktop: "100%", Mobile: "390px" };

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
  const [personalProjectsState, setPersonalProjectsState] = useState(() => {
    try {
      const saved = window.localStorage.getItem("viking-aries:personal-projects");
      return saved ? JSON.parse(saved) : personalProjects;
    } catch {
      return personalProjects;
    }
  });
  const [contractorsState, setContractorsState] = useState(() => {
    try {
      const saved = window.localStorage.getItem("viking-aries:contractors");
      return saved ? JSON.parse(saved) : defaultContractors;
    } catch {
      return defaultContractors;
    }
  });
  const [project, setProject] = useState(personalProjects[0]);
  const [activeView, setActiveView] = useState("Chats");
  const [previewMode, setPreviewMode] = useState("Desktop");
  const [previewVisible, setPreviewVisible] = useState(true);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(() => {
    const saved = Number(window.localStorage.getItem("viking-aries-preview-width"));
    return Number.isFinite(saved) && saved >= 26 && saved <= 65 ? saved : 36;
  });
  const [resizingPreview, setResizingPreview] = useState(false);

  useEffect(() => {
    window.localStorage.setItem("viking-aries:personal-projects", JSON.stringify(personalProjectsState));
  }, [personalProjectsState]);

  useEffect(() => {
    window.localStorage.setItem("viking-aries:contractors", JSON.stringify(contractorsState));
  }, [contractorsState]);

  const layoutClass = useMemo(() => {
    if (previewExpanded) return "app-shell preview-expanded";
    if (!previewVisible) return "app-shell preview-hidden";
    return "app-shell";
  }, [previewExpanded, previewVisible]);

  const changeWorkspace = (next) => {
    setWorkspace(next);
    setProject(
      next === "Personal"
        ? personalProjectsState[0] || personalProjects[0]
        : contractorsState[0]?.projects?.[0] || personalProjectsState[0] || personalProjects[0]
    );
  };

  const addPersonalProject = () => {
    const name = window.prompt("New personal project name");
    if (!name?.trim()) return null;

    const created = {
      id: `personal-${Date.now()}`,
      name: name.trim(),
      icon: Boxes,
    };

    setPersonalProjectsState((current) => [...current, created]);
    return created;
  };

  const addContractor = () => {
    const name = window.prompt("New contractor / client name");
    if (!name?.trim()) return null;

    const created = {
      id: `contractor-${Date.now()}`,
      name: name.trim(),
      projects: [],
    };

    setContractorsState((current) => [...current, created]);
    return created;
  };

  const addContractorProject = (contractorId) => {
    if (!contractorId) return null;

    const name = window.prompt("New project name");
    if (!name?.trim()) return null;

    const created = {
      id: `contractor-project-${Date.now()}`,
      name: name.trim(),
      icon: Archive,
    };

    setContractorsState((current) =>
      current.map((contractor) =>
        contractor.id === contractorId
          ? { ...contractor, projects: [...contractor.projects, created] }
          : contractor
      )
    );

    return created;
  };

  const startPreviewResize = (event) => {
    if (!previewVisible || previewExpanded) return;

    event.preventDefault();
    const shell = event.currentTarget.parentElement;
    const rect = shell.getBoundingClientRect();
    let latestWidth = previewWidth;

    setResizingPreview(true);
    document.body.classList.add("resizing-preview");

    const onPointerMove = (moveEvent) => {
      const rawPercent = ((rect.right - moveEvent.clientX) / rect.width) * 100;
      latestWidth = Math.min(65, Math.max(26, rawPercent));
      setPreviewWidth(latestWidth);
    };

    const stopResize = () => {
      setResizingPreview(false);
      document.body.classList.remove("resizing-preview");
      window.localStorage.setItem("viking-aries-preview-width", String(latestWidth));
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize);
  };

  const resetPreviewWidth = () => {
    setPreviewWidth(36);
    window.localStorage.setItem("viking-aries-preview-width", "36");
  };

  return (
    <div className={layoutClass}>
      <Sidebar
        project={project}
        workspace={workspace}
        onWorkspaceChange={changeWorkspace}
        onProjectChange={(nextProject) => {
          setProject(nextProject);
          setActiveView("Chats");
        }}
        activeView={activeView}
        onViewChange={setActiveView}
        personalProjectsState={personalProjectsState}
        onAddPersonalProject={addPersonalProject}
        contractorsState={contractorsState}
        onAddContractor={addContractor}
        onAddContractorProject={addContractorProject}
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

        <div
          className={resizingPreview ? "content-shell is-resizing" : "content-shell"}
          style={{ "--preview-width": `${previewWidth}%` }}
        >
          {!previewExpanded && (
            activeView === "Chats"
              ? <ChatWorkspace key={project.id} project={project} />
              : <WorkspaceView key={`${project.id}-${activeView}`} view={activeView} project={project} />
          )}
          {!previewExpanded && previewVisible && (
            <div
              className="preview-resize-handle"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize preview pane"
              title="Drag to resize preview · Double-click to reset"
              onPointerDown={startPreviewResize}
              onDoubleClick={resetPreviewWidth}
            >
              <GripVertical size={14} />
            </div>
          )}
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
