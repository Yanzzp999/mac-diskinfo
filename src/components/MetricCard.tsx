interface MetricCardProps {
  label: string;
  value: import('react').ReactNode;
  icon?: import('react').ReactNode;
}

export function MetricCard({ label, value, icon }: MetricCardProps) {
  return (
    <div className="bg-surface border border-separator rounded-lg py-3 px-3.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {icon && <div className="text-subtle [&>svg]:w-4 [&>svg]:h-4">{icon}</div>}
        <span className="text-[13px] text-muted">{label}</span>
      </div>
      <span className="text-[13px] font-medium text-foreground font-mono text-right">{value}</span>
    </div>
  );
}
