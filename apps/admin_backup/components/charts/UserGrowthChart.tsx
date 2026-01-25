'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface UserGrowthChartProps {
  data: Array<{
    month: string;
    newUsers: number;
    activeUsers: number;
  }>;
}

export function UserGrowthChart({ data }: UserGrowthChartProps) {
  return (
    <div className="bg-card rounded-lg p-6 border">
      <h3 className="text-lg font-semibold mb-4">Kullanıcı Büyümesi</h3>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="month"
              stroke="#9ca3af"
              fontSize={12}
              tickLine={false}
            />
            <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: 'none',
                borderRadius: '8px',
              }}
            />
            <Bar dataKey="newUsers" fill="#0ea5e9" name="Yeni Kullanıcı" />
            <Bar dataKey="activeUsers" fill="#8b5cf6" name="Aktif Kullanıcı" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default UserGrowthChart;
