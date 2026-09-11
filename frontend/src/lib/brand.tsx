export const APP_NAME = "SW Factory";

export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect x="4" y="4" width="24" height="24" rx="6" fill="#2563eb" />
      <path
        fill="#ffffff"
        d="M10 21.5V10.5h3.1c2.4 0 3.9 1.2 3.9 3.2 0 1.3-.7 2.3-1.9 2.8l2.4 5h-2.5l-2.1-4.5h-.8V21.5H10zm2.1-6.3h.9c1.1 0 1.7-.5 1.7-1.4s-.6-1.3-1.7-1.3h-.9v2.7zM19.2 21.5l2.6-11h2.4l2.6 11h-2.3l-.4-2h-2.2l-.4 2h-2.3zm3.4-3.8h1.4l-.7-3.3-.7 3.3z"
      />
    </svg>
  );
}
