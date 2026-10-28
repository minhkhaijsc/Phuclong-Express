import JSZip from 'jszip';

/**
 * ĐIỀN HỢP ĐỒNG MẪU (.docx) — yêu cầu bên khách 28/10/2026:
 *   "up Hợp đồng mẫu và thông tin khách => Web tự tạo link hợp đồng có tên
 *    khách luôn", ký online "càng tốt".
 *
 * Mẫu là file Word thường, chỗ cần điền gõ `{TenO}` (chữ cái, số, gạch dưới).
 * Ô nào tên bắt đầu bằng `ChuKy` là chỗ đặt ẢNH chữ ký.
 *
 * Tự làm bằng jszip chứ không dùng docxtemplater: jszip đã nằm sẵn trong
 * node_modules trên máy chủ Plesk (exceljs kéo theo), còn thêm thư viện mới là
 * phải đẩy cả node_modules — đường triển khai hiện chỉ đẩy dist.
 *
 * VÌ SAO PHẢI GHÉP NHIỀU `<w:t>`: Word hay cắt một chữ gõ liền thành nhiều mảnh
 * (sửa chính tả, đổi định dạng giữa chừng), nên `{TenKhach}` trong file có thể
 * là `{Ten` + `Khach}` ở hai mảnh khác nhau. Tìm theo chuỗi ghép của mọi mảnh,
 * rồi dồn giá trị vào mảnh đầu và xoá phần chữ ô ở các mảnh sau.
 */

const O_RE = /\{([A-Za-z_][A-Za-z0-9_]{0,40})\}/g;
const T_RE = /<w:t(\s[^>]*)?>([^<]*)<\/w:t>/g;

/** Phần trong gói .docx có chữ: thân, đầu trang, chân trang, chú thích. */
const laPhanChu = (ten: string) =>
  /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(ten);

const giaiXml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const maXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Dấu để chỗ ảnh sống sót qua bước điền chữ, rồi mới thay bằng `<w:drawing>`. */
const DAU_ANH = (ten: string) => `\u0001ANH:${ten}\u0001`;

export const laOAnh = (ten: string) => /^ChuKy/i.test(ten);

interface Manh {
  batDau: number;
  ketThuc: number;
  thuocTinh: string;
  chu: string;
}

function tachManh(xml: string): Manh[] {
  const ds: Manh[] = [];
  for (const m of xml.matchAll(T_RE)) {
    ds.push({
      batDau: m.index!,
      ketThuc: m.index! + m[0].length,
      thuocTinh: m[1] ?? '',
      chu: giaiXml(m[2]),
    });
  }
  return ds;
}

/** Các ô `{...}` có trong một phần XML, theo thứ tự xuất hiện. */
function oTrongXml(xml: string): string[] {
  const ghep = tachManh(xml)
    .map((m) => m.chu)
    .join('');
  return [...ghep.matchAll(O_RE)].map((m) => m[1]);
}

/** Thay mọi ô trong một phần XML. `giaTri(ten)` trả `null` = để nguyên. */
function dienXml(xml: string, giaTri: (ten: string) => string | null): string {
  const manh = tachManh(xml);
  if (!manh.length) return xml;
  const chu = manh.map((m) => m.chu);
  // Vị trí đầu của từng mảnh trong chuỗi ghép.
  const dau: number[] = [];
  let tong = 0;
  for (const c of chu) {
    dau.push(tong);
    tong += c.length;
  }
  const ghep = chu.join('');
  const timManh = (vt: number) => {
    let lo = 0;
    let hi = dau.length - 1;
    while (lo < hi) {
      const giua = (lo + hi + 1) >> 1;
      if (dau[giua] <= vt) lo = giua;
      else hi = giua - 1;
    }
    return lo;
  };

  // Làm từ cuối lên để vị trí của các ô phía trước không bị xê dịch.
  const khop = [...ghep.matchAll(O_RE)].reverse();
  let doi = false;
  for (const m of khop) {
    const moi = giaTri(m[1]);
    if (moi === null) continue;
    doi = true;
    const a = m.index!;
    const b = a + m[0].length - 1; // ký tự cuối của ô
    const ma = timManh(a);
    const mb = timManh(b);
    const truoc = chu[ma].slice(0, a - dau[ma]);
    if (ma === mb) {
      chu[ma] = truoc + moi + chu[ma].slice(b - dau[ma] + 1);
    } else {
      chu[ma] = truoc + moi;
      for (let k = ma + 1; k < mb; k++) chu[k] = '';
      chu[mb] = chu[mb].slice(b - dau[mb] + 1);
    }
  }
  if (!doi) return xml;

  let ra = '';
  let tu = 0;
  manh.forEach((m, k) => {
    ra += xml.slice(tu, m.batDau);
    // Luôn giữ khoảng trắng: giá trị điền vào có thể mở đầu/kết thúc bằng dấu cách.
    const tt = /xml:space=/.test(m.thuocTinh) ? m.thuocTinh : `${m.thuocTinh} xml:space="preserve"`;
    ra += `<w:t${tt}>${maXml(chu[k])}</w:t>`;
    tu = m.ketThuc;
  });
  return ra + xml.slice(tu);
}

/** Đọc danh sách ô của một mẫu (không trùng, giữ thứ tự xuất hiện). */
export async function docCacO(file: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(file);
  if (!zip.file('word/document.xml')) throw new Error('File không phải hợp đồng Word (.docx).');
  const ten = Object.keys(zip.files).filter(laPhanChu).sort();
  const ds: string[] = [];
  for (const t of ten) {
    for (const o of oTrongXml(await zip.file(t)!.async('string'))) if (!ds.includes(o)) ds.push(o);
  }
  return ds;
}

