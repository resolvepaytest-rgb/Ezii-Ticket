import { http } from "./httpClient";

export type ApiResponse<T> = {
  ok: boolean;
  data: T;
  error?: string;
};

const GET_CACHE_TTL_MS = 3000;
const getCache = new Map<string, { ts: number; value: unknown }>();
const getInFlight = new Map<string, Promise<unknown>>();

function getCached<T>(key: string): T | null {
  const cached = getCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.ts > GET_CACHE_TTL_MS) {
    getCache.delete(key);
    return null;
  }
  return cached.value as T;
}

function setCached<T>(key: string, value: T) {
  getCache.set(key, { ts: Date.now(), value });
}

function invalidateByPrefix(prefix: string) {
  for (const key of getCache.keys()) {
    if (key.startsWith(prefix)) getCache.delete(key);
  }
}

async function getWithCache<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const cached = getCached<T>(key);
  if (cached !== null) return cached;

  const running = getInFlight.get(key);
  if (running) return running as Promise<T>;

  const p = fetcher()
    .then((value) => {
      setCached(key, value);
      return value;
    })
    .finally(() => {
      getInFlight.delete(key);
    });

  getInFlight.set(key, p as Promise<unknown>);
  return p;
}

function getJwtToken() {
  try {
    return localStorage.getItem("jwt_token");
  } catch {
    return null;
  }
}

