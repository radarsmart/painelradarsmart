export const ADMIN_ROLE = "admin";
export const CENTRAL_OFERTA_ROLE = "central_oferta";
export const OFFER_OPERATOR_ROLE = "operador_ofertas";

export const ALL_ADMIN_ROLES = [
  ADMIN_ROLE,
  CENTRAL_OFERTA_ROLE,
  OFFER_OPERATOR_ROLE,
] as const;

export const OFFER_WORKFLOW_ROLES = [
  ADMIN_ROLE,
  CENTRAL_OFERTA_ROLE,
  OFFER_OPERATOR_ROLE,
] as const;

export const OFFER_OPERATOR_ROLES = [ADMIN_ROLE, OFFER_OPERATOR_ROLE] as const;

const CENTRAL_OFERTA_ALLOWED_PATHS = ["/admin/ofertas/nova", "/admin/extrator"];

const OFFER_OPERATOR_ALLOWED_PATHS = [
  "/admin/garimpar",
  "/admin/ofertas/nova",
  "/admin/extrator",
  "/admin/ofertas",
  "/admin/envios",
  "/admin/fila",
  "/admin/canais",
];

export function getRoleLabel(role?: string | null): string {
  if (role === CENTRAL_OFERTA_ROLE) return "Colaborador";
  if (role === OFFER_OPERATOR_ROLE) return "Operador de Ofertas";
  return "Admin Master";
}

export function getEffectiveAdminRole(params: {
  email?: string | null;
  role?: string | null;
}): string {
  const email = String(params.email ?? "").trim().toLowerCase();
  const offerOperatorEmails = (
    process.env.OFFER_OPERATOR_EMAILS ?? "fagner.radarsmart@gmail.com"
  )
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (offerOperatorEmails.includes(email)) {
    return OFFER_OPERATOR_ROLE;
  }

  return params.role || ADMIN_ROLE;
}

export function getDefaultAdminPathForRole(role?: string | null): string {
  if (role === CENTRAL_OFERTA_ROLE) return "/admin/ofertas/nova";
  if (role === OFFER_OPERATOR_ROLE) return "/admin/garimpar";
  return "/admin";
}

function matchesAllowedPath(pathname: string, allowedPath: string): boolean {
  return pathname === allowedPath || pathname.startsWith(`${allowedPath}/`);
}

export function isPathAllowedForRole(
  role: string | null | undefined,
  pathname: string,
): boolean {
  if (!role || role === ADMIN_ROLE) return true;

  const allowedPaths =
    role === CENTRAL_OFERTA_ROLE
      ? CENTRAL_OFERTA_ALLOWED_PATHS
      : role === OFFER_OPERATOR_ROLE
        ? OFFER_OPERATOR_ALLOWED_PATHS
        : [];

  return allowedPaths.some((allowedPath) => matchesAllowedPath(pathname, allowedPath));
}

export function isRestrictedCentralOferta(role?: string | null): boolean {
  return role === CENTRAL_OFERTA_ROLE;
}
