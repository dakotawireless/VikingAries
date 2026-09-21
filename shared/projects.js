// Authoritative migrated project registrations shared by the UI and runtime.
export const MIGRATED_PROJECTS = {
  "dw-pos": {
    repository: "dakotawireless/Dakota-Wireless-POS---New",
    defaultBranch: "migration-staging",
    cloudflareWorker: "dakota-wireless-pos---new",
    deploymentUrl: "https://migration-staging-dakota-wireless-pos---new.erik-f2c.workers.dev",
    backend: "Convex",
    backendDeployment: "energized-crane-577",
    backendUrl: "https://energized-crane-577.convex.cloud",
    convexDashboardUrl: "https://dashboard.convex.dev/t/erik-2df00/dakota-wireless-pos/energized-crane-577",
    status: "Migration",
    contextSummary: [
      "Complete migrated POS source is in dakotawireless/Dakota-Wireless-POS---New on migration-staging, including frontend, Convex functions, schema, cron jobs, and integration adapters.",
      "The migrated backend is energized-crane-577. Legacy sleek-bear-647 and pos.dakotawireless.net are separate; do not confuse their data or job histories with the migrated app.",
      "Native employee PIN authentication and Microsoft 365 email transport are implemented. Test email mode redirects messages; it does not disable billing jobs.",
      "Late fees remain enabled without a separate late-fee email; reminder and Houston suspension emails remain enabled.",
      "The POS supplies website ordering, customer portal, pricing, payment, and order-status APIs. Preserve Authorize.Net, EasyPost, Zoho, Valor, Timekeeper commission APIs and current business behavior.",
      "Do not change production routing, email test mode, credentials, or perform a data cutover without explicit direction. Migration validation and final data reconciliation remain separate work.",
    ].join("\n"),
  },
  "smoke-pos": {
    repository: "dakotawireless/Smoke-Signals-POS---New",
    defaultBranch: "migration/remove-hercules",
    cloudflareWorker: "smoke-signals-pos---new",
    deploymentUrl: "",
    backend: "Convex",
    backendDeployment: "benevolent-bulldog-176",
    backendUrl: "https://benevolent-bulldog-176.convex.cloud",
    convexDashboardUrl: "https://dashboard.convex.dev/t/erik-2df00/smoke-signals-pos-new/benevolent-bulldog-176",
    status: "Migration",
    contextSummary: [
      "Smoke Signals POS migration source is in dakotawireless/Smoke-Signals-POS---New. The untouched imported baseline is preserved on main; migration work is isolated on migration/remove-hercules.",
      "Migration backend is benevolent-bulldog-176 at https://benevolent-bulldog-176.convex.cloud. Legacy production remains moonlit-mallard-698 and must not be modified during migration.",
      "The live Hercules POS remains https://smoke-signals-pos-224583.onhercules.app/ until staging passes full register, inventory, transaction, return, recovery, and payment testing.",
      "Hercules runtime/auth dependencies have been removed from the migration branch and the cleaned branch passes frozen pnpm install, Convex TypeScript, and production Vite build.",
      "Convex schema/functions are deployed to benevolent-bulldog-176 and diagnostics passed. The migration backend remains intentionally empty until data migration.",
      "Cloudflare packaging is configured for Worker smoke-signals-pos---new. Wrangler is pinned in the repo and dry-run deployment validation passes; the Worker itself still needs provider verification before a staging URL is recorded or a real deployment is triggered.",
      "Smoke Signals uses Valor VP550 / Valor Connect Cloud. Required Convex environment names are VALOR_API_BASE_URL, VALOR_APP_ID, VALOR_APP_KEY, VALOR_EPI, and VALOR_CHANNEL_ID. Never store or expose their values in VA project metadata.",
      "Keep Timekeeper completely separate. Do not merge migration/remove-hercules to main, cut over Cloudflare, or migrate production data until explicit validation and cutover approval.",
    ].join("\n"),
  },
  "viking-aries": {
    repository: "dakotawireless/VikingAries",
    defaultBranch: "main",
    cloudflareWorker: "vikingaries",
    deploymentUrl: "https://vikingaries.dakotawireless.net/",
    backend: "Convex",
    backendDeployment: "flippant-mandrill-487",
    backendUrl: "https://flippant-mandrill-487.convex.cloud",
    convexDashboardUrl: "https://dashboard.convex.dev/",
    status: "Active",
    contextSummary: [
      "Viking Aries is the project management and migration control app for Erik's application stack.",
      "Source repository is dakotawireless/VikingAries on main.",
      "Production hosting is Cloudflare Worker vikingaries at https://vikingaries.dakotawireless.net/.",
      "Viking Aries backend is Convex deployment flippant-mandrill-487 at https://flippant-mandrill-487.convex.cloud.",
      "Shared GitHub, Cloudflare, and Convex provider connections are reused across PERSONAL projects while project-specific repository, Worker, and deployment mappings remain separate.",
    ].join("\n"),
  },
  "dw-site": {
    repository: "dakotawireless/DW-Website---NEW",
    defaultBranch: "migration-staging",
    cloudflareWorker: "dwwebsite-migration-staging",
    deploymentUrl: "https://dwwebsite-migration-staging.erik-f2c.workers.dev",
    backend: "Convex",
    backendDeployment: "little-bat-645",
    backendUrl: "https://little-bat-645.convex.cloud",
    convexDashboardUrl: "https://dashboard.convex.dev/t/erik-2df00/dakota-wireless-website/little-bat-645",
    status: "Migration",
    contextSummary: [
      "Complete migrated Dakota Wireless website source is in dakotawireless/DW-Website---NEW on migration-staging, including frontend and Convex backend functions.",
      "Hosting is Cloudflare Worker dwwebsite-migration-staging; website backend is little-bat-645.",
      "The related migrated POS backend is energized-crane-577. The POS owns ordering, customer portal, pricing, payments, order status and inventory integration contracts.",
      "Preserve the website design, existing functionality and POS API contracts. Do not change production domains, credentials, or perform a data cutover without explicit direction.",
    ].join("\n"),
  },
};

// Replace obsolete migration mappings once, retaining unrelated integrations
// and allowing subsequent user edits to persist.
export function migrateProjectMappings(projectId, mappings = {}) {
  const project = MIGRATED_PROJECTS[projectId];
  if (!project || mappings?.migratedProjectVersion === 1) return mappings;
  return {
    ...mappings,
    migratedProjectVersion: 1,
    github: { ...mappings?.github, enabled: true, repository: project.repository, branch: project.defaultBranch },
    cloudflare: { ...mappings?.cloudflare, enabled: Boolean(project.cloudflareWorker || project.deploymentUrl), worker: project.cloudflareWorker, deploymentUrl: project.deploymentUrl },
    convex: { ...mappings?.convex, enabled: true, deployment: project.backendDeployment, url: project.backendUrl, dashboardUrl: project.convexDashboardUrl },
  };
}
