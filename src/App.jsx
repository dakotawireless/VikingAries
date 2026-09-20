import WorkspaceView from "./WorkspaceViews.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Archive,
  ArrowDown,
  Bot,
  Boxes,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock3,
  Cloud,
  Code2,
  Copy,
  Check,
  ChartNoAxesCombined,
  Database,
  Eye,
  EyeOff,
  FileImage,
  FlaskConical,
  Github,
  Globe2,
  GripVertical,
  KeyRound,
  Laptop,
  Link2,
  Logs,
  Maximize2,
  MessageSquare,
  Mic,
  Minimize2,
  Monitor,
  MoreHorizontal,
  PackageCheck,
  Plus,
  RefreshCw,
  Rocket,
  Send,
  Settings,
  Shield,
  SlidersHorizontal,
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
  {
    id: "timekeeper",
    name: "Timekeeper",
    icon: Clock3,
    repository: "dakotawireless/TimeKeeper-App",
    deploymentUrl: "https://timekeeper-app.erik-f2c.workers.dev",
    backend: "Convex",
    backendUrl: "https://aware-caiman-251.convex.cloud",
    convexDashboardUrl: "https://dashboard.convex.dev/t/erik-2df00/timekeeper/aware-caiman-251",
    status: "Active",
    contextSummary: [
      "Timekeeper is an independent production app migrated out of Hercules while preserving its existing Convex deployment and data.",
      "Production stack: GitHub source, Cloudflare Workers hosting, Convex backend/database, Gmail SMTP email.",
      "Production URL: https://timekeeper-app.erik-f2c.workers.dev",
      "Employee self-service portal: /employee",
      "Admin access remains PIN-based; employee clock access is restricted to registered browser profiles.",
      "Dakota Wireless POS commission sync is server-side and uses mapped POS user IDs.",
      "Do not replace Gmail SMTP with Microsoft Graph. Existing GMAIL_USER and GMAIL_APP_PASSWORD are the working mail configuration.",
      "Preserve existing data and working behavior unless Erik explicitly requests a change."
    ].join("\n"),
  },
  { id: "dw-pos", name: "Dakota Wireless POS", icon: Monitor },
  { id: "smoke-pos", name: "Smoke Signals POS", icon: TerminalSquare },
  { id: "dw-site", name: "DW Website", icon: Cloud },
  { id: "rez-lock", name: "Rez Lock & Key", icon: KeyRound },
  {
    id: "viking-aries",
    name: "Viking Aries",
    icon: Boxes,
    repository: "dakotawireless/VikingAries",
    deploymentUrl: "https://vikingaries.dakotawireless.net/",
    backend: "Convex",
    backendUrl: "https://flippant-mandrill-487.convex.cloud",
    convexDashboardUrl: "https://dashboard.convex.dev/",
    status: "Active",
  },
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

const projectIconMap = {
  timekeeper: Clock3,
  "dw-pos": Monitor,
  "smoke-pos": TerminalSquare,
  "dw-site": Cloud,
  "rez-lock": KeyRound,
  "viking-aries": Boxes,
  "client-demo": Archive,
};

function getProjectIcon(project, fallback = Boxes) {
  if (typeof project?.icon === "function") return project.icon;
  if (project?.iconKey === "archive") return Archive;
  if (project?.iconKey === "boxes") return Boxes;
  return projectIconMap[project?.id] || fallback;
}

