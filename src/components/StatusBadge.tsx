type BadgeType = 'success' | 'warning' | 'danger' | 'info' | 'default';

interface StatusBadgeProps {
  label: string;
  type?: BadgeType;
  className?: string;
}

export function StatusBadge({ label, type = 'default', className = '' }: StatusBadgeProps) {
  const baseClasses = "px-2 py-0.5 rounded-full text-[11px] font-normal border";
  const typeClasses = {
    success: "bg-[#32d74b]/10 text-[#32d74b] border-[#32d74b]/15",
    warning: "bg-[#ff9f0a]/10 text-[#ff9f0a] border-[#ff9f0a]/15",
    danger: "bg-[#ff453a]/10 text-[#ff453a] border-[#ff453a]/15",
    info: "bg-[#007AFF]/10 text-[#64d2ff] border-[#007AFF]/15",
    default: "bg-white/[0.04] text-[#a1a1a6] border-white/[0.06]"
  };

  return (
    <span className={`${baseClasses} ${typeClasses[type]} ${className}`}>
      {label}
    </span>
  );
}
