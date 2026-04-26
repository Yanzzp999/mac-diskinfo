type BadgeType = 'success' | 'warning' | 'danger' | 'info' | 'default';

interface StatusBadgeProps {
  label: string;
  type?: BadgeType;
  className?: string;
}

export function StatusBadge({ label, type = 'default', className = '' }: StatusBadgeProps) {
  const baseClasses = "px-2 py-0.5 rounded-full text-[11px] font-medium border";
  const typeClasses = {
    success: "bg-success-soft text-success border-success/20",
    warning: "bg-warning-soft text-warning border-warning/20",
    danger: "bg-danger-soft text-danger border-danger/20",
    info: "bg-primary-soft text-primary border-primary/20",
    default: "bg-control text-muted border-separator"
  };

  return (
    <span className={`${baseClasses} ${typeClasses[type]} ${className}`}>
      {label}
    </span>
  );
}
