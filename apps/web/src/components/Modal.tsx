/**
 * หน้าต่างลอยที่บังเฉพาะกระดาน ไม่บังแผงรายละเอียดการ์ดด้านขวา
 * (อ่านเอฟเฟกต์การ์ดไปพร้อมกับตัดสินใจได้)
 */
export function Modal({
  children,
  onClose,
  title,
  subtitle,
  wide,
}: {
  children: React.ReactNode;
  /** ไม่ระบุ = ปิดเองไม่ได้ (ต้องเลือก) */
  onClose?: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-y-0 left-0 right-[var(--sidebar)] z-40 flex items-center justify-center bg-black/65 p-6" onClick={onClose}>
      <div
        className={`hud-panel flex max-h-full w-full flex-col gap-4 overflow-y-auto rounded-xl p-5 ${
          wide ? 'max-w-4xl' : 'max-w-2xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1">
            {subtitle && <div className="text-xs text-slate-400">{subtitle}</div>}
            <h2 className="text-xl font-bold">{title}</h2>
          </div>
          {onClose && (
            <button type="button" onClick={onClose} className="rounded px-2 text-xl text-slate-400 hover:bg-white/10 hover:text-white">
              ✕
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

const btn = 'rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40';
export const BTN = {
  primary: `${btn} btn-game font-bold`,
  secondary: `${btn} btn-steel`,
  ghost: `${btn} text-slate-400 hover:bg-white/10 hover:text-white`,
};
