import { MIGRATED_PROJECTS, migrateProjectMappings } from "../shared/projects.js";
import { ApiCounter } from "./api-usage.jsx";
import WorkspaceView from "./WorkspaceViews.jsx";
import { startSharedStorageSync } from "./shared-storage.js";
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
  FileText,
  FlaskConical,
  Github,
  Globe2,
  GripVertical,
  KeyRound,
  Laptop,
  Link2,
  Logs,
  Maximize2,
  Menu,
  MessageSquare,
  Mic,
  Minimize2,
  Monitor,
  MoreHorizontal,
  PackageCheck,
  Paperclip,
  Plus,
  RefreshCw,
  Rocket,
  Send,
  Settings,
  Square,
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
  {
    id: "dw-pos",
    name: "Dakota Wireless POS",
    icon: Monitor,
    ...MIGRATED_PROJECTS["dw-pos"],
  },
  {
    id: "smoke-pos",
    name: "Smoke Signals POS",
    icon: TerminalSquare,
    ...MIGRATED_PROJECTS["smoke-pos"],
  },
  { id: "dw-site", name: "DW Website", icon: Cloud, ...MIGRATED_PROJECTS["dw-site"] },
  {
    id: "rez-lock",
    name: "Rez Lock & Key",
    icon: KeyRound,
    repository: "dakotawireless/rez-lock-and-key-staging",
    deploymentUrl: "https://rez-lock-and-key-staging.erik-f2c.workers.dev",
    backend: "Cloudflare Worker",
    status: "Active",
    contextSummary: [
      "Rez Lock & Key is an existing website project imported into Viking Aries without redesigning or changing website behavior.",
      "Source repository: dakotawireless/rez-lock-and-key-staging on main.",
      "Hosting/runtime: Cloudflare Worker rez-lock-and-key-staging with static assets from public and /api/* handled by src/worker.js.",
      "Cloudflare Workers Builds deploys commits from main using npm run build and npm run deploy.",
      "The website lead/estimate API forwards to the existing RLK_EMAIL_WEBHOOK_URL integration and uses the provider-managed RLK_WEBHOOK_SECRET.",
      "Do not rotate, replace, or expose existing secret values during project migration. Unknown secret values remain provider-managed.",
      "Preserve the current website design and behavior unless Erik explicitly requests a website change."
    ].join("\n"),
  },
  {
    id: "viking-aries",
    name: "Viking Aries",
    icon: Boxes,
    ...MIGRATED_PROJECTS["viking-aries"],
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
  { label: "Theme", icon: WandSparkles, group: "PROJECT" },
  { label: "Settings", icon: SlidersHorizontal, group: "PROJECT" },
];

const chatTabs = ["Migration", "Payroll", "Commission Sync"];

