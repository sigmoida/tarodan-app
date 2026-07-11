/**
 * Takip et/çıkar (follow/unfollow), takip listesi + isFollowing/sayaç.
 *
 * useFollowing, Faz 1'de followStore'un yerini alan React Query hook'udur.
 * Store'un davranışı (follow→ekle, unfollow→çıkar, 409 idempotent, 404 toleranslı)
 * burada renderHook ile korunur. API katmanı mock'lanır.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react-native';

jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn().mockResolvedValue({ data: [] }),
    post: jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} }),
  },
}));

jest.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ isAuthenticated: true }),
}));

import { api } from '@/lib/api';
import { useFollowing } from '../useFollowing';

const mockApi = api as unknown as { get: jest.Mock; post: jest.Mock; delete: jest.Mock };

const seller = (id: string) => ({ id, displayName: 'Satıcı', listingCount: 0, followedAt: '2026-01-01' });

// children: any → test ortamındaki çift @types/react ReactNode uyuşmazlığından kaçın.
function wrapper({ children }: { children: any }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function setup(initial: any[] = []) {
  mockApi.get.mockResolvedValue({ data: initial });
  const view = renderHook(() => useFollowing(), { wrapper });
  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  return view;
}

beforeEach(() => {
  mockApi.get.mockReset().mockResolvedValue({ data: [] });
  mockApi.post.mockReset().mockResolvedValue({ data: {} });
  mockApi.delete.mockReset().mockResolvedValue({ data: {} });
});

describe('takip listesi + isFollowing / sayaç', () => {
  it('boş listede isFollowing false, sayaç 0', async () => {
    const { result } = await setup([]);
    expect(result.current.isFollowing('s1')).toBe(false);
    expect(result.current.getFollowingCount()).toBe(0);
  });

  it('gelen satıcılarda isFollowing true, sayaç doğru', async () => {
    const { result } = await setup([seller('s1'), seller('s2')]);
    await waitFor(() => expect(result.current.getFollowingCount()).toBe(2));
    expect(result.current.isFollowing('s1')).toBe(true);
    expect(result.current.isFollowing('yok')).toBe(false);
  });
});

describe('followSeller', () => {
  it('takip edince yerel listeye eklenir', async () => {
    const { result } = await setup([]);
    mockApi.post.mockResolvedValue({ data: { user: seller('s9') } });
    let ok = false;
    await act(async () => { ok = await result.current.followSeller('s9'); });
    expect(ok).toBe(true);
    await waitFor(() => expect(result.current.isFollowing('s9')).toBe(true));
  });

  it('409 (zaten takipte) başarı döner', async () => {
    const { result } = await setup([]);
    mockApi.post.mockRejectedValue({ response: { status: 409 } });
    let ok = false;
    await act(async () => { ok = await result.current.followSeller('s1'); });
    expect(ok).toBe(true);
  });
});

describe('unfollowSeller', () => {
  it('takipten çıkınca yerel listeden düşer', async () => {
    const { result } = await setup([seller('s1'), seller('s2')]);
    await waitFor(() => expect(result.current.getFollowingCount()).toBe(2));
    let ok = false;
    await act(async () => { ok = await result.current.unfollowSeller('s1'); });
    expect(ok).toBe(true);
    await waitFor(() => expect(result.current.following.map((f) => f.id)).toEqual(['s2']));
  });

  it('404 (zaten takipte değil) başarı döner + listeden düşer', async () => {
    const { result } = await setup([seller('s1')]);
    await waitFor(() => expect(result.current.getFollowingCount()).toBe(1));
    mockApi.delete.mockRejectedValue({ response: { status: 404 } });
    let ok = false;
    await act(async () => { ok = await result.current.unfollowSeller('s1'); });
    expect(ok).toBe(true);
    await waitFor(() => expect(result.current.following).toHaveLength(0));
  });
});
