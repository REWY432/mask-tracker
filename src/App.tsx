import React, { useState, useEffect, useRef } from 'react';
import { Settings, Plus, LayoutGrid, Search, Trash2, Upload, Lock, QrCode, X, Printer, Edit2, Save, BarChart3, TrendingUp, Filter, Download, AlertTriangle } from 'lucide-react';
import { MaskRecord, MaskModel } from './types';
import Papa from 'papaparse';
import { QRCodeSVG } from 'qrcode.react';
import { Toaster, toast } from 'sonner';

const MODEL_LABELS: Record<MaskModel, string> = {
  s: 'Сабля (s)',
  f: 'Рапира (f)',
  e: 'Шпага (e)',
  c: 'Тренерская (c)',
};

export default function App() {
  const [authCode, setAuthCode] = useState(() => localStorage.getItem('mask_auth_code') || '');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');

  const [records, setRecords] = useState<MaskRecord[]>([]);
  const [model, setModel] = useState<MaskModel>('s');
  const [generation, setGeneration] = useState<number>(60);
  const [size, setSize] = useState<string>('M');
  const [contract, setContract] = useState<string>('инпо');
  const [shipment, setShipment] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterModel, setFilterModel] = useState<MaskModel | 'all'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [nextSequence, setNextSequence] = useState<number | null>(null);
  const [selectedQrRecord, setSelectedQrRecord] = useState<MaskRecord | null>(null);
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());
  const [isBatchPrintMode, setIsBatchPrintMode] = useState(false);
  const [editingRecord, setEditingRecord] = useState<MaskRecord | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<MaskRecord>>({});
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const checkAuth = async (code: string) => {
    try {
      const res = await fetch('/api/auth/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.success) {
        setIsAuthenticated(true);
        localStorage.setItem('mask_auth_code', code);
        fetchData(code);
      } else {
        setAuthError('Неверный код доступа');
      }
    } catch (e) {
      setAuthError('Ошибка подключения');
    }
  };

  useEffect(() => {
    if (authCode) {
      checkAuth(authCode);
    }
  }, []);

  const fetchData = async (code: string = authCode) => {
    setIsLoading(true);
    try {
      const [resMasks, resSeq] = await Promise.all([
        fetch('/api/masks', { headers: { 'x-auth-code': code } }),
        fetch('/api/sequence', { headers: { 'x-auth-code': code } })
      ]);
      
      if (resMasks.ok) {
        const data = await resMasks.json();
        setRecords(data);
      }
      if (resSeq.ok) {
        const seqData = await resSeq.json();
        setNextSequence(seqData.nextSequence);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    checkAuth(authCode);
  };

  const generateSerialNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nextSequence) return;
    setIsLoading(true);

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = parseInt(now.getFullYear().toString().slice(-2), 10);
    const prodDateStr = `${now.getDate().toString().padStart(2, '0')}.${month.toString().padStart(2, '0')}.${year}`;

    const typeIndicator = 'm';
    const fullSerialNumber = `${typeIndicator}${model}${generation}${month}${year}${nextSequence}`;

    const newRecord = {
      id: crypto.randomUUID(),
      type: 'm',
      model,
      generation,
      month,
      year,
      sequence: nextSequence,
      full_serial_number: fullSerialNumber,
      size,
      contract,
      shipment: shipment.trim() || '-',
      user_name: userName.trim() || '-',
      prod_date: prodDateStr,
      created_at: new Date().toISOString(),
    };

    try {
      const res = await fetch('/api/masks', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-auth-code': authCode
        },
        body: JSON.stringify(newRecord),
      });

      if (res.ok) {
        setShipment('');
        setUserName('');
        toast.success(`Маска ${fullSerialNumber} сгенерирована`);
        await fetchData(); // Refresh data and sequence
      } else {
        toast.error('Ошибка при сохранении маски');
      }
    } catch (e) {
      console.error(e);
      toast.error('Ошибка сети при сохранении');
    } finally {
      setIsLoading(false);
    }
  };

  const confirmDelete = (id: string) => {
    setDeleteConfirmId(id);
  };

  const executeDelete = async () => {
    if (!deleteConfirmId) return;
    const id = deleteConfirmId;
    setDeleteConfirmId(null);
    
    try {
      const res = await fetch(`/api/masks/${id}`, {
        method: 'DELETE',
        headers: { 'x-auth-code': authCode }
      });
      if (res.ok) {
        toast.success('Запись удалена');
        
        // Remove from selected ids if it was selected
        const newSelected = new Set(selectedRecordIds);
        if (newSelected.has(id)) {
          newSelected.delete(id);
          setSelectedRecordIds(newSelected);
        }
        
        await fetchData();
      } else {
        toast.error('Ошибка при удалении');
      }
    } catch (e) {
      console.error(e);
      toast.error('Ошибка сети при удалении');
    }
  };

  const cancelDelete = () => {
    setDeleteConfirmId(null);
  };

  const startEditing = (record: MaskRecord) => {
    setEditingRecord(record);
    setEditFormData({
      model: record.model,
      generation: record.generation,
      size: record.size,
      contract: record.contract,
      shipment: record.shipment,
      user_name: record.user_name,
    });
  };

  const saveEdit = async () => {
    if (!editingRecord) return;
    
    // Check if model or generation changed, which affect full_serial_number
    let newFullSerialNumber = editingRecord.full_serial_number;
    if (editFormData.model || editFormData.generation) {
      const updatedModel = editFormData.model || editingRecord.model;
      const updatedGeneration = editFormData.generation || editingRecord.generation;
      const typeIndicator = 'm';
      newFullSerialNumber = `${typeIndicator}${updatedModel}${updatedGeneration}${editingRecord.month}${editingRecord.year}${editingRecord.sequence}`;
      editFormData.full_serial_number = newFullSerialNumber;
    }

    try {
      const res = await fetch(`/api/masks/${editingRecord.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'x-auth-code': authCode 
        },
        body: JSON.stringify(editFormData),
      });

      if (res.ok) {
        setEditingRecord(null);
        setEditFormData({});
        toast.success('Запись успешно обновлена');
        await fetchData();
      } else {
        toast.error('Ошибка при обновлении');
      }
    } catch (e) {
      console.error(e);
      toast.error('Ошибка сети при обновлении');
    }
  };

  const cancelEdit = () => {
    setEditingRecord(null);
    setEditFormData({});
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        setIsLoading(true);
        // Map CSV fields to our DB structure
        const importedRecords = results.data.map((row: any) => ({
          id: crypto.randomUUID(),
          type: 'm', // Default
          model: row['Модель']?.toLowerCase() || 's',
          generation: parseInt(row['Поколение']) || 60,
          month: parseInt(row['Месяц изготовления']) || new Date().getMonth() + 1,
          year: parseInt(row['Год изготовления']) || parseInt(new Date().getFullYear().toString().slice(-2)),
          sequence: parseInt(row['Порядковый номер']) || 0,
          full_serial_number: row['Месяц изготовления'] ? `m${row['Модель']?.toLowerCase() || 's'}${row['Поколение']}${row['Месяц изготовления']}${row['Год изготовления']}${row['Порядковый номер']}` : row['full_serial_number'] || `import-${Date.now()}-${Math.random()}`,
          size: row['размер'] || 'M',
          contract: row['Контракт'] || 'инпо',
          shipment: row['Отгрузка'] || '-',
          user_name: row['Пользователь'] || '-',
          prod_date: row['дата производства'] || '',
          created_at: new Date().toISOString(),
        }));

        try {
          const res = await fetch('/api/masks', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'x-auth-code': authCode
            },
            body: JSON.stringify(importedRecords),
          });
          
          if (res.ok) {
            toast.success(`Импортировано ${importedRecords.length} записей из Excel/CSV`);
            await fetchData();
          } else {
            const err = await res.json();
            toast.error(`Ошибка импорта: ${err.error}`);
          }
        } catch (error) {
          console.error(error);
          toast.error('Сбой импорта');
        } finally {
          setIsLoading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      }
    });
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/40 via-slate-900 to-slate-900"></div>
        </div>
        <div className="bg-white max-w-[420px] w-full p-10 rounded-3xl shadow-2xl shadow-black/50 border border-slate-800 text-center relative z-10 overflow-hidden">
          {/* Decorative background element */}
          <div className="absolute top-0 inset-x-0 h-40 bg-gradient-to-b from-indigo-50 to-transparent pointer-events-none"></div>
          
          <div className="relative">
            <div className="w-16 h-16 bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-lg shadow-indigo-500/30 ring-4 ring-white">
              <Lock className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2.5 tracking-tight">Вход в панель</h1>
            <p className="text-sm text-slate-500 mb-8 font-medium px-4">Авторизуйтесь для доступа к системе управления производственными номерами.</p>
            <form onSubmit={handleAuthSubmit} className="space-y-6">
              <div>
                <input
                  type="password"
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  placeholder="Код доступа"
                  className="w-full text-center px-4 py-4 bg-slate-50 rounded-xl border border-slate-200 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/15 outline-none transition-all duration-200 font-mono tracking-[0.2em] text-lg font-semibold text-slate-800"
                  required
                />
              </div>
              {authError && (
                <div className="bg-red-50 text-red-600 text-sm font-medium py-3 px-4 rounded-xl border border-red-100 flex items-center justify-center gap-2">
                  <X className="w-4 h-4" />
                  {authError}
                </div>
              )}
              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full bg-slate-900 hover:bg-black text-white font-semibold py-4 rounded-xl transition-all duration-300 shadow-md hover:shadow-xl hover:shadow-slate-900/20 active:scale-[0.98] outline-none"
                >
                  Авторизоваться
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const filteredRecords = records.filter(r => {
    const matchesSearch = (r.full_serial_number && r.full_serial_number.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (r.shipment && r.shipment.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesModel = filterModel === 'all' || r.model === filterModel;

    return matchesSearch && matchesModel;
  });

  const toggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const newSelected = new Set(selectedRecordIds);
      filteredRecords.forEach(r => newSelected.add(r.id));
      setSelectedRecordIds(newSelected);
    } else {
      const newSelected = new Set(selectedRecordIds);
      filteredRecords.forEach(r => newSelected.delete(r.id));
      setSelectedRecordIds(newSelected);
    }
  };

  const toggleSelectRow = (id: string) => {
    const newSelected = new Set(selectedRecordIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedRecordIds(newSelected);
  };

  const selectedRecordsArray = records.filter(r => selectedRecordIds.has(r.id));

  // Analytics calculation
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = parseInt(currentDate.getFullYear().toString().slice(-2), 10);
  const masksThisMonth = records.filter(r => r.month === currentMonth && r.year === currentYear).length;
  
  const modelDistribution = records.reduce((acc, r) => {
    acc[r.model] = (acc[r.model] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const mostPopularModelEntry = Object.entries(modelDistribution)
    .sort((a,b) => b[1] - a[1])[0];
  const mostPopularModelLabel = mostPopularModelEntry ? MODEL_LABELS[mostPopularModelEntry[0] as MaskModel] : '-';

  return (
    <div className="min-h-screen bg-slate-50/80 text-slate-900 font-sans print:bg-white print:text-black selection:bg-indigo-500/20">
      <Toaster position="top-right" richColors />
      <header className="bg-slate-900 border-b border-slate-800 px-8 py-4 flex items-center justify-between sticky top-0 z-20 shadow-lg shadow-black/5 print:hidden">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-500/10 p-2.5 rounded-xl border border-indigo-500/20 shadow-inner">
            <LayoutGrid className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white leading-tight">Production Logs</h1>
            <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase mt-0.5">Corporate Dashboard Workspace</p>
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2.5 px-3.5 py-1.5 bg-slate-800/80 rounded-lg border border-slate-700/80 shadow-inner">
            <div className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </div>
            <span className="text-[11px] font-bold text-slate-300 tracking-wider uppercase">Система активна</span>
          </div>
          <div className="w-px h-6 bg-slate-800 mx-2"></div>
          <button 
            onClick={() => { setIsAuthenticated(false); localStorage.removeItem('mask_auth_code'); }}
            className="text-xs text-slate-400 hover:text-white font-bold tracking-wider uppercase px-4 py-2 hover:bg-slate-800 rounded-lg transition-all duration-200"
          >
            Выход
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 xl:grid-cols-12 gap-6 items-start print:hidden">
        
        {/* Left Side: Form */}
        <div className="xl:col-span-4 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden ring-1 ring-black/5">
            <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-600" />
                Новая маска
              </h2>
              <p className="text-sm text-slate-500 mt-1">Добавьте новую запись в базу масок</p>
            </div>
            
            <form onSubmit={generateSerialNumber} className="p-6 space-y-6">
              <div className="space-y-5">
                <div className="p-4 bg-indigo-50 rounded-xl text-indigo-800 text-sm flex items-center justify-between border border-indigo-100/50">
                  <span className="font-medium text-indigo-700">Следующий номер:</span>
                  <strong className="font-mono text-xl tracking-tight bg-white px-3 py-1 rounded-md shadow-sm">{nextSequence || '...'}</strong>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div className="col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Модель (s)</label>
                    <select 
                      value={model} 
                      onChange={(e) => setModel(e.target.value as MaskModel)}
                      className="w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium focus:bg-white focus:border-indigo-500 focus:ring-indigo-500/20 outline-none transition-all duration-200 shadow-sm border"
                    >
                      {(Object.keys(MODEL_LABELS) as MaskModel[]).map((m) => (
                        <option value={m} key={m}>{MODEL_LABELS[m]}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Поколение</label>
                    <input 
                      type="number" 
                      value={generation}
                      onChange={(e) => setGeneration(Number(e.target.value))}
                      className="w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium focus:bg-white focus:border-indigo-500 focus:ring-indigo-500/20 outline-none transition-all duration-200 shadow-sm border font-mono"
                      required min={1}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Размер</label>
                    <select 
                      value={size} 
                      onChange={(e) => setSize(e.target.value)}
                      className="w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium focus:bg-white focus:border-indigo-500 focus:ring-indigo-500/20 outline-none transition-all duration-200 shadow-sm border"
                    >
                      <option value="S">S</option>
                      <option value="M">M</option>
                      <option value="L">L</option>
                      <option value="XL">XL</option>
                    </select>
                  </div>
                </div>

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center" aria-hidden="true">
                    <div className="w-full border-t border-slate-200" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-white px-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Опционально</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Контракт / Статус</label>
                    <input 
                      type="text" 
                      value={contract}
                      onChange={(e) => setContract(e.target.value)}
                      className="w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:bg-white focus:border-indigo-500 focus:ring-indigo-500/20 outline-none transition-all duration-200 shadow-sm border"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Отгрузка</label>
                    <input 
                      type="text" 
                      value={shipment}
                      onChange={(e) => setShipment(e.target.value)}
                      placeholder="Например: ремонт, Гау спб"
                      className="w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:bg-white focus:border-indigo-500 focus:ring-indigo-500/20 outline-none transition-all duration-200 shadow-sm border placeholder:text-slate-400"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Пользователь</label>
                    <input 
                      type="text" 
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      className="w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:bg-white focus:border-indigo-500 focus:ring-indigo-500/20 outline-none transition-all duration-200 shadow-sm border"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button 
                  type="submit"
                  disabled={isLoading || !nextSequence}
                  className="w-full bg-slate-900 hover:bg-black text-white font-semibold rounded-xl py-3 px-4 flex items-center justify-center transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed outline-none"
                >
                  {isLoading ? 'Обработка...' : 'Сгенерировать и сохранить'}
                </button>
              </div>
            </form>
          </div>
          
          {/* Admin Dashboard info */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 ring-1 ring-black/5">
            <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
              <Settings className="w-4 h-4 text-slate-500" /> 
              Пакетная загрузка
            </h3>
            <p className="text-sm text-slate-500 mb-5 leading-relaxed">
              Для импорта предыдущих масок загрузите файл CSV или скачайте его из Google Таблиц.
            </p>
            <input 
              type="file" 
              accept=".csv" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="w-full py-2.5 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 text-slate-700 border border-slate-200 rounded-xl text-sm font-semibold flex justify-center items-center gap-2 transition-all duration-200 shadow-sm"
            >
              <Upload className="w-4 h-4" />
              Импорт CSV
            </button>
          </div>
        </div>

        {/* Right Side: Data Table */}
        <div className="xl:col-span-8 space-y-6 print:hidden">

          {/* Analytics Widgets */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-black/5 flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center shrink-0">
                <BarChart3 className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-500">Масок в этом месяце</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-2xl font-bold tracking-tight text-slate-900">{masksThisMonth}</span>
                  <span className="text-xs font-semibold px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md ring-1 ring-emerald-500/20">{currentMonth}/{currentYear}</span>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-black/5 flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center shrink-0">
                <TrendingUp className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-500">Популярная модель</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-2xl font-bold tracking-tight text-slate-900">{mostPopularModelEntry ? mostPopularModelEntry[1] : 0}</span>
                  <span className="text-xs font-medium text-slate-500">шт. ({mostPopularModelLabel})</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-200 ring-1 ring-black/5">
            <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text"
                  placeholder="Поиск по номеру или отгрузке..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all duration-200"
                />
              </div>
              <div className="relative w-full sm:w-56">
                <select
                  value={filterModel}
                  onChange={(e) => setFilterModel(e.target.value as MaskModel | 'all')}
                  className="w-full pl-4 pr-10 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all duration-200 text-slate-700 appearance-none cursor-pointer"
                >
                  <option value="all">Все модели</option>
                  {(Object.keys(MODEL_LABELS) as MaskModel[]).map((m) => (
                    <option value={m} key={m}>{MODEL_LABELS[m]}</option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-4 w-full lg:w-auto justify-end">
              {selectedRecordIds.size > 0 && (
                <button
                  onClick={() => {
                    setIsBatchPrintMode(true);
                    setTimeout(() => window.print(), 300);
                  }}
                  className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2.5 rounded-xl transition-all duration-200 flex items-center gap-2 shadow-sm focus:ring-4 focus:ring-indigo-500/20"
                >
                  <Printer className="w-4 h-4" />
                  Печать ({selectedRecordIds.size})
                </button>
              )}
              <div className="text-sm font-medium flex flex-col items-end">
                <span className="text-slate-400 text-xs uppercase tracking-wider mb-0.5">Всего записей</span>
                <span className="text-slate-800 bg-slate-100/80 px-2.5 py-0.5 rounded-md">{records.length}</span>
              </div>
            </div>
          </div>

          <div className="bg-white border text-sm border-slate-200 rounded-2xl shadow-sm overflow-hidden ring-1 ring-black/5">
            <div className="overflow-x-auto">
              <table className="w-full text-left whitespace-nowrap">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="px-5 py-4 w-12">
                      <input 
                        type="checkbox"
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 transition-all duration-200 cursor-pointer"
                        checked={filteredRecords.length > 0 && selectedRecordIds.size === filteredRecords.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th className="px-4 py-4">Серийный номер</th>
                    <th className="px-4 py-4 text-center">Мод</th>
                    <th className="px-4 py-4 text-center">Пок</th>
                    <th className="px-4 py-4 text-center">М/Г</th>
                    <th className="px-4 py-4 text-center text-indigo-600">Порядк.</th>
                    <th className="px-4 py-4">Размер</th>
                    <th className="px-4 py-4">Контракт</th>
                    <th className="px-4 py-4">Отгрузка</th>
                    <th className="px-4 py-4">Дата произв.</th>
                    <th className="px-5 py-4 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-6 py-16 text-center text-slate-500 font-medium">
                        {isLoading ? 'Загрузка...' : 'Список пуст'}
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((record) => {
                      const isEditing = editingRecord?.id === record.id;
                      
                      return isEditing ? (
                        <tr key={record.id} className="bg-indigo-50/30">
                          <td className="px-5 py-4"></td>
                          <td className="px-4 py-4 text-xs italic text-slate-500 font-mono">
                            {record.full_serial_number}
                          </td>
                          <td className="px-4 py-4">
                            <select 
                              value={editFormData.model} 
                              onChange={(e) => setEditFormData({...editFormData, model: e.target.value as MaskModel})}
                              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                            >
                              {(Object.keys(MODEL_LABELS) as MaskModel[]).map((m) => (
                                <option value={m} key={m}>{m}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-4">
                            <input 
                              type="number"
                              value={editFormData.generation}
                              onChange={(e) => setEditFormData({...editFormData, generation: Number(e.target.value)})}
                              className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-center focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-mono"
                              min={1}
                            />
                          </td>
                          <td className="px-4 py-4 text-center text-slate-400 text-xs font-mono">{record.month}/{record.year}</td>
                          <td className="px-4 py-4 text-center text-slate-400 text-xs font-mono">{record.sequence}</td>
                          <td className="px-4 py-4">
                            <select 
                              value={editFormData.size} 
                              onChange={(e) => setEditFormData({...editFormData, size: e.target.value})}
                              className="w-[60px] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-medium"
                            >
                              <option value="S">S</option>
                              <option value="M">M</option>
                              <option value="L">L</option>
                              <option value="XL">XL</option>
                            </select>
                          </td>
                          <td className="px-4 py-4">
                            <input 
                              type="text"
                              value={editFormData.contract}
                              onChange={(e) => setEditFormData({...editFormData, contract: e.target.value})}
                              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                            />
                          </td>
                          <td className="px-4 py-4">
                            <input 
                              type="text"
                              value={editFormData.shipment}
                              onChange={(e) => setEditFormData({...editFormData, shipment: e.target.value})}
                              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                            />
                          </td>
                          <td className="px-4 py-4 text-slate-400 text-xs font-mono">{record.prod_date}</td>
                          <td className="px-5 py-4 text-right flex justify-end gap-1.5">
                            <button 
                              onClick={saveEdit}
                              className="text-indigo-700 hover:text-white p-1.5 bg-indigo-100 hover:bg-indigo-600 rounded-md transition-colors"
                              title="Сохранить"
                            >
                              <Save className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={cancelEdit}
                              className="text-slate-500 hover:text-white p-1.5 bg-slate-100 hover:bg-slate-600 rounded-md transition-colors"
                              title="Отмена"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={record.id} className={`transition-all duration-150 group ${selectedRecordIds.has(record.id) ? 'bg-indigo-50/50' : 'hover:bg-slate-50/80 cursor-default'}`}>
                          <td className="px-5 py-4">
                            <input 
                              type="checkbox"
                              checked={selectedRecordIds.has(record.id)}
                              onChange={() => toggleSelectRow(record.id)}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 transition-all duration-200 cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-4">
                            <span className="inline-flex font-mono font-bold text-slate-800 bg-white border border-slate-200 shadow-sm px-2.5 py-1 rounded-md text-sm">
                              {record.full_serial_number}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-center text-slate-500 uppercase font-medium">{record.model}</td>
                          <td className="px-4 py-4 text-center text-slate-500 font-mono">{record.generation}</td>
                          <td className="px-4 py-4 text-center text-slate-500 font-mono text-xs">
                            {record.month}/{record.year}
                          </td>
                          <td className="px-4 py-4 text-center font-mono font-semibold text-indigo-700 bg-indigo-50/50">
                            {record.sequence}
                          </td>
                          <td className="px-4 py-4 font-bold text-slate-700">{record.size}</td>
                          <td className="px-4 py-4 text-slate-600 font-medium">{record.contract}</td>
                          <td className="px-4 py-4 text-slate-600">
                            <span className="max-w-[150px] truncate block" title={record.shipment}>
                              {record.shipment}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-slate-400 font-mono text-xs">{record.prod_date}</td>
                          <td className="px-5 py-4 text-right flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => startEditing(record)}
                              className="text-slate-500 hover:text-blue-600 hover:bg-blue-50 p-1.5 rounded-md transition-colors"
                              title="Редактировать"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => setSelectedQrRecord(record)}
                              className="text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 p-1.5 rounded-md transition-colors"
                              title="Показать QR-код"
                            >
                              <QrCode className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => confirmDelete(record.id)}
                              className="text-slate-500 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-md transition-colors"
                              title="Удалить"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </main>

      {/* QR Code Modal */}
      {selectedQrRecord && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 print:relative print:inset-auto print:bg-white print:p-0">
          <div className="bg-white rounded-3xl shadow-2xl shadow-indigo-900/5 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200 print:shadow-none print:max-w-none border border-slate-200/50">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 print:hidden">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <QrCode className="w-5 h-5 text-indigo-600" />
                QR-код маски
              </h3>
              <button 
                onClick={() => setSelectedQrRecord(null)}
                className="text-slate-400 hover:text-slate-900 p-1.5 hover:bg-slate-200/50 rounded-lg transition-colors outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-8 flex flex-col items-center justify-center space-y-8">
              <div className="bg-white p-5 rounded-2xl border-2 border-slate-100 shadow-sm ring-1 ring-slate-200/60">
                <QRCodeSVG 
                  value={selectedQrRecord.full_serial_number} 
                  size={220}
                  level="H"
                  includeMargin={false}
                />
              </div>
              <div className="text-center space-y-1.5 w-full">
                <p className="text-xs text-slate-400 font-bold tracking-widest uppercase">Серийный номер</p>
                <p className="font-mono text-2xl font-bold tracking-tight text-indigo-900 bg-indigo-50 px-4 py-2 rounded-xl inline-block border border-indigo-100/50 w-full">
                  {selectedQrRecord.full_serial_number}
                </p>
              </div>
            </div>

            <div className="px-6 py-5 border-t border-slate-100 bg-slate-50/50 flex gap-3 print:hidden">
              <button 
                onClick={() => {
                  const svg = document.querySelector('.bg-white.p-5.rounded-2xl.border-2 svg');
                  if (!svg) return;
                  const svgData = new XMLSerializer().serializeToString(svg);
                  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `QR_${selectedQrRecord.full_serial_number}.svg`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }}
                className="flex-1 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors outline-none shadow-sm"
              >
                <Download className="w-4 h-4" />
                Скачать
              </button>
              <button 
                onClick={() => window.print()}
                className="flex-[1.5] bg-slate-900 border border-transparent text-white hover:bg-black font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors outline-none shadow-sm hover:shadow-md"
              >
                <Printer className="w-4 h-4" />
                Печать QR
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Batch Print View */}
      {isBatchPrintMode && (
        <div className="fixed inset-0 bg-slate-50 z-[100] p-8 overflow-y-auto print:p-0 print:m-0 print:bg-white flex flex-col">
          <div className="flex justify-between items-center mb-8 print:hidden shrink-0 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                Печать QR-кодов
              </h2>
              <p className="text-sm text-slate-500 font-medium mt-1">Выбрано масок для печати: <span className="text-indigo-600 font-bold">{selectedRecordsArray.length}</span></p>
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => setIsBatchPrintMode(false)}
                className="px-5 py-2.5 text-slate-700 font-semibold bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all duration-200 shadow-sm"
              >
                Отмена
              </button>
              <button
                onClick={() => window.print()}
                className="px-6 py-2.5 flex items-center gap-2 font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md focus:ring-4 focus:ring-indigo-500/20"
              >
                <Printer className="w-4 h-4" />
                Распечатать сейчас
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 print:grid-cols-4 print:gap-4 print:w-full print:m-0 flex-1">
            {selectedRecordsArray.map(record => (
              <div key={record.id} className="flex flex-col items-center justify-center p-6 bg-white border border-slate-200 rounded-2xl shadow-sm print:shadow-none print:border-slate-300 print:break-inside-avoid print:p-2">
                <QRCodeSVG 
                  value={record.full_serial_number} 
                  size={120}
                  level="H"
                  includeMargin={false}
                  className="print:w-24 print:h-24 mb-1"
                />
                <p className="mt-4 font-mono text-sm font-extrabold tracking-tight text-center text-slate-900 print:text-[11px] print:mt-2 print:leading-none">
                  {record.full_serial_number}
                </p>
                <p className="text-[11px] font-bold text-slate-400 uppercase print:text-[9px] mt-1 print:mt-0.5 tracking-wider">
                  {MODEL_LABELS[record.model as MaskModel]?.split(' ')[0]} - {record.size}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 print:hidden">
          <div className="bg-white rounded-3xl shadow-2xl shadow-indigo-900/5 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-200/50">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-100">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 tracking-tight mb-2">Удаление записи</h3>
              <p className="text-sm text-slate-500 mb-6 px-2">
                Вы уверены, что хотите безвозвратно удалить эту маску? Это может нарушить сквозную нумерацию новых моделей этого месяца.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={cancelDelete}
                  className="flex-1 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold py-3 px-4 rounded-xl transition-all duration-200 outline-none shadow-sm"
                >
                  Отмена
                </button>
                <button 
                  onClick={executeDelete}
                  className="flex-1 bg-red-600 text-white hover:bg-red-700 font-semibold py-3 px-4 rounded-xl transition-all duration-200 outline-none shadow-sm hover:shadow-md"
                >
                  Удалить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
