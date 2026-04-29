import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  variant: 'blue' | 'green' | 'yellow' | 'purple';
  icon?: ReactNode;
  active?: boolean;
  onClick?: () => void;
}

const variantStyles = {
  blue: 'status-blue',
  green: 'status-green',
  yellow: 'status-yellow',
  purple: 'status-purple',
};

export function StatCard({ title, value, variant, icon, active, onClick }: StatCardProps) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
      className={cn(
        'rounded-lg p-6 transition-all duration-200 hover:shadow-md',
        variantStyles[variant],
        onClick && 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]',
        active && 'ring-2 ring-primary shadow-md scale-[1.02]',
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-80">{title}</p>
          <p className="text-3xl font-bold mt-1">{value}명</p>
        </div>
        {icon && <div className="text-2xl opacity-60">{icon}</div>}
      </div>
    </div>
  );
}