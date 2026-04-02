import { SCREEN_KEYS, type ScreenKey } from "./permissionKeys.js";

export type ScreenAccessEntry = { view: boolean; modify: boolean };
export type ScreenAccessMap = Record<ScreenKey, ScreenAccessEntry>;
export type TicketDataScope =
  | "own_tickets"
  | "org_tickets"
  | "assigned_queue"
  | "product_queue_escalated"
  | "all_tickets";

export type CanonicalPermissionSchema = {
  screens: Partial<Record<ScreenKey, ScreenAccessEntry>>;
  actions: Record<string, boolean>;
  data_scope: {
    tickets?: TicketDataScope;
    ticket_filters?: {
      apply_role_to?: "all" | "reportees" | "attribute" | "sub_attribute";
      attribute_id?: string | null;
      sub_attribute_id?: string | null;
    };
  };
  sla?: {
    tier1?: "none" | "view" | "edit";
    tier2?: "none" | "view" | "edit";
  };
};

export function buildScreenAccess(fullModify: boolean): ScreenAccessMap {
  const out = {} as ScreenAccessMap;
  for (const key of SCREEN_KEYS) {
    out[key] = { view: true, modify: fullModify };
  }
  return out;
}

