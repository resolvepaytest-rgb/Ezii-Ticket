import { getAuthMePermissions } from "@api/authApi";
import { useEffect, useState } from "react";

export function useScreenModifyAccess(screenKeys: string | string[], allowSystemAdmin = true) {
  const [canModify, setCanModify] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getAuthMePermissions()
      .then((res) => {
        if (cancelled) return;
        const keys = Array.isArray(screenKeys) ? screenKeys : [screenKeys];
        const isSystemAdminIdentity =
          allowSystemAdmin &&
          res.role_name?.toLowerCase().replace(/\s+/g, "_").includes("system_admin");
        const canModifyAny = keys.some((k) => Boolean(res.permissions_json?.screen_access?.[k]?.modify));
        setCanModify(Boolean(isSystemAdminIdentity || canModifyAny));
      })
      .catch(() => {
        if (!cancelled) setCanModify(false);
      });
    return () => {
      cancelled = true;
    };
  }, [allowSystemAdmin, screenKeys]);

  return canModify;
}
