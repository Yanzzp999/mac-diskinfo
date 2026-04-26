import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;
type IconBaseProps = IconProps & {
  children: ReactNode;
};

function Icon({ children, ...props }: IconBaseProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function Activity(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13.2 3.2a1 1 0 0 1 .73.86l1.18 8.27 1.35-3.38A1 1 0 0 1 17.4 8.3H22v2h-3.92l-2.22 5.55a1 1 0 0 1-1.92-.2l-1.08-7.58-2.03 11.1a1 1 0 0 1-1.95.1L6.7 11.1l-.84 2.1a1 1 0 0 1-.93.63H2v-2h2.26l1.67-4.18a1 1 0 0 1 1.9.15l1.83 7.36 2.36-11.14a1 1 0 0 1 1.18-.82Z" />
    </Icon>
  );
}

export function AlertTriangle(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12.86 3.52 22.6 20.4a1 1 0 0 1-.86 1.5H2.26a1 1 0 0 1-.86-1.5l9.74-16.88a1 1 0 0 1 1.72 0ZM11 9v5h2V9h-2Zm0 7v2h2v-2h-2Z" />
    </Icon>
  );
}

export function ArrowDownToLine(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M11 4h2v8.18l3.3-3.3 1.4 1.42L12 16l-5.7-5.7 1.4-1.42 3.3 3.3V4ZM5 19h14v2H5v-2Z" />
    </Icon>
  );
}

export function ArrowUpCircle(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 14h-2V9.83l-2.59 2.58L7 11l5-5 5 5-1.41 1.41L13 9.83V16Z" />
    </Icon>
  );
}

export function ArrowUpFromLine(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M11 20v-8.18l-3.3 3.3-1.4-1.42L12 8l5.7 5.7-1.4 1.42-3.3-3.3V20h-2ZM5 3h14v2H5V3Z" />
    </Icon>
  );
}

export function Cable(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 3h8a2 2 0 0 1 2 2v3h1.5A2.5 2.5 0 0 1 21 10.5V13a5 5 0 0 1-5 5h-3v3h-2v-3H8a5 5 0 0 1-5-5v-2.5A2.5 2.5 0 0 1 5.5 8H7V3Zm2 2v3h6V5H9Zm-3.5 5a.5.5 0 0 0-.5.5V13a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-2.5a.5.5 0 0 0-.5-.5h-13Z" />
    </Icon>
  );
}

export function ChevronDown(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7.4 8.6 12 13.17l4.6-4.57L18 10l-6 6-6-6 1.4-1.4Z" />
    </Icon>
  );
}

export function ChevronRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9.4 18-1.4-1.4 4.57-4.6L8 7.4 9.4 6l6 6-6 6Z" />
    </Icon>
  );
}

export function Clock(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 2a10 10 0 1 0 .01 0H12Zm1 5v4.55l3.22 1.93-.95 1.6L11 12.5V7h2Z" />
    </Icon>
  );
}

export function Clock3(props: IconProps) {
  return <Clock {...props} />;
}

export function Database(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3C7.58 3 4 4.34 4 6v12c0 1.66 3.58 3 8 3s8-1.34 8-3V6c0-1.66-3.58-3-8-3Zm0 2c3.64 0 5.75.84 6 1-.25.16-2.36 1-6 1s-5.75-.84-6-1c.25-.16 2.36-1 6-1ZM6 9.1c1.45.57 3.58.9 6 .9s4.55-.33 6-.9V12c-.25.16-2.36 1-6 1s-5.75-.84-6-1V9.1Zm0 6c1.45.57 3.58.9 6 .9s4.55-.33 6-.9V18c-.25.16-2.36 1-6 1s-5.75-.84-6-1v-2.9Z" />
    </Icon>
  );
}

export function Download(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M11 4h2v8.18l3.3-3.3 1.4 1.42L12 16l-5.7-5.7 1.4-1.42 3.3 3.3V4Zm-6 14h14v2H5v-2Z" />
    </Icon>
  );
}

export function ExternalLink(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14 3h7v7h-2V6.42l-9.3 9.29-1.41-1.41L17.58 5H14V3ZM5 5h7v2H6v11h11v-6h2v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
    </Icon>
  );
}

export function Gauge(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4a9 9 0 0 0-9 9c0 2.44.98 4.65 2.57 6.27A2.5 2.5 0 0 0 7.36 20h9.28c.68 0 1.33-.27 1.79-.73A8.97 8.97 0 0 0 12 4Zm0 2a7 7 0 0 1 5.02 11.88.52.52 0 0 1-.38.12H7.36a.52.52 0 0 1-.38-.12A7 7 0 0 1 12 6Zm4.24 3.76-3.53 3.53A2 2 0 1 1 11.29 12l3.53-3.53 1.42 1.29Z" />
    </Icon>
  );
}

