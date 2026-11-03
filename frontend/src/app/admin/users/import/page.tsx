'use client';

import { useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import apiClient from '@/lib/api-client';

type ImportMode = 'create' | 'edit';

interface UserData {
  excelRowIndex: number;
  username: string;
  password: string;
  hoTen: string;
  vungMien: string;
  diaChi: string;
  tinhThanh: string;
  phoneNumber: string;
  email: string;
  soTaiKhoan: string;
  hinhThucNhanHang: string;
  khachBuon: string;
  linkTaiKhoanMang: string;
  /** Cột 13 — bắt buộc khi thêm mới (03/11/2026). */
  cskhPhuTrach: string;
  error: boolean;
}

interface ValidationResult {
  data: UserData[];
  errors: string[];
  successCount: number;
  errorCount: number;
}

function ImportUsersPageContent() {
  const searchParams = useSearchParams();
  const modeParam = searchParams.get('m');
  const mode: ImportMode = modeParam === '1' ? 'edit' : 'create';

  const [step, setStep] = useState(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [importResult, setImportResult] = useState<{ success: number; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editableColumns, setEditableColumns] = useState<number[]>([]);

  const modeTitle = mode === 'create' ? 'THÊM MỚI USER' : 'CHỈNH SỬA USER';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.xlsx')) {
        setError('File không hợp lệ (vui lòng chọn một file .xlsx)!');
        return;
      }
      setSelectedFile(file);
      setError('');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Chọn file dữ liệu!');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const { data } = await apiClient.post('/users/import/sheets', formData);

      setAvailableSheets(data.sheets || []);
      if (data.sheets?.length > 0) {
        setSelectedSheet(data.sheets[0]);
      }
      setStep(2);
    } catch (err) {
      setError('Có lỗi trong quá trình tải file');
    } finally {
      setLoading(false);
    }
  };

  const handleValidate = async () => {
    if (!selectedFile || !selectedSheet) {
      setError('Vui lòng chọn sheet cần Import');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('sheet', selectedSheet);
      formData.append('mode', mode);
      formData.append('editableColumns', JSON.stringify(editableColumns));

      const { data } = await apiClient.post('/users/import/validate', formData);

      setValidationResult(data);
      setStep(3);
    } catch (err) {
      setError('Có lỗi trong quá trình kiểm tra dữ liệu');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!selectedFile || !selectedSheet) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('sheet', selectedSheet);
      formData.append('mode', mode);
      formData.append('editableColumns', JSON.stringify(editableColumns));

      const { data } = await apiClient.post('/users/import/execute', formData);

      setImportResult({
        success: data.successCount || 0,
        message: `Đã import thành công ${data.successCount} dòng dữ liệu`,
      });
      setStep(4);
    } catch (err) {
      setError('Có lỗi trong quá trình import');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedFile(null);
    setSelectedSheet('');
    setAvailableSheets([]);
    setValidationResult(null);
    setImportResult(null);
    setError('');
    setEditableColumns([]);
  };

  const handleColumnToggle = (index: number) => {
    setEditableColumns(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  return (
    <div>
      <div className="mytab">
        <a href="/admin/users">Quản lý User</a>
        | <a href="/admin/users/import" style={mode === 'create' ? { backgroundColor: 'darkgray' } : {}}>Thêm mới User bằng excel</a>
        | <a href="/admin/users/import?m=1" style={mode === 'edit' ? { backgroundColor: 'darkgray' } : {}}>Chỉnh sửa User bằng excel</a>
      </div>

      <h1 className="titlead" style={{ color: mode === 'edit' ? 'red' : 'black' }}>
        {modeTitle}
      </h1>

      {error && (
        <div style={{ color: 'red', marginBottom: '10px' }}>
          {error}
        </div>
      )}

      {/* Step 1: Upload File */}
      {step === 1 && (
        <div>
          <table cellPadding={0} cellSpacing={0} border={0} style={{ width: '100%' }}>
            <tbody>
              <tr>
                <td colSpan={2} className="ms-menutoolbar" style={{ paddingLeft: '5px', fontWeight: 'bold', height: '18px' }}>
                  Nhập dữ liệu bằng Excel - <span style={{ color: 'red' }}>Bước 1:</span> Upload file
                </td>
              </tr>
              <tr>
                <td className="ms-formlabel" style={{ width: '40%', paddingLeft: '5px' }}>
                  Chọn file chứa dữ liệu (*.xlsx):
                </td>
                <td className="ms-formbody" style={{ width: '60%' }}>
                  <input
                    type="file"
                    accept=".xlsx"
                    onChange={handleFileChange}
                    style={{ width: '100%' }}
                  />
                </td>
              </tr>
              <tr>
                <td className="ms-formbody" colSpan={2} align="right">
                  <a href="/admin/ImportUserTemplate.xlsx" download>
                    Tải về mẫu dữ liệu excel
                  </a>
                  {' '}&nbsp;&nbsp;
                  <button
                    onClick={handleUpload}
                    disabled={loading || !selectedFile}
                    className="btn btn-default"
                  >
                    {loading ? 'Đang tải...' : 'Tiếp tục >>'}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Step 2: Select Sheet */}
      {step === 2 && (
        <div>
          <table cellPadding={0} cellSpacing={0} border={0} style={{ width: '100%' }}>
            <tbody>
              <tr>
                <td colSpan={2} className="ms-menutoolbar" style={{ paddingLeft: '5px', fontWeight: 'bold', height: '18px' }}>
                  Nhập dữ liệu bằng Excel - <span style={{ color: 'red' }}>Bước 2:</span> Chọn sheet
                </td>
              </tr>
              <tr>
                <td className="ms-formlabel" style={{ width: '30%', paddingLeft: '5px' }}>
                  Chọn sheet chứa dữ liệu:
                </td>
                <td className="ms-formbody" style={{ width: '70%' }}>
                  <select
                    value={selectedSheet}
                    onChange={(e) => setSelectedSheet(e.target.value)}
                    className="form-control"
                  >
                    {availableSheets.map(sheet => (
                      <option key={sheet} value={sheet}>{sheet}</option>
                    ))}
                  </select>
                </td>
              </tr>
              {mode === 'edit' && (
                <tr>
                  <td className="ms-formlabel" style={{ width: '30%', paddingLeft: '5px' }}>
                    Chọn column muốn chỉnh sửa:
                  </td>
                  <td className="ms-formbody" style={{ width: '70%' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {['Họ tên', 'Vùng miền', 'Địa chỉ', 'Tỉnh/Thành phố', 'Số điện thoại', 'Email', 'Số tài khoản', 'Hình thức nhận hàng', 'Khách buôn', 'Link FB', 'CSKH phụ trách'].map((label, idx) => (
                        <label key={idx}>
                          <input
                            type="checkbox"
                            checked={editableColumns.includes(idx)}
                            onChange={() => handleColumnToggle(idx)}
                          />
                          {' '}{label}
                        </label>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
              <tr>
                <td className="ms-formbody" colSpan={2} align="right">
                  <button onClick={handleBack} className="btn btn-default">
                    {'<< Lui lại'}
                  </button>
                  {' '}
                  <button
                    onClick={handleValidate}
                    disabled={loading || !selectedSheet}
                    className="btn btn-default"
                  >
                    {loading ? 'Đang kiểm tra...' : 'Tiếp tục >>'}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Step 3: Validate Data */}
      {step === 3 && validationResult && (
        <div>
          <table cellPadding={0} cellSpacing={0} border={0} style={{ width: '100%' }}>
            <tbody>
              <tr>
                <td colSpan={2} className="ms-menutoolbar" style={{ paddingLeft: '5px', fontWeight: 'bold', height: '18px' }}>
                  Nhập dữ liệu bằng Excel - <span style={{ color: 'red' }}>Bước 3:</span> Kiểm tra dữ liệu
                </td>
              </tr>
              <tr>
                <td colSpan={2}>
                  {validationResult.errors.length > 0 ? (
                    <fieldset>
                      <legend>Lỗi dữ liệu:</legend>
                      {validationResult.errors.map((err, idx) => (
                        <div key={idx} dangerouslySetInnerHTML={{ __html: err }} style={{ color: 'red' }} />
                      ))}
                    </fieldset>
                  ) : (
                    <fieldset>
                      <legend>Cảnh báo dữ liệu:</legend>
                      Không có lỗi.
                    </fieldset>
                  )}
                </td>
              </tr>
              {validationResult.data.length > 0 && (
                <tr>
                  <td colSpan={2}>
                    <details>
                      <summary style={{ cursor: 'pointer', color: 'blue' }}>
                        Xem trước dữ liệu ({validationResult.data.length} dòng)
                      </summary>
                      <table className="chitiettracking" cellPadding={0} cellSpacing={0} style={{ marginTop: '10px' }}>
                        <thead>
                          <tr className="chitiettracking-header">
                            <td>Excel Row</td>
                            <td>UserName</td>
                            <td>Mật khẩu</td>
                            <td>Họ tên</td>
                            <td>Vùng miền</td>
                            <td>Địa chỉ</td>
                            <td>Tỉnh/Thành phố</td>
                            <td>Số điện thoại</td>
                            <td>Email</td>
                            <td>Số tài khoản</td>
                            <td>Hình thức nhận hàng</td>
                            <td>Khách buôn</td>
                            <td>Link FB</td>
                            <td>CSKH phụ trách</td>
                          </tr>
                        </thead>
                        <tbody>
                          {validationResult.data.slice(0, 50).map((row, idx) => (
                            <tr
                              key={idx}
                              className="chitiettracking-item"
                              style={row.error ? { backgroundColor: 'yellow', color: 'red', fontWeight: 'bold' } : {}}
                            >
                              <td>{row.excelRowIndex}</td>
                              <td>{row.username}</td>
                              <td>{mode === 'create' ? row.password : '***'}</td>
                              <td>{row.hoTen}</td>
                              <td>{row.vungMien}</td>
                              <td>{row.diaChi}</td>
                              <td>{row.tinhThanh}</td>
                              <td>{row.phoneNumber}</td>
                              <td>{row.email}</td>
                              <td>{row.soTaiKhoan}</td>
                              <td>{row.hinhThucNhanHang}</td>
                              <td>{row.khachBuon}</td>
                              <td>{row.linkTaiKhoanMang}</td>
                              <td>{row.cskhPhuTrach}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {validationResult.data.length > 50 && (
                        <p>... và {validationResult.data.length - 50} dòng nữa</p>
                      )}
                    </details>
                  </td>
                </tr>
              )}
              <tr>
                <td className="ms-formbody" colSpan={2} align="right">
                  <button onClick={handleBack} className="btn btn-default">
                    {'<< Lui lại'}
                  </button>
                  {' '}
                  <button
                    onClick={handleImport}
                    disabled={loading || validationResult.errorCount > 0}
                    className="btn btn-default"
                  >
                    {loading ? 'Đang import...' : 'Đồng ý thực hiện'}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Step 4: Finish */}
      {step === 4 && importResult && (
        <div>
          <table cellPadding={0} cellSpacing={0} border={0} style={{ width: '100%' }}>
            <tbody>
              <tr>
                <td className="ms-menutoolbar" style={{ paddingLeft: '5px', fontWeight: 'bold', height: '18px' }}>
                  Nhập dữ liệu bằng Excel - <span style={{ color: 'red' }}>Bước 4:</span> Thông báo sau hoàn tất
                </td>
              </tr>
              <tr>
                <td>
                  <div style={{ color: 'green', fontWeight: 'bold' }}>
                    {importResult.message}
                  </div>
                </td>
              </tr>
              <tr>
                <td className="ms-formbody" colSpan={2} align="right">
                  <button onClick={handleReset} className="btn btn-default">
                    Kết thúc
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <style jsx>{`
        .mytab {
          margin-bottom: 15px;
        }
        .mytab a {
          padding: 5px 10px;
          text-decoration: none;
          color: #337ab7;
        }
        .titlead {
          margin-bottom: 20px;
        }
        .chitiettracking {
          border-color: #600;
          border-width: 0 0 1px 1px;
          border-style: solid;
          width: 100%;
        }
        .chitiettracking td {
          border-color: #600;
          border-width: 1px 1px 0 0;
          border-style: solid;
          margin: 0;
          padding: 4px;
        }
        .chitiettracking-header {
          background-color: #f0f0f0;
          font-weight: bold;
        }
      `}</style>
    </div>
  );
}

export default function ImportUsersPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ImportUsersPageContent />
    </Suspense>
  );
}