export interface AnhChuKy {
  png: Buffer;
  /** Bề rộng in ra, cm. Cao tự tính theo tỉ lệ ảnh. */
  rongCm?: number;
}

/** Bề rộng/cao từ phần đầu IHDR của PNG. */
export function kichThuocPng(png: Buffer): { rong: number; cao: number } {
  const dauPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (png.length < 24 || !png.subarray(0, 8).equals(dauPng)) throw new Error('Ảnh chữ ký không phải PNG.');
  return { rong: png.readUInt32BE(16), cao: png.readUInt32BE(20) };
}

const EMU_CM = 360000;

function xmlAnh(rId: string, id: number, rongEmu: number, caoEmu: number): string {
  return (
    `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${rongEmu}" cy="${caoEmu}"/><wp:docPr id="${id}" name="ChuKy${id}"/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="0" name="chuky${id}.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${rongEmu}" cy="${caoEmu}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>` +
    `</a:graphicData></a:graphic></wp:inline></w:drawing>`
  );
}

/**
 * Điền mẫu ra file hợp đồng.
 *
 * - Ô có trong `duLieu` (kể cả chuỗi rỗng) được thay bằng giá trị.
 * - Ô chưa có giá trị thì in `………` cho dễ thấy là còn trống, KHÔNG để lộ `{Ten}`.
 * - Ô ảnh: có ảnh thì đặt ảnh (chỉ trong thân hợp đồng), không thì để trống.
 */
export async function dienMau(
  file: Buffer,
  duLieu: Record<string, string | null | undefined>,
  anh: Record<string, AnhChuKy> = {},
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(file);
  const ten = Object.keys(zip.files).filter(laPhanChu);
  const anhDung: string[] = [];

  for (const t of ten) {
    const xml = await zip.file(t)!.async('string');
    const moi = dienXml(xml, (o) => {
      if (laOAnh(o)) {
        if (t === 'word/document.xml' && anh[o]) {
          if (!anhDung.includes(o)) anhDung.push(o);
          return DAU_ANH(o);
        }
        return '';
      }
      const v = duLieu[o];
      if (v === undefined || v === null || String(v).trim() === '') return '………';
      return String(v).replace(/\s*\r?\n\s*/g, ', ');
    });
    zip.file(t, moi);
  }

  if (anhDung.length) {
    let doc = await zip.file('word/document.xml')!.async('string');
    let rels = await zip.file('word/_rels/document.xml.rels')!.async('string');
    let ct = await zip.file('[Content_Types].xml')!.async('string');

    if (!/xmlns:wp="/.test(doc.slice(0, 4000))) {
      doc = doc.replace(
        '<w:document ',
        '<w:document xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ',
      );
    }
    if (!/xmlns:r="/.test(doc.slice(0, 4000))) {
      doc = doc.replace(
        '<w:document ',
        '<w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ',
      );
    }
    if (!/Extension="png"/i.test(ct)) {
      ct = ct.replace(
        /(<Types[^>]*>)/,
        '$1<Default Extension="png" ContentType="image/png"/>',
      );
    }

    anhDung.forEach((o, k) => {
      const { png, rongCm = 4.5 } = anh[o];
      const { rong, cao } = kichThuocPng(png);
      const rongEmu = Math.round(rongCm * EMU_CM);
      const caoEmu = Math.round((rongEmu * cao) / Math.max(rong, 1));
      const rId = `rIdHdChuKy${k + 1}`;
      zip.file(`word/media/hd-chuky-${k + 1}.png`, png, { createFolders: false });
      rels = rels.replace(
        '</Relationships>',
        `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/hd-chuky-${k + 1}.png"/></Relationships>`,
      );
      // Ảnh nằm giữa một `<w:t>`: đóng chữ, đặt ảnh, mở lại chữ — một run được
      // phép chứa nhiều phần tử nối nhau.
      doc = doc
        .split(DAU_ANH(o))
        .join(`</w:t>${xmlAnh(rId, 9000 + k, rongEmu, caoEmu)}<w:t xml:space="preserve">`);
    });

    zip.file('word/document.xml', doc);
    zip.file('word/_rels/document.xml.rels', rels);
    zip.file('[Content_Types].xml', ct);
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** Ô điền tự động, có nghĩa cố định — các ô khác người tạo tự gõ. */
export const NHAN_O: Record<string, string> = {
  SoHopDong: 'Số hợp đồng',
  Ngay: 'Ngày lập',
  Thang: 'Tháng lập',
  Nam: 'Năm lập',
  TenKhach: 'Tên khách (Bên B)',
  DiaChi: 'Địa chỉ',
  SoDienThoai: 'Số điện thoại',
  Email: 'Email',
  SoCCCD: 'Số CCCD/Hộ chiếu',
  NgayCapCCCD: 'Ngày cấp CCCD',
  NoiCapCCCD: 'Nơi cấp CCCD',
  MaSoThue: 'Mã số thuế',
  HieuLucTu: 'Hiệu lực từ ngày',
  HieuLucDen: 'Hiệu lực đến ngày',
  TenNguoiKy: 'Họ tên người ký (lúc ký)',
  XacNhanKy: 'Dòng xác nhận ký điện tử (lúc ký)',
  ChuKyBenB: 'Ảnh chữ ký Bên B (lúc ký)',
};

/** Ô do hệ thống điền LÚC KÝ — không cho người tạo hay khách gõ tay. */
export const O_LUC_KY = ['TenNguoiKy', 'XacNhanKy'];
