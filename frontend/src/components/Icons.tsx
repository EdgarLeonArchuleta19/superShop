import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

const base = (props: P) => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...props,
});

export const IconCheck = (p: P) => (
  <svg {...base(p)}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const IconChevronRight = (p: P) => (
  <svg {...base(p)}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);

export const IconChevronLeft = (p: P) => (
  <svg {...base(p)}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);

export const IconChevronDown = (p: P) => (
  <svg {...base(p)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const IconSun = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

export const IconMoon = (p: P) => (
  <svg {...base(p)}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </svg>
);

export const IconLogout = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </svg>
);

export const IconMenu = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

export const IconX = (p: P) => (
  <svg {...base(p)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const IconPlus = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconPencil = (p: P) => (
  <svg {...base(p)}>
    <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
  </svg>
);

export const IconTrash = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
  </svg>
);

export const IconDownload = (p: P) => (
  <svg {...base(p)}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </svg>
);

export const IconExternalLink = (p: P) => (
  <svg {...base(p)}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
  </svg>
);

export const IconCopy = (p: P) => (
  <svg {...base(p)}>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

export const IconGrid = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

export const IconClipboard = (p: P) => (
  <svg {...base(p)}>
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 12h6M9 16h6" />
  </svg>
);

export const IconStore = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 9.5 4.6 4h14.8L21 9.5M4 9.5h16M5 9.5V20h14V9.5M9 20v-6h6v6" />
  </svg>
);

export const IconRegister = (p: P) => (
  <svg {...base(p)}>
    <rect x="2" y="7" width="20" height="12" rx="2" />
    <path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2M6 12h.01M10 12h.01M14 12h.01M18 12h.01M6 16h12" />
  </svg>
);

export const IconUser = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);

export const IconAlert = (p: P) => (
  <svg {...base(p)}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);

export const IconInfo = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
);

export const IconCloudOff = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 3l18 18M18.7 18H7a4 4 0 0 1-.7-7.9M8.5 5.5A6 6 0 0 1 18 10a4 4 0 0 1 2.5 6.7" />
  </svg>
);

export const IconCloudCheck = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 18a4.5 4.5 0 0 1-.4-9A6.5 6.5 0 0 1 19 10.5 4 4 0 0 1 18 18H7Z" />
    <path d="m9.5 14 2 2 3.5-3.5" />
  </svg>
);

export const IconRefresh = (p: P) => (
  <svg {...base(p)}>
    <path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" />
  </svg>
);

export const IconBell = (p: P) => (
  <svg {...base(p)}>
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
);

export const IconCalendar = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
    <path d="M8 2.5v4M16 2.5v4M3 9.5h18" />
  </svg>
);

export const IconEye = (p: P) => (
  <svg {...base(p)}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const IconEyeOff = (p: P) => (
  <svg {...base(p)}>
    <path d="M9.9 4.2A10.6 10.6 0 0 1 12 4c6.5 0 10 7 10 7a17.8 17.8 0 0 1-3 4M6.6 6.6A17.6 17.6 0 0 0 2 11s3.5 7 10 7a10.5 10.5 0 0 0 4.4-.9" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20" />
  </svg>
);

interface StarProps extends P {
  filled?: boolean;
}

export const IconStar = ({ filled, ...p }: StarProps) => (
  <svg {...base(p)} fill={filled ? 'currentColor' : 'none'}>
    <path d="m12 2.6 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9Z" />
  </svg>
);

export const IconSettings = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </svg>
);

export const IconImage = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="18" height="18" rx="2.5" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="m21 15-4.5-4.5L6 21" />
  </svg>
);

export const IconLock = (p: P) => (
  <svg {...base(p)}>
    <rect x="4" y="10.5" width="16" height="10" rx="2" />
    <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
  </svg>
);

export const IconShield = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

