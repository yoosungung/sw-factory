import appIconUrl from "../../icons/app-icon.svg?url";

export const APP_NAME = "SW Factory";

export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <img
      className="brand-mark"
      src={appIconUrl}
      width={size}
      height={size}
      alt=""
      aria-hidden
    />
  );
}
