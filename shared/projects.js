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
    cloudflareWorker: "",
    deploymentUrl: "",
    backend: "Convex",
    backendDeployment: "benevolent-bulldog-176",
    backendUrl: "https://benevolent-bulldog-176.convex.cloud",
    convexDashboardUrl: "https://dashboard.convex.dev/",
    status: "Migration",
    contextSummary: [
      "Smoke Signals POS migration source is in dakotawireless/Smoke-Signals-POS---New. The untouched imported baseline remains on main; migration work is isolated on migration/remove-hercules.",
      "The new migration Convex deployment is benevolent-bulldog-176 at https://benevolent-bulldog-176.convex.cloud. The GitHub Actions CONVEX_DEPLOY_KEY is configured for this migration deployment.",
      "Live production remains the Hercules POS at https://smoke-signals-pos-224583.onhercules.app using Convex moonlit-mallard-698. Do not repoint, reset, overwrite, or migrate that production backend during staging work.",
      "The Hercules runtime/auth packages have been removed on the migration branch while preserving POS business logic, employee/PIN access, Valor integration, recovery diagnostics, inventory, transactions, customers, returns, and shared settings.",
      "The cleaned migration branch passes frozen pnpm install, Convex TypeScript checks, and the production Vite build.",
      "A matching Cloudflare migration project has been created, but its exact Worker/project name and staging URL are not yet registered in Viking Aries. Do not target a Cloudflare Worker until those exact identifiers are confirmed.",
      "Timekeeper is a separate application and must not be modified as part of this migration.",
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
