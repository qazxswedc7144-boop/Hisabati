import React from 'react';

interface PdfXlsExportIconProps {
  className?: string;
  size?: number;
}

/**
 * Combined PDF + Excel export icon.
 * A stylized document with folded corner, spreadsheet grid, red PDF badge, and green X badge.
 * Fixed colors by design (represents export formats, not theme-aware).
 */
export const PdfXlsExportIcon: React.FC<PdfXlsExportIconProps> = ({
  className,
  size = 24,
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* Document base gradient */}
        <linearGradient id="pdfxls-doc" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E8ECEF" />
        </linearGradient>
        {/* Folded corner gradient */}
        <linearGradient id="pdfxls-fold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F5F7F8" />
          <stop offset="100%" stopColor="#C7CDD2" />
        </linearGradient>
        {/* PDF badge gradient */}
        <linearGradient id="pdfxls-pdf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#EF3B2D" />
          <stop offset="100%" stopColor="#C71C0E" />
        </linearGradient>
        {/* X badge gradient */}
        <linearGradient id="pdfxls-x" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#23B14D" />
          <stop offset="100%" stopColor="#1A8F3C" />
        </linearGradient>
        {/* Drop shadow for badges */}
        <filter id="pdfxls-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#000" floodOpacity="0.28" />
        </filter>
      </defs>

      {/* ── Document base with folded corner ── */}
      <path
        d="
          M 14 6
          L 40 6
          L 52 18
          L 52 54
          Q 52 58 48 58
          L 14 58
          Q 10 58 10 54
          L 10 10
          Q 10 6 14 6
          Z
        "
        fill="url(#pdfxls-doc)"
        stroke="#B8BFC5"
        strokeWidth="1"
      />

      {/* ── Folded corner triangle ── */}
      <path
        d="M 40 6 L 52 18 L 42 18 Q 40 18 40 16 Z"
        fill="url(#pdfxls-fold)"
        stroke="#B8BFC5"
        strokeWidth="1"
        strokeLinejoin="round"
      />

      {/* ── Text lines (left half of doc) ── */}
      <rect x="16" y="26" width="14" height="2.4" rx="1.2" fill="#C9CFD4" />
      <rect x="16" y="31" width="16" height="2.4" rx="1.2" fill="#C9CFD4" />
      <rect x="16" y="36" width="11" height="2.4" rx="1.2" fill="#C9CFD4" />

      {/* ── Spreadsheet grid (right side) ── */}
      <g>
        {/* Grid container background */}
        <rect x="30" y="20" width="20" height="20" rx="1.5" fill="#FFFFFF" stroke="#C9CFD4" strokeWidth="0.8" />
        {/* Green filled cells (top row and left column) */}
        <rect x="30.5" y="20.5" width="6" height="6" fill="#23B14D" />
        <rect x="36.5" y="20.5" width="6" height="6" fill="#23B14D" />
        <rect x="42.5" y="20.5" width="7" height="6" fill="#23B14D" />
        <rect x="30.5" y="26.5" width="6" height="6" fill="#23B14D" />
        <rect x="30.5" y="32.5" width="6" height="7" fill="#23B14D" />
        {/* White cells (implicit via container), draw separators */}
        <line x1="30" y1="26.5" x2="50" y2="26.5" stroke="#C9CFD4" strokeWidth="0.6" />
        <line x1="30" y1="32.5" x2="50" y2="32.5" stroke="#C9CFD4" strokeWidth="0.6" />
        <line x1="36.5" y1="20" x2="36.5" y2="40" stroke="#C9CFD4" strokeWidth="0.6" />
        <line x1="42.5" y1="20" x2="42.5" y2="40" stroke="#C9CFD4" strokeWidth="0.6" />
      </g>

      {/* ── PDF badge (bottom-left) ── */}
      <g filter="url(#pdfxls-shadow)">
        <rect
          x="8"
          y="38"
          width="26"
          height="14"
          rx="3.2"
          fill="url(#pdfxls-pdf)"
        />
        <text
          x="21"
          y="48.3"
          textAnchor="middle"
          fontFamily="Helvetica, Arial, sans-serif"
          fontSize="8.5"
          fontWeight="900"
          fill="#FFFFFF"
          letterSpacing="0.4"
        >
          PDF
        </text>
      </g>

      {/* ── X badge (bottom-right) ── */}
      <g filter="url(#pdfxls-shadow)">
        <rect
          x="36"
          y="38"
          width="20"
          height="14"
          rx="3.2"
          fill="url(#pdfxls-x)"
        />
        <text
          x="46"
          y="49"
          textAnchor="middle"
          fontFamily="Helvetica, Arial, sans-serif"
          fontSize="11"
          fontWeight="900"
          fill="#FFFFFF"
        >
          X
        </text>
      </g>
    </svg>
  );
};

