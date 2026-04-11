interface MetricCardProps {
  label: string;
  value: import('react').ReactNode;
  icon?: import('react').ReactNode;
}

export function MetricCard({ label, value, icon }: MetricCardProps) {
  return (
    <div className="bg-surface border border-separator rounded-lg py-2.5 px-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon && <div className="text-[#98989d] [&>svg]:w-4 [&>svg]:h-4">{icon}</div>}
        <span className="text-[13px] text-[#a1a1a6]">{label}</span>
      </div>
      <span className="text-[13px] font-medium text-[#f5f5f7] font-mono">{value}</span>
    </div>
  );
}
