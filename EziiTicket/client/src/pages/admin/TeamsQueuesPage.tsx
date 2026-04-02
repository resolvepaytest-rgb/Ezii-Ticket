import { useEffect, useMemo, useState } from "react";
import { GlassCard } from "@components/common/GlassCard";
import { Loader } from "@components/common/Loader";
import { toast } from "sonner";
import { useAuthStore } from "@store/useAuthStore";
import { BarChart3, CalendarDays, Pencil, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";
import {
  createQueue,
  createTeam,
  deleteTeam,
  deleteQueue,
  getExternalOrganizations,
  getUserOrgSupportLevel,
  listUserScopeOrg,
  listProducts,
  listQueues,
  listTeams,
  listTeamMembers,
  listUserRoles,
  listUsers,
  updateQueue,
  setTeamMembers as setTeamMembersApi,
  type ExternalOrganization,
  type Product,
  type Queue,
  type Team,
  type User,
} from "@api/adminApi";

export function TeamsQueuesPage({ orgId }: { orgId: string }) {
  const ORG1_NAME = "Resolve Biz Services Pvt Ltd";
  const authUser = useAuthStore((s) => s.user);
  const orgIdNum = useMemo(() => {
    const n = Number(orgId);
    return Number.isFinite(n) ? n : null;
  }, [orgId]);
  const isSystemAdminUser =
    authUser?.role_name === "admin" &&
    authUser?.org_id === "1" &&
    authUser?.user_id === "1" &&
    authUser?.role_id === "1" &&
    authUser?.user_type_id === "1";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [editorUsers, setEditorUsers] = useState<User[]>([]);
  const [externalOrgs, setExternalOrgs] = useState<ExternalOrganization[]>([]);
  const [teamStatsById, setTeamStatsById] = useState<Record<number, { members: number; capacity: number }>>({});
  const [orgScopedUserCountByOrgId, setOrgScopedUserCountByOrgId] = useState<Record<number, number>>({});

  const [refreshTick, setRefreshTick] = useState(0);

  async function load() {
    if (!orgIdNum) return;
    setLoading(true);
    setError(null);
    try {
      let p: Product[] = [];
      let t: Team[] = [];
      let q: Queue[] = [];
      let filteredUsers: User[] = [];
      let activeSourceUserIds = new Set<number>();

      if (isSystemAdminUser) {
        const [productsRes, extOrgsRes, usersRes, allTeamsRes, allQueuesRes, allScopeRes] = await Promise.all([
          listProducts(),
          getExternalOrganizations().catch(() => [] as ExternalOrganization[]),
          listUsers(1),
          listTeams(),
          listQueues(),
          listUserScopeOrg(),
        ]);
        p = productsRes;
        setExternalOrgs(extOrgsRes);
        filteredUsers = usersRes;
        activeSourceUserIds = new Set(
          usersRes
            .filter((u) => (u.status ?? "").toLowerCase() === "active")
            .map((u) => Number(u.user_id))
        );
        t = allTeamsRes;
        q = allQueuesRes;

        const scopedCounts: Record<number, number> = {};
        const orgIdsFromData = new Set<number>();
        allQueuesRes.forEach((row) => orgIdsFromData.add(Number(row.organisation_id)));
        allTeamsRes.forEach((row) => orgIdsFromData.add(Number(row.organisation_id)));
        orgIdsFromData.forEach((id) => {
          if (id === 1) {
            scopedCounts[id] = activeSourceUserIds.size;
            return;
          }
          const uniqueScoped = new Set(
            allScopeRes
              .filter((s) => Number(s.scope_org_id) === id && s.is_active && activeSourceUserIds.has(Number(s.user_id)))
              .map((s) => Number(s.user_id))
          );
          scopedCounts[id] = uniqueScoped.size;
        });
        setOrgScopedUserCountByOrgId(scopedCounts);
      } else {
        const usersSourceOrgId = orgIdNum;
        const [productsRes, teamsRes, queuesRes, usersRes] = await Promise.all([
          listProducts(),
          listTeams(orgIdNum),
          listQueues(orgIdNum),
          listUsers(usersSourceOrgId),
        ]);
        p = productsRes;
        t = teamsRes;
        q = queuesRes;
        filteredUsers = usersRes;
        activeSourceUserIds = new Set(
          usersRes
            .filter((u) => (u.status ?? "").toLowerCase() === "active")
            .map((u) => Number(u.user_id))
        );
        setOrgScopedUserCountByOrgId({ [orgIdNum]: activeSourceUserIds.size });
      }

      const memberRows = await Promise.allSettled(t.map((team) => listTeamMembers(team.id)));
      const stats: Record<number, { members: number; capacity: number }> = {};
      memberRows.forEach((res, idx) => {
        const teamId = t[idx]?.id;
        if (!teamId) return;
        if (res.status !== "fulfilled") {
          stats[teamId] = { members: 0, capacity: 0 };
          return;
        }
        const members = res.value ?? [];
        const activeMembers = members.filter((m) => activeSourceUserIds.has(Number(m.user_id)));
        stats[teamId] = {
          members: activeMembers.length,
          capacity: activeMembers.reduce((sum, m) => sum + (m.max_open_tickets_cap ?? 0), 0),
        };
      });
      setProducts(p);
      setTeams(t);
      setQueues(q);
      setUsers(filteredUsers);
      setTeamStatsById(stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load teams/queues");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgIdNum, refreshTick, isSystemAdminUser]);

  useEffect(() => {
    if (!isSystemAdminUser) {
      setExternalOrgs([]);
      return;
    }
    let cancelled = false;
    void getExternalOrganizations()
      .then((rows) => {
        if (!cancelled) setExternalOrgs(rows);
      })
      .catch(() => {
        if (!cancelled) setExternalOrgs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isSystemAdminUser]);

  const productById = useMemo(() => {
    const m = new Map<number, Product>();
    for (const p of products) m.set(Number(p.id), p);
    return m;
  }, [products]);

  const teamById = useMemo(() => {
    const m = new Map<number, Team>();
    for (const t of teams) m.set(t.id, t);
    return m;
  }, [teams]);

  const [createTeamForm, setCreateTeamForm] = useState({
    organisation_id: orgId,
    name: "",
    product_ids: [] as string[],
    create_for_all_organisations: false,
  });
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [createTeamEligibleUsers, setCreateTeamEligibleUsers] = useState<User[]>([]);
  const [createTeamSelectedUserIds, setCreateTeamSelectedUserIds] = useState<number[]>([]);
  const [createTeamSupportLevelByUserId, setCreateTeamSupportLevelByUserId] = useState<Record<number, "L1" | "L2" | "L3">>({});
  const [createTeamScopedTicketRoleByUserId, setCreateTeamScopedTicketRoleByUserId] = useState<Record<number, string>>({});
  const [createTeamScopedRoleNameByUserId, setCreateTeamScopedRoleNameByUserId] = useState<Record<number, string>>({});
  const [loadingCreateTeamUsers, setLoadingCreateTeamUsers] = useState(false);
  const [createTeamUserSearch, setCreateTeamUserSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [queueFilter, setQueueFilter] = useState<{ orgId: string; productIds: string[] }>({
    orgId: "all",
    productIds: [],
  });

  const createTeamOrgIdNum = useMemo(() => {
    if (createTeamForm.create_for_all_organisations) return null;
    if (createTeamForm.organisation_id === "") return null;
    const n = Number(createTeamForm.organisation_id || orgId);
    return Number.isFinite(n) ? n : null;
  }, [createTeamForm.create_for_all_organisations, createTeamForm.organisation_id, orgId]);
  const skipCreateTeamUserSelection = createTeamForm.create_for_all_organisations;

  function getCreateTeamUserRoleLevel(user: User): "L1" | "L2" | "L3" | "TEAM_LEAD" | "OTHER" {
    const level = createTeamSupportLevelByUserId[Number(user.user_id)];
    if (level === "L1" || level === "L2" || level === "L3") return level;
    return "OTHER";
  }

  function getCreateTeamUserRoleLabel(user: User): string {
    const level = getCreateTeamUserRoleLevel(user);
    if (level === "TEAM_LEAD") return "Team Lead";
    if (level === "L1" || level === "L2" || level === "L3") return level;
    const assignedRole = `${createTeamScopedRoleNameByUserId[Number(user.user_id)] ?? createTeamScopedTicketRoleByUserId[Number(user.user_id)] ?? user.ticket_role ?? ""}`.trim();
    return assignedRole || "Customer";
  }

  async function getEligibleUsersForOrg(targetOrgId: number): Promise<User[]> {
    const normalizedOrgId = Number(targetOrgId);
    if (!Number.isFinite(normalizedOrgId)) return [];
    if (isSystemAdminUser && normalizedOrgId !== 1) {
      const [sourceUsers, scopedUsers] = await Promise.all([
        listUsers(1),
        listUserScopeOrg(normalizedOrgId),
      ]);
      const scopedIds = new Set(
        scopedUsers
          .filter((s) => s.is_active)
          .map((s) => Number(s.user_id))
      );
      return sourceUsers.filter((u) => scopedIds.has(Number(u.user_id)));
    }
    return listUsers(normalizedOrgId);
  }

  async function getCreateTeamSelectableUsersForOrg(targetOrgId: number): Promise<{
    users: User[];
    supportLevelByUserId: Record<number, "L1" | "L2" | "L3">;
    scopedTicketRoleByUserId: Record<number, string>;
    scopedRoleNameByUserId: Record<number, string>;
  }> {
    const normalizedOrgId = Number(targetOrgId);
    const [rows, scopeRows] = await Promise.all([
      getEligibleUsersForOrg(normalizedOrgId),
      listUserScopeOrg(normalizedOrgId).catch(() => []),
    ]);

    const ticketRoleByUserId = new Map<number, string>();
    scopeRows
      .filter((s) => Number(s.scope_org_id) === normalizedOrgId)
      .forEach((s) => {
        const uid = Number(s.user_id);
        if (!Number.isFinite(uid)) return;
        if (s.ticket_role && String(s.ticket_role).trim()) {
          ticketRoleByUserId.set(uid, String(s.ticket_role).trim());
        }
      });

    const withScopedTicketRole = rows.map((u) => ({
      ...u,
      ticket_role: ticketRoleByUserId.get(Number(u.user_id)) ?? u.ticket_role ?? null,
    }));

    const scopedTicketRoleByUserId: Record<number, string> = {};
    ticketRoleByUserId.forEach((role, uid) => {
      scopedTicketRoleByUserId[uid] = role;
    });
    const supportLevelByUserId: Record<number, "L1" | "L2" | "L3"> = {};
    const userSupportRows = await Promise.allSettled(
      withScopedTicketRole.map((u) => getUserOrgSupportLevel(Number(u.user_id), normalizedOrgId))
    );
    userSupportRows.forEach((res, idx) => {
      const uid = Number(withScopedTicketRole[idx]?.user_id);
      if (!Number.isFinite(uid) || res.status !== "fulfilled") return;
      const code = `${res.value?.support_level_code ?? res.value?.designation_code ?? ""}`.trim().toUpperCase();
      if (code === "L1" || code === "L2" || code === "L3") {
        supportLevelByUserId[uid] = code;
      }
    });
    const scopedRoleNameByUserId: Record<number, string> = {};
    const userRoleRows = await Promise.allSettled(
      withScopedTicketRole.map((u) => listUserRoles(Number(u.user_id)))
    );
    userRoleRows.forEach((res, idx) => {
      const uid = Number(withScopedTicketRole[idx]?.user_id);
      if (!Number.isFinite(uid) || res.status !== "fulfilled") return;
      const roles = res.value ?? [];
      const scoped = roles.find((r) => Number(r.scope_organisation_id) === normalizedOrgId);
      const global = roles.find((r) => r.scope_organisation_id == null);
      const roleName = `${scoped?.role_name ?? global?.role_name ?? ""}`.trim();
      if (roleName) scopedRoleNameByUserId[uid] = roleName;
    });

    if (normalizedOrgId === 1) {
      return {
        users: withScopedTicketRole.filter((u) => (u.status ?? "").toLowerCase() === "active"),
        supportLevelByUserId,
        scopedTicketRoleByUserId,
        scopedRoleNameByUserId,
      };
    }
    return { users: withScopedTicketRole, supportLevelByUserId, scopedTicketRoleByUserId, scopedRoleNameByUserId };
  }

  useEffect(() => {
    if (!createTeamOpen || skipCreateTeamUserSelection || !createTeamOrgIdNum) {
      setCreateTeamEligibleUsers([]);
      setCreateTeamSelectedUserIds([]);
      setCreateTeamSupportLevelByUserId({});
      setCreateTeamScopedTicketRoleByUserId({});
      setCreateTeamScopedRoleNameByUserId({});
      setLoadingCreateTeamUsers(false);
      return;
    }
    let cancelled = false;
    setLoadingCreateTeamUsers(true);
    void getCreateTeamSelectableUsersForOrg(createTeamOrgIdNum)
      .then(({ users: rows, supportLevelByUserId, scopedTicketRoleByUserId, scopedRoleNameByUserId }) => {
        if (cancelled) return;
        setCreateTeamEligibleUsers(rows);
        setCreateTeamSupportLevelByUserId(supportLevelByUserId);
        setCreateTeamScopedTicketRoleByUserId(scopedTicketRoleByUserId);
        setCreateTeamScopedRoleNameByUserId(scopedRoleNameByUserId);
      })
      .catch(() => {
        if (cancelled) return;
        setCreateTeamEligibleUsers([]);
        setCreateTeamSupportLevelByUserId({});
        setCreateTeamScopedTicketRoleByUserId({});
        setCreateTeamScopedRoleNameByUserId({});
      })
      .finally(() => {
        if (!cancelled) setLoadingCreateTeamUsers(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createTeamOpen, skipCreateTeamUserSelection, createTeamOrgIdNum, refreshTick]);

  async function handleCreateTeam() {
    const createOrgId = Number(createTeamForm.organisation_id || orgId);
    if (!Number.isFinite(createOrgId)) return;
    setCreatingTeam(true);
    try {
      if (!createTeamForm.name.trim()) throw new Error("Team name is required");
      const selectedProductIds = createTeamForm.product_ids
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id));
      if (selectedProductIds.length === 0) throw new Error("At least one product is required");
      if (!skipCreateTeamUserSelection) {
        if (createTeamSelectedUserIds.length < 3) {
          throw new Error("Assign Users is mandatory. Please select at least 3 users (L1, L2, and L3).");
        }
        const selectedIdSet = new Set(
          createTeamSelectedUserIds
            .map((id) => Number(id))
            .filter((id) => Number.isFinite(id))
        );
        const selectedUsers = createTeamEligibleUsers.filter((u) =>
          selectedIdSet.has(Number(u.user_id))
          
        );
        const hasL1 = selectedUsers.some((u) => getCreateTeamUserRoleLevel(u) === "L1");
        const hasL2 = selectedUsers.some((u) => getCreateTeamUserRoleLevel(u) === "L2");
        const hasL3 = selectedUsers.some((u) => getCreateTeamUserRoleLevel(u) === "L3");
        if (!hasL1 || !hasL2 || !hasL3) {
          throw new Error("Please select at least one user from each role level: L1, L2, and L3.");
        }
      }
      const createdTeams = await Promise.all(
        selectedProductIds.map((pid) =>
          createTeam({
            organisation_id: createOrgId,
            product_id: pid,
            name: createTeamForm.name.trim(),
            create_for_all_organisations: createTeamForm.create_for_all_organisations,
          }).then((created) => (Array.isArray(created) ? created[0] : created))
        )
      );
      if (!skipCreateTeamUserSelection && createTeamSelectedUserIds.length > 0) {
        const memberPayload = createTeamSelectedUserIds.map((user_id) => ({
          user_id: Number(user_id),
          is_team_lead: false,
          max_open_tickets_cap: null,
        }));
        await Promise.all(
          createdTeams
            .filter((team) => team?.id)
            .map((team) => setTeamMembersApi(team.id, memberPayload))
        );
      }
      setCreateTeamForm((f) => ({
        organisation_id: f.organisation_id || orgId,
        name: "",
        product_ids: [],
        create_for_all_organisations: false,
      }));
      setCreateTeamSelectedUserIds([]);
      setCreateTeamOpen(false);
      setRefreshTick((x) => x + 1);
      toast.success(
        createTeamForm.create_for_all_organisations
          ? selectedProductIds.length > 1
            ? "Teams created for all organizations."
            : "Team created for all organizations."
          : selectedProductIds.length > 1
            ? "Teams created."
            : "Team created."
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create team";
      setError(msg);
      toast.error(msg);
    } finally {
      setCreatingTeam(false);
    }
  }

  const [createQueueForm, setCreateQueueForm] = useState({
    organisation_id: orgId,
    name: "",
    product_id: "" as string,
    team_id: "" as string,
    create_for_all_organisations: false,
  });
  const [createQueueOpen, setCreateQueueOpen] = useState(false);
  const [creatingQueue, setCreatingQueue] = useState(false);
  const [editQueueOpen, setEditQueueOpen] = useState(false);
  const [updatingQueue, setUpdatingQueue] = useState(false);
  const [editingQueueId, setEditingQueueId] = useState<number | null>(null);
  const [editQueueForm, setEditQueueForm] = useState({
    organisation_id: orgId,
    name: "",
    product_id: "" as string,
    team_id: "" as string,
  });
  const [deletingQueueId, setDeletingQueueId] = useState<number | null>(null);
  const [queuePendingDelete, setQueuePendingDelete] = useState<Queue | null>(null);
  const [manageTeamsOpen, setManageTeamsOpen] = useState(false);
  const [deletingTeamId, setDeletingTeamId] = useState<number | null>(null);
  const [teamPendingDelete, setTeamPendingDelete] = useState<Team | null>(null);
  const [teamManagerFilter, setTeamManagerFilter] = useState<{ orgId: string; productId: string }>({
    orgId: "all",
    productId: "all",
  });

  async function handleCreateQueue() {
    const createOrgId = Number(createQueueForm.organisation_id || orgId);
    if (!Number.isFinite(createOrgId)) return;
    setCreatingQueue(true);
    try {
      if (!createQueueForm.name.trim()) throw new Error("Queue name is required");
      if (!createQueueForm.product_id) throw new Error("Product is required");
      await createQueue({
        organisation_id: createOrgId,
        product_id: Number(createQueueForm.product_id),
        team_id: createQueueForm.team_id ? Number(createQueueForm.team_id) : null,
        name: createQueueForm.name.trim(),
        create_for_all_organisations: createQueueForm.create_for_all_organisations,
      });
      setCreateQueueForm((f) => ({
        organisation_id: f.organisation_id || orgId,
        name: "",
        product_id: "",
        team_id: "",
        create_for_all_organisations: false,
      }));
      setCreateQueueOpen(false);
      setRefreshTick((x) => x + 1);
      toast.success(
        createQueueForm.create_for_all_organisations
          ? "Queue created for all organizations."
          : "Queue created."
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create queue";
      setError(msg);
      toast.error(msg);
    } finally {
      setCreatingQueue(false);
    }
  }

  async function handleDeleteQueue() {
    if (!queuePendingDelete) return;
    setDeletingQueueId(queuePendingDelete.id);
    try {
      await deleteQueue(queuePendingDelete.id);
      setRefreshTick((x) => x + 1);
      toast.success("Queue deleted.");
      setQueuePendingDelete(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to delete queue";
      setError(msg);
      toast.error(msg);
    } finally {
      setDeletingQueueId(null);
    }
  }

  function openEditQueueModal(queue: Queue) {
    setEditingQueueId(queue.id);
    setEditQueueForm({
      organisation_id: String(queue.organisation_id),
      name: queue.name ?? "",
      product_id: queue.product_id != null ? String(queue.product_id) : "",
      team_id: queue.team_id != null ? String(queue.team_id) : "",
    });
    setEditQueueOpen(true);
  }

  async function handleUpdateQueue() {
    if (!editingQueueId) return;
    setUpdatingQueue(true);
    try {
      if (!editQueueForm.name.trim()) throw new Error("Queue name is required");
      await updateQueue(editingQueueId, {
        name: editQueueForm.name.trim(),
        product_id: editQueueForm.product_id ? Number(editQueueForm.product_id) : null,
        team_id: editQueueForm.team_id ? Number(editQueueForm.team_id) : null,
      });
      setEditQueueOpen(false);
      setEditingQueueId(null);
      setRefreshTick((x) => x + 1);
      toast.success("Queue updated.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update queue";
      setError(msg);
      toast.error(msg);
    } finally {
      setUpdatingQueue(false);
    }
  }

  async function handleDeleteTeam() {
    if (!teamPendingDelete) return;
    setDeletingTeamId(teamPendingDelete.id);
    try {
      await deleteTeam(teamPendingDelete.id);
      if (editingTeamId === teamPendingDelete.id) setEditingTeamId(null);
      setRefreshTick((x) => x + 1);
      toast.success("Team deleted.");
      setTeamPendingDelete(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to delete team";
      setError(msg);
      toast.error(msg);
    } finally {
      setDeletingTeamId(null);
    }
  }

  const [editingTeamId, setEditingTeamId] = useState<number | null>(null);

  const [memberDraft, setMemberDraft] = useState<
    Record<number, { included: boolean; max_open_tickets_cap: number | null }>
  >({});

  const [savingMembers, setSavingMembers] = useState(false);
  const [manageTeamUserSearch, setManageTeamUserSearch] = useState("");

  async function openMemberEditor(teamId: number) {
    setEditingTeamId(teamId);
    setSavingMembers(false);
    const team = teamById.get(teamId) ?? null;
    const teamOrgId = team?.organisation_id ?? null;
    let eligibleUsers: User[] = users;
    if (teamOrgId) eligibleUsers = await getEligibleUsersForOrg(teamOrgId);
    const members = await listTeamMembers(teamId);
    const usersForEditor = [...eligibleUsers];
    // Ensure existing team members are visible even if not present in eligible list payload.
    members.forEach((m) => {
      const exists = usersForEditor.some((u) => Number(u.user_id) === Number(m.user_id));
      if (exists) return;
      usersForEditor.push({
        id: Number(m.user_id),
        user_id: Number(m.user_id),
        organisation_id: teamOrgId ?? 0,
        name: m.name,
        email: m.email,
        phone: null,
        user_type: null,
        status: "active",
      } satisfies User);
    });
    setEditorUsers(usersForEditor.filter((u) => (u.status ?? "").toLowerCase() === "active"));
    const nextDraft: typeof memberDraft = {};
    for (const u of usersForEditor) {
      const found = members.find((m) => Number(m.user_id) === Number(u.user_id));
      nextDraft[u.user_id] = {
        included: Boolean(found),
        max_open_tickets_cap: found?.max_open_tickets_cap ?? null,
      };
    }
    setMemberDraft(nextDraft);
  }

  useEffect(() => {
    if (!editingTeamId) return;
    void openMemberEditor(editingTeamId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingTeamId, users]);

  const editingTeam = editingTeamId ? teamById.get(editingTeamId) : null;

  function getMemberUserIdsIncluded() {
    return Object.entries(memberDraft)
      .filter(([, v]) => v.included)
      .map(([uid]) => Number(uid));
  }

  const teamCapacityDraftTotal = useMemo(
    () =>
      Object.values(memberDraft).reduce((sum, item) => {
        if (!item?.included) return sum;
        const cap = item.max_open_tickets_cap;
        if (typeof cap !== "number" || !Number.isFinite(cap) || cap <= 0) return sum;
        return sum + cap;
      }, 0),
    [memberDraft]
  );

  const teamMemberCountDraft = useMemo(
    () => Object.values(memberDraft).filter((item) => item?.included).length,
    [memberDraft]
  );

  async function handleSaveMembers() {
    if (!editingTeamId) return;
    setSavingMembers(true);
    try {
      const membersPayload = getMemberUserIdsIncluded().map((user_id) => ({
        user_id,
        is_team_lead: false,
        max_open_tickets_cap: memberDraft[user_id]?.max_open_tickets_cap ?? null,
      }));
      await setTeamMembersApi(editingTeamId, membersPayload);
      setRefreshTick((x) => x + 1);
      setEditingTeamId(null);
      toast.success("Team members updated.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save team members";
      setError(msg);
      toast.error(msg);
    } finally {
      setSavingMembers(false);
    }
  }

  const totalCapacity = Object.values(teamStatsById).reduce((sum, v) => sum + v.capacity, 0);
  const estimatedDemand = queues.length * 12;
  const globalLoadFactor = totalCapacity > 0 ? Math.min(100, Math.round((estimatedDemand / totalCapacity) * 100)) : 0;
  const activeAgents = users.filter((u) => (u.status ?? "").toLowerCase() === "active").length;
  const avgResolutionMins = 14;
  const filteredQueues = useMemo(() => {
    return queues.filter((q) => {
      const byOrg = queueFilter.orgId === "all" || String(q.organisation_id) === queueFilter.orgId;
      const byProduct =
        queueFilter.productIds.length === 0 || queueFilter.productIds.includes(String(q.product_id ?? ""));
      return byOrg && byProduct;
    });
  }, [queues, queueFilter]);
  const queueOrgOptions = useMemo(() => {
    const uniqueOrgIds = Array.from(new Set(queues.map((q) => Number(q.organisation_id)).filter((id) => Number.isFinite(id))));
    return uniqueOrgIds.map((id) => {
      const name =
        id === 1
          ? ORG1_NAME
          : externalOrgs.find((o) => Number(o.id) === id)?.organization_name ?? `Organization ${id}`;
      return { id: String(id), name };
    });
  }, [queues, externalOrgs]);
  const teamManagerOrgOptions = useMemo(() => {
    const uniqueOrgIds = Array.from(new Set(teams.map((t) => Number(t.organisation_id)).filter((id) => Number.isFinite(id))));
    return uniqueOrgIds.map((id) => ({
      id: String(id),
      name: id === 1 ? ORG1_NAME : externalOrgs.find((o) => Number(o.id) === id)?.organization_name ?? `Organization ${id}`,
    }));
  }, [teams, externalOrgs]);
  const teamManagerProductOptions = useMemo(() => {
    const ids = Array.from(new Set(
      teams
        .map((t) => (t.product_id != null ? Number(t.product_id) : null))
        .filter((id): id is number => id != null && Number.isFinite(id))
    ));
    return ids.sort((a, b) => {
      const na = productById.get(Number(a))?.name ?? "";
      const nb = productById.get(Number(b))?.name ?? "";
      return na.localeCompare(nb);
    });
  }, [teams, productById]);
  const filteredTeamsForManager = useMemo(() => {
    return teams.filter((t) => {
      const byOrg = teamManagerFilter.orgId === "all" || String(t.organisation_id) === teamManagerFilter.orgId;
      const byProduct =
        teamManagerFilter.productId === "all" ||
        String(t.product_id ?? "") === teamManagerFilter.productId;
      return byOrg && byProduct;
    });
  }, [teams, teamManagerFilter]);
  const visibleCreateTeamUsers = useMemo(() => {
    const q = createTeamUserSearch.trim().toLowerCase();
    const sorted = [...createTeamEligibleUsers].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    if (!q) return sorted;
    return sorted.filter((u) => (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q));
  }, [createTeamEligibleUsers, createTeamUserSearch]);
  const createTeamSelectedRoleCoverage = useMemo(() => {
    const selectedIdSet = new Set(
      createTeamSelectedUserIds
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id))
    );
    const selectedUsers = createTeamEligibleUsers.filter((u) =>
      selectedIdSet.has(Number(u.user_id))
    );
    return {
      L1: selectedUsers.filter((u) => createTeamSupportLevelByUserId[Number(u.user_id)] === "L1").length,
      L2: selectedUsers.filter((u) => createTeamSupportLevelByUserId[Number(u.user_id)] === "L2").length,
      L3: selectedUsers.filter((u) => createTeamSupportLevelByUserId[Number(u.user_id)] === "L3").length,
    };
  }, [createTeamEligibleUsers, createTeamSelectedUserIds, createTeamSupportLevelByUserId]);
  const canCreateTeam = useMemo(() => {
    const createOrgId = Number(createTeamForm.organisation_id || orgId);
    if (!Number.isFinite(createOrgId)) return false;
    if (!createTeamForm.name.trim()) return false;
    if (!createTeamForm.product_ids.length) return false;
    if (!skipCreateTeamUserSelection) {
      if (loadingCreateTeamUsers) return false;
      if (createTeamSelectedUserIds.length < 3) return false;
      if (
        createTeamSelectedRoleCoverage.L1 < 1 ||
        createTeamSelectedRoleCoverage.L2 < 1 ||
        createTeamSelectedRoleCoverage.L3 < 1
      ) {
        return false;
      }
    }
    return true;
  }, [
    createTeamForm.name,
    createTeamForm.organisation_id,
    createTeamForm.product_ids,
    createTeamSelectedRoleCoverage.L1,
    createTeamSelectedRoleCoverage.L2,
    createTeamSelectedRoleCoverage.L3,
    createTeamSelectedUserIds.length,
    loadingCreateTeamUsers,
    orgId,
    skipCreateTeamUserSelection,
  ]);
  const visibleEditorUsers = useMemo(() => {
    const q = manageTeamUserSearch.trim().toLowerCase();
    const sorted = [...editorUsers].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    if (!q) return sorted;
    return sorted.filter((u) => (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q));
  }, [editorUsers, manageTeamUserSearch]);
  const orgScopedQueues = useMemo(() => {
    if (!queueFilter.orgId || queueFilter.orgId === "all") return queues;
    return queues.filter((q) => String(q.organisation_id) === queueFilter.orgId);
  }, [queues, queueFilter.orgId]);
  const productOptionsForSelectedOrg = useMemo(() => {
    const source = orgScopedQueues;
    const set = new Set<number>();
    source.forEach((q) => {
      if (q.product_id != null) set.add(Number(q.product_id));
    });
    return Array.from(set.values());
  }, [orgScopedQueues]);

  const productFilterIdsSorted = useMemo(() => {
    return [...productOptionsForSelectedOrg].sort((a, b) => {
      const na = productById.get(Number(a))?.name ?? "";
      const nb = productById.get(Number(b))?.name ?? "";
      return na.localeCompare(nb);
    });
  }, [productOptionsForSelectedOrg, productById]);

  const createQueueOrgIdNum = useMemo(() => {
    if (createQueueForm.organisation_id === "") return null;
    const raw = createQueueForm.organisation_id || orgId;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [createQueueForm.organisation_id, orgId]);
  const canCreateQueue = useMemo(() => {
    const createOrgId = Number(createQueueForm.organisation_id || orgId);
    if (!Number.isFinite(createOrgId)) return false;
    if (!createQueueForm.name.trim()) return false;
    if (!createQueueForm.product_id) return false;
    return true;
  }, [createQueueForm.name, createQueueForm.organisation_id, createQueueForm.product_id, orgId]);

  const teamsForCreateQueueOrg = useMemo(() => {
    if (createQueueOrgIdNum == null) return [];
    return teams.filter((t) => Number(t.organisation_id) === createQueueOrgIdNum);
  }, [teams, createQueueOrgIdNum]);
  const globalTeamsForCreateQueue = useMemo(() => {
    const orgCount = new Set(teams.map((t) => Number(t.organisation_id))).size;
    if (orgCount <= 1) return teams;
    const bucket = new Map<string, Team[]>();
    teams.forEach((t) => {
      const key = `${(t.name ?? "").trim().toLowerCase()}::${t.product_id ?? "null"}`;
      const arr = bucket.get(key) ?? [];
      arr.push(t);
      bucket.set(key, arr);
    });
    const rows: Team[] = [];
    bucket.forEach((arr) => {
      const uniqueOrgCount = new Set(arr.map((t) => Number(t.organisation_id))).size;
      if (uniqueOrgCount < orgCount) return;
      const canonical = arr.find((t) => Number(t.organisation_id) === 1) ?? arr[0];
      if (canonical) rows.push(canonical);
    });
    return rows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [teams]);
  const availableTeamsForCreateQueue = useMemo(() => {
    const base = createQueueForm.create_for_all_organisations ? globalTeamsForCreateQueue : teamsForCreateQueueOrg;
    if (!createQueueForm.product_id) return [];
    const selectedProductId = Number(createQueueForm.product_id);
    if (!Number.isFinite(selectedProductId)) return [];
    return base.filter((t) => Number(t.product_id) === selectedProductId);
  }, [
    createQueueForm.create_for_all_organisations,
    createQueueForm.product_id,
    globalTeamsForCreateQueue,
    teamsForCreateQueueOrg,
  ]);
  const editQueueOrgIdNum = useMemo(() => {
    const n = Number(editQueueForm.organisation_id);
    return Number.isFinite(n) ? n : null;
  }, [editQueueForm.organisation_id]);
  const teamsForEditQueueOrg = useMemo(() => {
    if (editQueueOrgIdNum == null) return [];
    return teams.filter((t) => Number(t.organisation_id) === editQueueOrgIdNum);
  }, [teams, editQueueOrgIdNum]);
  const availableTeamsForEditQueue = useMemo(() => {
    if (!editQueueForm.product_id) return [];
    const selectedProductId = Number(editQueueForm.product_id);
    if (!Number.isFinite(selectedProductId)) return [];
    return teamsForEditQueueOrg.filter((t) => Number(t.product_id) === selectedProductId);
  }, [teamsForEditQueueOrg, editQueueForm.product_id]);

  return (
    <div className="mx-auto max-w-[1300px] space-y-4 pb-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#111827] dark:text-slate-100">Teams & Queues</h1>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            Functional grouping of agents and capacity management.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setManageTeamsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-white/15 dark:bg-white/10 dark:text-slate-200"
          >
            Manage All Teams
          </button>
          <button
            type="button"
            onClick={() => setCreateTeamOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E88E5] px-3 py-2 text-xs font-semibold text-white shadow-[0_6px_18px_rgba(30,136,229,0.35)]"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Team
          </button>
          <button
            type="button"
            onClick={() => setCreateQueueOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-white/15 dark:bg-white/10 dark:text-slate-200"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Queue
          </button>
        </div>
      </div>

      {loading ? (
        <GlassCard className="p-6">
          <Loader className="min-h-[60vh]" label="Loading..." size="sm" />
        </GlassCard>
      ) : null}

      {error ? (
        <GlassCard className="p-6">
          <div className="text-xs text-red-600 dark:text-red-300">{error}</div>
        </GlassCard>
      ) : null}

      {!loading && !error ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <GlassCard className="border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.06]">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Total Active Queues</div>
              <div className="mt-2 text-xl font-semibold text-[#111827] dark:text-slate-100">{queues.length}</div>
            </GlassCard>
            <GlassCard className="border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.06]">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Global Load Factor</div>
              <div className="mt-2 text-xl font-semibold text-[#111827] dark:text-slate-100">{globalLoadFactor}%</div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700">
                <div className="h-full rounded-full bg-[#1E88E5]" style={{ width: `${globalLoadFactor}%` }} />
              </div>
            </GlassCard>
            <GlassCard className="border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.06]">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Agents Online</div>
              <div className="mt-2 text-xl font-semibold text-[#111827] dark:text-slate-100">{activeAgents}</div>
              <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{users.length - activeAgents} away</div>
            </GlassCard>
            <GlassCard className="border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.06]">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Avg Resolution Time</div>
              <div className="mt-2 text-xl font-semibold text-[#111827] dark:text-slate-100">{avgResolutionMins}m</div>
              <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">last period baseline</div>
            </GlassCard>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold text-[#111827] dark:text-slate-100">Operational Queues</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFilterOpen(true)}
                    className="rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-slate-600 dark:border-white/15 dark:bg-white/10 dark:text-slate-300"
                  >
                    Filter
                  </button>
                  <button type="button" className="rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-slate-600 dark:border-white/15 dark:bg-white/10 dark:text-slate-300">Export Stats</button>
                </div>
              </div>
              <div className="space-y-3">
                {filteredQueues.length === 0 ? (
                  <GlassCard className="border-black/10 bg-white/65 p-4 text-xs text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
                    No queues configured yet.
                  </GlassCard>
                ) : null}
                {filteredQueues.map((q) => {
                  const team = q.team_id ? teamById.get(q.team_id) ?? null : null;
                  const teamStats = team ? teamStatsById[team.id] : null;
                  const orgName =
                    externalOrgs.find((o) => Number(o.id) === Number(q.organisation_id))?.organization_name ??
                    `Organization ${q.organisation_id}`;
                  const queueDemand = Math.max(8, Math.round((teamStats?.capacity ?? 0) * 0.7));
                  const status = teamStats && queueDemand > (teamStats.capacity || 0) ? "high" : "stable";
                  return (
                    <GlassCard key={q.id} className="border-black/10 bg-white/75 p-4 dark:border-white/10 dark:bg-white/[0.05]">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-[#111827] dark:text-slate-100">{q.name}</div>
                          <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                            {productById.get(Number(q.product_id ?? 0))?.name
                              ? `• ${productById.get(Number(q.product_id ?? 0))?.name}`
                              : ""}{" "}
                            {team?.name ? `• ${team.name}` : "• Unassigned Team"}{" "}
                            <span className="font-semibold text-[#1E88E5] dark:text-sky-300">{`• ${orgName}`}</span>
                          </div>
                        </div>
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${status === "high" ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" : "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300"}`}>
                          {status === "high" ? "HIGH LOAD" : "STABLE"}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="text-xs font-semibold text-[#111827] dark:text-slate-100">
                          Assigned Agents ({teamStats?.members ?? 0}/{orgScopedUserCountByOrgId[q.organisation_id] ?? users.filter((u) => (u.status ?? "").toLowerCase() === "active").length})
                        </div>
                        {team ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEditQueueModal(q)}
                              title="Edit queue"
                              aria-label={`Edit queue ${q.name}`}
                              className="rounded-full p-1 text-slate-600 transition hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void openMemberEditor(team.id)}
                              className="text-[11px] font-semibold text-[#1E88E5]"
                            >
                              Manage Team
                            </button>
                            <button
                              type="button"
                              onClick={() => setQueuePendingDelete(q)}
                              disabled={deletingQueueId === q.id}
                              title="Delete queue"
                              aria-label={`Delete queue ${q.name}`}
                              className="rounded-full p-1 text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-500/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEditQueueModal(q)}
                              title="Edit queue"
                              aria-label={`Edit queue ${q.name}`}
                              className="rounded-full p-1 text-slate-600 transition hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setQueuePendingDelete(q)}
                              disabled={deletingQueueId === q.id}
                              title="Delete queue"
                              aria-label={`Delete queue ${q.name}`}
                              className="rounded-full p-1 text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-500/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-black/10 bg-white/75 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Workload</div>
                          <div className="text-xs font-semibold text-red-600 dark:text-red-300">{status === "high" ? "High" : "Normal"}</div>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Team Capacity</div>
                          <div className="text-xs font-semibold text-[#111827] dark:text-slate-100">{teamStats?.capacity ?? 0}</div>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tickets Waiting</div>
                          <div className="text-xs font-semibold text-[#111827] dark:text-slate-100">{queueDemand}</div>
                        </div>
                      </div>
                    </GlassCard>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <GlassCard className="border-black/10 bg-white/75 p-4 dark:border-white/10 dark:bg-white/[0.05]">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-semibold text-[#111827] dark:text-slate-100">Team Pulse</div>
                  <CalendarDays className="h-4 w-4 text-slate-400" />
                </div>
                <div className="space-y-3">
                  {users.slice(0, 3).map((u, idx) => (
                    <div key={u.user_id} className="flex items-start gap-2.5">
                      <div className={`mt-0.5 h-8 w-0.5 rounded-full ${idx === 0 ? "bg-blue-500" : idx === 1 ? "bg-red-500" : "bg-slate-300 dark:bg-slate-600"}`} />
                      <div>
                        <div className="text-xs font-semibold text-[#111827] dark:text-slate-100">{u.name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{u.email}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </GlassCard>

              <GlassCard className="border border-dashed border-black/15 bg-white/70 p-4 dark:border-white/15 dark:bg-white/[0.04]">
                <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-[#1E88E5]/10">
                  <ShieldCheck className="h-4 w-4 text-[#1E88E5]" />
                </div>
                <div className="text-center text-sm font-semibold text-[#111827] dark:text-slate-100">Audit Queue Routing</div>
                <div className="mt-1 text-center text-xs text-slate-600 dark:text-slate-300">
                  Check workload imbalance and capacity pressure across departments.
                </div>
                <button
                  type="button"
                  onClick={() => toast.success("Routing audit started.")}
                  className="mt-3 w-full rounded-full bg-[#05264D] px-3 py-2 text-xs font-semibold text-white"
                >
                  Start Audit
                </button>
              </GlassCard>

              <GlassCard className="border-black/10 bg-white/75 p-4 dark:border-white/10 dark:bg-white/[0.05]">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#111827] dark:text-slate-100">
                  <BarChart3 className="h-4 w-4 text-[#1E88E5]" />
                  Volume Trends (24h)
                </div>
                <div className="flex h-[90px] items-end gap-1.5">
                  {[22, 36, 30, 62, 72, 54, 42, 26, 12].map((h, i) => (
                    <div
                      key={i}
                      className={`w-full rounded-sm ${i === 4 || i === 3 || i === 5 ? "bg-[#1E88E5]" : "bg-slate-300 dark:bg-slate-600"}`}
                      style={{ height: `${h}px` }}
                    />
                  ))}
                </div>
              </GlassCard>
            </div>
          </div>
        </div>
      ) : null}

      {manageTeamsOpen && typeof document !== "undefined"
        ? createPortal(
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-black/10 bg-white/95 shadow-2xl dark:border-white/15 dark:bg-[#080D16]/95">
              <div className="flex items-center justify-between border-b border-black/10 px-5 py-4 dark:border-white/10">
                <div className="text-base font-semibold text-[#111827] dark:text-slate-100">Manage All Teams</div>
                <button type="button" onClick={() => setManageTeamsOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
              </div>
              <div className="grid grid-cols-1 gap-3 border-b border-black/10 p-5 md:grid-cols-2 dark:border-white/10">
                <label className="grid gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">Organization</span>
                  <select
                    value={teamManagerFilter.orgId}
                    onChange={(e) => setTeamManagerFilter((f) => ({ ...f, orgId: e.target.value }))}
                    className="rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs dark:border-white/15 dark:bg-white/10"
                  >
                    <option value="all">All Organizations</option>
                    {teamManagerOrgOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">Product</span>
                  <select
                    value={teamManagerFilter.productId}
                    onChange={(e) => setTeamManagerFilter((f) => ({ ...f, productId: e.target.value }))}
                    className="rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs dark:border-white/15 dark:bg-white/10"
                  >
                    <option value="all">All Products</option>
                    {teamManagerProductOptions.map((pid) => (
                      <option key={pid} value={String(pid)}>
                        {productById.get(Number(pid))?.name ?? `Product ${pid}`}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="overflow-y-auto p-5">
                <div className="grid grid-cols-1 gap-2.5">
                  {filteredTeamsForManager.map((t) => {
                    const orgName =
                      Number(t.organisation_id) === 1
                        ? ORG1_NAME
                        : externalOrgs.find((o) => Number(o.id) === Number(t.organisation_id))?.organization_name ??
                          `Organization ${t.organisation_id}`;
                    return (
                      <div key={t.id} className="rounded-xl border border-black/10 bg-white/75 p-3 dark:border-white/15 dark:bg-white/[0.05]">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-[#111827] dark:text-slate-100">{t.name}</div>
                            <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                              {`• ${productById.get(Number(t.product_id ?? 0))?.name ?? "No Product"}`}{" "}
                              <span className="font-semibold text-[#1E88E5] dark:text-sky-300">{`• ${orgName}`}</span>
                            </div>
                            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                              Members: {teamStatsById[t.id]?.members ?? 0}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setManageTeamsOpen(false);
                                setEditingTeamId(t.id);
                              }}
                              className="text-[11px] font-semibold text-[#1E88E5]"
                            >
                              Manage Members
                            </button>
                            <button
                              type="button"
                              onClick={() => setTeamPendingDelete(t)}
                              disabled={deletingTeamId === t.id}
                              title="Delete team"
                              aria-label={`Delete team ${t.name}`}
                              className="rounded-full p-1 text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-500/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {filteredTeamsForManager.length === 0 ? (
                    <div className="rounded-xl border border-black/10 bg-white/70 px-3 py-3 text-xs text-slate-500 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-300">
                      No teams found for selected filters.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>,
          document.body
        ) : null}

      {teamPendingDelete && typeof document !== "undefined"
        ? createPortal(
          <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md overflow-hidden rounded-2xl border border-black/10 bg-white/95 shadow-2xl dark:border-white/15 dark:bg-[#080D16]/95">
              <div className="border-b border-black/10 px-5 py-4 dark:border-white/10">
                <div className="text-base font-semibold text-[#111827] dark:text-slate-100">Delete Team?</div>
                <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  Are you sure you want to delete <span className="font-semibold">{teamPendingDelete.name}</span>? Team members mappings will also be removed.
                </div>
              </div>
              <div className="flex justify-end gap-2 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setTeamPendingDelete(null)}
                  disabled={deletingTeamId === teamPendingDelete.id}
                  className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteTeam()}
                  disabled={deletingTeamId === teamPendingDelete.id}
                  className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {deletingTeamId === teamPendingDelete.id ? "Deleting..." : "Delete Team"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        ) : null}

      {createTeamOpen && typeof document !== "undefined"
        ? createPortal(
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-xl h-full max-h-[90vh] overflow-y-auto rounded-2xl border border-black/10 bg-white/95 shadow-2xl dark:border-white/15 dark:bg-[#080D16]/95">
              <div className="flex items-center justify-between border-b border-black/10 px-5 py-4 dark:border-white/10">
                <div className="text-base font-semibold text-[#111827] dark:text-slate-100">Create New Team</div>
                <button type="button" onClick={() => setCreateTeamOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
              </div>
              <div className="grid gap-3 p-5">
                <label className="grid gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">Select Organization *</span>
                  <select
                    value={createTeamForm.organisation_id}
                    onChange={(e) =>
                      setCreateTeamForm((f) => ({ ...f, organisation_id: e.target.value }))
                    }
                    disabled={!isSystemAdminUser || createTeamForm.create_for_all_organisations}
                    className="rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs dark:border-white/15 dark:bg-white/10 disabled:opacity-60"
                  >
                    {isSystemAdminUser ? (
                      <>
                        <option value="">Select organization</option>
                        <option value="1">{ORG1_NAME}</option>
                        {externalOrgs.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.organization_name}
                          </option>
                        ))}
                      </>
                    ) : (
                      <option value={orgId}>{Number(orgId) === 1 ? ORG1_NAME : `Organization ${orgIdNum ?? "-"}`}</option>
                    )}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">Team Name</span>
                  <input value={createTeamForm.name} onChange={(e) => setCreateTeamForm((f) => ({ ...f, name: e.target.value }))} className="rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs dark:border-white/15 dark:bg-white/10" />
                </label>
                <label className="grid gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">Product *</span>
                  <div className="rounded-xl border border-black/10 bg-white/85 p-2 dark:border-white/15 dark:bg-white/10">
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {createTeamForm.product_ids.length > 0 ? (
                        createTeamForm.product_ids.map((pid) => {
                          const product = products.find((p) => String(p.id) === String(pid));
                          const label = product?.name ?? `Product ${pid}`;
                          return (
                            <span key={pid} className="inline-flex items-center gap-1 rounded-full border border-[#1E88E5]/30 bg-[#1E88E5]/10 px-2 py-0.5 text-[10px] font-semibold text-[#1E88E5]">
                              {label}
                              <button
                                type="button"
                                onClick={() =>
                                  setCreateTeamForm((f) => ({
                                    ...f,
                                    product_ids: f.product_ids.filter((x) => x !== pid),
                                  }))
                                }
                                className="rounded-full px-1 leading-none hover:bg-[#1E88E5]/20"
                                aria-label={`Remove ${label}`}
                                title={`Remove ${label}`}
                              >
                                ×
                              </button>
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">No products selected.</span>
                      )}
                    </div>
                    <select
                      value=""
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        setCreateTeamForm((f) => ({
                          ...f,
                          product_ids: f.product_ids.includes(val) ? f.product_ids : [...f.product_ids, val],
                        }));
                      }}
                      className="w-full rounded-lg border border-black/10 bg-white/90 px-3 py-2 text-xs dark:border-white/15 dark:bg-white/10"
                    >
                      <option value="">Select product to add</option>
                      {products
                        .filter((p) => !createTeamForm.product_ids.includes(String(p.id)))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Pick from dropdown to add products. Click × on a tag to remove.</span>
                </label>
                {isSystemAdminUser ? (
                  <label className="flex items-center gap-2 rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-xs text-slate-700 dark:border-white/15 dark:bg-white/10 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={createTeamForm.create_for_all_organisations}
                      onChange={(e) =>
                        setCreateTeamForm((f) => ({
                          ...f,
                          create_for_all_organisations: e.target.checked,
                        }))
                      }
                      className="h-3.5 w-3.5 accent-[#1E88E5]"
                    />
                    Global default for all organizations
                  </label>
                ) : null}
                {!skipCreateTeamUserSelection ? (
                  <label className="grid gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">
                      Assign Users *
                    </span>
                    <input
                      value={createTeamUserSearch}
                      onChange={(e) => setCreateTeamUserSearch(e.target.value)}
                      placeholder="Search by name or email"
                      className="rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs dark:border-white/15 dark:bg-white/10"
                    />
                    <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      Selected users: {createTeamSelectedUserIds.length} / {createTeamEligibleUsers.length}
                    </div>
                    <div className="text-[10px] text-slate-600 dark:text-slate-300">
                      Required role coverage: L1 ({createTeamSelectedRoleCoverage.L1}), L2 ({createTeamSelectedRoleCoverage.L2}), L3 ({createTeamSelectedRoleCoverage.L3})
                    </div>
                    <div className="max-h-[170px] space-y-1.5 overflow-y-auto rounded-xl border border-black/10 bg-white/85 p-2 dark:border-white/15 dark:bg-white/10">
                      {loadingCreateTeamUsers ? (
                        <div className="px-1 py-1 text-[10px] text-slate-500 dark:text-slate-400">Loading invited users...</div>
                      ) : createTeamOrgIdNum == null ? (
                        <div className="px-1 py-1 text-[10px] text-slate-500 dark:text-slate-400">Select organization to load users.</div>
                      ) : createTeamEligibleUsers.length === 0 ? (
                        <div className="px-1 py-1 text-[10px] text-slate-500 dark:text-slate-400">No invited users found for this organization.</div>
                      ) : (
                        visibleCreateTeamUsers.map((u) => {
                          const userIdNum = Number(u.user_id);
                          const checked = createTeamSelectedUserIds.some((id) => Number(id) === userIdNum);
                          return (
                            <label key={u.user_id} className="flex items-center justify-between gap-2 rounded-md px-1 py-1 text-xs text-slate-700 hover:bg-black/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.07]">
                              <span className="flex min-w-0 items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) =>
                                    setCreateTeamSelectedUserIds((prev) => {
                                      if (!Number.isFinite(userIdNum)) return prev;
                                      if (e.target.checked) {
                                        return Array.from(new Set([...prev.map((id) => Number(id)), userIdNum]));
                                      }
                                      return prev.filter((id) => Number(id) !== userIdNum);
                                    })
                                  }
                                  className="h-3.5 w-3.5 accent-[#1E88E5]"
                                />
                                <span className="truncate">{u.name || u.email}</span>
                              </span>
                              <span className="shrink-0 rounded-full border border-[#1E88E5]/30 bg-[#1E88E5]/10 px-2 py-0.5 text-[10px] font-semibold text-[#1E88E5]">
                                {getCreateTeamUserRoleLabel(u)}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      Mandatory: select at least 3 users with role coverage across L1, L2, and L3 (minimum one each).
                    </span>
                  </label>
                ) : null}
              </div>
              <div className="flex justify-end gap-2 border-t border-black/10 bg-black/[0.02] px-5 py-4 dark:border-white/10 dark:bg-white/[0.03]">
                <button type="button" onClick={() => setCreateTeamOpen(false)} className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300">Cancel</button>
                <button type="button" onClick={() => void handleCreateTeam()} disabled={creatingTeam || !canCreateTeam} className="rounded-lg bg-[#1E88E5] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">{creatingTeam ? "Creating..." : "Create Team"}</button>
              </div>
            </div>
          </div>,
          document.body
        ) : null}

      {filterOpen && typeof document !== "undefined"
        ? createPortal(
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-black/10 bg-white/95 shadow-2xl dark:border-white/15 dark:bg-[#080D16]/95">
              <div className="flex items-center justify-between border-b border-black/10 px-5 py-4 dark:border-white/10">
                <div className="text-base font-semibold text-[#111827] dark:text-slate-100">Filter Operational Queues</div>
                <button type="button" onClick={() => setFilterOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
              </div>
              <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">Organization</span>
                  <select
                    value={queueFilter.orgId}
                    onChange={(e) => setQueueFilter((f) => ({ ...f, orgId: e.target.value }))}
                    className="rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs dark:border-white/15 dark:bg-white/10"
                  >
                    <option value="all">All Organizations</option>
                    {isSystemAdminUser
                      ? queueOrgOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))
                      : <option value={orgId}>Organization {orgId}</option>}
                  </select>
                </label>
                <label className="grid gap-1 md:col-span-2">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">Product</span>
                  <div className="rounded-xl border border-black/10 bg-white/85 p-2 dark:border-white/15 dark:bg-white/10">
                    <div className="mb-2 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() =>
                          setQueueFilter((f) => ({ ...f, productIds: productOptionsForSelectedOrg.map((pid) => String(pid)) }))
                        }
                        className="text-[10px] font-semibold text-[#1E88E5]"
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={() => setQueueFilter((f) => ({ ...f, productIds: [] }))}
                        className="text-[10px] font-semibold text-slate-600 dark:text-slate-300"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="max-h-[132px] space-y-1.5 overflow-y-auto pr-1">
                      {productFilterIdsSorted.map((pid) => {
                        const val = String(pid);
                        const checked = queueFilter.productIds.includes(val);
                        return (
                          <label key={pid} className="flex items-center gap-2 rounded-md px-1 py-1 text-xs text-slate-700 hover:bg-black/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.07]">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setQueueFilter((f) => ({
                                  ...f,
                                  productIds: e.target.checked
                                    ? [...f.productIds, val]
                                    : f.productIds.filter((x) => x !== val),
                                }))
                              }
                              className="h-3.5 w-3.5 accent-[#1E88E5]"
                            />
                            <span>{productById.get(Number(pid))?.name ?? `Product ${pid}`}</span>
                          </label>
                        );
                      })}
                      {productOptionsForSelectedOrg.length === 0 ? (
                        <div className="px-1 py-1 text-[10px] text-slate-500 dark:text-slate-400">No products available for this filter scope.</div>
                      ) : null}
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Multiple products supported. Any selected product will match.</span>
                </label>
              </div>
              <div className="flex justify-end gap-2 border-t border-black/10 bg-black/[0.02] px-5 py-4 dark:border-white/10 dark:bg-white/[0.03]">
                <button
                  type="button"
                  onClick={() => setQueueFilter({ orgId: "all", productIds: [] })}
                  className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => setFilterOpen(false)}
                  className="rounded-lg bg-[#1E88E5] px-4 py-2 text-xs font-semibold text-white"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>,
          document.body
        ) : null}

      {createQueueOpen && typeof document !== "undefined"
        ? createPortal(
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-black/10 bg-white/95 shadow-2xl dark:border-white/15 dark:bg-[#080D16]/95">
              <div className="flex items-center justify-between border-b border-black/10 px-5 py-4 dark:border-white/10">
                <div className="text-base font-semibold text-[#111827] dark:text-slate-100">Create New Queue</div>
                <button type="button" onClick={() => setCreateQueueOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
              </div>
              <div className="grid gap-3 p-5">
                <label className="grid gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">Select Organization *</span>
                  <select
                    value={createQueueForm.organisation_id}
                    onChange={(e) => setCreateQueueForm((f) => ({ ...f, organisation_id: e.target.value, team_id: "" }))}
                    disabled={!isSystemAdminUser || createQueueForm.create_for_all_organisations}
                    className="rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs dark:border-white/15 dark:bg-white/10 disabled:opacity-60"
                  >
                    {isSystemAdminUser ? (
                      <>
                        <option value="">Select organization</option>
                        <option value="1">{ORG1_NAME}</option>
                        {externalOrgs.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.organization_name}
                          </option>
                        ))}
                      </>
                    ) : (
                      <option value={orgId}>{Number(orgId) === 1 ? ORG1_NAME : `Organization ${orgIdNum ?? "-"}`}</option>
                    )}
                  </select>
                </label>
                {isSystemAdminUser ? (
                  <label className="flex items-center gap-2 rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-xs text-slate-700 dark:border-white/15 dark:bg-white/10 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={createQueueForm.create_for_all_organisations}
                      onChange={(e) =>
                        setCreateQueueForm((f) => ({
                          ...f,
                          create_for_all_organisations: e.target.checked,
                          team_id: "",
                        }))
                      }
                      className="h-3.5 w-3.5 accent-[#1E88E5]"
                    />
                    Global default for all organizations
                  </label>
                ) : null}
                <label className="grid gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">Queue Name *</span>
                  <input value={createQueueForm.name} onChange={(e) => setCreateQueueForm((f) => ({ ...f, name: e.target.value }))} className="rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs dark:border-white/15 dark:bg-white/10" />
                </label>
                <label className="grid gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">Product *</span>
                  <select
                    value={createQueueForm.product_id}
                    onChange={(e) =>
                      setCreateQueueForm((f) => ({ ...f, product_id: e.target.value, team_id: "" }))
                    }
                    className="rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs dark:border-white/15 dark:bg-white/10"
                  >
                    <option value="">Select specific product</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">Target team</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Optional — assign later if no team exists yet.</span>
                  <select
                    value={createQueueForm.team_id}
                    onChange={(e) => setCreateQueueForm((f) => ({ ...f, team_id: e.target.value }))}
                    disabled={
                      (!createQueueForm.create_for_all_organisations && createQueueOrgIdNum == null) ||
                      !createQueueForm.product_id
                    }
                    className="rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs disabled:opacity-60 dark:border-white/15 dark:bg-white/10"
                  >
                    <option value="">
                      {!createQueueForm.create_for_all_organisations && createQueueOrgIdNum == null
                        ? "Select organization first"
                        : !createQueueForm.product_id
                          ? "Select product first"
                          : "Unassigned (no team yet)"}
                    </option>
                    {availableTeamsForCreateQueue.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex justify-end gap-2 border-t border-black/10 bg-black/[0.02] px-5 py-4 dark:border-white/10 dark:bg-white/[0.03]">
                <button type="button" onClick={() => setCreateQueueOpen(false)} className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300">Cancel</button>
                <button type="button" onClick={() => void handleCreateQueue()} disabled={creatingQueue || !canCreateQueue} className="rounded-lg bg-[#1E88E5] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">{creatingQueue ? "Creating..." : "Create Queue"}</button>
              </div>
            </div>
          </div>,
          document.body
        ) : null}

      {editQueueOpen && typeof document !== "undefined"
        ? createPortal(
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-black/10 bg-white/95 shadow-2xl dark:border-white/15 dark:bg-[#080D16]/95">
              <div className="flex items-center justify-between border-b border-black/10 px-5 py-4 dark:border-white/10">
                <div className="text-base font-semibold text-[#111827] dark:text-slate-100">Edit Queue</div>
                <button type="button" onClick={() => setEditQueueOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
              </div>
              <div className="grid gap-3 p-5">
                <label className="grid gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">Organization</span>
                  <select value={editQueueForm.organisation_id} disabled className="rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs opacity-70 dark:border-white/15 dark:bg-white/10">
                    <option value={editQueueForm.organisation_id}>
                      {Number(editQueueForm.organisation_id) === 1
                        ? ORG1_NAME
                        : externalOrgs.find((o) => Number(o.id) === Number(editQueueForm.organisation_id))?.organization_name ??
                          `Organization ${editQueueForm.organisation_id}`}
                    </option>
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">Queue Name</span>
                  <input value={editQueueForm.name} onChange={(e) => setEditQueueForm((f) => ({ ...f, name: e.target.value }))} className="rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs dark:border-white/15 dark:bg-white/10" />
                </label>
                <label className="grid gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">Target team</span>
                  <select
                    value={editQueueForm.team_id}
                    onChange={(e) => setEditQueueForm((f) => ({ ...f, team_id: e.target.value }))}
                    disabled={!editQueueForm.product_id}
                    className="rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs disabled:opacity-60 dark:border-white/15 dark:bg-white/10"
                  >
                    <option value="">Unassigned (assign a team when ready)</option>
                    {availableTeamsForEditQueue.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">Product</span>
                  <select
                    value={editQueueForm.product_id}
                    onChange={(e) => setEditQueueForm((f) => ({ ...f, product_id: e.target.value, team_id: "" }))}
                    className="rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs dark:border-white/15 dark:bg-white/10"
                  >
                    <option value="">Select specific product</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="flex justify-end gap-2 border-t border-black/10 bg-black/[0.02] px-5 py-4 dark:border-white/10 dark:bg-white/[0.03]">
                <button type="button" onClick={() => setEditQueueOpen(false)} className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300">Cancel</button>
                <button type="button" onClick={() => void handleUpdateQueue()} disabled={updatingQueue} className="rounded-lg bg-[#1E88E5] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">{updatingQueue ? "Saving..." : "Save Changes"}</button>
              </div>
            </div>
          </div>,
          document.body
        ) : null}

      {queuePendingDelete && typeof document !== "undefined"
        ? createPortal(
          <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md overflow-hidden rounded-2xl border border-black/10 bg-white/95 shadow-2xl dark:border-white/15 dark:bg-[#080D16]/95">
              <div className="border-b border-black/10 px-5 py-4 dark:border-white/10">
                <div className="text-base font-semibold text-[#111827] dark:text-slate-100">Delete Queue?</div>
                <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  Are you sure you want to delete <span className="font-semibold">{queuePendingDelete.name}</span>? This action cannot be undone.
                </div>
              </div>
              <div className="flex justify-end gap-2 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setQueuePendingDelete(null)}
                  disabled={deletingQueueId === queuePendingDelete.id}
                  className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteQueue()}
                  disabled={deletingQueueId === queuePendingDelete.id}
                  className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {deletingQueueId === queuePendingDelete.id ? "Deleting..." : "Delete Queue"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        ) : null}

      {editingTeamId && editingTeam && typeof document !== "undefined"
        ? createPortal(
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-black/10 bg-white/95 shadow-2xl dark:border-white/15 dark:bg-[#080D16]/95">
              <div className="flex items-center justify-between border-b border-black/10 px-5 py-4 dark:border-white/10">
                <div className="text-base font-semibold text-[#111827] dark:text-slate-100">Manage Team Members: {editingTeam.name}</div>
                <button type="button" onClick={() => setEditingTeamId(null)} className="rounded-lg p-2 text-slate-500 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
              </div>
              <div className="overflow-y-auto p-5">
                <div className="mb-3 rounded-xl border border-black/10 bg-white/70 px-3 py-2 dark:border-white/15 dark:bg-white/[0.05]">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-[#1E88E5]">Team Capacity (Max Open Tickets)</div>
                  <div className="mt-1 text-sm font-semibold text-[#111827] dark:text-slate-100">{teamCapacityDraftTotal} tickets</div>
                  <div className="text-[11px] text-muted-foreground">Based on {teamMemberCountDraft} selected member(s) max-cap values.</div>
                </div>
                <input
                  value={manageTeamUserSearch}
                  onChange={(e) => setManageTeamUserSearch(e.target.value)}
                  placeholder="Search by name or email"
                  className="mb-3 w-full rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs dark:border-white/15 dark:bg-white/10"
                />
                <div className="mb-3 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  Selected users: {teamMemberCountDraft} / {editorUsers.length}
                </div>
                <div className="grid grid-cols-1 gap-2.5">
                  {visibleEditorUsers.map((u) => {
                    const d = memberDraft[u.user_id];
                    const included = Boolean(d?.included);
                    return (
                      <div key={u.user_id} className="rounded-xl border border-black/10 bg-white/75 p-3 dark:border-white/15 dark:bg-white/[0.05]">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div className="min-w-0">
                            <label className="flex items-center gap-2 text-xs font-medium text-[#111827] dark:text-slate-100">
                              <input
                                type="checkbox"
                                checked={included}
                                onChange={(e) => {
                                  const nextIncluded = e.target.checked;
                                  setMemberDraft((prev) => ({
                                    ...prev,
                                    [u.user_id]: {
                                      included: nextIncluded,
                                      max_open_tickets_cap: prev[u.user_id]?.max_open_tickets_cap ?? null,
                                    },
                                  }));
                                }}
                              />
                              <span className="truncate">{u.name}</span>
                            </label>
                            <div className="mt-1 text-[11px] text-muted-foreground">{u.email}</div>
                          </div>
                          <div className="grid gap-2 md:w-[300px]">
                            <label className="grid gap-1 text-[11px] text-muted-foreground">
                              Max open tickets per member
                              <input
                                type="number"
                                min={0}
                                value={d?.max_open_tickets_cap ?? ""}
                                disabled={!included}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  const next = v === "" ? null : Math.max(0, Math.floor(Number(v)));
                                  setMemberDraft((prev) => ({
                                    ...prev,
                                    [u.user_id]: {
                                      included: true,
                                      max_open_tickets_cap: next,
                                    },
                                  }));
                                }}
                                className="rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs text-slate-800 disabled:opacity-60 dark:border-white/15 dark:bg-white/10 dark:text-slate-100"
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-black/10 bg-black/[0.02] px-5 py-4 dark:border-white/10 dark:bg-white/[0.03]">
                <button type="button" onClick={() => setEditingTeamId(null)} className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300">Close</button>
                <button type="button" onClick={() => void handleSaveMembers()} disabled={savingMembers} className="rounded-lg bg-[#1E88E5] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">{savingMembers ? "Saving..." : "Save Team Members"}</button>
              </div>
            </div>
          </div>,
          document.body
        ) : null}
    </div>
  );
}

