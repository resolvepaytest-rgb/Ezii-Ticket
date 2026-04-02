export type EziiJwtClaims = {
  org_id: string;
  user_id: string;
  role_id: string;
  user_type_id: string;
  role_name: string;
  attendance_role_name?: string;
  expense_role_name?: string;
  nbf?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
};

