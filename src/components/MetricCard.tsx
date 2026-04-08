interface MetricCardProps {
  label: string;
  value: import('react').ReactNode;
  icon?: import('react').ReactNode;
}

export function MetricCard({ label, value, icon }: MetricCardProps) {
  return (
    <div className="bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 transition-colors rounded-md py-2 px-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon && <div className="text-blue-400 [&>svg]:w-4 [&>svg]:h-4">{icon}</div>}
        <span className="text-[13px] text-slate-400">{label}</span>
      </div>
      <span className="text-[13px] font-medium text-slate-200 font-mono">{value}</span>
    </div>
  );
}
