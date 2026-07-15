"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

export default function WishlistRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/profile/favorites");
  }, [router]);

  return null;
}
