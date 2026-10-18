import QRCode from 'qrcode';
import { useMemo } from 'react';

/** Draws text as a QR code in SVG, with a quiet zone, at error correction level M. */
export function QrCode({ text, label }: { text: string; label: string }) {
  const { size, path } = useMemo(() => {
    const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const quiet = 4;
    let d = '';
    for (let row = 0; row < modules.size; row++) {
      for (let col = 0; col < modules.size; col++) {
        if (modules.get(row, col)) d += `M${col + quiet} ${row + quiet}h1v1h-1z`;
      }
    }
    return { size: modules.size + quiet * 2, path: d };
  }, [text]);

  return (
    <svg className="qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
