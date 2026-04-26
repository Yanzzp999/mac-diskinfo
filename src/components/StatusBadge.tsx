type BadgeType = 'success' | 'warning' | 'danger' | 'info' | 'default';

interface StatusBadgeProps {
  label: string;
  type?: BadgeType;
  className?: string;
}

export function StatusBadge({ label, type = 'default', className = '' }: StatusBadgeProps) {
  const baseClasses = "px-2 py-0.5 rounded-full text-[11px] font-normal border";
  const typeClasses = {
    success: "bg-[#34A853]/10 text-[#34A853] border-[#34A853]/15",
    warning: "bg-[#FBBC04]/10 text-[#FBBC04] border-[#FBBC04]/15",
    danger: "bg-[#EA4335]/10 text-[#EA4335] border-[#EA4335]/15",
    info: "bg-[#4285F4]/10 text-[#4285F4] border-[#4285F4]/15",
    default: "bg-white/[0.04] text-[#a1a1a6] border-white/[0.06]"
  };

  return (
    <span className={`${baseClasses} ${typeClasses[type]} ${className}`}>
      {label}
    </span>
  );
}
