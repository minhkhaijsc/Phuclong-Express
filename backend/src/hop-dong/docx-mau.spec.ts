import JSZip from 'jszip';
import { dienMau, docCacO, kichThuocPng } from './docx-mau';

/** Dựng một .docx tối giản với thân là `body` (XML các đoạn). */
async function taoDocx(body: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  );
  zip.file(
    'word/_rels/document.xml.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>',
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

const docThan = async (b: Buffer) => (await JSZip.loadAsync(b)).file('word/document.xml')!.async('string');
const chu = (xml: string) => [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');

/** PNG 1x1 hợp lệ, chỉ để đo kích thước. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

describe('docx-mau', () => {
  it('đọc được ô kể cả khi Word cắt ô thành nhiều mảnh', async () => {
    const f = await taoDocx(
      '<w:p><w:r><w:t>Bên B: {Ten</w:t></w:r><w:r><w:t>Khach}</w:t></w:r></w:p><w:p><w:r><w:t>{DiaChi} và {TenKhach}</w:t></w:r></w:p>',
    );
    expect(await docCacO(f)).toEqual(['TenKhach', 'DiaChi']);
  });

  it('điền ô bị cắt mảnh, giữ chữ quanh ô, mã hoá ký tự XML', async () => {
    const f = await taoDocx(
      '<w:p><w:r><w:t>Bên B: {Ten</w:t></w:r><w:r><w:t>Kh</w:t></w:r><w:r><w:t>ach} - hết</w:t></w:r></w:p>',
    );
    const ra = await docThan(await dienMau(f, { TenKhach: 'Cty A&B <VN>' }));
    expect(chu(ra)).toBe('Bên B: Cty A&amp;B &lt;VN&gt; - hết');
    expect(ra).not.toContain('{');
  });

  it('ô chưa có giá trị in "………", không để lộ {Ten}', async () => {
    const f = await taoDocx('<w:p><w:r><w:t>CCCD: {SoCCCD}</w:t></w:r></w:p>');
    expect(chu(await docThan(await dienMau(f, {})))).toBe('CCCD: ………');
  });

  it('đặt ảnh chữ ký, thêm quan hệ và kiểu png', async () => {
    const f = await taoDocx('<w:p><w:r><w:t>{ChuKyBenB}</w:t></w:r></w:p>');
    const ra = await JSZip.loadAsync(await dienMau(f, {}, { ChuKyBenB: { png: PNG } }));
    const doc = await ra.file('word/document.xml')!.async('string');
    expect(doc).toContain('<w:drawing>');
    expect(doc).toContain('r:embed="rIdHdChuKy1"');
    expect(doc).toContain('xmlns:wp=');
    expect(await ra.file('word/_rels/document.xml.rels')!.async('string')).toContain('media/hd-chuky-1.png');
    expect(await ra.file('[Content_Types].xml')!.async('string')).toContain('Extension="png"');
    expect(ra.file('word/media/hd-chuky-1.png')).toBeTruthy();
  });

  it('ô ảnh mà chưa ký thì để trống', async () => {
    const f = await taoDocx('<w:p><w:r><w:t>[{ChuKyBenB}]</w:t></w:r></w:p>');
    expect(chu(await docThan(await dienMau(f, {})))).toBe('[]');
  });

  it('đọc kích thước PNG, từ chối thứ không phải PNG', () => {
    expect(kichThuocPng(PNG)).toEqual({ rong: 1, cao: 1 });
    expect(() => kichThuocPng(Buffer.from('GIF89a........................'))).toThrow();
  });

  it('từ chối file không phải .docx', async () => {
    const zip = new JSZip();
    zip.file('a.txt', 'x');
    await expect(docCacO(await zip.generateAsync({ type: 'nodebuffer' }))).rejects.toThrow();
  });
});
