import { useEffect, useState } from 'react';
import { Shield, AlertTriangle, RefreshCw } from 'lucide-react';
const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const token = () => localStorage.getItem('sinjapan_auth_token') ?? '';

export default function CompanyInsurance() {
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = () => {
    setLoading(true);
    setError(false);
    fetch(API('/company/insurance'), { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then(j => setPolicies(Array.isArray(j) ? j : []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const daysUntilExpiry = (expiryDate: string) => {
    const diff = new Date(expiryDate).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  if (loading) return <div className="flex items-center justify-center h-40"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">保険管理</h1>
      </div>

      <p className="text-sm text-muted-foreground">保険内容の変更はSIN JAPANにご連絡ください。期限切れ30日前に警告が表示されます。</p>

      {error ? (
        <div className="flex items-center gap-3 p-4 border border-border rounded-xl text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">データの取得に失敗しました。</span>
          <button onClick={load} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
            <RefreshCw className="h-3.5 w-3.5" />再試行
          </button>
        </div>
      ) : (
        <>
          {policies.filter(p => daysUntilExpiry(p.expiry_date ?? p.expiryDate) <= 30).length > 0 && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{policies.filter(p => daysUntilExpiry(p.expiry_date ?? p.expiryDate) <= 30).length}件の保険が30日以内に期限切れになります。SIN JAPANにご連絡ください。</span>
            </div>
          )}

          <div className="border border-border rounded-xl overflow-hidden">
            {policies.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">登録された保険はありません</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">車両</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">保険会社</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">証券番号</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">有効期限</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">商用利用</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">ステータス</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {policies.map((p) => {
                    const expiry = p.expiry_date ?? p.expiryDate;
                    const days = daysUntilExpiry(expiry);
                    const isExpiringSoon = days <= 30 && days > 0;
                    const isExpired = days <= 0;
                    return (
                      <tr key={p.id} className={`hover:bg-muted/20 ${isExpiringSoon || isExpired ? 'bg-red-50/30' : ''}`}>
                        <td className="px-4 py-3 font-medium">{p.maker} {p.model}<br /><span className="text-xs text-muted-foreground font-mono">{p.license_plate}</span></td>
                        <td className="px-4 py-3">{p.insurance_company ?? p.insuranceCompany}</td>
                        <td className="px-4 py-3 font-mono text-xs">{p.policy_number ?? p.policyNumber ?? '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {(isExpiringSoon || isExpired) && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
                            <span className={isExpired ? 'text-red-600 font-medium' : isExpiringSoon ? 'text-orange-600 font-medium' : ''}>
                              {expiry}
                            </span>
                          </div>
                          {!isExpired && <span className="text-xs text-muted-foreground">あと{days}日</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${
                            (p.commercial_use_allowed ?? p.commercialUseAllowed)
                              ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {(p.commercial_use_allowed ?? p.commercialUseAllowed) ? '可' : '不可'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${
                            isExpired ? 'bg-red-100 text-red-700' :
                            isExpiringSoon ? 'bg-orange-100 text-orange-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {isExpired ? '期限切れ' : isExpiringSoon ? '期限間近' : '有効'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
