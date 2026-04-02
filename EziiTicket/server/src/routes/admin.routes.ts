import type { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";

export function registerAdminRoutes(router: Router) {
  const adminOnly = [requireAuth, requireRole("admin", "system_admin", "team_lead")];
  const dashboardViewers = [requireAuth];
  const rolesEditorOnly = [
    requireAuth,
    requireRole("admin", "system_admin", "team_lead", "l1_agent", "l2_specialist", "l3_engineer"),
  ];

  // Dashboard data (all authenticated users)
  router.get("/admin/dashboard/my-assigned-tickets", ...dashboardViewers, async (req, res) => {
    const mod = await import("../controllers/admin/dashboard.controller.js");
    return mod.getMyAssignedTickets(req, res);
  });
  router.get("/admin/dashboard/my-sla-risk", ...dashboardViewers, async (req, res) => {
    const mod = await import("../controllers/admin/dashboard.controller.js");
    return mod.getMySlaRisk(req, res);
  });
  router.get("/admin/dashboard/team-queue-load", ...dashboardViewers, async (req, res) => {
    const mod = await import("../controllers/admin/dashboard.controller.js");
    return mod.getTeamQueueLoad(req, res);
  });

  // Roles
  router.get("/admin/roles", ...rolesEditorOnly, async (req, res) => {
    const mod = await import("../controllers/admin/roles.controller.js");
    return mod.getRoles(req, res);
  });

  router.post("/admin/roles", ...rolesEditorOnly, async (req, res) => {
    const mod = await import("../controllers/admin/roles.controller.js");
    return mod.createRole(req, res);
  });

  router.put("/admin/roles/:id", ...rolesEditorOnly, async (req, res) => {
    const mod = await import("../controllers/admin/roles.controller.js");
    return mod.updateRole(req, res);
  });

  router.delete("/admin/roles/:id", ...rolesEditorOnly, async (req, res) => {
    const mod = await import("../controllers/admin/roles.controller.js");
    return mod.deleteRole(req, res);
  });

  // Designations
  router.get("/admin/designations", ...rolesEditorOnly, async (req, res) => {
    const mod = await import("../controllers/admin/roles.controller.js");
    return mod.listDesignations(req, res);
  });
  router.post("/admin/designations", ...rolesEditorOnly, async (req, res) => {
    const mod = await import("../controllers/admin/roles.controller.js");
    return mod.createDesignation(req, res);
  });
  router.put("/admin/designations/:id", ...rolesEditorOnly, async (req, res) => {
    const mod = await import("../controllers/admin/roles.controller.js");
    return mod.updateDesignation(req, res);
  });
  router.delete("/admin/designations/:id", ...rolesEditorOnly, async (req, res) => {
    const mod = await import("../controllers/admin/roles.controller.js");
    return mod.deleteDesignation(req, res);
  });

  router.get("/admin/org-support-levels", ...rolesEditorOnly, async (req, res) => {
    const mod = await import("../controllers/admin/roles.controller.js");
    return mod.listOrgSupportLevels(req, res);
  });
  router.post("/admin/org-support-levels", ...rolesEditorOnly, async (req, res) => {
    const mod = await import("../controllers/admin/roles.controller.js");
    return mod.createOrgSupportLevel(req, res);
  });
  router.put("/admin/org-support-levels/:id", ...rolesEditorOnly, async (req, res) => {
    const mod = await import("../controllers/admin/roles.controller.js");
    return mod.updateOrgSupportLevel(req, res);
  });
  router.delete("/admin/org-support-levels/:id", ...rolesEditorOnly, async (req, res) => {
    const mod = await import("../controllers/admin/roles.controller.js");
    return mod.deleteOrgSupportLevel(req, res);
  });

  router.get("/admin/users/:user_id/org-support-level", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.getUserDesignation(req, res);
  });
  router.put("/admin/users/:user_id/org-support-level", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.setUserDesignation(req, res);
  });

  router.get("/admin/org-external/worker-types", ...rolesEditorOnly, async (req, res) => {
    const mod = await import("../controllers/admin/externalOrganizationProxy.controller.js");
    return mod.proxyWorkerTypeList(req, res);
  });
  router.get("/admin/org-external/attributes", ...rolesEditorOnly, async (req, res) => {
    const mod = await import("../controllers/admin/externalOrganizationProxy.controller.js");
    return mod.proxyAttributeList(req, res);
  });
  router.get("/admin/org-external/attributes/:attributeId/sub-attributes", ...rolesEditorOnly, async (req, res) => {
    const mod = await import("../controllers/admin/externalOrganizationProxy.controller.js");
    return mod.proxyAttributeDetails(req, res);
  });

  // System-wide tickets (Ezii super-admin via `isEziiSystemAdmin`, or role `system_admin`; cross-organisation)
  router.get("/admin/system/tickets/filter-options", requireAuth, async (req, res) => {
    const mod = await import("../controllers/admin/systemTickets.controller.js");
    return mod.getSystemTicketFilterOptions(req, res);
  });
  router.get("/admin/system/tickets", requireAuth, async (req, res) => {
    const mod = await import("../controllers/admin/systemTickets.controller.js");
    return mod.listSystemTickets(req, res);
  });
  router.get("/admin/system/organisations/ticket-metrics", requireAuth, async (req, res) => {
    const mod = await import("../controllers/admin/systemTickets.controller.js");
    return mod.getOrganisationTicketMetrics(req, res);
  });

  // Organisations
  router.get("/admin/organisations", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/organisations.controller.js");
    return mod.listOrganisations(req, res);
  });

  router.post("/admin/organisations", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/organisations.controller.js");
    return mod.createOrganisation(req, res);
  });

  // Products (and org enablement)
  router.get("/admin/products", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/products.controller.js");
    return mod.listProducts(req, res);
  });

  router.get("/admin/organisations/:id/products", ...adminOnly, async (req, res) => {
    const mod = await import(
      "../controllers/admin/organisationProducts.controller.js"
    );
    return mod.getOrganisationProducts(req, res);
  });

  router.put("/admin/organisations/:id/products/:product_id", ...adminOnly, async (req, res) => {
    const mod = await import(
      "../controllers/admin/organisationProducts.controller.js"
    );
    return mod.setOrganisationProduct(req, res);
  });

  router.get("/admin/organisations/:id", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/organisations.controller.js");
    return mod.getOrganisationById(req, res);
  });

  router.put("/admin/organisations/:id", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/organisations.controller.js");
    return mod.updateOrganisationById(req, res);
  });

  router.get("/admin/organisations/:id/sla-tier1-bounds", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/slaTier1Bounds.js");
    return mod.listSlaTier1Bounds(req, res);
  });

  router.put("/admin/organisations/:id/sla-tier1-bounds", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/slaTier1Bounds.js");
    return mod.putSlaTier1Bounds(req, res);
  });

  router.post("/admin/organisations/:id/provision-customer-users", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.provisionCustomerOrgUsersFromWorker(req, res);
  });

  router.get("/admin/organisations/:id/user-directory", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.listOrganisationUserDirectory(req, res);
  });

  router.get("/admin/organisations/:id/invited-agent-users", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.listInvitedAgentUsersForOrganisation(req, res);
  });

  // Org settings (1:1)
  router.get("/admin/organisations/:id/settings", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/organisations.controller.js");
    return mod.getOrganisationSettings(req, res);
  });

  router.put("/admin/organisations/:id/settings", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/organisations.controller.js");
    return mod.updateOrganisationSettings(req, res);
  });

  // Retention policy (1:1)
  router.get("/admin/organisations/:id/retention", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/organisations.controller.js");
    return mod.getOrganisationRetention(req, res);
  });

  router.put("/admin/organisations/:id/retention", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/organisations.controller.js");
    return mod.updateOrganisationRetention(req, res);
  });

  // Users (lookup by external user_id)
  router.get("/admin/users", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.listUsers(req, res);
  });

  router.get("/admin/users/:user_id", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.getUserByUserId(req, res);
  });

  router.post("/admin/users", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.createUser(req, res);
  });
  router.post("/admin/users/sync", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.syncUsersFromWorkerMaster(req, res);
  });
  router.get("/admin/user-scope-org", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.listUserScopeOrg(req, res);
  });

  router.delete(
    "/admin/users/:user_id/scope-org/:scope_org_id",
    ...adminOnly,
    async (req, res) => {
      const mod = await import("../controllers/admin/users.controller.js");
      return mod.removeUserScopeOrg(req, res);
    }
  );

  router.put("/admin/users/:user_id", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.updateUser(req, res);
  });

  // Set roles for a user (replace)
  router.get("/admin/users/:user_id/roles", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.getUserRoles(req, res);
  });
  router.put("/admin/users/:user_id/roles", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.setUserRoles(req, res);
  });
  router.get("/admin/users/:user_id/designation", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.getUserDesignation(req, res);
  });
  router.put("/admin/users/:user_id/designation", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.setUserDesignation(req, res);
  });
  router.get("/admin/users/:user_id/permission-overrides", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.listUserPermissionOverrides(req, res);
  });
  router.put("/admin/users/:user_id/permission-overrides", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.setUserPermissionOverrides(req, res);
  });

  // Teams
  router.get("/admin/teams", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/teams.controller.js");
    return mod.listTeams(req, res);
  });

  router.post("/admin/teams", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/teams.controller.js");
    return mod.createTeam(req, res);
  });

  router.put("/admin/teams/:id", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/teams.controller.js");
    return mod.updateTeam(req, res);
  });

  router.delete("/admin/teams/:id", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/teams.controller.js");
    return mod.deleteTeam(req, res);
  });

  router.get("/admin/teams/:id/members", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/teams.controller.js");
    return mod.listTeamMembers(req, res);
  });

  router.put("/admin/teams/:id/members", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/teams.controller.js");
    return mod.setTeamMembers(req, res);
  });

  router.get("/admin/agents/ticket-metrics", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/agentsMetrics.controller.js");
    return mod.getAgentsTicketMetrics(req, res);
  });

  // Queues
  router.get("/admin/queues", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/queues.controller.js");
    return mod.listQueues(req, res);
  });

  router.post("/admin/queues", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/queues.controller.js");
    return mod.createQueue(req, res);
  });

  router.put("/admin/queues/:id", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/queues.controller.js");
    return mod.updateQueue(req, res);
  });

  router.delete("/admin/queues/:id", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/queues.controller.js");
    return mod.deleteQueue(req, res);
  });

  // Routing rules
  router.get("/admin/routing-rules", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/routingRules.controller.js");
    return mod.listRoutingRules(req, res);
  });
  router.post("/admin/routing-rules", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/routingRules.controller.js");
    return mod.createRoutingRule(req, res);
  });
  router.put("/admin/routing-rules/:id", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/routingRules.controller.js");
    return mod.updateRoutingRule(req, res);
  });
  router.delete("/admin/routing-rules/:id", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/routingRules.controller.js");
    return mod.deleteRoutingRule(req, res);
  });

  router.get("/admin/priority-master", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/priorityMaster.controller.js");
    return mod.listPriorityMaster(req, res);
  });
  router.put("/admin/priority-master", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/priorityMaster.controller.js");
    return mod.upsertPriorityMasterBatch(req, res);
  });

  router.get("/admin/keyword-routing", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/keywordRouting.controller.js");
    return mod.listKeywordRouting(req, res);
  });
  router.post("/admin/keyword-routing", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/keywordRouting.controller.js");
    return mod.createKeywordRouting(req, res);
  });
  router.put("/admin/keyword-routing/:id", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/keywordRouting.controller.js");
    return mod.updateKeywordRouting(req, res);
  });
  router.delete("/admin/keyword-routing/:id", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/keywordRouting.controller.js");
    return mod.deleteKeywordRouting(req, res);
  });

  // SLA policies
  router.get("/admin/sla-policies", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/slaPolicies.controller.js");
    return mod.listSlaPolicies(req, res);
  });
  router.post("/admin/sla-policies", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/slaPolicies.controller.js");
    return mod.createSlaPolicy(req, res);
  });
  router.put("/admin/sla-policies/:id", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/slaPolicies.controller.js");
    return mod.updateSlaPolicy(req, res);
  });
  router.delete("/admin/sla-policies/:id", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/slaPolicies.controller.js");
    return mod.deleteSlaPolicy(req, res);
  });

  // Notification templates
  router.get("/admin/notification-templates", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/notificationTemplates.controller.js");
    return mod.listNotificationTemplates(req, res);
  });
  router.post("/admin/notification-templates", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/notificationTemplates.controller.js");
    return mod.createNotificationTemplate(req, res);
  });
  router.put("/admin/notification-templates/:id", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/notificationTemplates.controller.js");
    return mod.updateNotificationTemplate(req, res);
  });
  router.delete("/admin/notification-templates/:id", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/notificationTemplates.controller.js");
    return mod.deleteNotificationTemplate(req, res);
  });

  // Product categories & sub-categories (per org + product)
  router.get(
    "/admin/organisations/:organisation_id/products/:product_id/categories",
    ...adminOnly,
    async (req, res) => {
      const mod = await import("../controllers/admin/productCategories.controller.js");
      return mod.listProductCategoriesTree(req, res);
    }
  );
  router.post(
    "/admin/organisations/:organisation_id/products/:product_id/categories",
    ...adminOnly,
    async (req, res) => {
      const mod = await import("../controllers/admin/productCategories.controller.js");
      return mod.createProductCategory(req, res);
    }
  );
  router.put("/admin/product-categories/:id", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/productCategories.controller.js");
    return mod.updateProductCategory(req, res);
  });
  router.delete("/admin/product-categories/:id", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/productCategories.controller.js");
    return mod.deleteProductCategory(req, res);
  });
  router.post("/admin/product-categories/:categoryId/subcategories", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/productCategories.controller.js");
    return mod.createProductSubcategory(req, res);
  });
  router.put("/admin/product-subcategories/:id", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/productCategories.controller.js");
    return mod.updateProductSubcategory(req, res);
  });
  router.delete("/admin/product-subcategories/:id", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/productCategories.controller.js");
    return mod.deleteProductSubcategory(req, res);
  });

  // Canned Responses
  router.get("/admin/canned-responses", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.listCannedResponses(req, res);
  });
  router.post("/admin/canned-responses", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.createCannedResponse(req, res);
  });
  router.put("/admin/canned-responses/:id", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.updateCannedResponse(req, res);
  });
  router.delete("/admin/canned-responses/:id", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.deleteCannedResponse(req, res);
  });

  // Custom Fields
  router.get("/admin/custom-fields", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.listCustomFields(req, res);
  });
  router.post("/admin/custom-fields", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.createCustomField(req, res);
  });
  router.put("/admin/custom-fields/:id", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.updateCustomField(req, res);
  });
  router.delete("/admin/custom-fields/:id", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.deleteCustomField(req, res);
  });

  // API & Webhooks
  router.get("/admin/api-tokens", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.listApiTokens(req, res);
  });
  router.post("/admin/api-tokens", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.createApiToken(req, res);
  });
  router.put("/admin/api-tokens/:id", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.updateApiToken(req, res);
  });

  router.get("/admin/webhooks", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.listWebhooks(req, res);
  });
  router.post("/admin/webhooks", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.createWebhook(req, res);
  });
  router.put("/admin/webhooks/:id", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.updateWebhook(req, res);
  });
  router.delete("/admin/webhooks/:id", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.deleteWebhook(req, res);
  });

  // Admin Audit Log
  router.get("/admin/audit-logs", ...adminOnly, async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.listAdminAuditLogs(req, res);
  });
}

