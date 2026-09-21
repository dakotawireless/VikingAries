import { MIGRATED_PROJECTS, migrateProjectMappings } from "../shared/projects.js";
import { formatUsd, useApiUsage } from "./api-usage.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  CheckCircle2,
  ChartNoAxesCombined,
  Cloud,
  Code2,
  Database,
  Download,
  FileImage,
  FileText,
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
      const stored = saved ? JSON.parse(saved) : initialValue;
      return key === "integration-mappings-v1" ? migrateProjectMappings(projectId, stored) : stored;
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
  if (MIGRATED_PROJECTS[project?.id]) return migrateProjectMappings(project.id);
  return {
    github: {
      enabled: Boolean(project?.repository),
      repository: project?.repository || (project?.id === "viking-aries" ? "dakotawireless/VikingAries" : ""),
      branch: "main",
    },
    cloudflare: {
      enabled: Boolean(project?.deploymentUrl),
      project: "",
      worker:
        project?.cloudflareWorker ||
        (project?.id === "timekeeper"
          ? "timekeeper-app"
          : project?.id === "viking-aries"
            ? "vikingaries"
            : project?.id === "rez-lock"
              ? "rez-lock-and-key-staging"
              : ""),
      deploymentUrl: project?.deploymentUrl || "",
    },
    convex: {
      enabled: project?.backend === "Convex" || Boolean(project?.backendUrl),
      deployment:
        project?.id === "dw-pos"
          ? "sleek-bear-647"
          : project?.id === "timekeeper"
            ? "aware-caiman-251"
            : project?.id === "viking-aries"
              ? "flippant-mandrill-487"
              : "",
      url: project?.backendUrl || "",
      dashboardUrl: project?.convexDashboardUrl || "",
    },
    drive: {
      enabled: project?.id === "rez-lock",
      account: project?.id === "rez-lock" ? "rezridesllc@gmail.com" : "",
      folderUrl: "",
    },
    gmail: {
      enabled: project?.id === "timekeeper" || project?.id === "rez-lock",
      account: project?.id === "rez-lock" ? "rezridesllc@gmail.com" : "",
      identity: project?.id === "rez-lock" ? "rezridesllc@gmail.com" : "",
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

function vikingAriesDefaults(project) {
  return {
    features: [],
    access: [],
    files: [],
    integrations: [
      { id: "github", name: "GitHub", provider: "dakotawireless/VikingAries", purpose: "Source control", status: "Connected" },
      { id: "cloudflare", name: "Cloudflare", provider: "Worker: vikingaries", purpose: "Hosting / deployment", status: "Connected" },
      { id: "convex", name: "Convex", provider: "flippant-mandrill-487", purpose: "Database / backend", status: "Connected" },
      { id: "drive", name: "Google Drive", provider: "Not configured", purpose: "Files / documents", status: "Available" },
      { id: "gmail", name: "Gmail", provider: "Not configured", purpose: "Email", status: "Available" },
    ],
    tables: [
      { name: "apiUsage", purpose: "OpenAI request/token/cost telemetry", indexes: "by_createdAt, by_project_createdAt, by_model_createdAt" },
    ],
    backend: [],
    automations: [],
    diagnostics: [],
    versions: [],
    deployments: [
      { id: "prod", environment: "Production", provider: "Cloudflare Workers", status: "Active", url: "https://vikingaries.dakotawireless.net/" },
    ],
    domains: [
      { id: "prod-domain", host: "vikingaries.dakotawireless.net", type: "Cloudflare", status: "Active", notes: "Production domain" },
    ],
    secrets: [
      { id: "openai-api-key", name: "OPENAI_API_KEY", provider: "Cloudflare Secrets Store", purpose: "OpenAI Responses API", status: "Configured" },
      { id: "owner-access-code", name: "OWNER_ACCESS_CODE", provider: "Cloudflare Runtime Secret", purpose: "Owner login access code", status: "Configured" },
      { id: "owner-session-secret", name: "OWNER_SESSION_SECRET", provider: "Cloudflare Runtime Secret", purpose: "Signs owner session cookies", status: "Configured" },
      { id: "github-token", name: "GITHUB_TOKEN", provider: "Cloudflare Runtime Secret", purpose: "GitHub read/write integration", status: "Configured" },
      { id: "cloudflare-api-token", name: "CLOUDFLARE_API_TOKEN", provider: "Cloudflare Runtime Secret", purpose: "Cloudflare status, builds, and deployments", status: "Needs verification" },
      { id: "convex-personal-access-token", name: "CONVEX_PERSONAL_ACCESS_TOKEN", provider: "Cloudflare Runtime Secret", purpose: "Shared Convex management integration", status: "Configured" },
      { id: "convex-deploy-key", name: "CONVEX_DEPLOY_KEY", provider: "Cloudflare Build Secret", purpose: "Deploy Viking Aries Convex backend during Cloudflare build", status: "Needs configuration" },
      { id: "va-usage-ingest-secret-cloudflare", name: "VA_USAGE_INGEST_SECRET", provider: "Cloudflare Runtime Secret", purpose: "Authenticates Worker writes/reads to the Viking Aries usage store", status: "Needs configuration" },
      { id: "va-usage-ingest-secret-convex", name: "VA_USAGE_INGEST_SECRET", provider: "Convex Environment Variable", purpose: "Authenticates Viking Aries usage HTTP endpoints; must match Cloudflare value", status: "Needs configuration" },
    ],
    settings: {
      displayName: project.name,
      repository: project.repository || "dakotawireless/VikingAries",
      defaultBranch: "main",
      productionUrl: project.deploymentUrl || "https://vikingaries.dakotawireless.net/",
      backendProvider: "Convex",
      backendDeployment: "flippant-mandrill-487",
      backendUrl: "https://flippant-mandrill-487.convex.cloud",
      notes: "Viking Aries command center. Keep secret values in provider-managed secret stores; the Secrets tab tracks names, locations, purposes, and status only.",
    },
  };
}

function rezLockDefaults(project) {
  return {
    features: [
      { id: "public-site", name: "Public Rez Lock & Key website", area: "Website", status: "Active", notes: "Existing responsive customer-facing site; preserve design and behavior during VA migration." },
      { id: "estimate", name: "Online estimate request", area: "Website", status: "Active", notes: "Customer estimate form posts to /api/send-estimate." },
      { id: "contact", name: "Contact request", area: "Website", status: "Active", notes: "Customer contact form posts to /api/send-contact." },
      { id: "health", name: "Worker health endpoint", area: "Backend", status: "Active", notes: "/api/health reports lead-email and optional Twilio configuration status." },
    ],
    access: [
      { id: "public", role: "Public visitor", method: "No login", scope: "Public website and customer request forms", status: "Active" },
      { id: "owner", role: "Owner / developer", method: "Viking Aries shared provider connections", scope: "Source, deployment, and project maintenance", status: "Active" },
    ],
    files: [
      { id: "source", name: "Website source", type: "Repository", location: "dakotawireless/rez-lock-and-key-staging", status: "In repository" },
      { id: "assets", name: "Website assets", type: "Brand / site assets", location: "public/assets", status: "In repository" },
      { id: "worker", name: "Cloudflare Worker", type: "Backend source", location: "src/worker.js", status: "In repository" },
      { id: "config", name: "Cloudflare configuration", type: "Deployment config", location: "wrangler.jsonc", status: "In repository" },
    ],
    integrations: [
      { id: "github", name: "GitHub", provider: "dakotawireless/rez-lock-and-key-staging", purpose: "Source control", status: "Connected" },
      { id: "cloudflare", name: "Cloudflare", provider: "Worker: rez-lock-and-key-staging", purpose: "Hosting, builds, static assets, and /api/* runtime", status: "Connected" },
      { id: "google-script", name: "Google Apps Script", provider: "rezridesllc@gmail.com", purpose: "Existing estimate/contact lead email webhook referenced by RLK_EMAIL_WEBHOOK_URL", status: "Configured" },
      { id: "google-account", name: "Google Account", provider: "rezridesllc@gmail.com", purpose: "Project-specific Google identity for Rez Lock & Key", status: "Configured" },
      { id: "twilio", name: "Twilio", provider: "Cloudflare environment bindings", purpose: "Optional alert configuration detected by /api/health", status: "Existing / unknown" },
    ],
    tables: [],
    backend: [
      { name: "/api/health", type: "Cloudflare Worker route", responsibility: "Health/configuration status for lead email and optional Twilio bindings", status: "Active" },
      { name: "/api/send-estimate", type: "Cloudflare Worker route", responsibility: "Validate and forward estimate requests to the existing lead webhook", status: "Active" },
      { name: "/api/send-contact", type: "Cloudflare Worker route", responsibility: "Validate and forward contact requests to the existing lead webhook", status: "Active" },
      { name: "RLK_EMAIL_WEBHOOK_URL", type: "Cloudflare variable", responsibility: "Destination for the existing lead/email webhook", status: "Configured" },
    ],
    automations: [
      { id: "build-deploy", name: "Cloudflare Workers Build", trigger: "Commit to main", action: "Run npm run build and npm run deploy", enabled: true },
    ],
    diagnostics: [
      { id: "source-map", name: "GitHub project mapping", result: "Configured", detail: "VA project maps to dakotawireless/rez-lock-and-key-staging on main." },
      { id: "hosting-map", name: "Cloudflare Worker mapping", result: "Configured", detail: "VA project maps to Worker rez-lock-and-key-staging." },
      { id: "health-route", name: "Worker health route", result: "Configured", detail: "/api/health exists in src/worker.js." },
      { id: "lead-route", name: "Lead request routes", result: "Configured", detail: "/api/send-estimate and /api/send-contact forward to the existing lead webhook." },
    ],
    versions: [
      { id: "current-main", label: "Current imported project", ref: "main", note: "Existing RLK website imported into Viking Aries without redesign or behavior changes." },
    ],
    deployments: [
      { id: "staging", environment: "Current", provider: "Cloudflare Workers", status: "Active", url: "https://rez-lock-and-key-staging.erik-f2c.workers.dev" },
    ],
    domains: [
      { id: "worker", host: "rez-lock-and-key-staging.erik-f2c.workers.dev", type: "Cloudflare Workers", status: "Active", notes: "Current Worker deployment URL." },
    ],
    secrets: [
      { id: "webhook-secret", name: "RLK_WEBHOOK_SECRET", provider: "Cloudflare Worker secret", purpose: "Authenticates the existing lead/email webhook", status: "Existing / unknown" },
      { id: "twilio-sid", name: "TWILIO_ACCOUNT_SID", provider: "Cloudflare Worker environment", purpose: "Optional Twilio account configuration detected by the Worker", status: "Existing / unknown" },
      { id: "twilio-token", name: "TWILIO_AUTH_TOKEN", provider: "Cloudflare Worker secret", purpose: "Optional Twilio authentication detected by the Worker", status: "Existing / unknown" },
      { id: "twilio-from", name: "TWILIO_FROM_NUMBER", provider: "Cloudflare Worker environment", purpose: "Optional Twilio sender number detected by the Worker", status: "Existing / unknown" },
      { id: "alert-phone", name: "RLK_ALERT_PHONE", provider: "Cloudflare Worker environment", purpose: "Optional RLK alert destination detected by the Worker", status: "Existing / unknown" },
    ],
    settings: {
      displayName: project.name,
      repository: "dakotawireless/rez-lock-and-key-staging",
      defaultBranch: "main",
      productionUrl: "https://rez-lock-and-key-staging.erik-f2c.workers.dev",
      backendProvider: "Cloudflare Worker",
      backendDeployment: "rez-lock-and-key-staging",
      backendUrl: "https://rez-lock-and-key-staging.erik-f2c.workers.dev",
      notes: "Existing Rez Lock & Key website project. Preserve the current website design, content, estimator behavior, and deployment. Viking Aries is the editing/control workspace only. Do not rotate or replace provider-managed secrets merely because their values are unknown.",
    },
  };
}

function dwPosDefaults(project) {
  return {
    features: [
      { id: "sales", name: "POS Sales & Transactions", area: "Core", status: "Active", notes: "Current production sales, tenders, transaction history, returns, and receipt workflows." },
      { id: "wireless", name: "Wireless Activations", area: "Core", status: "Active", notes: "Carrier plans, devices, activations, ports, service accounts, and line management." },
      { id: "internet", name: "Home Internet", area: "Core", status: "Active", notes: "RevGen/Helix service accounts, billing, SIM inventory, activation and cancellation workflows." },
      { id: "inventory", name: "Inventory & IMEI", area: "Core", status: "Active", notes: "Products, serialized units/IMEIs, stock changes, special orders, and website live-inventory foundation." },
      { id: "billing", name: "Customers, Invoices & Payments", area: "Billing", status: "Active", notes: "Customer records, invoices, credits, online payments, AutoPay, Authorize.Net, Zoho, and Valor workflows." },
      { id: "online-orders", name: "Website Online Orders & Customer Portal API", area: "Integration", status: "Active", notes: "POS HTTP endpoints are authoritative for quotes, order creation/status, customer portal data, payments, and AutoPay." },
      { id: "commission", name: "Timekeeper Commission API", area: "Integration", status: "Active", notes: "Weekly commission endpoint used by Timekeeper; preserve the existing shared-secret contract." },
    ],
    access: [
      { id: "staff-auth", role: "POS staff", method: "Hercules OIDC (migration pending)", scope: "POS application access", status: "Migration" },
      { id: "owner", role: "Owner / developer", method: "Viking Aries shared GitHub + Convex connections", scope: "Source, backend, diagnostics, and migration", status: "Active" },
    ],
    files: [
      { id: "durable-library", name: "Dakota Wireless POS durable Files & Media", type: "ChatGPT Library collection", location: "/Viking Aries/Dakota Wireless POS/Files & Media", status: "Durable" },
      { id: "current-export", name: "Current POS source export · 2026-09-20", type: "Source archive", location: "/Viking Aries/Dakota Wireless POS/Files & Media/Source Exports/dwposviking-2026-09-20.gz", status: "Archived" },
      { id: "historical-prototypes", name: "Historical POS prototypes", type: "Reference archive · 50 files", location: "/Viking Aries/Dakota Wireless POS/Files & Media/Historical Prototypes", status: "Archived" },
      { id: "source", name: "POS source", type: "Repository", location: "dakotawireless/Dakota-Wireless-POS---New", status: "In repository" },
      { id: "convex", name: "Convex backend", type: "Backend source", location: "convex/", status: "In repository" },
      { id: "http", name: "POS HTTP APIs", type: "Backend source", location: "convex/http.ts", status: "In repository" },
      { id: "tests", name: "POS automated tests", type: "Vitest / convex-test", location: "convex/*.test.ts and src tests", status: "In repository" },
    ],
    integrations: [
      { id: "github", name: "GitHub", provider: "dakotawireless/Dakota-Wireless-POS---New · migration-staging", purpose: "Source control for the merging POS", status: "Connected" },
      { id: "convex", name: "Convex", provider: "sleek-bear-647", purpose: "Database, functions, HTTP actions, crons", status: "Connected" },
      { id: "preview", name: "Migration Preview", provider: "Cloudflare staging target", purpose: "Preview only the migrated POS build inside VA; never embed the live Hercules production POS", status: "Pending staging deployment" },
      { id: "cloudflare", name: "Cloudflare", provider: "Worker: dakota-wireless-pos---new", purpose: "Isolated migration/staging frontend and VA preview target", status: "Configured / deployment pending" },
      { id: "authorize-net", name: "Authorize.Net", provider: "Existing provider-managed configuration", purpose: "Online/card payments and CIM", status: "Existing / unknown" },
      { id: "easypost", name: "EasyPost", provider: "Existing provider-managed configuration", purpose: "Shipping and webhook workflows", status: "Existing / unknown" },
      { id: "zoho", name: "Zoho", provider: "Existing provider-managed configuration", purpose: "Invoice/balance synchronization", status: "Existing / unknown" },
      { id: "valor", name: "Valor", provider: "Existing provider-managed configuration", purpose: "In-store terminal payments", status: "Existing / unknown" },
      { id: "hercules", name: "Hercules runtime", provider: "Legacy", purpose: "OIDC, email SDK, CDN and current frontend hosting", status: "Migration" },
    ],
    tables: [
      { name: "users / customers", type: "Convex schema", responsibility: "POS users and customer records", status: "Active" },
      { name: "serviceAccounts / serviceLines", type: "Convex schema", responsibility: "Wireless and internet service relationships", status: "Active" },
      { name: "inventoryProducts / inventoryUnits", type: "Convex schema", responsibility: "Catalog, stock and serialized IMEI inventory", status: "Active" },
      { name: "invoices / invoiceLines / payments", type: "Convex schema", responsibility: "Billing and payment records", status: "Active" },
      { name: "transactions / accountHistory / creditMemos", type: "Convex schema", responsibility: "POS history and billing adjustments", status: "Active" },
    ],
    backend: [
      { name: "convex/http.ts", type: "Convex HTTP router", responsibility: "Payroll, online-order, portal, Zoho and webhook API routes", status: "Active" },
      { name: "convex/onlineOrders.ts", type: "Convex module", responsibility: "Website order quote/create/status/fulfillment logic", status: "Active" },
      { name: "convex/customerPortalApi.ts", type: "Convex module", responsibility: "Customer portal summary/profile/payment/AutoPay logic", status: "Active" },
      { name: "convex/payments_processing.ts", type: "Convex module", responsibility: "Authorize.Net and Valor payment processing", status: "Active" },
      { name: "convex/payrollWeeklyCommissions.ts", type: "Convex module", responsibility: "Timekeeper weekly commission API", status: "Active" },
    ],
    automations: [
      { id: "billing", name: "Billing automation", trigger: "Scheduled / application events", action: "Existing Convex billing workflows", enabled: true },
      { id: "zoho", name: "Zoho invoice poller", trigger: "Existing schedule/webhook", action: "Synchronize Zoho invoice/balance changes", enabled: true },
      { id: "emails", name: "Customer / invoice / pickup email", trigger: "Existing POS workflows", action: "Currently uses Hercules email SDK; replace during migration", enabled: true },
    ],
    diagnostics: [
      { id: "source-import", name: "Current source import", result: "Passed", detail: "September 20, 2026 Hercules export imported into dakotawireless/Dakota-Wireless-POS---New." },
      { id: "github-map", name: "VA GitHub runtime mapping", result: "Configured", detail: "VA project maps to dakotawireless/Dakota-Wireless-POS---New on main." },
      { id: "convex-map", name: "VA Convex runtime mapping", result: "Configured", detail: "VA project maps to existing deployment sleek-bear-647." },
      { id: "data-preservation", name: "Convex data preservation", result: "Required", detail: "Migration must keep the existing sleek-bear-647 deployment and data." },
      { id: "hercules-removal", name: "Hercules runtime removal", result: "Pending", detail: "Replace OIDC, email SDK, Vite/ESLint plugins, CDN assets, and onhercules.app links before final cutover." },
      { id: "migration-preview", name: "VA migration preview", result: "Pending", detail: "VA must preview only the migration/staging POS. The live Hercules production POS must remain separate and untouched until final cutover." },
      { id: "cloudflare", name: "Cloudflare deployment", result: "Pending", detail: "No Cloudflare Worker is registered until the Hercules-free frontend is ready to deploy." },
    ],
    versions: [
      { id: "hercules-export-2026-09-20", label: "Current Hercules export imported", ref: "main", note: "Baseline source imported before Hercules-specific migration edits." },
    ],
    deployments: [
      { id: "legacy-production", environment: "Live production — do not use as VA preview", provider: "Hercules", status: "Active / protected during migration", url: "https://dakota-wireless-pos-301249.onhercules.app/" },
      { id: "cloudflare-staging", environment: "Migration staging / future VA preview", provider: "Cloudflare Workers", status: "Pending", url: "" },
      { id: "cloudflare-target", environment: "Target production", provider: "Cloudflare Workers", status: "Pending", url: "" },
    ],
    domains: [
      { id: "legacy", host: "dakota-wireless-pos-301249.onhercules.app", type: "Legacy Hercules host", status: "Active during migration", notes: "Do not cut over until the Cloudflare deployment passes end-to-end POS and website integration tests." },
    ],
    secrets: [
      { id: "convex", name: "CONVEX_DEPLOY_KEY / VITE_CONVEX_URL", provider: "Cloudflare + Convex", purpose: "Future Cloudflare build/deploy connection to existing Convex deployment", status: "Migration" },
      { id: "authnet", name: "AUTHNET_* / AUTHORIZE_NET_*", provider: "Convex environment", purpose: "Authorize.Net payments", status: "Existing / unknown" },
      { id: "valor", name: "VALOR_*", provider: "Convex environment", purpose: "Valor terminal payments", status: "Existing / unknown" },
      { id: "zoho", name: "ZOHO_*", provider: "Convex environment", purpose: "Zoho invoice integration", status: "Existing / unknown" },
      { id: "easypost", name: "EASYPOST_*", provider: "Convex environment", purpose: "Shipping/webhooks", status: "Existing / unknown" },
      { id: "api", name: "DAKOTA_WIRELESS_* / CUSTOMER_PORTAL_API_SECRET / COMMISSION_API_SECRET", provider: "Convex environment", purpose: "Website, portal, payroll and internal API authentication", status: "Existing / unknown" },
      { id: "hercules", name: "HERCULES_API_KEY / HERCULES_OIDC_*", provider: "Legacy Hercules", purpose: "Legacy email/auth runtime to be removed", status: "Migration" },
    ],
    settings: {
      displayName: project.name,
      repository: "dakotawireless/Dakota-Wireless-POS---New",
      defaultBranch: "migration-staging",
      productionUrl: "https://dakota-wireless-pos-301249.onhercules.app/",
      backendProvider: "Convex",
      backendDeployment: "sleek-bear-647",
      backendUrl: "https://sleek-bear-647.convex.cloud",
      notes: "Current production Dakota Wireless POS migration. Preserve existing Convex data and business logic. The Dakota Wireless website depends on this POS backend. Do not rotate or guess provider-managed secret values. Cloudflare deployment will be registered after Hercules-specific runtime dependencies are replaced and staging passes end-to-end tests.",
    },
  };
}

function projectDefaults(project) {
  if (project.id === "dw-pos") return dwPosDefaults(project);
  if (project.id === "timekeeper") return timekeeperDefaults();
  if (project.id === "viking-aries") return vikingAriesDefaults(project);
  if (project.id === "rez-lock") return rezLockDefaults(project);
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
  const good = ["connected", "active", "configured", "destination mapped", "healthy", "success", "passed", "in repository", "stored", "durable", "archived"].includes(normalized);
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

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function FilesMediaView({ project }) {
  const defaults = projectDefaults(project).files;
  const [items, setItems] = useProjectStorage(project.id, "files-media-v2", defaults);
  const [draft, setDraft] = useState({ name: "", type: "Screenshot", location: "", status: "Reference" });
  const [uploadMessage, setUploadMessage] = useState("");

  const add = () => {
    if (!draft.name.trim()) return;
    setItems((current) => [...current, { id: `media-${Date.now()}`, ...draft }]);
    setDraft({ name: "", type: "Screenshot", location: "", status: "Reference" });
  };

  const deleteFile = (item) => {
    setItems((current) => current.filter((row) => row.id !== item.id));
    if (item.storage === "github") {
      setUploadMessage(
        "Removed the old GitHub storage reference from this view. The public GitHub-backed file vault has been retired."
      );
    }
  };

  const archiveText =
    project.id === "dw-pos"
      ? "Dakota Wireless POS migration files are preserved in the private Library under /Viking Aries/Dakota Wireless POS/Files & Media. Direct VA hardcopy uploads are temporarily disabled until a private storage backend is connected."
      : "Direct VA hardcopy uploads are temporarily disabled while a private storage backend is connected. Existing registered file references remain available.";

  return (
    <WorkspacePage>
      <PageHeader
        icon={FileImage}
        title="Files & Media"
        description="Project screenshots, mockups, logos, documents, exports, and durable file references."
      />
      <InfoBanner text={archiveText} />
      {uploadMessage && <div className="integration-feedback">{uploadMessage}</div>}

      <section className="workspace-card upload-dropzone">
        <Upload size={24} />
        <div>
          <strong>Upload hardcopies</strong>
          <p>
            Temporarily disabled while private VA storage is being connected.
            Existing migration files are preserved in the private Library.
          </p>
        </div>
        <button
          type="button"
          className="primary-action"
          disabled
          title="Private storage migration in progress"
        >
          <Upload size={15} /> Secure storage pending
        </button>
      </section>

      <div className="media-grid">
        {items.map((item) => {
          const retiredGithubUpload = item.storage === "github" && Boolean(item.storagePath);
          const browserCopy = Boolean(item.dataUrl);
          const isImage = String(item.type || "").startsWith("image/");
          const Icon = isImage ? FileImage : FileText;

          return (
            <section className="workspace-card media-card" key={item.id}>
              <div className="media-icon">
                {isImage && browserCopy
                  ? <img className="media-thumb" src={item.dataUrl} alt="" />
                  : <Icon size={20} />}
              </div>
              <div>
                <div className="card-heading-row compact">
                  <h2>{item.name}</h2>
                  <StatusPill status={item.status} />
                </div>
                <p>{browserCopy ? `${item.type} · ${formatFileSize(item.size)}` : item.type}</p>
                {browserCopy ? (
                  <a className="media-download" href={item.dataUrl} download={item.name}>
                    <Download size={14} /> Download browser copy
                  </a>
                ) : retiredGithubUpload ? (
                  <small>Legacy GitHub storage retired · private archive retained separately</small>
                ) : (
                  <input
                    value={item.location || ""}
                    onChange={(e) =>
                      setItems((current) =>
                        current.map((row) =>
                          row.id === item.id ? { ...row, location: e.target.value } : row
                        )
                      )
                    }
                    placeholder="File, repo, Drive, or URL reference"
                  />
                )}
              </div>
              <button
                className="icon-action danger"
                type="button"
                onClick={() => deleteFile(item)}
              >
                <Trash2 size={15} />
              </button>
            </section>
          );
        })}
      </div>

      <section className="workspace-card va-entry-panel">
        <div className="va-entry-title"><Plus size={15} /> Register an existing file or reference</div>
        <div className="va-entry-grid">
          <label><span>Name</span><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label>
            <span>Type</span>
            <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
              <option>Screenshot</option>
              <option>Mockup</option>
              <option>Logo</option>
              <option>Document</option>
              <option>Export</option>
              <option>Other</option>
            </select>
          </label>
          <label><span>Location / reference</span><input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} /></label>
          <label><span>Status</span><input value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} /></label>
        </div>
        <button type="button" className="primary-action" onClick={add}><Plus size={15} /> Add reference</button>
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
  const [configureProviderId, setConfigureProviderId] = useState("");
  const [githubTokenDraft, setGithubTokenDraft] = useState("");
  const [cloudflareTokenDraft, setCloudflareTokenDraft] = useState("");
  const [configureBusy, setConfigureBusy] = useState(false);
  // A Worker recorded in the project definition is a durable deployment
  // connection, even when the optional Cloudflare management-token check has
  // not been run in this browser session.
  const registeredCloudflareWorker =
    project?.cloudflareWorker || (project?.id === "viking-aries" ? "vikingaries" : "");
  const cloudflareDestinationConnected = Boolean(
    registeredCloudflareWorker &&
    mappings?.cloudflare?.enabled &&
    (mappings.cloudflare.worker || registeredCloudflareWorker)
  );

  useEffect(() => {
    const registeredWorker = registeredCloudflareWorker;
    if (!registeredWorker) return;

    setMappings((current) => {
      const cloudflare = current?.cloudflare || {};
      const nextCloudflare = {
        ...cloudflare,
        enabled: true,
        worker: cloudflare.worker || registeredWorker,
        deploymentUrl: cloudflare.deploymentUrl || project.deploymentUrl || "",
      };
      const changed =
        cloudflare.enabled !== nextCloudflare.enabled ||
        cloudflare.worker !== nextCloudflare.worker ||
        cloudflare.deploymentUrl !== nextCloudflare.deploymentUrl;
      return changed ? { ...current, cloudflare: nextCloudflare } : current;
    });
  }, [project?.id, project?.cloudflareWorker, project?.deploymentUrl]);

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
          ? `/api/github/verify?projectId=${encodeURIComponent(project.id)}`
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
        setProviderMessage(
          payload.repository
            ? `GitHub verified as ${payload.login || payload.name || "connected account"} with access to ${payload.repository}.`
            : `GitHub verified as ${payload.login || payload.name || "connected account"}.`
        );
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
          account: "Connected Convex account",
          status: "Connected",
        });
        setProviderMessage("Convex personal access token verified. The shared PERSONAL connection is ready; each project still needs its own Convex deployment mapping.");
      }

      await refreshRuntimeStatus();
    } catch (error) {
      setProviderMessage(error.message || `Could not verify ${providerId}.`);
      updateProvider(providerId, { status: "Needs attention" });
    } finally {
      setProviderBusy("");
    }
  };

  const configureProvider = (providerId) => {
    setProviderMessage("");

    if (providerId === "github") {
      setConfigureProviderId("github");
      return;
    }

    if (providerId === "cloudflare") {
      if (runtimeStatus?.providers?.cloudflare?.configured) {
        verifyProvider("cloudflare");
        return;
      }
      setConfigureProviderId("cloudflare");
      return;
    }

    if (providerId === "convex") {
      verifyProvider(providerId);
      return;
    }

    setProviderMessage("This provider uses its project-specific mapping below.");
  };

  const connectGithub = async () => {
    const token = githubTokenDraft.trim();
    if (!token) {
      setProviderMessage("Enter a GitHub token.");
      return;
    }

    setConfigureBusy(true);
    setProviderMessage("");
    try {
      const response = await fetch("/api/github/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, projectId: project.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Could not connect GitHub.");
      }

      setGithubTokenDraft("");
      setConfigureProviderId("");
      updateProvider("github", {
        account: payload.login || payload.name || "Connected GitHub account",
        status: "Connected",
      });
      setProviderMessage(
        payload.repository
          ? `GitHub connected with access to ${payload.repository}.`
          : "GitHub connected."
      );
      await refreshRuntimeStatus();
    } catch (error) {
      setProviderMessage(error.message || "Could not connect GitHub.");
      updateProvider("github", { status: "Needs attention" });
    } finally {
      setGithubTokenDraft("");
      setConfigureBusy(false);
    }
  };

  const connectCloudflare = async () => {
    const token = cloudflareTokenDraft.trim();
    if (!token) {
      setProviderMessage("Enter a Cloudflare API token.");
      return;
    }

    setConfigureBusy(true);
    setProviderMessage("");
    try {
      const response = await fetch("/api/cloudflare/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Could not connect Cloudflare.");
      }

      setCloudflareTokenDraft("");
      setConfigureProviderId("");
      updateProvider("cloudflare", {
        account: payload.accountId ? `Account ${String(payload.accountId).slice(0, 8)}…` : "Connected Cloudflare account",
        status: "Connected",
      });
      setProviderMessage("Cloudflare connected. The API token is stored only as a Cloudflare Worker secret.");
      await refreshRuntimeStatus();
    } catch (error) {
      setProviderMessage(error.message || "Could not connect Cloudflare.");
    } finally {
      setCloudflareTokenDraft("");
      setConfigureBusy(false);
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
                      runtimeStatus?.providers?.[item.id]?.usable ||
                      item.status === "Connected" ||
                      (item.id === "cloudflare" && cloudflareDestinationConnected)
                        ? "Connected"
                        : item.status
                    }
                  />
                </div>

                <div className="shared-integration-fields">
                  <label className="compact-field">
                    <span>Connected account / workspace</span>
                    <input
                      value={item.account || (item.id === "cloudflare" && mappings?.cloudflare?.worker ? `Worker: ${mappings.cloudflare.worker}` : "")}
                      placeholder={item.id === "cloudflare" && mappings?.cloudflare?.worker ? `Worker: ${mappings.cloudflare.worker}` : "Not connected"}
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
                    disabled={configureBusy && item.id === "cloudflare"}
                    onClick={() => configureProvider(item.id)}
                  >
                    {configureBusy && item.id === "cloudflare" ? "Connecting…" : "Configure"}
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
                      : item.status === "Connected" || runtimeStatus?.providers?.[item.id]?.usable
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
                {item.id === "github" && configureProviderId === "github" && (
                  <div className="integration-config-panel">
                    <strong>Connect GitHub</strong>
                    <p>
                      Paste a GitHub token that can read and write this project's mapped repository.
                      VA verifies access to {runtimeStatus?.project?.repository || mappings.github?.repository || "the mapped repository"} before saving it.
                      The token is stored only as the server-side GITHUB_TOKEN secret.
                    </p>
                    <label className="compact-field">
                      <span>GitHub token</span>
                      <input
                        type="password"
                        autoComplete="off"
                        value={githubTokenDraft}
                        placeholder="Paste token"
                        onChange={(e) => setGithubTokenDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !configureBusy) connectGithub();
                        }}
                      />
                    </label>
                    <div className="integration-actions">
                      <button
                        type="button"
                        className="primary-action"
                        disabled={configureBusy || !githubTokenDraft.trim()}
                        onClick={connectGithub}
                      >
                        {configureBusy ? "Connecting…" : "Save & connect"}
                      </button>
                      <button
                        type="button"
                        className="secondary-action"
                        disabled={configureBusy}
                        onClick={() => {
                          setGithubTokenDraft("");
                          setConfigureProviderId("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {item.id === "cloudflare" && configureProviderId === "cloudflare" && (
                  <div className="integration-config-panel">
                    <strong>Connect Cloudflare</strong>
                    <p>
                      Paste a Cloudflare API token that can manage the Viking Aries Worker.
                      VA verifies it first, then stores it only as the server-side
                      CLOUDFLARE_API_TOKEN secret.
                    </p>
                    <label className="compact-field">
                      <span>Cloudflare API token</span>
                      <input
                        type="password"
                        autoComplete="off"
                        value={cloudflareTokenDraft}
                        placeholder="Paste token"
                        onChange={(e) => setCloudflareTokenDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !configureBusy) connectCloudflare();
                        }}
                      />
                    </label>
                    <div className="integration-actions">
                      <button
                        type="button"
                        className="primary-action"
                        disabled={configureBusy || !cloudflareTokenDraft.trim()}
                        onClick={connectCloudflare}
                      >
                        {configureBusy ? "Connecting…" : "Save & connect"}
                      </button>
                      <button
                        type="button"
                        className="secondary-action"
                        disabled={configureBusy}
                        onClick={() => {
                          setCloudflareTokenDraft("");
                          setConfigureProviderId("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

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
                            : item.id === "github" &&
                              runtimeStatus.providers?.github?.configured &&
                              !runtimeStatus.providers?.github?.repositoryAccessible
                                ? ` GitHub token loaded, but mapped repository access failed: ${runtimeStatus.providers?.github?.repositoryError || "Not Found"}`
                            : runtimeStatus.providers?.[item.id]?.usable
                              ? item.id === "github"
                                ? " GitHub tools available to VA"
                                : item.id === "cloudflare"
                                  ? " Cloudflare tools available to VA"
                                  : " Convex tools available to VA"
                              : item.id === "convex" && runtimeStatus.providers?.convex?.configured && !runtimeStatus.providers?.convex?.mapped
                                ? " Convex connection loaded; this project has no Convex deployment mapped yet"
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
              {project.id === "rez-lock" ? "Use RLK Google account for this project" : "Use shared Drive connection for this project"}
            </label>
            <div className="mapping-field-grid">
              <label className="compact-field"><span>Google account</span><input value={mappings.drive?.account || ""} placeholder="account@gmail.com" onChange={(e) => updateMapping("drive", { account: e.target.value })} /></label>
              <label className="compact-field"><span>Project folder URL or durable reference</span><input value={mappings.drive?.folderUrl || ""} placeholder="https://drive.google.com/..." onChange={(e) => updateMapping("drive", { folderUrl: e.target.value })} /></label>
            </div>
          </div>

          <div className="project-mapping-card">
            <div className="project-mapping-title"><Mail size={18} /><strong>Gmail identity</strong></div>
            <label className="mapping-toggle">
              <input type="checkbox" checked={Boolean(mappings.gmail?.enabled)} onChange={(e) => updateMapping("gmail", { enabled: e.target.checked })} />
              {project.id === "rez-lock" ? "Use RLK Google account for this project" : "Use shared Gmail connection for this project"}
            </label>
            <div className="mapping-field-grid">
              <label className="compact-field"><span>Google account</span><input value={mappings.gmail?.account || ""} placeholder="account@gmail.com" onChange={(e) => updateMapping("gmail", { account: e.target.value })} /></label>
              <label className="compact-field"><span>Project mail identity / purpose</span><input value={mappings.gmail?.identity || ""} placeholder="Sender address, alias, or workflow purpose" onChange={(e) => updateMapping("gmail", { identity: e.target.value })} /></label>
            </div>
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

function DwPosStagingBackendProvisioner() {
  const [state, setState] = useState({ status: "idle", message: "", deployment: null });

  const provision = async () => {
    if (state.status === "working") return;
    setState({
      status: "working",
      message: "Provisioning isolated Convex staging backend…",
      deployment: null,
    });

    try {
      const response = await fetch("/api/projects/dw-pos/staging/convex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Staging backend provisioning failed.");
      }

      setState({
        status: "success",
        message: payload.created
          ? "Isolated Convex staging backend created successfully."
          : "Existing migration-staging Convex backend found and reused.",
        deployment: payload.deployment || null,
      });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Staging backend provisioning failed.",
        deployment: null,
      });
    }
  };

  return (
    <section className="workspace-card va-entry-panel">
      <div className="va-entry-title">
        <Database size={16} /> DW POS migration staging backend
      </div>
      <p>
        Creates or reuses the non-default Convex <code>migration-staging</code> deployment
        in the existing Dakota Wireless POS project. The live <code>sleek-bear-647</code>
        production deployment is never replaced or made non-default.
      </p>
      <button
        type="button"
        className="primary-action"
        onClick={provision}
        disabled={state.status === "working"}
      >
        <Database size={15} />
        {state.status === "working" ? "Provisioning…" : "Provision staging backend"}
      </button>
      {state.message && <div className="integration-feedback">{state.message}</div>}
      {state.deployment && (
        <div className="preview-project-facts">
          <span><strong>Reference</strong> {state.deployment.reference || "migration-staging"}</span>
          <span><strong>Deployment</strong> {state.deployment.name || "—"}</span>
          <span><strong>URL</strong> {state.deployment.cloudUrl || "—"}</span>
          <span><strong>Default</strong> {state.deployment.isDefault ? "Yes — blocked" : "No"}</span>
          <span><strong>Deploy key</strong> Stored securely in Viking Aries Cloudflare secrets</span>
        </div>
      )}
    </section>
  );
}

function BackendView({ project }) {
  const defaults = projectDefaults(project).backend;

  if (project.id === "dw-pos") {
    return (
      <WorkspacePage>
        <PageHeader
          icon={Code2}
          title="Backend"
          description="Server-side modules, functions, APIs, and business logic behind the application."
        />
        <DwPosStagingBackendProvisioner />
        <section className="workspace-card">
          <div className="card-heading-row">
            <div>
              <h2>Backend components</h2>
              <p>Registered Dakota Wireless POS backend modules and responsibilities.</p>
            </div>
            <span className="count-badge">{defaults.length}</span>
          </div>
          <div className="integration-table">
            {defaults.map((row, i) => (
              <div className="integration-row" key={row.id || `backend-${i}`}>
                <div>
                  <strong>{row.name}</strong>
                  <small>{row.type} · {row.responsibility}</small>
                </div>
                <StatusPill status={row.status} />
              </div>
            ))}
          </div>
        </section>
      </WorkspacePage>
    );
  }

  return (
    <EditableListView
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
    />
  );
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

  useEffect(() => {
    if (!defaults.length) return;
    setItems((current) => {
      const existing = new Set(current.map((item) => `${item.name}|${item.provider}`));
      const missing = defaults.filter((item) => !existing.has(`${item.name}|${item.provider}`));
      return missing.length ? [...current, ...missing] : current;
    });
  }, [project.id]);

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


function formatTokenCount(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function ApiUsageView({ project }) {
  const [rangeDays, setRangeDays] = useState(30);
  const { usage, loading, error, refresh: loadUsage } = useApiUsage(rangeDays);

  const totals = usage?.totals || {};
  const today = usage?.today || {};
  const byModel = Array.isArray(usage?.byModel) ? usage.byModel : [];
  const recent = Array.isArray(usage?.recent) ? usage.recent : [];

  return (
    <WorkspacePage>
      <PageHeader
        icon={ChartNoAxesCombined}
        title="API Usage"
        description="Recorded OpenAI usage across all Viking Aries projects. Updates every 15 seconds."
        action={
          <div className="usage-header-actions">
            <select value={rangeDays} onChange={(e) => setRangeDays(Number(e.target.value))}>
              <option value={0}>All time</option>
              <option value={1}>24 hours</option>
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
            <button type="button" className="secondary-action" onClick={loadUsage} disabled={loading}>
              <RefreshCw size={14} /> {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        }
      />

      <InfoBanner text="All projects. USD estimates for OpenAI model calls made through Viking Aries. Provider invoices determine actual charges. Other services and calls made outside VA are not included." />

      {error && (
        <section className="workspace-card usage-error-card">
          <strong>API usage could not be refreshed</strong>
          <p>{error}</p>
        </section>
      )}

      {!error && (
        <>
          <section className="usage-metric-grid">
            <div className="usage-metric-card"><span>Today (UTC)</span><strong>{usage ? formatUsd(today.estimatedCostUsd) : "..."}</strong><small>{formatTokenCount(today.requests)} requests</small></div>
            <div className="usage-metric-card"><span>{rangeDays === 0 ? "All time" : rangeDays === 1 ? "Last 24 hours" : `Last ${rangeDays} days`}</span><strong>{usage ? formatUsd(totals.estimatedCostUsd) : "..."}</strong><small>{formatTokenCount(totals.requests)} requests</small></div>
            <div className="usage-metric-card"><span>Input tokens</span><strong>{usage ? formatTokenCount(totals.inputTokens) : "..."}</strong><small>{formatTokenCount(totals.cachedTokens)} cached</small></div>
            <div className="usage-metric-card"><span>Output tokens</span><strong>{usage ? formatTokenCount(totals.outputTokens) : "..."}</strong><small>{formatTokenCount(totals.reasoningTokens)} reasoning</small></div>
          </section>

          <section className="workspace-card">
            <div className="card-heading-row">
              <div><h2>By model</h2><p>Usage and estimated spend across Luna, Terra, and Sol.</p></div>
            </div>
            {loading ? (
              <EmptyState text="Loading API usage…" />
            ) : byModel.length ? (
              <div className="usage-table">
                <div className="usage-table-row usage-table-head">
                  <span>Model</span><span>Requests</span><span>Input</span><span>Output</span><span>Estimated cost</span>
                </div>
                {byModel.map((row) => (
                  <div className="usage-table-row" key={row.model}>
                    <strong>{row.model}</strong>
                    <span>{formatTokenCount(row.requests)}</span>
                    <span>{formatTokenCount(row.inputTokens)}</span>
                    <span>{formatTokenCount(row.outputTokens)}</span>
                    <strong>{formatUsd(row.estimatedCostUsd)}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="No recorded API usage in this period. New model calls will appear here automatically." />
            )}
          </section>

          <section className="workspace-card">
            <div className="card-heading-row"><div><h2>By project</h2><p>Recorded usage in the selected period.</p></div></div>
            <div className="usage-recent-list">
              {(usage?.byProject || []).map((row) => (
                <div className="usage-recent-row" key={row.projectId}>
                  <div><strong>{row.projectName || row.projectId}</strong><small>{formatTokenCount(row.requests)} model calls</small></div>
                  <span>{formatTokenCount(row.totalTokens)} tokens</span>
                  <strong>{formatUsd(row.estimatedCostUsd)}</strong>
                </div>
              ))}
            </div>
          </section>
          <section className="workspace-card">
            <div className="card-heading-row">
              <div><h2>Recent requests</h2><p>Most recent recorded model calls across Viking Aries projects.</p></div>
            </div>
            {recent.length ? (
              <div className="usage-recent-list">
                {recent.map((row) => (
                  <div className="usage-recent-row" key={row.id || row.responseId || `${row.createdAt}-${row.projectId}`}>
                    <div>
                      <strong>{row.projectName || row.projectId || "Unknown project"}</strong>
                      <small>{row.model} · {new Date(row.createdAt).toLocaleString()}</small>
                    </div>
                    <span>{formatTokenCount(row.totalTokens)} tokens</span>
                    <strong>{formatUsd(row.estimatedCostUsd)}</strong>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </>
      )}
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
    case "API Usage":
      return <ApiUsageView project={project} />;
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
