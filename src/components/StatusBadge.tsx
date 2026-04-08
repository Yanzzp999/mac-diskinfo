type BadgeType = 'success' | 'warning' | 'danger' | 'info' | 'default';

interface StatusBadgeProps {
  label: string;
  type?: BadgeType;
  className?: string;
}

export function StatusBadge({ label, type = 'default', className = '' }: StatusBadgeProps) {
  const baseClasses = "px-2.5 py-0.5 rounded-md text-xs font-medium border tracking-wide uppercase";
  const typeClasses = {
    success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    danger: "bg-red-500/10 text-red-400 border-red-500/20",
    info: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    default: "bg-slate-700/30 text-slate-300 border-slate-600/30"
  };

  return (
    <span className={`${baseClasses} ${typeClasses[type]} ${className}`}>
      {label}
    </span>
  );
}
