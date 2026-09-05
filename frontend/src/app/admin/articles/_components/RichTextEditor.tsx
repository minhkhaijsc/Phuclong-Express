'use client';

import { useEffect, useRef } from 'react';

interface RichTextEditorProps {
  /** HTML ban đầu — chỉ đọc một lần lúc gắn, sau đó editor tự giữ nội dung */
  initialHtml: string;
  onChange: (html: string) => void;
  /** Tải ảnh từ máy lên, trả về đường dẫn để chèn vào bài. */
  onUploadImage?: (file: File) => Promise<string>;
}

interface ToolButton {
  label: string;
  title: string;
  command: string;
  value?: string;
  className?: string;
}

/**
 * Các nút định dạng. H2/H3 quan trọng với SEO: Google dựa vào thẻ tiêu đề
 * để hiểu bố cục bài, nên để người viết chia mục dễ dàng.
 */
const BUTTONS: ToolButton[] = [
  { label: 'B', title: 'In đậm', command: 'bold', className: 'font-bold' },
  { label: 'I', title: 'In nghiêng', command: 'italic', className: 'italic' },
  { label: 'U', title: 'Gạch chân', command: 'underline', className: 'underline' },
  { label: 'H2', title: 'Tiêu đề mục', command: 'formatBlock', value: 'h2' },
  { label: 'H3', title: 'Tiêu đề mục nhỏ', command: 'formatBlock', value: 'h3' },
  { label: '¶', title: 'Đoạn văn thường', command: 'formatBlock', value: 'p' },
  { label: '• ', title: 'Danh sách', command: 'insertUnorderedList' },
  { label: '1.', title: 'Danh sách đánh số', command: 'insertOrderedList' },
  { label: '❝', title: 'Trích dẫn', command: 'formatBlock', value: 'blockquote' },
];

/**
 * Trình soạn thảo đơn giản dựa trên contentEditable.
 *
 * Không dùng thư viện ngoài để khỏi thêm phụ thuộc nặng — bài viết tin tức
 * chỉ cần định dạng cơ bản, chèn ảnh và liên kết.
 */
export default function RichTextEditor({ initialHtml, onChange, onUploadImage }: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Chỉ nạp HTML một lần. Nếu gán lại mỗi lần render, con trỏ sẽ nhảy về đầu.
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== initialHtml) {
      ref.current.innerHTML = initialHtml;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exec = (btn: ToolButton) => {
    ref.current?.focus();
    document.execCommand(btn.command, false, btn.value);
    onChange(ref.current?.innerHTML ?? '');
  };

  const insertLink = () => {
    const url = window.prompt('Dán đường dẫn liên kết:');
    if (!url) return;
    ref.current?.focus();
    document.execCommand('createLink', false, url);
    onChange(ref.current?.innerHTML ?? '');
  };

  /** Chèn thẻ ảnh vào vị trí con trỏ. Google đọc `alt` để hiểu ảnh nên hỏi luôn. */
  const chenAnh = (url: string) => {
    const alt = window.prompt('Mô tả ảnh (giúp bài lên top ảnh Google):') || '';
    ref.current?.focus();
    document.execCommand(
      'insertHTML',
      false,
      `<img src="${url}" alt="${alt.replace(/"/g, '&quot;')}" />`,
    );
    onChange(ref.current?.innerHTML ?? '');
  };

  const insertImage = () => {
    const url = window.prompt('Dán đường dẫn ảnh:');
    if (url) chenAnh(url);
  };

  const taiAnhLen = async (file: File) => {
    if (!onUploadImage) return;
    // Ghi con trỏ lại trước khi mở hộp chọn file, vì lúc đó vùng soạn mất focus
    // và execCommand sẽ chèn nhầm chỗ.
    const url = await onUploadImage(file);
    if (url) chenAnh(url);
  };

  /** Dán từ Word/web thường kèm rác định dạng — chỉ giữ chữ */
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
    onChange(ref.current?.innerHTML ?? '');
  };

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
      <div className="flex flex-wrap items-center gap-1 bg-gray-50 border-b border-gray-200 px-2 py-1.5">
        {BUTTONS.map((b) => (
          <button
            key={b.label}
            type="button"
            title={b.title}
            onClick={() => exec(b)}
            className={`min-w-8 h-8 px-2 rounded text-sm text-gray-700 hover:bg-gray-200 ${b.className ?? ''}`}
          >
            {b.label}
          </button>
        ))}
        <span className="w-px h-5 bg-gray-300 mx-1" />
        <button
          type="button"
          title="Chèn liên kết"
          onClick={insertLink}
          className="min-w-8 h-8 px-2 rounded text-sm text-gray-700 hover:bg-gray-200"
        >
          🔗
        </button>
        <button
          type="button"
          title="Chèn ảnh bằng đường dẫn"
          onClick={insertImage}
          className="min-w-8 h-8 px-2 rounded text-sm text-gray-700 hover:bg-gray-200"
        >
          🖼️
        </button>
        {onUploadImage && (
          <>
            <button
              type="button"
              title="Tải ảnh từ máy lên rồi chèn vào bài"
              onClick={() => fileRef.current?.click()}
              className="min-w-8 h-8 px-2 rounded text-sm text-gray-700 hover:bg-gray-200"
            >
              ⬆🖼
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                // Xoá giá trị để chọn lại đúng ảnh vừa rồi vẫn kích hoạt onChange.
                e.target.value = '';
                if (file) await taiAnhLen(file);
              }}
            />
          </>
        )}
      </div>

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={() => onChange(ref.current?.innerHTML ?? '')}
        onPaste={handlePaste}
        className="article-content min-h-[420px] max-h-[70vh] overflow-y-auto px-4 py-3 outline-none text-gray-800"
      />
    </div>
  );
}
