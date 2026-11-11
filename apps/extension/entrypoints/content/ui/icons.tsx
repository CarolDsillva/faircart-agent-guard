/** Small stroke icons drawn with currentColor (16px grid). */
type P = { size?: number };
const S = ({ size = 16, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const IconScan = (p: P) => (
  <S {...p}>
    <path d="M2 5V3a1 1 0 0 1 1-1h2M11 2h2a1 1 0 0 1 1 1v2M14 11v2a1 1 0 0 1-1 1h-2M5 14H3a1 1 0 0 1-1-1v-2M4.5 8h7" />
  </S>
);
export const IconTarget = (p: P) => (
  <S {...p}>
    <circle cx="8" cy="8" r="5.5" />
    <circle cx="8" cy="8" r="1.5" />
  </S>
);
export const IconCompare = (p: P) => (
  <S {...p}>
    <path d="M5 2v12M11 2v12M2.5 5.5h5M8.5 10.5h5" />
  </S>
);
export const IconHistory = (p: P) => (
  <S {...p}>
    <path d="M2 12.5l3.5-4 3 2.5L14 4.5" />
    <path d="M11 4.5h3v3" />
  </S>
);
export const IconTag = (p: P) => (
  <S {...p}>
    <path d="M8.6 2H13a1 1 0 0 1 1 1v4.4a1 1 0 0 1-.3.7l-5.6 5.6a1 1 0 0 1-1.4 0L2.3 9.3a1 1 0 0 1 0-1.4L7.9 2.3a1 1 0 0 1 .7-.3z" />
    <circle cx="11" cy="5" r="1" />
  </S>
);
export const IconReceipt = (p: P) => (
  <S {...p}>
    <path d="M3.5 1.5h9v13l-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1z" />
    <path d="M6 5h4M6 8h4M6 11h2" />
  </S>
);
export const IconList = (p: P) => (
  <S {...p}>
    <path d="M5.5 4h8M5.5 8h8M5.5 12h8" />
    <circle cx="2.5" cy="4" r=".6" />
    <circle cx="2.5" cy="8" r=".6" />
    <circle cx="2.5" cy="12" r=".6" />
  </S>
);
export const IconClose = (p: P) => (
  <S {...p}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </S>
);
export const IconPause = (p: P) => (
  <S {...p}>
    <path d="M6 3.5v9M10 3.5v9" />
  </S>
);
export const IconEyeOff = (p: P) => (
  <S {...p}>
    <path d="M2 2l12 12M6.6 6.6a2 2 0 0 0 2.8 2.8M4.2 4.3C2.9 5.1 2 6.4 1.5 8c1.1 3 3.7 4.5 6.5 4.5 1.2 0 2.3-.3 3.3-.8M7 3.6c.3-.1.7-.1 1-.1 2.8 0 5.4 1.5 6.5 4.5-.3.9-.8 1.7-1.4 2.4" />
  </S>
);
export const IconGear = (p: P) => (
  <S {...p}>
    <circle cx="8" cy="8" r="2" />
    <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
  </S>
);
export const IconPanel = (p: P) => (
  <S {...p}>
    <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
    <path d="M10 2.5v11" />
  </S>
);
export const IconBell = (p: P) => (
  <S {...p}>
    <path d="M4 11V7a4 4 0 0 1 8 0v4l1 1.5H3zM6.5 14h3" />
  </S>
);
export const IconExternal = (p: P) => (
  <S {...p}>
    <path d="M9 2.5h4.5V7M13.5 2.5L7.5 8.5M12 9.5V13a.5.5 0 0 1-.5.5h-8A.5.5 0 0 1 3 13V5a.5.5 0 0 1 .5-.5H7" />
  </S>
);

/** FairCart mark: a receipt edge with a check. */
export const Mark = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
    <path d="M5 3.5h10v13l-1.7-1.1-1.6 1.1-1.7-1.1-1.7 1.1-1.6-1.1L5 16.5z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M7.6 9.6l1.7 1.7 3.2-3.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
