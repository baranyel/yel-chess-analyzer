import { useState } from 'react';
import {
  CALIBRATION_SOURCE,
  headlineEstimate,
  type MethodEstimate,
  type PerformanceEstimate,
  type PerformanceMethod,
} from '../lib/performance/estimate';
import { SCALE_SOURCE } from '../lib/performance/scale';
import { TIME_INDICATORS, type TimeManagementResult } from '../lib/performance/timeManagement';
import { eloColor } from '../lib/ui';

const METHOD_LABELS: Record<PerformanceMethod, string> = {
  combined: 'Birleşik',
  results:  'Sonuçlar (PR)',
  accuracy: 'Doğruluk',
  acpl:     'ACPL',
};

const METHOD_HINTS: Record<PerformanceMethod, string> = {
  combined: 'Sonuç ve doğruluk tahminlerinin, ölçülen hata paylarına göre ağırlıklı ortalaması',
  results:  'Klasik performans rating’i: ortalama rakip rating’i + skor yüzdesinden fark',
  accuracy: 'Kitap, zorunlu ve kararlı pozisyon hamleleri çıkarılmış Lichess doğruluğu → rating',
  acpl:     'Aynı filtreden geçmiş ortalama santipiyon kaybı → rating',
};

const SCALE_LABELS: Record<MethodEstimate['scale'], string> = {
  lichess:  'Lichess ölçeği',
  chesscom: 'Chess.com ölçeği',
  unknown:  'rakip rating’lerinin ölçeği',
};

const ORDER: PerformanceMethod[] = ['combined', 'results', 'accuracy', 'acpl'];

function Interval({ e }: { e: MethodEstimate }) {
  return <span className="text-faint">{e.low}–{e.high}</span>;
}