export function HardDrive(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.2 4h13.6c.94 0 1.75.65 1.95 1.57L22 11.25V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6.75l1.25-5.68A2 2 0 0 1 5.2 4Zm0 2-1.1 5h15.8l-1.1-5H5.2ZM4 13v5h16v-5H4Zm12.5 1.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" />
    </Icon>
  );
}

export function HeartPulse(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 21.35 10.55 20C5.4 15.26 2 12.14 2 8.32 2 5.2 4.42 3 7.35 3A5.8 5.8 0 0 1 12 5.1 5.8 5.8 0 0 1 16.65 3C19.58 3 22 5.2 22 8.32c0 1.9-.84 3.65-2.33 5.55H16.2l-1.34-2.18a1 1 0 0 0-1.74.09l-1.58 3.48-1.7-6.78a1 1 0 0 0-1.91-.14l-1.55 4.03H3.98c1.43 1.94 3.7 4.02 6.57 6.66L12 21.35Zm.05-4.45 2.05-4.52.72 1.17a1 1 0 0 0 .85.48h2.1c.45-.57.82-1.1 1.12-1.62h-2.66l-1.18-1.92a1 1 0 0 0-1.74.09l-1.33 2.92-1.67-6.66a1 1 0 0 0-1.91-.14L6.24 12.4H3.95c.1.18.22.37.34.55h2.64a1 1 0 0 0 .94-.64l1.2-3.12 2.02 8.06a1 1 0 0 0 1.86.17Z" />
    </Icon>
  );
}

export function Loader2(props: IconProps) {
  return (
    <Icon {...props}>
      <path opacity="0.25" d="M12 2a10 10 0 1 0 10 10h-3a7 7 0 1 1-7-7V2Z" />
      <path d="M12 2v3a7 7 0 0 1 7 7h3A10 10 0 0 0 12 2Z" />
    </Icon>
  );
}

export function Power(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M11 2h2v10h-2V2Zm5.83 3.17-1.42 1.42A7 7 0 1 1 8.59 6.6L7.17 5.17a9 9 0 1 0 9.66 0Z" />
    </Icon>
  );
}

export function RefreshCw(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 0 0-7.75 6H2l3.3 3.3L8.75 10H6.32A6 6 0 0 1 12 6c1.66 0 3.14.69 4.22 1.78L14 10h8V2l-4.35 4.35ZM6.35 17.65A7.95 7.95 0 0 0 12 20a8 8 0 0 0 7.75-6H22l-3.3-3.3L15.25 14h2.43A6 6 0 0 1 12 18a5.96 5.96 0 0 1-4.22-1.78L10 14H2v8l4.35-4.35Z" />
    </Icon>
  );
}

export function Rows3(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 5h16v3H4V5Zm0 5.5h16v3H4v-3ZM4 16h16v3H4v-3Z" />
    </Icon>
  );
}

export function Shield(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 2 20 5.5v6.1c0 5.05-3.42 8.74-8 10.4-4.58-1.66-8-5.35-8-10.4V5.5L12 2Zm0 2.2L6 6.82v4.78c0 3.8 2.36 6.6 6 8.25 3.64-1.65 6-4.45 6-8.25V6.82L12 4.2Z" />
    </Icon>
  );
}

export function ShieldCheck(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 2 20 5.5v6.1c0 5.05-3.42 8.74-8 10.4-4.58-1.66-8-5.35-8-10.4V5.5L12 2Zm4.47 7.65-1.42-1.42-4.05 4.05-1.72-1.72-1.42 1.42L11 15.12l5.47-5.47Z" />
    </Icon>
  );
}

export function Thermometer(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14 14.76V5a4 4 0 0 0-8 0v9.76A5 5 0 1 0 14 14.76ZM10 3a2 2 0 0 1 2 2v10.65l.44.3A3 3 0 1 1 7.56 16l.44-.3V5a2 2 0 0 1 2-2Zm1 5H9v6.54a2 2 0 1 0 2 0V8Z" />
    </Icon>
  );
}

export function TriangleAlert(props: IconProps) {
  return <AlertTriangle {...props} />;
}

export function X(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M18.3 5.71 16.89 4.3 12 9.17 7.11 4.3 5.7 5.71 10.59 10.6 5.7 15.49l1.41 1.41L12 12.03l4.89 4.87 1.41-1.41-4.89-4.89 4.89-4.89Z" />
    </Icon>
  );
}

export function Zap(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
    </Icon>
  );
}