const navItems = [
  { label: "AI Builder", icon: MessageSquare, group: "BUILD" },
  { label: "Features", icon: PackageCheck, group: "BUILD" },
  { label: "Users & Access", icon: Shield, group: "BUILD" },
  { label: "Files & Media", icon: FileImage, group: "BUILD" },
  { label: "Integrations", icon: Link2, group: "BUILD" },

  { label: "Database", icon: Database, group: "DATA & LOGIC" },
  { label: "Backend", icon: Code2, group: "DATA & LOGIC" },
  { label: "Automations", icon: Zap, group: "DATA & LOGIC" },
  { label: "API Usage", icon: ChartNoAxesCombined, group: "DATA & LOGIC" },

  { label: "Tests & Diagnostics", icon: FlaskConical, group: "TEST & RELEASE" },
  { label: "Versions", icon: RefreshCw, group: "TEST & RELEASE" },
  { label: "Deployments", icon: Rocket, group: "TEST & RELEASE" },
  { label: "Domains", icon: Globe2, group: "TEST & RELEASE" },

  { label: "Secrets", icon: KeyRound, group: "PROJECT" },
  { label: "Settings", icon: SlidersHorizontal, group: "PROJECT" },
];

const chatTabs = ["Migration", "Payroll", "Commission Sync"];

