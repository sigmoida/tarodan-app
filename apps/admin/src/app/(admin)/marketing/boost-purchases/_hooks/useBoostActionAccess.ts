"use client";

import { useSession } from "@/context/SessionContext";
import { usePermissions } from "@/context/PermissionsContext";
import { boostActionAccess, type BoostActionAccess } from "../_lib/access";

/** {@link boostActionAccess} for the signed-in admin. */
export function useBoostActionAccess(): BoostActionAccess {
  const { user } = useSession();
  const { can } = usePermissions();
  return boostActionAccess(user.role, can);
}
