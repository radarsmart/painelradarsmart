"use client";

import { createContext, useContext } from "react";
import { isRestrictedCentralOferta } from "@/lib/admin-permissions";

export type AdminIdentity = {
  email: string | null;
  role: string;
};

const AdminRoleContext = createContext<AdminIdentity | null>(null);

export const AdminRoleProvider = AdminRoleContext.Provider;

export function useAdminIdentity(): AdminIdentity {
  return useContext(AdminRoleContext) ?? { email: null, role: "admin" };
}

export function useIsRestrictedCollaborator(): boolean {
  return isRestrictedCentralOferta(useAdminIdentity().role);
}
