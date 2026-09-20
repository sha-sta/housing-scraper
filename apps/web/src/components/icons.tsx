interface IconProps {
  className?: string;
}

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? "h-5 w-5"}
    >
      {children}
    </svg>
  );
}

export const IconFeed = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 5.5h14M3 10h14M3 14.5h9" />
  </Svg>
);

export const IconMap = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 17s5.2-4.7 5.2-8.3A5.2 5.2 0 0 0 4.8 8.7C4.8 12.3 10 17 10 17Z" />
    <circle cx="10" cy="8.6" r="1.9" />
  </Svg>
);

export const IconPipeline = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3.5" width="4.2" height="13" rx="1" />
    <rect x="8.9" y="3.5" width="4.2" height="8.5" rx="1" />
    <rect x="14.8" y="3.5" width="2.2" height="5" rx="1" />
  </Svg>
);

export const IconDraft = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" />
    <path d="m3 6 7 5 7-5" />
  </Svg>
);

export const IconMore = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="4.5" cy="10" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="10" cy="10" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="10" r="1.1" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconBell = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 8.4a4 4 0 1 1 8 0c0 3 1.2 4.2 1.7 4.6H4.3C4.8 12.6 6 11.4 6 8.4Z" />
    <path d="M8.3 15.4a1.9 1.9 0 0 0 3.4 0" />
  </Svg>
);

export const IconStar = ({ className, filled }: IconProps & { filled?: boolean }) => (
  <svg
    viewBox="0 0 20 20"
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className ?? "h-5 w-5"}
  >
    <path d="m10 3 2.2 4.5 4.9.7-3.6 3.5.9 4.9L10 14.3 5.6 16.6l.9-4.9L2.9 8.2l4.9-.7Z" />
  </svg>
);

export const IconHide = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 10s2.8-4.5 7-4.5c1.3 0 2.4.4 3.4 1M17 10s-2.8 4.5-7 4.5c-1.3 0-2.5-.4-3.5-1" />
    <path d="m3.5 3.5 13 13" />
  </Svg>
);

export const IconShow = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 10s2.8-4.5 7-4.5S17 10 17 10s-2.8 4.5-7 4.5S3 10 3 10Z" />
    <circle cx="10" cy="10" r="1.8" />
  </Svg>
);

export const IconBack = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12.5 4.5 7 10l5.5 5.5" />
  </Svg>
);

export const IconChevron = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5.5 8 4.5 4.5L14.5 8" />
  </Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 5 10 10M15 5 5 15" />
  </Svg>
);

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="9" r="5" />
    <path d="m13 13 4 4" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m4 10.5 4 4 8-9" />
  </Svg>
);

export const IconRefresh = (p: IconProps) => (
  <Svg {...p}>
    <path d="M16 6.5A7 7 0 1 0 17 10" />
    <path d="M16.5 3v3.8h-3.8" />
  </Svg>
);

export const IconExternal = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 4H4.5v11.5H16V12" />
    <path d="M11.5 3.5H16.5v5M16.5 3.5 9.5 10.5" />
  </Svg>
);

export const IconPhone = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5.2c0-.7.6-1.3 1.3-1.3h1.6c.6 0 1.1.4 1.2 1l.5 2.2c.1.5-.1 1-.5 1.2l-1 .6a9.2 9.2 0 0 0 4 4l.6-1c.3-.4.8-.6 1.2-.5l2.2.5c.6.1 1 .6 1 1.2v1.6c0 .7-.6 1.3-1.3 1.3A11.8 11.8 0 0 1 4 5.2Z" />
  </Svg>
);

export const IconMail = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" />
    <path d="m3 6 7 5 7-5" />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 4.5v11M4.5 10h11" />
  </Svg>
);

export const IconSettings = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="2.4" />
    <path d="M10 2.6v2M10 15.4v2M17.4 10h-2M4.6 10h-2M15.2 4.8l-1.4 1.4M6.2 13.8l-1.4 1.4M15.2 15.2l-1.4-1.4M6.2 6.2 4.8 4.8" />
  </Svg>
);

export const IconWarn = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 3.8 17 16H3Z" />
    <path d="M10 8.4v3.1M10 13.6v.1" />
  </Svg>
);

export const IconCopy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6.5" y="6.5" width="10" height="10" rx="1.5" />
    <path d="M13 4.5H4.8c-.7 0-1.3.6-1.3 1.3V13" />
  </Svg>
);
