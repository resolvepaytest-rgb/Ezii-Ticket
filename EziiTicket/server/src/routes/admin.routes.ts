import type { Router } from "express";
import type { ScreenKey } from "../authz/permissionKeys.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  requireAdminProductsListAccess,
  requireAdminResourceAccess,
  requireRolesEditorAccess,
} from "../middleware/adminAccess.middleware.js";

export function registerAdminRoutes(router: Router) {
  const adminRead = (screen: ScreenKey) => [requireAuth, requireAdminResourceAccess({ screen, write: false })];
  const adminWrite = (screen: ScreenKey) => [requireAuth, requireAdminResourceAccess({ screen, write: true })];
  const adminProductsList = [requireAuth, requireAdminProductsListAccess()];
  const dashboardViewers = [requireAuth];
  const rolesRead = [requireAuth, requireRolesEditorAccess(false)];
  const rolesWrite = [requireAuth, requireRolesEditorAccess(true)];

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
  router.get("/admin/roles", ...rolesRead, async (req, res) => {
    const mod = await import("../controllers/admin/roles.controller.js");
    return mod.getRoles(req, res);
  });
  router.get("/admin/roles/:id/scoped-users", ...rolesRead, async (req, res) => {
    const mod = await import("../controllers/admin/roles.controller.js");
    return mod.listScopedUsersByRole(req, res);
  });

  router.post("/admin/roles", ...rolesWrite, async (req, res) => {
    const mod = await import("../controllers/admin/roles.controller.js");
    return mod.createRole(req, res);
  });

  router.put("/admin/roles/:id", ...rolesWrite, async (req, res) => {
    const mod = await import("../controllers/admin/roles.controller.js");
    return mod.updateRole(req, res);
  });

  router.delete("/admin/roles/:id", ...rolesWrite, async (req, res) => {
    const mod = await import("../controllers/admin/roles.controller.js");
    return mod.deleteRole(req, res);
  });

  // Designations
  router.get("/admin/designations", ...rolesRead, async (req, res) => {
    const mod = await import("../controllers/admin/roles.controller.js");
    return mod.listDesignations(req, res);
  });
  router.post("/admin/designations", ...rolesWrite, async (req, res) => {
    const mod = await import("../controllers/admin/roles.controller.js");
    return mod.createDesignation(req, res);
  });
  router.put("/admin/designations/:id", ...rolesWrite, async (req, res) => {
    const mod = await import("../controllers/admin/roles.controller.js");
    return mod.updateDesignation(req, res);
  });
  router.delete("/admin/designations/:id", ...rolesWrite, async (req, res) => {
    const mod = await import("../controllers/admin/roles.controller.js");
    return mod.deleteDesignation(req, res);
  });

  router.get("/admin/org-support-levels", ...rolesRead, async (req, res) => {
    const mod = await import("../controllers/admin/roles.controller.js");
    return mod.listOrgSupportLevels(req, res);
  });
  router.post("/admin/org-support-levels", ...rolesWrite, async (req, res) => {
    const mod = await import("../controllers/admin/roles.controller.js");
    return mod.createOrgSupportLevel(req, res);
  });
  router.put("/admin/org-support-levels/:id", ...rolesWrite, async (req, res) => {
    const mod = await import("../controllers/admin/roles.controller.js");
    return mod.updateOrgSupportLevel(req, res);
  });
  router.delete("/admin/org-support-levels/:id", ...rolesWrite, async (req, res) => {
    const mod = await import("../controllers/admin/roles.controller.js");
    return mod.deleteOrgSupportLevel(req, res);
  });

  router.get("/admin/users/:user_id/org-support-level", ...adminRead("users"), async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.getUserDesignation(req, res);
  });
  router.put("/admin/users/:user_id/org-support-level", ...adminWrite("users"), async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.setUserDesignation(req, res);
  });

  router.get("/admin/org-external/worker-types", ...adminRead("users"), async (req, res) => {
    const mod = await import("../controllers/admin/externalOrganizationProxy.controller.js");
    return mod.proxyWorkerTypeList(req, res);
  });
  router.get("/admin/org-external/attributes", ...adminRead("users"), async (req, res) => {
    const mod = await import("../controllers/admin/externalOrganizationProxy.controller.js");
    return mod.proxyAttributeList(req, res);
  });
  router.get("/admin/org-external/attributes/:attributeId/sub-attributes", ...adminRead("users"), async (req, res) => {
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
  router.get("/admin/organisations", ...adminRead("users"), async (req, res) => {
    const mod = await import("../controllers/admin/organisations.controller.js");
    return mod.listOrganisations(req, res);
  });

  router.post("/admin/organisations", ...adminWrite("users"), async (req, res) => {
    const mod = await import("../controllers/admin/organisations.controller.js");
    return mod.createOrganisation(req, res);
  });

  // Products (and org enablement)
  router.get("/admin/products", ...adminProductsList, async (req, res) => {
    const mod = await import("../controllers/admin/products.controller.js");
    return mod.listProducts(req, res);
  });

  router.get("/admin/organisations/:id/products", ...adminRead("teams_queues"), async (req, res) => {
    const mod = await import(
      "../controllers/admin/organisationProducts.controller.js"
    );
    return mod.getOrganisationProducts(req, res);
  });

  router.put("/admin/organisations/:id/products/:product_id", ...adminWrite("teams_queues"), async (req, res) => {
    const mod = await import(
      "../controllers/admin/organisationProducts.controller.js"
    );
    return mod.setOrganisationProduct(req, res);
  });

  router.get("/admin/organisations/:id", ...adminRead("users"), async (req, res) => {
    const mod = await import("../controllers/admin/organisations.controller.js");
    return mod.getOrganisationById(req, res);
  });

  router.put("/admin/organisations/:id", ...adminWrite("users"), async (req, res) => {
    const mod = await import("../controllers/admin/organisations.controller.js");
    return mod.updateOrganisationById(req, res);
  });

  router.get("/admin/organisations/:id/sla-tier1-bounds", ...adminRead("sla_policies"), async (req, res) => {
    const mod = await import("../controllers/admin/slaTier1Bounds.js");
    return mod.listSlaTier1Bounds(req, res);
  });

  router.put("/admin/organisations/:id/sla-tier1-bounds", ...adminWrite("sla_policies"), async (req, res) => {
    const mod = await import("../controllers/admin/slaTier1Bounds.js");
    return mod.putSlaTier1Bounds(req, res);
  });

  router.post("/admin/organisations/:id/provision-customer-users", ...adminWrite("users"), async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.provisionCustomerOrgUsersFromWorker(req, res);
  });

  router.get("/admin/organisations/:id/user-directory", ...adminRead("users"), async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.listOrganisationUserDirectory(req, res);
  });

  router.get("/admin/organisations/:id/invited-agent-users", ...adminRead("users"), async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.listInvitedAgentUsersForOrganisation(req, res);
  });

  // Org settings (1:1)
  router.get("/admin/organisations/:id/settings", ...adminRead("users"), async (req, res) => {
    const mod = await import("../controllers/admin/organisations.controller.js");
    return mod.getOrganisationSettings(req, res);
  });

  router.put("/admin/organisations/:id/settings", ...adminWrite("users"), async (req, res) => {
    const mod = await import("../controllers/admin/organisations.controller.js");
    return mod.updateOrganisationSettings(req, res);
  });

  // Retention policy (1:1)
  router.get("/admin/organisations/:id/retention", ...adminRead("users"), async (req, res) => {
    const mod = await import("../controllers/admin/organisations.controller.js");
    return mod.getOrganisationRetention(req, res);
  });

  router.put("/admin/organisations/:id/retention", ...adminWrite("users"), async (req, res) => {
    const mod = await import("../controllers/admin/organisations.controller.js");
    return mod.updateOrganisationRetention(req, res);
  });

  // Users (lookup by external user_id)
  router.get("/admin/users", ...adminRead("users"), async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.listUsers(req, res);
  });

  router.get("/admin/users/:user_id", ...adminRead("users"), async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.getUserByUserId(req, res);
  });

  router.post("/admin/users", ...adminWrite("users"), async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.createUser(req, res);
  });
  router.post("/admin/users/sync", ...adminWrite("users"), async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.syncUsersFromWorkerMaster(req, res);
  });
  router.get("/admin/user-scope-org", ...adminRead("users"), async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.listUserScopeOrg(req, res);
  });

  router.delete(
    "/admin/users/:user_id/scope-org/:scope_org_id",
    ...adminWrite("users"),
    async (req, res) => {
      const mod = await import("../controllers/admin/users.controller.js");
      return mod.removeUserScopeOrg(req, res);
    }
  );

  router.put("/admin/users/:user_id", ...adminWrite("users"), async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.updateUser(req, res);
  });

  // Set roles for a user (replace)
  router.get("/admin/users/:user_id/roles", ...adminRead("users"), async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.getUserRoles(req, res);
  });
  router.put("/admin/users/:user_id/roles", ...adminWrite("users"), async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.setUserRoles(req, res);
  });
  router.get("/admin/users/:user_id/designation", ...adminRead("users"), async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.getUserDesignation(req, res);
  });
  router.put("/admin/users/:user_id/designation", ...adminWrite("users"), async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.setUserDesignation(req, res);
  });
  router.get("/admin/users/:user_id/permission-overrides", ...adminRead("users"), async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.listUserPermissionOverrides(req, res);
  });
  router.put("/admin/users/:user_id/permission-overrides", ...adminWrite("users"), async (req, res) => {
    const mod = await import("../controllers/admin/users.controller.js");
    return mod.setUserPermissionOverrides(req, res);
  });

  // Teams
  router.get("/admin/teams", ...adminRead("teams_queues"), async (req, res) => {
    const mod = await import("../controllers/admin/teams.controller.js");
    return mod.listTeams(req, res);
  });

  router.post("/admin/teams", ...adminWrite("teams_queues"), async (req, res) => {
    const mod = await import("../controllers/admin/teams.controller.js");
    return mod.createTeam(req, res);
  });

  router.put("/admin/teams/:id", ...adminWrite("teams_queues"), async (req, res) => {
    const mod = await import("../controllers/admin/teams.controller.js");
    return mod.updateTeam(req, res);
  });

  router.delete("/admin/teams/:id", ...adminWrite("teams_queues"), async (req, res) => {
    const mod = await import("../controllers/admin/teams.controller.js");
    return mod.deleteTeam(req, res);
  });

  router.get("/admin/teams/:id/members", ...adminRead("teams_queues"), async (req, res) => {
    const mod = await import("../controllers/admin/teams.controller.js");
    return mod.listTeamMembers(req, res);
  });

  router.put("/admin/teams/:id/members", ...adminWrite("teams_queues"), async (req, res) => {
    const mod = await import("../controllers/admin/teams.controller.js");
    return mod.setTeamMembers(req, res);
  });

  router.get("/admin/agents/ticket-metrics", ...adminRead("teams_queues"), async (req, res) => {
    const mod = await import("../controllers/admin/agentsMetrics.controller.js");
    return mod.getAgentsTicketMetrics(req, res);
  });

  router.post(
    "/admin/organisations/:id/attendance-ooo-sync",
    ...adminWrite("agent"),
    async (req, res) => {
      const mod = await import("../controllers/admin/attendanceOooSync.controller.js");
      return mod.postAttendanceOooSync(req, res);
    }
  );

  // Queues
  router.get("/admin/queues", ...adminRead("teams_queues"), async (req, res) => {
    const mod = await import("../controllers/admin/queues.controller.js");
    return mod.listQueues(req, res);
  });

  router.get("/admin/queues/open-ticket-counts", ...adminRead("teams_queues"), async (req, res) => {
    const mod = await import("../controllers/admin/queues.controller.js");
    return mod.getQueueOpenTicketCounts(req, res);
  });

  router.post("/admin/queues", ...adminWrite("teams_queues"), async (req, res) => {
    const mod = await import("../controllers/admin/queues.controller.js");
    return mod.createQueue(req, res);
  });

  router.put("/admin/queues/:id", ...adminWrite("teams_queues"), async (req, res) => {
    const mod = await import("../controllers/admin/queues.controller.js");
    return mod.updateQueue(req, res);
  });

  router.delete("/admin/queues/:id", ...adminWrite("teams_queues"), async (req, res) => {
    const mod = await import("../controllers/admin/queues.controller.js");
    return mod.deleteQueue(req, res);
  });

  // Routing rules
  router.get("/admin/routing-rules", ...adminRead("routing_rules"), async (req, res) => {
    const mod = await import("../controllers/admin/routingRules.controller.js");
    return mod.listRoutingRules(req, res);
  });
  router.post("/admin/routing-rules", ...adminWrite("routing_rules"), async (req, res) => {
    const mod = await import("../controllers/admin/routingRules.controller.js");
    return mod.createRoutingRule(req, res);
  });
  router.put("/admin/routing-rules/:id", ...adminWrite("routing_rules"), async (req, res) => {
    const mod = await import("../controllers/admin/routingRules.controller.js");
    return mod.updateRoutingRule(req, res);
  });
  router.delete("/admin/routing-rules/:id", ...adminWrite("routing_rules"), async (req, res) => {
    const mod = await import("../controllers/admin/routingRules.controller.js");
    return mod.deleteRoutingRule(req, res);
  });

  router.get("/admin/priority-master", ...adminRead("priority_master"), async (req, res) => {
    const mod = await import("../controllers/admin/priorityMaster.controller.js");
    return mod.listPriorityMaster(req, res);
  });
  router.put("/admin/priority-master", ...adminWrite("priority_master"), async (req, res) => {
    const mod = await import("../controllers/admin/priorityMaster.controller.js");
    return mod.upsertPriorityMasterBatch(req, res);
  });

  router.get("/admin/keyword-routing", ...adminRead("keyword_routing"), async (req, res) => {
    const mod = await import("../controllers/admin/keywordRouting.controller.js");
    return mod.listKeywordRouting(req, res);
  });
  router.post("/admin/keyword-routing", ...adminWrite("keyword_routing"), async (req, res) => {
    const mod = await import("../controllers/admin/keywordRouting.controller.js");
    return mod.createKeywordRouting(req, res);
  });
  router.put("/admin/keyword-routing/:id", ...adminWrite("keyword_routing"), async (req, res) => {
    const mod = await import("../controllers/admin/keywordRouting.controller.js");
    return mod.updateKeywordRouting(req, res);
  });
  router.delete("/admin/keyword-routing/:id", ...adminWrite("keyword_routing"), async (req, res) => {
    const mod = await import("../controllers/admin/keywordRouting.controller.js");
    return mod.deleteKeywordRouting(req, res);
  });

  // SLA policies
  router.get("/admin/sla-policies", ...adminRead("sla_policies"), async (req, res) => {
    const mod = await import("../controllers/admin/slaPolicies.controller.js");
    return mod.listSlaPolicies(req, res);
  });
  router.post("/admin/sla-policies", ...adminWrite("sla_policies"), async (req, res) => {
    const mod = await import("../controllers/admin/slaPolicies.controller.js");
    return mod.createSlaPolicy(req, res);
  });
  router.put("/admin/sla-policies/batch", ...adminWrite("sla_policies"), async (req, res) => {
    const mod = await import("../controllers/admin/slaPolicies.controller.js");
    return mod.upsertSlaPoliciesBatch(req, res);
  });
  router.put("/admin/sla-policies/:id", ...adminWrite("sla_policies"), async (req, res) => {
    const mod = await import("../controllers/admin/slaPolicies.controller.js");
    return mod.updateSlaPolicy(req, res);
  });
  router.delete("/admin/sla-policies/:id", ...adminWrite("sla_policies"), async (req, res) => {
    const mod = await import("../controllers/admin/slaPolicies.controller.js");
    return mod.deleteSlaPolicy(req, res);
  });

  // Notification templates
  router.get("/admin/notification-templates", ...adminRead("notification_templates"), async (req, res) => {
    const mod = await import("../controllers/admin/notificationTemplates.controller.js");
    return mod.listNotificationTemplates(req, res);
  });
  router.post("/admin/notification-templates", ...adminWrite("notification_templates"), async (req, res) => {
    const mod = await import("../controllers/admin/notificationTemplates.controller.js");
    return mod.createNotificationTemplate(req, res);
  });
  router.put("/admin/notification-templates/:id", ...adminWrite("notification_templates"), async (req, res) => {
    const mod = await import("../controllers/admin/notificationTemplates.controller.js");
    return mod.updateNotificationTemplate(req, res);
  });
  router.delete("/admin/notification-templates/:id", ...adminWrite("notification_templates"), async (req, res) => {
    const mod = await import("../controllers/admin/notificationTemplates.controller.js");
    return mod.deleteNotificationTemplate(req, res);
  });

  // Product categories & sub-categories (per org + product)
  router.get(
    "/admin/organisations/:organisation_id/products/:product_id/categories",
    ...adminRead("teams_queues"),
    async (req, res) => {
      const mod = await import("../controllers/admin/productCategories.controller.js");
      return mod.listProductCategoriesTree(req, res);
    }
  );
  router.post(
    "/admin/organisations/:organisation_id/products/:product_id/categories",
    ...adminWrite("teams_queues"),
    async (req, res) => {
      const mod = await import("../controllers/admin/productCategories.controller.js");
      return mod.createProductCategory(req, res);
    }
  );
  router.put("/admin/product-categories/:id", ...adminWrite("teams_queues"), async (req, res) => {
    const mod = await import("../controllers/admin/productCategories.controller.js");
    return mod.updateProductCategory(req, res);
  });
  router.delete("/admin/product-categories/:id", ...adminWrite("teams_queues"), async (req, res) => {
    const mod = await import("../controllers/admin/productCategories.controller.js");
    return mod.deleteProductCategory(req, res);
  });
  router.post("/admin/product-categories/:categoryId/subcategories", ...adminWrite("teams_queues"), async (req, res) => {
    const mod = await import("../controllers/admin/productCategories.controller.js");
    return mod.createProductSubcategory(req, res);
  });
  router.put("/admin/product-subcategories/:id", ...adminWrite("teams_queues"), async (req, res) => {
    const mod = await import("../controllers/admin/productCategories.controller.js");
    return mod.updateProductSubcategory(req, res);
  });
  router.delete("/admin/product-subcategories/:id", ...adminWrite("teams_queues"), async (req, res) => {
    const mod = await import("../controllers/admin/productCategories.controller.js");
    return mod.deleteProductSubcategory(req, res);
  });

  // Canned Responses
  router.get("/admin/canned-responses", ...adminRead("canned_responses"), async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.listCannedResponses(req, res);
  });
  router.post("/admin/canned-responses", ...adminWrite("canned_responses"), async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.createCannedResponse(req, res);
  });
  router.put("/admin/canned-responses/:id", ...adminWrite("canned_responses"), async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.updateCannedResponse(req, res);
  });
  router.delete("/admin/canned-responses/:id", ...adminWrite("canned_responses"), async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.deleteCannedResponse(req, res);
  });

  // Custom Fields
  router.get("/admin/custom-fields", ...adminRead("custom_fields"), async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.listCustomFields(req, res);
  });
  router.post("/admin/custom-fields", ...adminWrite("custom_fields"), async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.createCustomField(req, res);
  });
  router.put("/admin/custom-fields/:id", ...adminWrite("custom_fields"), async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.updateCustomField(req, res);
  });
  router.delete("/admin/custom-fields/:id", ...adminWrite("custom_fields"), async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.deleteCustomField(req, res);
  });

  // API & Webhooks
  router.get("/admin/api-tokens", ...adminRead("api_tokens"), async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.listApiTokens(req, res);
  });
  router.post("/admin/api-tokens", ...adminWrite("api_tokens"), async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.createApiToken(req, res);
  });
  router.put("/admin/api-tokens/:id", ...adminWrite("api_tokens"), async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.updateApiToken(req, res);
  });

  router.get("/admin/webhooks", ...adminRead("webhooks"), async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.listWebhooks(req, res);
  });
  router.post("/admin/webhooks", ...adminWrite("webhooks"), async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.createWebhook(req, res);
  });
  router.put("/admin/webhooks/:id", ...adminWrite("webhooks"), async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.updateWebhook(req, res);
  });
  router.delete("/admin/webhooks/:id", ...adminWrite("webhooks"), async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.deleteWebhook(req, res);
  });

  // Admin Audit Log
  router.get("/admin/audit-logs", ...adminRead("audit_logs"), async (req, res) => {
    const mod = await import("../controllers/admin/adminConfig.controller.js");
    return mod.listAdminAuditLogs(req, res);
  });
}

