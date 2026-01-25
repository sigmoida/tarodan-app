'use client';

interface StatsCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
}

export function StatsCard({ title, value, change, icon, trend }: StatsCardProps) {
  const getTrendColor = () => {
    if (trend === 'up') return 'text-green-400';
    if (trend === 'down') return 'text-red-400';
    return 'text-muted-foreground';
  };

  const getTrendIcon = () => {
    if (trend === 'up') return '↑';
    if (trend === 'down') return '↓';
    return '→';
  };

  return (
    <div className="bg-card rounded-lg p-6 border">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {change !== undefined && (
            <p className={`text-sm mt-1 flex items-center gap-1 ${getTrendColor()}`}>
              <span>{getTrendIcon()}</span>
              <span>{Math.abs(change)}%</span>
              <span className="text-muted-foreground">vs önceki dönem</span>
            </p>
          )}
        </div>
        {icon && (
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

export default StatsCard;