export const IconUsers = (p: P) => (
  <svg {...base(p)}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export const IconBarChart2 = (p: P) => (
  <svg {...base(p)}>
    <path d="M18 20V10" />
    <path d="M14 20V4" />
    <path d="M10 20v-6" />
    <path d="M6 20v-10" />
  </svg>
);

export const IconFileArchive = (p: P) => (
  <svg {...base(p)}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <polyline points="14 2 14 8 20 8" />
    <path d="M12 10v6M10 14h4M10 18h4" />
  </svg>
);

export const IconUpload = (p: P) => (
  <svg {...base(p)}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
  </svg>
);

export const IconSuperShop = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5 10-5" />
    <path d="M2 12l10 5 10-5" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const IconHardDrive = (p: P) => (
  <svg {...base(p)}>
    <path d="M22 12.46V19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.46" />
    <path d="M6 16h12" />
    <path d="M10 12h8" />
    <path d="M14 8h4" />
  </svg>
);

export const IconFolder = (p: P) => (
  <svg {...base(p)}>
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  </svg>
);

export const IconKey = (p: P) => (
  <svg {...base(p)}>
    <circle cx="7.5" cy="15.5" r="5.5" />
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3" />
  </svg>
);

export const IconGoogle = (p: P) => (
  <svg {...base(p)} viewBox="0 0 24 24">
    <path fill="#4285F4" d="M12.545 10.238v3.825h5.445l-2.723 2.723c-2.56 1.711-4.873 3.198-7.722 3.198-6.627 0-12-5.373-12-12s5.373-12 12-12c3.052 0 5.639 1.524 7.224 3.715L13.916 7.561c-.987-.987-2.348-1.53-3.866-1.53-4.418 0-8 3.582-8 8s3.582 8 8 8c2.063 0 3.873.91 5.056-2.305l-3.164-3.164c-.581.581-1.406.923-2.337.923-2.93 0-5.409-2.196-5.953-5.071h8.61z"/>
    <path fill="#34A853" d="M12 23c3.473 0 6.333-1.214 8.438-3.226l-3.115-3.115c-.722.722-1.703 1.158-2.773 1.158-2.594 0-4.84-1.923-5.323-4.457H4v3.247c3.28 2.253 7.734 3.6 12.545 3.6 5.523 0 10-4.477 10-10S17.523 2 12 2"/>
    <path fill="#FBBC05" d="M4 12c0-1.923 1.582-3.653 3.715-3.995v3.539H4v3.825z"/>
    <path fill="#EA4335" d="M12 2c2.063 0 3.873.91 5.056 2.305l3.164 3.164c.581-.581 1.406-.923 2.337-.923 2.93 0 5.409 2.196 5.953 5.071H20v-3.247c-3.28-2.253-7.734-3.6-12.545-3.6"/>
  </svg>
);

export const IconGoogleDrive = (p: P) => (
  <svg {...base(p)} viewBox="0 0 24 24" fill="none">
    <path fill="#4285F4" d="M19.1 10.9c-.5-1.1-1.2-2.2-2-3.1V6.9l-6 6 6 6v-3.1c.8-.9 1.5-2 2-3.1zm-10 6v-2.5c1.8 1.2 4.2 1.9 6.7 1.9 4.5 0 8.2-3.7 8.2-8.2s-3.7-8.2-8.2-8.2c-2.3 0-4.3 1.1-5.7 2.7L7 5.8C8.3 3.9 9.9 3 11.8 3c5.4 0 9.8 4.4 9.8 9.8s-4.4 9.8-9.8 9.8c-1.9 0-3.6-.7-4.9-1.8l4-4.3z"/>
    <path fill="#34A853" d="M12 21.8c2.3 0 4.3-1.1 5.7-2.7l-4-4.3c-.8.8-1.9 1.3-3.2 1.3-3.5 0-6.4-2.8-6.8-6.3V6.9h6.3l-6-6-6 6v3.9c0 2.4 1.4 4.5 3.5 5.5.3-.4.6-.7.9-1.1zm-1.4-6.6v2.5c-1.8-1.2-4.2-1.9-6.7-1.9-4.5 0-8.2 3.7-8.2 8.2s3.7 8.2 8.2 8.2c2.3 0 4.3-1.1 5.7-2.7l-4-4.3z"/>
    <path fill="#FBBC05" d="M5.3 11.5v2.5c0 1.9 1.4 3.6 3.3 3.9v-1.7c-1.3-.6-2.2-1.8-2.2-3.2 0-1.7 1.2-3.1 2.8-3.6V6.5l-3.8 3.5z"/>
    <path fill="#EA4335" d="M12 5.2c1.9 0 3.5.7 4.8 1.8l3.8-3.8C18.7 1.4 15.5 0 12 0 6.5 0 2 4.4 2 10c0 1.7.6 3.2 1.6 4.3L5.3 11.5z"/>
  </svg>
);

