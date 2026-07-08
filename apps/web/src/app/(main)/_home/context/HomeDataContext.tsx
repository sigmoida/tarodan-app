'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useHomeData } from '../hooks/useHomeData';

type HomeData = ReturnType<typeof useHomeData>;

const HomeDataContext = createContext<HomeData | null>(null);

export function HomeDataProvider({ children }: { children: ReactNode }) {
	const value = useHomeData();
	return (
		<HomeDataContext.Provider value={value}>
			{children}
		</HomeDataContext.Provider>
	);
}

export function useHome(): HomeData {
	const ctx = useContext(HomeDataContext);
	if (!ctx) {
		throw new Error('useHome must be used within a HomeDataProvider');
	}
	return ctx;
}
