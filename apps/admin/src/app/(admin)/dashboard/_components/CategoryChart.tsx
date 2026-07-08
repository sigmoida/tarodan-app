'use client';

import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS } from 'chart.js';
import { SectionCard } from '@/components/detail/SectionCard';
import { chartPalette, categoryColors } from '../_lib/charts';

export function CategoryChart({
  categories,
}: {
  categories: { name: string; count: number }[];
}) {
  const sorted = [...(categories || [])].sort((a, b) => b.count - a.count);
  const hasData = sorted.length > 0;

  const data = {
    labels: hasData ? sorted.map((c) => c.name) : ['Veri Yok'],
    datasets: [
      {
        data: hasData ? sorted.map((c) => c.count) : [1],
        backgroundColor: hasData
          ? sorted.map((_, i) => categoryColors[i % categoryColors.length])
          : [chartPalette.subtle],
        borderWidth: 0,
      },
    ],
  };

  return (
    <SectionCard title="Kategori Dağılımı" className="overflow-visible">
      <div className="min-h-[380px] pb-6">
        <Doughnut
          data={data}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { bottom: 20 } },
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  padding: 12,
                  boxWidth: 14,
                  font: { size: 12 },
                  generateLabels: (chart: ChartJS) => {
                    const ds = chart.data.datasets[0];
                    const bg = (ds?.backgroundColor ?? []) as string[];
                    return (chart.data.labels ?? []).map((label, i) => ({
                      text: String(label ?? ''),
                      fillStyle: bg[i] ?? chartPalette.subtle,
                      fontColor: bg[i] ?? chartPalette.subtle,
                      index: i,
                    }));
                  },
                },
              },
            },
          }}
        />
      </div>
    </SectionCard>
  );
}
