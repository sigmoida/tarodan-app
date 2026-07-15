"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SearchRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const q = searchParams.get("q");
    if (q) {
      router.replace(`/listings?search=${encodeURIComponent(q)}`);
    } else {
      router.replace("/listings");
    }
  }, [router, searchParams]);

  return null;
}

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchRedirect />
    </Suspense>
  );
}
