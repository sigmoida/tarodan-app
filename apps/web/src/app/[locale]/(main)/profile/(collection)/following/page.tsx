"use client";

import { Link } from "@/i18n/navigation";
import { Button, Spinner } from "@tarodan/ui";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyStateCard } from "@/components/ui";
import AuthLoadingScreen from "@/components/AuthLoadingScreen";
import { useRequireAuth } from "../../_hooks/useRequireAuth";
import { useFollowing, useUnfollow } from "./_hooks/useFollowing";
import FollowedSellerCard from "./_components/FollowedSellerCard";

export default function FollowingPage() {
  const { ready } = useRequireAuth();

  const { following, isLoading } = useFollowing(ready);
  const unfollow = useUnfollow();

  if (!ready) return <AuthLoadingScreen />;

  return (
    <PageShell className="pb-16">
      <PageHeader
        title="Takip Ettiklerim"
        description={`${following.length} satıcı takip ediliyor`}
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="xl" />
        </div>
      ) : following.length === 0 ? (
        <EmptyStateCard
          title="Henüz kimseyi takip etmiyorsunuz"
          description="Satıcıları takip ederek yeni ilanlarından haberdar olun"
          action={
            <Button asChild>
              <Link href="/listings">İlanları Keşfet</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4">
          {following.map((item) => (
            <FollowedSellerCard
              key={item.id}
              item={item}
              busy={
                unfollow.isPending && unfollow.variables === item.following.id
              }
              onUnfollow={(userId) => unfollow.mutate(userId)}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}