function ToolButton({ icon: Icon, label, href }) {
  const windowName = `viking-aries-helper-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  if (href) {
    const openHelperWindow = (event) => {
      event.preventDefault();
      const helperWindow = window.open(href, windowName);
      helperWindow?.focus?.();
    };

    return (
      <a
        className="tool-button"
        href={href}
        target={windowName}
        rel="noreferrer"
        onClick={openHelperWindow}
        title={`Open ${label} (reuses its window)`}
        aria-label={`Open ${label} (reuses its window)`}
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
  theme,
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><span className="brand-rune">ᚨ</span></div>
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
        <div className="sidebar-footer-actions">
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
          <ApiCounter />
        </div>
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

function formatChatTimestamp(value) {
  return new Intl.DateTimeFormat([], {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(Number(value) || Date.now()));
}

function renderLinkedText(text, keyPrefix) {
  // Support both Markdown links returned by the AI and normal pasted URLs.
  // Only http(s) and mailto links are matched, so chat text cannot create
  // executable javascript: links.
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)|(https?:\/\/[^\s<>"']+|mailto:[^\s<>"']+)/gi;
  const parts = [];
  let cursor = 0;
  let match;
  let linkIndex = 0;

  while ((match = linkPattern.exec(text)) !== null) {
    if (match.index > cursor) {
      parts.push(<span key={`${keyPrefix}-text-${cursor}`}>{text.slice(cursor, match.index)}</span>);
    }

    const markdownLabel = match[1];
    const rawHref = match[2] || match[3];
    // Sentence punctuation is commonly placed immediately after a pasted URL.
    const href = markdownLabel ? rawHref : rawHref.replace(/[.,!?;:]+$/, "");
    const suffix = markdownLabel ? "" : rawHref.slice(href.length);

    parts.push(
      <a
        key={`${keyPrefix}-link-${linkIndex}`}
        className="chat-message-link"
        href={href}
        target="_blank"
        rel="noreferrer"
      >
        {markdownLabel || href}
      </a>
    );
    if (suffix) parts.push(<span key={`${keyPrefix}-suffix-${linkIndex}`}>{suffix}</span>);

    linkIndex += 1;
    cursor = match.index + match[0].length;
  }

  if (!parts.length) return text;
  if (cursor < text.length) {
    parts.push(<span key={`${keyPrefix}-text-trailing`}>{text.slice(cursor)}</span>);
  }
  return parts;
}

function sanitizeLegacyAttachmentContent(content) {
  let text = String(content || "");

  // Older VA builds appended the whole PDF data URL to the visible message.
  // If one of those markers was truncated, a regex that expects the closing
  // bracket cannot hide it. Collapse from the marker to the end because legacy
  // attachment markers were always appended after the user's typed text.
  const legacyPdfStart = text.indexOf("[VA_PDF_ATTACHMENT:data:application/pdf;base64,");
  if (legacyPdfStart >= 0) {
    text = `${text.slice(0, legacyPdfStart).trimEnd()}\n[VA_FILE:${encodeURIComponent("attached.pdf")}|application/pdf]`;
  }

  const legacyGenericStart = text.indexOf("[VA_ATTACHMENT:");
  if (legacyGenericStart >= 0) {
    const dataStart = text.indexOf("|data:", legacyGenericStart);
    if (dataStart >= 0) {
      const header = text.slice(legacyGenericStart + "[VA_ATTACHMENT:".length, dataStart);
      const divider = header.indexOf("|");
      const encodedName = divider >= 0 ? header.slice(0, divider) : encodeURIComponent("Attachment");
      const type = divider >= 0 ? header.slice(divider + 1) : "application/octet-stream";
      text = `${text.slice(0, legacyGenericStart).trimEnd()}\n[VA_FILE:${encodedName}|${type}]`;
    }
  }

  return text.trim();
}

function attachmentMetaFromContent(content) {
  const text = sanitizeLegacyAttachmentContent(content);
  const match = text.match(/\[VA_FILE:([^|\]]+)\|([^\]]+)\]/i);
  if (!match) return null;

  let name = match[1] || "Attachment";
  try { name = decodeURIComponent(name); } catch { /* Keep encoded fallback. */ }
  const type = match[2] || "application/octet-stream";
  return {
    name,
    type,
    kind: type === "application/pdf" ? "pdf" : type.startsWith("image/") ? "image" : "file",
  };
}

function stripAttachmentMarkers(content) {
  return sanitizeLegacyAttachmentContent(content)
    .replace(/\[VA_FILE:[^\]]+\]/gi, "")
    .trim();
}

function ChatAttachmentCard({ message, onImageOpen }) {
  if (message?.role !== "user") return null;
  const meta = message.attachmentMeta || attachmentMetaFromContent(message.content);
  if (!meta) return null;

  const isImage = meta.kind === "image" || String(meta.type || "").startsWith("image/");
  const isPdf = meta.kind === "pdf" || meta.type === "application/pdf";

  return (
    <div className="chat-file-attachment" aria-label={`Attached file ${meta.name}`}>
      {isImage && message.fullSizeImage ? (
        <button
          className="chat-file-image-preview"
          type="button"
          onClick={() => onImageOpen?.(message.fullSizeImage)}
          title="Open attached image"
        >
          <img src={message.fullSizeImage} alt={meta.name || "Attached image"} />
        </button>
      ) : (
        <span className={isPdf ? "chat-file-icon pdf" : "chat-file-icon"}>
          <FileText size={20} />
        </span>
      )}
      <span className="chat-file-copy">
        <strong>{meta.name || "Attachment"}</strong>
        <small>{isPdf ? "PDF document" : isImage ? "Image" : meta.type || "File"} · available to Viking Aries</small>
      </span>
    </div>
  );
}

function renderChatContent(content, onImageOpen, fullSizeImage = "") {
  const text = stripAttachmentMarkers(content);
  if (!text) return null;

  // Continue rendering inline images from older chat messages, but new file
  // uploads are displayed by ChatAttachmentCard and are not embedded in text.
  const imagePattern = /!\[[^\]]*\]\(\s*(data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\r\n]+)\s*\)/gi;
  const parts = [];
  let cursor = 0;
  let match;
  let imageIndex = 0;

  while ((match = imagePattern.exec(text)) !== null) {
    const textBefore = text.slice(cursor, match.index);
    if (textBefore) parts.push(...[].concat(renderLinkedText(textBefore, `text-${match.index}`)));
    const imageSource = match[1].replace(/\s/g, "");
    const fullImageSource = fullSizeImage || imageSource;
    parts.push(
      <button
        key={`pasted-image-${imageIndex}`}
        type="button"
        className="chat-pasted-image-link"
        onClick={() => onImageOpen?.(fullImageSource)}
        title="Open full-size image"
        aria-label="Open pasted image full size"
      >
        <img className="chat-pasted-image" src={imageSource} alt="Pasted image" />
      </button>
    );
    imageIndex += 1;
    cursor = match.index + match[0].length;
  }

  if (!parts.length) return renderLinkedText(text, "chat");
  const trailingText = text.slice(cursor);
  if (trailingText) parts.push(...[].concat(renderLinkedText(trailingText, "text-trailing")));
  return parts;
}

function loadProjectThreads(projectId) {
  try {
    const saved = window.localStorage.getItem(`viking-aries-chats:${projectId}`);
    if (saved !== null) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map((thread) => ({
          ...thread,
          messages: Array.isArray(thread.messages)
            ? thread.messages.map((message) => ({
                ...message,
                content:
                  typeof message?.content === "string"
                    ? sanitizeLegacyAttachmentContent(message.content)
                    : message?.content,
              }))
            : [],
        }));
      }
      if (Array.isArray(parsed) && parsed.length === 0) {
        return [{ id: `chat-${Date.now()}`, title: "New Chat", messages: [] }];
      }
    }
  } catch {
    // Fall back to starter threads if browser storage is unavailable.
  }
  return createSeedThreads();
}

function loadProjectIntegrationMappings(project) {
  if (MIGRATED_PROJECTS[project.id]) {
    try {
      return migrateProjectMappings(project.id, JSON.parse(window.localStorage.getItem(`viking-aries:${project.id}:integration-mappings-v1`)) || {});
    } catch { return migrateProjectMappings(project.id); }
  }
  try {
    const saved = window.localStorage.getItem(`viking-aries:${project.id}:integration-mappings-v1`);
    if (saved) return migrateProjectMappings(project.id, JSON.parse(saved));
  } catch {
    // Fall back to project metadata below.
  }

  return {
    github: {
      enabled: Boolean(project.repository),
      repository: project.repository || (project.id === "viking-aries" ? "dakotawireless/VikingAries" : ""),
      branch: project.defaultBranch || "main",
    },
    cloudflare: {
      enabled: Boolean(project.cloudflareWorker || project.deploymentUrl),
      worker:
        project.cloudflareWorker ||
        (project.id === "timekeeper"
          ? "timekeeper-app"
          : project.id === "viking-aries"
            ? "vikingaries"
            : project.id === "rez-lock"
              ? "rez-lock-and-key-staging"
              : ""),
      deploymentUrl: project.deploymentUrl || "",
    },
    convex: {
      enabled: project.backend === "Convex" || Boolean(project.backendUrl),
      deployment:
        project.id === "dw-pos"
          ? "sleek-bear-647"
          : project.id === "timekeeper"
            ? "aware-caiman-251"
            : project.id === "viking-aries"
              ? "flippant-mandrill-487"
              : "",
      url: project.backendUrl || "",
      dashboardUrl: project.convexDashboardUrl || "",
    },
    drive: {
      enabled: project.id === "rez-lock",
      account: project.id === "rez-lock" ? "rezridesllc@gmail.com" : "",
      folderUrl: "",
    },
    gmail: {
      enabled: project.id === "timekeeper" || project.id === "rez-lock",
      account: project.id === "rez-lock" ? "rezridesllc@gmail.com" : "",
      identity: project.id === "rez-lock" ? "rezridesllc@gmail.com" : "",
    },
  };
}

const VA_AUTO_MODEL = "auto";

const VA_MODEL_OPTIONS = [
  { id: VA_AUTO_MODEL, label: "Auto", note: "Routes each request by complexity" },
  { id: "gpt-5.6-luna", label: "Luna", note: "Fast / lowest cost" },
  { id: "gpt-5.6-terra", label: "Terra", note: "Build / balanced" },
  { id: "gpt-5.6-sol", label: "Sol", note: "Advanced / complex work" },
  { id: "gpt-6-astra", label: "Astra", note: "Maximum capability / hardest work" },
];

const VA_MODEL_BY_ID = Object.fromEntries(
  VA_MODEL_OPTIONS.map((option) => [option.id, option])
);

function recommendModelForTask(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  const lower = text.toLowerCase();

  // Astra is intentionally rare in Auto mode because it is the highest-cost
  // option. Escalate only for the hardest end-to-end work: multi-system,
  // high-risk, deeply ambiguous, or architecture-plus-migration requests.
  const astraSignals = [
    /\b(use|switch to|run with|choose)\s+astra\b/,
    /\b(hardest|maximum capability|max capability|extremely complex|very complex|deepest reasoning)\b/,
    /\b(cross-project|multi-system|across multiple systems|across multiple projects)\b[\s\S]{0,140}\b(migration|cutover|architecture|re-architect|rearchitect|security|payments?|payroll|authentication|data migration|production)\b/,
    /\b(production|live)\b[\s\S]{0,120}\b(data migration|database migration|cutover|security incident|payment migration|auth migration|authentication migration)\b/,
    /\b(entire|whole|full|complete)\b[\s\S]{0,100}\b(platform|system|architecture|codebase)\b[\s\S]{0,120}\b(re-architect|rearchitect|migrate|migration|rewrite|overhaul)\b[\s\S]{0,120}\b(database|backend|frontend|integrations?|auth|payments?|production)\b/,
    /\b(architecture|migration|cutover|security|payments?|authentication|database)\b[\s\S]{0,160}\b(architecture|migration|cutover|security|payments?|authentication|database)\b[\s\S]{0,160}\b(architecture|migration|cutover|security|payments?|authentication|database)\b/,
  ];

  // Sol remains the normal escalation for large but well-defined project work.
  // Astra is reserved for the exceptional cases above.
  const solSignals = [
    /\b(entire|whole|full|complete)\b[\s\S]{0,80}\b(app|application|website|site|platform|system|project|codebase|architecture)\b[\s\S]{0,80}\b(redo|redesign|rebuild|rewrite|refactor|overhaul|re-architect|rearchitect)\b/,
    /\b(redo|redesign|rebuild|rewrite|refactor|overhaul|re-architect|rearchitect)\b[\s\S]{0,80}\b(entire|whole|full|complete)\b[\s\S]{0,80}\b(app|application|website|site|platform|system|project|codebase|architecture)\b/,
    /\b(full migration|migrate the entire|migrate everything|system-wide|cross-project|across multiple projects|all projects)\b/,
    /\b(schema migration|data model redesign|security audit|performance overhaul|architecture overhaul|platform redesign|major architectural redesign)\b/,
  ];

  if (astraSignals.some((pattern) => pattern.test(lower))) {
    return {
      id: "gpt-6-astra",
      label: "Astra",
      reason: "Hardest end-to-end, cross-system, or high-risk work",
    };
  }

  // Small, bounded UI requests should stay on Luna even when they use words
  // such as "add" or mention a dashboard. A single external link/button does
  // not justify Terra's implementation cost.
  const lightweightUiSignals = [
    /\b(add|create|include|put|show|make)\b[\s\S]{0,100}\b(button|link|url|billing|balance|dashboard link|label|icon)\b/,
    /\b(button|link|url|billing|balance|dashboard link|label|icon)\b[\s\S]{0,100}\b(to|for|that links|pointing)\b/,
  ];

  if (lightweightUiSignals.some((pattern) => pattern.test(lower))) {
    return {
      id: "gpt-5.6-luna",
      label: "Luna",
      reason: "Small, bounded UI or link change",
    };
  }

  const terraSignals = [
    /\b(create|build|add|implement|develop|make)\b[\s\S]{0,140}\b(page|screen|feature|workflow|integration|module|component|dashboard|form|api|endpoint|automation|sidebar|navigation|nav|header|footer|layout|ui|interface|section|menu)\b/,
    /\b(redo|redesign|rework|rebuild|rewrite|refactor|overhaul|revamp)\b[\s\S]{0,140}\b(page|screen|feature|workflow|integration|module|component|dashboard|form|sidebar|navigation|nav|header|footer|layout|ui|interface|section|menu)\b/,
    /\b(page|screen|feature|workflow|integration|module|component|dashboard|form|sidebar|navigation|nav|header|footer|layout|ui|interface|section|menu)\b[\s\S]{0,100}\b(redo|redesign|rework|rebuild|rewrite|refactor|overhaul|revamp)\b/,
    /\b(new page|new feature|new integration|multi-file|multiple files|connect .* api|integrate .* with)\b/,
    /\b(fix|debug|troubleshoot|investigate)\b[\s\S]{0,120}\b(bug|issue|error|integration|build|deploy|sync|code)\b/,
    /\b(update|change|modify)\b[\s\S]{0,120}\b(component|page|screen|workflow|integration|backend|database|api|sidebar|navigation|nav|header|footer|layout|ui|section|menu)\b/,
  ];

  if (solSignals.some((pattern) => pattern.test(lower))) {
    return {
      id: "gpt-5.6-sol",
      label: "Sol",
      reason: "Whole-project, architectural, or migration-level work",
    };
  }

  const terraMatches = terraSignals.filter((pattern) => pattern.test(lower)).length;
  const complexityWords = (
    lower.match(
      /\b(repo|repository|backend|database|api|integration|deploy|migration|refactor|workflow|multiple|several|redesign|rebuild|overhaul|sidebar|navigation|layout|component)\b/g
    ) || []
  ).length;

  if (terraMatches > 0 || complexityWords >= 3 || text.length > 900) {
    return {
      id: "gpt-5.6-terra",
      label: "Terra",
      reason: "Implementation, redesign, or multi-step build work",
    };
  }

  return {
    id: "gpt-5.6-luna",
    label: "Luna",
    reason: "Lookup, question, or lightweight task",
  };
}

function loadSelectedModel() {
  const saved = window.localStorage.getItem("viking-aries:selected-model");
  const routingVersion = window.localStorage.getItem("viking-aries:model-routing-version");

  // The previous picker remembered a concrete model, which could make a simple
  // question unexpectedly use Terra or Sol. Start the new request router in Auto
  // mode once, while still preserving any explicit choice made afterward.
  if (routingVersion !== "2") {
    window.localStorage.setItem("viking-aries:model-routing-version", "2");
    return VA_AUTO_MODEL;
  }

  return VA_MODEL_OPTIONS.some((item) => item.id === saved) ? saved : VA_AUTO_MODEL;
}

function loadProjectDraft(projectId) {
  try {
    return window.localStorage.getItem(`viking-aries-draft:${projectId}`) || "";
  } catch {
    return "";
  }
}

function formatAttachmentSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function imageCanvasDataUrl(image, maxDimension, quality) {
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not prepare that image.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

function compactImageDataUrl(image, {
  maxDimension,
  maxLength,
  startQuality = 0.82,
  minQuality = 0.42,
}) {
  let dimension = maxDimension;
  while (dimension >= 320) {
    for (let quality = startQuality; quality >= minQuality; quality -= 0.10) {
      const dataUrl = imageCanvasDataUrl(image, dimension, quality);
      if (dataUrl.length <= maxLength) return dataUrl;
    }
    dimension = Math.floor(dimension * 0.82);
  }

  // Last-resort compact screenshot. This should still be large enough for UI
  // screenshots while keeping the queued job payload comfortably bounded.
  const fallback = imageCanvasDataUrl(image, 320, 0.38);
  if (fallback.length <= maxLength) return fallback;
  throw new Error("That image could not be compressed enough to attach.");
}

function prepareImageAttachment(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        // The request copy needs enough resolution for UI screenshots and text,
        // but must stay small enough to travel with chat history.
        const thumbnailDataUrl = compactImageDataUrl(image, {
          maxDimension: 960,
          maxLength: 180000,
          startQuality: 0.78,
          minQuality: 0.42,
        });

        // Store a larger compressed viewer copy instead of the original multi-MB
        // clipboard image. This prevents browser localStorage from being exhausted.
        const fullDataUrl = compactImageDataUrl(image, {
          maxDimension: 1600,
          maxLength: 650000,
          startQuality: 0.84,
          minQuality: 0.48,
        });

        resolve({ thumbnailDataUrl, fullDataUrl });
      } catch (error) {
        reject(error);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("That image could not be read."));
    };

    image.src = objectUrl;
  });
}

function readTextAttachment(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").slice(0, 12000));
    reader.onerror = () => reject(new Error("That file could not be read."));
    reader.readAsText(file);
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("That file could not be read."));
    reader.readAsDataURL(file);
  });
}

function ChatWorkspace({ project, active = true }) {
  const [threads, setThreads] = useState(() => loadProjectThreads(project.id));
  const [activeThreadId, setActiveThreadId] = useState(() => {
    const availableThreads = loadProjectThreads(project.id);
    const savedThreadId = window.localStorage.getItem(`viking-aries:active-chat:${project.id}`);
    return availableThreads.some((thread) => thread.id === savedThreadId)
      ? savedThreadId
      : availableThreads[0]?.id || "";
  });
  const [draft, setDraft] = useState(() => loadProjectDraft(project.id));
  const [attachments, setAttachments] = useState([]);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [listening, setListening] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [fullSizeImage, setFullSizeImage] = useState("");
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [statusText, setStatusText] = useState("Ready");
  const [selectedModel, setSelectedModel] = useState(loadSelectedModel);
  const modelRecommendation = useMemo(
    () => recommendModelForTask(draft),
    [draft]
  );
  const scrollRef = useRef(null);
  const conversationRef = useRef(null);
  const autoFollowRef = useRef(true);
  const textareaRef = useRef(null);
  const attachmentMenuRef = useRef(null);
  const photoInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const recognitionSessionRef = useRef(0);
  const submitGuardRef = useRef(false);

  const activeThread = threads.find((thread) => thread.id === activeThreadId) || threads[0];
  const projectIntegrationMappings = loadProjectIntegrationMappings(project);
  const projectDeploymentUrl =
    projectIntegrationMappings.cloudflare?.deploymentUrl ||
    project.deploymentUrl ||
    "";

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
    autoFollowRef.current = true;
    node.scrollTo({ top: node.scrollHeight, behavior });
    setShowJumpToBottom(false);
  };

  const handleChatScroll = () => {
    const node = scrollRef.current;
    if (!node) return;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    const nearBottom = distanceFromBottom <= 140;
    autoFollowRef.current = nearBottom;
    setShowJumpToBottom(!nearBottom);
  };

  // Changing projects/chats starts at the latest activity.
  useEffect(() => {
    if (!active) return;
    autoFollowRef.current = true;
    const frame = window.requestAnimationFrame(() => scrollToChatBottom("auto"));
    const timer = window.setTimeout(() => scrollToChatBottom("auto"), 80);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [project.id, activeThreadId, active]);

  // New messages keep following only if the owner has not manually scrolled up.
  useEffect(() => {
    if (!active || !autoFollowRef.current) return;
    const frame = window.requestAnimationFrame(() => scrollToChatBottom("auto"));
    const timer = window.setTimeout(() => {
      if (autoFollowRef.current) scrollToChatBottom("auto");
    }, 80);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [activeThread?.messages?.length, sending, active]);

  // The live activity feed grows inside an existing message, so message count does
  // not change. Observe the conversation height and keep the newest activity row
  // visible while follow mode is active.
  useEffect(() => {
    if (!active || typeof ResizeObserver === "undefined") return undefined;
    const conversation = conversationRef.current;
    if (!conversation) return undefined;

    let frame = null;
    const observer = new ResizeObserver(() => {
      if (!autoFollowRef.current) return;
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (autoFollowRef.current) scrollToChatBottom("auto");
      });
    });

    observer.observe(conversation);
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [project.id, activeThreadId, active]);

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

  const reconcileThreadJobs = (messages, jobs) => {
    const next = [...messages];
    const sortedJobs = [...jobs].sort(
      (left, right) => Number(left.createdAt || 0) - Number(right.createdAt || 0)
    );

    for (const job of sortedJobs) {
      let userIndex = next.findIndex(
        (message) =>
          message.role === "user" &&
          (message.jobId === job.jobId ||
            (job.userMessageId && message.id === job.userMessageId))
      );

      if (userIndex < 0 && job.userMessageContent) {
        next.push({
          id: job.userMessageId || `user-${job.jobId}`,
          jobId: job.jobId,
          model: job.model || null,
          role: "user",
          content: job.userMessageContent,
          timestamp: formatChatTimestamp(job.createdAt),
          queueStatus: job.status,
          progress: Array.isArray(job.progress) ? job.progress : [],
        });
        userIndex = next.length - 1;
      } else if (userIndex >= 0) {
        next[userIndex] = {
          ...next[userIndex],
          jobId: job.jobId,
          model: job.model || next[userIndex].model || null,
          queueStatus: job.status,
          progress: Array.isArray(job.progress)
            ? job.progress
            : next[userIndex].progress || [],
        };
      }

      const assistantId = `assistant-${job.jobId}`;
      for (let index = next.length - 1; index >= 0; index -= 1) {
        const message = next[index];
        if (
          message.role === "assistant" &&
          (message.jobId === job.jobId || message.id === assistantId)
        ) {
          next.splice(index, 1);
        }
      }

      if ((job.status === "completed" || job.status === "failed" || job.status === "canceled") && userIndex >= 0) {
        userIndex = next.findIndex(
          (message) =>
            message.role === "user" &&
            (message.jobId === job.jobId ||
              (job.userMessageId && message.id === job.userMessageId))
        );
        const content =
          job.status === "canceled"
            ? "Stopped by the owner."
            : job.status === "failed"
              ? `I couldn’t complete that request. ${job.error || "The background job failed."}`
              : job.resultText || "The background job completed without response text.";

        next.splice(userIndex + 1, 0, {
          id: assistantId,
          jobId: job.jobId,
          role: "assistant",
          content,
          timestamp: formatChatTimestamp(job.completedAt || job.updatedAt),
          error: job.status === "failed",
        });
      }
    }

    return next;
  };

  const syncProjectJobs = async () => {
    try {
      const response = await fetch(
        `/api/jobs?projectId=${encodeURIComponent(project.id)}`,
        { cache: "no-store" }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Could not load background jobs.");
      }

      const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
      setThreads((current) =>
        current.map((thread) => ({
          ...thread,
          messages: reconcileThreadJobs(
            thread.messages,
            jobs.filter((job) => job.threadId === thread.id)
          ),
        }))
      );

      const activeJobs = jobs.filter((job) => job.threadId === activeThreadId);
      const running = activeJobs.filter((job) => job.status === "running");
      const queued = activeJobs.filter((job) => job.status === "queued");
      const hasPending = running.length > 0 || queued.length > 0;
      setSending(hasPending);

      if (running.length) {
        setStatusText(
          queued.length
            ? `Viking Aries is working · ${queued.length} queued`
            : "Viking Aries is working in the background…"
        );
      } else if (queued.length) {
        setStatusText(`${queued.length} message${queued.length === 1 ? "" : "s"} queued`);
      } else if (!listening && !queueing) {
        setStatusText("Ready");
      }
    } catch (error) {
      setStatusText(error.message || "Background job sync needs attention");
    }
  };

  useEffect(() => {
    syncProjectJobs();
    const timer = window.setInterval(() => {
      if (active || sending) syncProjectJobs();
    }, 1800);
    return () => window.clearInterval(timer);
  }, [project.id, activeThreadId, active, sending]);

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

  const closeChat = (threadId) => {
    const closingIndex = threads.findIndex((thread) => thread.id === threadId);
    if (closingIndex < 0) return;

    const remaining = threads.filter((thread) => thread.id !== threadId);
    const nextThreads = remaining.length
      ? remaining
      : [{ id: `chat-${Date.now()}`, title: "New Chat", messages: [] }];

    setThreads(nextThreads);

    if (activeThreadId === threadId || !nextThreads.some((thread) => thread.id === activeThreadId)) {
      const nextIndex = Math.min(closingIndex, Math.max(0, nextThreads.length - 1));
      const nextThread = nextThreads[nextIndex] || nextThreads[0];
      setActiveThreadId(nextThread.id);
      setDraft("");
      setAttachment(null);
      try {
        window.localStorage.removeItem(`viking-aries-draft:${project.id}`);
      } catch {
        // Ignore browser storage failures.
      }
    }

    setStatusText(remaining.length ? "Chat closed" : "New chat");
  };

  const sendMessage = async () => {
    const typedContent = draft.trim();
    const attachmentMarkers = attachments.map(
      (item) => `[VA_FILE:${encodeURIComponent(item.name || "Attachment")}|${item.type || "application/octet-stream"}]`
    );
    const content = [typedContent, ...attachmentMarkers].filter(Boolean).join("\n\n");

    if ((!typedContent && !attachments.length) || submitGuardRef.current) return;
    if (!activeThread) {
      const id = `chat-${Date.now()}`;
      setThreads([{ id, title: "New Chat", messages: [] }]);
      setActiveThreadId(id);
      setStatusText("New chat ready — press Send again");
      return;
    }

    submitGuardRef.current = true;
    autoFollowRef.current = true;
    setQueueing(true);

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

    const jobId = crypto.randomUUID();
    const threadId = activeThread.id;
    const requestModel =
      selectedModel === VA_AUTO_MODEL
        ? modelRecommendation?.id || "gpt-5.6-luna"
        : selectedModel;
    const userMessage = {
      id: `user-${jobId}`,
      jobId,
      model: requestModel,
      role: "user",
      content,
      attachmentMeta: attachment
        ? {
            kind: attachment.kind || "file",
            name: attachment.name || "Attachment",
            type: attachment.type || "application/octet-stream",
          }
        : null,
      fullSizeImage: attachment?.kind === "image" ? attachment?.fullDataUrl || "" : "",
      timestamp: formatChatTime(),
      queueStatus: "queued",
    };

    const requestMessages = [...activeThread.messages, userMessage]
      .filter(
        (message) =>
          (message.role === "user" || message.role === "assistant") &&
          typeof message.content === "string"
      )
      .map(({ id, jobId: messageJobId, role, content: text }) => ({
        id,
        jobId: messageJobId,
        role,
        content: sanitizeLegacyAttachmentContent(text),
      }));

    if (attachment?.dataUrl && requestMessages.length) {
      requestMessages[requestMessages.length - 1].attachment = {
        kind: attachment.kind || "file",
        name: attachment.name || "Attachment",
        type: attachment.type || "application/octet-stream",
        dataUrl: attachment.dataUrl,
      };
    }

    const integrationMappings = loadProjectIntegrationMappings(project);
    const alreadyWorking = sending;

    updateThread(threadId, (thread) => ({
      ...thread,
      title:
        thread.title === "New Chat"
          ? typedContent
            ? typedContent.length > 28
              ? `${typedContent.slice(0, 28)}…`
              : typedContent
            : attachments[0]?.name || "Attachment"
          : thread.title,
      messages: [...thread.messages, userMessage],
    }));

    setDraft("");
    setAttachment(null);
    try {
      window.localStorage.removeItem(`viking-aries-draft:${project.id}`);
    } catch {
      // Ignore browser storage failures.
    }

    setSending(true);
    setStatusText(alreadyWorking ? "Message queued…" : "Viking Aries is starting…");

    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
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
          // Auto mode chooses the least expensive model that satisfies the
          // request. A manual Luna/Terra/Sol/Astra selection remains available when
          // the owner explicitly wants to override the router.
          model: requestModel,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Could not queue the AI job.");
      }

      setStatusText(alreadyWorking ? "Message queued…" : "Viking Aries is working in the background…");
      window.setTimeout(syncProjectJobs, 250);
    } catch (error) {
      updateThread(threadId, (thread) => ({
        ...thread,
        messages: thread.messages.map((message) =>
          message.jobId === jobId
            ? { ...message, queueStatus: "failed" }
            : message
        ),
      }));

      const errorMessage = {
        id: `error-${jobId}`,
        jobId,
        role: "assistant",
        content: `I couldn’t queue that request. ${error.message}`,
        timestamp: formatChatTime(),
        error: true,
      };
      updateThread(threadId, (thread) => ({
        ...thread,
        messages: [...thread.messages, errorMessage],
      }));
      setStatusText("Queue needs attention");
      window.setTimeout(syncProjectJobs, 250);
    } finally {
      submitGuardRef.current = false;
      setQueueing(false);
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    }
  };

  const stopAiJobs = async () => {
    if (!activeThread || !sending) return;

    setStatusText("Stopping Viking Aries…");
    try {
      const response = await fetch("/api/jobs/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          threadId: activeThread.id,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Could not stop the AI job.");
      }
      await syncProjectJobs();
      setStatusText(payload.canceled ? "Stopped" : "No active AI job to stop");
    } catch (error) {
      setStatusText(error.message || "Could not stop the AI job");
      await syncProjectJobs();
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

  useEffect(() => {
    const closeAttachmentMenu = (event) => {
      if (!attachmentMenuRef.current?.contains(event.target)) setAttachmentMenuOpen(false);
    };
    document.addEventListener("mousedown", closeAttachmentMenu);
    return () => document.removeEventListener("mousedown", closeAttachmentMenu);
  }, []);

  const openAttachmentPicker = (inputRef, event) => {
    // Keep the document-level outside-click handler from closing the menu before
    // the browser receives the synthetic file-input click, especially on touch
    // browsers where pointer and mouse events are both dispatched.
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setAttachmentMenuOpen(false);
    // Keep this synchronous so iOS/Safari preserves the user gesture needed to
    // open the native file chooser.
    inputRef.current?.click();
  };

  const handleSelectedAttachment = async (file) => {
    if (!file) return;
    const maxAttachmentBytes = 8 * 1024 * 1024;
    if (file.size > maxAttachmentBytes) {
      setStatusText("Attachments are limited to 8 MB");
      return;
    }
    setAttachmentMenuOpen(false);
    setStatusText(`Preparing ${file.name}…`);
    try {
      if (file.type.startsWith("image/")) {
        const imageData = await prepareImageAttachment(file);
        setAttachment({
          kind: "image",
          thumbnailDataUrl: imageData.thumbnailDataUrl,
          fullDataUrl: imageData.fullDataUrl,
          dataUrl: imageData.fullDataUrl,
          name: file.name || "Photo",
          type: file.type || "image/jpeg",
        });
      } else if (file.type === "application/pdf" || file.name?.toLowerCase().endsWith(".pdf")) {
        const dataUrl = await readFileAsDataUrl(file);
        setAttachment({
          kind: "pdf",
          name: file.name,
          type: "application/pdf",
          dataUrl,
        });
      } else {
        const dataUrl = await readFileAsDataUrl(file);
        setAttachment({
          kind: "file",
          name: file.name,
          type: file.type || "application/octet-stream",
          dataUrl,
        });
      }
      setStatusText("Attachment ready");
    } catch (error) {
      setStatusText(error.message || "Could not attach that file");
    }
  };

  const handleComposerPaste = async (event) => {
    const imageItem = Array.from(event.clipboardData?.items || []).find((item) =>
      item.type.startsWith("image/")
    );
    if (!imageItem) return;

    event.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) {
      setStatusText("That pasted image could not be read");
      return;
    }

    setStatusText("Preparing pasted image…");
    try {
      const imageData = await prepareImageAttachment(file);
      setAttachment({
        kind: "image",
        thumbnailDataUrl: imageData.thumbnailDataUrl,
        fullDataUrl: imageData.fullDataUrl,
        dataUrl: imageData.fullDataUrl,
        name: file.name || "Pasted image",
        type: file.type || "image/jpeg",
      });
      setStatusText("Image attached");
    } catch (error) {
      setStatusText(error.message || "Could not attach image");
    }
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
          {projectDeploymentUrl ? (
            <a
              className="project-deployment-link"
              href={projectDeploymentUrl}
              target="_blank"
              rel="noreferrer"
              title={`Open deployment: ${projectDeploymentUrl}`}
            >
              <Globe2 size={13} />
              <span>{projectDeploymentUrl}</span>
            </a>
          ) : (
            <span
              className="project-deployment-link project-deployment-link-empty"
              title="No deployment URL is registered for this project yet"
            >
              <Globe2 size={13} />
              <span>Deployment URL not set</span>
            </span>
          )}
          <span className="chat-connection-status">{statusText}</span>
        </div>
      </div>

      <div className="chat-tab-row">
        {threads.map((thread) => (
          <div
            key={thread.id}
            className={activeThreadId === thread.id ? "chat-tab active" : "chat-tab"}
            title={thread.title}
          >
            <button
              type="button"
              className="chat-tab-main"
              onClick={() => {
                setActiveThreadId(thread.id);
                setStatusText("Ready");
              }}
              title={thread.title}
            >
              {thread.title}
            </button>
            <button
              type="button"
              className="chat-tab-close"
              onClick={() => closeChat(thread.id)}
              title={`Close ${thread.title}`}
              aria-label={`Close ${thread.title}`}
            >
              <X size={13} />
            </button>
          </div>
        ))}
        <button className="chat-tab new-chat" type="button" onClick={createNewChat}>
          <span>+</span> New Chat
        </button>
      </div>

      <div className="workspace-scroll" ref={scrollRef} onScroll={handleChatScroll}>
        <section className="conversation live-conversation" ref={conversationRef}>
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
                  {message.model && (
                    <span className="message-model-badge" title="Model used for this request">
                      {VA_MODEL_BY_ID[message.model]?.label || message.model}
                    </span>
                  )}
                  {message.role === "user" &&
                    (message.queueStatus === "queued" ||
                      message.queueStatus === "running" ||
                      message.queueStatus === "failed") && (
                      <span className={`message-queue-status ${message.queueStatus}`}>
                        {message.queueStatus === "queued"
                          ? "Queued"
                          : message.queueStatus === "running"
                            ? "Working"
                            : "Failed"}
                      </span>
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
                  {renderChatContent(message.content, setFullSizeImage, message.fullSizeImage)}
                </div>
                <ChatAttachmentCard message={message} onImageOpen={setFullSizeImage} />

                {message.role === "user" &&
                  Array.isArray(message.progress) &&
                  message.progress.length > 0 && (
                    <div className="job-activity-feed" aria-label="Viking Aries activity">
                      <div className="job-activity-heading">
                        <Activity size={14} />
                        <strong>Activity</strong>
                        {message.queueStatus === "running" && <span>Live</span>}
                      </div>
                      <div className="job-activity-list">
                        {message.progress.slice(-20).map((event) => (
                          <div
                            className={`job-activity-row ${event.status || "done"}`}
                            key={event.id || `${event.at}-${event.label}`}
                          >
                            <span className="job-activity-icon">
                              {event.status === "running" ? (
                                <RefreshCw size={12} className="job-activity-spin" />
                              ) : event.status === "failed" ? (
                                <X size={12} />
                              ) : (
                                <Check size={12} />
                              )}
                            </span>
                            <span className="job-activity-copy">
                              <strong>{event.label || "Working"}</strong>
                              {event.detail && <small>{event.detail}</small>}
                            </span>
                            <time>{formatChatTimestamp(event.completedAt || event.at)}</time>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                {message.role === "assistant" && (
                  <div className="message-actions">
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
                  </div>
                )}
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

      {fullSizeImage && (
        <div
          className="image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Full-size pasted image"
          onClick={() => setFullSizeImage("")}
        >
          <button
            type="button"
            className="image-lightbox-close"
            onClick={() => setFullSizeImage("")}
            aria-label="Close full-size image"
            title="Close"
          >
            <X size={20} />
          </button>
          <img
            src={fullSizeImage}
            alt="Pasted image full size"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          sendMessage();
        }}
      >
        <div className="attachment-picker" ref={attachmentMenuRef}>
          <button
            className={attachmentMenuOpen ? "attach-button active" : "attach-button"}
            type="button"
            title="Add files or photos"
            aria-label="Add files or photos"
            aria-expanded={attachmentMenuOpen}
            onClick={() => setAttachmentMenuOpen((value) => !value)}
          >
            <Paperclip size={18} />
          </button>
          {attachmentMenuOpen && (
            <div className="attachment-menu" role="menu">
              <button type="button" role="menuitem" onClick={(event) => openAttachmentPicker(photoInputRef, event)}>
                <FileImage size={17} />
                <span><strong>Photos</strong><small>Choose images from your device</small></span>
              </button>
              <button type="button" role="menuitem" onClick={(event) => openAttachmentPicker(fileInputRef, event)}>
                <FileText size={17} />
                <span><strong>Files</strong><small>Choose a document or text file</small></span>
              </button>
            </div>
          )}
          <input ref={photoInputRef} type="file" accept="image/*" hidden onChange={(event) => {
            handleSelectedAttachment(event.target.files?.[0]);
            event.target.value = "";
          }} />
          <input ref={fileInputRef} type="file" accept=".txt,.md,.json,.csv,.xml,.html,.css,.js,.jsx,.ts,.tsx,.yaml,.yml,.log,.pdf,.doc,.docx,application/pdf,text/*" hidden onChange={(event) => {
            handleSelectedAttachment(event.target.files?.[0]);
            event.target.value = "";
          }} />
        </div>
        <button
          className={listening ? "voice-button active" : "voice-button"}
          type="button"
          title={listening ? "Stop voice input" : "Start voice input"}
          aria-label={listening ? "Stop voice input" : "Start voice input"}
          aria-pressed={listening}
          onClick={toggleVoiceInput}
        >
          <Mic size={18} />
        </button>
        <div className="composer-input-wrap">
          {attachment && (
            <div className="composer-image-thumbnail">
              {attachment.thumbnailDataUrl ? (
                <img src={attachment.thumbnailDataUrl} alt="Attached photo thumbnail" />
              ) : (
                <FileText size={20} />
              )}
              <span>{attachment.name || "Attachment ready"}</span>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                title="Remove attachment"
                aria-label="Remove attachment"
              >
                <X size={14} />
              </button>
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            onPaste={handleComposerPaste}
            placeholder="Tell Viking Aries what to build, fix, connect, or deploy..."
            rows={1}
          />
        </div>
        <button className="send-button" type="submit" disabled={queueing || (!draft.trim() && !attachment)}>
          <Send size={17} /> {queueing ? "Queuing…" : "Send"}
        </button>
        <button
          className="stop-button"
          type="button"
          onClick={stopAiJobs}
          disabled={!sending || queueing}
          title="Stop Viking Aries from continuing"
          aria-label="Stop Viking Aries from continuing"
        >
          <Square size={15} fill="currentColor" />
        </button>
        <label className="model-picker">
          <span>Model</span>
          <select
            value={selectedModel}
            onChange={(event) => setSelectedModel(event.target.value)}
            title="Choose the AI model for the next message"
          >
            {VA_MODEL_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label} — {option.note}
              </option>
            ))}
          </select>
        </label>

        {modelRecommendation && modelRecommendation.id !== selectedModel && (
          <div className="model-recommendation" role="status">
            <span>
              Recommended: <strong>{modelRecommendation.label}</strong>
              <small>{modelRecommendation.reason}</small>
            </span>
            <button
              type="button"
              onClick={() => setSelectedModel(modelRecommendation.id)}
              title={`Use ${modelRecommendation.label} for this request`}
            >
              Use {modelRecommendation.label}
            </button>
          </div>
        )}

        {modelRecommendation && modelRecommendation.id === selectedModel && (
          <div className="model-recommendation model-recommendation-match" role="status">
            <span>
              <strong>{VA_MODEL_BY_ID[selectedModel]?.label || modelRecommendation.label}</strong> looks right for this request
              <small>{modelRecommendation.reason}</small>
            </span>
          </div>
        )}

        <span className="composer-hint">Enter to send · Shift + Enter for new line</span>
      </form>
    </main>
  );
}

function PreviewDashboard({ project, selfPreview = false }) {
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
          <h2>{selfPreview ? "Viking Aries is already open" : "No live preview connected yet"}</h2>
          <p>
            {selfPreview
              ? "Self-preview is disabled to prevent Viking Aries from recursively loading another Viking Aries preview inside itself."
              : "Add this project's production, staging, or preview URL in Settings or Deployments. Viking Aries will load the actual app here when a URL is available."}
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
  const [refreshKey, setRefreshKey] = useState(0);
  const widths = { Desktop: "100%", Mobile: "390px" };
  const selfPreview = useMemo(() => {
    if (!project?.deploymentUrl) return false;
    if (project.id === "viking-aries") return true;
    try {
      return new URL(project.deploymentUrl, window.location.href).origin === window.location.origin;
    } catch {
      return false;
    }
  }, [project?.id, project?.deploymentUrl]);
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
              <button
                type="button"
                title="Refresh preview"
                aria-label="Refresh preview"
                onClick={() => setRefreshKey((value) => value + 1)}
              >
                <RefreshCw size={17} />
              </button>
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
            {project?.deploymentUrl && !selfPreview ? (
              <iframe
                key={`${project.deploymentUrl}-${refreshKey}`}
                src={project.deploymentUrl}
                title={`${project.name} live preview`}
                style={{ width: "100%", height: "100%", minHeight: "720px", border: 0, background: "#fff" }}
              />
            ) : (
              <PreviewDashboard project={project} selfPreview={selfPreview} />
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

function VikingAriesApp({ onLogout, authConfigured }) {
  const [workspace, setWorkspace] = useState(() => {
    const saved =
      window.localStorage.getItem("va-local:active-workspace") ||
      window.localStorage.getItem("viking-aries:active-workspace");
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
    const savedWorkspace =
      window.localStorage.getItem("va-local:active-workspace") ||
      window.localStorage.getItem("viking-aries:active-workspace");
    const savedProjectId =
      window.localStorage.getItem("va-local:active-project") ||
      window.localStorage.getItem("viking-aries:active-project");

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
  const [theme, setTheme] = useState(() => window.localStorage.getItem("va-local:theme") || "classic");
  const [previewMode, setPreviewMode] = useState("Desktop");
  const [previewVisible, setPreviewVisible] = useState(() => {
    // Keep this browser preference outside the shared "viking-aries" namespace.
    // Ignore the legacy shared key, which could restore another session's hidden state.
    const saved = window.localStorage.getItem("va-local:preview-visible");
    return saved === null ? true : saved === "true";
  });
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(() => {
    const saved = Number(window.localStorage.getItem("viking-aries-preview-width"));
    return Number.isFinite(saved) && saved >= 26 && saved <= 65 ? saved : 36;
  });
  const [resizingPreview, setResizingPreview] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileUi, setMobileUi] = useState(() => {
    if (typeof window === "undefined") return false;
    const embeddedPreview = window.self !== window.top;
    const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
    const narrowVisualViewport = (window.visualViewport?.width || window.innerWidth) <= 900;
    const coarsePointer = window.matchMedia?.("(hover: none) and (pointer: coarse)")?.matches;
    return !embeddedPreview && (narrowVisualViewport || coarsePointer || mobileUserAgent);
  });

  useEffect(() => {
    const widthQuery = window.matchMedia("(max-width: 900px)");
    const touchQuery = window.matchMedia("(hover: none) and (pointer: coarse)");
    const embeddedPreview = window.self !== window.top;

    const updateMobileUi = () => {
      // Detect the actual top-level phone independently of the CSS viewport.
      // Some Android browser/PWA states report a desktop-like layout viewport,
      // which previously left VA in the compact desktop typography even though
      // the mobile shell was visible.
      const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
      const narrowVisualViewport = (window.visualViewport?.width || window.innerWidth) <= 900;
      const nextMobileUi =
        !embeddedPreview &&
        (widthQuery.matches || narrowVisualViewport || touchQuery.matches || mobileUserAgent);

      setMobileUi(nextMobileUi);
      document.documentElement.classList.toggle("va-mobile-device", nextMobileUi);

      if (nextMobileUi) {
        setPreviewExpanded(false);
        setMobileSidebarOpen(false);
      }
    };

    updateMobileUi();
    widthQuery.addEventListener?.("change", updateMobileUi);
    touchQuery.addEventListener?.("change", updateMobileUi);
    window.visualViewport?.addEventListener?.("resize", updateMobileUi);
    window.addEventListener("orientationchange", updateMobileUi);
    return () => {
      widthQuery.removeEventListener?.("change", updateMobileUi);
      touchQuery.removeEventListener?.("change", updateMobileUi);
      window.visualViewport?.removeEventListener?.("resize", updateMobileUi);
      window.removeEventListener("orientationchange", updateMobileUi);
      document.documentElement.classList.remove("va-mobile-device");
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem("viking-aries:personal-projects", JSON.stringify(personalProjectsState));
  }, [personalProjectsState]);

  useEffect(() => {
    window.localStorage.setItem("viking-aries:contractors", JSON.stringify(contractorsState));
  }, [contractorsState]);

  useEffect(() => {
    window.localStorage.setItem("va-local:preview-visible", String(previewVisible));
  }, [previewVisible]);

  useEffect(() => {
    window.localStorage.setItem("va-local:theme", theme);
    document.documentElement.dataset.vaTheme = theme;
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem("va-local:active-workspace", workspace);
  }, [workspace]);

  useEffect(() => {
    if (project?.id) {
      window.localStorage.setItem("va-local:active-project", project.id);
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
    setActiveView("AI Builder");
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

  const themeView = activeView === "Theme";

  return (
    <div data-theme={theme} className={`${layoutClass}${mobileSidebarOpen ? " mobile-sidebar-open" : ""}${mobileUi ? " mobile-ui" : ""}`}>
      <Sidebar
        project={project}
        workspace={workspace}
        onWorkspaceChange={changeWorkspace}
        onProjectChange={(nextProject) => {
          setProject(nextProject);
          setActiveView("AI Builder");
          setMobileSidebarOpen(false);
        }}
        activeView={activeView}
        onViewChange={(nextView) => {
          setActiveView(nextView);
          setMobileSidebarOpen(false);
        }}
        personalProjectsState={personalProjectsState}
        onAddPersonalProject={addPersonalProject}
        contractorsState={contractorsState}
        onAddContractor={addContractor}
        onAddContractorProject={addContractorProject}
        onLogout={onLogout}
        authConfigured={authConfigured}
        theme={theme}
      />

      {mobileSidebarOpen && (
        <button
          type="button"
          className="mobile-sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <div className="main-column">
        {!previewVisible && !previewExpanded && (
          <button
            type="button"
            className="desktop-preview-restore"
            onClick={() => setPreviewVisible(true)}
            title="Show preview"
            aria-label="Show preview"
          >
            <Monitor size={16} />
            <span>Show Preview</span>
          </button>
        )}

        <header className="mobile-topbar">
          <button
            type="button"
            className="mobile-icon-button"
            aria-label="Open navigation"
            title="Projects and tools"
            onClick={() => setMobileSidebarOpen(true)}
          >
            <Menu size={21} />
          </button>

          <div className="mobile-current-project">
            <strong>{project.name}</strong>
            <small>{previewExpanded ? "Preview" : activeView}</small>
          </div>

          <div className="mobile-topbar-actions">
            <button
              type="button"
              className={previewExpanded ? "mobile-view-button active" : "mobile-view-button"}
              onClick={() => {
                if (previewExpanded) {
                  setPreviewExpanded(false);
                } else {
                  setPreviewVisible(true);
                  setPreviewExpanded(true);
                }
              }}
              title={previewExpanded ? "Back to workspace" : "Show preview"}
            >
              {previewExpanded ? <MessageSquare size={17} /> : <Monitor size={17} />}
              <span>{previewExpanded ? "Chat" : "Preview"}</span>
            </button>
          </div>
        </header>

        <div
          className={resizingPreview ? "content-shell is-resizing" : "content-shell"}
          style={{
            "--preview-width": `${previewWidth}%`,
            gridTemplateColumns:
              !previewVisible && !previewExpanded ? "minmax(0, 1fr)" : undefined,
          }}
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
              {themeView && (
                <main className="workspace theme-workspace">
                  <div className="theme-page">
                    <div className="theme-heading"><span className="theme-kicker">Appearance</span><h1>Color Schemes</h1><p>Change the look of Viking Aries without changing how it works.</p></div>
                    <div className="theme-grid">
                      <button type="button" className={theme === "classic" ? "theme-card selected" : "theme-card"} onClick={() => setTheme("classic")}>
                        <span className="theme-swatch classic-swatch"><i/><i/><i/><i/></span><span className="theme-card-copy"><strong>Aries Classic</strong><small>The original navy, blue and clean white Viking Aries interface.</small></span><span className="theme-check">{theme === "classic" ? "✓ Active" : "Use theme"}</span>
                      </button>
                      <button type="button" className={theme === "metal" ? "theme-card selected" : "theme-card"} onClick={() => setTheme("metal")}>
                        <span className="theme-swatch metal-swatch"><i/><i/><i/><i/></span><span className="theme-card-copy"><strong>Viking Aries Metal</strong><small>Black iron, burnished gold, bronze, brushed silver and dark leather.</small></span><span className="theme-check">{theme === "metal" ? "✓ Active" : "Use theme"}</span>
                      </button>
                    </div>
                    <div className="theme-note"><strong>Viking Aries Metal</strong><span>Metal and leather details are intentionally restrained so the builder stays readable and professional.</span></div>
                  </div>
                </main>
              )}
              {activeView !== "AI Builder" && !themeView && (
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
          {(previewVisible || previewExpanded) && (
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
          )}
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
      // A new login starts with the preview available, while ordinary browser
      // refreshes preserve the saved visibility preference.
      window.localStorage.setItem("va-local:preview-visible", "true");
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
  const [sharedStorageReady, setSharedStorageReady] = useState(false);

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

  useEffect(() => {
    let stopSync = null;
    let cancelled = false;

    if (authState.loading) return undefined;

    if (!authState.configured) {
      setSharedStorageReady(true);
      return undefined;
    }

    if (!authState.authenticated) {
      setSharedStorageReady(false);
      return undefined;
    }

    setSharedStorageReady(false);
    startSharedStorageSync()
      .then((stop) => {
        if (cancelled) {
          stop?.();
          return;
        }
        stopSync = stop;
        setSharedStorageReady(true);
      })
      .catch(() => {
        // If Convex sync is temporarily unavailable, do not lock Erik out of VA.
        // Local browser state remains usable and sync will retry next login/reload.
        if (!cancelled) setSharedStorageReady(true);
      });

    return () => {
      cancelled = true;
      stopSync?.();
    };
  }, [authState.loading, authState.configured, authState.authenticated]);

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

  if (authState.configured && authState.authenticated && !sharedStorageReady) {
    return (
      <main className="owner-login-screen">
        <section className="owner-login-card owner-login-loading">
          <div className="owner-login-shield"><Database size={30} /></div>
          <h2>Syncing Viking Aries workspace…</h2>
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