async function externalGet<T>(url: string): Promise<T> {
  const token = getJwtToken();
  if (!token) throw new Error("Missing jwt_token");

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      data &&
      typeof data === "object" &&
      "message" in data &&
      typeof (data as { message?: unknown }).message === "string"
        ? (data as { message: string }).message
        : `External API request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

async function externalPost<T>(url: string, payload: unknown): Promise<T> {
  const token = getJwtToken();
  if (!token) throw new Error("Missing jwt_token");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      data &&
      typeof data === "object" &&
      "message" in data &&
      typeof (data as { message?: unknown }).message === "string"
        ? (data as { message: string }).message
        : `External API request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

function getExternalBaseUrl() {
  const fromEnv =
    (import.meta.env["EXTERNAL_API_URL"] as string | undefined);
  return fromEnv?.replace(/\/+$/, "") ?? "https://qa-api.resolveindia.com";
}

export type Organisation = {
  id: number;
  name: string;
  support_email: string | null;
  timezone: string;
  logo_url: string | null;
  portal_subdomain: string | null;
  /** Mirrored with `organisation_settings.is_ngo`; driven by external client-products sync. */
  is_ngo?: boolean;
};

export type OrganisationSettings = {
  organisation_id: number;
  business_hours_definition: string | null;
  holiday_calendar: string | null;
  is_ngo: boolean;
  ticket_retention_months: number;
};

export type DataRetentionPolicy = {
  organisation_id: number;
  closed_ticket_retention_months: number;
  audit_log_retention_months: number;
  pii_masking_rules: string | null;
};

export type Product = {
  id: number;
  code: string;
  name: string;
  default_ticket_prefix: string;
};

export type OrganisationProduct = {
  product_id: number;
  code: string;
  name: string;
  enabled: boolean;
  default_routing_queue_id: number | null;
  default_routing_queue_name: string | null;
};

export type ProductSubcategory = {
  id: number;
  category_id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
  is_system_default?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ProductCategoryTree = {
  id: number;
  organisation_id: number;
  product_id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
  is_system_default?: boolean;
  created_at?: string;
  updated_at?: string;
  subcategories: ProductSubcategory[];
};

export type Queue = {
  id: number;
  organisation_id: number;
  product_id: number | null;
  team_id: number | null;
  name: string;
  created_at?: string;
  updated_at?: string;
};

export type Team = {
  id: number;
  organisation_id: number;
  product_id: number | null;
  name: string;
  created_at?: string;
  updated_at?: string;
};

export type ApplyRoleTo = "all" | "reportees" | "worker_type" | "attribute";

export type Role = {
  id: number;
  organisation_id?: number;
  name: string;
  role_type?: "internal_support" | "customer_org";
  description?: string | null;
  is_default?: boolean;
  created_at?: string;
  permissions_json?: Record<string, unknown>;
  apply_role_to?: ApplyRoleTo;
  apply_attribute_id?: string | null;
  apply_sub_attribute_id?: string | null;
  apply_worker_type_id?: string | null;
};

export type User = {
  id: number;
  user_id: number;
  organisation_id: number;
  name: string;
  email: string;
  phone: string | null;
  ticket_role?: string | null;
  ticket_role_id?: number | null;
  user_type: string | null;
  status: string;
  /** Excluded from least-loaded assignment when true. */
  out_of_office?: boolean;
  /** Inclusive scheduled OOO start date (YYYY-MM-DD). */
  ooo_start_date?: string | null;
  /** Inclusive scheduled OOO end date (YYYY-MM-DD). */
  ooo_end_date?: string | null;
  /** Worker report / Ezii “Department” field (dataField `type_id_1`). */
  type_id_1?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type RoleScopedUser = Pick<
  User,
  "user_id" | "organisation_id" | "name" | "email" | "status" | "user_type" | "type_id_1"
> & {
  type_id_12?: string | null;
  role_name?: string | null;
};

export type UserRole = {
  id: number;
  user_id: number;
  role_id: number;
  scope_organisation_id?: number | null;
  role_name: string;
};

/** Org-scoped support tier (L1/L2/L3 routing), not job title */
export type OrgSupportLevel = {
  id: number;
  organisation_id: number;
  code: string;
  name: string;
  description?: string | null;
  is_default?: boolean;
  created_at?: string;
  updated_at?: string;
};

/** @deprecated Use OrgSupportLevel */
export type Designation = OrgSupportLevel;

export type UserOrgSupportLevel = {
  id: number;
  user_id: number;
  support_level_id: number;
  support_level_code?: string;
  support_level_name?: string;
  designation_code?: string;
  designation_name?: string;
  organisation_id?: number;
  effective_from: string;
  effective_to?: string | null;
  is_active: boolean;
};

/** @deprecated Use UserOrgSupportLevel */
export type UserDesignation = UserOrgSupportLevel & {
  designation_id?: number;
};

export type UserPermissionOverride = {
  id: number;
  user_id: number;
  organisation_id: number;
  permission_key: string;
  effect: "allow" | "deny";
  reason?: string | null;
  expires_at?: string | null;
  created_by?: number | null;
  created_at?: string;
};

export type UserScopeOrg = {
  id: number;
  origin_org_id: number;
  scope_org_id: number;
  user_id: number;
  employee_number: string | null;
  user_name: string | null;
  email: string | null;
  ticket_role: string;
  ticket_role_id: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ExternalOrganization = {
  id: string;
  organization_name: string;
  /** `1` means current user is org-admin for this client org. */
  role_id?: string;
};

export type ExternalUserProfile = {
  org_id: string;
  organization_name: string;
  organization_logo: string | null;
  user_id: string;
  email: string;
  employer_name: string;
  employee_number: string;
  user_profile: string | null;
  user_type_id: string;
  backgroundColor: string | null;
  isKycEnabled: string;
  isPan: boolean;
  isAadhar: boolean;
  isWhatsapp: boolean;
  is_exited: string;
};

export type ExternalEmployee = {
  user_id: string;
  user_name?: string;
  email?: string;
  Mobile_number_1?: string;
  worker_type?: string;
  is_active?: boolean;
  employee_number?: string;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseJsonString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

function looksLikeEmployee(value: unknown): value is ExternalEmployee {
  if (!isObjectRecord(value)) return false;
  return "user_id" in value || "employee_number" in value || "user_name" in value;
}

function collectEmployeeArrays(input: unknown): ExternalEmployee[] {
  const queue: unknown[] = [parseJsonString(input)];
  const visited = new Set<unknown>();

  while (queue.length > 0) {
    const current = parseJsonString(queue.shift());
    if (current === undefined || current === null) continue;
    if (visited.has(current)) continue;

    if (typeof current === "object") visited.add(current);

    if (Array.isArray(current)) {
      const employees = current.filter(looksLikeEmployee) as ExternalEmployee[];
      if (employees.length > 0) return employees;
      for (const item of current) queue.push(item);
      continue;
    }

    if (!isObjectRecord(current)) continue;
    for (const value of Object.values(current)) {
      queue.push(value);
    }
  }

  return [];
}

export type TeamMember = {
  id: number;
  team_id: number;
  user_id: number;
  is_team_lead: boolean;
  max_open_tickets_cap: number | null;
  name: string;
  email: string;
};

export type RoutingRule = {
  id: number;
  organisation_id: number;
  name: string;
  is_active: boolean;
  conditions_json: string | null;
  actions_json: string | null;
  created_at?: string;
  updated_at?: string;
};

export type SlaPolicy = {
  id: number;
  organisation_id: number;
  name: string;
  tier: string;
  priority: string;
  first_response_mins: number;
  resolution_mins: number;
  warning_percent: number;
  is_active: boolean;
  metadata_json?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type SlaTier1BoundRow = {
  priority: string;
  min_first_response_mins: number;
  max_first_response_mins: number;
  min_resolution_mins: number;
  max_resolution_mins: number;
};

export type NotificationTemplate = {
  id: number;
  organisation_id: number;
  event_key: string;
  channel: string;
  template_name: string;
  subject: string | null;
  body: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type CannedResponse = {
  id: number;
  organisation_id: number;
  product_id: number | null;
  title: string;
  body: string;
  audience: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type CustomField = {
  id: number;
  organisation_id: number;
  product_id: number;
  label: string;
  field_key: string;
  field_type: string;
  is_required: boolean;
  visibility: string;
  options_json: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ApiToken = {
  id: number;
  organisation_id: number;
  token_name: string;
  token_masked: string;
  token_raw?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type Webhook = {
  id: number;
  organisation_id: number;
  webhook_name: string;
  endpoint: string;
  events_json: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type AdminAuditLog = {
  id: number;
  organisation_id: number;
  module: string;
  action: string;
  summary: string;
  actor_user_id: number | null;
  actor_role_name: string | null;
  created_at: string;
};

export type DashboardMyAssignedTickets = {
  available: boolean;
  assigned_count: number;
  warning_count: number;
  breached_count: number;
  message?: string;
};

export type DashboardMySlaRisk = {
  available: boolean;
  warning_count: number;
  breached_count: number;
  next_breach_eta_mins: number | null;
  message?: string;
};

export type DashboardTeamQueueLoad = {
  available: boolean;
  total_queues: number;
  by_product: Array<{ product_name: string; queue_count: number }>;
};

export function listOrganisations() {
  return http<ApiResponse<Organisation[]>>("/admin/organisations").then((r) => r.data);
}

export function createOrganisation(body: {
  name: string;
  support_email?: string | null;
  timezone?: string | null;
  logo_url?: string | null;
  portal_subdomain?: string | null;
}) {
  return http<ApiResponse<Organisation>>("/admin/organisations", {
    method: "POST",
    body: JSON.stringify(body),
  }).then((r) => r.data);
}

export function getOrganisation(orgId: number) {
  const key = `org:${orgId}:profile`;
  return getWithCache(key, () =>
    http<ApiResponse<Organisation>>(`/admin/organisations/${orgId}`).then((r) => r.data)
  );
}

export function updateOrganisation(
  orgId: number,
  patch: Partial<Pick<Organisation, "name" | "support_email" | "timezone" | "logo_url" | "portal_subdomain">>
) {
  return http<ApiResponse<Organisation>>(`/admin/organisations/${orgId}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  }).then((r) => {
    invalidateByPrefix(`org:${orgId}:`);
    return r.data;
  });
}

export function getOrganisationSettings(orgId: number) {
  const key = `org:${orgId}:settings`;
  return getWithCache(key, () =>
    http<ApiResponse<OrganisationSettings | null>>(`/admin/organisations/${orgId}/settings`).then(
      (r) => r.data
    )
  );
}

export function updateOrganisationSettings(
  orgId: number,
  patch: Partial<Pick<OrganisationSettings, "business_hours_definition" | "holiday_calendar" | "ticket_retention_months" | "is_ngo">>
) {
  return http<ApiResponse<OrganisationSettings>>(`/admin/organisations/${orgId}/settings`, {
    method: "PUT",
    body: JSON.stringify(patch),
  }).then((r) => {
    invalidateByPrefix(`org:${orgId}:`);
    return r.data;
  });
}

export function getOrganisationRetention(orgId: number) {
  const key = `org:${orgId}:retention`;
  return getWithCache(key, () =>
    http<ApiResponse<DataRetentionPolicy | null>>(`/admin/organisations/${orgId}/retention`).then(
      (r) => r.data
    )
  );
}

export function updateOrganisationRetention(
  orgId: number,
  patch: Partial<Pick<DataRetentionPolicy, "closed_ticket_retention_months" | "audit_log_retention_months" | "pii_masking_rules">>
) {
  return http<ApiResponse<DataRetentionPolicy>>(`/admin/organisations/${orgId}/retention`, {
    method: "PUT",
    body: JSON.stringify(patch),
  }).then((r) => {
    invalidateByPrefix(`org:${orgId}:`);
    return r.data;
  });
}

export function listProducts() {
  return http<ApiResponse<Product[]>>("/admin/products").then((r) => r.data);
}

export function getOrganisationProducts(orgId: number) {
  return http<ApiResponse<OrganisationProduct[]>>(`/admin/organisations/${orgId}/products`).then((r) => r.data);
}

export function setOrganisationProduct(
  orgId: number,
  productId: number,
  patch: {
    enabled: boolean;
    default_routing_queue_id: number | null;
  }
) {
  return http<ApiResponse<OrganisationProduct>>(`/admin/organisations/${orgId}/products/${productId}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  }).then((r) => r.data);
}

export function listProductCategoriesTree(orgId: number, productId: number) {
  return http<ApiResponse<ProductCategoryTree[]>>(
    `/admin/organisations/${orgId}/products/${productId}/categories`
  ).then((r) => r.data);
}

export function createProductCategory(orgId: number, productId: number, payload: { name: string; sort_order?: number }) {
  return http<ApiResponse<ProductCategoryTree>>(`/admin/organisations/${orgId}/products/${productId}/categories`, {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((r) => r.data);
}

export function updateProductCategory(
  categoryId: number,
  orgId: number,
  payload: Partial<{ name: string; sort_order: number; is_active: boolean }>
) {
  const qp = new URLSearchParams({ organisation_id: String(orgId) });
  return http<ApiResponse<Omit<ProductCategoryTree, "subcategories">>>(`/admin/product-categories/${categoryId}?${qp}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }).then((r) => r.data);
}

export function deleteProductCategory(categoryId: number, orgId: number) {
  const qp = new URLSearchParams({ organisation_id: String(orgId) });
  return http<ApiResponse<{ id: number }>>(`/admin/product-categories/${categoryId}?${qp}`, {
    method: "DELETE",
  }).then((r) => r.data);
}

export function createProductSubcategory(
  categoryId: number,
  orgId: number,
  payload: { name: string; sort_order?: number }
) {
  const qp = new URLSearchParams({ organisation_id: String(orgId) });
  return http<ApiResponse<ProductSubcategory>>(`/admin/product-categories/${categoryId}/subcategories?${qp}`, {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((r) => r.data);
}

export function updateProductSubcategory(
  subcategoryId: number,
  orgId: number,
  payload: Partial<{ name: string; sort_order: number; is_active: boolean }>
) {
  const qp = new URLSearchParams({ organisation_id: String(orgId) });
  return http<ApiResponse<ProductSubcategory>>(`/admin/product-subcategories/${subcategoryId}?${qp}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }).then((r) => r.data);
}

export function deleteProductSubcategory(subcategoryId: number, orgId: number) {
  const qp = new URLSearchParams({ organisation_id: String(orgId) });
  return http<ApiResponse<{ id: number }>>(`/admin/product-subcategories/${subcategoryId}?${qp}`, {
    method: "DELETE",
  }).then((r) => r.data);
}

export function listQueues(orgId?: number, productId?: number | null) {
  const qp = new URLSearchParams();
  if (orgId !== undefined && orgId !== null) qp.set("organisation_id", String(orgId));
  if (productId !== undefined && productId !== null) qp.set("product_id", String(productId));
  const url = qp.toString() ? `/admin/queues?${qp.toString()}` : "/admin/queues";
  return http<ApiResponse<Queue[]>>(url).then((r) => r.data);
}

export type QueueOpenTicketCountRow = { queue_id: number; waiting_count: number };

export function getQueueOpenTicketCounts(organisationId: number) {
  const qp = new URLSearchParams({ organisation_id: String(organisationId) });
  return http<ApiResponse<QueueOpenTicketCountRow[]>>(`/admin/queues/open-ticket-counts?${qp}`).then((r) => r.data);
}

export function listTeams(orgId?: number) {
  const qp = new URLSearchParams();
  if (orgId !== undefined && orgId !== null) qp.set("organisation_id", String(orgId));
  const url = qp.toString() ? `/admin/teams?${qp.toString()}` : "/admin/teams";
  return http<ApiResponse<Team[]>>(url).then((r) => r.data);
}

export function createTeam(payload: {
  organisation_id: number;
  product_id: number | null;
  name: string;
  create_for_all_organisations?: boolean;
}) {
  return http<ApiResponse<Team | Team[]>>("/admin/teams", {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((r) => r.data);
}

export function deleteTeam(id: number) {
  return http<ApiResponse<{ id: number }>>(`/admin/teams/${id}`, {
    method: "DELETE",
  }).then((r) => r.data);
}

export function listUsers(orgId: number) {
  const qp = new URLSearchParams({ organisation_id: String(orgId) });
  return http<ApiResponse<User[]>>(`/admin/users?${qp.toString()}`).then((r) => r.data);
}

/** Invited agents for a customer org (`user_scope_org` + `users`, including HQ-stored Ezii users). */
export function listInvitedAgentUsers(organisationId: number) {
  return http<ApiResponse<User[]>>(`/admin/organisations/${organisationId}/invited-agent-users`).then(
    (r) => r.data
  );
}

export function createUser(payload: {
  user_id: number;
  organisation_id: number;
  name: string;
  email: string;
  phone: string | null;
  user_type: string | null;
  status: string;
}) {
  return http<ApiResponse<User>>("/admin/users", {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((r) => r.data);
}

export function updateUser(
  userId: number,
  patch: Partial<Pick<User, "name" | "email" | "phone" | "user_type" | "status" | "out_of_office" | "ooo_start_date" | "ooo_end_date">>
) {
  return http<ApiResponse<User>>(`/admin/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  }).then((r) => r.data);
}

export function listRoles(organisationId?: number) {
  const qp = new URLSearchParams();
  if (organisationId) qp.set("organisation_id", String(organisationId));
  const url = qp.toString() ? `/admin/roles?${qp.toString()}` : "/admin/roles";
  return http<ApiResponse<Role[]>>(url).then((r) => r.data);
}

export function createRole(payload: {
  name: string;
  organisation_id?: number;
  description?: string | null;
  permissions_json?: Record<string, unknown>;
  apply_role_to?: ApplyRoleTo;
  apply_attribute_id?: string | null;
  apply_sub_attribute_id?: string | null;
  apply_worker_type_id?: string | null;
}) {
  return http<ApiResponse<Role>>("/admin/roles", {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((r) => r.data);
}

export function listOrgSupportLevels(organisationId?: number) {
  const qp = new URLSearchParams();
  if (organisationId) qp.set("organisation_id", String(organisationId));
  const url = qp.toString() ? `/admin/org-support-levels?${qp.toString()}` : "/admin/org-support-levels";
  return http<ApiResponse<OrgSupportLevel[]>>(url).then((r) => r.data);
}

/** @deprecated Use listOrgSupportLevels */
export const listDesignations = listOrgSupportLevels;

export function createOrgSupportLevel(payload: {
  code: string;
  name: string;
  organisation_id?: number;
  description?: string | null;
}) {
  return http<ApiResponse<OrgSupportLevel>>("/admin/org-support-levels", {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((r) => r.data);
}

/** @deprecated Use createOrgSupportLevel */
export const createDesignation = createOrgSupportLevel;

export function updateOrgSupportLevel(
  id: number,
  payload: {
    code?: string;
    name?: string;
    description?: string | null;
  }
) {
  return http<ApiResponse<OrgSupportLevel>>(`/admin/org-support-levels/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }).then((r) => r.data);
}

export const updateDesignation = updateOrgSupportLevel;

export function deleteOrgSupportLevel(id: number) {
  return http<ApiResponse<{ id: number }>>(`/admin/org-support-levels/${id}`, {
    method: "DELETE",
  }).then((r) => r.data);
}

export const deleteDesignation = deleteOrgSupportLevel;

export function updateRole(
  id: number,
  payload: {
    name?: string;
    description?: string | null;
    permissions_json?: Record<string, unknown>;
    apply_role_to?: ApplyRoleTo;
    apply_attribute_id?: string | null;
    apply_sub_attribute_id?: string | null;
    apply_worker_type_id?: string | null;
  }
) {
  return http<ApiResponse<Role>>(`/admin/roles/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }).then((r) => r.data);
}

export function listRoleScopedUsers(roleId: number, organisationId?: number) {
  const qp = new URLSearchParams();
  if (organisationId != null) qp.set("organisation_id", String(organisationId));
  return http<ApiResponse<RoleScopedUser[]> & { meta?: { mode?: string; total?: number } }>(
    `/admin/roles/${roleId}/scoped-users${qp.toString() ? `?${qp.toString()}` : ""}`
  ).then((r) => ({ users: r.data, meta: r.meta ?? null }));
}

export function deleteRole(id: number) {
  return http<ApiResponse<{ id: number }>>(`/admin/roles/${id}`, {
    method: "DELETE",
  }).then((r) => r.data);
}

export function setUserRoles(userId: number, roleIds: number[], scopeOrganisationId?: number | null) {
  return http<ApiResponse<UserRole[]>>(`/admin/users/${userId}/roles`, {
    method: "PUT",
    body: JSON.stringify({
      role_ids: roleIds,
      ...(scopeOrganisationId ? { scope_organisation_id: scopeOrganisationId } : {}),
    }),
  }).then((r) => r.data);
}

export function listUserRoles(userId: number) {
  return http<ApiResponse<UserRole[]>>(`/admin/users/${userId}/roles`).then((r) => r.data);
}

export function getUserOrgSupportLevel(userId: number, organisationId?: number) {
  const qp = new URLSearchParams();
  if (organisationId) qp.set("organisation_id", String(organisationId));
  const url = qp.toString()
    ? `/admin/users/${userId}/org-support-level?${qp.toString()}`
    : `/admin/users/${userId}/org-support-level`;
  return http<ApiResponse<UserOrgSupportLevel | null>>(url).then((r) => r.data);
}

/** @deprecated Use getUserOrgSupportLevel */
export const getUserDesignation = getUserOrgSupportLevel;

export function setUserOrgSupportLevel(
  userId: number,
  payload: {
    support_level_id: number | null;
    organisation_id?: number;
    effective_from?: string | null;
    effective_to?: string | null;
    /** @deprecated */
    designation_id?: number | null;
  }
) {
  const body = {
    ...payload,
    support_level_id: payload.support_level_id ?? payload.designation_id ?? null,
  };
  return http<ApiResponse<UserOrgSupportLevel | null>>(`/admin/users/${userId}/org-support-level`, {
    method: "PUT",
    body: JSON.stringify(body),
  }).then((r) => r.data);
}

/** @deprecated Use setUserOrgSupportLevel */
export const setUserDesignation = setUserOrgSupportLevel;

export function listUserPermissionOverrides(userId: number, organisationId?: number) {
  const qp = new URLSearchParams();
  if (organisationId) qp.set("organisation_id", String(organisationId));
  const url = qp.toString()
    ? `/admin/users/${userId}/permission-overrides?${qp.toString()}`
    : `/admin/users/${userId}/permission-overrides`;
  return http<ApiResponse<UserPermissionOverride[]>>(url).then((r) => r.data);
}

export function setUserPermissionOverrides(
  userId: number,
  payload: {
    organisation_id?: number;
    overrides: Array<{
      permission_key: string;
      effect: "allow" | "deny";
      reason?: string | null;
      expires_at?: string | null;
    }>;
  }
) {
  return http<ApiResponse<UserPermissionOverride[]>>(`/admin/users/${userId}/permission-overrides`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }).then((r) => r.data);
}

/** Proxied via Ezii ticket server to EXTERNAL_API_URL (Bearer forwarded). */
export function getExternalOrgWorkerTypes() {
  return http<ApiResponse<Record<string, unknown>>>("/admin/org-external/worker-types").then((r) => r.data);
}

export function getExternalOrgAttributes() {
  return http<ApiResponse<Record<string, unknown>>>("/admin/org-external/attributes").then((r) => r.data);
}

export function getExternalOrgAttributeSubAttributes(attributeId: string) {
  return http<ApiResponse<Record<string, unknown>>>(
    `/admin/org-external/attributes/${encodeURIComponent(attributeId)}/sub-attributes`
  ).then((r) => r.data);
}

export function syncUsersFromWorkerMaster(payload?: { orgId: number }) {
  const orgId = payload?.orgId ?? 1;
  return http<ApiResponse<{ upserted: number; scanned: number }>>("/admin/users/sync", {
    method: "POST",
    body: JSON.stringify({ orgId }),
  }).then((r) => r.data);
}

export function listUserScopeOrg(scopeOrgId?: number, userId?: number) {
  const qp = new URLSearchParams();
  if (scopeOrgId) qp.set("scope_org_id", String(scopeOrgId));
  if (userId) qp.set("user_id", String(userId));
  const url = qp.toString() ? `/admin/user-scope-org?${qp.toString()}` : "/admin/user-scope-org";
  return http<ApiResponse<UserScopeOrg[]>>(url).then((r) => r.data);
}

export function removeUserScopeOrg(userId: number, scopeOrgId: number) {
  return http<ApiResponse<{ deleted_user_roles: number; deleted_user_scope_org: number }>>(
    `/admin/users/${userId}/scope-org/${scopeOrgId}`,
    {
      method: "DELETE",
    }
  ).then((r) => r.data);
}

export type OrgDirectoryUser = {
  user_id: number;
  name: string;
  email: string;
  status: string;
  ticket_role: string;
  ticket_role_id: number | null;
  provisioned: boolean;
  /** Department from worker `type_id_1` when available. */
  department?: string | null;
  /** From `user_scope_org`; invited Ezii users use `origin_org_id === 1` with `scope_org_id` set. */
  origin_org_id?: number | null;
  scope_org_id?: number | null;
};

export type OrganisationUserDirectoryResult = {
  users: OrgDirectoryUser[];
  /** True when `users.organisation_id` already has rows for this org (client-worker-master not used for listing). */
  has_local_users: boolean;
};

export function listOrganisationUserDirectory(organisationId: number, includeUnprovisioned = true) {
  const qp = new URLSearchParams();
  if (!includeUnprovisioned) qp.set("include_unprovisioned", "false");
  const qs = qp.toString();
  return http<ApiResponse<OrgDirectoryUser[]> & { has_local_users?: boolean }>(
    `/admin/organisations/${organisationId}/user-directory${qs ? `?${qs}` : ""}`
  ).then((r) => ({
    users: r.data,
    has_local_users: Boolean(r.has_local_users),
  }));
}

export function provisionCustomerOrgUsersFromWorker(organisationId: number) {
  return http<
    ApiResponse<{ provisioned: number; scanned: number; matched: number; usedFallback: boolean }>
  >(`/admin/organisations/${organisationId}/provision-customer-users`, {
    method: "POST",
    body: JSON.stringify({}),
  }).then((r) => r.data);
}

export async function getExternalOrganizations() {
  const baseUrl = getExternalBaseUrl();
  const data = await getWithCache(`external:org-list:${baseUrl}`, () =>
    externalGet<{
      result: string;
      statuscode: number;
      message: string;
      client_data: ExternalOrganization[];
    }>(`${baseUrl}/organization/client-organizations`)
  );
  return [...(data.client_data ?? [])].sort((a, b) =>
    (a.organization_name ?? "").localeCompare(b.organization_name ?? "", undefined, {
      sensitivity: "base",
    })
  );
}

export async function getExternalUserProfile() {
  const baseUrl = getExternalBaseUrl();
  const token = getJwtToken() ?? "no-token";
  const data = await getWithCache(`external:user-profile:${baseUrl}:${token}`, () =>
    externalGet<{
      result: string;
      statuscode: number;
      message: string;
      data: ExternalUserProfile;
    }>(`${baseUrl}/organization/user-profile`)
  );
  return data.data;
}

export async function getExternalEmployees() {
  const baseUrl = getExternalBaseUrl();
  const token = getJwtToken() ?? "no-token";
  const cacheKey = `external:worker-master:${baseUrl}:${token}`;

  const data = await getWithCache(cacheKey, () =>
    externalPost<unknown>(`${baseUrl}/reports/worker-master`, {
      userBlocks: [],
      userWise: 0,
      workerType: 0,
      attribute: 0,
      subAttributeId: 0,
    })
  );

  return collectEmployeeArrays(data);
}

export type ExternalReportee = {
  user_id: number;
  empnumber?: string;
  empname?: string;
  email?: string;
};

export async function getExternalReportingManagerReportees(userId: number) {
  const baseUrl = getExternalBaseUrl();
  const token = getJwtToken() ?? "no-token";
  const cacheKey = `external:reportees:${baseUrl}:${token}:${userId}`;
  const data = await getWithCache(cacheKey, () =>
    externalGet<{
      result: string;
      statuscode: number;
      message: string;
      data?: ExternalReportee[];
    }>(`${baseUrl}/organization/reporting-manager/${encodeURIComponent(String(userId))}/reportees`)
  );
  return data.data ?? [];
}

export function listTeamMembers(teamId: number) {
  return http<ApiResponse<TeamMember[]>>(`/admin/teams/${teamId}/members`).then((r) => r.data);
}

/** Per-assignee ticket counts and CSAT (from `tickets.metadata_json.csat_score` on resolved/closed). */
export type AgentTicketMetricsRow = {
  user_id: number;
  open_count: number;
  open_by_product?: Array<{
    product_name: string;
    open_count: number;
  }>;
  csat_avg: number | null;
  csat_rated_count: number;
};

export function getAgentsTicketMetrics(organisationId: number) {
  const q = new URLSearchParams({ organisation_id: String(organisationId) });
  return http<ApiResponse<AgentTicketMetricsRow[]>>(`/admin/agents/ticket-metrics?${q}`).then((r) => r.data);
}

/** Result of POST `/admin/organisations/:id/attendance-ooo-sync` (leave → `users` OOO + date range). */
export type AttendanceOooSyncSummary = {
  ok: boolean;
  organisationId: number;
  start_date: string;
  end_date: string;
  rowsFromApi: number;
  updatedTrue: number;
  updatedFalse: number;
  unresolvedRows: number;
  users_with_leave: number;
  error?: string;
};

/** Calls external leave `attendance-sync` via server; updates `out_of_office` and `ooo_*` date range. */
export function syncAttendanceOooFromLeave(
  organisationId: number,
  range?: { startDate: string; endDate: string }
) {
  const q = new URLSearchParams();
  if (range?.startDate?.trim()) q.set("startDate", range.startDate.trim());
  if (range?.endDate?.trim()) q.set("endDate", range.endDate.trim());
  const qs = q.toString() ? `?${q}` : "";
  return http<ApiResponse<AttendanceOooSyncSummary>>(
    `/admin/organisations/${organisationId}/attendance-ooo-sync${qs}`,
    { method: "POST" }
  ).then((r) => r.data);
}

export function setTeamMembers(
  teamId: number,
  members: { user_id: number; is_team_lead?: boolean; max_open_tickets_cap?: number | null }[]
) {
  return http<ApiResponse<TeamMember[]>>(`/admin/teams/${teamId}/members`, {
    method: "PUT",
    body: JSON.stringify({ members }),
  }).then((r) => r.data);
}

export function getDashboardMyAssignedTickets() {
  return http<ApiResponse<DashboardMyAssignedTickets>>("/admin/dashboard/my-assigned-tickets").then((r) => r.data);
}

export function getDashboardMySlaRisk() {
  return http<ApiResponse<DashboardMySlaRisk>>("/admin/dashboard/my-sla-risk").then((r) => r.data);
}

export function getDashboardTeamQueueLoad() {
  return http<ApiResponse<DashboardTeamQueueLoad>>("/admin/dashboard/team-queue-load").then((r) => r.data);
}

/** Cross-organisation ticket list (Ezii System Admin only). */
export type SystemTicketRow = {
  id: number;
  ticket_code: string;
  organisation_id: number;
  organisation_name: string;
  subject: string;
  status: string;
  priority: "P1" | "P2" | "P3" | "P4";
  product_id: number;
  product_name: string;
  first_response_due_at: string | null;
  resolution_due_at: string | null;
  next_sla_deadline_at: string | null;
  updated_at: string;
};

export type SystemTicketsPayload = {
  total: number;
  kpis: {
    total_active: number;
    p1_critical: number;
    sla_at_risk: number;
    avg_resolution_hours: number;
  };
  rows: SystemTicketRow[];
};

/** System-admin: per-tenant ticket counts and resolution SLA attainment from live ticket data. */
export type OrganisationTicketMetricsPayload = {
  by_org: Record<string, { open_tickets: number; sla_attainment_pct: number | null }>;
  global: { open_tickets: number; sla_attainment_pct: number | null };
};

export function getSystemOrganisationTicketMetrics() {
  return http<ApiResponse<OrganisationTicketMetricsPayload>>(
    "/admin/system/organisations/ticket-metrics"
  ).then((r) => r.data);
}

export type SystemTicketFilterOptions = {
  organisations: { id: number; name: string }[];
  products: { id: number; name: string }[];
};

export function getSystemTicketFilterOptions() {
  return http<ApiResponse<SystemTicketFilterOptions>>("/admin/system/tickets/filter-options").then((r) => r.data);
}

export function listSystemTickets(params?: {
  limit?: number;
  offset?: number;
  status?: string;
  q?: string;
  /** Comma-separated on the wire; use arrays here */
  organisation_ids?: number[];
  product_ids?: number[];
  priorities?: string[];
  sla_statuses?: ("breached" | "at_risk" | "on_track" | "no_deadline")[];
}) {
  const qp = new URLSearchParams();
  if (params?.limit != null) qp.set("limit", String(params.limit));
  if (params?.offset != null) qp.set("offset", String(params.offset));
  if (params?.status) qp.set("status", params.status);
  if (params?.q) qp.set("q", params.q);
  if (params?.organisation_ids?.length) qp.set("organisation_ids", params.organisation_ids.join(","));
  if (params?.product_ids?.length) qp.set("product_ids", params.product_ids.join(","));
  if (params?.priorities?.length) qp.set("priorities", params.priorities.join(","));
  if (params?.sla_statuses?.length) qp.set("sla", params.sla_statuses.join(","));
  const q = qp.toString();
  return http<ApiResponse<SystemTicketsPayload>>(`/admin/system/tickets${q ? `?${q}` : ""}`).then((r) => r.data);
}

export function createQueue(payload: {
  organisation_id: number;
  product_id: number | null;
  team_id: number | null;
  name: string;
  create_for_all_organisations?: boolean;
}) {
  return http<ApiResponse<Queue | Queue[]>>("/admin/queues", {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((r) => r.data);
}

export function updateQueue(
  id: number,
  payload: Partial<Pick<Queue, "name" | "product_id" | "team_id">>
) {
  return http<ApiResponse<Queue>>(`/admin/queues/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }).then((r) => r.data);
}

export function deleteQueue(id: number) {
  return http<ApiResponse<{ id: number }>>(`/admin/queues/${id}`, {
    method: "DELETE",
  }).then((r) => r.data);
}

export type KeywordRoutingEntry = {
  id: number;
  organisation_id: number;
  product_id: number;
  product_name: string | null;
  product_code: string | null;
  phrase: string;
  phrase_normalized: string;
  is_active: boolean;
  is_system_default: boolean;
  created_at: string;
  updated_at: string;
};

export function listKeywordRouting(organisationId: number) {
  const qp = new URLSearchParams({ organisation_id: String(organisationId) });
  return http<ApiResponse<KeywordRoutingEntry[]>>(`/admin/keyword-routing?${qp.toString()}`).then((r) => r.data);
}

export function createKeywordRouting(payload: {
  organisation_id: number;
  product_id: number;
  phrase: string;
}) {
  return http<ApiResponse<KeywordRoutingEntry>>("/admin/keyword-routing", {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((r) => r.data);
}

export function updateKeywordRouting(
  id: number,
  payload: Partial<Pick<KeywordRoutingEntry, "phrase" | "is_active">>
) {
  return http<ApiResponse<KeywordRoutingEntry>>(`/admin/keyword-routing/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }).then((r) => r.data);
}

export function deleteKeywordRouting(id: number) {
  return http<ApiResponse<{ id: number }>>(`/admin/keyword-routing/${id}`, {
    method: "DELETE",
  }).then((r) => r.data);
}

export function listRoutingRules(orgId: number, options?: { includeGlobal?: boolean }) {
  const qp = new URLSearchParams({ organisation_id: String(orgId) });
  if (options?.includeGlobal !== undefined) {
    qp.set("include_global", options.includeGlobal ? "true" : "false");
  }
  return http<ApiResponse<RoutingRule[]>>(`/admin/routing-rules?${qp.toString()}`).then((r) => r.data);
}

export function createRoutingRule(payload: {
  organisation_id: number;
  name: string;
  is_active: boolean;
  conditions_json: string | null;
  actions_json: string | null;
}) {
  return http<ApiResponse<RoutingRule>>("/admin/routing-rules", {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((r) => r.data);
}

export function updateRoutingRule(id: number, payload: Partial<Omit<RoutingRule, "id" | "organisation_id">>) {
  return http<ApiResponse<RoutingRule>>(`/admin/routing-rules/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }).then((r) => r.data);
}

export function deleteRoutingRule(id: number, options?: { scope?: "org" | "all" }) {
  const qp = new URLSearchParams();
  if (options?.scope) qp.set("scope", options.scope);
  const qs = qp.toString();
  return http<ApiResponse<{ id: number }>>(`/admin/routing-rules/${id}${qs ? `?${qs}` : ""}`, {
    method: "DELETE",
  }).then((r) => r.data);
}

export type SubcategoryPriorityMasterRow = {
  product_id: number;
  category_id: number;
  sub_category_id: number;
  priority: string;
};

export function listSubcategoryPriorityMaster(organisationId: number) {
  const qp = new URLSearchParams({ organisation_id: String(organisationId) });
  return http<ApiResponse<SubcategoryPriorityMasterRow[]>>(`/admin/priority-master?${qp.toString()}`).then(
    (r) => r.data
  );
}

export function upsertSubcategoryPriorityMaster(
  organisationId: number,
  items: Array<Pick<SubcategoryPriorityMasterRow, "product_id" | "category_id" | "sub_category_id" | "priority">>
) {
  return http<ApiResponse<{ updated: number }>>("/admin/priority-master", {
    method: "PUT",
    body: JSON.stringify({ organisation_id: organisationId, items }),
  }).then((r) => r.data);
}

export function listSlaPolicies(orgId: number) {
  const qp = new URLSearchParams({ organisation_id: String(orgId) });
  return http<ApiResponse<SlaPolicy[]>>(`/admin/sla-policies?${qp.toString()}`).then((r) => r.data);
}

export function listSlaTier1Bounds(organisationId: number) {
  return http<ApiResponse<SlaTier1BoundRow[]>>(`/admin/organisations/${organisationId}/sla-tier1-bounds`).then(
    (r) => r.data
  );
}

export function putSlaTier1Bounds(organisationId: number, bounds: SlaTier1BoundRow[]) {
  return http<ApiResponse<{ organisation_id: number }>>(`/admin/organisations/${organisationId}/sla-tier1-bounds`, {
    method: "PUT",
    body: JSON.stringify({ bounds }),
  }).then((r) => r.data);
}

export function createSlaPolicy(payload: {
  organisation_id: number;
  name: string;
  tier: string;
  priority: string;
  first_response_mins: number;
  resolution_mins: number;
  warning_percent: number;
  is_active: boolean;
  metadata_json?: string | null;
}) {
  return http<ApiResponse<SlaPolicy>>("/admin/sla-policies", {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((r) => r.data);
}

export function updateSlaPolicy(
  id: number,
  payload: Partial<Omit<SlaPolicy, "id" | "organisation_id">>
) {
  return http<ApiResponse<SlaPolicy>>(`/admin/sla-policies/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }).then((r) => r.data);
}

export function deleteSlaPolicy(id: number) {
  return http<ApiResponse<{ id: number }>>(`/admin/sla-policies/${id}`, {
    method: "DELETE",
  }).then((r) => r.data);
}

export function upsertSlaPoliciesBatch(
  organisationId: number,
  policies: Array<{
    tier: string;
    priority: string;
    name?: string;
    first_response_mins: number;
    resolution_mins: number;
    warning_percent?: number;
    is_active?: boolean;
    metadata_json?: string | Record<string, unknown> | null;
  }>
) {
  return http<ApiResponse<{ organisation_id: number; created: number; updated: number }>>(
    "/admin/sla-policies/batch",
    {
      method: "PUT",
      body: JSON.stringify({ organisation_id: organisationId, policies }),
    }
  ).then((r) => r.data);
}

export function listNotificationTemplates(orgId: number) {
  const qp = new URLSearchParams({ organisation_id: String(orgId) });
  return http<ApiResponse<NotificationTemplate[]>>(`/admin/notification-templates?${qp.toString()}`).then((r) => r.data);
}

export function createNotificationTemplate(payload: {
  organisation_id: number;
  event_key: string;
  channel: string;
  template_name: string;
  subject: string | null;
  body: string;
  is_active: boolean;
}) {
  return http<ApiResponse<NotificationTemplate>>("/admin/notification-templates", {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((r) => r.data);
}

export function updateNotificationTemplate(
  id: number,
  payload: Partial<Omit<NotificationTemplate, "id" | "organisation_id">>
) {
  return http<ApiResponse<NotificationTemplate>>(`/admin/notification-templates/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }).then((r) => r.data);
}

export function deleteNotificationTemplate(id: number) {
  return http<ApiResponse<{ id: number }>>(`/admin/notification-templates/${id}`, {
    method: "DELETE",
  }).then((r) => r.data);
}

/** Omit `orgId` (or pass null) to list all platform canned responses. */
export function listCannedResponses(orgId?: number | null) {
  if (typeof orgId === "number" && Number.isFinite(orgId)) {
    const qp = new URLSearchParams({ organisation_id: String(orgId) });
    return http<ApiResponse<CannedResponse[]>>(`/admin/canned-responses?${qp.toString()}`).then((r) => r.data);
  }
  return http<ApiResponse<CannedResponse[]>>("/admin/canned-responses").then((r) => r.data);
}

export function createCannedResponse(payload: {
  organisation_id: number;
  product_id: number | null;
  title: string;
  body: string;
  audience: string;
  is_active?: boolean;
}) {
  return http<ApiResponse<CannedResponse>>("/admin/canned-responses", {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((r) => r.data);
}

export function updateCannedResponse(id: number, payload: Partial<Omit<CannedResponse, "id" | "organisation_id">>) {
  return http<ApiResponse<CannedResponse>>(`/admin/canned-responses/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }).then((r) => r.data);
}

export function deleteCannedResponse(id: number) {
  return http<ApiResponse<{ id: number }>>(`/admin/canned-responses/${id}`, {
    method: "DELETE",
  }).then((r) => r.data);
}

export function listCustomFields(orgId?: number) {
  if (typeof orgId === "number" && Number.isFinite(orgId)) {
    const qp = new URLSearchParams({ organisation_id: String(orgId) });
    return http<ApiResponse<CustomField[]>>(`/admin/custom-fields?${qp.toString()}`).then((r) => r.data);
  }
  return http<ApiResponse<CustomField[]>>("/admin/custom-fields").then((r) => r.data);
}

export function createCustomField(payload: {
  organisation_id: number;
  product_id: number;
  label: string;
  field_key: string;
  field_type: string;
  is_required: boolean;
  visibility: string;
  options_json: string | null;
  is_active?: boolean;
}) {
  return http<ApiResponse<CustomField>>("/admin/custom-fields", {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((r) => r.data);
}

export function updateCustomField(id: number, payload: Partial<Omit<CustomField, "id" | "organisation_id" | "product_id" | "field_key">>) {
  return http<ApiResponse<CustomField>>(`/admin/custom-fields/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }).then((r) => r.data);
}

export function deleteCustomField(id: number) {
  return http<ApiResponse<{ id: number }>>(`/admin/custom-fields/${id}`, {
    method: "DELETE",
  }).then((r) => r.data);
}

export function listApiTokens(orgId: number) {
  const qp = new URLSearchParams({ organisation_id: String(orgId) });
  return http<ApiResponse<ApiToken[]>>(`/admin/api-tokens?${qp.toString()}`).then((r) => r.data);
}

export function createApiToken(payload: { organisation_id: number; token_name: string; is_active?: boolean }) {
  return http<ApiResponse<ApiToken>>("/admin/api-tokens", {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((r) => r.data);
}

export function updateApiToken(id: number, payload: { is_active: boolean }) {
  return http<ApiResponse<ApiToken>>(`/admin/api-tokens/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }).then((r) => r.data);
}

export function listWebhooks(orgId: number) {
  const qp = new URLSearchParams({ organisation_id: String(orgId) });
  return http<ApiResponse<Webhook[]>>(`/admin/webhooks?${qp.toString()}`).then((r) => r.data);
}

export function createWebhook(payload: {
  organisation_id: number;
  webhook_name: string;
  endpoint: string;
  events_json: string;
  is_active?: boolean;
}) {
  return http<ApiResponse<Webhook>>("/admin/webhooks", {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((r) => r.data);
}

export function updateWebhook(id: number, payload: Partial<Omit<Webhook, "id" | "organisation_id">>) {
  return http<ApiResponse<Webhook>>(`/admin/webhooks/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }).then((r) => r.data);
}

export function deleteWebhook(id: number) {
  return http<ApiResponse<{ id: number }>>(`/admin/webhooks/${id}`, {
    method: "DELETE",
  }).then((r) => r.data);
}

export function listAdminAuditLogs(
  orgOrOpts?: number | { organisation_id?: number; limit?: number }
) {
  const opts = typeof orgOrOpts === "number" ? { organisation_id: orgOrOpts } : orgOrOpts ?? {};
  const qp = new URLSearchParams();
  if (opts.organisation_id != null) qp.set("organisation_id", String(opts.organisation_id));
  if (opts.limit != null) qp.set("limit", String(opts.limit));
  const q = qp.toString();
  return http<ApiResponse<AdminAuditLog[]>>(`/admin/audit-logs${q ? `?${q}` : ""}`).then((r) => r.data);
}

