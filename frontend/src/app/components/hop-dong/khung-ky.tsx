'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Khung vẽ chữ ký — ngón tay trên điện thoại, chuột trên máy tính. Tự viết
 * (canvas + pointer events) thay vì thêm thư viện cho chừng này việc.
 *
 * `onDoi(png)` nhận ảnh PNG dạng data URL mỗi khi vẽ xong một nét, hoặc `null`
 * khi xoá.
 */
export function KhungKy({ onDoi }: { onDoi: (png: string | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dangVe = useRef(false);
  const [coNet, setCoNet] = useState(false);

  // Vẽ theo mật độ điểm ảnh thật của màn hình cho nét khỏi răng cưa.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const tyLe = Math.max(window.devicePixelRatio || 1, 1);
    const r = c.getBoundingClientRect();
    c.width = Math.round(r.width * tyLe);
    c.height = Math.round(r.height * tyLe);
    const ctx = c.getContext('2d')!;
    ctx.scale(tyLe, tyLe);
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0b1f4a';
  }, []);

  const diem = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const batDau = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dangVe.current = true;
    const ctx = e.currentTarget.getContext('2d')!;
    const p = diem(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.1, p.y + 0.1);
    ctx.stroke();
  };

  const ve = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dangVe.current) return;
    e.preventDefault();
    const ctx = e.currentTarget.getContext('2d')!;
    const p = diem(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const xong = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dangVe.current) return;
    dangVe.current = false;
    setCoNet(true);
    onDoi(e.currentTarget.toDataURL('image/png'));
  };

  const xoa = () => {
    const c = canvas.current;
    if (!c) return;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setCoNet(false);
    onDoi(null);
  };

  return (
    <div>
      <div className="relative">
        <canvas
          ref={canvas}
          className="h-44 w-full touch-none rounded-xl border-2 border-dashed border-slate-300 bg-white"
          onPointerDown={batDau}
          onPointerMove={ve}
          onPointerUp={xong}
          onPointerLeave={xong}
          aria-label="Khung ký tên"
        />
        {!coNet && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">
            Ký vào đây
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={xoa}
        className="mt-2 cursor-pointer text-sm text-slate-500 underline hover:text-slate-700"
      >
        Ký lại
      </button>
    </div>
  );
}
