'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { useProtectedLink } from '@/hooks/use-protected-link';
import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectFade, Autoplay } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/effect-fade';
import { FiSearch, FiTruck, FiPackage, FiShield, FiChevronLeft, FiChevronRight, FiLink } from 'react-icons/fi';
import { searchTracking } from '@/lib/api';
import { KhungXemAnh } from '@/app/components/tracking/xem-anh-tracking';
import type { Swiper as SwiperType } from 'swiper';

interface TrackingHistoryItem {
  ngay: string;
  tinhTrang: string;
  moTa: string;
  ghiChu: string;
}

interface TrackingResultState {
  status: 'pending' | 'found' | 'not_found' | 'error';
  message?: string;
  history?: TrackingHistoryItem[];
  anh?: string[];
}

// Brand colors: #14264b (navy) + #eb7325 (orange)
const colors = {
  primary: '#14264b',
  primaryHover: '#1f3a6d',
  accent: '#eb7325',
  accentHover: '#d65f15',
  text: '#111827',
  textLight: '#f8fafc',
};

/**
 * Hero Section Component
 *
 * Modern hero with full-width slider, glass tracking form, and bold typography.
 * Uses #14264b as primary color.
 */
export default function HeroSection() {
  const navigate = useProtectedLink();
  const [trackingCode, setTrackingCode] = useState('');
  const [trackingResult, setTrackingResult] = useState<TrackingResultState | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const swiperRef = useRef<SwiperType | null>(null);
  const [xemAnh, setXemAnh] = useState<number | null>(null);

  const slides = [
    { src: '/image1/slide-1.jpg', alt: 'Slide 1' },
    { src: '/image1/slide-2.jpg', alt: 'Slide 2' },
    { src: '/image1/slide-3.jpg', alt: 'Slide 3' },
    { src: '/image1/slide-4.jpg', alt: 'Slide 4' },
    { src: '/image1/slide-5.jpg', alt: 'Slide 5' },
  ];

  const handleTrackingSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingCode.trim()) return;

    setTrackingResult({ status: 'pending', message: 'Đang tra cứu...' });

    try {
      const result = await searchTracking(trackingCode.trim());
      if (result.found && ((result.history?.length ?? 0) > 0 || (result.anh?.length ?? 0) > 0)) {
        setTrackingResult({
          status: 'found',
          history: result.history ?? [],
          anh: result.anh ?? [],
        });
      } else {
        setTrackingResult({
          status: 'not_found',
          message: 'Không tìm thấy dữ liệu',
        });
      }
    } catch (error) {
      setTrackingResult({
        status: 'error',
        message: 'Có lỗi xảy ra khi tra cứu. Vui lòng thử lại sau.',
      });
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('vi-VN') + ' ' + date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  // Điện thoại cao theo nội dung; chỉ màn lớn mới cố định 90vh. Cố định trên
  // điện thoại thì khung tra cứu bị cắt đáy (mất kết quả + ảnh hàng) và thanh
  // chuyển slide đè lên nút Tìm kiếm.
  return (
    <section className="relative min-h-[620px] overflow-hidden lg:h-[90vh]">

      {/* Slider */}
      <div className="absolute inset-0">
        <Swiper
          modules={[EffectFade, Autoplay]}
          effect="fade"
          speed={1500}
          autoplay={{ delay: 5000, disableOnInteraction: false }}
          loop={true}
          className="h-full"
          onSwiper={(swiper) => { swiperRef.current = swiper; }}
          onSlideChange={(swiper) => setActiveIndex(swiper.realIndex)}
        >
          {slides.map((slide, index) => (
            <SwiperSlide key={index} className="h-full">
              <Image
                src={slide.src}
                alt={slide.alt}
                fill
                className="object-cover"
                priority={index === 0}
                loading={index === 0 ? 'eager' : 'lazy'}
                sizes="100vw"
              />
            </SwiperSlide>
          ))}
        </Swiper>

        {/* Cinematic overlay: dark left + dark bottom, image visible in center/right */}
        <div
          className="absolute inset-0 z-10"
          style={{
            background: 'linear-gradient(to right, rgba(10,25,40,0.85) 0%, rgba(10,25,40,0.5) 55%, rgba(10,25,40,0.2) 100%)',
          }}
        />
        <div
          className="absolute inset-0 z-10"
          style={{ background: 'linear-gradient(to top, rgba(10,25,40,0.7) 0%, transparent 50%)' }}
        />
      </div>

      {/* Content */}
      <div className="relative z-20 flex min-h-[620px] items-center pt-10 pb-24 lg:h-full lg:py-0">
        <div className="container mx-auto px-6 md:px-12 flex flex-col lg:flex-row items-center justify-between gap-10">

          {/* Left: Headline */}
          <div className="flex-1 text-left">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-0.5" style={{ backgroundColor: colors.accent }} />
              <span className="text-sm font-semibold tracking-widest uppercase" style={{ color: colors.accent }}>
                PLE
              </span>
            </div>
            <h1
              className="text-4xl md:text-6xl lg:text-4xl xl:text-5xl 2xl:text-7xl font-black leading-tight mb-4"
              style={{ color: '#ffffff', textShadow: '0 2px 20px rgba(0,0,0,0.4)' }}
            >
              Vận chuyển
              <br />
              <span className="text-3xl md:text-4xl lg:text-3xl xl:text-4xl 2xl:text-5xl font-bold" style={{ color: 'rgba(255,255,255,0.75)' }}>
                từ nước ngoài về{' '}
                <span style={{ color: colors.accent }}>Việt Nam</span>
              </span>
            </h1>
            <p className="text-sm md:text-base leading-relaxed max-w-lg mt-2 mb-5" style={{ color: 'rgba(255,255,255,0.75)' }}>
              Phuc Long Express hỗ trợ khách hàng mua hàng quốc tế, gom hàng và vận chuyển về Việt Nam từ nhiều thị trường: Mỹ, Anh, Tây Ban Nha, Ba Lan, Nhật... với quy trình rõ ràng, theo dõi dễ dàng và chi phí tối ưu.
            </p>
            {/* CTA Button */}
            <button
              onClick={() => navigate('/dat-hang')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white transition-all duration-200 hover:opacity-90 hover:shadow-lg cursor-pointer"
              style={{ backgroundColor: colors.accent }}
            >
              <FiLink className="w-4 h-4" />
              GỬI LINK SẢN PHẨM
            </button>
            {/* Feature pills */}
            <div className="flex flex-wrap gap-2 mt-5">
              <div
                className="px-3 py-1.5 rounded-full flex items-center gap-1.5 backdrop-blur-md text-sm font-medium"
                style={{ backgroundColor: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }}
              >
                <FiShield className="w-3.5 h-3.5" style={{ color: colors.accent }} />
                Bảo hiểm hàng hóa
              </div>
              <div
                className="px-3 py-1.5 rounded-full flex items-center gap-1.5 backdrop-blur-md text-sm font-medium"
                style={{ backgroundColor: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }}
              >
                <FiTruck className="w-3.5 h-3.5" style={{ color: colors.accent }} />
                Giao hàng toàn quốc
              </div>
            </div>
          </div>

          {/* Right: Tracking form */}
          <div
            className="w-full lg:w-[400px] flex-shrink-0 p-6 rounded-2xl backdrop-blur-xl"
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}
          >
            <h3 className="flex items-center justify-center gap-2 text-base font-bold mb-4 text-white">
              <FiPackage className="w-5 h-5" style={{ color: colors.accent }} />
              TRA CỨU TRACKING
            </h3>
            <form onSubmit={handleTrackingSearch} className="space-y-3">
              <input
                type="text"
                placeholder="Nhập mã tracking..."
                value={trackingCode}
                onChange={(e) => setTrackingCode(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-white placeholder-white/50 outline-none focus:ring-2 backdrop-blur-sm transition-all border bg-white/10"
                style={{ borderColor: 'rgba(255,255,255,0.2)', '--tw-ring-color': colors.primary } as React.CSSProperties}
              />
              {/* Always visible notice */}
              <div className="p-3 rounded-xl text-xs" style={{ backgroundColor: 'rgba(235,115,37,0.15)', border: '1px solid rgba(235,115,37,0.35)', color: 'rgba(255,255,255,0.85)' }}>
                Tracking chưa có thông tin. Quý khách vui lòng inbox nhóm làm việc ngay để được kiểm tra và giải đáp.
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl font-bold transition-all duration-200 cursor-pointer hover:opacity-90 hover:shadow-lg flex items-center justify-center gap-2 text-white"
                style={{ backgroundColor: colors.accent }}
              >
                <FiSearch className="w-4 h-4" />
                Tìm kiếm
              </button>
            </form>

            {/* Results */}
            {trackingResult && (
              <div className="mt-3 max-h-60 overflow-y-auto">
                {trackingResult.status === 'pending' && (
                  <div className="p-3 rounded-xl text-center text-sm animate-pulse text-white" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                    {trackingResult.message}
                  </div>
                )}
                {trackingResult.status === 'not_found' && (
                  <div className="p-3 rounded-xl text-sm" style={{ backgroundColor: 'rgba(239,68,68,0.25)', border: '1px solid rgba(239,68,68,0.3)' }}>
                    <p style={{ color: '#fca5a5' }}>{trackingResult.message}</p>
                  </div>
                )}
                {trackingResult.status === 'error' && (
                  <div className="p-3 rounded-xl text-sm" style={{ backgroundColor: 'rgba(239,68,68,0.25)', color: '#fca5a5' }}>
                    {trackingResult.message}
                  </div>
                )}
                {trackingResult.status === 'found' && (trackingResult.anh?.length ?? 0) > 0 && (
                  <div className="mb-2">
                    <p className="mb-1.5 text-xs font-medium" style={{ color: 'rgba(255,255,255,0.7)' }}>
                      Ảnh hàng ({trackingResult.anh!.length}) — bấm để xem lớn
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {trackingResult.anh!.map((src, idx) => (
                        <button
                          key={src}
                          type="button"
                          onClick={() => setXemAnh(idx)}
                          className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg cursor-zoom-in"
                          style={{ border: '1px solid rgba(255,255,255,0.25)' }}
                          aria-label={`Xem ảnh hàng ${idx + 1}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt="" className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {trackingResult.status === 'found' && trackingResult.history && (
                  <div className="space-y-2">
                    {trackingResult.history.map((item, idx) => (
                      <div key={idx} className="flex gap-3 p-3 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                        <div className="w-1/3 text-right">
                          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>{formatDate(item.ngay)}</p>
                        </div>
                        <div className="w-2/3">
                          <p className="text-sm font-medium text-white">{item.moTa}</p>
                          {item.ghiChu && (
                            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                              <span className="font-medium">Ghi chú:</span> {item.ghiChu}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Bottom bar: dots + arrows */}
      <div className="absolute bottom-6 left-0 right-0 z-30 flex items-center justify-center gap-6">
        {/* Prev */}
        <button
          type="button"
          aria-label="Previous slide"
          onClick={() => swiperRef.current?.slidePrev()}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer hover:bg-white/20"
          style={{ backgroundColor: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }}
        >
          <FiChevronLeft className="w-4 h-4 text-white" />
        </button>

        {/* Dots */}
        <div className="flex items-center gap-2">
          {slides.map((_, idx) => (
            <button
              key={idx}
              type="button"
              aria-label={`Go to slide ${idx + 1}`}
              onClick={() => { swiperRef.current?.slideToLoop(idx); setActiveIndex(idx); }}
              className="transition-all duration-300 cursor-pointer rounded-full"
              style={{
                width: activeIndex === idx ? '24px' : '8px',
                height: '8px',
                backgroundColor: activeIndex === idx ? colors.accent : 'rgba(255,255,255,0.4)',
              }}
            />
          ))}
        </div>

        {/* Next */}
        <button
          type="button"
          aria-label="Next slide"
          onClick={() => swiperRef.current?.slideNext()}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer hover:bg-white/20"
          style={{ backgroundColor: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }}
        >
          <FiChevronRight className="w-4 h-4 text-white" />
        </button>
      </div>

      {xemAnh !== null && trackingResult?.anh?.length ? (
        <KhungXemAnh
          anh={trackingResult.anh.map((src) => ({ src, ten: trackingCode.trim() }))}
          viTri={xemAnh}
          onDong={() => setXemAnh(null)}
        />
      ) : null}
    </section>
  );
}
