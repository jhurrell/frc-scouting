import jsQR from 'jsqr';
import { useEffect, useRef, useState } from 'react';

/** Reads QR codes from the device camera. Calls onScan once per code, and again for the same code only after a pause. */
export function CameraScanner({ onScan }: { onScan: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const latestOnScan = useRef(onScan);
  latestOnScan.current = onScan;

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser only allows the camera on a secure page (HTTPS). Use the scanner or type instead.');
      return;
    }
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    let last = { text: '', at: 0 };
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true })!;

    function look() {
      if (stopped) return;
      const v = video.current;
      if (v && v.readyState >= v.HAVE_CURRENT_DATA && v.videoWidth > 0) {
        // A smaller frame decodes faster and still reads a QR code held near the camera.
        const scale = Math.min(1, 640 / v.videoWidth);
        canvas.width = Math.round(v.videoWidth * scale);
        canvas.height = Math.round(v.videoHeight * scale);
        context.drawImage(v, 0, 0, canvas.width, canvas.height);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
        const now = Date.now();
        if (code?.data && (code.data !== last.text || now - last.at > 3000)) {
          last = { text: code.data, at: now };
          latestOnScan.current(code.data);
        }
      }
      frame = requestAnimationFrame(look);
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(async (s) => {
        stream = s;
        if (stopped || !video.current) return;
        video.current.srcObject = s;
        await video.current.play();
        look();
      })
      .catch((e: unknown) => setError(`The camera didn't start: ${e instanceof Error ? e.message : String(e)}`));

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  if (error) return <p className="error">{error}</p>;
  return <video ref={video} className="camera" muted playsInline />;
}
