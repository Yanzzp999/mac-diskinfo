interface MetricCardProps {
  label: string;
  value: import('react').ReactNode;
  icon?: import('react').ReactNode;
}

export function MetricCard({ label, value, icon }: MetricCardProps) {
  return (
    <div className="bg-surface hover:bg-surface-hover/50 transition-colors duration-200 rounded-xl p-4 border border-white/5 flex items-center space-x-4 group">
      {icon && (
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:bg-blue-500/20 transition-colors">
          {icon}
        </div>
      )}
      <div className="flex flex-col">
        <span className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">{label}</span>
        <span className="text-lg font-semibold text-slate-100">{value}</span>
      </div>
    </div>
  );
}