function ToolButton({ icon: Icon, label, href }) {
  if (href) {
    return (
      <a
        className="tool-button"
        href={href}
        target="_blank"
        rel="noreferrer"
        title={`Open ${label}`}
        aria-label={`Open ${label}`}
      >
        <Icon size={16} />
        <span>{label}</span>
      </a>
    );
  }

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
  const CurrentProjectIcon = getProjectIcon(project);

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
          <CurrentProjectIcon size={18} />
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
              const Icon = getProjectIcon(item, workspace === "Contractor" ? Archive : Boxes);
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
  onLogout,
  authConfigured,
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

      <div className="sidebar-section sidebar-project-tools">
        {["BUILD", "DATA & LOGIC", "TEST & RELEASE", "PROJECT"].map((group) => (
          <div className="sidebar-tool-group" key={group}>
            <div className="sidebar-kicker">{group}</div>
            <nav className="sidebar-nav">
              {navItems
                .filter((item) => item.group === group)
                .map(({ label, icon: Icon }) => (
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
        ))}
      </div>

      <div className="sidebar-footer">
        <button className="owner-card" type="button">
          <span className="avatar">EE</span>
          <span>
            <strong>Erik</strong>
            <small>Owner</small>
          </span>
          <ChevronRight size={16} />
        </button>
        <button
          className="logout-link"
          type="button"
          onClick={onLogout}
          disabled={!authConfigured}
          title={authConfigured ? "Log out of Viking Aries" : "Owner authentication is not configured yet"}
        >
          <X size={17} />
          {authConfigured ? "Log Out" : "Security Setup Needed"}
        </button>
      </div>
    </aside>
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

function loadProjectIntegrationMappings(project) {
  try {
    const saved = window.localStorage.getItem(`viking-aries:${project.id}:integration-mappings-v1`);
    if (saved) return JSON.parse(saved);
  } catch {
    // Fall back to project metadata below.
  }

  return {
    github: {
      enabled: Boolean(project.repository),
      repository: project.repository || (project.id === "viking-aries" ? "dakotawireless/VikingAries" : ""),
      branch: "main",
    },
    cloudflare: {
      enabled: Boolean(project.deploymentUrl),
      worker: project.id === "timekeeper" ? "timekeeper-app" : project.id === "viking-aries" ? "vikingaries" : "",
      deploymentUrl: project.deploymentUrl || "",
    },
    convex: {
      enabled: project.backend === "Convex" || Boolean(project.backendUrl),
      deployment:
        project.id === "timekeeper"
          ? "aware-caiman-251"
          : project.id === "viking-aries"
            ? "flippant-mandrill-487"
            : "",
      url: project.backendUrl || "",
      dashboardUrl: project.convexDashboardUrl || "",
    },
    drive: { enabled: false, folderUrl: "" },
    gmail: { enabled: project.id === "timekeeper", identity: "" },
  };
}

const VA_MODEL_OPTIONS = [
  { id: "gpt-5.6-luna", label: "Luna", note: "Fast / lowest cost" },
  { id: "gpt-5.6-terra", label: "Terra", note: "Build / balanced" },
  { id: "gpt-5.6-sol", label: "Sol", note: "Deep / highest capability" },
];

function loadSelectedModel() {
  const saved = window.localStorage.getItem("viking-aries:selected-model");
  return VA_MODEL_OPTIONS.some((item) => item.id === saved) ? saved : "gpt-5.6-luna";
}

function loadProjectDraft(projectId) {
  try {
    return window.localStorage.getItem(`viking-aries-draft:${projectId}`) || "";
  } catch {
    return "";
  }
}

function ChatWorkspace({ project, active = true }) {
  const [threads, setThreads] = useState(() => loadProjectThreads(project.id));
  const [activeThreadId, setActiveThreadId] = useState(() => {
    const availableThreads = loadProjectThreads(project.id);
    const savedThreadId = window.localStorage.getItem(`viking-aries:active-chat:${project.id}`);
    return availableThreads.some((thread) => thread.id === savedThreadId)
      ? savedThreadId
      : availableThreads[0]?.id || "migration";
  });
  const [draft, setDraft] = useState(() => loadProjectDraft(project.id));
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [statusText, setStatusText] = useState("Ready");
  const [selectedModel, setSelectedModel] = useState(loadSelectedModel);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);
  const recognitionSessionRef = useRef(0);

  const activeThread = threads.find((thread) => thread.id === activeThreadId) || threads[0];

  useEffect(() => {
    window.localStorage.setItem(`viking-aries-chats:${project.id}`, JSON.stringify(threads));
  }, [project.id, threads]);

  useEffect(() => {
    window.localStorage.setItem(`viking-aries:active-chat:${project.id}`, activeThreadId);
  }, [project.id, activeThreadId]);

  useEffect(() => {
    const key = `viking-aries-draft:${project.id}`;
    try {
      if (draft) {
        window.localStorage.setItem(key, draft);
      } else {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Keep the in-memory draft usable even if browser storage is unavailable.
    }
  }, [project.id, draft]);

  useEffect(() => {
    window.localStorage.setItem("viking-aries:selected-model", selectedModel);
  }, [selectedModel]);

  const scrollToChatBottom = (behavior = "auto") => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior });
    setShowJumpToBottom(false);
  };

  const handleChatScroll = () => {
    const node = scrollRef.current;
    if (!node) return;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    setShowJumpToBottom(distanceFromBottom > 140);
  };

  useEffect(() => {
    const run = () => scrollToChatBottom("auto");

    // Run after layout and once more after embedded content/fonts finish settling.
    const frame = window.requestAnimationFrame(run);
    const timer = window.setTimeout(run, 80);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [project.id, activeThreadId, activeThread?.messages?.length, sending]);

  useEffect(() => {
    if (!active && recognitionRef.current) {
      recognitionSessionRef.current += 1;
      recognitionRef.current?.abort?.();
      recognitionRef.current = null;
      setListening(false);
    }
  }, [active]);

  useEffect(() => {
    return () => {
      recognitionSessionRef.current += 1;
      recognitionRef.current?.abort?.();
      recognitionRef.current = null;
    };
  }, []);

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
    try {
      window.localStorage.removeItem(`viking-aries-draft:${project.id}`);
    } catch {
      // Ignore browser storage failures.
    }
    setStatusText("New chat");
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const sendMessage = async () => {
    const content = draft.trim();
    if (!content || sending || !activeThread) return;

    // Invalidate the current speech-recognition session before clearing the
    // composer so a late onresult callback cannot repopulate a sent draft.
    recognitionSessionRef.current += 1;
    const activeRecognition = recognitionRef.current;
    recognitionRef.current = null;
    if (activeRecognition) {
      try {
        activeRecognition.abort?.();
      } catch {
        activeRecognition.stop?.();
      }
      setListening(false);
    }

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
    const integrationMappings = loadProjectIntegrationMappings(project);

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
    try {
      window.localStorage.removeItem(`viking-aries-draft:${project.id}`);
    } catch {
      // Ignore browser storage failures.
    }
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
            repository: integrationMappings.github?.enabled
              ? integrationMappings.github.repository || project.repository || null
              : project.repository || null,
            defaultBranch: integrationMappings.github?.branch || "main",
            deploymentUrl: integrationMappings.cloudflare?.enabled
              ? integrationMappings.cloudflare.deploymentUrl || project.deploymentUrl || null
              : project.deploymentUrl || null,
            cloudflareWorker: integrationMappings.cloudflare?.worker || null,
            backend: project.backend || (integrationMappings.convex?.enabled ? "Convex" : null),
            backendDeployment: integrationMappings.convex?.deployment || null,
            backendUrl: integrationMappings.convex?.enabled
              ? integrationMappings.convex.url || project.backendUrl || null
              : project.backendUrl || null,
            convexDashboardUrl: integrationMappings.convex?.dashboardUrl || project.convexDashboardUrl || null,
            driveFolderUrl: integrationMappings.drive?.enabled ? integrationMappings.drive.folderUrl || null : null,
            gmailIdentity: integrationMappings.gmail?.enabled ? integrationMappings.gmail.identity || null : null,
            status: project.status || null,
            contextSummary: project.contextSummary || null,
          },
          thread: {
            id: threadId,
            title: activeThread.title,
          },
          messages: requestMessages,
          model: selectedModel,
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

  const copyMessageText = async (message) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message.content);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = message.content;
        textArea.setAttribute("readonly", "");
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }

      setCopiedMessageId(message.id);
      window.setTimeout(() => {
        setCopiedMessageId((current) => (current === message.id ? null : current));
      }, 1600);
    } catch {
      setStatusText("Could not copy that response");
    }
  };

  const toggleVoiceInput = () => {
    if (listening) {
      recognitionRef.current?.stop?.();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatusText("Voice input is not supported in this browser");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    const recognitionSession = recognitionSessionRef.current + 1;
    recognitionSessionRef.current = recognitionSession;

    let baseDraft = draft;
    let finalTranscript = "";

    recognition.onstart = () => {
      if (recognitionSessionRef.current !== recognitionSession) return;
      recognitionRef.current = recognition;
      setListening(true);
      setStatusText("Listening…");
    };

    recognition.onresult = (event) => {
      if (recognitionSessionRef.current !== recognitionSession) return;
      let interimTranscript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0]?.transcript || "";
        if (event.results[index].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      const spokenText = `${finalTranscript}${interimTranscript}`.trim();
      const separator = baseDraft.trim() && spokenText ? " " : "";
      setDraft(`${baseDraft}${separator}${spokenText}`);
    };

    recognition.onerror = (event) => {
      if (recognitionSessionRef.current !== recognitionSession) return;
      if (event.error !== "aborted") {
        setStatusText(`Voice input error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      if (recognitionSessionRef.current !== recognitionSession) return;
      recognitionRef.current = null;
      setListening(false);
      setStatusText("Ready");
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    };

    recognition.start();
  };

  const handleComposerKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  return (
    <main
      className={active ? "workspace chat-workspace-host active" : "workspace chat-workspace-host background"}
      aria-hidden={!active}
      style={active ? undefined : { display: "none" }}
    >
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

      <div className="workspace-scroll" ref={scrollRef} onScroll={handleChatScroll}>
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
                  {message.role === "assistant" && (
                    <button
                      className="copy-message-button"
                      type="button"
                      onClick={() => copyMessageText(message)}
                      title={copiedMessageId === message.id ? "Copied" : "Copy response"}
                      aria-label={copiedMessageId === message.id ? "Copied response" : "Copy response"}
                    >
                      {copiedMessageId === message.id ? <Check size={15} /> : <Copy size={15} />}
                      <span>{copiedMessageId === message.id ? "Copied" : "Copy"}</span>
                    </button>
                  )}
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

      {showJumpToBottom && (
        <button
          type="button"
          className="jump-to-bottom-button"
          onClick={() => scrollToChatBottom("smooth")}
          title="Jump to latest message"
          aria-label="Jump to latest message"
        >
          <ArrowDown size={17} />
          <span>Latest</span>
        </button>
      )}

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
        <button
          className={listening ? "voice-button active" : "voice-button"}
          type="button"
          title={listening ? "Stop voice input" : "Start voice input"}
          aria-label={listening ? "Stop voice input" : "Start voice input"}
          aria-pressed={listening}
          onClick={toggleVoiceInput}
          disabled={sending}
        >
          <Mic size={18} />
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
        <label className="model-picker">
          <span>Model</span>
          <select
            value={selectedModel}
            onChange={(event) => setSelectedModel(event.target.value)}
            disabled={sending}
            title="Choose the AI model for the next message"
          >
            {VA_MODEL_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label} — {option.note}
              </option>
            ))}
          </select>
        </label>
        <span className="composer-hint">Enter to send · Shift + Enter for new line</span>
      </form>
    </main>
  );
}

function PreviewDashboard({ project }) {
  const ProjectIcon = getProjectIcon(project, Boxes);

  return (
    <div className="preview-app">
      <div className="preview-app-header">
        <div className="preview-app-brand"><ProjectIcon size={18} /> <strong>{project?.name || "Project"}</strong></div>
        <nav>
          <span className="active">Preview</span>
        </nav>
        <Settings size={17} />
      </div>

      <div className="preview-dashboard">
        <div className="empty-preview-state">
          <div className="empty-preview-icon"><Monitor size={28} /></div>
          <h2>No live preview connected yet</h2>
          <p>
            Add this project's production, staging, or preview URL in Settings or Deployments.
            Viking Aries will load the actual app here when a URL is available.
          </p>
          <div className="preview-project-facts">
            {project?.repository && <span><Github size={14} /> {project.repository}</span>}
            {project?.backend && <span><Database size={14} /> {project.backend}</span>}
            {project?.status && <span><ShieldCheck size={14} /> {project.status}</span>}
          </div>
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

function PreviewPane({ project, mode, onModeChange, expanded, visible, onExpand, onToggleVisibility }) {
  const widths = { Desktop: "100%", Mobile: "390px" };
  const integrationUrls = {
    github: project?.repository ? `https://github.com/${project.repository}` : "https://github.com/",
    cloudflare: "https://dash.cloudflare.com/",
    convex: project?.convexDashboardUrl || "https://dashboard.convex.dev/",
    drive: "https://drive.google.com/drive/my-drive",
    gmail: "https://mail.google.com/",
  };

  return (
    <aside className={expanded ? "preview-pane expanded" : "preview-pane"}>
      <div className="preview-toolbar">
        <div className="preview-title">
          <h2>Preview</h2>
          <p>Live view of your application</p>
        </div>

        <div className="preview-header-controls">
          <div className="preview-integrations">
            <ToolButton icon={Github} label="GitHub" href={integrationUrls.github} />
            <ToolButton icon={Cloud} label="Cloudflare" href={integrationUrls.cloudflare} />
            <ToolButton icon={Boxes} label="Convex" href={integrationUrls.convex} />
            <ToolButton icon={FileImage} label="Drive" href={integrationUrls.drive} />
            <ToolButton icon={Send} label="Gmail" href={integrationUrls.gmail} />
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
            {project?.deploymentUrl ? (
              <iframe
                key={project.deploymentUrl}
                src={project.deploymentUrl}
                title={`${project.name} live preview`}
                style={{ width: "100%", height: "100%", minHeight: "720px", border: 0, background: "#fff" }}
              />
            ) : (
              <PreviewDashboard project={project} />
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

function VikingAriesApp({ onLogout, authConfigured }) {
  const [workspace, setWorkspace] = useState(() => {
    const saved = window.localStorage.getItem("viking-aries:active-workspace");
    return saved === "Contractor" ? "Contractor" : "Personal";
  });
  const [personalProjectsState, setPersonalProjectsState] = useState(() => {
    try {
      const saved = window.localStorage.getItem("viking-aries:personal-projects");
      if (!saved) return personalProjects;
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return personalProjects;
      const known = personalProjects.map((base) => ({
        ...(parsed.find((item) => item.id === base.id) || {}),
        ...base,
      }));
      const custom = parsed.filter((item) => !personalProjects.some((base) => base.id === item.id));
      return [...known, ...custom];
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
  const [project, setProject] = useState(() => {
    const savedWorkspace = window.localStorage.getItem("viking-aries:active-workspace");
    const savedProjectId = window.localStorage.getItem("viking-aries:active-project");

    const personalMatch = personalProjectsState.find((item) => item.id === savedProjectId);
    const contractorMatch = contractorsState
      .flatMap((contractor) => contractor.projects || [])
      .find((item) => item.id === savedProjectId);

    if (savedWorkspace === "Contractor" && contractorMatch) return contractorMatch;
    if (personalMatch) return personalMatch;
    if (contractorMatch) return contractorMatch;
    return personalProjectsState[0] || personalProjects[0];
  });
  const [activeView, setActiveView] = useState("AI Builder");
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

  useEffect(() => {
    window.localStorage.setItem("viking-aries:active-workspace", workspace);
  }, [workspace]);

  useEffect(() => {
    if (project?.id) {
      window.localStorage.setItem("viking-aries:active-project", project.id);
    }
  }, [project]);

  const layoutClass = useMemo(() => {
    if (previewExpanded) return "app-shell preview-expanded";
    if (!previewVisible) return "app-shell preview-hidden";
    return "app-shell";
  }, [previewExpanded, previewVisible]);

  const allChatProjects = useMemo(() => {
    const rows = [
      ...personalProjectsState,
      ...contractorsState.flatMap((contractor) => contractor.projects || []),
    ];
    const seen = new Set();
    return rows.filter((item) => {
      if (!item?.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [personalProjectsState, contractorsState]);

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
      iconKey: "boxes",
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
      iconKey: "archive",
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

    const handle = event.currentTarget;
    const shell = handle.parentElement;
    if (!shell) return;

    const rect = shell.getBoundingClientRect();
    const pointerId = event.pointerId;
    let latestWidth = previewWidth;

    // Keep receiving pointer events even when the cursor crosses the live-preview iframe.
    try {
      handle.setPointerCapture(pointerId);
    } catch {
      // Pointer capture is an enhancement; the drag shield below is the fallback.
    }

    setResizingPreview(true);
    document.body.classList.add("resizing-preview");

    const updateWidth = (clientX) => {
      const rawPercent = ((rect.right - clientX) / rect.width) * 100;

      // Keep both panes usable and make it impossible to strand the divider at an edge.
      const minPreviewPx = 300;
      const minWorkspacePx = 320;
      const dividerPx = 7;
      const minPercent = Math.max(22, (minPreviewPx / rect.width) * 100);
      const maxPercent = Math.min(
        72,
        ((rect.width - minWorkspacePx - dividerPx) / rect.width) * 100
      );

      latestWidth = Math.min(
        Math.max(minPercent, maxPercent),
        Math.max(minPercent, rawPercent)
      );
      setPreviewWidth(latestWidth);
    };

    const onPointerMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      updateWidth(moveEvent.clientX);
    };

    const stopResize = (upEvent) => {
      if (upEvent?.pointerId != null && upEvent.pointerId !== pointerId) return;

      try {
        if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      } catch {
        // Ignore capture cleanup failures.
      }

      setResizingPreview(false);
      document.body.classList.remove("resizing-preview");
      window.localStorage.setItem("viking-aries-preview-width", String(latestWidth));

      handle.removeEventListener("pointermove", onPointerMove);
      handle.removeEventListener("pointerup", stopResize);
      handle.removeEventListener("pointercancel", stopResize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };

    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", stopResize);
    handle.addEventListener("pointercancel", stopResize);

    // Window listeners are retained as a fallback for browsers with incomplete capture behavior.
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
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
          setActiveView("AI Builder");
        }}
        activeView={activeView}
        onViewChange={setActiveView}
        personalProjectsState={personalProjectsState}
        onAddPersonalProject={addPersonalProject}
        contractorsState={contractorsState}
        onAddContractor={addContractor}
        onAddContractorProject={addContractorProject}
        onLogout={onLogout}
        authConfigured={authConfigured}
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
            <>
              {allChatProjects.map((chatProject) => (
                <ChatWorkspace
                  key={chatProject.id}
                  project={chatProject}
                  active={activeView === "AI Builder" && chatProject.id === project.id}
                />
              ))}
              {activeView !== "AI Builder" && (
                <WorkspaceView
                  key={`${project.id}-${activeView}`}
                  view={activeView}
                  project={project}
                  projects={workspace === "Personal" ? personalProjectsState : contractorsState.flatMap((contractor) => contractor.projects || [])}
                  workspace={workspace}
                />
              )}
            </>
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
            project={project}
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


function OwnerLogin({ onAuthenticated }) {
  const [accessCode, setAccessCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (!accessCode.trim() || submitting) return;

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not sign in.");
      setAccessCode("");
      onAuthenticated();
    } catch (loginError) {
      setError(loginError.message || "Could not sign in.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="owner-login-screen">
      <section className="owner-login-card">
        <div className="owner-login-brand">
          <span className="brand-mark">VA</span>
          <div>
            <h1>Viking Aries</h1>
            <p>Owner access</p>
          </div>
        </div>

        <div className="owner-login-shield"><ShieldCheck size={30} /></div>
        <h2>Sign in to continue</h2>
        <p className="owner-login-copy">
          This workspace can manage source code, deployments, data, files, and connected services.
        </p>

        <form onSubmit={submit}>
          <label>
            <span>Owner access code</span>
            <input
              type="password"
              autoComplete="current-password"
              value={accessCode}
              autoFocus
              onChange={(event) => setAccessCode(event.target.value)}
              placeholder="Enter owner access code"
            />
          </label>

          {error && <div className="owner-login-error">{error}</div>}

          <button className="primary-action owner-login-submit" type="submit" disabled={submitting || !accessCode.trim()}>
            <KeyRound size={16} />
            {submitting ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <small>Sessions expire automatically after 12 hours.</small>
      </section>
    </main>
  );
}

export default function App() {
  const [authState, setAuthState] = useState({
    loading: true,
    configured: false,
    authenticated: false,
  });

  const refreshAuth = async () => {
    try {
      const response = await fetch("/api/auth/status", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      setAuthState({
        loading: false,
        configured: Boolean(payload.configured),
        authenticated: Boolean(payload.authenticated),
      });
    } catch {
      // Keep the app usable during initial security setup, but do not treat it as authenticated.
      setAuthState({ loading: false, configured: false, authenticated: false });
    }
  };

  useEffect(() => {
    refreshAuth();
  }, []);

  const logout = async () => {
    if (!authState.configured) return;
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setAuthState((current) => ({ ...current, authenticated: false }));
    }
  };

  if (authState.loading) {
    return (
      <main className="owner-login-screen">
        <section className="owner-login-card owner-login-loading">
          <div className="owner-login-shield"><ShieldCheck size={30} /></div>
          <h2>Checking owner session…</h2>
        </section>
      </main>
    );
  }

  if (authState.configured && !authState.authenticated) {
    return <OwnerLogin onAuthenticated={refreshAuth} />;
  }

  return (
    <VikingAriesApp
      onLogout={logout}
      authConfigured={authState.configured}
    />
  );
}