/** Headline estimate with a method picker and a side-by-side comparison of all methods. */
export function PerformanceDetails({ performance: p }: { performance: PerformanceEstimate }) {
  const [method, setMethod] = useState<PerformanceMethod | 'auto'>('auto');
  const head = headlineEstimate(p, method);
  const available = ORDER.filter((m) => p[m]);

  if (!head) {
    return <p className="text-[10px] text-faint">Tahmin için yeterli hamle yok.</p>;
  }

  // A difference only means something when both numbers are on the same rating scale.
  const delta = p.playerRating !== null && head.scale === p.platform ? head.rating - p.playerRating : null;

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center gap-1 shrink-0">
          <div
            className="w-20 h-20 rounded-full flex flex-col items-center justify-center font-bold border-4"
            style={{ borderColor: eloColor(head.rating), color: eloColor(head.rating) }}
          >
            <span className="text-lg leading-none">{head.rating}</span>
            <span className="text-[9px] font-normal text-faint mt-1">±{Math.round(1.2816 * head.error)}</span>
          </div>
          <span className="text-[10px] text-faint">Performans tahmini</span>
        </div>
        <div className="flex-1 space-y-1 text-[11px]">
          <div className="flex justify-between">
            <span className="text-muted">Yöntem</span>
            <span className="font-semibold" title={METHOD_HINTS[head.method]}>{METHOD_LABELS[head.method]}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">%80 aralık</span>
            <Interval e={head} />
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Ölçek</span>
            <span className="text-faint">{SCALE_LABELS[head.scale]}</span>
          </div>
          {head.equivalent && (
            <div className="flex justify-between">
              <span className="text-muted">{head.equivalent.scale === 'lichess' ? 'Lichess' : 'Chess.com'} karşılığı</span>
              <span className="text-faint">~{head.equivalent.rating}</span>
            </div>
          )}
          {p.playerRating !== null && (
            <div className="flex justify-between">
              <span className="text-muted">Platform rating’i</span>
              <span className="font-semibold">
                {p.playerRating}
                {delta !== null && (
                  <span className={delta >= 0 ? 'text-success ml-1' : 'text-danger ml-1'}>
                    ({delta >= 0 ? '+' : '−'}{Math.abs(delta)})
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Method picker */}
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Tahmin yöntemi">
        {(['auto', ...available] as const).map((m) => (
          <button
            key={m}
            role="radio"
            aria-checked={method === m}
            onClick={() => setMethod(m)}
            title={m === 'auto' ? 'Mevcut en güvenilir yöntem' : METHOD_HINTS[m]}
            className={[
              'px-2 py-0.5 rounded border text-[10px] transition-colors',
              method === m ? 'border-accent bg-accent-dim text-accent font-semibold' : 'border-base text-muted hover-surface',
            ].join(' ')}
          >
            {m === 'auto' ? 'Otomatik' : METHOD_LABELS[m]}
          </button>
        ))}
      </div>

      {/* Comparison */}
      <div className="border border-base rounded divide-y divide-base overflow-hidden">
        {available.map((m) => {
          const e = p[m]!;
          return (
            <div key={m} className="flex items-center gap-2 px-2 py-1 bg-surface-2 text-[11px]">
              <span className="text-muted w-24 shrink-0" title={METHOD_HINTS[m]}>{METHOD_LABELS[m]}</span>
              <span className="font-bold" style={{ color: eloColor(e.rating) }}>{e.rating}</span>
              <span className="text-faint">±{Math.round(1.2816 * e.error)}</span>
              <span className="text-faint ml-auto text-[10px]">
                {SCALE_LABELS[e.scale]}
                {e.equivalent && ` · ${e.equivalent.scale === 'lichess' ? 'Li' : 'C.com'} ~${e.equivalent.rating}`}
              </span>
            </div>
          );
        })}
      </div>

      {p.disagreement && (
        <p className="text-[10px] text-warning">
          Sonuç ve doğruluk tahminleri hata paylarından fazla ayrışıyor: sonuçlar oyun kalitesinden
          beklenenden {p.results!.rating > p.accuracy!.rating ? 'iyi' : 'kötü'}. Tahmine temkinli bakın.
        </p>
      )}
      {p.accuracy && p.results && p.accuracy.scale !== p.results.scale && (
        <p className="text-[10px] text-faint">
          Doğruluk modeli Lichess oyunlarıyla kalibre edildi; sonuçlar ise {p.platform === 'chesscom' ? 'Chess.com' : 'rakiplerin'} rating’leriyle
          ölçülüyor. Ölçekler farklı olduğu için birleşik tahmin gösterilmiyor.
        </p>
      )}
      <p className="text-[10px] text-faint">
        {p.games} maç, {p.scoredMoves} değerlendirilen hamle. Aralık, gerçek oyunlarda ölçülen hatadır
        (her 10 tahminin ~8’inde rating bu aralıkta). Kalibrasyon: {CALIBRATION_SOURCE}.
        {(p.accuracy?.scale === 'chesscom' || p.combined?.equivalent) && ` Site dönüşümü: ${SCALE_SOURCE}; dönüşümün kendi hatası aralığa eklendi.`}
        {p.games < 5 && ' Az maçla tahmin kaba kalır.'}
      </p>
    </div>
  );
}

/** Time-management score and its indicators, compared with similar-rated players. */
export function TimeManagementCard({ result }: { result: TimeManagementResult }) {
  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold">{result.score}</span>
        <span className="text-faint text-[10px]">/ 100 · {result.band} rating’deki oyunculara göre</span>
      </div>
      <div className="space-y-1.5">
        {result.components.map((c) => {
          const meta = TIME_INDICATORS[c.key];
          return (
            <div key={c.key} title={meta.hint}>
              <div className="flex justify-between text-[11px]">
                <span className="text-muted">{meta.label}</span>
                <span>
                  {meta.format(c.value)}
                  <span className="text-faint ml-1">· {c.goodness}</span>
                </span>
              </div>
              <div className="h-1 bg-surface-2 rounded overflow-hidden">
                <div className="h-full" style={{ width: `${c.goodness}%`, backgroundColor: 'var(--accent)' }} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-faint">
        Rating tahminine dahil değil. Her gösterge 0–100 arası: 50 benzer rating’deki ortalama oyuncu, yüksek daha iyi.{' '}
        {result.games} maçın saat verisinden.
        {!result.reliable && ' Az maç: puan kaba.'}
      </p>
    </div>
  );
}
